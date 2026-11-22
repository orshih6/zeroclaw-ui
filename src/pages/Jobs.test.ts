import { describe, expect, it } from "vitest";
import { jobTitles, runConcern, runPreview } from "./Jobs";

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

describe("runConcern", () => {
  it("flags a run that did nothing real", () => {
    const invented =
      '<invoke name="upwork__find_jobs">\n<parameter name="q">go</parameter>\n</invoke>\n\n<function_results>\n<result name="upwork__find_jobs">\n{"jobs":[],';
    expect(runConcern(invented)).toBe("Nothing was run");
    expect(runPreview(invented)).toBe("Wrote its tool calls as text, so nothing was run");
    expect(runConcern('<tool_call>{"name":"a","arguments":{}}</tool_call>')).toBe("No summary");
    // made-up calls, then "nothing new": the silence means nothing either
    expect(runConcern(`${invented}\n</result>\n</function_results>\n\nNO_REPLY`)).toBe("Nothing was run");
    expect(runPreview(`${invented}\n</result>\n</function_results>\n\nNO_REPLY`)).toBe(
      "Wrote its tool calls as text, so nothing was run",
    );
  });

  it("flags a run that says it could not do its work, and leaves good ones alone", () => {
    expect(runConcern("**Followed:** 0. The round didn't run because the tools aren't available.")).toBe(
      "May need a look",
    );
    expect(runConcern("Two new findings, both high.")).toBeNull();
    expect(runConcern("NO_REPLY")).toBeNull();
    expect(runConcern(null)).toBeNull();
  });
});

describe("jobTitles", () => {
  it("adds the time only to jobs that would read the same", () => {
    const job = (id: string, prompt: string, expression: string) => ({
      id,
      name: null,
      job_type: "agent",
      prompt,
      command: "",
      expression,
      schedule: { kind: "cron", expr: expression },
    });
    const titles = jobTitles([
      job("a", "Follow round for Wait What. Do it.", "30 19 * * *"),
      job("b", "Follow round for Wait What. Other rules.", "30 11 * * *"),
      job("c", "Morning brief. Short.", "0 9 * * *"),
    ]);
    expect([...titles.values()]).toEqual([
      "Follow round for Wait What · 19:30",
      "Follow round for Wait What · 11:30",
      "Morning brief",
    ]);
  });
});
