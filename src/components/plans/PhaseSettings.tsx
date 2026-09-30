import { useEffect, useState } from "react";
import DatePicker from "@/components/common/DatePicker";
import { Field, FormActions } from "@/components/common/FormParts";
import { hasErrors, validatePhase, validateRoutine } from "@/lib/plans/logic";
import type { PhaseInput, PhaseRoutineInput } from "@/lib/plans/queries";
import type { Importance, Phase } from "@/types";

type Draft = { key: string; id?: string; input: PhaseRoutineInput };
const DAYS = ["月", "火", "水", "木", "金", "土", "日"];
const IMPORTANCES: Importance[] = ["重", "中", "軽"];

const blankRoutine = (): Draft => ({
  key: crypto.randomUUID(),
  input: { title: "", minutes: 30, weekdays: [1, 2, 3, 4, 5, 6, 7], importance: "中", menu: "" },
});

export default function PhaseSettings({ initial, siblings, selfId, existingRoutines, startWithNewRoutine,
  openRoutineId, saving,
  failed, onSave, onCancel, onDelete, onDirtyChange }: {
  initial: PhaseInput;
  siblings: Phase[];
  selfId?: string;
  existingRoutines: PhaseRoutineInput[];
  startWithNewRoutine?: boolean;
  openRoutineId?: string;
  saving: boolean;
  failed: boolean;
  onSave: (phase: PhaseInput, routines: PhaseRoutineInput[]) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [phase, setPhase] = useState(initial);
  const [routines, setRoutines] = useState<Draft[]>(() => {
    const existing: Draft[] = existingRoutines.map((input) => ({ key: input.id ?? crypto.randomUUID(), id: input.id, input }));
    if (startWithNewRoutine || (!selfId && !existing.length)) existing.push(blankRoutine());
    return existing;
  });
  const [openKey, setOpenKey] = useState<string | null>(() => startWithNewRoutine
    ? routines[routines.length - 1]?.key ?? null
    : openRoutineId ?? routines[0]?.key ?? null);
  const [dirty, setDirty] = useState(false);
  const phaseErrors = validatePhase(phase, siblings, selfId);
  const routineErrors = routines.map(({ input }) => validateRoutine(input));
  const canSave = !hasErrors(phaseErrors) && routineErrors.every((errors) => !hasErrors(errors));

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
    setDirty(true);
  }

  function removeRoutine(key: string) {
    setRoutines((rows) => rows.filter((row) => row.key !== key));
    if (openKey === key) setOpenKey(null);
    setDirty(true);
  }

  return (
    <form aria-label={selfId ? "フェーズを設定" : "新しいフェーズを設定"}
      className="rounded-xl bg-slate-50 p-4 shadow-sm dark:bg-notion-panel-hover sm:p-5 space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave && !saving) onSave(phase, routines.map(({ id, input }) => ({ ...input, ...(id ? { id } : {}) })));
      }}>
      <div>
        <h2 className="text-lg font-semibold">{selfId ? "フェーズを設定" : "新しいフェーズ"}</h2>
        <p className="mt-1 text-xs muted">期間と、その期間中に繰り返すメニューを一緒に設定します。</p>
      </div>
      <Field label="フェーズ名" error={phaseErrors.name}>
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
        {phaseErrors.start_date && <p className="text-xs text-rose-600">{phaseErrors.start_date}</p>}
        {phaseErrors.end_date && <p className="text-xs text-rose-600">{phaseErrors.end_date}</p>}
      </div>
      <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-notion-border">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold">メニュー</h3>
            <p className="text-xs muted">Todayには短いメニュー名を表示し、詳細は開いたときに読めます。</p>
          </div>
          <button type="button" onClick={addRoutine} disabled={saving}
            className="btn-outline !py-1.5 text-sm">＋ メニューを追加</button>
        </div>
        {routines.length === 0 && <p className="py-3 text-sm muted">メニューはまだありません。フェーズだけ先に保存することもできます。</p>}
        <div className="divide-y divide-slate-200 dark:divide-notion-border">
          {routines.map((row, index) => {
            const open = openKey === row.key;
            const errors = routineErrors[index];
            return <div key={row.key} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2">
                <button type="button" aria-expanded={open} disabled={saving}
                  onClick={() => setOpenKey(open ? null : row.key)}
                  className="min-w-0 flex-1 rounded-lg py-1.5 text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-notion-blue">
                  <span className="mr-2 text-xs muted">{open ? "▾" : "▸"}</span>
                  {row.input.title || `メニュー ${index + 1} を入力`}
                  {hasErrors(errors) && <span className="ml-2 text-xs text-rose-600">要確認</span>}
                </button>
                <button type="button" disabled={saving} onClick={() => removeRoutine(row.key)}
                  aria-label={`${row.input.title || `メニュー ${index + 1}`}を削除`}
                  className="rounded px-2 py-1.5 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10">削除</button>
              </div>
              {open && <div className="grid gap-3 pt-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="メニュー（必須）" error={errors.title}>
                    <input className="input" maxLength={40} value={row.input.title} disabled={saving}
                      placeholder="例：IELTSのListeningを30分解く"
                      onChange={(event) => updateRoutine(row.key, { title: event.target.value })} />
                  </Field>
                </div>
                <Field label="所要時間（分）" error={errors.minutes}>
                  <input type="number" min={5} max={600} step={5} className="input" disabled={saving}
                    value={row.input.minutes}
                    onChange={(event) => updateRoutine(row.key, { minutes: Number(event.target.value) })} />
                </Field>
                <Field group label="重要度">
                  <div className="flex gap-1.5">
                    {IMPORTANCES.map((importance) => <button key={importance} type="button"
                      disabled={saving} aria-pressed={row.input.importance === importance}
                      onClick={() => updateRoutine(row.key, { importance })}
                      className={`flex-1 rounded-md border px-2 py-2 text-sm ${row.input.importance === importance ? "border-notion-blue bg-notion-blue/10" : "border-slate-300 dark:border-notion-border"}`}>
                      {importance}
                    </button>)}
                  </div>
                </Field>
                <div className="sm:col-span-2">
                  <Field group label="曜日" error={errors.weekdays}>
                    <div className="flex gap-1.5">
                      {DAYS.map((day, i) => {
                        const number = i + 1;
                        const selected = row.input.weekdays.includes(number);
                        return <button key={number} type="button" disabled={saving} aria-pressed={selected}
                          onClick={() => updateRoutine(row.key, { weekdays: selected
                            ? row.input.weekdays.filter((value) => value !== number)
                            : [...row.input.weekdays, number] })}
                          className={`flex-1 rounded-md border py-2 text-sm ${selected ? "border-notion-blue bg-notion-blue/10" : "border-slate-300 muted dark:border-notion-border"}`}>{day}</button>;
                      })}
                    </div>
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="メニューの詳細（任意）" error={errors.menu}>
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
      </div>
      <FormActions onDelete={onDelete} onCancel={onCancel} canSave={canSave}
        saving={saving} error={failed} saveLabel="まとめて保存" />
    </form>
  );
}
