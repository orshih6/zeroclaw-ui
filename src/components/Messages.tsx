import { ChevronRight, Image as ImageIcon, TriangleAlert } from "lucide-react";
import { memo, useState } from "react";
import { fileName, modelLabel } from "../lib/format";
import { readableText } from "../lib/protocol";
import type { Item } from "../lib/types";
import { CopyButton, Markdown } from "./Markdown";
import { ToolCard } from "./ToolCard";
import { Skeleton, useDelayed } from "./ui";

export function Thinking({ text, live }: { text: string; live?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="-ml-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-ink-3 hover:bg-panel hover:text-ink-2"
      >
        <ChevronRight size={14} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        {live ? "Thinking…" : "Thought process"}
      </button>
      {open && <p className="mt-1 whitespace-pre-wrap border-l-2 border-line pl-3 text-ink-2">{text}</p>}
    </div>
  );
}

export function Dots() {
  return (
    <div className="flex items-center gap-1.5 py-2" role="status" aria-label="Working">
      <span className="dot" />
      <span className="dot" />
      <span className="dot" />
    </div>
  );
}

const answerClass = "font-serif text-[1.0625rem] leading-[1.7] text-ink";

export function StreamingAnswer({ text }: { text: string }) {
  // While it streams, tool markup the model is writing must not flash by as text.
  const readable = readableText(text);
  if (!readable) return null;
  return (
    <div className={answerClass}>
      <Markdown text={readable} />
    </div>
  );
}

/** One row of the conversation. `previews` maps an uploaded path to a local image URL. */
export const Message = memo(function Message({
  item,
  previews,
}: {
  item: Item;
  previews: Map<string, string>;
}) {
  switch (item.kind) {
    case "user":
      return (
        <div className="flex flex-col items-end gap-2">
          {item.images.length > 0 && (
            <div className="flex flex-wrap justify-end gap-2">
              {item.images.map((path) => {
                const src = previews.get(path);
                return src ? (
                  <img
                    key={path}
                    src={src}
                    alt={fileName(path)}
                    className="max-h-56 max-w-[16rem] rounded-2xl border border-line object-cover"
                  />
                ) : (
                  <span
                    key={path}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs text-ink-2"
                  >
                    <ImageIcon size={14} /> Image attached
                  </span>
                );
              })}
            </div>
          )}
          {item.text && (
            <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-[1.3rem] bg-user px-4 py-2.5">
              {item.text}
            </div>
          )}
        </div>
      );
    case "assistant":
      return (
        <div className="group">
          {item.thinking && <Thinking text={item.thinking} />}
          <div className={answerClass}>
            <Markdown text={item.text} />
          </div>
          <div className="-ml-1.5 mt-1.5 flex h-7 items-center gap-1.5">
            <CopyButton text={item.text} label="Copy answer" />
            {item.model && <span className="text-xs text-ink-3">{modelLabel(item.model)}</span>}
          </div>
        </div>
      );
    case "tool":
      return <ToolCard item={item} />;
    case "caution":
      return (
        <p
          className="flex items-start gap-2.5 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn"
          role="note"
        >
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          {item.text}
        </p>
      );
    case "notice":
      return <p className="py-1 text-center text-xs text-ink-3">{item.text}</p>;
    case "error":
      return (
        <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
          {item.text}
        </p>
      );
  }
});

/** A conversation that is still loading: a question on the right, an answer on the left. */
export function ChatSkeleton() {
  const late = useDelayed();
  return (
    <div role="status" aria-busy="true" className={late ? "appear" : "invisible"}>
      <span className="sr-only">Loading conversation</span>
      <div className="flex justify-end">
        <Skeleton className="h-10 w-56 rounded-[1.3rem]" />
      </div>
      <div className="mt-6 space-y-3">
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-2/5" />
      </div>
      <div className="mt-9 flex justify-end">
        <Skeleton className="h-10 w-40 rounded-[1.3rem]" />
      </div>
      <div className="mt-6 space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}
