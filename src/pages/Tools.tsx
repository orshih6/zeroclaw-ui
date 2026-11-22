import { ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Empty, Loading, Note, Page } from "../components/ui";
import { agentLabel } from "../lib/format";
import { type ToolGroup, loadToolGroups, serverLabel } from "../lib/toolServers";
import type { Agent } from "../lib/types";

export function Tools({ agents }: { agents: Agent[] }) {
  const [groups, setGroups] = useState<ToolGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const aliases = useMemo(
    () =>
      agents
        .filter((a) => a.enabled !== false)
        .map((a) => a.alias)
        .join(","),
    [agents],
  );

  useEffect(() => {
    if (!aliases) return;
    loadToolGroups(aliases.split(","))
      .then(setGroups)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [aliases]);

  const tools = groups;
  const all = groups ?? [];
  const everyone = aliases ? aliases.split(",").length : 0;
  const q = query.trim().toLowerCase();
  const shown = all
    .map((g) => ({
      ...g,
      tools: q
        ? g.tools.filter((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
        : g.tools,
    }))
    .filter((g) => !q || g.tools.length > 0);
  const down = all.filter((g) => !g.connected);

  return (
    <Page title="Tools" subtitle="What your agents can use, and where each tool comes from.">
      <div className="relative mt-5">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tools"
          aria-label="Search tools"
          className="w-full rounded-xl border border-line-strong bg-surface py-2 pl-9 pr-3 outline-none focus:border-accent"
        />
      </div>

      {error && <Note className="mt-4">Could not load the tools: {error}</Note>}
      {!tools && !error && <Loading what="tools" shape="rows" rows={6} />}
      {tools && down.length > 0 && !q && (
        <Note tone="warn" className="mt-4">
          {down.length === 1 ? "One tool server is" : `${down.length} tool servers are`} not answering:{" "}
          {down.map((g) => serverLabel(g.name)).join(", ")}. Their tools are missing until they are back.
        </Note>
      )}
      {tools && shown.length === 0 && (
        <div className="mt-6">
          <Empty>No tool matches “{query}”.</Empty>
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {shown.map((g) => {
          const expanded = q !== "" || open === g.name;
          return (
            <li key={g.name} className="rounded-2xl border border-line bg-surface">
              <button
                type="button"
                onClick={() => setOpen(open === g.name ? null : g.name)}
                aria-expanded={expanded}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${g.connected ? "bg-accent" : "bg-danger"}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{g.builtIn ? g.name : serverLabel(g.name)}</span>
                  <span className="ml-2 text-sm text-ink-3">
                    {g.connected
                      ? `${g.tools.length} ${g.tools.length === 1 ? "tool" : "tools"}`
                      : "Not answering"}
                    {g.connected && g.agents.length === 1 && everyone > 1 && (
                      <> · only {g.agents.map(agentLabel).join(", ")}</>
                    )}
                  </span>
                </span>
                <ChevronRight
                  size={16}
                  className={`shrink-0 text-ink-3 transition-transform ${expanded ? "rotate-90" : ""}`}
                />
              </button>
              {expanded && g.tools.length > 0 && (
                <ul className="divide-y divide-line border-t border-line">
                  {g.tools.map((t) => (
                    <li key={t.name} className="px-4 py-2.5">
                      <p className="font-mono text-[13px]">
                        {g.builtIn ? t.name : t.name.slice(g.name.length + 2)}
                      </p>
                      <p className="mt-0.5 line-clamp-3 text-sm text-ink-2">{t.description}</p>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </Page>
  );
}
