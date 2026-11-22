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
