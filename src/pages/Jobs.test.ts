import { describe, expect, it } from "vitest";
import { runPreview } from "./Jobs";

describe("runPreview", () => {
  it("shows the first sentence of what the run said", () => {
    expect(runPreview("• #605 · `repo/name` · high · something\n• #604 · other")).toBe(
      "#605 · repo/name · high · something",
    );
    expect(runPreview("**State:** limited, budget nearly used")).toBe("State: limited, budget nearly used");
  });

  it("says so when the job had nothing to report", () => {
    expect(runPreview("NO_REPLY")).toBe("Nothing new");
    expect(runPreview(" no_reply \n")).toBe("Nothing new");
  });

  it("prefers the final answer over text written before the tools ran", () => {
    expect(
      runPreview(
        'Checking.\n<tool_call>{"name":"a","arguments":{}}</tool_call>\n<tool_result name="a">\nx\n</tool_result>\nTwo new findings.',
      ),
    ).toBe("Two new findings.");
  });

  it("explains a run that only used tools, and stays empty for no output", () => {
    expect(runPreview('<tool_call>{"name":"a","arguments":{}}</tool_call>')).toBe(
      "Used its tools, wrote no summary",
    );
    expect(runPreview(null)).toBe("");
  });
});
