import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import Markdown from "@/components/common/Markdown";
import { useUpdatePlan } from "@/lib/plans/queries";
import type { Plan } from "@/types";

export const OVERVIEW_MAX = 10000;

// Free-form Markdown notes about the plan (Issue #70), at the bottom of the plan page.
export default function PlanOverview({ plan }: { plan: Plan }) {
  const update = useUpdatePlan();
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saved = plan.overview ?? "";
  const tooLong = draft.length > OVERVIEW_MAX;

  // Grow the textarea with its content so long notes don't need an inner scroll.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [draft, editing, preview]);

  function start() {
    if (update.isPending) return;
    update.reset();
    setDraft(saved);
    setPreview(false);
    setEditing(true);
  }

  function cancel() {
    if (update.isPending) return;
    if (draft !== saved && !window.confirm("保存していない概要の変更を破棄しますか？")) return;
    setEditing(false);
  }

  function save() {
    if (update.isPending || tooLong) return;
    update.mutate({ id: plan.id, patch: { overview: draft } }, { onSuccess: () => setEditing(false) });
  }

  function handleKey(event: KeyboardEvent<HTMLElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      save();
    } else if (event.key === "Escape") {
      // Keep other open forms (useEscToCancel on window) from being cancelled too.
      event.nativeEvent.stopImmediatePropagation();
      cancel();
    }
  }

  // Clicking the text edits it, but not when following a link or selecting text.
  function handleViewClick(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("a")) return;
    if (window.getSelection()?.toString()) return;
    start();
  }

  return (
    <section className="card space-y-3" aria-labelledby="plan-overview-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="plan-overview-title" className="section-title">概要</h2>
        {editing ? (
          <div role="tablist" aria-label="概要の表示" className="flex gap-1 text-xs">
            {[false, true].map((p) => (
              <button key={String(p)} type="button" role="tab" aria-selected={preview === p}
                onClick={() => setPreview(p)}
                className={`rounded-md px-2 py-1 ${preview === p ? "bg-slate-100 font-medium dark:bg-notion-panel-hover" : "muted hover:bg-slate-50 dark:hover:bg-notion-panel-hover"}`}>
                {p ? "プレビュー" : "編集"}
              </button>
            ))}
          </div>
        ) : saved && (
          <button type="button" aria-label="概要を編集" className="btn-ghost !p-1.5 muted" onClick={start}>✎</button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2" onKeyDown={handleKey}>
          {preview ? (
            <div className="min-h-[10rem] rounded-md border border-slate-200 px-3 py-2 dark:border-notion-border">
              {draft.trim() ? <Markdown source={draft} /> : <p className="text-sm muted">プレビューする内容がありません</p>}
            </div>
          ) : (
            <textarea ref={textareaRef} autoFocus aria-label="概要（Markdown）" disabled={update.isPending}
              className="input min-h-[10rem] resize-none font-mono text-[13px] leading-relaxed"
              value={draft} onChange={(event) => setDraft(event.target.value)}
              placeholder={"## 方針\n- 毎朝30分は単語\n- [ ] 6月に模試を受ける\n\n参考: https://example.com"} />
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button type="button" onClick={save} disabled={update.isPending || tooLong} className="btn-primary !px-3 !py-1">保存</button>
            <button type="button" onClick={cancel} disabled={update.isPending} className="btn-outline !px-3 !py-1">キャンセル</button>
            <span className="muted">Markdown 対応 · ⌘/Ctrl+Enter で保存</span>
            <span className={`ml-auto tabular-nums ${tooLong ? "font-medium text-rose-600" : "muted"}`}>
              {draft.length.toLocaleString()} / {OVERVIEW_MAX.toLocaleString()}
            </span>
          </div>
          {tooLong && <p role="alert" className="text-xs text-rose-600">概要は{OVERVIEW_MAX.toLocaleString()}文字までです</p>}
          {update.isError && <p role="alert" className="text-xs text-rose-600">保存できませんでした。もう一度操作してください</p>}
        </div>
      ) : saved.trim() ? (
        <div tabIndex={0} title="クリックで編集" onClick={handleViewClick}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.target === event.currentTarget) { event.preventDefault(); start(); }
          }}
          className="cursor-text rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-notion-blue">
          <Markdown source={saved} />
        </div>
      ) : (
        <button type="button" onClick={start} className="text-sm muted hover:underline">＋ 概要を書く</button>
      )}
    </section>
  );
}
