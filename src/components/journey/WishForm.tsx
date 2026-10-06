import { useState } from "react";
import { choiceClass, Field, FormActions, useEscToCancel } from "@/components/common/FormParts";
import DatePicker from "@/components/common/DatePicker";
import { todayISO } from "@/lib/date";
import { IMPORTANCE_LIST } from "@/types";
import type { WishInput } from "@/lib/journey/queries";

export default function WishForm({ initial, onSubmit, onDelete, onRestore, onCancel, saving, failed }: {
  initial: WishInput; onSubmit: (value: WishInput) => void; onDelete?: () => void; onRestore?: () => void;
  onCancel: () => void; saving: boolean; failed: boolean;
}) {
  const [value, setValue] = useState(initial);
  // Esc while converting Japanese input only cancels the conversion.
  useEscToCancel(onCancel, saving);
  const futureDate = !!value.achieved_at && value.achieved_at > todayISO();
  const valid = value.title.trim().length > 0 && value.title.trim().length <= 60 && value.note.length <= 100 && !futureDate;
  return <form className="space-y-3 rounded-xl bg-slate-50/70 p-4 dark:bg-notion-panel-hover" onSubmit={(event) => {
    event.preventDefault(); if (valid && !saving) onSubmit(value);
  }}>
    <Field label="やりたいこと"><input autoFocus className="input text-base font-medium" maxLength={60} placeholder="例：富士山に登る" value={value.title} disabled={saving} onChange={(e) => setValue({ ...value, title: e.target.value })} /></Field>
    <Field optional label="補足"><input className="input" maxLength={100} value={value.note} disabled={saving} onChange={(e) => setValue({ ...value, note: e.target.value })} /></Field>
    <Field group label="重要度">
      <div className="flex gap-1.5">
        {IMPORTANCE_LIST.map((i) => <button key={i} type="button" aria-pressed={value.importance === i} disabled={saving} onClick={() => setValue({ ...value, importance: i })}
          className={choiceClass(value.importance === i)}>{i}</button>)}
      </div>
    </Field>
    {initial.achieved_at && <Field group label="達成日">
      <DatePicker label="達成日" value={value.achieved_at ?? ""} disabled={saving} onChange={(achieved_at) => { if (achieved_at) setValue({ ...value, achieved_at }); }} />
      {futureDate && <p role="alert" className="mt-1 text-xs text-rose-600">未来の日付は選べません</p>}
    </Field>}
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={value.emphasize_achievement} disabled={saving} onChange={(e) => setValue({ ...value, emphasize_achievement: e.target.checked })} />
      達成の記録で目立たせる ★
    </label>
    {onRestore && <button type="button" disabled={saving} onClick={onRestore} className="text-xs muted underline-offset-2 hover:underline">未達成に戻す（やりたいことの一覧に戻します）</button>}
    <FormActions onCancel={() => { if (!saving) onCancel(); }} onDelete={onDelete ? () => { if (!saving) onDelete(); } : undefined} canSave={valid} saving={saving} error={failed} />
  </form>;
}
