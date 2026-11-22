import { describe, expect, it } from "vitest";
import { normalizeMarkdown, settleStreaming } from "./markdown";

describe("normalizeMarkdown", () => {
  it("turns Telegram-style bullets into list items", () => {
    expect(normalizeMarkdown("I can:\n• read files\n• search the web\n  • nested one")).toBe(
      "I can:\n- read files\n- search the web\n  - nested one",
    );
  });

  it("accepts the other bullet characters and dashes people type", () => {
    expect(normalizeMarkdown("· one\n– two\n— three\n▪ four")).toBe("- one\n- two\n- three\n- four");
  });

  it("starts a new paragraph for the plain line after such a list", () => {
    expect(normalizeMarkdown("• one\n• two\nThat is all.")).toBe("- one\n- two\n\nThat is all.");
    expect(normalizeMarkdown("• one\n  continues here\n• two")).toBe("- one\n  continues here\n- two");
  });

  it("leaves code blocks and ordinary text alone", () => {
    const code = "```\n• not a list\n```";
    expect(normalizeMarkdown(code)).toBe(code);
    expect(normalizeMarkdown("5 • 3 = 15, and a dash – here")).toBe("5 • 3 = 15, and a dash – here");
    expect(normalizeMarkdown("- already\n* markdown\n1. list")).toBe("- already\n* markdown\n1. list");
  });
});

describe("settleStreaming", () => {
  it("drops a mark that is still being written, on the last line only", () => {
    expect(settleStreaming("- `42")).toBe("- 42");
    expect(settleStreaming("Done `a` and `b")).toBe("Done `a` and b");
    expect(settleStreaming("**Worth a lo")).toBe("Worth a lo");
    expect(settleStreaming("one `open\nsecond line")).toBe("one `open\nsecond line");
    expect(settleStreaming("a list\n- *")).toBe("a list\n- ");
  });

  it("leaves finished marks and open code blocks alone", () => {
    expect(settleStreaming("**bold** and `code`")).toBe("**bold** and `code`");
    expect(settleStreaming("```js\nconst a = `x")).toBe("```js\nconst a = `x");
  });
});
