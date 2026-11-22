import { ArrowRight, ChevronRight, Pencil, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Loading, Modal, Note, Page, Section, fieldClass } from "../components/ui";
import { api } from "../lib/api";
import { shortDate } from "../lib/format";
import { getQuickPrompts, getTodaySeen, setQuickPrompts, setTodaySeen } from "../lib/store";
import { type ToolGroup, loadToolGroups, serverLabel } from "../lib/toolServers";
import type { Agent, CronJob, Status } from "../lib/types";
import { RunResult, jobTitles, runConcern, runPreview } from "./Jobs";

// The page to open first: what the agent did by itself since you last looked, what needs
// you, and one-tap buttons for what you usually ask. It only reads what the Jobs, Tools
// and Status pages read; nothing here is stored on the server.

export type JobLine = {
  id: string;
  title: string;
  /** When it last ran. */
  at: string;
  /** One line of what it said. */
  preview: string;
  /** Why it needs a look, if it does. */
  concern: string | null;
  failed: boolean;
  /** It ran after the last visit. */
  fresh: boolean;
  output: string | null;
};

export type TodayView = {
  /** Failed, or finished "ok" but says it could not do its work. Newest first. */
  needs: JobLine[];
  /** Ran since the last visit and has something to say. Newest first. */
  fresh: JobLine[];
  /** Ran since the last visit and had nothing to report. */
  quiet: number;
  /** The latest result of the other jobs, already seen. Newest first. */
  earlier: JobLine[];
  /** What runs next. */
  next: { id: string; title: string; at: string }[];
};

const QUIET = "Nothing new";

/** Sorts every job's latest run into what the page shows. `since` is the last visit (ms). */
export function todayView(jobs: CronJob[], since: number): TodayView {
  const titles = jobTitles(jobs);
  const view: TodayView = { needs: [], fresh: [], quiet: 0, earlier: [], next: [] };
  for (const j of jobs) {
    if (!j.last_run) continue;
    const failed = j.last_status !== "ok";
    const preview = runPreview(j.last_output);
    const line: JobLine = {
      id: j.id,
      title: titles.get(j.id) ?? "Job",
      at: j.last_run,
      preview,
      concern: failed ? "Failed" : runConcern(j.last_output),
      failed,
      fresh: new Date(j.last_run).getTime() > since,
      output: j.last_output,
    };
    // A job that is switched off cannot fix itself by running again, so its old trouble
    // is history, not something waiting for you.
    if (line.concern && j.enabled) view.needs.push(line);
    else if (line.concern) view.earlier.push(line);
    else if (preview === QUIET || preview === "") view.quiet += line.fresh ? 1 : 0;
    else if (line.fresh) view.fresh.push(line);
    else view.earlier.push(line);
  }
  const newest = (a: JobLine, b: JobLine) => b.at.localeCompare(a.at);
  view.needs.sort(newest);
  view.fresh.sort(newest);
  view.earlier.sort(newest);
  view.next = jobs
    .filter((j) => j.enabled && j.next_run)
    .sort((a, b) => (a.next_run ?? "").localeCompare(b.next_run ?? ""))
    .slice(0, 3)
    .map((j) => ({ id: j.id, title: titles.get(j.id) ?? "Job", at: j.next_run ?? "" }));
  return view;
}

/** "5 min ago", "3 h ago", then the date. */
export function ago(iso: string, now = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return shortDate(iso);
}

