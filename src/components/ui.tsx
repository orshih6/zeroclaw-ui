// The few building blocks every page shares, so buttons, fields and dialogs look and
// behave the same everywhere.
import { LoaderCircle, X } from "lucide-react";
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef, useState } from "react";

export const fieldClass =
  "field mt-1.5 w-full rounded-xl border border-line-strong bg-surface px-3 py-2 outline-none focus:border-accent disabled:opacity-60";

type Variant = "primary" | "secondary" | "danger" | "danger-quiet";
const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:opacity-90",
  secondary: "border border-line-strong bg-surface hover:bg-panel",
  danger: "bg-danger text-white hover:opacity-90",
  "danger-quiet": "border border-line-strong bg-surface text-danger hover:bg-danger-soft",
};

export function Button({
  variant = "secondary",
  small,
  busy,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; small?: boolean; busy?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 font-medium transition-opacity disabled:opacity-40 ${
        small ? "rounded-lg px-3 py-1.5 text-sm" : "rounded-xl px-4 py-2 text-sm"
      } ${VARIANT[variant]} ${className}`}
    >
      {busy && <LoaderCircle size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...rest}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-line/60 hover:text-ink disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

/** A page with a title, a one-line explanation and an optional main action. */
export function Page({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="appear mx-auto max-w-3xl px-4 py-6 md:py-10">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-[1.7rem] leading-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
          </div>
          {action}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-ink-2">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Note({
  tone = "error",
  children,
  className = "",
}: {
  tone?: "error" | "info" | "warn";
  children: ReactNode;
  className?: string;
}) {
  const color =
    tone === "error"
      ? "bg-danger-soft text-danger"
      : tone === "warn"
        ? "bg-warn-soft text-warn"
        : "bg-accent-soft text-ink";
  return (
    <p
      className={`rounded-xl px-4 py-3 text-sm ${color} ${className}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-line-strong px-5 py-8 text-center text-ink-2">
      {children}
    </p>
  );
}

/** True once `ms` have passed. A wait shorter than that shows nothing, so quick loads do not flash. */
export function useDelayed(ms = 180): boolean {
  const [late, setLate] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLate(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return late;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

// Varied so a column of placeholders reads as text, not as a striped block.
const WIDTHS = ["w-3/5", "w-2/5", "w-1/2", "w-2/3", "w-1/3", "w-3/4"];

type Shape = "cards" | "rows" | "chips" | "text" | "field";

/**
 * A placeholder in the shape of what is loading, so the page does not jump when the real
 * thing arrives. `what` is read out to screen readers ("Loading jobs").
 */
export function Loading({ what, shape = "cards", rows = 3 }: { what: string; shape?: Shape; rows?: number }) {
  const late = useDelayed();
  const n = Array.from({ length: rows }, (_, i) => i);
  return (
    <div role="status" aria-busy="true" className={`mt-5 ${late ? "appear" : "invisible"}`}>
      <span className="sr-only">Loading {what}</span>
      {shape === "cards" && (
        <div className="space-y-2.5">
          {n.map((i) => (
            <div key={i} className="rounded-2xl border border-line bg-surface p-4">
              <Skeleton className={`h-4 ${WIDTHS[i % WIDTHS.length]}`} />
              <Skeleton className={`mt-2.5 h-3 ${WIDTHS[(i + 3) % WIDTHS.length]}`} />
            </div>
          ))}
        </div>
      )}
      {shape === "rows" && (
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {n.map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <Skeleton className={`h-4 ${WIDTHS[(i + 4) % WIDTHS.length]}`} />
                <Skeleton className={`mt-2 h-3 ${WIDTHS[(i + 1) % WIDTHS.length]}`} />
              </div>
            </div>
          ))}
        </div>
      )}
      {shape === "chips" && (
        <div className="flex flex-wrap gap-2">
          {n.map((i) => (
            <Skeleton
              key={i}
              className={`h-8 rounded-full ${["w-40", "w-32", "w-44", "w-28", "w-36"][i % 5]}`}
            />
          ))}
        </div>
      )}
      {shape === "text" && (
        <div className="space-y-2.5">
          {n.map((i) => (
            <Skeleton
              key={i}
              className={`h-3.5 ${i === rows - 1 ? "w-2/5" : i % 2 ? "w-11/12" : "w-full"}`}
            />
          ))}
        </div>
      )}
      {shape === "field" && <Skeleton className="h-10 w-full max-w-sm rounded-xl" />}
    </div>
  );
}

/** A dialog: a sheet from the bottom on a phone, a centred card on a larger screen. */
export function Modal({
  title,
  onClose,
  onSubmit,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  onSubmit?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** For long text: more room to read and write. */
  wide?: boolean;
}) {
  const box = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const first = box.current?.querySelector<HTMLElement>("input:not([disabled]), textarea, select");
    first?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
        className={`scroll-thin max-h-full w-full overflow-y-auto rounded-t-3xl bg-bg p-5 shadow-xl sm:rounded-3xl ${wide ? "max-w-3xl" : "max-w-xl"}`}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        {children}
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </form>
    </div>
  );
}

/** "Are you sure?" shown in place, next to the thing it is about. */
export function Confirm({
  question,
  yes,
  no = "Cancel",
  onYes,
  onNo,
}: {
  question: string;
  yes: string;
  no?: string;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      {question}
      <Button small variant="danger" onClick={onYes}>
        {yes}
      </Button>
      <Button small onClick={onNo}>
        {no}
      </Button>
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      className="inline-flex rounded-xl border border-line bg-panel p-0.5"
      role="radiogroup"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-[10px] px-3 py-1 text-sm ${
            o.value === value ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-2 hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
