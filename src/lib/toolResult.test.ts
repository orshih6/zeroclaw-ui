import { describe, expect, it } from "vitest";
import { jsonTokens, presentResult, resultProblem } from "./toolResult";

describe("presentResult", () => {
  it("shows the text inside an MCP envelope, not the envelope", () => {
    const raw = JSON.stringify({
      content: [{ type: "text", text: "NAMESPACE    KIND        NAME\nshop   HTTPRoute   shop\n" }],
      structuredContent: { items: [{ Age: "27d" }] },
    });
    expect(presentResult(raw)).toEqual({
      kind: "table",
      text: "NAMESPACE    KIND        NAME\nshop   HTTPRoute   shop",
    });
  });

  it("still reads the text of an envelope that was cut off", () => {
    const whole = JSON.stringify(
      { content: [{ text: 'NAME   READY\napi "one"   1/1\nworker   0/1', type: "text" }] },
      null,
      2,
    );
    const shown = presentResult(whole.slice(0, whole.indexOf("worker") + 3));
    expect(shown.kind).toBe("table");
    expect(shown).toMatchObject({ text: 'NAME   READY\napi "one"   1/1\nwor' });
  });

  it("keeps real JSON as JSON, indented", () => {
    expect(presentResult('{"rules":[{"name":"plus","paused":false}]}')).toEqual({
      kind: "json",
      text: '{\n  "rules": [\n    {\n      "name": "plus",\n      "paused": false\n    }\n  ]\n}',
    });
  });

  it("recognises a refusal for lack of approval and says it plainly", () => {
    const shown = presentResult(
      "Tool call not executed: 'kube__resources_scale' requires approval and no operator decision was available, so the runtime denied it by policy. This was not a user's decision.",
    );
    expect(shown).toEqual({
      kind: "denied",
      text: "Not run. It needed your approval and nobody answered in time.",
    });
  });

  it("recognises an error, alone or inside an envelope", () => {
    expect(presentResult("Error: MCP server `securitybot` failed during tool call `findings`")).toEqual({
      kind: "error",
      text: "MCP server `securitybot` failed during tool call `findings`",
    });
    expect(
      presentResult(JSON.stringify({ content: [{ type: "text", text: "pod not found" }], isError: true })),
    ).toEqual({
      kind: "error",
      text: "pod not found",
    });
  });

  it("treats ordinary text as text, and nothing as empty", () => {
    expect(presentResult("Found 5 memories:\n- [core] a: b\n- [daily] c: d")).toMatchObject({ kind: "text" });
    expect(presentResult("  \n")).toEqual({ kind: "empty" });
    expect(presentResult("[]")).toEqual({ kind: "json", text: "[]" });
  });
});

describe("resultProblem", () => {
  it("flags only calls that did not do what was asked", () => {
    expect(resultProblem("Error: boom")).toBe("error");
    expect(
      resultProblem("Tool call not executed: 'x' requires approval and no operator decision was available"),
    ).toBe("denied");
    expect(resultProblem("ok")).toBeNull();
    expect(resultProblem(undefined)).toBeNull();
  });
});

describe("jsonTokens", () => {
  it("tells keys from strings, numbers and literals, and loses nothing", () => {
    const text = '{\n  "a": "x:y",\n  "n": -1.5,\n  "ok": true\n}';
    const tokens = jsonTokens(text);
    expect(tokens.map((t) => t.text).join("")).toBe(text);
    expect(tokens.filter((t) => t.type !== "plain").map((t) => `${t.type}:${t.text}`)).toEqual([
      'key:"a"',
      'string:"x:y"',
      'key:"n"',
      "number:-1.5",
      'key:"ok"',
      "literal:true",
    ]);
  });
});
