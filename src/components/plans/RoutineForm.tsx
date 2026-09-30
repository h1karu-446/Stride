import { useEffect, useState } from "react";
import clsx from "clsx";
import { Field, FormActions } from "@/components/common/FormParts";
import { hasErrors, validateRoutine } from "@/lib/plans/logic";
import type { RoutineInput } from "@/lib/plans/queries";
import type { Importance } from "@/types";

const DAYS = ["月", "火", "水", "木", "金", "土", "日"];
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
      className="rounded-lg border border-slate-200 dark:border-notion-border p-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave && !saving) onSubmit({ ...v, minutes });
      }}
    >
      <Field label="メニュー（必須）" error={v.title ? errors.title : undefined}>
        <input autoFocus className="input" value={v.title}
          placeholder="例：IELTSのListeningを30分解く"
          onChange={(e) => setV({ ...v, title: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="所要時間（分）" error={errors.minutes}>
          <input type="number" step={5} min={5} max={600} className="input"
            value={minutesText} onChange={(e) => setMinutesText(e.target.value)} />
        </Field>
        <Field group label="重要度">
          <div className="flex gap-1.5">
            {IMPORTANCES.map((i) => (
              <button key={i} type="button" onClick={() => setV({ ...v, importance: i })}
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
      <Field group label="曜日" error={errors.weekdays}>
        <div className="flex gap-1.5">
          {DAYS.map((label, idx) => {
            const d = idx + 1;
            const on = v.weekdays.includes(d);
            return (
              <button key={d} type="button" aria-pressed={on} onClick={() => toggle(d)}
                className={clsx("flex-1 rounded-md border py-1.5 text-sm",
                  on ? "border-blue-500 bg-blue-500/10"
                     : "border-slate-300 dark:border-notion-border muted")}>
                {label}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="メニューの詳細（任意）" error={errors.menu}>
        <textarea className="input min-h-[96px]" value={v.menu ?? ""}
          placeholder="例：公式問題集10のTest 2。間違えた設問は聞き直す"
          onChange={(e) => setV({ ...v, menu: e.target.value })} />
      </Field>
      <FormActions onDelete={onDelete} onCancel={onCancel}
        canSave={canSave} saving={saving} error={failed} />
    </form>
  );
}
