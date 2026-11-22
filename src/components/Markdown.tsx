import { Check, Copy } from "lucide-react";
import { type ReactElement, type ReactNode, isValidElement, memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { rehypeCodeColors } from "../lib/highlight";
import { normalizeMarkdown } from "../lib/markdown";

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node as ReactElement<{ children?: ReactNode }>).props.children);
  return "";
}

export function CopyButton({
  text,
  label = "Copy",
  withText,
}: { text: string; label?: string; withText?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className={`inline-flex h-7 items-center justify-center gap-1.5 rounded-md text-ink-3 hover:bg-line/60 hover:text-ink ${
        withText ? "px-2 text-xs" : "w-7"
      }`}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
      {withText && (done ? "Copied" : "Copy")}
    </button>
  );
}

const LANGUAGE_NAME: Record<string, string> = {
  js: "JavaScript",
  javascript: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TSX",
  jsx: "JSX",
  py: "Python",
  python: "Python",
  sh: "Shell",
  bash: "Shell",
  shell: "Shell",
  zsh: "Shell",
  json: "JSON",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  sql: "SQL",
  go: "Go",
  rust: "Rust",
  html: "HTML",
  css: "CSS",
  diff: "Diff",
  md: "Markdown",
  markdown: "Markdown",
  dockerfile: "Dockerfile",
};

/** A code block: a bar with the language and a copy button, then the code. */
function Pre({ children }: { children?: ReactNode }) {
  const code = isValidElement(children) ? (children as ReactElement<{ className?: string }>) : null;
  const lang = code?.props.className?.match(/language-([\w+-]+)/)?.[1] ?? "";
  return (
    <div className="code-block">
      <div className="code-bar">
        <span>{LANGUAGE_NAME[lang.toLowerCase()] ?? lang}</span>
        <CopyButton text={textOf(children).replace(/\n$/, "")} label="Copy code" withText />
      </div>
      <pre>{children}</pre>
    </div>
  );
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-z">
      <ReactMarkdown
        // remarkBreaks: a single line break in an answer is a line break on screen
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeCodeColors]}
        components={{
          pre: Pre,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="table-wrap scroll-thin">
              <table>{children}</table>
            </div>
          ),
          img: ({ src, alt }) => <img src={src} alt={alt ?? ""} loading="lazy" />,
        }}
      >
        {normalizeMarkdown(text)}
      </ReactMarkdown>
    </div>
  );
});
