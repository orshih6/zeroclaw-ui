// Text a model wrote is not always just prose. Tool calls travel inside it as markup, and a
// model sometimes writes markup that was never meant for a person: a call in another
// dialect (<invoke>), a made-up result, or settings tags echoed from its own prompt. This
// splits such text into what a person should read and the tool activity hidden in it.

export type Part =
  | { kind: "text"; text: string }
  /** A call ZeroClaw recognised and ran. */
  | { kind: "call"; name: string; args: unknown }
  /** A result ZeroClaw wrote down. */
  | { kind: "result"; name: string | null; output: string }
  /**
   * Markup the model wrote that ZeroClaw never acted on: a call in a dialect it does not
   * parse, or a "result" the model made up. Nothing ran. `name` is the tool it named.
   */
  | { kind: "unrun"; what: "call" | "result"; name: string | null };

/** Tags a model echoes from its own instructions. Never meant to be read. */
const NOISE = "reasoning_effort|thinking_mode|budget_tokens|max_thinking_length|system[-_]reminder";

const PIECES = [
  // 1: ZeroClaw's own form, <tool_call>{"name":…,"arguments":…}</tool_call>
  String.raw`<tool_call>\s*([\s\S]*?)\s*<\/tool_call>`,
  // 2,3: a result, named or not (a model sometimes closes it with </tool_call>)
  String.raw`<tool_result(?:\s+name="([^"]*)")?[^>]*>\n?([\s\S]*?)\n?<\/tool_(?:result|call)>`,
  // 4,5: Anthropic's form, <invoke name="x"><parameter name="k">v</parameter></invoke>
  String.raw`<(?:antml:)?invoke\s+name="([^"]+)"\s*>([\s\S]*?)<\/(?:antml:)?invoke>`,
  // wrappers around calls, and echoed settings
  String.raw`<\/?(?:antml:)?function_calls>`,
  String.raw`<(?:${NOISE})>[\s\S]*?<\/(?:${NOISE})>`,
  // 6,7: a tool's name used as a tag, <cron_list>{…}</cron_list>. Only when the name has an
  // underscore (so <b>, <div> and friends are left alone) and the body is empty or JSON.
  String.raw`<([a-z][a-z0-9]*(?:_[a-z0-9]+)+)>\s*((?:[{[][\s\S]*?[}\]])?)\s*<\/\6>`,
];
// 8,9: only where text can be cut off (a job's saved output): a result with no closing tag
const CUT_RESULT = String.raw`<tool_result(?:\s+name="([^"]*)")?[^>]*>\n?([\s\S]*)$`;

// Last, after every whole form had its chance: a protocol tag left on its own (an unmatched
// </invoke>, a lone <tool_call>). It means nothing to a reader.
const STRAY = String.raw`<\/?(?:antml:)?(?:invoke|function_calls|tool_call|tool_result|parameter)\b[^>]*>`;

const WHOLE = new RegExp([...PIECES, STRAY].join("|"), "g");
const WHOLE_OR_CUT = new RegExp([...PIECES, CUT_RESULT, STRAY].join("|"), "g");

const HEADERS = /^\[Tool (results|attachments: \d+)\]\s*$/gm;
/** What is left when a call was wrapped in a code fence: just the fence marks. */
const ONLY_FENCES = /^(\s*(`{3,}|~{3,})[\w-]*\s*)+$/;

function jsonOr<T>(raw: string, fallback: T): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function jsonCall(raw: string): Part {
  const j = jsonOr(raw, null) as { name?: unknown; arguments?: unknown; args?: unknown } | null;
  if (!j || typeof j !== "object") return { kind: "call", name: "tool", args: raw };
  return { kind: "call", name: String(j.name ?? "tool"), args: j.arguments ?? j.args ?? {} };
}

/**
 * `from` says who wrote the text, which decides what its markup means:
 * - "assistant": a model's answer. Only ZeroClaw's own <tool_call> form was really run;
 *   any other call, and any result (a model cannot write a real one), is "unrun".
 * - "zeroclaw": text ZeroClaw wrote (a tool-results row, a job's saved output). Results are
 *   real, and the text may be cut off at a size limit, so a result with no closing tag runs
 *   to the end. An answer never gets that: an unclosed tag would swallow the rest of it.
 */
export function splitModelText(text: string, from: "assistant" | "zeroclaw" = "assistant"): Part[] {
  const parts: Part[] = [];
  const say = (chunk: string) => {
    const clean = chunk.replace(HEADERS, "").trim();
    if (clean && !ONLY_FENCES.test(clean)) parts.push({ kind: "text", text: clean });
  };
  let last = 0;
  const trusted = from === "zeroclaw";
  for (const m of text.matchAll(trusted ? WHOLE_OR_CUT : WHOLE)) {
    say(text.slice(last, m.index));
    last = (m.index ?? 0) + m[0].length;
    if (m[1] !== undefined) parts.push(jsonCall(m[1]));
    else if (m[3] !== undefined) {
      parts.push(
        trusted
          ? { kind: "result", name: m[2] ?? null, output: m[3] }
          : { kind: "unrun", what: "result", name: m[2] ?? null },
      );
    } else if (m[4] !== undefined) parts.push({ kind: "unrun", what: "call", name: m[4] });
    else if (m[6] !== undefined) parts.push({ kind: "unrun", what: "call", name: m[6] });
    else if (m[9] !== undefined) parts.push({ kind: "result", name: m[8] ?? null, output: m[9] });
    // anything else matched is a wrapper or noise: dropped
  }
  say(text.slice(last));
  return parts;
}

/** Only the prose, for text that is still streaming in. */
export function readableText(text: string): string {
  return splitModelText(text)
    .filter((p) => p.kind === "text")
    .map((p) => (p.kind === "text" ? p.text : ""))
    .join("\n\n");
}
