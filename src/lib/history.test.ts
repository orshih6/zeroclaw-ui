import { describe, expect, it } from "vitest";
import {
  cleanUserText,
  isGreeting,
  parseHistory,
  parseTranscript,
  splitImages,
  titleFrom,
  titleFromItems,
} from "./history";

describe("parseHistory", () => {
  it("turns stored rows into user, tool and assistant items", () => {
    const items = parseHistory([
      { role: "user", content: "[CURRENT DATE & TIME: 2026-11-21 16:37:18 +00:00]\n\nHow many jobs?" },
      { role: "assistant", content: '<tool_call>\n{"name": "cron_list", "arguments": {}}\n</tool_call>' },
      {
        role: "user",
        content:
          '[Tool results]\n[Tool attachments: 0]\n<tool_result name="cron_list">\n[1, 2]\n</tool_result>',
      },
      { role: "assistant", content: "There are **2** jobs." },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["user", "tool", "assistant"]);
    expect(items[0]).toMatchObject({ kind: "user", text: "How many jobs?" });
    expect(items[1]).toMatchObject({ kind: "tool", name: "cron_list", output: "[1, 2]", pending: false });
    expect(items[2]).toMatchObject({ kind: "assistant", text: "There are **2** jobs." });
  });

  it("keeps text written around a tool call and pairs results by name in order", () => {
    const items = parseHistory([
      {
        role: "assistant",
        content:
          'Checking.\n<tool_call>{"name":"a","arguments":{"x":1}}</tool_call>\n<tool_call>{"name":"a","arguments":{"x":2}}</tool_call>',
      },
      {
        role: "user",
        content:
          '[Tool results]\n<tool_result name="a">\nfirst\n</tool_result>\n<tool_result name="a">\nsecond\n</tool_result>',
      },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["assistant", "tool", "tool"]);
    expect(items[1]).toMatchObject({ args: { x: 1 }, output: "first" });
    expect(items[2]).toMatchObject({ args: { x: 2 }, output: "second" });
  });

  it("does not leave an unanswered call pending", () => {
    const items = parseHistory([
      { role: "assistant", content: '<tool_call>{"name":"a","arguments":{}}</tool_call>' },
    ]);
    expect(items[0]).toMatchObject({ kind: "tool", pending: false });
  });

  it("turns the dropped-turns placeholder into a note, not a user message", () => {
    const items = parseHistory([
      { role: "user", content: "[earlier turns omitted to fit the context window]" },
      { role: "user", content: "hello" },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["notice", "user"]);
  });

  it("drops the code-fence marks a model sometimes puts around its tool call", () => {
    const items = parseHistory([
      { role: "assistant", content: '```json\n<tool_call>\n{"name":"a","arguments":{}}\n</tool_call>\n```' },
      { role: "assistant", content: "Real code stays:\n```\nls\n```" },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["tool", "assistant"]);
  });

  it("shows a call whose JSON is broken instead of dropping it", () => {
    const items = parseHistory([{ role: "assistant", content: "<tool_call>not json</tool_call>" }]);
    expect(items[0]).toMatchObject({ kind: "tool", name: "tool", args: "not json" });
  });
});

describe("cleanUserText", () => {
  it("strips what ZeroClaw wraps around a Telegram message", () => {
    const row = [
      "[Memory context]",
      "- [from 2026-11-12] telegram_x_398: Pls approve all of them",
      "[/Memory context]",
      "",
      "[turn-context] time=03:00:19 date=2026-11-12 channel=telegram sender=someone. Notes for the model.",
      "",
      "",
      "[2026-11-12 03:00:18 +00:00] Pls approve all of them in securitybot",
    ].join("\n");
    expect(cleanUserText(row)).toBe("Pls approve all of them in securitybot");
  });

  it("leaves ordinary text, including text that starts with a bracket, alone", () => {
    expect(cleanUserText("[draft] is this ok?")).toBe("[draft] is this ok?");
    expect(cleanUserText("  hello\nthere ")).toBe("hello\nthere");
  });
});

describe("parseHistory: rows a person did not type", () => {
  it("hides ZeroClaw's own correction notes to the model", () => {
    const items = parseHistory([
      { role: "user", content: "[Tool call parse error]\nYour previous response looked like..." },
      { role: "assistant", content: "Sorry, here is the answer." },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["assistant"]);
  });
});

describe("splitImages", () => {
  it("pulls image markers out of the text", () => {
    expect(splitImages("look [IMAGE:/a/b.png] here")).toEqual({
      text: "look  here",
      images: ["/a/b.png"],
    });
  });
});

describe("titleFrom", () => {
  it("shortens long text and ignores image markers", () => {
    expect(titleFrom("[IMAGE:/a.png] hi   there")).toBe("hi there");
    expect(titleFrom("x".repeat(80)).length).toBe(48);
    expect(titleFrom("[IMAGE:/a.png]")).toBe("Image");
  });
});

describe("parseTranscript (what a scheduled job leaves)", () => {
  it("is just the answer when the run saved only its answer", () => {
    const items = parseTranscript("**State:** limited\n• 3 findings");
    expect(items).toMatchObject([{ kind: "assistant", text: "**State:** limited\n• 3 findings" }]);
  });

  it("folds tool calls and results out of a saved turn", () => {
    const items = parseTranscript(
      'Checking.\n<tool_call>\n{"name": "cron_list", "arguments": {}}\n</tool_call>\n\n[Tool results]\n[Tool attachments: 0]\n<tool_result name="cron_list">\n[1]\n</tool_result>\nOne job.',
    );
    expect(items.map((i) => i.kind)).toEqual(["assistant", "tool", "assistant"]);
    expect(items[1]).toMatchObject({ name: "cron_list", output: "[1]", pending: false });
    expect(items[2]).toMatchObject({ text: "One job." });
  });

  it("keeps a result that was cut off before its closing tag", () => {
    const items = parseTranscript(
      '<tool_call>{"name":"big","arguments":{}}</tool_call>\n[Tool results]\n<tool_result name="big">\n{"rows": [1, 2',
    );
    expect(items).toMatchObject([{ kind: "tool", name: "big", output: '{"rows": [1, 2', pending: false }]);
  });
});

describe("parseHistory: tool calls that never ran", () => {
  it("replaces made-up markup with one caution, in place", () => {
    const items = parseHistory([
      { role: "user", content: "summary of cron jobs?" },
      {
        role: "assistant",
        content:
          "<cron_list>\n</cron_list>\n\n<tool_result>\n[]\n</tool_result>\n\n<thinking_mode>interactive</thinking_mode>\n\nThere are no cron jobs.",
      },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["user", "caution", "assistant"]);
    expect(items[1]).toMatchObject({ text: expect.stringMatching(/cron list.*never run/) });
  });

  it("flags an <invoke> call ZeroClaw could not parse, and shows no fake tool card", () => {
    const items = parseHistory([
      {
        role: "assistant",
        content: '<invoke name="securitybot__findings">\n<parameter name="limit">100</parameter>\n</invoke>',
      },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["caution"]);
    expect(items[0]).toMatchObject({ text: expect.stringContaining("(findings)") });
  });

  it("hides a result the model wrote itself, keeps the real call and its real result", () => {
    const items = parseHistory([
      {
        role: "assistant",
        content:
          '<tool_call>{"name":"securitybot__report","arguments":{"id":471}}</tool_call>\n\n<tool_result>\n{"id":471,"result":"sent"}\n</tool_call>\n3 approved.',
      },
      {
        role: "user",
        content:
          '[Tool results]\n<tool_result name="securitybot__report">\n{"id":471,"result":"queued"}\n</tool_result>',
      },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["tool", "caution", "assistant"]);
    expect(items[0]).toMatchObject({ name: "securitybot__report", output: '{"id":471,"result":"queued"}' });
    expect(items[1]).toMatchObject({ text: expect.stringContaining("wrote out a tool result itself") });
  });

  it("still pairs real calls with real results, also an unnamed one", () => {
    const items = parseHistory([
      { role: "assistant", content: '<tool_call>{"name":"a","arguments":{}}</tool_call>' },
      { role: "user", content: "[Tool results]\n<tool_result>\nok\n</tool_result>" },
    ]);
    expect(items).toMatchObject([{ kind: "tool", name: "a", output: "ok", pending: false }]);
  });
});

describe("titles", () => {
  it("knows a greeting from a question", () => {
    for (const g of ["hello", "Hi!", "hey there", "сайн уу", "Hello.", "test"])
      expect(isGreeting(g)).toBe(true);
    for (const q of ["hello, list my jobs", "hi can you check upwork", "high scores"])
      expect(isGreeting(q)).toBe(false);
  });

  it("names a chat after the first real question", () => {
    const rows = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "Hi!" },
      { role: "user", content: "what is on my calendar?" },
    ];
    expect(titleFromItems(parseHistory(rows))).toBe("what is on my calendar?");
    expect(titleFromItems(parseHistory(rows.slice(0, 2)))).toBe("hello");
    expect(titleFromItems([])).toBeNull();
  });
});
