// How the conversation is laid out: a run of tool calls is one block, so ten calls in a
// row read as one line ("Used 10 tools") instead of ten.
import type { Item } from "./types";

export type ToolItem = Extract<Item, { kind: "tool" }>;
export type Block =
  | { kind: "item"; id: string; item: Item }
  | { kind: "tools"; id: string; tools: ToolItem[] };

export function toBlocks(items: Item[]): Block[] {
  const blocks: Block[] = [];
  let run: ToolItem[] = [];
  const flush = () => {
    if (run.length === 1) blocks.push({ kind: "item", id: run[0].id, item: run[0] });
    else if (run.length > 1) blocks.push({ kind: "tools", id: run[0].id, tools: run });
    run = [];
  };
  for (const item of items) {
    if (item.kind === "tool") {
      run.push(item);
      continue;
    }
    flush();
    blocks.push({ kind: "item", id: item.id, item });
  }
  flush();
  return blocks;
}

/** "instagram__follow_user" → server "instagram", tool "follow user". */
export function toolName(name: string): { server: string | null; tool: string } {
  const i = name.indexOf("__");
  if (i <= 0) return { server: null, tool: name.replace(/_/g, " ") };
  return { server: name.slice(0, i).replace(/_/g, " "), tool: name.slice(i + 2).replace(/_/g, " ") };
}

/** "cron list, memory recall and 2 more" */
export function summarizeTools(tools: ToolItem[]): string {
  const names = [...new Set(tools.map((t) => toolName(t.name).tool))];
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}
