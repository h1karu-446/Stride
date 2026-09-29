import { useState } from "react";
import Modal from "@/components/common/Modal";
import { Field, FormActions } from "@/components/common/FormParts";
import { PLAN_COLORS } from "@/lib/plans/colors";
import { hasErrors, PLAN_STATUS_LABEL, validatePlan } from "@/lib/plans/logic";
import type { PlanInput } from "@/lib/plans/queries";
import type { PlanStatus } from "@/types";

/** Create (mode="create") or edit (mode="edit") a plan. */
export default function PlanFormModal({
  mode,
  initial,
  onSubmit,
  onDelete,
  onClose,
  saving,
  failed,
}: {
  mode: "create" | "edit";
  initial: PlanInput;
  onSubmit: (v: PlanInput) => void;
  onDelete?: () => void;
  onClose: () => void;
  saving?: boolean;
  failed?: boolean;
}) {
  const [v, setV] = useState<PlanInput>(initial);
  const errors = validatePlan(v);
  const canSave = !hasErrors(errors);

  return (
    <Modal title={mode === "create" ? "新しい計画" : "計画を編集"} onClose={onClose}>
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
          <div className="flex flex-wrap gap-2">
            {PLAN_COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                aria-label={c.label}
                aria-pressed={v.color === c.key}
                onClick={() => setV({ ...v, color: c.key })}
                className="w-7 h-7 rounded-full border-2 transition"
                style={{
                  background: c.hex,
                  borderColor: v.color === c.key ? "currentColor" : "transparent",
                }}
              />
            ))}
          </div>
        </Field>
        {mode === "create" && (
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
        )}
        <Field label="期日（任意）">
          <input
            type="date"
            className="input"
            value={v.due_date ?? ""}
            onChange={(e) => setV({ ...v, due_date: e.target.value || undefined })}
          />
        </Field>
        {mode === "edit" && (
          <>
            <Field label="目標（任意）" error={errors.goal}>
              <input
                className="input"
                value={v.goal ?? ""}
                onChange={(e) => setV({ ...v, goal: e.target.value })}
              />
            </Field>
            <Field label="補足（任意）" error={errors.goal_note}>
              <textarea
                className="input min-h-[96px]"
                value={v.goal_note ?? ""}
                onChange={(e) => setV({ ...v, goal_note: e.target.value })}
              />
            </Field>
          </>
        )}
        <FormActions
          onDelete={onDelete}
          onCancel={onClose}
          saveLabel={mode === "create" ? "作成" : "保存"}
          canSave={canSave}
          saving={saving}
          error={failed}
        />
      </form>
    </Modal>
  );
}
