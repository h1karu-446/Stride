import { useState } from "react";
import clsx from "clsx";
import DatePicker from "@/components/common/DatePicker";
import { Field, FormActions, useEscToCancel } from "@/components/common/FormParts";
import { hasErrors, validateSchedule, type ScheduleValues } from "@/lib/plans/logic";
import { IMPORTANCE_LIST } from "@/types";

export type ScheduleInput = ScheduleValues;

/**
 * Inline edit form for a plan schedule (spec 4.2, 3.6).
 * `lock` is set for a schedule dated before today (BR-04): only the title can
 * change, and for an overdue one that has not been carried over yet
 * (`lock.carry`), choosing a date from today on copies it to that date.
 */
export default function ScheduleForm({
  initial,
  originalDate,
  today,
  lock,
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
  lock?: { carry: boolean };
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
  const dateLocked = !!lock && !lock.carry;
  const carrying = !!lock?.carry && v.scheduled_date !== originalDate;
  const minDate = originalDate && originalDate < today && !lock ? originalDate : today;
  useEscToCancel(onCancel, !!saving);

  return (
    <form
      className="space-y-3 rounded-xl bg-slate-50/70 p-4 dark:bg-notion-panel-hover"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave && !saving) onSubmit({ ...v, title: v.title.trim() });
      }}
    >
      {lock && (
        <p className="text-xs muted">
          過去の予定は、タイトルだけ変更できます
          {lock.carry && "。日付を今日以降にすると、この予定を元の日に残したまま、その日に複製します"}
        </p>
      )}
      <Field label="タイトル" error={v.title ? errors.title : undefined}>
        <input autoFocus className="input text-base font-medium" value={v.title}
          disabled={saving}
          onChange={(e) => patch({ title: e.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field group label={carrying ? "日付（複製先）" : "日付"} error={errors.scheduled_date}>
          <DatePicker label={carrying ? "日付（複製先）" : "日付"}
            value={v.scheduled_date} minDate={minDate} disabled={dateLocked || saving}
            onChange={(date) => patch({ scheduled_date: date })} />
        </Field>
        <Field group label="重要度">
          <div className="flex gap-1.5">
            {IMPORTANCE_LIST.map((i) => (
              <button key={i} type="button" aria-pressed={v.importance === i}
                disabled={!!lock || saving}
                onClick={() => patch({ importance: i })}
                className={clsx("flex-1 rounded-md border px-2 py-2 text-sm disabled:opacity-60",
                  v.importance === i
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-slate-300 dark:border-notion-border")}>
                {i}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <label className={clsx("flex items-center gap-2 text-sm", lock && "opacity-60")}>
        <input type="checkbox" checked={v.is_milestone} disabled={!!lock || saving}
          onChange={(e) => patch({ is_milestone: e.target.checked })} />
        マイルストーン ◇
      </label>
      <FormActions onDelete={lock ? undefined : onDelete} onCancel={onCancel}
        saveLabel={carrying ? "複製して保存" : undefined}
        canSave={canSave} saving={saving} error={failed} />
    </form>
  );
}
