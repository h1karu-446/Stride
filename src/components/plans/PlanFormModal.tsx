import { useState } from "react";
import Modal from "@/components/common/Modal";
import DatePicker from "@/components/common/DatePicker";
import { Field, FormActions } from "@/components/common/FormParts";
import { PLAN_COLORS } from "@/lib/plans/colors";
import { hasErrors, PLAN_STATUS_LABEL, validatePlan } from "@/lib/plans/logic";
import type { PlanInput } from "@/lib/plans/queries";
import type { PlanStatus } from "@/types";

/** The creation form; plan details are edited at their display positions. */
export default function PlanFormModal({
  initial,
  onSubmit,
  onClose,
  saving,
  failed,
}: {
  initial: PlanInput;
  onSubmit: (v: PlanInput) => void;
  onClose: () => void;
  saving?: boolean;
  failed?: boolean;
}) {
  const [v, setV] = useState<PlanInput>(initial);
  const errors = validatePlan(v);
  const canSave = !hasErrors(errors);

  return (
    <Modal title="新しい計画" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave && !saving) onSubmit(v);
        }}
      >
        <Field label="計画名" error={v.name ? errors.name : undefined}>
          <input
            autoFocus
            className="input"
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
          />
        </Field>
        <Field group label="色">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PLAN_COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                aria-label={c.label}
                aria-pressed={v.color === c.key}
                onClick={() => setV({ ...v, color: c.key })}
                className={`flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-notion-blue ${v.color === c.key ? "border-slate-700 bg-slate-100 font-semibold ring-1 ring-slate-700 dark:border-slate-300 dark:bg-notion-panel-hover dark:ring-slate-300" : "border-slate-200 hover:bg-slate-50 dark:border-notion-border dark:hover:bg-notion-panel-hover"}`}
              >
                <span className="h-5 w-5 shrink-0 rounded-full border border-black/10" style={{ background: c.hex }} aria-hidden="true" />
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="状態">
          <select
            className="input"
            value={v.status}
            onChange={(e) => setV({ ...v, status: e.target.value as PlanStatus })}
          >
            {(Object.keys(PLAN_STATUS_LABEL) as PlanStatus[]).map((s) => (
              <option key={s} value={s}>{PLAN_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </Field>
        <div>
          <span className="label">期日</span>
          <DatePicker
            label="計画の期日"
            value={v.due_date ?? ""}
            onChange={(date) => setV({ ...v, due_date: date || undefined })}
            emptyLabel="＋ 期日を設定"
            allowClear
          />
          {!v.due_date && <p className="mt-1 text-xs muted">期限なし</p>}
        </div>
        <FormActions
          onCancel={onClose}
          saveLabel="作成"
          canSave={canSave}
          saving={saving}
          error={failed}
        />
      </form>
    </Modal>
  );
}
