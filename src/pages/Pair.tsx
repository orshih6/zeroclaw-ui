import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { pair } from "../lib/api";

export function Pair({ onPaired }: { onPaired: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await pair(code);
      onPaired();
    } catch (err) {
      const status = (err as { status?: number }).status;
      setError(
        status === 429
          ? "Too many tries. Wait a minute, then use a new code."
          : status && status < 500
            ? "That code was not accepted. Codes work once and expire after a few minutes."
            : "Could not reach ZeroClaw. Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center px-5 py-10">
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent font-serif text-xl font-semibold text-accent-ink">
            Z
          </span>
          <span className="font-serif text-2xl">ZeroClaw</span>
        </div>
        <h1 className="font-serif text-[1.7rem] leading-tight">Pair this browser</h1>
        <p className="mt-2 text-ink-2">
          Enter a one-time pairing code. To get one, run this where ZeroClaw runs:
        </p>
        <pre className="scroll-thin mt-3 overflow-x-auto rounded-xl border border-line bg-code px-3 py-2.5 font-mono text-[12px] leading-relaxed text-ink-2">
          zeroclaw gateway get-paircode --new
        </pre>
        <label htmlFor="code" className="mt-5 block text-sm font-medium">
          Pairing code
        </label>
        <input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="one-time-code"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="mt-1.5 w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 font-mono text-[15px] outline-none focus:border-accent"
        />
        {error && (
          <p className="mt-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={!code.trim() || busy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 font-medium text-accent-ink hover:opacity-90 disabled:opacity-40"
        >
          {busy && <LoaderCircle size={16} className="animate-spin" />}
          Pair
        </button>
        <p className="mt-4 text-xs text-ink-3">
          Pairing gives this browser full access to your agent, including approving its actions.
        </p>
      </form>
    </main>
  );
}
