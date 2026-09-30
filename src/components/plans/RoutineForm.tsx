import { useEffect, useState } from "react";
import clsx from "clsx";
import { Field, FormActions } from "@/components/common/FormParts";
import { hasErrors, validateRoutine } from "@/lib/plans/logic";
import type { RoutineInput } from "@/lib/plans/queries";
import type { Importance } from "@/types";
import { ISO_WEEKDAY_CHAR, ISO_WEEKDAYS_IN_ORDER } from "@/lib/calendar";
import { formatMinutes } from "@/lib/plans/logic";
import { chip, MINUTE_PRESETS, sameDays, WEEKDAY_PRESETS } from "./routinePresets";

const IMPORTANCES: Importance[] = ["重", "中", "軽"];

export default function RoutineForm({
  initial,
  onSubmit,
  onDelete,
  onCancel,
  saving,
  failed,
}: {
  initial: RoutineInput;
  onSubmit: (v: RoutineInput) => void;
  onDelete?: () => void;
  onCancel: () => void;
  saving?: boolean;
  failed?: boolean;
}) {
  const [v, setV] = useState(initial);
  const [minutesText, setMinutesText] = useState(String(initial.minutes));
  const minutes = Number(minutesText);
  const errors = validateRoutine({ ...v, minutes });
  const canSave = !hasErrors(errors);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A modal handles its own Esc; do not also discard this form.
      if (e.key === "Escape" && !e.isComposing && e.keyCode !== 229
          && !document.querySelector("[role=dialog]") && !saving) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, saving]);

  const toggle = (d: number) =>
    setV({
      ...v,
      weekdays: v.weekdays.includes(d)
        ? v.weekdays.filter((x) => x !== d)
        : [...v.weekdays, d],
    });

  return (
    <form
      className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-notion-border"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave && !saving) onSubmit({ ...v, minutes });
      }}
    >
      <Field label="メニュー（必須）" error={v.title ? errors.title : undefined}>
        <input autoFocus className="input text-base font-medium" value={v.title} disabled={saving}
          placeholder="例：IELTSのListeningを30分解く"
          onChange={(e) => setV({ ...v, title: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field group label="所要時間" error={errors.minutes}>
          <div className="flex flex-wrap items-center gap-1.5">
            {MINUTE_PRESETS.map((m) => <button key={m} type="button" disabled={saving} aria-pressed={minutes === m}
              className={chip(minutes === m)} onClick={() => setMinutesText(String(m))}>{formatMinutes(m)}</button>)}
            <label className="flex items-center gap-1 text-xs muted">
              <input type="number" step={5} min={5} max={600} aria-label="所要時間（分）" className="input !w-20 !py-1 text-sm" disabled={saving}
                value={minutesText} onChange={(e) => setMinutesText(e.target.value)} />分
            </label>
          </div>
        </Field>
        <Field group label="重要度">
          <div className="flex gap-1.5">
            {IMPORTANCES.map((i) => (
              <button key={i} type="button" disabled={saving} onClick={() => setV({ ...v, importance: i })}
                className={clsx("flex-1 rounded-md border px-2 py-2 text-sm",
                  v.importance === i
                    ? "border-notion-blue bg-notion-blue/10"
                    : "border-slate-300 dark:border-notion-border")}>
                {i}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <Field group label="曜日" error={errors.weekdays}>
        <div className="mb-2 flex gap-1.5">
          {WEEKDAY_PRESETS.map((p) => <button key={p.label} type="button" disabled={saving} aria-pressed={sameDays(v.weekdays, p.days)}
            className={chip(sameDays(v.weekdays, p.days))} onClick={() => setV({ ...v, weekdays: p.days })}>{p.label}</button>)}
        </div>
        <div className="flex gap-1.5">
          {ISO_WEEKDAYS_IN_ORDER.map((d) => {
            const label = ISO_WEEKDAY_CHAR[d];
            const on = v.weekdays.includes(d);
            return (
              <button key={d} type="button" aria-pressed={on} disabled={saving} onClick={() => toggle(d)}
                className={clsx("flex-1 rounded-md border py-1.5 text-sm",
                  on ? "border-notion-blue bg-notion-blue/10"
                     : "border-slate-300 dark:border-notion-border muted")}>
                {label}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="メニューの詳細（任意）" error={errors.menu}>
        <textarea className="input min-h-[96px]" value={v.menu ?? ""} disabled={saving}
          placeholder="例：公式問題集10のTest 2。間違えた設問は聞き直す"
          onChange={(e) => setV({ ...v, menu: e.target.value })} />
      </Field>
      <FormActions onDelete={onDelete} onCancel={onCancel}
        canSave={canSave} saving={saving} error={failed} />
    </form>
  );
}
