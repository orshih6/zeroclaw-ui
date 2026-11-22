import { describe, expect, it } from "vitest";
import { groupTools } from "./toolServers";

const tool = (name: string) => ({ name, description: "" });

describe("groupTools", () => {
  it("counts a server as up when any agent has its tools", () => {
    const groups = groupTools(
      {
        assistant: [tool("kube__pods_list"), tool("shell")],
        upwork: [tool("upwork__find_jobs"), tool("shell")],
      },
      ["kube", "upwork", "threads"],
    );
    expect(groups.map((g) => [g.name, g.connected, g.agents])).toEqual([
      ["kube", true, ["assistant"]],
      ["threads", false, []],
      ["upwork", true, ["upwork"]],
      ["Built in", true, ["assistant", "upwork"]],
    ]);
    expect(groups.at(-1)?.tools).toHaveLength(1);
  });
});
