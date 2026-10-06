// A small Markdown parser for the plan overview (Issue #70).
// It returns a tree that the UI renders as React elements, so raw HTML in the
// source is never interpreted: it stays plain text. Links only keep safe
// schemes (http, https, mailto).
//
// Supported: ATX headings, paragraphs (a newline is a line break), bullet /
// ordered / task lists (nested by indentation), blockquotes, fenced code,
// thematic breaks; inline code, **strong**, *em*, ~~del~~, [links](url),
// <autolinks>, bare http(s) URLs and backslash escapes.

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong" | "em" | "del"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: Inline[] }
  | { type: "br" };

export interface ListItem {
  /** null for a normal item, true / false for a task item ([x] / [ ]). */
  checked: boolean | null;
  blocks: Block[];
}

export type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { type: "blockquote"; blocks: Block[] }
  | { type: "code"; lang: string; text: string }
  | { type: "hr" };

const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const LIST = /^( *)([-*+]|\d{1,9}[.)])(?:[ \t]+(.*))?$/;
const TASK = /^\[([ xX])\](?:[ \t]+|$)/;
/** Deeper quotes / lists are read as plain text, so recursion stays bounded. */
const MAX_DEPTH = 16;

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  return parseBlocks(lines);
}

const indentOf = (line: string) => line.length - line.trimStart().length;
const isBlank = (line: string) => line.trim() === "";

/** True when the line starts a block that interrupts a paragraph. */
function startsBlock(line: string, nest: boolean) {
  return HEADING.test(line) || HR.test(line) || FENCE.test(line)
    || (nest && (QUOTE.test(line) || (LIST.test(line) && !!line.match(LIST)![3]?.trim())));
}

function parseBlocks(lines: string[], depth = 0): Block[] {
  const nest = depth < MAX_DEPTH;
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }

    const fence = line.match(FENCE);
    if (fence && !(fence[2][0] === "`" && fence[3].includes("`"))) {
      const [, indent, marker, info] = fence;
      const body: string[] = [];
      i++;
      while (i < lines.length) {
        const close = lines[i].match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
        if (close && close[1][0] === marker[0] && close[1].length >= marker.length) { i++; break; }
        // Drop up to the opening fence's indentation from each line.
        body.push(lines[i].replace(new RegExp(`^ {0,${indent.length}}`), ""));
        i++;
      }
      blocks.push({ type: "code", lang: info.trim().split(/\s+/)[0] ?? "", text: body.join("\n") });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        children: parseInline(heading[2] ?? ""),
      });
      i++;
      continue;
    }

    if (HR.test(line)) { blocks.push({ type: "hr" }); i++; continue; }

    if (nest && QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) inner.push(lines[i++].match(QUOTE)![1]);
      blocks.push({ type: "blockquote", blocks: parseBlocks(inner, depth + 1) });
      continue;
    }

    if (nest && LIST.test(line)) {
      const [list, next] = parseList(lines, i, depth);
      blocks.push(list);
      i = next;
      continue;
    }

    const text: string[] = [line.trim()];
    i++;
    while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines[i], nest)) text.push(lines[i++].trim());
    blocks.push({ type: "paragraph", children: parseInline(text.join("\n")) });
  }
  return blocks;
}

function parseList(lines: string[], start: number, depth: number): [Block, number] {
  const first = lines[start].match(LIST)!;
  const indent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items: ListItem[] = [];
  let i = start;

  while (i < lines.length) {
    const m = lines[i].match(LIST);
    if (!m || m[1].length !== indent || /\d/.test(m[2]) !== ordered) break;
    let text = m[3] ?? "";
    let checked: boolean | null = null;
    const task = text.match(TASK);
    if (task) { checked = task[1] !== " "; text = text.slice(task[0].length); }
    // Lines indented deeper than the marker belong to this item.
    const contentIndent = indent + m[2].length + 1;
    const body = [text];
    i++;
    while (i < lines.length) {
      if (isBlank(lines[i])) {
        let j = i;
        while (j < lines.length && isBlank(lines[j])) j++;
        if (j < lines.length && indentOf(lines[j]) > indent) {
          for (; i < j; i++) body.push("");
          continue;
        }
        break;
      }
      if (indentOf(lines[i]) <= indent) break;
      const strip = Math.min(indentOf(lines[i]), contentIndent);
      body.push(lines[i].slice(strip));
      i++;
    }
    items.push({ checked, blocks: parseBlocks(body, depth + 1) });

    // A blank line between items keeps the list going.
    let j = i;
    while (j < lines.length && isBlank(lines[j])) j++;
    const sibling = j < lines.length ? lines[j].match(LIST) : null;
    if (!sibling || sibling[1].length !== indent || /\d/.test(sibling[2]) !== ordered) break;
    i = j;
  }

  return [{ type: "list", ordered, start: ordered ? parseInt(first[2], 10) : 1, items }, i];
}

// --- inline ---------------------------------------------------------------

const SAFE_HREF = /^(https?:\/\/|mailto:)/i;
const BARE_URL = /^https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/;
const ESCAPABLE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

/** Keeps only http(s) and mailto links; anything else is shown as text. */
export function safeHref(href: string): string | null {
  const trimmed = href.trim();
  return SAFE_HREF.test(trimmed) ? trimmed : null;
}

