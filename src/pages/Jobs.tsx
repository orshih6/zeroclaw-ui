import { ChevronRight, Pencil, Play, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Message } from "../components/Messages";
import { ToolGroup } from "../components/ToolCard";
import { Button, Confirm, Empty, Loading, Modal, Note, Page, fieldClass } from "../components/ui";
import { firstLine } from "../lib/agents";
import { api } from "../lib/api";
import { toBlocks } from "../lib/blocks";
import { agentLabel, describeCron, duration, shortDate } from "../lib/format";
import { parseTranscript } from "../lib/history";
import type { Agent, Channel, CronJob, CronRun, Item } from "../lib/types";

const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function jobTitle(j: Pick<CronJob, "name" | "job_type" | "prompt" | "command">): string {
  if (j.name) return j.name;
  const text = (j.job_type === "agent" ? j.prompt : j.command) ?? "";
  // The first sentence: up to a full stop, colon or line break that ends a phrase.
  const first = text.split(/[.:!?](?=\s)|\n/)[0].trim();
  return first.length > 70 ? `${first.slice(0, 69)}…` : first || "Untitled job";
}

/** "30 19 * * *" → "19:30"; anything less regular reads as describeCron has it. */
function when(expr: string): string {
  const [m, h] = expr.trim().split(/\s+/);
  return /^\d+$/.test(m ?? "") && /^\d+$/.test(h ?? "")
    ? `${h.padStart(2, "0")}:${m.padStart(2, "0")}`
    : describeCron(expr);
}

/** Titles for a list of jobs: two jobs that would read the same also say when they run. */
export function jobTitles(
  jobs: Pick<CronJob, "id" | "name" | "job_type" | "prompt" | "command" | "expression" | "schedule">[],
): Map<string, string> {
  const count = new Map<string, number>();
  for (const j of jobs) count.set(jobTitle(j), (count.get(jobTitle(j)) ?? 0) + 1);
  return new Map(
    jobs.map((j) => {
      const t = jobTitle(j);
      return [j.id, (count.get(t) ?? 0) > 1 ? `${t} · ${when(j.schedule?.expr ?? j.expression)}` : t];
    }),
  );
}

type Draft = {
  id: string | null;
  name: string;
  schedule: string;
  tz: string;
  agent: string;
  prompt: string;
  deliver: boolean;
  channel: string;
  to: string;
};

