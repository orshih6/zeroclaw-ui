import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button, Loading, Note, Page, Section, Segmented } from "../components/ui";
import { api } from "../lib/api";
import { agentLabel, compact, modelLabel, shortDate, uptime } from "../lib/format";
import type { DoctorResult, LogEvent, Status as StatusData, Usage, UsageRow } from "../lib/types";

type Range = "today" | "week" | "month" | "all";
const RANGES: { value: Range; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "7 days" },
  { value: "month", label: "30 days" },
  { value: "all", label: "All time" },
];

function since(range: Range): Date | undefined {
  if (range === "all") return undefined;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === "week") d.setDate(d.getDate() - 6);
  if (range === "month") d.setDate(d.getDate() - 29);
  return d;
}

const COMPONENT_LABEL: Record<string, string> = {
  daemon: "Agent runtime",
  gateway: "Web gateway",
  channels: "Channels",
  scheduler: "Scheduler",
  "control-plane": "Control plane",
  heartbeat: "Heartbeat",
  enroll: "Pairing",
};

function componentLabel(key: string): string {
  if (key.startsWith("channel:")) return `Channel · ${key.slice(8)}`;
  return COMPONENT_LABEL[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/[-_]/g, " ");
}

function UsageTable({
  title,
  rows,
  label,
}: { title: string; rows: Record<string, UsageRow>; label: (k: string) => string }) {
  const entries = Object.entries(rows).sort((a, b) => b[1].total_tokens - a[1].total_tokens);
  if (entries.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[30rem] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-3">
            <th className="px-4 py-2 font-medium">{title}</th>
            <th className="px-3 py-2 text-right font-medium">Requests</th>
            <th className="px-3 py-2 text-right font-medium">Tokens in</th>
            <th className="px-3 py-2 text-right font-medium">From cache</th>
            <th className="px-4 py-2 text-right font-medium">Tokens out</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line tabular-nums">
          {entries.map(([k, r]) => (
            <tr key={k}>
              <td className="px-4 py-2.5 font-medium">{label(k)}</td>
              <td className="px-3 py-2.5 text-right">{r.request_count.toLocaleString()}</td>
              <td className="px-3 py-2.5 text-right">{compact(r.input_tokens)}</td>
              <td className="px-3 py-2.5 text-right text-ink-2">
                {r.input_tokens ? `${Math.round((r.cached_input_tokens / r.input_tokens) * 100)}%` : "—"}
              </td>
              <td className="px-4 py-2.5 text-right">{compact(r.output_tokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Status() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [checks, setChecks] = useState<DoctorResult[] | null>(null);
  const [problems, setProblems] = useState<LogEvent[] | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [range, setRange] = useState<Range>("today");
  const [usageLoading, setUsageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.status().then(setStatus),
      // The checks and the log are extras: the page is still useful without them.
      api
        .doctor()
        .then(setChecks)
        .catch(() => setChecks([])),
      api
        .problems()
        .then(setProblems)
        .catch(() => setProblems([])),
    ])
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setUsageLoading(true);
    api
      .usage(since(range))
      .then(setUsage)
      .catch(() => setUsage({ by_agent: {}, by_model: {}, request_count: 0, total_tokens: 0 }))
      .finally(() => setUsageLoading(false));
  }, [range]);

  const components = Object.entries(status?.health.components ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const broken = components.filter(([, c]) => c.status !== "ok");
  const failing = (checks ?? []).filter((c) => c.severity !== "ok");

  return (
    <Page
      title="Status"
      subtitle="Whether ZeroClaw is healthy, and how much it has been used."
      action={
        <Button onClick={load} busy={loading}>
          {!loading && <RefreshCw size={14} />} Refresh
        </Button>
      }
    >
      {error && <Note className="mt-4">Could not reach ZeroClaw: {error}</Note>}
      {!status && !error && <Loading what="status" shape="rows" rows={5} />}

      {status && (
        <>
          <div
            className={`mt-5 rounded-2xl border p-4 ${broken.length ? "border-danger/40 bg-danger-soft" : "border-line bg-surface"}`}
          >
            <p className="flex items-center gap-2.5 text-lg font-medium">
              <span
                className={`h-2.5 w-2.5 rounded-full ${broken.length ? "bg-danger" : "bg-accent"}`}
                aria-hidden="true"
              />
              {broken.length
                ? `${broken.length} ${broken.length === 1 ? "part needs" : "parts need"} attention`
                : "Everything is running"}
            </p>
            <p className="mt-1 text-sm text-ink-2">
              ZeroClaw {status.version} · up {uptime(status.uptime_seconds)} · default model{" "}
              {modelLabel(status.model)}
            </p>
          </div>

          <Section title="Parts">
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {components.map(([key, c]) => (
                <li key={key} className="flex items-start gap-3 px-4 py-2.5">
                  <span
                    className={`mt-2 h-2 w-2 shrink-0 rounded-full ${c.status === "ok" ? "bg-accent" : "bg-danger"}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p>{componentLabel(key)}</p>
                    {c.last_error && <p className="break-words text-sm text-danger">{c.last_error}</p>}
                  </div>
                  <span className="shrink-0 text-sm text-ink-3">
                    {c.status === "ok" ? "Running" : c.status}
                    {c.restart_count ? ` · restarted ${c.restart_count}×` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}

      {checks && checks.length > 0 && (
        <Section
          title="Self-check"
          hint={`${checks.length - failing.length} of ${checks.length} checks pass.`}
        >
          {failing.length === 0 ? (
            <p className="text-sm text-ink-2">Nothing to fix.</p>
          ) : (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {failing.map((c) => (
                <li key={`${c.category}-${c.message}`} className="px-4 py-2.5 text-sm">
                  <span
                    className={`mr-2 font-medium ${c.severity === "error" ? "text-danger" : "text-warn"}`}
                  >
                    {c.severity === "error" ? "Error" : "Warning"}
                  </span>
                  <span className="text-ink-3">{c.category} · </span>
                  {c.message}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section
        title="Usage"
        hint="Your Claude subscription pays for this, so it is counted in tokens, not money."
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Segmented label="Period" value={range} onChange={setRange} options={RANGES} />
          {usage && (
            <p className="text-sm text-ink-2 tabular-nums">
              {usage.request_count.toLocaleString()} requests · {compact(usage.total_tokens)} tokens
            </p>
          )}
        </div>
        {!usage && <Loading what="usage" shape="rows" rows={2} />}
        {usage && usage.request_count === 0 && <p className="text-sm text-ink-2">No use in this period.</p>}
        {usage && usage.request_count > 0 && (
          <div
            className={`space-y-3 transition-opacity duration-200 ${usageLoading ? "opacity-50" : ""}`}
            aria-busy={usageLoading}
          >
            <UsageTable title="Agent" rows={usage.by_agent} label={agentLabel} />
            <UsageTable title="Model" rows={usage.by_model} label={modelLabel} />
          </div>
        )}
      </Section>

      {problems && (
        <Section title="Recent problems" hint="Warnings and errors from ZeroClaw's own log, newest first.">
          {problems.length === 0 ? (
            <p className="text-sm text-ink-2">None since it started.</p>
          ) : (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {problems.map((p) => (
                <li key={p.id} className="px-4 py-2.5 text-sm">
                  <p className="flex flex-wrap gap-x-2 text-xs text-ink-3">
                    <span
                      className={
                        p.severity_number >= 17 ? "font-medium text-danger" : "font-medium text-warn"
                      }
                    >
                      {p.severity_number >= 17 ? "Error" : "Warning"}
                    </span>
                    <span className="tabular-nums">{shortDate(p["@timestamp"])}</span>
                  </p>
                  <p className="mt-0.5 break-words">{p.message}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </Page>
  );
}
