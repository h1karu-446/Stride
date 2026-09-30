import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { planHex } from "@/lib/plans/colors";
import { useUpdatePlan } from "@/lib/plans/queries";
import { parseVision, serializeVision } from "@/lib/plans/vision";
import type { Plan } from "@/types";

const PREVIEW_ITEMS = 6;

export default function GoalPanel({ plan }: { plan: Plan }) {
  const update = useUpdatePlan();
  const [editing, setEditing] = useState<"goal" | "vision" | null>(null);
  const [goalDraft, setGoalDraft] = useState("");
  const [items, setItems] = useState<string[]>([""]);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const focusNext = useRef<number | null>(null);
  const vision = parseVision(plan.goal_note);

  useEffect(() => {
    if (focusNext.current == null) return;
    inputRefs.current[focusNext.current]?.focus();
    focusNext.current = null;
  }, [items]);

  function startGoal() {
    if (update.isPending) return;
    update.reset();
    setError("");
    setGoalDraft(plan.goal ?? "");
    setEditing("goal");
  }

  function startVision() {
    if (update.isPending) return;
    update.reset();
    setError("");
    setItems(vision.length ? vision : [""]);
    setEditing("vision");
  }

  function saveGoal() {
    if (update.isPending) return;
    const goal = goalDraft.trim();
    if (goal.length > 60 || goal.includes("\n")) {
      setError("到達目標は1行・60文字までです");
      return;
    }
    update.mutate({ id: plan.id, patch: { goal } }, { onSuccess: () => setEditing(null) });
  }

  function saveVision() {
    if (update.isPending) return;
    const note = serializeVision(items.flatMap((item) => parseVision(item)));
    if (note.length > 1000) {
      setError("目指す姿は合計1000文字までです");
      return;
    }
    update.mutate({ id: plan.id, patch: { goal_note: note } }, { onSuccess: () => setEditing(null) });
  }

  function updateItem(index: number, value: string) {
    setItems((current) => current.map((item, i) => i === index ? value : item));
    setError("");
  }

  function insertAfter(index: number) {
    focusNext.current = index + 1;
    setItems((current) => [...current.slice(0, index + 1), "", ...current.slice(index + 1)]);
  }

  function removeAt(index: number) {
    focusNext.current = Math.max(0, index - 1);
    setItems((current) => current.length === 1 ? [""] : current.filter((_, i) => i !== index));
  }

  function moveItem(index: number, delta: number) {
    const next = [...items];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    focusNext.current = index + delta;
    setItems(next);
  }

  function handleItemKey(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter") {
      event.preventDefault();
      insertAfter(index);
    } else if (event.key === "Backspace" && !items[index] && items.length > 1) {
      event.preventDefault();
      removeAt(index);
    } else if (event.key === "Escape" && !update.isPending) {
      // Keep other open forms (useEscToCancel on window) from being cancelled too.
      event.nativeEvent.stopImmediatePropagation();
      setEditing(null);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>, index: number) {
    const text = event.clipboardData.getData("text");
    if (!/\r?\n/.test(text)) return;
    event.preventDefault();
    const pasted = parseVision(text);
    if (!pasted.length) return;
    const before = event.currentTarget.value.slice(0, event.currentTarget.selectionStart ?? 0);
    const after = event.currentTarget.value.slice(event.currentTarget.selectionEnd ?? event.currentTarget.value.length);
    pasted[0] = before + pasted[0];
    pasted[pasted.length - 1] += after;
    focusNext.current = index + pasted.length - 1;
    setItems((current) => [...current.slice(0, index), ...pasted, ...current.slice(index + 1)]);
  }

  return (
    <section className="rounded-xl border px-4 py-5 sm:px-6 grid gap-5 md:grid-cols-2"
      style={{ background: `${planHex(plan.color)}1F`, borderColor: `${planHex(plan.color)}55` }}>
      <div className="min-w-0">
        <h2 className="label">到達目標</h2>
        {editing === "goal" ? (
          <div className="space-y-2">
            <input autoFocus aria-label="到達目標" className="input text-lg font-semibold" disabled={update.isPending}
              value={goalDraft} maxLength={60} placeholder="例：IELTS 7.0"
              onChange={(event) => { setGoalDraft(event.target.value); setError(""); }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                if (event.key === "Enter") { event.preventDefault(); saveGoal(); }
                if (event.key === "Escape" && !update.isPending) { event.nativeEvent.stopImmediatePropagation(); setEditing(null); }
              }} />
            <EditActions onSave={saveGoal} onCancel={() => setEditing(null)} saving={update.isPending} />
          </div>
        ) : (
          <button type="button" onClick={startGoal} disabled={update.isPending} className={`block max-w-full rounded-lg text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-notion-blue ${plan.goal ? "text-2xl font-bold break-words" : "text-sm muted"}`}>
            {plan.goal || "＋ 到達目標を設定"}
          </button>
        )}
      </div>
      <div className="min-w-0 md:border-l md:pl-6" style={{ borderColor: `${planHex(plan.color)}55` }}>
        <h2 className="label">目指す姿</h2>
        {editing === "vision" ? (
          <div className="space-y-3">
            <ul className="space-y-2">
              {items.map((item, index) => (
                <li key={index} className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="shrink-0">•</span>
                  <input ref={(element) => { inputRefs.current[index] = element; }} autoFocus={index === 0} disabled={update.isPending}
                    aria-label={`目指す姿 ${index + 1}`} className="input min-w-0 flex-1 !py-1.5 text-sm"
                    value={item} placeholder="できるようになりたいこと"
                    onChange={(event) => updateItem(index, event.target.value)}
                    onKeyDown={(event) => handleItemKey(event, index)}
                    onPaste={(event) => handlePaste(event, index)} />
                  <button type="button" aria-label={`${index + 1}番目を上へ`} disabled={update.isPending || index === 0} onClick={() => moveItem(index, -1)} className="shrink-0 text-xs muted disabled:opacity-30" title="上へ">↑</button>
                  <button type="button" aria-label={`${index + 1}番目を下へ`} disabled={update.isPending || index === items.length - 1} onClick={() => moveItem(index, 1)} className="shrink-0 text-xs muted disabled:opacity-30" title="下へ">↓</button>
                  <button type="button" aria-label={`${index + 1}番目を削除`} disabled={update.isPending} onClick={() => removeAt(index)} className="shrink-0 text-xs muted hover:text-rose-600" title="削除">×</button>
                </li>
              ))}
            </ul>
            <button type="button" disabled={update.isPending} className="text-xs text-notion-blue hover:underline" onClick={() => insertAfter(items.length - 1)}>＋ 項目を追加</button>
            <EditActions onSave={saveVision} onCancel={() => setEditing(null)} saving={update.isPending} />
          </div>
        ) : vision.length ? (
          <div>
            <ul tabIndex={0} title="クリックで編集" onClick={startVision} onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); startVision(); }
            }} className="list-disc cursor-text space-y-1 rounded-lg pl-5 text-sm break-words hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-notion-blue">
              {(expanded ? vision : vision.slice(0, PREVIEW_ITEMS)).map((item, index) => <li key={index}>{item}</li>)}
            </ul>
            {vision.length > PREVIEW_ITEMS && <button type="button" onClick={() => setExpanded(!expanded)} className="mt-1 text-xs text-notion-blue hover:underline">{expanded ? "閉じる" : "続きを表示"}</button>}
          </div>
        ) : (
          <button type="button" disabled={update.isPending} onClick={startVision} className="text-sm muted hover:underline">＋ 目指す姿を追加</button>
        )}
      </div>
      {(error || update.isError) && editing && <p role="alert" className="text-xs text-rose-600 md:col-span-2">{error || "保存に失敗しました。入力を確認して再試行してください"}</p>}
    </section>
  );
}

function EditActions({ onSave, onCancel, saving }: { onSave: () => void; onCancel: () => void; saving: boolean }) {
  return <div className="flex gap-2 text-xs">
    <button type="button" onClick={onSave} disabled={saving} className="btn-primary !px-3 !py-1">保存</button>
    <button type="button" onClick={onCancel} disabled={saving} className="btn-outline !px-3 !py-1">キャンセル</button>
  </div>;
}
