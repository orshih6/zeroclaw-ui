// The model an agent answers with. This is ZeroClaw's own setting for that agent, so a
// change here also applies to Telegram and to scheduled jobs; the menu says so.
import { Check, ChevronDown, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { agentLabel, modelLabel, sortModels } from "../lib/format";
import { Skeleton } from "./ui";

type Loaded = { provider: string; model: string; models: string[] };

export function ModelMenu({ agent, disabled }: { agent: string; disabled?: boolean }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setFailed(false);
    (async () => {
      const provider = String(await api.configGet(`agents.${agent}.model_provider`));
      const [model, models] = await Promise.all([
        api.configGet(`providers.models.${provider}.model`),
        api.models(provider).catch(() => [] as string[]),
      ]);
      if (!cancelled) setData({ provider, model: String(model), models: sortModels(models) });
    })().catch(() => {
      if (!cancelled) setFailed(true);
      // The menu is an extra: without it the chat still works with the current model.
    });
    return () => {
      cancelled = true;
    };
  }, [agent]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  if (!data) return failed ? null : <Skeleton className="mx-3 h-4 w-16" />;
  const choices = data.models.includes(data.model) ? data.models : [data.model, ...data.models];
  const canChoose = choices.length > 1;

  async function choose(model: string) {
    if (!data || model === data.model) return setOpen(false);
    setSaving(model);
    setError(null);
    try {
      await api.configSet(`providers.models.${data.provider}.model`, model);
      setData({ ...data, model });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        disabled={disabled || !canChoose}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-1 rounded-full px-3 text-sm text-ink-2 hover:bg-panel hover:text-ink disabled:hover:bg-transparent disabled:hover:text-ink-2"
      >
        {modelLabel(data.model)}
        {canChoose && (
          <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-72 overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-lg">
          <p className="border-b border-line px-4 py-2.5 text-xs leading-snug text-ink-2">
            The model for <span className="font-medium text-ink">{agentLabel(agent)}</span> everywhere it
            runs: here, in Telegram and in scheduled jobs.
          </p>
          <div
            role="listbox"
            tabIndex={-1}
            aria-label="Model"
            className="scroll-thin max-h-72 overflow-y-auto py-1"
          >
            {choices.map((m) => (
              <button
                key={m}
                type="button"
                role="option"
                aria-selected={m === data.model}
                disabled={saving !== null}
                onClick={() => choose(m)}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-panel"
              >
                <span className="min-w-0 flex-1">
                  <span className="block">{modelLabel(m)}</span>
                  <span className="block truncate font-mono text-[11px] text-ink-3">{m}</span>
                </span>
                {saving === m ? (
                  <LoaderCircle size={15} className="animate-spin text-ink-3" />
                ) : (
                  m === data.model && <Check size={16} className="text-accent" />
                )}
              </button>
            ))}
          </div>
          {error && (
            <p className="border-t border-line px-4 py-2 text-xs text-danger">Could not switch: {error}</p>
          )}
        </div>
      )}
    </div>
  );
}
