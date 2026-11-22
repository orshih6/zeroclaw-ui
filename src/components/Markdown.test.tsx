import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "./Markdown";

describe("Markdown", () => {
  it("shows the assistant's • lines as a real list and keeps single line breaks", () => {
    const html = renderToStaticMarkup(
      <Markdown
        text={
          "Here is what I can do:\n• Files: read and write\n• Web: search\nAsk me anything.\nSecond line."
        }
      />,
    );
    expect(html).toContain("<ul>");
    expect(html.match(/<li>/g)?.length).toBe(2);
    expect(html).toContain("<li>Files: read and write</li>");
    expect(html).toContain("<li>Web: search</li>");
    expect(html).toContain("<p>Ask me anything.<br/>");
  });

  it("colours code in a language it knows and leaves the rest plain", () => {
    const html = renderToStaticMarkup(
      <Markdown text={"```py\nimport sys  # note\n```\n\n```weird\nimport sys\n```"} />,
    );
    expect(html).toContain('<span class="hljs-keyword">import</span>');
    expect(html).toContain('<span class="hljs-comment"># note</span>');
    expect(html.match(/hljs-keyword/g)?.length).toBe(1);
    expect(html).toContain(">Python<");
  });
});
