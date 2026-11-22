// A tool's result arrives as one string, in whatever shape the tool chose. This works out
// what it is, so it can be shown as that: an error as an error, a table as a table, the
// text inside an MCP envelope as text and not as JSON with escaped line breaks.

export type Shown =
  | { kind: "empty" }
  /** ZeroClaw did not run it: it needed approval and got none. */
  | { kind: "denied"; text: string }
  | { kind: "error"; text: string }
  | { kind: "json"; text: string }
  /** Columns lined up with spaces (kubectl, ls): must keep its spacing and not wrap. */
  | { kind: "table"; text: string }
  | { kind: "text"; text: string };

const DENIED = /^Tool call not executed\b|requires approval and no operator decision/i;
const ERROR = /^(?:error|failed)\b[:\s]/i;

/** MCP wraps a result as {"content":[{"type":"text","text":"…"}], …}. The text is the result. */
function unwrapMcp(value: unknown): { text: string; isError: boolean } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as { content?: unknown; isError?: unknown };
  if (!Array.isArray(v.content)) return null;
  const texts = v.content
    .map((c) =>
      c && typeof c === "object" && typeof (c as { text?: unknown }).text === "string"
        ? (c as { text: string }).text
        : null,
    )
    .filter((t): t is string => t !== null);
  if (texts.length === 0) return null;
  return { text: texts.join("\n"), isError: v.isError === true };
}

/**
 * The same envelope, cut off mid-way (ZeroClaw keeps a limited length), so it is not valid
 * JSON any more. The first "text" value is still worth reading: take what is there of it.
 */
function unwrapCutMcp(raw: string): string | null {
  const m = raw.match(/^\s*\{\s*"content"\s*:\s*\[\s*\{\s*"text"\s*:\s*"/);
  if (!m) return null;
  let body = raw.slice(m[0].length);
  const end = body.search(/(?<!\\)"\s*,\s*"type"/);
  if (end !== -1) body = body.slice(0, end);
  // drop a half-written escape at the cut, then let JSON undo the escapes
  for (let trim = 0; trim < 8; trim += 1) {
    try {
      return JSON.parse(`"${body.slice(0, body.length - trim)}"`);
    } catch {
      // try a little shorter
    }
  }
  return null;
}

/** Most lines hold two words separated by a run of spaces: columns. */
function looksLikeTable(text: string): boolean {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return false;
  const columned = lines.filter((l) => /\S {2,}\S/.test(l)).length;
  return columned >= lines.length * 0.6;
}

function plain(text: string): Shown {
  const t = text.trim();
  if (!t) return { kind: "empty" };
  if (DENIED.test(t)) {
    return {
      kind: "denied",
      text: /no operator decision/i.test(t)
        ? "Not run. It needed your approval and nobody answered in time."
        : t,
    };
  }
  if (ERROR.test(t)) return { kind: "error", text: t.replace(/^error:\s*/i, "") };
  return looksLikeTable(t) ? { kind: "table", text: t.replace(/\s+$/gm, "") } : { kind: "text", text: t };
}

export function presentResult(raw: string): Shown {
  const t = raw.trim();
  if (!t) return { kind: "empty" };
  if (t.startsWith("{") || t.startsWith("[")) {
    let value: unknown;
    try {
      value = JSON.parse(t);
    } catch {
      const cut = unwrapCutMcp(t);
      return cut === null ? plain(t) : plain(cut);
    }
    const mcp = unwrapMcp(value);
    if (mcp) {
      const inner = presentResult(mcp.text);
      return mcp.isError && inner.kind !== "empty" && inner.kind !== "denied"
        ? { kind: "error", text: mcp.text.trim() }
        : inner;
    }
    return { kind: "json", text: JSON.stringify(value, null, 2) };
  }
  return plain(t);
}

/** Whether the call did not do what was asked, for the mark on its row. */
export function resultProblem(output: string | undefined): "denied" | "error" | null {
  if (output == null) return null;
  const kind = presentResult(output).kind;
  return kind === "denied" || kind === "error" ? kind : null;
}

export type JsonToken = { text: string; type: "key" | "string" | "number" | "literal" | "plain" };

/** Splits pretty-printed JSON into coloured pieces. */
export function jsonTokens(text: string): JsonToken[] {
  const out: JsonToken[] = [];
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), type: "plain" });
    if (m[1] !== undefined) {
      out.push({ text: m[1], type: m[2] ? "key" : "string" });
      if (m[2]) out.push({ text: m[2], type: "plain" });
    } else out.push({ text: m[0], type: m[3] ? "literal" : "number" });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), type: "plain" });
  return out;
}
