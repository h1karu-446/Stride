import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, safeHref } from "./markdown";

const text = (t: string) => ({ type: "text", text: t });

describe("plan overview markdown: blocks", () => {
  it("reads headings, paragraphs with line breaks and thematic breaks", () => {
    expect(parseMarkdown("# 方針\n\n毎朝30分\n週末は模試\n\n---\n### #なし ##")).toEqual([
      { type: "heading", level: 1, children: [text("方針")] },
      { type: "paragraph", children: [text("毎朝30分"), { type: "br" }, text("週末は模試")] },
      { type: "hr" },
      { type: "heading", level: 3, children: [text("#なし")] },
    ]);
    // Without a space it is not a heading.
    expect(parseMarkdown("#タグ")).toEqual([{ type: "paragraph", children: [text("#タグ")] }]);
  });

  it("reads bullet, ordered and task lists with nesting", () => {
    expect(parseMarkdown("- 単語\n  - 毎日50語\n- [x] 模試\n- [ ] 本番")).toEqual([{
      type: "list", ordered: false, start: 1, items: [
        { checked: null, blocks: [
          { type: "paragraph", children: [text("単語")] },
          { type: "list", ordered: false, start: 1, items: [
            { checked: null, blocks: [{ type: "paragraph", children: [text("毎日50語")] }] },
          ] },
        ] },
        { checked: true, blocks: [{ type: "paragraph", children: [text("模試")] }] },
        { checked: false, blocks: [{ type: "paragraph", children: [text("本番")] }] },
      ],
    }]);
    expect(parseMarkdown("3. 三\n4. 四")).toMatchObject([{ type: "list", ordered: true, start: 3 }]);
    expect((parseMarkdown("1. a\n\n2. b")[0] as { items: unknown[] }).items).toHaveLength(2);
  });

  it("starts a new list when the marker kind changes, and a paragraph can follow a list", () => {
    expect(parseMarkdown("- a\n1. b\n\n後").map((b) => b.type)).toEqual(["list", "list", "paragraph"]);
  });

  it("reads blockquotes and fenced code without parsing the code", () => {
    expect(parseMarkdown("> 引用 **強調**\n> 続き")).toEqual([{ type: "blockquote", blocks: [
      { type: "paragraph", children: [text("引用 "), { type: "strong", children: [text("強調")] }, { type: "br" }, text("続き")] },
    ] }]);
    expect(parseMarkdown("```ts\nconst a = **1**;\n\n# no\n```\n後")).toEqual([
      { type: "code", lang: "ts", text: "const a = **1**;\n\n# no" },
      { type: "paragraph", children: [text("後")] },
    ]);
    // An unclosed fence runs to the end.
    expect(parseMarkdown("~~~\nx")).toEqual([{ type: "code", lang: "", text: "x" }]);
  });

  it("reads very deep nesting as text instead of overflowing the stack", () => {
    for (const source of [">".repeat(5000) + "a", "- ".repeat(5000) + "a", "1. ".repeat(3300) + "a"]) {
      expect(() => parseMarkdown(source)).not.toThrow();
    }
    let block = parseMarkdown("> ".repeat(40) + "a")[0];
    let depth = 0;
    while (block.type === "blockquote") { block = block.blocks[0]; depth++; }
    expect(depth).toBe(16);
    expect(block.type).toBe("paragraph");
  });

  it("reads tables with alignment, inline marks and escaped pipes", () => {
    expect(parseMarkdown("| 教材 | 進度 | 時間 |\n| :--- | :-: | --: |\n| **単語帳** | `a\\|b` | 30 |")).toEqual([{
      type: "table", align: ["left", "center", "right"],
      header: [[text("教材")], [text("進度")], [text("時間")]],
      rows: [[[{ type: "strong", children: [text("単語帳")] }], [{ type: "code", text: "a|b" }], [text("30")]]],
    }]);
    // Outer pipes are optional; a table may have no body rows.
    expect(parseMarkdown("a | b\n--- | ---")).toEqual([{
      type: "table", align: [null, null], header: [[text("a")], [text("b")]], rows: [],
    }]);
  });

  it("pads short table rows, drops extra cells and ends the table at a blank line or another block", () => {
    const [table, ...rest] = parseMarkdown("前\n| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |\n- 後\n\n後");
    expect(parseMarkdown("前\n| a | b |\n|---|---|")[0]).toEqual({ type: "paragraph", children: [text("前")] });
    expect(table).toMatchObject({ type: "paragraph" });
    expect(rest[0]).toMatchObject({ type: "table", rows: [[[text("1")], []], [[text("1")], [text("2")]]] });
    expect(rest.slice(1).map((b) => b.type)).toEqual(["list", "paragraph"]);
  });

  it("does not read a table without a matching delimiter row", () => {
    // "---" without a pipe stays a thematic break, and the column counts must match.
    expect(parseMarkdown("a | b\n---").map((b) => b.type)).toEqual(["paragraph", "hr"]);
    expect(parseMarkdown("| a | b |\n| --- |").map((b) => b.type)).toEqual(["paragraph"]);
    expect(parseMarkdown("| a |\n| - |")).toMatchObject([{ type: "table", align: [null] }]);
  });

  it("splits an escaped backslash before a pipe as a cell separator", () => {
    expect(parseMarkdown("a \\\\| b\n|-|-|")).toMatchObject([{ type: "table", header: [[text("a \\")], [text("b")]] }]);
    expect(parseMarkdown("| a \\| |\n|-|")).toMatchObject([{ type: "table", header: [[text("a |")]] }]);
  });

  it("checks long runs of spaces in a delimiter-like row quickly", () => {
    const started = performance.now();
    parseMarkdown("|a\n|-" + "\t".repeat(10000) + "x");
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("reads tables inside lists and blockquotes", () => {
    expect(parseMarkdown("> | a |\n> | - |\n> | 1 |")).toMatchObject([{ type: "blockquote", blocks: [{ type: "table" }] }]);
    expect(parseMarkdown("- 表\n  | a |\n  | - |")).toMatchObject([{ type: "list", items: [{ blocks: [
      { type: "paragraph" }, { type: "table" },
    ] }] }]);
  });

  it("returns nothing for blank input and handles CRLF", () => {
    expect(parseMarkdown("  \n\n")).toEqual([]);
    expect(parseMarkdown("a\r\nb")).toEqual([{ type: "paragraph", children: [text("a"), { type: "br" }, text("b")] }]);
  });
});

describe("plan overview markdown: inline", () => {
  it("reads strong, emphasis, strikethrough and inline code", () => {
    expect(parseInline("**太字** と *斜体* と ~~取消~~ と `a*b*`")).toEqual([
      { type: "strong", children: [text("太字")] }, text(" と "),
      { type: "em", children: [text("斜体")] }, text(" と "),
      { type: "del", children: [text("取消")] }, text(" と "),
      { type: "code", text: "a*b*" },
    ]);
    expect(parseInline("*a **b** c*")).toEqual([{ type: "em", children: [
      text("a "), { type: "strong", children: [text("b")] }, text(" c"),
    ] }]);
  });

  it("keeps unmatched marks, spaced marks, snake_case and escapes as text", () => {
    expect(parseInline("2 * 3 * 4")).toEqual([text("2 * 3 * 4")]);
    expect(parseInline("**閉じない")).toEqual([text("**閉じない")]);
    expect(parseInline("snake_case_name")).toEqual([text("snake_case_name")]);
    expect(parseInline("\\*そのまま\\*")).toEqual([text("*そのまま*")]);
  });

  it("links only http(s) and mailto, and shows other schemes as text", () => {
    expect(parseInline("[公式](https://example.com/a_(b)) を見る")).toEqual([
      { type: "link", href: "https://example.com/a_(b)", children: [text("公式")] }, text(" を見る"),
    ]);
    expect(parseInline("[x](javascript:alert(1))")).toEqual([text("x")]);
    expect(parseInline("<mailto:a@example.com>")).toEqual([
      { type: "link", href: "mailto:a@example.com", children: [text("mailto:a@example.com")] },
    ]);
    expect(safeHref(" HTTPS://example.com ")).toBe("HTTPS://example.com");
    expect(safeHref("data:text/html,x")).toBeNull();
  });

  it("links bare URLs and stops before trailing punctuation and Japanese text", () => {
    expect(parseInline("参考: https://example.com/path?q=1。次")).toEqual([
      text("参考: "), { type: "link", href: "https://example.com/path?q=1", children: [text("https://example.com/path?q=1")] }, text("。次"),
    ]);
    expect(parseInline("(https://example.com).")).toEqual([
      text("("), { type: "link", href: "https://example.com", children: [text("https://example.com")] }, text(")."),
    ]);
  });

  it("never puts a link inside a link label", () => {
    expect(parseInline("[https://a.com](https://b.com)")).toEqual([
      { type: "link", href: "https://b.com", children: [text("https://a.com")] },
    ]);
    expect(parseInline("[[a](https://x)](https://y)")).toEqual([
      { type: "link", href: "https://y", children: [text("[a](https://x)")] },
    ]);
  });

  it("leaves raw HTML as plain text", () => {
    expect(parseInline("<img src=x onerror=alert(1)>")).toEqual([text("<img src=x onerror=alert(1)>")]);
  });
});
