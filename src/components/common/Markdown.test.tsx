import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Markdown from "./Markdown";

const html = (source: string) => renderToStaticMarkup(<Markdown source={source} />);

describe("Markdown view", () => {
  it("renders headings below the card title, lists, tasks and links", () => {
    const out = html("# 方針\n- **毎朝**\n- [x] 模試\n\n[公式](https://example.com)");
    expect(out).toContain("<h3");
    expect(out).toContain("<strong");
    expect(out).toContain('type="checkbox"');
    expect(out).toContain('checked=""');
    expect(out).toContain('href="https://example.com" target="_blank" rel="noopener noreferrer"');
  });

  it("escapes raw HTML and drops unsafe link schemes", () => {
    const out = html('<script>alert(1)</script>\n[x](javascript:alert(1)) <img src=x onerror="a()">');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("javascript:");
    expect(out).toContain("&lt;script&gt;");
  });
});