/** `links` is false inside a link label: a link never contains another link. */
export function parseInline(text: string, links = true): Inline[] {
  const out: Inline[] = [];
  let buffer = "";
  const flush = () => { if (buffer) { out.push({ type: "text", text: buffer }); buffer = ""; } };
  const push = (node: Inline) => { flush(); out.push(node); };
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === "\\" && i + 1 < text.length && ESCAPABLE.test(text[i + 1])) {
      buffer += text[i + 1]; i += 2; continue;
    }
    if (ch === "\n") { push({ type: "br" }); i++; continue; }

    if (ch === "`") {
      const run = text.slice(i).match(/^`+/)![0];
      const close = findCodeClose(text, i + run.length, run.length);
      if (close >= 0) {
        let code = text.slice(i + run.length, close).replace(/\n/g, " ");
        if (code.length > 2 && code.startsWith(" ") && code.endsWith(" ") && code.trim()) code = code.slice(1, -1);
        push({ type: "code", text: code });
        i = close + run.length;
      } else {
        buffer += run; i += run.length;
      }
      continue;
    }

    if (links && ch === "[") {
      const link = matchLink(text, i);
      if (link) {
        const href = safeHref(link.href);
        const children = parseInline(link.label, false);
        if (href) push({ type: "link", href, children });
        else { flush(); out.push(...children); }
        i = link.end;
        continue;
      }
    }

    if (links && ch === "<") {
      const auto = text.slice(i).match(/^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i);
      if (auto) { push({ type: "link", href: auto[1], children: [{ type: "text", text: auto[1] }] }); i += auto[0].length; continue; }
    }

    if (links && (ch === "h" || ch === "H") && !/[A-Za-z0-9]/.test(text[i - 1] ?? "")) {
      const bare = text.slice(i).match(BARE_URL);
      if (bare) {
        const url = trimUrl(bare[0]);
        push({ type: "link", href: url, children: [{ type: "text", text: url }] });
        i += url.length;
        continue;
      }
    }

    const emphasis = matchEmphasis(text, i);
    if (emphasis) {
      push({ type: emphasis.type, children: parseInline(text.slice(emphasis.innerStart, emphasis.innerEnd), links) });
      i = emphasis.end;
      continue;
    }

    buffer += ch;
    i++;
  }
  flush();
  return out;
}

function findCodeClose(text: string, from: number, length: number) {
  for (let i = from; i < text.length;) {
    const run = text.slice(i).match(/^`+/);
    if (!run) { i++; continue; }
    if (run[0].length === length) return i;
    i += run[0].length;
  }
  return -1;
}

function matchLink(text: string, start: number) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "\\") { i++; continue; }
    if (text[i] === "[") depth++;
    else if (text[i] === "]" && --depth === 0) {
      if (text[i + 1] !== "(") return null;
      const dest = text.slice(i + 2).match(/^[ \t]*<?([^\s()<>]*(?:\([^\s()]*\)[^\s()<>]*)*)>?(?:[ \t]+"[^"]*")?[ \t]*\)/);
      if (!dest) return null;
      return { label: text.slice(start + 1, i), href: dest[1], end: i + 2 + dest[0].length };
    }
  }
  return null;
}

/** Drops trailing punctuation and an unbalanced closing parenthesis. */
function trimUrl(url: string) {
  let end = url.length;
  for (;;) {
    const last = url[end - 1];
    if (/[.,;:!?'"*_~]/.test(last)) { end--; continue; }
    if (last === ")") {
      const part = url.slice(0, end);
      if ((part.match(/\(/g)?.length ?? 0) < (part.match(/\)/g)?.length ?? 0)) { end--; continue; }
    }
    return url.slice(0, end);
  }
}

const DELIMITERS = [
  { mark: "**", type: "strong" },
  { mark: "__", type: "strong" },
  { mark: "~~", type: "del" },
  { mark: "*", type: "em" },
  { mark: "_", type: "em" },
] as const;

function matchEmphasis(text: string, start: number) {
  for (const { mark, type } of DELIMITERS) {
    if (!text.startsWith(mark, start)) continue;
    const innerStart = start + mark.length;
    if (/\s/.test(text[innerStart] ?? " ")) continue;
    // "_" does not open or close inside a word (snake_case stays as is).
    const underscore = mark[0] === "_";
    if (underscore && /[\p{L}\p{N}]/u.test(text[start - 1] ?? "")) continue;
    for (let j = innerStart + 1; j <= text.length - mark.length; j++) {
      if (text[j] === "\\") { j++; continue; }
      if (text[j] === "`") {
        const run = text.slice(j).match(/^`+/)![0];
        const close = findCodeClose(text, j + run.length, run.length);
        if (close >= 0) { j = close + run.length - 1; continue; }
      }
      if (!text.startsWith(mark, j) || text[j + mark.length] === mark[0]) continue;
      // A single mark never closes inside a double one ("*a **b** c*").
      if (mark.length === 1 && text[j - 1] === mark[0]) continue;
      if (/\s/.test(text[j - 1])) continue;
      if (underscore && /[\p{L}\p{N}]/u.test(text[j + mark.length] ?? "")) continue;
      return { type, innerStart, innerEnd: j, end: j + mark.length };
    }
  }
  return null;
}
