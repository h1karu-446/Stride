import { useState } from "react";
import clsx from "clsx";
import { Field, FormActions, useEscToCancel } from "@/components/common/FormParts";
import { hasErrors, validateSchedule } from "@/lib/plans/logic";
import { IMPORTANCE_LIST, type Importance } from "@/types";

export type ScheduleInput = {
  title: string;
  scheduled_date: string;
  importance: Importance;
  is_milestone: boolean;
};

/** Inline edit form for a plan schedule (spec 4.2, 3.6). */
export default function ScheduleForm({
  initial,
  originalDate,
  today,
  onSubmit,
  onDelete,
  onCancel,
  saving,
  failed,
}: {
  initial: ScheduleInput;
  /** Saved date when editing; keeping a past one is allowed (BR-04). */
  originalDate?: string;
  today: string;
  onSubmit: (v: ScheduleInput) => void;
  onDelete?: () => void;
  onCancel: () => void;
  saving?: boolean;
  failed?: boolean;
}) {
  const [v, setV] = useState(initial);
  const patch = (p: Partial<ScheduleInput>) => setV((cur) => ({ ...cur, ...p }));
  const errors = validateSchedule(v, today, originalDate);
  const canSave = !hasErrors(errors);
  useEscToCancel(onCancel);

  return (
    <form
      className="rounded-lg border border-slate-200 dark:border-notion-border p-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave && !saving) onSubmit({ ...v, title: v.title.trim() });
      }}
    >
      <Field label="タイトル" error={v.title ? errors.title : undefined}>
        <input autoFocus className="input" value={v.title}
          onChange={(e) => patch({ title: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="日付" error={errors.scheduled_date}>
          <input type="date" className="input" value={v.scheduled_date}
            min={originalDate && originalDate < today ? originalDate : today}
            onChange={(e) => patch({ scheduled_date: e.target.value })} />
        </Field>
        <Field group label="重要度">
          <div className="flex gap-1.5">
            {IMPORTANCE_LIST.map((i) => (
              <button key={i} type="button" aria-pressed={v.importance === i}
                onClick={() => patch({ importance: i })}
                className={clsx("flex-1 rounded-md border px-2 py-2 text-sm",
                  v.importance === i
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-slate-300 dark:border-notion-border")}>
                {i}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.is_milestone}
          onChange={(e) => patch({ is_milestone: e.target.checked })} />
        マイルストーン ◇
      </label>
      <FormActions onDelete={onDelete} onCancel={onCancel}
        canSave={canSave} saving={saving} error={failed} />
    </form>
  );
}