function Editor({
  draft,
  agents,
  channels,
  onClose,
  onSaved,
}: {
  draft: Draft;
  agents: Agent[];
  channels: Channel[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState(draft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const fields = d.schedule.trim().split(/\s+/).length;
  const valid =
    fields === 5 && d.prompt.trim() !== "" && (!d.deliver || (d.channel !== "" && d.to.trim() !== ""));

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    const body = {
      name: d.name.trim() || null,
      schedule: d.schedule.trim(),
      tz: d.tz.trim() || null,
      job_type: "agent",
      agent: d.agent,
      prompt: d.prompt.trim(),
      delivery: d.deliver
        ? { mode: "announce", channel: d.channel, to: d.to.trim(), best_effort: true }
        : { mode: "none" },
    };
    try {
      if (d.id) await api.cronUpdate(d.id, body);
      else await api.cronCreate(body);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={d.id ? "Edit job" : "New scheduled job"}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!valid} busy={saving}>
            {d.id ? "Save changes" : "Create job"}
          </Button>
        </>
      }
    >
      <label className="mt-4 block text-sm font-medium">
        Name <span className="font-normal text-ink-3">(optional)</span>
        <input value={d.name} onChange={(e) => set("name", e.target.value)} className={fieldClass} />
      </label>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Schedule
          <input
            value={d.schedule}
            onChange={(e) => set("schedule", e.target.value)}
            spellCheck={false}
            placeholder="0 9 * * *"
            className={`${fieldClass} font-mono text-[14px]`}
          />
          <span className="mt-1 block text-xs font-normal text-ink-2">
            {fields === 5 ? `Runs ${describeCron(d.schedule)}` : "Cron format: minute hour day month weekday"}
          </span>
        </label>
        <label className="block text-sm font-medium">
          Time zone
          <input
            value={d.tz}
            onChange={(e) => set("tz", e.target.value)}
            spellCheck={false}
            className={fieldClass}
          />
        </label>
      </div>

      <label className="mt-4 block text-sm font-medium">
        Agent
        <select value={d.agent} onChange={(e) => set("agent", e.target.value)} className={fieldClass}>
          {agents.map((a) => (
            <option key={a.alias} value={a.alias}>
              {agentLabel(a.alias)}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-4 block text-sm font-medium">
        What should it do?
        <textarea
          value={d.prompt}
          onChange={(e) => set("prompt", e.target.value)}
          rows={7}
          className={`${fieldClass} scroll-thin resize-y leading-relaxed`}
        />
      </label>

      <label className="mt-4 flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={d.deliver}
          onChange={(e) => set("deliver", e.target.checked)}
          className="h-4 w-4 accent-[var(--accent)]"
        />
        Send the result to a channel
      </label>
      {d.deliver && (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Channel
            <select value={d.channel} onChange={(e) => set("channel", e.target.value)} className={fieldClass}>
              {!channels.some((c) => c.name === d.channel) && (
                <option value={d.channel}>{d.channel || "Choose…"}</option>
              )}
              {channels.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Chat id
            <input
              value={d.to}
              onChange={(e) => set("to", e.target.value)}
              spellCheck={false}
              className={`${fieldClass} font-mono text-[14px]`}
            />
          </label>
        </div>
      )}
      {error && <Note className="mt-4">Could not save: {error}</Note>}
    </Modal>
  );
}

/** A job told to stay silent when nothing changed answers exactly this; no message is sent. */
const QUIET = /^\s*NO_?REPLY\s*$/i;
const QUIET_TEXT = "Nothing new, so it sent no message.";

/** What one run said, drawn like a chat answer: text as Markdown, tool calls folded. */
export function RunResult({ output }: { output: string | null }) {
  const blocks = useMemo(() => toBlocks(said(output ?? "")), [output]);
  if (QUIET.test(output ?? "")) return <p className="text-sm text-ink-2">{QUIET_TEXT}</p>;
  if (blocks.length === 0) return <p className="text-sm text-ink-3">It finished without saying anything.</p>;
  return (
    <div>
      {blocks.map((b) => (
        <div key={b.id} className="mt-3 first:mt-0">
          {b.kind === "tools" ? (
            <ToolGroup tools={b.tools} />
          ) : (
            <Message item={b.item} previews={NO_PREVIEWS} />
          )}
        </div>
      ))}
    </div>
  );
}

const NO_PREVIEWS = new Map<string, string>();

/** What a run left, with a closing "NO_REPLY" (after other output) put in plain words. */
function said(output: string): Item[] {
  return parseTranscript(output).map((i) =>
    i.kind === "assistant" && QUIET.test(i.text)
      ? { id: i.id, kind: "notice", text: "It ended by answering that there was nothing new." }
      : i,
  );
}

/** The first sentence of what a run said, for the one-line list of earlier runs. */
export function runPreview(output: string | null): string {
  if (!output?.trim()) return "";
  if (QUIET.test(output)) return "Nothing new";
  const items = said(output);
  const last = items.findLast((i) => i.kind === "assistant");
  if (last?.kind === "assistant") return firstLine(last.text);
  if (items.some((i) => i.kind === "caution")) return UNRUN_TEXT;
  return items.some((i) => i.kind === "tool") ? NO_SUMMARY_TEXT : "";
}

const UNRUN_TEXT = "Wrote its tool calls as text, so nothing was run";
const NO_SUMMARY_TEXT = "Used its tools, wrote no summary";
/** Words a run uses, in its first line, when it could not do its work. */
const TROUBLE =
  /\b(didn['’]t run|did not run|not run because|couldn['’]t|could not|cannot|can['’]t|failed|failure|unavailable|(?:aren['’]t|isn['’]t|not|wasn['’]t|weren['’]t) available|missing|blocked|refused|timed out|error)\b/i;

/**
 * Whether a run that ZeroClaw counts as "ok" still needs a look: it did nothing real, or it
 * says in its own first line that it could not do the job. A guess from its words, so it
 * is shown as a caution, never as a failure.
 */
export function runConcern(output: string | null): string | null {
  if (!output?.trim() || QUIET.test(output)) return null;
  const items = said(output);
  const last = items.findLast((i) => i.kind === "assistant");
  if (last?.kind !== "assistant") {
    if (items.some((i) => i.kind === "caution")) return "Nothing was run";
    return items.some((i) => i.kind === "tool") ? "No summary" : null;
  }
  if (items.some((i) => i.kind === "caution")) return "Part of it was never run";
  return TROUBLE.test(firstLine(last.text)) ? "May need a look" : null;
}

function outcome(r: CronRun): { text: string; bad: boolean } {
  if (r.execution !== "ok") return { text: "Failed", bad: true };
  if (QUIET.test(r.output ?? "")) return { text: "Nothing to report", bad: false };
  if (r.delivery === "delivered") return { text: "Sent to Telegram", bad: false };
  if (r.delivery && r.delivery !== "none" && r.delivery !== "skipped")
    return { text: `Not sent (${r.delivery})`, bad: true };
  return { text: "Finished", bad: false };
}

function RunMeta({ run }: { run: CronRun }) {
  const o = outcome(run);
  return (
    <p className="text-xs text-ink-3">
      <span className="tabular-nums">{shortDate(run.finished_at)}</span> · took {duration(run.duration_ms)} ·{" "}
      <span className={o.bad ? "font-medium text-danger" : ""}>{o.text}</span>
    </p>
  );
}

/** A job's results: the latest one in full, earlier ones as a line each that opens. */
function Results({ jobId, refreshKey }: { jobId: string; refreshKey: number }) {
  const [runs, setRuns] = useState<CronRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey asks for a reload after "Run now"
  useEffect(() => {
    api
      .cronRuns(jobId, 10)
      .then(setRuns)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [jobId, refreshKey]);

  if (error) return <Note>Could not load the results: {error}</Note>;
  if (!runs) return <Loading what="results" shape="text" rows={4} />;
  if (runs.length === 0)
    return <p className="text-sm text-ink-2">It has not run yet. Its result will show here.</p>;

  const [latest, ...earlier] = runs;
  return (
    <div className="appear">
      <RunMeta run={latest} />
      <div className="mt-2">
        <RunResult output={latest.output} />
      </div>

      {earlier.length > 0 && (
        <>
          <h3 className="mb-1.5 mt-6 text-sm font-semibold">Earlier</h3>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {earlier.map((r) => {
              const o = outcome(r);
              const expanded = open === r.id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : r.id)}
                    aria-expanded={expanded}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-panel/60"
                  >
                    <span className="w-[7.5rem] shrink-0 whitespace-nowrap tabular-nums text-ink-2">
                      {shortDate(r.finished_at)}
                    </span>
                    <span className={`min-w-0 flex-1 truncate ${o.bad ? "font-medium text-danger" : ""}`}>
                      {o.bad ? o.text : runPreview(r.output) || o.text}
                    </span>
                    <ChevronRight
                      size={14}
                      className={`shrink-0 text-ink-3 transition-transform ${expanded ? "rotate-90" : ""}`}
                    />
                  </button>
                  {expanded && (
                    <div className="border-t border-line px-3 py-3">
                      <RunMeta run={r} />
                      <div className="mt-2">
                        <RunResult output={r.output} />
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

export function Jobs({ agents }: { agents: Agent[] }) {
  const [jobs, setJobs] = useState<CronJob[] | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // "?job=<id>" opens that job: the Today page links to a job this way.
  const [expanded, setExpanded] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("job"),
  );
  const [editing, setEditing] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [ranAt, setRanAt] = useState(0);

  const load = useCallback(() => {
    api
      .cron()
      .then((j) => {
        // Running jobs first, then by what runs next.
        setJobs(
          j.sort(
            (a, b) =>
              Number(b.enabled) - Number(a.enabled) || (a.next_run ?? "").localeCompare(b.next_run ?? ""),
          ),
        );
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    load();
    api
      .channels()
      .then(setChannels)
      .catch(() => setChannels([]));
  }, [load]);

  async function act(id: string, what: string, fn: () => Promise<unknown>) {
    setWorking(id);
    setNotice(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError(`Could not ${what}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setWorking(null);
    }
  }

  const titles = useMemo(() => jobTitles(jobs ?? []), [jobs]);
  // The job a link asked for is brought into view, once.
  const linked = useRef(expanded);
  const intoView = useCallback((el: HTMLLIElement | null) => {
    if (!el) return;
    linked.current = null;
    el.scrollIntoView({ block: "start" });
  }, []);

  function blank(): Draft {
    const channel = channels[0]?.name ?? "";
    const to = jobs?.find((j) => j.delivery.to)?.delivery.to ?? "";
    return {
      id: null,
      name: "",
      schedule: "0 9 * * *",
      tz: LOCAL_TZ,
      agent: agents[0]?.alias ?? "assistant",
      prompt: "",
      deliver: Boolean(channel && to),
      channel,
      to,
    };
  }

  function from(j: CronJob): Draft {
    return {
      id: j.id,
      name: j.name ?? "",
      schedule: j.schedule.expr ?? j.expression,
      tz: j.schedule.tz ?? "",
      agent: j.agent_alias ?? agents[0]?.alias ?? "assistant",
      prompt: j.prompt ?? "",
      deliver: j.delivery.mode === "announce",
      channel: j.delivery.channel ?? channels[0]?.name ?? "",
      to: j.delivery.to ?? "",
    };
  }

  return (
    <Page
      title="Scheduled jobs"
      subtitle="Things ZeroClaw does by itself, on a timetable."
      action={
        <Button variant="primary" onClick={() => setEditing(blank())}>
          <Plus size={16} /> New job
        </Button>
      }
    >
      {error && <Note className="mt-4">{error}</Note>}
      {notice && (
        <Note tone="info" className="mt-4">
          {notice}
        </Note>
      )}
      {!jobs && !error && <Loading what="jobs" rows={4} />}
      {jobs && jobs.length === 0 && (
        <div className="mt-6">
          <Empty>Nothing is scheduled. Create a job, or ask the assistant in a chat to set one up.</Empty>
        </div>
      )}

      <ul className="mt-5 space-y-2.5">
        {jobs?.map((j) => {
          const open = expanded === j.id;
          const shell = j.job_type !== "agent";
          const failed = Boolean(j.last_run) && j.last_status !== "ok";
          const concern = failed ? "Failed" : runConcern(j.last_output);
          const preview = j.last_output ? runPreview(j.last_output) : "";
          return (
            <li
              key={j.id}
              ref={open && linked.current === j.id ? intoView : undefined}
              className="rounded-2xl border border-line bg-surface"
            >
              <div className="flex items-start gap-3 p-4">
                <button
                  type="button"
                  role="switch"
                  aria-checked={j.enabled}
                  aria-label={j.enabled ? "Turn this job off" : "Turn this job on"}
                  disabled={working === j.id}
                  onClick={() =>
                    act(j.id, "change the job", () => api.cronUpdate(j.id, { enabled: !j.enabled }))
                  }
                  className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors ${j.enabled ? "bg-accent" : "bg-line-strong"}`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${j.enabled ? "left-[18px]" : "left-0.5"}`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : j.id)}
                  aria-expanded={open}
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-medium ${j.enabled ? "" : "text-ink-3"}`}>
                      {titles.get(j.id)}
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-2">
                      {describeCron(j.schedule.expr ?? j.expression)}
                      {j.schedule.tz ? ` · ${j.schedule.tz.split("/").pop()?.replace(/_/g, " ")} time` : ""}
                    </span>
                    {(preview || concern) && (
                      <span className="mt-1.5 flex min-w-0 items-center gap-2 text-sm">
                        {concern && (
                          <span
                            className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${
                              failed ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"
                            }`}
                          >
                            <TriangleAlert size={12} /> {concern}
                          </span>
                        )}
                        <span className="truncate text-ink">{preview}</span>
                      </span>
                    )}
                    <span className="mt-1 block text-xs text-ink-3">
                      {j.enabled ? `Next ${shortDate(j.next_run)}` : "Switched off"}
                      {" · "}
                      {j.last_run ? (
                        <>
                          last ran {shortDate(j.last_run)}
                          {j.last_status !== "ok" && (
                            <span className="font-medium text-danger"> ({j.last_status ?? "unknown"})</span>
                          )}
                        </>
                      ) : (
                        "has not run yet"
                      )}
                    </span>
                  </span>
                  <ChevronRight
                    size={16}
                    className={`mt-1 shrink-0 text-ink-3 transition-transform ${open ? "rotate-90" : ""}`}
                  />
                </button>
              </div>
              {open && (
                <div className="border-t border-line p-4">
                  <h3 className="mb-2 text-sm font-semibold">Latest result</h3>
                  <Results jobId={j.id} refreshKey={ranAt} />
                  <details className="group mt-6">
                    <summary className="flex cursor-pointer list-none items-center gap-1 text-sm text-ink-2 hover:text-ink">
                      <ChevronRight size={14} className="transition-transform group-open:rotate-90" />
                      {shell ? "The command it runs" : "What it was told"}
                    </summary>
                    <p className="scroll-thin mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap break-words text-sm text-ink-2">
                      {(shell ? j.command : j.prompt) || "—"}
                    </p>
                  </details>
                  <div className="mt-5">
                    {confirm === j.id ? (
                      <Confirm
                        question="Delete this job?"
                        yes="Delete"
                        no="Keep"
                        onYes={() => {
                          setConfirm(null);
                          act(j.id, "delete the job", () => api.cronDelete(j.id));
                        }}
                        onNo={() => setConfirm(null)}
                      />
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          small
                          disabled={working === j.id}
                          onClick={() =>
                            act(j.id, "start the job", async () => {
                              await api.cronRun(j.id);
                              setNotice("Started. Its result will appear here when it finishes.");
                              // look again a few times: a run takes from seconds to a few minutes
                              for (const wait of [15000, 45000, 120000])
                                setTimeout(() => setRanAt(Date.now()), wait);
                            })
                          }
                        >
                          <Play size={14} /> Run now
                        </Button>
                        {!shell && (
                          <Button small onClick={() => setEditing(from(j))}>
                            <Pencil size={14} /> Edit
                          </Button>
                        )}
                        <Button small variant="danger-quiet" onClick={() => setConfirm(j.id)}>
                          <Trash2 size={14} /> Delete
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {editing && (
        <Editor
          draft={editing}
          agents={agents}
          channels={channels}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </Page>
  );
}
