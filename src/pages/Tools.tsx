import { ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Empty, Loading, Note, Page } from "../components/ui";
import { api } from "../lib/api";
import type { Agent, Tool } from "../lib/types";

const BUILT_IN = "Built in";

type Group = { name: string; tools: Tool[]; connected: boolean; builtIn: boolean };

/** "instagram_shop" → "Instagram · shop". */
function serverLabel(name: string): string {
  const [head, ...rest] = name.split("_");
  const title = head.charAt(0).toUpperCase() + head.slice(1);
  return rest.length ? `${title} · ${rest.join(" ")}` : title;
}

export function Tools({ agents }: { agents: Agent[] }) {
  const [tools, setTools] = useState<Tool[] | null>(null);
  const [servers, setServers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const agent = agents.find((a) => a.alias === "assistant")?.alias ?? agents[0]?.alias;

  useEffect(() => {
    if (!agent) return;
    api
      .tools(agent)
      .then(setTools)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    // Without the list of configured servers a server that is down simply would not show.
    api
      .toolServers()
      .then(setServers)
      .catch(() => setServers([]));
  }, [agent]);

  const groups = useMemo(() => {
    const by = new Map<string, Tool[]>();
    for (const t of tools ?? []) {
      const i = t.name.indexOf("__");
      const server = i > 0 ? t.name.slice(0, i) : BUILT_IN;
      by.set(server, [...(by.get(server) ?? []), t]);
    }
    const names = [...new Set([...servers, ...by.keys()])].filter((n) => n !== BUILT_IN).sort();
    const out: Group[] = names.map((name) => ({
      name,
      tools: by.get(name) ?? [],
      connected: by.has(name),
      builtIn: false,
    }));
    if (by.has(BUILT_IN))
      out.push({ name: BUILT_IN, tools: by.get(BUILT_IN) ?? [], connected: true, builtIn: true });
    return out;
  }, [tools, servers]);

  const q = query.trim().toLowerCase();
  const shown = groups
    .map((g) => ({
      ...g,
      tools: q
        ? g.tools.filter((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
        : g.tools,
    }))
    .filter((g) => !q || g.tools.length > 0);
  const down = groups.filter((g) => !g.connected);

  return (
    <Page title="Tools" subtitle="What the assistant can use, and where each tool comes from.">
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