/** "in 20 min", "in 3 h", then the date. */
export function until(iso: string, now = Date.now()): string {
  const ms = new Date(iso).getTime() - now;
  if (Number.isNaN(ms)) return "";
  const min = Math.round(ms / 60000);
  if (min < 1) return "now";
  if (min < 60) return `in ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `in ${h} h`;
  return shortDate(iso);
}

function JobRow({ line, open, onToggle }: { line: JobLine; open: boolean; onToggle: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-panel/60"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate font-medium">{line.title}</span>
            <span className="shrink-0 text-xs tabular-nums text-ink-3">{ago(line.at)}</span>
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-2 text-sm">
            {line.concern && (
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${
                  line.failed ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"
                }`}
              >
                <TriangleAlert size={12} /> {line.concern}
              </span>
            )}
            <span className={`${open ? "" : "truncate"} text-ink-2`}>{line.preview}</span>
          </span>
        </span>
        <ChevronRight
          size={16}
          className={`mt-1 shrink-0 text-ink-3 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t border-line px-4 py-3">
          <RunResult output={line.output} />
          <Link
            to={`/jobs?job=${encodeURIComponent(line.id)}`}
            className="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline"
          >
            Earlier runs and settings <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </li>
  );
}

function JobList({ lines }: { lines: JobLine[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {lines.map((l) => (
        <JobRow
          key={l.id}
          line={l}
          open={open === l.id}
          onToggle={() => setOpen(open === l.id ? null : l.id)}
        />
      ))}
    </ul>
  );
}

function PromptEditor({
  prompts,
  onClose,
  onSave,
}: { prompts: string[]; onClose: () => void; onSave: (p: string[]) => void }) {
  const [text, setText] = useState(prompts.join("\n"));
  return (
    <Modal
      title="Quick requests"
      onClose={onClose}
      onSubmit={() =>
        onSave(
          text
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean),
        )
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Save
          </Button>
        </>
      }
    >
      <label className="mt-4 block text-sm font-medium">
        One request per line
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className={`${fieldClass} scroll-thin resize-y leading-relaxed`}
        />
      </label>
      <p className="mt-2 text-sm text-ink-2">
        A tap on one starts a new chat and sends it. They are kept in this browser only.
      </p>
    </Modal>
  );
}

const DAY = 24 * 60 * 60 * 1000;

export function Today({ agents, onAsk }: { agents: Agent[]; onAsk: (prompt: string) => void }) {
  // The visit before this one; a first visit looks back a day.
  const [since] = useState(() => getTodaySeen() ?? Date.now() - DAY);
  const [jobs, setJobs] = useState<CronJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [servers, setServers] = useState<ToolGroup[] | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [prompts, setPrompts] = useState(getQuickPrompts);
  const [editing, setEditing] = useState(false);
  const [showEarlier, setShowEarlier] = useState(false);
  const aliases = useMemo(
    () =>
      agents
        .filter((a) => a.enabled !== false)
        .map((a) => a.alias)
        .join(","),
    [agents],
  );

  const load = useCallback(() => {
    api
      .cron()
      .then((j) => {
        setJobs(j);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    // Extras: the page is still useful without them.
    api
      .status()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    load();
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    // Leaving the page is what makes its contents "seen".
    const seen = () => setTodaySeen(Date.now());
    window.addEventListener("pagehide", seen);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", seen);
      seen();
    };
  }, [load]);

  useEffect(() => {
    if (!aliases) return;
    loadToolGroups(aliases.split(","))
      .then(setServers)
      .catch(() => setServers(null));
  }, [aliases]);

  const view = useMemo(() => (jobs ? todayView(jobs, since) : null), [jobs, since]);
  const down = (servers ?? []).filter((s) => !s.connected);
  const broken = Object.values(status?.health.components ?? {}).filter((c) => c.status !== "ok").length;
  const calm = view && view.needs.length === 0 && down.length === 0 && broken === 0;

  return (
    <Page
      title="Today"
      subtitle={`What your agent did since you last looked (${ago(new Date(since).toISOString())}).`}
    >
      {error && <Note className="mt-4">Could not load the jobs: {error}</Note>}
      {!view && !error && <Loading what="today" shape="rows" rows={4} />}

      {view && (
        <>
          {(down.length > 0 || broken > 0) && (
            <div className="mt-5 space-y-2">
              {down.length > 0 && (
                <Note tone="warn">
                  {down.length === 1 ? "A tool server is" : `${down.length} tool servers are`} not answering:{" "}
                  {down.map((s) => serverLabel(s.name)).join(", ")}.{" "}
                  <Link to="/tools" className="underline">
                    Tools
                  </Link>
                </Note>
              )}
              {broken > 0 && (
                <Note>
                  {broken === 1 ? "A part of ZeroClaw needs" : `${broken} parts of ZeroClaw need`} attention.{" "}
                  <Link to="/status" className="underline">
                    Status
                  </Link>
                </Note>
              )}
            </div>
          )}

          {view.needs.length > 0 && (
            <Section title="Needs a look" hint="Jobs that failed, or say they could not do their work.">
              <JobList lines={view.needs} />
            </Section>
          )}

          <Section title="New">
            {view.fresh.length > 0 && <JobList lines={view.fresh} />}
            <p className={`text-sm text-ink-2 ${view.fresh.length > 0 ? "mt-2.5 px-1" : ""}`}>
              {view.fresh.length === 0 && view.quiet === 0 && "No job has run since you last looked."}
              {view.fresh.length === 0 && view.quiet > 0 && "Nothing to report. "}
              {view.quiet > 0 &&
                `${view.quiet === 1 ? "One job" : `${view.quiet} ${view.fresh.length ? "other " : ""}jobs`} ran and had nothing new.`}
              {calm && servers && status && " Everything is running."}
            </p>
          </Section>

          <Section title="Ask">
            <div className="flex flex-wrap gap-2">
              {prompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onAsk(p)}
                  className="rounded-full border border-line-strong bg-surface px-3.5 py-2 text-left text-sm hover:border-accent hover:text-accent"
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-ink-3 hover:text-ink"
              >
                <Pencil size={13} /> {prompts.length ? "Edit" : "Add quick requests"}
              </button>
            </div>
          </Section>

          {view.next.length > 0 && (
            <Section title="Coming up">
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                {view.next.map((n) => (
                  <li key={n.id} className="flex items-baseline gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{n.title}</span>
                    <span className="shrink-0 tabular-nums text-ink-3">{until(n.at)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {view.earlier.length > 0 && (
            <section className="mt-8">
              <button
                type="button"
                onClick={() => setShowEarlier(!showEarlier)}
                aria-expanded={showEarlier}
                className="flex items-center gap-1 text-sm text-ink-2 hover:text-ink"
              >
                <ChevronRight
                  size={14}
                  className={`transition-transform ${showEarlier ? "rotate-90" : ""}`}
                />
                Seen before ({view.earlier.length})
              </button>
              {showEarlier && (
                <div className="mt-3">
                  <JobList lines={view.earlier} />
                </div>
              )}
            </section>
          )}
        </>
      )}

      {editing && (
        <PromptEditor
          prompts={prompts}
          onClose={() => setEditing(false)}
          onSave={(p) => {
            setQuickPrompts(p);
            setPrompts(getQuickPrompts());
            setEditing(false);
          }}
        />
      )}
    </Page>
  );
}
