// ZeroClaw's assistant is told to write for Telegram: "•" bullets and plain line breaks, no
// Markdown lists. Markdown would run those lines together into one paragraph, so they are
// turned into real list items first. Code blocks are left exactly as written.
const BULLET = /^(\s*)[•●▪◦‣∙·–—]\s+(?=\S)/;
const FENCE = /^\s*(```|~~~)/;

export function normalizeMarkdown(text: string): string {
  let inCode = false;
  let afterBullet = false;
  const out: string[] = [];
  for (const line of text.split("\n")) {
    if (FENCE.test(line)) {
      inCode = !inCode;
      afterBullet = false;
      out.push(line);
      continue;
    }
    if (inCode) {
      out.push(line);
      continue;
    }
    if (BULLET.test(line)) {
      out.push(line.replace(BULLET, "$1- "));
      afterBullet = true;
      continue;
    }
    // A plain line right under such a list is a new paragraph, not part of the last item
    // (Markdown would otherwise fold it into that item).
    if (afterBullet && line.trim() !== "" && !/^\s/.test(line)) out.push("");
    afterBullet = false;
    out.push(line);
  }
  return out.join("\n");
}

/**
 * Text that is still arriving often ends in the middle of a mark: "`42" before the closing
 * backtick, "**Wor" before the closing stars. Markdown shows such a mark as a literal
 * character, which flickers. This drops the unfinished mark from the last line only; the
 * words stay. Inside an open code block nothing is touched.
 */
export function settleStreaming(text: string): string {
  const fences = text.match(/^\s*(```|~~~)/gm)?.length ?? 0;
  if (fences % 2 === 1) return text;
  const cut = text.lastIndexOf("\n") + 1;
  let last = text.slice(cut);
  const ticks = last.match(/`/g)?.length ?? 0;
  if (ticks % 2 === 1) {
    const i = last.lastIndexOf("`");
    last = last.slice(0, i) + last.slice(i + 1);
  }
  const stars = last.match(/\*\*/g)?.length ?? 0;
  if (stars % 2 === 1) {
    const i = last.lastIndexOf("**");
    last = last.slice(0, i) + last.slice(i + 2);
  }
  // a lone "*" or "_" opening emphasis right at the end
  last = last.replace(/(^|\s)[*_]$/, "$1");
  return text.slice(0, cut) + last;
}
