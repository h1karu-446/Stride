import { useEffect, useRef, useState } from "react";
import PlanIcon from "./PlanIcon";
import { Link } from "react-router-dom";
import DatePicker from "@/components/common/DatePicker";
import StatusMenu from "@/components/plans/StatusMenu";
import { PLAN_COLORS, planHex } from "@/lib/plans/colors";
import { daysLeftLabel } from "@/lib/plans/logic";
import { useUpdatePlan } from "@/lib/plans/queries";
import type { Plan } from "@/types";

export default function PlanHeader({ plan, today, onDelete, deleteFailed }: {
  plan: Plan;
  today: string;
  onDelete: () => void;
  deleteFailed: boolean;
}) {
  const update = useUpdatePlan();
  const [colorOpen, setColorOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(plan.name);
  const [nameError, setNameError] = useState("");
  const colorRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!colorRef.current?.contains(target)) setColorOpen(false);
      if (!moreRef.current?.contains(target)) setMoreOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  function saveName() {
    if (update.isPending) return;
    const name = nameDraft.trim();
    if (!name || name.length > 40) {
      setNameError("計画名は1〜40文字で入力してください");
      return;
    }
    update.mutate({ id: plan.id, patch: { name } }, { onSuccess: () => setEditingName(false) });
  }

  return (
    <header>
      <Link to="/plans" className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 -ml-1.5 text-sm muted transition hover:bg-slate-100 dark:hover:bg-notion-panel-hover">‹ 計画</Link>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div ref={colorRef} className="relative">
          <button type="button" aria-label="計画の色を変更" aria-expanded={colorOpen}
            onClick={() => setColorOpen(!colorOpen)}
            title="色を変更"
            className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-notion-blue dark:hover:bg-notion-panel-hover">
            <PlanIcon plan={plan} size="lg" />
          </button>
          {colorOpen && (
            <div role="group" aria-label="計画の色" className="absolute left-0 top-10 z-30 grid w-[min(18rem,calc(100vw-2rem))] grid-cols-2 gap-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-notion-border dark:bg-notion-panel">
              {PLAN_COLORS.map((color) => (
                <button key={color.key} type="button" aria-pressed={plan.color === color.key}
                  onClick={() => {
                    update.mutate({ id: plan.id, patch: { color: color.key } });
                    setColorOpen(false);
                  }}
                  className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs ${plan.color === color.key ? "border-slate-700 font-semibold ring-1 ring-slate-700 dark:border-slate-300 dark:ring-slate-300" : "border-slate-200 dark:border-notion-border"}`}>
                  <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: color.hex }} aria-hidden="true" />
                  {color.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {editingName ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <input autoFocus aria-label="計画名" className="input !w-auto min-w-[160px] flex-1 text-xl font-bold" disabled={update.isPending}
              value={nameDraft} maxLength={40}
              onChange={(event) => { setNameDraft(event.target.value); setNameError(""); }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                if (event.key === "Enter") { event.preventDefault(); saveName(); }
                if (event.key === "Escape" && !update.isPending) { event.nativeEvent.stopImmediatePropagation(); setEditingName(false); setNameError(""); }
              }} />
            <button type="button" onClick={saveName} disabled={update.isPending} className="btn-primary !px-2 !py-1 text-xs">保存</button>
            <button type="button" onClick={() => { setEditingName(false); setNameError(""); }} disabled={update.isPending} className="btn-outline !px-2 !py-1 text-xs">取消</button>
          </div>
        ) : (
          <button type="button" disabled={update.isPending} onClick={() => { update.reset(); setNameDraft(plan.name); setNameError(""); setEditingName(true); }}
            className="min-w-0 flex-1 basis-[180px] cursor-pointer rounded-lg text-left text-2xl font-bold tracking-tight break-words focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-notion-blue sm:text-3xl">
            {plan.name}
          </button>
        )}
        <StatusMenu status={plan.status} onChange={(status) => update.mutate({ id: plan.id, patch: { status } })} />
        <div className="flex items-center gap-2 text-sm">
          <DatePicker label="計画の期日" value={plan.due_date ?? ""} emptyLabel="＋ 期日を設定" allowClear
            onChange={(due_date) => update.mutate({ id: plan.id, patch: { due_date } })} />
          {plan.due_date && <span className="muted">{daysLeftLabel(plan.due_date, today)}</span>}
        </div>
        <div ref={moreRef} className="relative ml-auto">
          <button type="button" aria-label="その他の操作" aria-expanded={moreOpen} className="btn-ghost !px-2 !py-1"
            onClick={() => setMoreOpen(!moreOpen)}>⋯</button>
          {moreOpen && (
            <div className="absolute right-0 top-9 z-30 min-w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-notion-border dark:bg-notion-panel">
              <button type="button" onClick={() => { setMoreOpen(false); onDelete(); }} className="w-full rounded px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10">計画を削除</button>
            </div>
          )}
        </div>
      </div>
      {(nameError || update.isError || deleteFailed) && (
        <p role="alert" className="mt-2 text-xs text-rose-600">{nameError || (deleteFailed ? "削除できませんでした。もう一度操作してください" : "保存できませんでした。もう一度操作してください")}</p>
      )}
    </header>
  );
}
