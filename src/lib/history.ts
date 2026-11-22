// ZeroClaw stores a conversation as plain text rows. Tool calls are written into the
// assistant's text as <tool_call>{json}</tool_call>, their results come back as a "user"
// row starting with "[Tool results]", and every real user message is prefixed with the
// time. This turns those rows back into what a person wants to read.
import { type Part, splitModelText } from "./protocol";
import type { Item, StoredMessage } from "./types";

const TIME_PREFIX = /^\[CURRENT DATE & TIME:[^\]]*\]\s*/;
// What ZeroClaw wraps around a message that came in through a channel (Telegram): the
// memories it recalled, routing notes for the model, and the arrival time.
const MEMORY_BLOCK = /\[Memory context\][\s\S]*?\[\/Memory context\]\s*/g;
const TURN_CONTEXT = /^\[turn-context\][^\n]*\n*/gm;
const ARRIVAL_TIME = /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{2}:\d{2}\]\s*/;
/** Rows ZeroClaw writes to the model in the user's name; a person never typed them. */
const SYSTEM_ROW = /^\s*\[(Tool call parse error|System|Reminder)[^\]]*\]/i;

/** The words a person actually typed, without what ZeroClaw added around them. */
export function cleanUserText(content: string): string {
  return content
    .replace(MEMORY_BLOCK, "")
    .replace(TURN_CONTEXT, "")
    .trimStart()
    .replace(TIME_PREFIX, "")
    .replace(ARRIVAL_TIME, "")
    .trim();
}
/** The row ZeroClaw leaves where it dropped old turns to fit the model. */
const OMITTED = /^\s*\[earlier turns omitted/i;
const IMAGE_MARKER = /\[IMAGE:([^\]]+)\]/g;

let counter = 0;
export function newId(): string {
  counter += 1;
  return `i${Date.now().toString(36)}-${counter}`;
}

/** Splits "[IMAGE:/path]" markers out of what the user typed. */
export function splitImages(text: string): { text: string; images: string[] } {
  const images: string[] = [];
  const clean = text
    .replace(IMAGE_MARKER, (_m, path: string) => {
      images.push(path.trim());
      return "";
    })
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  return { text: clean, images };
}

export function isToolResultRow(content: string): boolean {
  return content.trimStart().startsWith("[Tool results]");
}

const toolWords = (name: string) => name.replace(/^.*__/, "").replace(/_/g, " ");

type Unrun = Extract<Part, { kind: "unrun" }>;

/** Says, once per answer, that it holds tool activity the model wrote and nothing ran. */
function unrunCaution(unrun: Unrun[]): Item {
  const calls = unrun.filter((u) => u.what === "call");
  if (calls.length === 0) {
    return {
      id: newId(),
      kind: "caution",
      text: "The assistant wrote out a tool result itself here. It did not come from the tool, so it is not shown. The real result is on the tool's own line.",
    };
  }
  const named = [
    ...new Set(
      calls
        .map((u) => u.name)
        .filter((n): n is string => Boolean(n))
        .map(toolWords),
    ),
  ];
  const what = named.length ? ` (${named.join(", ")})` : "";
  return {
    id: newId(),
    kind: "caution",
    text: `The assistant wrote a tool call${what} as text, so it was never run. Anything it says it found here did not come from a real result.`,
  };
}

/** Adds what a piece of model or ZeroClaw text holds to the conversation. */
export function appendParts(items: Item[], parts: Part[], at?: string): void {
  const unrun = parts.filter((p): p is Unrun => p.kind === "unrun");
  let warned = false;
  for (const p of parts) {
    if (p.kind === "text") {
      items.push({ id: newId(), kind: "assistant", text: p.text, at });
    } else if (p.kind === "call") {
      items.push({ id: newId(), kind: "tool", name: p.name, args: p.args, pending: true });
    } else if (p.kind === "result") {
      const open =
        items.find((i) => i.kind === "tool" && i.pending && i.name === p.name) ??
        (p.name === null ? items.findLast((i) => i.kind === "tool" && i.pending) : undefined);
      if (open?.kind === "tool") {
        open.output = p.output;
        open.pending = false;
      } else {
        items.push({
          id: newId(),
          kind: "tool",
          name: p.name ?? "tool",
          args: {},
          output: p.output,
          pending: false,
        });
      }
    } else if (!warned) {
      // where the first unrun call stood, so it reads in order with the text around it
      items.push(unrunCaution(unrun));
      warned = true;
    }
  }
}

export function parseHistory(rows: StoredMessage[]): Item[] {
  const items: Item[] = [];
  for (const row of rows) {
    const content = row.content ?? "";
    if (row.role === "user" && isToolResultRow(content)) {
      // ZeroClaw wrote this row; only its results matter, not the headers around them.
      appendParts(
        items,
        splitModelText(content, "zeroclaw").filter((p) => p.kind === "result"),
      );
      continue;
    }
    if (row.role === "user" && OMITTED.test(content)) {
      items.push({ id: newId(), kind: "notice", text: "Earlier messages are no longer kept in this chat." });
      continue;
    }
    if (row.role === "user" && SYSTEM_ROW.test(content)) continue;
    if (row.role === "user") {
      const { text, images } = splitImages(cleanUserText(content));
      if (text || images.length) {
        items.push({ id: newId(), kind: "user", text, images, at: row.created_at });
      }
      continue;
    }
    if (row.role === "assistant") appendParts(items, splitModelText(content), row.created_at);
    // system and other rows are ZeroClaw's own bookkeeping: not shown
  }
  // A call with no stored result (an aborted turn) should not spin forever.
  for (const i of items) if (i.kind === "tool") i.pending = false;
  return items;
}

/**
 * What a scheduled job left behind: one block of text ZeroClaw saved. It is usually just
 * the answer, but can hold the whole turn (tool calls and their results inline, cut off at
 * ZeroClaw's size limit, so the last result may have no closing tag).
 */
export function parseTranscript(text: string): Item[] {
  const items: Item[] = [];
  appendParts(items, splitModelText(text, "zeroclaw"));
  for (const i of items) if (i.kind === "tool") i.pending = false;
  return items;
}

/** A short title from the first thing the user said. */
export function titleFrom(text: string): string {
  const one = cleanUserText(text).replace(IMAGE_MARKER, "").replace(/\s+/g, " ").trim();
  if (!one) return "Image";
  return one.length > 48 ? `${one.slice(0, 47).trimEnd()}…` : one;
}
