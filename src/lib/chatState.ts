// What the conversation column shows, as a pure function of what happened. Kept apart
// from React and the socket so the rules can be tested.
import { appendParts, newId } from "./history";
import { splitModelText } from "./protocol";
import type { Approval, Item, ServerEvent } from "./types";

export type ChatState = {
  items: Item[];
  /** Answer text streamed so far in the current turn. */
  draft: string;
  /** Thinking streamed so far in the current turn. */
  thinking: string;
  busy: boolean;
  /** When the turn that is running began, for "12 s" next to the dots. */
  startedAt: number | null;
  approval: Approval | null;
  usage: { used: number; max: number } | null;
};

export const emptyChat: ChatState = {
  items: [],
  draft: "",
  thinking: "",
  busy: false,
  startedAt: null,
  approval: null,
  usage: null,
};

export type ChatAction =
  | { type: "history"; items: Item[]; usage?: ChatState["usage"] }
  /** A turn started elsewhere is still running; its stream cannot be joined. */
  | { type: "waiting"; now?: number }
  /** That turn ended: what was saved replaces what is shown. */
  | { type: "caught_up"; items: Item[] }
  | { type: "sent"; text: string; images: string[]; now?: number }
  | { type: "problem"; text: string }
  | { type: "approval_answered" }
  | { type: "server"; event: ServerEvent; now: number };

const settle = (items: Item[]): Item[] =>
  items.map((x) => (x.kind === "tool" && x.pending ? { ...x, pending: false } : x));

/** The turn is over: nothing is streaming and nothing waits for an answer. */
const idle = (s: ChatState): ChatState => ({
  ...s,
  draft: "",
  thinking: "",
  busy: false,
  startedAt: null,
  approval: null,
});

function onServer(s: ChatState, e: ServerEvent, now: number): ChatState {
  switch (e.type) {
    case "thinking":
      return { ...s, thinking: s.thinking + (e.content ?? ""), busy: true };
    case "chunk":
      return { ...s, draft: s.draft + (e.content ?? ""), busy: true };
    case "chunk_reset":
      // ZeroClaw takes back what it streamed (it was the lead-in to a tool call).
      return { ...s, draft: "" };
    case "tool_call":
      if (!e.name) return s;
      return {
        ...s,
        busy: true,
        items: [
          ...s.items,
          { id: newId(), kind: "tool", callId: e.id, name: e.name, args: e.args ?? {}, pending: true },
        ],
      };
    case "tool_result": {
      let i = e.id == null ? -1 : s.items.findLastIndex((x) => x.kind === "tool" && x.callId === e.id);
      if (i === -1) i = s.items.findLastIndex((x) => x.kind === "tool" && x.pending && x.name === e.name);
      if (i === -1) {
        return {
          ...s,
          items: [
            ...s.items,
            {
              id: newId(),
              kind: "tool",
              name: e.name ?? "tool",
              args: {},
              output: e.output ?? "",
              pending: false,
            },
          ],
        };
      }
      const items = [...s.items];
      const t = items[i];
      if (t.kind === "tool") items[i] = { ...t, output: e.output ?? "", pending: false };
      return { ...s, items };
    }
    case "message":
    case "done": {
      const text = (e.full_response ?? e.content ?? s.draft).trim();
      const items = settle(s.items);
      // The same reading as saved history: a call the model only wrote as text is flagged,
      // not shown as an answer.
      const said: Item[] = [];
      appendParts(said, splitModelText(text));
      const first = said.find((i) => i.kind === "assistant");
      if (first?.kind === "assistant") {
        first.thinking = s.thinking.trim() || undefined;
        first.model = e.model;
      }
      const usage =
        e.tokens_used && e.max_context_tokens ? { used: e.tokens_used, max: e.max_context_tokens } : s.usage;
      return { ...idle(s), items: [...items, ...settle(said)], usage };
    }
    case "approval_request":
      if (!e.request_id) return s;
      return {
        ...s,
        approval: {
          requestId: e.request_id,
          tool: e.tool ?? "a tool",
          summary: e.arguments_summary ?? "",
          timeoutSecs: e.timeout_secs ?? 120,
          receivedAt: now,
        },
      };
    case "aborted":
      return { ...idle(s), items: [...settle(s.items), { id: newId(), kind: "notice", text: "Stopped." }] };
    case "error":
      return {
        ...idle(s),
        items: [
          ...settle(s.items),
          { id: newId(), kind: "error", text: e.message ?? e.code ?? "Something went wrong." },
        ],
      };
    case "history_trimmed":
      return {
        ...s,
        items: [
          ...s.items,
          { id: newId(), kind: "notice", text: "Earlier messages were trimmed to fit the model's context." },
        ],
      };
    case "safeguard_fallback":
      if (!e.served_model || !e.requested_model) return s;
      return {
        ...s,
        items: [
          ...s.items,
          {
            id: newId(),
            kind: "notice",
            text: `${e.requested_model} was unavailable; answered by ${e.served_model}.`,
          },
        ],
      };
    case "cron_result":
      return e.output ? { ...s, items: [...s.items, { id: newId(), kind: "assistant", text: e.output }] } : s;
    default:
      return s;
  }
}

export function chatReducer(s: ChatState, a: ChatAction): ChatState {
  switch (a.type) {
    case "history":
      return { ...s, items: a.items, usage: a.usage ?? s.usage };
    case "waiting":
      return { ...s, busy: true, startedAt: a.now ?? null };
    case "caught_up":
      return { ...idle(s), items: a.items };
    case "sent":
      return {
        ...s,
        busy: true,
        startedAt: a.now ?? null,
        items: [...s.items, { id: newId(), kind: "user", text: a.text, images: a.images }],
      };
    case "problem":
      return {
        ...s,
        busy: false,
        startedAt: null,
        items: [...s.items, { id: newId(), kind: "error", text: a.text }],
      };
    case "approval_answered":
      return { ...s, approval: null };
    case "server":
      return onServer(s, a.event, a.now);
  }
}
