import { useEffect, useState } from "react";
import { Field, FormActions } from "@/components/common/FormParts";
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
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <form
      className="rounded-lg border border-slate-200 dark:border-notion-border p-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSubmit(v);
      }}
    >
      <Field label="フェーズ名" error={v.name ? errors.name : undefined}>
        <input autoFocus className="input" value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="開始日" error={errors.start_date}>
          <input type="date" className="input" value={v.start_date}
            onChange={(e) => setV({ ...v, start_date: e.target.value })} />
        </Field>
        <Field label="終了日" error={errors.end_date}>
          <input type="date" className="input" value={v.end_date}
            onChange={(e) => setV({ ...v, end_date: e.target.value })} />
        </Field>
      </div>
      <FormActions onDelete={onDelete} onCancel={onCancel}
        canSave={canSave} saving={saving} error={failed} />
    </form>
  );
}
