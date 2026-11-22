import { describe, expect, it } from "vitest";
import { readableText, splitModelText } from "./protocol";

describe("splitModelText", () => {
  it("leaves ordinary prose, HTML-looking text and code alone", () => {
    const text = 'Use <b>bold</b> and `x_y`.\n\n```html\n<div class="a_b">hi</div>\n```';
    expect(splitModelText(text)).toEqual([{ kind: "text", text }]);
  });

  it("reads ZeroClaw's own calls in an answer, and its results in text ZeroClaw wrote", () => {
    expect(
      splitModelText('Checking.\n<tool_call>\n{"name": "cron_list", "arguments": {"a": 1}}\n</tool_call>'),
    ).toEqual([
      { kind: "text", text: "Checking." },
      { kind: "call", name: "cron_list", args: { a: 1 } },
    ]);
    expect(
      splitModelText(
        '[Tool results]\n[Tool attachments: 0]\n<tool_result name="cron_list">\n[]\n</tool_result>',
        "zeroclaw",
      ),
    ).toEqual([{ kind: "result", name: "cron_list", output: "[]" }]);
  });

  it("marks a call in the <invoke> dialect as never run: ZeroClaw does not parse it", () => {
    const parts = splitModelText(
      '<function_calls>\n<invoke name="securitybot__findings">\n<parameter name="state">awaiting_approval</parameter>\n<parameter name="limit">100</parameter>\n</invoke>\n</function_calls>',
    );
    expect(parts).toEqual([{ kind: "unrun", what: "call", name: "securitybot__findings" }]);
  });

  it("marks a made-up call and a made-up result as never run, and drops echoed settings (seen in a real chat)", () => {
    const parts = splitModelText(
      "<cron_list>\n</cron_list>\n\n<tool_result>\n[]\n</tool_result>\n\n<reasoning_effort>10</reasoning_effort>\n\n<thinking_mode>interactive</thinking_mode>\n\nThere are no cron jobs set up right now.",
    );
    expect(parts).toEqual([
      { kind: "unrun", what: "call", name: "cron_list" },
      { kind: "unrun", what: "result", name: null },
      { kind: "text", text: "There are no cron jobs set up right now." },
    ]);
  });

  it("treats a result the model wrote after its own call as made up, even closed with the wrong tag", () => {
    const parts = splitModelText(
      '<tool_call>{"name":"securitybot__report","arguments":{"id":471}}</tool_call>\n\n<tool_result>\n{"id":471,"result":"sent"}\n</tool_call>\n3 approved.',
    );
    expect(parts).toEqual([
      { kind: "call", name: "securitybot__report", args: { id: 471 } },
      { kind: "unrun", what: "result", name: null },
      { kind: "text", text: "3 approved." },
    ]);
  });

  it("drops a protocol tag left on its own", () => {
    expect(splitModelText("Done.\n</invoke>\n<tool_call>\nNext.")).toEqual([
      { kind: "text", text: "Done." },
      { kind: "text", text: "Next." },
    ]);
  });

  it("does not take a tag with prose inside for a tool call", () => {
    const text = "<my_note>remember the milk</my_note>";
    expect(splitModelText(text)).toEqual([{ kind: "text", text }]);
  });

  it("drops the fence marks left around a fenced call", () => {
    expect(splitModelText('```json\n<tool_call>{"name":"a","arguments":{}}</tool_call>\n```')).toEqual([
      { kind: "call", name: "a", args: {} },
    ]);
  });

  it("never lets an unclosed result swallow the rest of an answer, but reads it where text can be cut off", () => {
    const text = 'Done.\n<tool_result name="big">\n{"rows": [1, 2';
    // in an answer only the stray tag goes; what follows it stays readable
    expect(splitModelText(text)).toEqual([
      { kind: "text", text: "Done." },
      { kind: "text", text: '{"rows": [1, 2' },
    ]);
    expect(splitModelText(text, "zeroclaw")).toEqual([
      { kind: "text", text: "Done." },
      { kind: "result", name: "big", output: '{"rows": [1, 2' },
    ]);
  });

  it("keeps a call whose JSON is broken, so it is not lost", () => {
    expect(splitModelText("<tool_call>not json</tool_call>")).toEqual([
      { kind: "call", name: "tool", args: "not json" },
    ]);
  });
});

describe("readableText", () => {
  it("is what a person should see while an answer streams in", () => {
    expect(readableText('Let me look.\n<tool_call>{"name":"a","arguments":{}}</tool_call>\nFound it.')).toBe(
      "Let me look.\n\nFound it.",
    );
    expect(readableText("<reasoning_effort>10</reasoning_effort>")).toBe("");
  });

  it("never trusts Anthropic's result block, whole or cut off", () => {
    const text =
      '<invoke name="upwork__find_jobs">\n<parameter name="q">go</parameter>\n</invoke>\n\n<function_results>\n<result name="upwork__find_jobs">\n{"jobs":[]}\n</result>\n</function_results>\n\nNo jobs today.';
    expect(splitModelText(text, "zeroclaw")).toEqual([
      { kind: "unrun", what: "call", name: "upwork__find_jobs" },
      { kind: "unrun", what: "result", name: "upwork__find_jobs" },
      { kind: "text", text: "No jobs today." },
    ]);
    const cut = '<function_results>\n<result name="x">\n{"jobs":[{"id":1},';
    expect(splitModelText(cut, "zeroclaw")).toEqual([{ kind: "unrun", what: "result", name: "x" }]);
    // an answer is never cut, so an unclosed block does not swallow what follows
    expect(splitModelText("<function_results>\nand then prose").at(-1)).toEqual({
      kind: "text",
      text: "and then prose",
    });
  });
});
