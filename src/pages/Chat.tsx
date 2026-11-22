import { ChevronDown, RefreshCw } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ApprovalCard } from "../components/ApprovalCard";
import { type Attachment, Composer } from "../components/Composer";
import { ChatSkeleton, Message, StreamingAnswer, Thinking, Working } from "../components/Messages";
import { ModelMenu } from "../components/ModelMenu";
import { ToolGroup } from "../components/ToolCard";
import { Note, Segmented } from "../components/ui";
import { actionLabel } from "../lib/agents";
import { toBlocks } from "../lib/blocks";
import { agentHint, agentLabel } from "../lib/format";
import type { Agent } from "../lib/types";
import { useChat } from "../lib/useChat";

/** Space above each kind of row: a new turn gets air, parts of one answer stay close. */
const GAP = {
  user: "mt-8 first:mt-0",
  assistant: "mt-4 first:mt-0",
  tool: "mt-3 first:mt-0",
  notice: "mt-5 first:mt-0",
  caution: "mt-4 first:mt-0",
  error: "mt-4 first:mt-0",
} as const;

type Props = {
  sessionId: string;
  agent: string;
  agents: Agent[];
  /** A conversation that has no messages on the server yet. */
  fresh: boolean;
  /** Channel conversations (Telegram) are shown, not written to. */
  readOnly: boolean;
  /** A message to send as soon as this (new) chat opens: a quick request from Today. */
  ask?: string | null;
  onAsked?: () => void;
  onPickAgent: (alias: string) => void;
  onFirstMessage: (text: string) => void;
  onActivity: () => void;
};

export function Chat({
  sessionId,
  agent,
  agents,
  fresh,
  readOnly,
  ask,
  onAsked,
  onPickAgent,
  onFirstMessage,
  onActivity,
}: Props) {
  const chat = useChat({ sessionId, agent, fresh, readOnly, onFirstMessage, onTurnEnd: onActivity });
  const { items, draft, thinking, busy, approval, usage, startedAt } = chat.state;
  const blocks = useMemo(() => toBlocks(items), [items]);
  const [atBottom, setAtBottom] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const previews = useRef(new Map<string, string>());

  // Keep the newest text in view unless the reader scrolled up.
  // biome-ignore lint/correctness/useExhaustiveDependencies: follow new content
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items, draft, thinking, approval, chat.loading]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stick.current = near;
    setAtBottom(near);
  }

  function send(text: string, attachments: Attachment[]) {
    for (const a of attachments) previews.current.set(a.path, a.preview);
    stick.current = true;
    chat.send(
      text,
      attachments.map((a) => a.marker),
      attachments.map((a) => a.path),
    );
  }

  const asked = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, when the chat opens with a request
  useEffect(() => {
    if (!ask || asked.current) return;
    asked.current = true;
    send(ask, []);
    onAsked?.();
  }, [ask]);

  // What the wait is for: the tool in use, or that the turn has not produced anything yet.
  const running = items.findLast((i) => i.kind === "tool" && i.pending);
  const heard = items.at(-1)?.kind !== "user" || Boolean(thinking);
  const working =
    running?.kind === "tool"
      ? `Using ${actionLabel(running.name).action.toLowerCase()}`
      : heard
        ? "Working"
        : "Starting";
  const contextUsed = usage ? Math.min(100, Math.round((usage.used / usage.max) * 100)) : null;

  const usable = agents.filter((a) => a.enabled !== false);
  const empty = !chat.loading && !chat.loadError && items.length === 0 && !busy;
  const elsewhere = chat.status === "elsewhere";

  const composer = (
    <Composer
      agent={agent}
      disabled={elsewhere}
      disabledReason="Open in another tab"
      busy={busy}
      allowImages={agent !== "chat"}
      autoFocus={fresh}
      tools={<ModelMenu agent={agent} disabled={busy} />}
      onSend={send}
      onStop={chat.stop}
    />
  );

  // A new chat: the greeting and the message box sit together in the middle of the page.
  if (empty && !readOnly) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 pb-[12vh]">
        <h1 className="text-center font-serif text-[2rem] leading-tight md:text-[2.4rem]">
          What can I do for you?
        </h1>
        <div className="mt-7 w-full max-w-2xl">{composer}</div>
        {usable.length > 1 && (
          <div className="mt-4 flex flex-col items-center gap-1.5">
            <Segmented
              label="Agent"
              value={agent}
              onChange={onPickAgent}
              options={usable.map((a) => ({ value: a.alias, label: agentLabel(a.alias) }))}
            />
            <p className="text-xs text-ink-3">{agentHint(agent)}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scroller} onScroll={onScroll} className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-5 pt-6 pb-10">
          {chat.loading && <ChatSkeleton />}
          {chat.loadError && <Note>Could not load this conversation: {chat.loadError}</Note>}
          {empty && readOnly && <p className="py-10 text-center text-sm text-ink-3">No messages here yet.</p>}
          {blocks.map((b) => (
            <div key={b.id} className={GAP[b.kind === "tools" ? "tool" : b.item.kind]}>
              {b.kind === "tools" ? (
                <ToolGroup tools={b.tools} />
              ) : (
                <Message item={b.item} previews={previews.current} />
              )}
            </div>
          ))}
          {thinking && !draft && (
            <div className={GAP.tool}>
              <Thinking text={thinking} live />
            </div>
          )}
          {draft && (
            <div className={GAP.assistant}>
              <StreamingAnswer text={draft} />
            </div>
          )}
          {busy && !draft && !approval && (
            <div className={GAP.tool}>
              <Working what={working} since={startedAt} />
            </div>
          )}
          {approval && (
            <div className={GAP.assistant}>
              <ApprovalCard approval={approval} onDecide={chat.decide} />
            </div>
          )}
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-3xl shrink-0 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {!atBottom && (
          <button
            type="button"
            aria-label="Jump to the latest message"
            onClick={() => {
              stick.current = true;
              const el = scroller.current;
              if (el) el.scrollTop = el.scrollHeight;
            }}
            className="absolute -top-11 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-line-strong bg-surface text-ink-2 shadow-sm hover:text-ink"
          >
            <ChevronDown size={16} />
          </button>
        )}
        {elsewhere && (
          <p className="mb-2 flex items-center gap-2 px-2 text-sm text-warn">
            This conversation is open in another tab or device.
            <button
              type="button"
              onClick={chat.reconnect}
              className="inline-flex items-center gap-1 underline"
            >
              <RefreshCw size={13} /> Use it here
            </button>
          </p>
        )}
        {chat.status === "closed" && !readOnly && (
          <p className="mb-2 px-2 text-sm text-warn" role="status">
            Connection lost. Reconnecting…
          </p>
        )}
        {readOnly ? (
          <p className="pb-4 text-center text-sm text-ink-3">
            This conversation happens in Telegram. You can read it here and reply there.
          </p>
        ) : (
          <>
            {composer}
            <p className="pt-1.5 text-center text-[11px] text-ink-3">
              {agentLabel(agent)} · {agentHint(agent)}
              {contextUsed !== null &&
                (contextUsed >= 85 ? (
                  <span className="font-medium text-warn">
                    {" "}
                    · context {contextUsed}% used: start a new chat soon, or earlier messages get dropped
                  </span>
                ) : (
                  ` · context ${contextUsed}% used`
                ))}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
