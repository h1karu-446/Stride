import { useEffect, useState } from "react";
import { Field, FormActions } from "@/components/common/FormParts";
import DatePicker from "@/components/common/DatePicker";
import { hasErrors, validatePhase } from "@/lib/plans/logic";
import type { PhaseInput } from "@/lib/plans/queries";
import type { Phase } from "@/types";

export default function PhaseForm({
  initial,
  siblings,
  selfId,
  onSubmit,
  onDelete,
  onCancel,
  saving,
  failed,
}: {
  initial: PhaseInput;
  siblings: Phase[];
  selfId?: string;
  onSubmit: (v: PhaseInput) => void;
  onDelete?: () => void;
  onCancel: () => void;
  saving?: boolean;
  failed?: boolean;
}) {
  const [v, setV] = useState(initial);
  const errors = validatePhase(v, siblings, selfId);
  const canSave = !hasErrors(errors);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A modal handles its own Esc; do not also discard this form.
      if (e.key === "Escape" && !document.querySelector("[role=dialog]")) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <form
      className="rounded-lg border border-slate-200 dark:border-notion-border p-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave && !saving) onSubmit(v);
      }}
    >
      <Field label="フェーズ名" error={v.name ? errors.name : undefined}>
        <input autoFocus className="input" value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })} />
      </Field>
      <div className="rounded-xl bg-slate-50 p-3 dark:bg-notion-panel-hover">
        <span className="label">フェーズの期間</span>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
          <div className="min-w-0">
            <span className="mb-1 block text-xs muted">開始日</span>
            <DatePicker label="フェーズの開始日" value={v.start_date}
              onChange={(date) => setV({ ...v, start_date: date })} emptyLabel="開始日を選ぶ" />
          </div>
          <span className="pl-2 text-sm muted sm:pb-2 sm:pl-0" aria-hidden="true"><span className="sm:hidden">↓</span><span className="hidden sm:inline">→</span></span>
          <div className="min-w-0">
            <span className="mb-1 block text-xs muted">終了日</span>
            <DatePicker label="フェーズの終了日" value={v.end_date}
              onChange={(date) => setV({ ...v, end_date: date })} emptyLabel="終了日を選ぶ" />
          </div>
        </div>
        {errors.start_date && <p className="mt-2 text-xs text-rose-600">{errors.start_date}</p>}
        {errors.end_date && <p className="mt-2 text-xs text-rose-600">{errors.end_date}</p>}
      </div>
      <FormActions onDelete={onDelete} onCancel={onCancel}
        canSave={canSave} saving={saving} error={failed} />
    </form>
  );
}
