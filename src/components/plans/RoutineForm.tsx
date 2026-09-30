import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import clsx from "clsx";
import { FormActions } from "@/components/common/FormParts";
import { hasErrors, validateRoutine } from "@/lib/plans/logic";
import type { RoutineInput } from "@/lib/plans/queries";
import type { Importance } from "@/types";
import { ISO_WEEKDAY_CHAR, ISO_WEEKDAYS_IN_ORDER } from "@/lib/calendar";
import { formatMinutes } from "@/lib/plans/logic";
import { MINUTE_PRESETS, sameDays, WEEKDAY_PRESETS } from "./routinePresets";

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
    // Same footprint as a menu card, so editing one keeps the grid in place.
    <form aria-label="メニューを編集"
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-notion-blue/60 p-4 ring-1 ring-notion-blue/20"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave && !saving) onSubmit({ ...v, minutes });
      }}
    >
      <div>
        <input autoFocus aria-label="メニュー（必須）" className="input font-semibold" value={v.title} disabled={saving}
          placeholder="メニュー名：例）Listeningを30分解く"
          onChange={(e) => setV({ ...v, title: e.target.value })} />
        {v.title && errors.title && <p className="mt-1 text-xs text-red-500">{errors.title}</p>}
      </div>
      <Row label="時間" error={errors.minutes}>
        {MINUTE_PRESETS.map((m) => <button key={m} type="button" disabled={saving} aria-pressed={minutes === m}
          className={pill(minutes === m)} onClick={() => setMinutesText(String(m))}>{formatMinutes(m)}</button>)}
        <label className="flex items-center gap-1 text-xs muted">
          <input type="number" step={5} min={5} max={600} aria-label="所要時間（分）" className="input !w-16 !px-2 !py-0.5 text-xs" disabled={saving}
            value={minutesText} onChange={(e) => setMinutesText(e.target.value)} />分
        </label>
      </Row>
      <Row label="曜日" error={errors.weekdays}>
        {WEEKDAY_PRESETS.map((p) => <button key={p.label} type="button" disabled={saving} aria-pressed={sameDays(v.weekdays, p.days)}
          className={pill(sameDays(v.weekdays, p.days))} onClick={() => setV({ ...v, weekdays: p.days })}>{p.label}</button>)}
        <span className="flex gap-1">
          {ISO_WEEKDAYS_IN_ORDER.map((d) => {
            const on = v.weekdays.includes(d);
            return (
              <button key={d} type="button" aria-pressed={on} disabled={saving} onClick={() => toggle(d)}
                className={clsx("h-6 w-6 rounded border text-xs",
                  on ? "border-notion-blue bg-notion-blue/10"
                     : "border-slate-300 dark:border-notion-border muted")}>
                {ISO_WEEKDAY_CHAR[d]}
              </button>
            );
          })}
        </span>
      </Row>
      <Row label="重要度">
        {IMPORTANCES.map((i) => (
          <button key={i} type="button" disabled={saving} aria-pressed={v.importance === i}
            onClick={() => setV({ ...v, importance: i })} className={pill(v.importance === i)}>
            {i}
          </button>
        ))}
      </Row>
      <div className="border-t border-slate-100 pt-3 dark:border-notion-border">
        <textarea aria-label="メニューの詳細（任意）" className="input min-h-[72px] text-sm" value={v.menu ?? ""} disabled={saving}
          placeholder="詳細（任意）：例）公式問題集10のTest 2"
          onChange={(e) => setV({ ...v, menu: e.target.value })} />
        {errors.menu && <p className="mt-1 text-xs text-red-500">{errors.menu}</p>}
      </div>
      <FormActions onDelete={onDelete} onCancel={onCancel}
        canSave={canSave} saving={saving} error={failed} />
    </form>
  );
}

/** Small toggle, the size of the chips on a menu card. */
const pill = (active: boolean) => clsx("rounded-full border px-2.5 py-0.5 text-xs transition", active
  ? "border-notion-blue bg-notion-blue text-white" : "border-slate-300 hover:border-slate-400 dark:border-notion-border");

function Row({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex items-start gap-2">
      <span className="w-12 shrink-0 pt-0.5 text-xs muted">{label}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">{children}</div>
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
    </div>
  );
}
