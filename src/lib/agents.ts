// What an agent is, read from ZeroClaw's config, in the words the Agents page uses.
import { api } from "./api";

export type AgentInfo = {
  alias: string;
  enabled: boolean;
  /** Config name of the model provider, e.g. "anthropic.claude". */
  provider: string;
  model: string;
  /** Channels it answers on, e.g. ["telegram.home"]. */
  channels: string[];
  /** Name of the approval rule set it uses; several agents can share one. */
  riskProfile: string;
};

/** Config lists arrive as JSON text ("[\"a\", \"b\"]"); anything else means "none". */
export function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function loadAgent(alias: string): Promise<AgentInfo> {
  const cfg = await api.configList(`agents.${alias}`);
  const get = (key: string) => cfg.get(`agents.${alias}.${key}`) ?? "";
  const provider = get("model_provider");
  const model = provider
    ? String(await api.configGet(`providers.models.${provider}.model`).catch(() => ""))
    : "";
  return {
    alias,
    enabled: get("enabled") !== "false",
    provider,
    model,
    channels: parseList(get("channels")),
    riskProfile: get("risk_profile"),
  };
}

/** The instruction files, in the order and words a person would think of them. */
export const INSTRUCTIONS: { file: string; title: string; hint: string; primary: boolean }[] = [
  {
    file: "USER.md",
    title: "About you",
    hint: "What it should know about you: who you are, what you do, how you like things.",
    primary: true,
  },
  {
    file: "AGENTS.md",
    title: "How it should work",
    hint: "Its rules: how to reply, what to do first, what never to do.",
    primary: true,
  },
  { file: "SOUL.md", title: "Personality", hint: "Its character and tone of voice.", primary: true },
  {
    file: "IDENTITY.md",
    title: "Name and identity",
    hint: "What it is called and how it presents itself.",
    primary: false,
  },
  {
    file: "TOOLS.md",
    title: "Notes about tools",
    hint: "Things about your setup that help it use its tools well.",
    primary: false,
  },
  {
    file: "HEARTBEAT.md",
    title: "Routine checks",
    hint: "What it looks at when it wakes up by itself.",
    primary: false,
  },
  {
    file: "MEMORY.md",
    title: "Always remembered",
    hint: "Long-term notes it reads at the start of every conversation.",
    primary: false,
  },
];

/** A one-line preview: the first sentence of real text, past the file's own headings. */
export function firstLine(content: string): string {
  let heading = "";
  for (const raw of content.split("\n")) {
    const isHeading = /^\s*#{1,6}\s/.test(raw);
    const line = raw
      // heading marks need a space after them: "#605" is an id, not a heading
      .replace(/^(?:#{1,6}\s+|[>*\-•·\s])+/, "")
      .replace(/[*_`]/g, "")
      .trim();
    if (!line || /^-+$/.test(line)) continue;
    if (!isHeading) return line;
    heading ||= line;
  }
  return heading;
}

/** "kube__pods_delete" → "Delete pods · Kube": the action first, then where it happens. */
export function actionLabel(tool: string): { action: string; where: string | null } {
  const i = tool.indexOf("__");
  const server = i > 0 ? tool.slice(0, i) : null;
  const words = (i > 0 ? tool.slice(i + 2) : tool).split("_").filter(Boolean);
  const text = words.join(" ");
  const action = text.charAt(0).toUpperCase() + text.slice(1);
  const where = server
    ? server
        .split("_")
        .map((w, n) => (n === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
        .join(" · ")
    : null;
  return { action, where };
}
