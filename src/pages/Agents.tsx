// Agents, the way a person thinks of them: who it is, what it was told, which model it
// uses, and what it must ask before doing. Each of those is one plain section; everything
// else stays in ZeroClaw's own dashboard.
import { ArrowLeft, ChevronRight, MessageSquarePlus, Plus, Search, Send, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Confirm, Loading, Modal, Note, Page, Skeleton, fieldClass } from "../components/ui";
import { type AgentInfo, INSTRUCTIONS, actionLabel, firstLine, loadAgent, parseList } from "../lib/agents";
import { ChangedElsewhere, api } from "../lib/api";
import { agentLabel, modelLabel, sortModels } from "../lib/format";
import type { Agent, InstructionContent, Tool } from "../lib/types";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Avatar({ alias, large }: { alias: string; large?: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-serif font-semibold text-accent ${
        large ? "h-14 w-14 text-2xl" : "h-10 w-10 text-lg"
      }`}
      aria-hidden="true"
    >
      {agentLabel(alias).charAt(0)}
    </span>
  );
}

function summary(a: AgentInfo): string {
  const parts = [a.model ? modelLabel(a.model) : "No model"];
  if (a.channels.some((c) => c.startsWith("telegram"))) parts.push("answers on Telegram");
  if (!a.enabled) parts.push("switched off");
  return parts.join(" · ");
}

/* ---------------------------------------------------------------- list */

export function Agents({ agents, onChat }: { agents: Agent[]; onChat: (alias: string) => void }) {
  const [info, setInfo] = useState<Record<string, AgentInfo>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(agents.map((a) => loadAgent(a.alias)))
      .then((all) => !cancelled && setInfo(Object.fromEntries(all.map((a) => [a.alias, a]))))
      .catch((e) => !cancelled && setError(message(e)));
    return () => {
      cancelled = true;
    };
  }, [agents]);

  return (
    <Page title="Agents" subtitle="The assistants you can talk to. Open one to change how it behaves.">
      {error && <Note className="mt-4">Could not load the agents: {error}</Note>}
      {agents.length === 0 && !error && <Loading what="agents" rows={2} />}
      <ul className="mt-6 space-y-2.5">
        {agents.map((a) => (
          <li
            key={a.alias}
            className="flex items-center gap-1 rounded-2xl border border-line bg-surface pr-3 hover:border-line-strong"
          >
            <Link
              to={`/agents/${a.alias}`}
              className="flex min-w-0 flex-1 items-center gap-3.5 rounded-2xl p-4"
            >
              <Avatar alias={a.alias} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{agentLabel(a.alias)}</span>
                {info[a.alias] ? (
                  <span className="appear block truncate text-sm text-ink-2">{summary(info[a.alias])}</span>
                ) : (
                  <Skeleton className="mt-1.5 h-3.5 w-44" />
                )}
              </span>
              <ChevronRight size={18} className="shrink-0 text-ink-3" />
            </Link>
            <Button small onClick={() => onChat(a.alias)} className="max-sm:hidden">
              <MessageSquarePlus size={14} /> Chat
            </Button>
          </li>
        ))}
      </ul>
    </Page>
  );
}

/* ---------------------------------------------------------------- one agent */

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="text-[1.05rem] font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-ink-2">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function InstructionEditor({
  agent,
  file,
  title,
  hint,
  maxChars,
  onClose,
  onSaved,
}: {
  agent: string;
  file: string;
  title: string;
  hint: string;
  maxChars: number;
  onClose: () => void;
  onSaved: (content: string) => void;
}) {
  const [opened, setOpened] = useState<InstructionContent | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError(null);
    setConflict(false);
    api
      .instructionFile(agent, file)
      .then((f) => {
        setOpened(f);
        setText(f.content ?? "");
      })
      .catch((e) => setError(message(e)));
  }, [agent, file]);

  useEffect(() => {
    load();
  }, [load]);

  const changed = opened !== null && text !== (opened.content ?? "");
  const tooLong = text.length > maxChars;

  async function save() {
    if (!opened || !changed || tooLong || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.saveInstructionFile(agent, file, text, opened.mtime_ms);
      onSaved(text);
    } catch (e) {
      if (e instanceof ChangedElsewhere) setConflict(true);
      else setError(message(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      onSubmit={save}
      wide
      footer={
        <>
          <span
            className={`mr-auto self-center text-xs tabular-nums ${tooLong ? "font-medium text-danger" : "text-ink-3"}`}
          >
            {text.length.toLocaleString()} / {maxChars.toLocaleString()} characters
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!changed || tooLong || conflict} busy={saving}>
            Save
          </Button>
        </>
      }
    >
      <p className="mt-1 text-sm text-ink-2">{hint}</p>
      {!opened && !error && <Loading what="the text" shape="text" rows={8} />}
      {opened && (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          aria-label={title}
          className={`${fieldClass} scroll-thin mt-3 h-[52vh] min-h-48 resize-y text-[15px] leading-relaxed`}
        />
      )}
      {opened?.truncated && (
        <Note tone="warn" className="mt-3">
          This file is longer than what is shown. Saving here would cut off the rest, so edit it in ZeroClaw's
          dashboard.
        </Note>
      )}
      {conflict && (
        <Note tone="warn" className="mt-3">
          This was changed somewhere else while you were editing, so it was not saved.{" "}
          <button type="button" onClick={load} className="underline">
            Load the new version
          </button>{" "}
          (your edits here will be replaced; copy them first if you need them).
        </Note>
      )}
      {error && <Note className="mt-3">{error}</Note>}
    </Modal>
  );
}

function Instructions({ agent }: { agent: string }) {
  const [previews, setPreviews] = useState<Record<string, string> | null>(null);
  const [maxChars, setMaxChars] = useState(20000);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<(typeof INSTRUCTIONS)[number] | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPreviews(null);
    (async () => {
      const list = await api.instructionFiles(agent);
      const known = INSTRUCTIONS.filter((i) => list.files.some((f) => f.filename === i.file));
      const contents = await Promise.all(
        known.map((i) =>
          api.instructionFile(agent, i.file).then((f) => [i.file, firstLine(f.content ?? "")] as const),
        ),
      );
      if (!cancelled) {
        setMaxChars(list.max_chars || 20000);
        setPreviews(Object.fromEntries(contents));
      }
    })().catch((e) => !cancelled && setError(message(e)));
    return () => {
      cancelled = true;
    };
  }, [agent]);

  if (error) return <Note>Could not load the instructions: {error}</Note>;
  if (!previews) return <Loading what="instructions" shape="rows" />;

  const available = INSTRUCTIONS.filter((i) => i.file in previews);
  const shown = available.filter((i) => i.primary || more);
  const hidden = available.length - available.filter((i) => i.primary).length;

  return (
    <>
      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {shown.map((i) => (
          <li key={i.file}>
            <button
              type="button"
              onClick={() => setEditing(i)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-panel/60 first:rounded-t-2xl last:rounded-b-2xl"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{i.title}</span>
                <span className="block truncate text-sm text-ink-2">
                  {previews[i.file] || "Nothing written yet"}
                </span>
              </span>
              <span className="shrink-0 text-sm text-accent">Edit</span>
            </button>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          className="mt-2 text-sm text-ink-2 hover:text-ink"
        >
          {more ? "Show fewer" : `Show ${hidden} more`}
        </button>
      )}
      {editing && (
        <InstructionEditor
          agent={agent}
          file={editing.file}
          title={editing.title}
          hint={editing.hint}
          maxChars={maxChars}
          onClose={() => setEditing(null)}
          onSaved={(content) => {
            setPreviews({ ...previews, [editing.file]: firstLine(content) });
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function ModelChoice({ info, onChanged }: { info: AgentInfo; onChanged: (model: string) => void }) {
  const [models, setModels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!info.provider) return;
    api
      .models(info.provider)
      .then((m) => setModels(sortModels(m)))
      .catch(() => setModels([]));
  }, [info.provider]);

  const choices = models.includes(info.model) || !info.model ? models : [info.model, ...models];

  async function choose(model: string) {
    setSaving(true);
    setError(null);
    try {
      await api.configSet(`providers.models.${info.provider}.model`, model);
      onChanged(model);
    } catch (e) {
      setError(message(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <select
        value={info.model}
        disabled={saving || choices.length < 2}
        onChange={(e) => choose(e.target.value)}
        aria-label="Model"
        className={`${fieldClass} mt-0 max-w-sm`}
      >
        {choices.map((m) => (
          <option key={m} value={m}>
            {modelLabel(m)}
          </option>
        ))}
      </select>
      {error && <Note className="mt-3">Could not switch: {error}</Note>}
    </>
  );
}

function ToolPicker({
  tools,
  chosen,
  onAdd,
  onClose,
}: { tools: Tool[]; chosen: string[]; onAdd: (name: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const list = useMemo(
    () =>
      tools
        .filter((t) => !chosen.includes(t.name))
        // match the name as stored ("memory_forget") and as shown ("memory forget")
        .filter(
          (t) => !q || `${t.name} ${t.name.replace(/_+/g, " ")} ${t.description}`.toLowerCase().includes(q),
        )
        .slice(0, 60),
    [tools, chosen, q],
  );
  return (
    <Modal title="Ask me before…" onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
      <div className="relative mt-3">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search actions, for example: delete, send, post"
          aria-label="Search actions"
          className="w-full rounded-xl border border-line-strong bg-surface py-2 pl-9 pr-3 outline-none focus:border-accent"
        />
      </div>
      <ul className="scroll-thin mt-3 max-h-[50vh] divide-y divide-line overflow-y-auto rounded-2xl border border-line bg-surface">
        {list.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-2">Nothing matches.</li>}
        {list.map((t) => {
          const { action, where } = actionLabel(t.name);
          return (
            <li key={t.name}>
              <button
                type="button"
                onClick={() => onAdd(t.name)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-panel/60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {action}
                    {where && <span className="font-normal text-ink-3"> · {where}</span>}
                  </span>
                  <span className="line-clamp-1 text-xs text-ink-2">{t.description}</span>
                </span>
                <Plus size={16} className="shrink-0 text-accent" />
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

function AskFirst({ info, sharedWith }: { info: AgentInfo; sharedWith: string[] }) {
  const path = `risk_profiles.${info.riskProfile}.always_ask`;
  const [list, setList] = useState<string[] | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setList(null);
    api
      .configGet(path)
      .then((v) => setList(parseList(typeof v === "string" ? v : JSON.stringify(v))))
      .catch((e) => setError(message(e)));
    api
      .tools(info.alias)
      .then(setTools)
      .catch(() => setTools([]));
  }, [path, info.alias]);

  // Show the change at once; put it back if ZeroClaw refuses it.
  async function save(next: string[]) {
    const before = list;
    setList(next);
    setError(null);
    try {
      await api.configSet(path, next);
    } catch (e) {
      setList(before);
      setError(`Could not save: ${message(e)}`);
    }
  }

  if (!info.riskProfile)
    return <p className="text-sm text-ink-2">This agent has no approval rules set up.</p>;
  if (!list && !error) return <Loading what="rules" shape="chips" rows={7} />;

  return (
    <>
      {error && <Note className="mb-3">{error}</Note>}
      {list && (
        <ul className="flex flex-wrap gap-2">
          {list.map((name) => {
            const { action, where } = actionLabel(name);
            return (
              <li
                key={name}
                className="flex items-center gap-1 rounded-full border border-line bg-surface py-1 pl-3 pr-1 text-sm"
              >
                <span>
                  {action}
                  {where && <span className="text-ink-3"> · {where}</span>}
                </span>
                <button
                  type="button"
                  aria-label={`Stop asking before ${action}`}
                  title="Stop asking for this"
                  onClick={() => save(list.filter((x) => x !== name))}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-ink-3 hover:bg-line hover:text-ink"
                >
                  <X size={13} />
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="flex items-center gap-1 rounded-full border border-dashed border-line-strong px-3 py-1 text-sm text-ink-2 hover:border-accent hover:text-accent"
            >
              <Plus size={14} /> Add
            </button>
          </li>
        </ul>
      )}
      {list && list.length === 0 && (
        <p className="mt-2 text-sm text-ink-2">Right now it does everything without asking.</p>
      )}
      {sharedWith.length > 0 && (
        <p className="mt-3 text-xs text-ink-3">
          {sharedWith.map(agentLabel).join(" and ")} {sharedWith.length === 1 ? "uses" : "use"} the same list,
          so a change here applies there too.
        </p>
      )}
      {picking && list && (
        <ToolPicker
          tools={tools}
          chosen={list}
          onAdd={(name) => save([...list, name])}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}

export function AgentPage({
  alias,
  agents,
  onChat,
}: { alias: string; agents: Agent[]; onChat: (alias: string) => void }) {
  const [info, setInfo] = useState<AgentInfo | null>(null);
  const [others, setOthers] = useState<AgentInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setInfo(null);
    setError(null);
    loadAgent(alias)
      .then((a) => !cancelled && setInfo(a))
      .catch((e) => !cancelled && setError(message(e)));
    Promise.all(agents.filter((a) => a.alias !== alias).map((a) => loadAgent(a.alias)))
      .then((all) => !cancelled && setOthers(all))
      .catch(() => {
        // only used for the "shared with" note
      });
    return () => {
      cancelled = true;
    };
  }, [alias, agents]);

  async function setEnabled(enabled: boolean) {
    if (!info) return;
    setSwitching(true);
    setConfirmOff(false);
    try {
      await api.configSet(`agents.${alias}.enabled`, enabled);
      setInfo({ ...info, enabled });
    } catch (e) {
      setError(`Could not switch it ${enabled ? "on" : "off"}: ${message(e)}`);
    } finally {
      setSwitching(false);
    }
  }

  const onTelegram = info?.channels.some((c) => c.startsWith("telegram"));
  const sharedModel = info ? others.filter((o) => o.provider === info.provider).map((o) => o.alias) : [];
  const sharedRules = info
    ? others.filter((o) => o.riskProfile && o.riskProfile === info.riskProfile).map((o) => o.alias)
    : [];

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-6 md:py-10">
        <Link
          to="/agents"
          className="-ml-1 inline-flex items-center gap-1 rounded-lg px-1 text-sm text-ink-2 hover:text-ink"
        >
          <ArrowLeft size={15} /> Agents
        </Link>

        <div className="mt-5 flex items-center gap-4">
          <Avatar alias={alias} large />
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-[1.7rem] leading-tight">{agentLabel(alias)}</h1>
            <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-ink-2">
              {info ? (
                <>
                  {info.enabled ? "On" : "Switched off"}
                  {onTelegram && (
                    <span className="inline-flex items-center gap-1">
                      · <Send size={12} /> answers on Telegram
                    </span>
                  )}
                </>
              ) : (
                " "
              )}
            </p>
          </div>
          <Button variant="primary" onClick={() => onChat(alias)} disabled={info ? !info.enabled : true}>
            <MessageSquarePlus size={15} /> <span className="max-sm:hidden">New chat</span>
          </Button>
        </div>

        {error && <Note className="mt-5">{error}</Note>}
        {!info && !error && <Loading what="agent" shape="rows" />}

        {info && (
          <>
            <Card
              title="Instructions"
              hint="What it has been told. It reads these at the start of every conversation."
            >
              <Instructions agent={alias} />
            </Card>

            <Card
              title="Model"
              hint={`Used everywhere ${agentLabel(alias)} runs: here, in Telegram and in scheduled jobs.${
                sharedModel.length ? ` ${sharedModel.map(agentLabel).join(" and ")} shares this setting.` : ""
              }`}
            >
              <ModelChoice info={info} onChanged={(model) => setInfo({ ...info, model })} />
            </Card>

            <Card
              title="Ask me first"
              hint="It waits for your OK before doing any of these. Everything else it does by itself."
            >
              <AskFirst info={info} sharedWith={sharedRules} />
            </Card>

            <Card title={info.enabled ? "Switch off" : "Switched off"}>
              {info.enabled ? (
                confirmOff ? (
                  <Confirm
                    question={
                      onTelegram
                        ? "It will stop answering on Telegram and its scheduled jobs will stop too. Switch it off?"
                        : "Its chats and scheduled jobs will stop working. Switch it off?"
                    }
                    yes="Switch off"
                    no="Keep it on"
                    onYes={() => setEnabled(false)}
                    onNo={() => setConfirmOff(false)}
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="danger-quiet" busy={switching} onClick={() => setConfirmOff(true)}>
                      Switch {agentLabel(alias)} off
                    </Button>
                    <span className="text-sm text-ink-2">
                      Nothing is deleted. You can switch it back on here.
                    </span>
                  </div>
                )
              ) : (
                <Button variant="primary" busy={switching} onClick={() => setEnabled(true)}>
                  Switch {agentLabel(alias)} on
                </Button>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
