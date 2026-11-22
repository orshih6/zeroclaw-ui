import { ShieldQuestion } from "lucide-react";
import { useEffect, useState } from "react";
import type { Approval } from "../lib/types";

export function ApprovalCard({
  approval,
  onDecide,
}: {
  approval: Approval;
  onDecide: (d: "approve" | "deny" | "always") => void;
}) {
  const [left, setLeft] = useState(approval.timeoutSecs);
  useEffect(() => {
    const tick = () =>
      setLeft(Math.max(0, Math.ceil(approval.timeoutSecs - (Date.now() - approval.receivedAt) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [approval]);

  return (
    <div
      className="rounded-2xl border border-warn/40 bg-warn-soft p-4"
      role="alertdialog"
      aria-label="Approval needed"
    >
      <div className="flex items-start gap-3">
        <ShieldQuestion size={20} className="mt-0.5 shrink-0 text-warn" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            Allow <span className="font-mono text-[0.93em]">{approval.tool}</span>?
          </p>
          {approval.summary && (
            <pre className="scroll-thin mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[12.5px] text-ink-2">
              {approval.summary}
            </pre>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onDecide("approve")}
              className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-ink hover:opacity-90"
            >
              Allow once
            </button>
            <button
              type="button"
              onClick={() => onDecide("always")}
              title="Stop asking for this tool"
              className="rounded-lg border border-line-strong bg-surface px-3.5 py-1.5 text-sm hover:bg-panel"
            >
              Always allow
            </button>
            <button
              type="button"
              onClick={() => onDecide("deny")}
              className="rounded-lg border border-line-strong bg-surface px-3.5 py-1.5 text-sm text-danger hover:bg-danger-soft"
            >
              Deny
            </button>
            <span className="ml-auto text-xs tabular-nums text-ink-2">
              {left > 0 ? `Denied automatically in ${left}s` : "Timed out"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
