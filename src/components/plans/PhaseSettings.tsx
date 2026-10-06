import { useEffect, useState } from "react";
import DatePicker from "@/components/common/DatePicker";
import { choiceClass, Field, FormActions, FOCUS_RING, TOUCH_TARGET } from "@/components/common/FormParts";
import { todayISO } from "@/lib/date";
import { ISO_WEEKDAY_CHAR, ISO_WEEKDAYS_IN_ORDER } from "@/lib/calendar";
import { chip, MINUTE_PRESETS, WEEKDAY_PRESETS } from "./routinePresets";
import { formatMinutes, hasErrors, validatePhase, validateRoutine, weekdaysLabel } from "@/lib/plans/logic";
import type { PhaseInput, PhaseRoutineInput } from "@/lib/plans/queries";
import type { Importance } from "@/types";

type Draft = { key: string; id?: string; input: PhaseRoutineInput };
const IMPORTANCES: Importance[] = ["重", "中", "軽"];
const blankRoutine = (): Draft => ({
  key: crypto.randomUUID(),
  input: { title: "", minutes: 30, weekdays: [1, 2, 3, 4, 5, 6, 7], importance: "中", menu: "" },
});

export default function PhaseSettings({ initial, selfId, existingRoutines, startWithNewRoutine,
  initialDirty, showMenus = true,
  openRoutineId, saving,
  failed, onSave, onCancel, onDelete, onDirtyChange }: {
  initial: PhaseInput;
  selfId?: string;
  existingRoutines: PhaseRoutineInput[];
  startWithNewRoutine?: boolean;
  initialDirty?: boolean;
  openRoutineId?: string;
  saving: boolean;
  failed: boolean;
  onSave: (phase: PhaseInput, routines: PhaseRoutineInput[]) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onDirtyChange: (dirty: boolean) => void;
  /** False: only the phase name and dates are editable; menus are saved unchanged. */
  showMenus?: boolean;
}) {
  const [phase, setPhase] = useState(initial);
  const [routines, setRoutines] = useState<Draft[]>(() => {
    const existing: Draft[] = existingRoutines.map((input) => ({ key: input.id ?? crypto.randomUUID(), id: input.id, input }));
    if (startWithNewRoutine) existing.push(blankRoutine());
    return existing;
  });
  const [openKey, setOpenKey] = useState<string | null>(() => startWithNewRoutine
    ? routines[routines.length - 1]?.key ?? null
    : openRoutineId ?? routines[0]?.key ?? null);
  // Only a menu the user asked to add takes focus; a new phase starts at its name.
  const [focusKey, setFocusKey] = useState<string | null>(() => startWithNewRoutine
    ? routines[routines.length - 1]?.key ?? null : null);
  const [dirty, setDirty] = useState(!!initialDirty);
  // Errors stay hidden until the first save attempt, so an empty new form is not all red.
  const [attempted, setAttempted] = useState(false);
  const today = todayISO();
  const phaseErrors = validatePhase(phase);
  const routineErrors = routines.map(({ input }) => validateRoutine(input));
  const canSave = !hasErrors(phaseErrors) && (!showMenus || routineErrors.every((errors) => !hasErrors(errors)));

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing && event.keyCode !== 229
          && !document.querySelector("[role=dialog]") && !saving) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, saving]);

  function updatePhase(patch: Partial<PhaseInput>) {
    setPhase((value) => ({ ...value, ...patch }));
    setDirty(true);
  }

  function updateRoutine(key: string, patch: Partial<PhaseRoutineInput>) {
    setRoutines((rows) => rows.map((row) => row.key === key
      ? { ...row, input: { ...row.input, ...patch } } : row));
    setDirty(true);
  }

  function addRoutine() {
    const next = blankRoutine();
    setRoutines((rows) => [...rows, next]);
    setOpenKey(next.key);
    setFocusKey(next.key);
    setDirty(true);
  }

  // The last removed menu can be put back (the form is a draft until saved).
  const [removed, setRemoved] = useState<{ row: Draft; index: number } | null>(null);
  useEffect(() => {
    if (!removed) return;
    const timer = window.setTimeout(() => setRemoved(null), 8000);
    return () => window.clearTimeout(timer);
  }, [removed]);

  function removeRoutine(key: string) {
    const index = routines.findIndex((row) => row.key === key);
    if (index >= 0) setRemoved({ row: routines[index], index });
    setRoutines((rows) => rows.filter((row) => row.key !== key));
    if (openKey === key) setOpenKey(null);
    setDirty(true);
  }

  function undoRemove() {
    if (!removed) return;
    setRoutines((rows) => [...rows.slice(0, removed.index), removed.row, ...rows.slice(removed.index)]);
    setRemoved(null);
  }

  return (
    <form aria-label={selfId ? "フェーズを設定" : "新しいフェーズを設定"}
      // Editing sits inside the phase card, so it has no box of its own; adding stands alone as a card.
      className={selfId ? "space-y-5" : "card space-y-5"}
      onSubmit={(event) => {
        event.preventDefault();
        setAttempted(true);
        if (canSave && !saving) onSave(phase, routines.map(({ id, input }) => ({ ...input, ...(id ? { id } : {}) })));
      }}>
      <div>
        <h2 className="text-lg font-semibold">{selfId ? "フェーズを設定" : "新しいフェーズ"}</h2>
        {!showMenus && <p className="mt-1 text-xs muted">名前と期間を変更します。メニューは各メニューの ✎ から編集できます。</p>}
      </div>
      <Field label="フェーズ名" error={attempted ? phaseErrors.name : undefined}>
        <input autoFocus className="input text-lg font-semibold" maxLength={30}
          value={phase.name} placeholder="例：基礎を身につける" disabled={saving}
          onChange={(event) => updatePhase({ name: event.target.value })} />
      </Field>
      <div className="space-y-2">
        <span className="label">期間</span>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <DatePicker label="フェーズの開始日" value={phase.start_date}
            emptyLabel="開始日を選ぶ" disabled={saving} onChange={(date) => updatePhase({ start_date: date })} />
          <span aria-hidden="true" className="pl-2 text-sm muted sm:pl-0">→</span>
          <DatePicker label="フェーズの終了日" value={phase.end_date}
            emptyLabel="終了日を選ぶ" disabled={saving} onChange={(date) => updatePhase({ end_date: date })} />
        </div>
        {(attempted || phase.start_date) && phaseErrors.start_date && <p className="text-xs text-rose-600">{phaseErrors.start_date}</p>}
        {(attempted || phase.end_date) && phaseErrors.end_date && <p className="text-xs text-rose-600">{phaseErrors.end_date}</p>}
        {selfId && phase.start_date <= today && phase.end_date > today && (
          <button type="button" disabled={saving} onClick={() => updatePhase({ end_date: today })}
            className="text-sm text-notion-blue hover:underline disabled:opacity-50">
            今日でこのフェーズを終える
          </button>
        )}
        {selfId && initial.end_date > today && phase.end_date === today && (
          <p className="text-xs muted">保存すると明日からこのメニューは生成されません。次のフェーズの開始日は変わりません。</p>
        )}
      </div>
      {showMenus && <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-notion-border">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold">メニュー</h3>
          </div>
          <button type="button" onClick={addRoutine} disabled={saving}
            className="btn-outline !py-1.5 text-sm">＋ メニューを追加</button>
        </div>
        {removed && <div role="status" className="flex items-center gap-3 rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-notion-panel-hover">
          <span className="min-w-0 flex-1 truncate">「{removed.row.input.title || `メニュー ${removed.index + 1}`}」を削除しました</span>
          <button type="button" disabled={saving} onClick={undoRemove} className="shrink-0 text-sm font-medium text-notion-blue hover:underline">元に戻す</button>
        </div>}
        {routines.length === 0 && <p className="py-3 text-sm muted">メニューはまだありません。フェーズだけ先に保存することもできます。</p>}
        <div className="divide-y divide-slate-200 dark:divide-notion-border">
          {routines.map((row, index) => {
            const open = openKey === row.key;
            const errors = attempted ? routineErrors[index] : {};
            return <div key={row.key} className="py-3 first:pt-0 last:pb-0">
              {/* Closed: one summary line. Open: the name field itself is the heading (no second label). */}
              {!open ? <div className="flex items-center gap-2">
                <button type="button" aria-expanded={false} disabled={saving}
                  onClick={() => setOpenKey(row.key)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-notion-blue">
                  <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base muted hover:bg-slate-100 dark:hover:bg-notion-panel-hover">▸</span>
                  {row.input.title || <span className="muted">メニュー {index + 1}</span>}
                  <span className="ml-2 text-xs font-normal muted">{formatMinutes(row.input.minutes)} · {weekdaysLabel(row.input.weekdays)} · {row.input.importance}</span>
                  {hasErrors(routineErrors[index]) && attempted && <span className="ml-2 text-xs text-rose-600">要確認</span>}
                </button>
                <button type="button" disabled={saving} onClick={() => removeRoutine(row.key)}
                  aria-label={`${row.input.title || `メニュー ${index + 1}`}を削除`}
                  title="削除" className={`rounded px-2 py-1.5 text-sm muted hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 ${TOUCH_TARGET} ${FOCUS_RING}`}>✕</button>
              </div> : <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <div className="flex items-center gap-2">
                    <button type="button" aria-expanded={true} disabled={saving} onClick={() => setOpenKey(null)}
                      title="閉じる" aria-label="閉じる" className="flex h-9 w-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 shrink-0 items-center justify-center rounded-lg text-base muted hover:bg-slate-100 dark:hover:bg-notion-panel-hover">▾</button>
                    <input aria-label={`メニュー ${index + 1} の名前`} autoFocus={row.key === focusKey}
                      className="input flex-1 font-medium" maxLength={40} value={row.input.title} disabled={saving}
                      placeholder={`メニュー ${index + 1}：例）IELTSのListeningを30分解く`}
                      onChange={(event) => updateRoutine(row.key, { title: event.target.value })} />
                    <button type="button" disabled={saving} onClick={() => removeRoutine(row.key)}
                      aria-label={`${row.input.title || `メニュー ${index + 1}`}を削除`}
                      title="削除" className={`rounded px-2 py-1.5 text-sm muted hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 ${TOUCH_TARGET} ${FOCUS_RING}`}>✕</button>
                  </div>
                  {errors.title && <p className="mt-1 text-xs text-rose-600">{errors.title}</p>}
                </div>
                <Field group label="所要時間" error={errors.minutes}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {MINUTE_PRESETS.map((minutes) => <button key={minutes} type="button" disabled={saving}
                      aria-pressed={row.input.minutes === minutes} className={chip(row.input.minutes === minutes)}
                      onClick={() => updateRoutine(row.key, { minutes })}>{formatMinutes(minutes)}</button>)}
                    <label className="flex items-center gap-1 text-xs muted">
                      <input type="number" min={5} max={600} step={5} aria-label="所要時間（分）" disabled={saving}
                        className="input !w-20 !py-1 text-sm" value={row.input.minutes}
                        onChange={(event) => updateRoutine(row.key, { minutes: Number(event.target.value) })} />分
                    </label>
                  </div>
                </Field>
                <Field group label="重要度">
                  <div className="flex gap-1.5">
                    {IMPORTANCES.map((importance) => <button key={importance} type="button"
                      disabled={saving} aria-pressed={row.input.importance === importance}
                      onClick={() => updateRoutine(row.key, { importance })}
                      className={choiceClass(row.input.importance === importance)}>
                      {importance}
                    </button>)}
                  </div>
                </Field>
                <div className="sm:col-span-2">
                  <Field group label="曜日" error={errors.weekdays}>
                    <div className="mb-2 flex gap-1.5">
                      {WEEKDAY_PRESETS.map((preset) => {
                        const active = [...row.input.weekdays].sort().join() === preset.days.join();
                        return <button key={preset.label} type="button" disabled={saving} aria-pressed={active}
                          className={chip(active)} onClick={() => updateRoutine(row.key, { weekdays: preset.days })}>{preset.label}</button>;
                      })}
                    </div>
                    <div className="flex gap-1.5">
                      {ISO_WEEKDAYS_IN_ORDER.map((number) => {
                        const day = ISO_WEEKDAY_CHAR[number];
                        const selected = row.input.weekdays.includes(number);
                        return <button key={number} type="button" disabled={saving} aria-pressed={selected}
                          onClick={() => updateRoutine(row.key, { weekdays: selected
                            ? row.input.weekdays.filter((value) => value !== number)
                            : [...row.input.weekdays, number] })}
                          className={`flex-1 rounded-md border py-2 text-sm ${TOUCH_TARGET} ${FOCUS_RING} ${selected ? "border-notion-blue bg-notion-blue/10 font-semibold" : "border-slate-300 muted dark:border-notion-border"}`}>{day}</button>;
                      })}
                    </div>
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field optional label="メニューの詳細" error={errors.menu}>
                    <textarea className="input min-h-24" maxLength={2000} disabled={saving}
                      placeholder="例：公式問題集10のTest 2。間違えた設問は聞き直す"
                      value={row.input.menu ?? ""}
                      onChange={(event) => updateRoutine(row.key, { menu: event.target.value })} />
                  </Field>
                </div>
              </div>}
            </div>;
          })}
        </div>
      </div>}
      {/* Keep the actions reachable on a long form. */}
      <div className={`sticky bottom-0 -mx-5 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur dark:border-notion-border dark:bg-notion-panel/95 ${selfId ? "" : "-mb-5 rounded-b-xl"}`}>
        {attempted && !canSave && <p role="alert" className="mb-2 text-xs text-rose-600">未入力の項目があります</p>}
        <FormActions onDelete={onDelete} onCancel={onCancel} canSave
          saving={saving} error={failed} saveLabel="保存" />
      </div>
    </form>
  );
}
