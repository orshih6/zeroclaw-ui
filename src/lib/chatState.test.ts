import { describe, expect, it } from "vitest";
import { type ChatState, chatReducer, emptyChat } from "./chatState";
import type { ServerEvent } from "./types";

const run = (events: ServerEvent[], start: ChatState = emptyChat) =>
  events.reduce((s, event) => chatReducer(s, { type: "server", event, now: 1000 }), start);

describe("chatReducer", () => {
  it("streams text and turns it into one answer when the turn ends", () => {
    const mid = run([
      { type: "chunk", content: "Hel" },
      { type: "chunk", content: "lo" },
    ]);
    expect(mid).toMatchObject({ draft: "Hello", busy: true, items: [] });
    const end = run(
      [{ type: "done", full_response: "Hello", model: "m", tokens_used: 50, max_context_tokens: 200 }],
      mid,
    );
    expect(end).toMatchObject({ draft: "", busy: false, usage: { used: 50, max: 200 } });
    expect(end.items).toMatchObject([{ kind: "assistant", text: "Hello", model: "m" }]);
  });

  it("pairs a tool result with its call by id and keeps the thinking with the answer", () => {
    const s = run([
      { type: "thinking", content: "hmm" },
      { type: "chunk", content: "Let me check" },
      { type: "chunk_reset" },
      { type: "tool_call", id: "a", name: "cron_list", args: {} },
      { type: "tool_call", id: "b", name: "cron_list", args: { x: 1 } },
      { type: "tool_result", id: "b", name: "cron_list", output: "second" },
      { type: "tool_result", id: "a", name: "cron_list", output: "first" },
      { type: "done", full_response: "Two jobs." },
    ]);
    expect(s.items).toMatchObject([
      { kind: "tool", output: "first", pending: false },
      { kind: "tool", output: "second", pending: false },
      { kind: "assistant", text: "Two jobs.", thinking: "hmm" },
    ]);
  });

  it("falls back to the streamed text when the final message carries none", () => {
    const s = run([{ type: "chunk", content: "partial answer" }, { type: "done" }]);
    expect(s.items).toMatchObject([{ kind: "assistant", text: "partial answer" }]);
  });

  it("shows an approval request and clears it when the turn ends or is answered", () => {
    const asked = run([
      { type: "approval_request", request_id: "r1", tool: "kube__pods_delete", timeout_secs: 60 },
    ]);
    expect(asked.approval).toMatchObject({
      requestId: "r1",
      tool: "kube__pods_delete",
      timeoutSecs: 60,
      receivedAt: 1000,
    });
    expect(chatReducer(asked, { type: "approval_answered" }).approval).toBeNull();
    expect(run([{ type: "done", full_response: "ok" }], asked).approval).toBeNull();
  });

  it("stops cleanly: no spinner left on a tool, a note in the conversation", () => {
    const s = run([
      { type: "tool_call", id: "a", name: "slow" },
      { type: "chunk", content: "x" },
      { type: "aborted" },
    ]);
    expect(s).toMatchObject({ busy: false, draft: "" });
    expect(s.items).toMatchObject([
      { kind: "tool", pending: false },
      { kind: "notice", text: "Stopped." },
    ]);
  });

  it("shows a server error and ends the turn", () => {
    const s = run([
      { type: "chunk", content: "x" },
      { type: "error", code: "PROVIDER_ERROR", message: "No credit" },
    ]);
    expect(s).toMatchObject({ busy: false, draft: "" });
    expect(s.items).toMatchObject([{ kind: "error", text: "No credit" }]);
  });

  it("adds what the user sent and marks the turn as running", () => {
    const s = chatReducer(emptyChat, { type: "sent", text: "hi", images: ["/a.png"] });
    expect(s).toMatchObject({ busy: true, items: [{ kind: "user", text: "hi", images: ["/a.png"] }] });
  });

  it("ignores events it does not know", () => {
    expect(run([{ type: "connected" }, { type: "something_new" }])).toEqual(emptyChat);
  });

  it("flags a tool call the model only wrote as text, live as in saved history", () => {
    const s = run([
      {
        type: "done",
        full_response:
          "<cron_list>\n</cron_list>\n\n<tool_result>\n[]\n</tool_result>\n\n<reasoning_effort>10</reasoning_effort>\n\nThere are no cron jobs.",
        model: "m",
      },
    ]);
    expect(s.items.map((i) => i.kind)).toEqual(["caution", "assistant"]);
    expect(s.items[0]).toMatchObject({ text: expect.stringContaining("cron list") });
    expect(s.items[1]).toMatchObject({ text: "There are no cron jobs.", model: "m" });
  });

  it("waits for a turn it cannot hear, then shows what was saved", () => {
    const waiting = chatReducer(emptyChat, { type: "waiting" });
    expect(waiting.busy).toBe(true);
    const end = chatReducer(waiting, {
      type: "caught_up",
      items: [
        { id: "1", kind: "user", text: "hi", images: [] },
        { id: "2", kind: "assistant", text: "hello" },
      ],
    });
    expect(end).toMatchObject({ busy: false, draft: "", items: [{ kind: "user" }, { kind: "assistant" }] });
  });
});
