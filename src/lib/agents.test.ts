import { describe, expect, it } from "vitest";
import { actionLabel, firstLine, parseList } from "./agents";

describe("parseList", () => {
  it("reads the JSON text ZeroClaw returns for a list setting", () => {
    expect(parseList('["telegram.home"]')).toEqual(["telegram.home"]);
    expect(parseList("")).toEqual([]);
    expect(parseList("<unset>")).toEqual([]);
    expect(parseList('"not a list"')).toEqual([]);
  });
});

describe("firstLine", () => {
  it("shows the first real sentence, not the file's own title", () => {
    expect(firstLine("\n# SOUL.md — Who You Are\n\n*You are not a chatbot.*\n")).toBe(
      "You are not a chatbot.",
    );
    expect(firstLine("# USER.md\n\n- **Name:** Ori")).toBe("Name: Ori");
  });

  it("falls back to the title when there is nothing else", () => {
    expect(firstLine("# Only a title\n\n")).toBe("Only a title");
    expect(firstLine("\n\n")).toBe("");
  });
});

describe("actionLabel", () => {
  it("puts the action first and the place second", () => {
    expect(actionLabel("kube__pods_delete")).toEqual({ action: "Pods delete", where: "Kube" });
    expect(actionLabel("instagram_shop__publish_post")).toEqual({
      action: "Publish post",
      where: "Instagram · shop",
    });
    expect(actionLabel("shell")).toEqual({ action: "Shell", where: null });
  });
});
