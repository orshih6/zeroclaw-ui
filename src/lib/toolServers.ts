// Which tool servers there are, which agents can use each, and which are not answering.
// An agent only sees its own bundle (Upwork's tools belong to the upwork agent alone), so
// a server counts as down only when no agent at all has its tools. Asking one agent made
// every server of another agent look broken.
import { api } from "./api";
import type { Tool } from "./types";

export const BUILT_IN = "Built in";

export type ToolGroup = {
  name: string;
  tools: Tool[];
  connected: boolean;
  builtIn: boolean;
  /** The agents that can use it; empty when it is down. */
  agents: string[];
};

export function groupTools(byAgent: Record<string, Tool[]>, servers: string[]): ToolGroup[] {
  const tools = new Map<string, Map<string, Tool>>();
  const users = new Map<string, Set<string>>();
  for (const [agent, list] of Object.entries(byAgent)) {
    for (const t of list) {
      const i = t.name.indexOf("__");
      const server = i > 0 ? t.name.slice(0, i) : BUILT_IN;
      if (!tools.has(server)) tools.set(server, new Map());
      tools.get(server)?.set(t.name, t);
      if (!users.has(server)) users.set(server, new Set());
      users.get(server)?.add(agent);
    }
  }
  const group = (name: string): ToolGroup => ({
    name,
    tools: [...(tools.get(name)?.values() ?? [])],
    connected: tools.has(name),
    builtIn: name === BUILT_IN,
    agents: [...(users.get(name) ?? [])],
  });
  const names = [...new Set([...servers, ...tools.keys()])].filter((n) => n !== BUILT_IN).sort();
  const out = names.map(group);
  if (tools.has(BUILT_IN)) out.push(group(BUILT_IN));
  return out;
}

export async function loadToolGroups(agents: string[]): Promise<ToolGroup[]> {
  const [lists, servers] = await Promise.all([
    Promise.all(agents.map((a) => api.tools(a).then((t) => [a, t] as const))),
    // Without the list of configured servers a server that is down simply would not show.
    api
      .toolServers()
      .catch(() => [] as string[]),
  ]);
  return groupTools(Object.fromEntries(lists), servers);
}

/** "instagram_shop" → "Instagram · shop". */
export function serverLabel(name: string): string {
  const [head, ...rest] = name.split("_");
  const title = head.charAt(0).toUpperCase() + head.slice(1);
  return rest.length ? `${title} · ${rest.join(" ")}` : title;
}
