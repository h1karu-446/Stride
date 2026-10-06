import { Fragment, type ReactNode } from "react";
import { parseMarkdown, type Block, type Inline } from "@/lib/plans/markdown";

// Renders Markdown as React elements (never as HTML strings), so the text the
// user writes cannot inject markup or scripts.
export default function Markdown({ source }: { source: string }) {
  return <div className="space-y-3 text-sm leading-relaxed break-words">{renderBlocks(parseMarkdown(source))}</div>;
}

const HEADING_CLASS = ["", "text-xl font-bold", "text-lg font-bold", "text-base font-semibold",
  "text-sm font-semibold", "text-sm font-semibold", "text-sm font-semibold muted"];

function renderBlocks(blocks: Block[]): ReactNode {
  return blocks.map((block, i) => {
    switch (block.type) {
      case "heading": {
        // The card's own title is an h2, so Markdown headings start at h3.
        const Tag = `h${Math.min(6, block.level + 2)}` as "h3";
        return <Tag key={i} className={`${HEADING_CLASS[block.level]} pt-1`}>{renderInline(block.children)}</Tag>;
      }
      case "paragraph":
        return <p key={i}>{renderInline(block.children)}</p>;
      case "list": {
        const items = block.items.map((item, j) => (
          <li key={j} className={item.checked !== null ? "flex list-none items-start gap-2 -ml-5" : undefined}>
            {item.checked !== null && (
              <input type="checkbox" checked={item.checked} readOnly disabled
                aria-label={item.checked ? "完了" : "未完了"} className="mt-1 shrink-0" />
            )}
            <div className="min-w-0 space-y-1">
              {renderBlocks(item.blocks)}
            </div>
          </li>
        ));
        return block.ordered
          ? <ol key={i} start={block.start} className="list-decimal space-y-1 pl-5">{items}</ol>
          : <ul key={i} className="list-disc space-y-1 pl-5">{items}</ul>;
      }
      case "blockquote":
        return <blockquote key={i} className="space-y-2 border-l-4 border-slate-200 pl-3 muted dark:border-notion-border">
          {renderBlocks(block.blocks)}
        </blockquote>;
      case "code":
        return <pre key={i} className="overflow-x-auto rounded-md bg-slate-100 px-3 py-2 text-xs dark:bg-notion-panel-hover">
          <code>{block.text}</code>
        </pre>;
      case "hr":
        return <hr key={i} className="border-slate-200 dark:border-notion-border" />;
    }
  });
}

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((node, i) => {
    switch (node.type) {
      case "text": return <Fragment key={i}>{node.text}</Fragment>;
      case "br": return <br key={i} />;
      case "strong": return <strong key={i} className="font-semibold">{renderInline(node.children)}</strong>;
      case "em": return <em key={i}>{renderInline(node.children)}</em>;
      case "del": return <del key={i}>{renderInline(node.children)}</del>;
      case "code":
        return <code key={i} className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em] dark:bg-notion-panel-hover">{node.text}</code>;
      case "link":
        return <a key={i} href={node.href} target="_blank" rel="noopener noreferrer"
          className="text-notion-blue underline underline-offset-2 hover:opacity-80">{renderInline(node.children)}</a>;
    }
  });
}
