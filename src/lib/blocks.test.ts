import { describe, expect, it } from "vitest";
import { summarizeTools, toBlocks, toolName } from "./blocks";
import type { Item } from "./types";

const tool = (id: string, name: string): Item => ({ id, kind: "tool", name, args: {}, pending: false });
const say = (id: string): Item => ({ id, kind: "assistant", text: "x" });

describe("toBlocks", () => {
  it("groups a run of tool calls and leaves a single call alone", () => {
    const blocks = toBlocks([tool("a", "x"), tool("b", "y"), say("c"), tool("d", "z"), say("e")]);
    expect(blocks.map((b) => (b.kind === "tools" ? `tools:${b.tools.length}` : b.item.kind))).toEqual([
      "tools:2",
      "assistant",
      "tool",
      "assistant",
    ]);
  });

  it("keeps a stable id for a group while it grows", () => {
    const one = toBlocks([tool("a", "x"), tool("b", "y")]);
    const two = toBlocks([tool("a", "x"), tool("b", "y"), tool("c", "z")]);
    expect(one[0].id).toBe(two[0].id);
  });
});

describe("tool names", () => {
  it("splits the server from the tool", () => {
    expect(toolName("instagram_shop__follow_user")).toEqual({
      server: "instagram shop",
      tool: "follow user",
    });
    expect(toolName("cron_list")).toEqual({ server: null, tool: "cron list" });
  });

  it("summarises a group without repeating names", () => {
    const t = (n: string) => tool(n, n) as Extract<Item, { kind: "tool" }>;
    expect(summarizeTools([t("cron_list"), t("cron_list")])).toBe("cron list");
    expect(summarizeTools([t("a"), t("b"), t("c"), t("d")])).toBe("a, b and 2 more");
  });
});
