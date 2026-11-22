import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Markdown } from "../components/Markdown";
import { Button, Confirm, Empty, IconButton, Loading, Modal, Note, Page, fieldClass } from "../components/ui";
import { api } from "../lib/api";
import { agentLabel, shortDate } from "../lib/format";
import type { Agent, MemoryEntry } from "../lib/types";

const CATEGORY_LABEL: Record<string, string> = {
  core: "Facts it keeps",
  daily: "Daily notes",
  conversation: "From conversations",
};
const ORDER = ["core", "daily", "conversation"];

type Draft = { key: string; content: string; category: string; agent: string; existing: boolean };

function Editor({
  draft,
  agents,
  onClose,
  onSaved,
}: {
  draft: Draft;
  agents: Agent[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState(draft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = d.key.trim() !== "" && d.content.trim() !== "";

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.memorySave(d.key.trim(), d.content.trim(), d.category, d.agent);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={d.existing ? "Edit memory" : "New memory"}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!valid} busy={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Agent
          <select
            value={d.agent}
            disabled={d.existing}
            onChange={(e) => setD({ ...d, agent: e.target.value })}
            className={fieldClass}
          >
            {agents.map((a) => (
              <option key={a.alias} value={a.alias}>
                {agentLabel(a.alias)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Kind
          <select
            value={d.category}
            onChange={(e) => setD({ ...d, category: e.target.value })}
            className={fieldClass}
          >
            {!ORDER.includes(d.category) && <option value={d.category}>{d.category}</option>}
            {ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-4 block text-sm font-medium">
        Name
        <input
          value={d.key}
          disabled={d.existing}
          onChange={(e) => setD({ ...d, key: e.target.value })}
          spellCheck={false}
          placeholder="for example: preferred_language"
          className={`${fieldClass} font-mono text-[14px]`}
        />
      </label>
      <label className="mt-4 block text-sm font-medium">
        What to remember
        <textarea
          value={d.content}
          onChange={(e) => setD({ ...d, content: e.target.value })}
          rows={8}
          className={`${fieldClass} scroll-thin resize-y leading-relaxed`}
        />
      </label>
      {error && <Note className="mt-4">Could not save: {error}</Note>}
    </Modal>
  );
}

export function Memory({ agents }: { agents: Agent[] }) {
  const [entries, setEntries] = useState<MemoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState("");
  const [category, setCategory] = useState("core");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const defaultAgent = agents[0]?.alias ?? "assistant";

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(() => {
    api
      .memory({ query: search || undefined, agent: agent || undefined })
      .then((e) => {
        setEntries(e);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [search, agent]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of entries ?? []) c[e.category] = (c[e.category] ?? 0) + 1;
    return c;
  }, [entries]);
  const categories = useMemo(
    () => [...ORDER, ...Object.keys(counts).filter((c) => !ORDER.includes(c))],
    [counts],
  );
  const shown = useMemo(
    () =>
      (entries ?? [])
        .filter((e) => e.category === category)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [entries, category],
  );

  function remove(e: MemoryEntry) {
    setConfirm(null);
    api
      .memoryDelete(e.key, e.agent_alias)
      .then(load)
      .catch((err) => setError(`Could not delete: ${err instanceof Error ? err.message : String(err)}`));
  }

  return (
    <Page
      title="Memory"
      subtitle="What ZeroClaw keeps between conversations."
      action={
        <Button
          variant="primary"
          onClick={() =>
            setEditing({
              key: "",
              content: "",
              category: "core",
              agent: agent || defaultAgent,
              existing: false,
            })
          }
        >
          <Plus size={16} /> Add
        </Button>
      }
    >
      <div className="mt-5 flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search memory"
            aria-label="Search memory"
            className="w-full rounded-xl border border-line-strong bg-surface py-2 pl-9 pr-3 outline-none focus:border-accent"
          />
        </div>
        <select
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
          aria-label="Agent"
          className="field rounded-xl border border-line-strong bg-surface px-3 py-2 outline-none focus:border-accent"
        >
          <option value="">All agents</option>
          {agents.map((a) => (
            <option key={a.alias} value={a.alias}>
              {agentLabel(a.alias)}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Kind of memory">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={c === category}
            onClick={() => setCategory(c)}
            className={`rounded-full border px-3 py-1 text-sm ${
              c === category
                ? "border-accent bg-accent-soft text-ink"
                : "border-line text-ink-2 hover:border-line-strong"
            }`}
          >
            {CATEGORY_LABEL[c] ?? c}
            {/* no count until it is known: "0" while loading would be a wrong answer */}
            {entries && <span className="ml-1.5 text-xs tabular-nums text-ink-3">{counts[c] ?? 0}</span>}
          </button>
        ))}
      </div>

      {error && <Note className="mt-4">{error}</Note>}
      {!entries && !error && <Loading what="memory" rows={4} />}
      {entries && shown.length === 0 && (
        <div className="mt-6">
          <Empty>{search ? `Nothing here matches “${search}”.` : "Nothing saved here yet."}</Empty>
        </div>
      )}

      <ul className="mt-4 space-y-2.5">
        {shown.map((e) => (
          <li key={e.id} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="scroll-thin max-h-72 overflow-y-auto text-[0.95rem]">
                  <Markdown text={e.content} />
                </div>
                <p className="mt-2 text-xs text-ink-3">
                  {shortDate(e.timestamp)}
                  {e.agent_alias && ` · ${agentLabel(e.agent_alias)}`}
                </p>
              </div>
              <div className="-mr-1.5 -mt-1.5 flex shrink-0">
                <IconButton
                  label="Edit"
                  onClick={() =>
                    setEditing({
                      key: e.key,
                      content: e.content,
                      category: e.category,
                      agent: e.agent_alias ?? defaultAgent,
                      existing: true,
                    })
                  }
                >
                  <Pencil size={15} />
                </IconButton>
                <IconButton
                  label="Delete"
                  onClick={() => setConfirm(e.id)}
                  className="hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>
            </div>
            {confirm === e.id && (
              <div className="mt-3 border-t border-line pt-3">
                <Confirm
                  question="Forget this?"
                  yes="Forget"
                  no="Keep"
                  onYes={() => remove(e)}
                  onNo={() => setConfirm(null)}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      {editing && (
        <Editor
          draft={editing}
          agents={agents}
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
