import { Ban, Check, ChevronRight, CircleAlert, LoaderCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { type ToolItem, summarizeTools, toolName } from "../lib/blocks";
import { jsonTokens, presentResult, resultProblem } from "../lib/toolResult";
import { CopyButton } from "./Markdown";

/** Longer than this and the panel shows the start, with a way to see the rest. */
const LIMIT = 6000;

const TOKEN_CLASS = {
  key: "text-[var(--code-title)]",
  string: "text-[var(--code-string)]",
  number: "text-[var(--code-number)]",
  literal: "text-[var(--code-keyword)]",
  plain: "",
} as const;

function Json({ text }: { text: string }) {
  const tokens = useMemo(() => jsonTokens(text), [text]);
  return (
    <>
      {tokens.map((t, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the tokens of one text never reorder
        <span key={i} className={TOKEN_CLASS[t.type]}>
          {t.text}
        </span>
      ))}
    </>
  );
}

/** A titled box of preformatted text: wraps by default, keeps its columns for a table. */
function Panel({ label, text, as }: { label: string; text: string; as: "json" | "table" | "text" }) {
  const [all, setAll] = useState(false);
  const long = text.length > LIMIT;
  const shown = long && !all ? `${text.slice(0, LIMIT)}\n…` : text;
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-code">
      <div className="flex min-h-8 items-center justify-between border-b border-line pl-3 pr-1 text-xs text-ink-3">
        {label}
        <CopyButton text={text} label={`Copy ${label.toLowerCase()}`} withText />
      </div>
      <pre
        className={`scroll-thin max-h-80 overflow-auto px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-ink-2 [font-variant-ligatures:none] ${
          as === "table" ? "whitespace-pre" : "whitespace-pre-wrap break-words"
        }`}
      >
        {as === "json" ? <Json text={shown} /> : shown}
      </pre>
      {long && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="w-full border-t border-line px-3 py-1.5 text-left text-xs text-accent hover:bg-line/40"
        >
          {all ? "Show less" : `Show all ${text.length.toLocaleString()} characters`}
        </button>
      )}
    </div>
  );
}

function Result({ output }: { output: string }) {
  const shown = useMemo(() => presentResult(output), [output]);
  switch (shown.kind) {
    case "empty":
      return <p className="text-sm text-ink-3">It returned nothing.</p>;
    case "denied":
      return (
        <p className="flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
          <Ban size={15} className="mt-0.5 shrink-0" /> {shown.text}
        </p>
      );
    case "error":
      return (
        <p className="flex items-start gap-2 whitespace-pre-wrap break-words rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <CircleAlert size={15} className="mt-0.5 shrink-0" /> {shown.text}
        </p>
      );
    default:
      return <Panel label="Result" text={shown.text} as={shown.kind} />;
  }
}

function Details({ item }: { item: ToolItem }) {
  const args = typeof item.args === "string" ? item.args : JSON.stringify(item.args ?? {}, null, 2);
  const hasArgs = args !== "{}" && args.trim() !== "";
  return (
    <div className="space-y-2">
      {hasArgs && <Panel label="Input" text={args} as={typeof item.args === "string" ? "text" : "json"} />}
      {item.output != null ? (
        <Result output={item.output} />
      ) : (
        <p className="text-sm text-ink-3">
          {item.pending ? "Waiting for the result…" : "No result was saved for this call."}
        </p>
      )}
    </div>
  );
}

const rowClass =
  "-ml-2 inline-flex max-w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm text-ink-2 hover:bg-panel";

function Mark({ pending, problem }: { pending: boolean; problem?: "denied" | "error" | null }) {
  if (pending) return <LoaderCircle size={14} className="shrink-0 animate-spin text-accent" />;
  if (problem === "error") return <CircleAlert size={14} className="shrink-0 text-danger" />;
  if (problem === "denied") return <Ban size={14} className="shrink-0 text-warn" />;
  return <Check size={14} className="shrink-0 text-ink-3" />;
}

function Name({ item }: { item: ToolItem }) {
  const { server, tool } = toolName(item.name);
  return (
    <span className="truncate">
      <span className="font-medium text-ink">{tool}</span>
      {server && <span className="text-ink-3"> · {server}</span>}
    </span>
  );
}

/** One tool call: a line that opens to show what went in and what came back. */
export function ToolCard({ item, nested }: { item: ToolItem; nested?: boolean }) {
  const [open, setOpen] = useState(false);
  const problem = resultProblem(item.output);
  const verb = item.pending
    ? "Using"
    : problem === "denied"
      ? "Did not run"
      : problem === "error"
        ? "Failed:"
        : "Used";
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={rowClass}>
        <Mark pending={item.pending} problem={problem} />
        {(!nested || problem) && <span>{verb}</span>}
        <Name item={item} />
        <ChevronRight
          size={14}
          className={`shrink-0 text-ink-3 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div className="mb-2 mt-1.5">
          <Details item={item} />
        </div>
      )}
    </div>
  );
}

/** Several calls in a row, folded into one line. */
export function ToolGroup({ tools }: { tools: ToolItem[] }) {
  const [open, setOpen] = useState(false);
  const running = tools.find((t) => t.pending);
  const failed = tools.filter((t) => resultProblem(t.output) === "error").length;
  const denied = tools.filter((t) => resultProblem(t.output) === "denied").length;
  const trouble = [failed && `${failed} failed`, denied && `${denied} not run`].filter(Boolean).join(", ");
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={rowClass}>
        <Mark
          pending={Boolean(running)}
          problem={running ? null : failed ? "error" : denied ? "denied" : null}
        />
        {running ? (
          <span className="truncate">
            Using <span className="font-medium text-ink">{toolName(running.name).tool}</span>
            <span className="text-ink-3"> · step {tools.length}</span>
          </span>
        ) : (
          <span className="truncate">
            Used {tools.length} tools
            {trouble ? (
              <span className={failed ? "text-danger" : "text-warn"}> · {trouble}</span>
            ) : (
              <span className="text-ink-3"> · {summarizeTools(tools)}</span>
            )}
          </span>
        )}
        <ChevronRight
          size={14}
          className={`shrink-0 text-ink-3 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div className="ml-[5px] mt-1 space-y-0.5 border-l border-line pl-4">
          {tools.map((t) => (
            <ToolCard key={t.id} item={t} nested />
          ))}
        </div>
      )}
    </div>
  );
}
