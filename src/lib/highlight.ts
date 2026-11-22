// Colours fenced code in rendered Markdown. A small plugin of our own instead of
// rehype-highlight, because that one always ships ~35 languages; this ships the dozen an
// assistant on this cluster actually writes. Unknown languages stay plain text.
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { createLowlight } from "lowlight";

const lowlight = createLowlight({
  bash,
  css,
  diff,
  go,
  ini,
  javascript,
  json,
  python,
  rust,
  sql,
  typescript,
  xml,
  yaml,
});
lowlight.registerAlias({
  bash: ["sh", "shell", "zsh", "console"],
  javascript: ["js", "jsx"],
  typescript: ["ts", "tsx"],
  python: ["py"],
  yaml: ["yml"],
  ini: ["toml"],
  xml: ["html", "svg"],
  go: ["golang"],
  rust: ["rs"],
});

type Node = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { className?: unknown };
  children?: Node[];
};

const textOf = (n: Node): string =>
  n.type === "text" ? (n.value ?? "") : (n.children ?? []).map(textOf).join("");

function languageOf(code: Node): string | null {
  const classes = code.properties?.className;
  if (!Array.isArray(classes)) return null;
  for (const c of classes) {
    const m = typeof c === "string" ? c.match(/^language-(.+)$/) : null;
    if (m) return m[1].toLowerCase();
  }
  return null;
}

function walk(node: Node) {
  for (const child of node.children ?? []) {
    const code = child.tagName === "pre" ? child.children?.find((c) => c.tagName === "code") : null;
    if (code) {
      const lang = languageOf(code);
      if (lang && lowlight.registered(lang)) {
        code.children = lowlight.highlight(lang, textOf(code)).children as Node[];
      }
      continue;
    }
    walk(child);
  }
}

/** rehype plugin */
export function rehypeCodeColors() {
  return (tree: unknown) => walk(tree as Node);
}
