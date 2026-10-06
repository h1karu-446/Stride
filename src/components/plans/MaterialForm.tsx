import { useState } from "react";
import clsx from "clsx";
import { choiceClass, Field, FormActions, useEscToCancel } from "@/components/common/FormParts";
import {
  hasErrors,
  MATERIAL_STATUS_LABEL,
  MATERIAL_STATUSES,
  validateMaterial,
} from "@/lib/plans/logic";
import type { MaterialInput } from "@/lib/plans/queries";
import type { Phase } from "@/types";

/**
 * Inline edit form for a material (spec 4.2, 3.6). `phases` are the plan's
 * own non-implicit phases; the chips are hidden when there are none.
 */
export default function MaterialForm({
  initial,
  phases,
  color,
  onSubmit,
  onDelete,
  onCancel,
  saving,
  failed,
}: {
  initial: MaterialInput;
  phases: Phase[];
  color: string;
  onSubmit: (v: MaterialInput) => void;
  onDelete?: () => void;
  onCancel: () => void;
  saving?: boolean;
  failed?: boolean;
}) {
  const [v, setV] = useState(initial);
  const errors = validateMaterial(v);
  const canSave = !hasErrors(errors);
  useEscToCancel(onCancel, !!saving);

  const togglePhase = (id: string) =>
    setV((cur) => ({
      ...cur,
      phase_ids: cur.phase_ids.includes(id)
        ? cur.phase_ids.filter((x) => x !== id)
        : [...cur.phase_ids, id],
    }));

  return (
    <form
      className="space-y-3 rounded-xl bg-slate-50/70 p-4 dark:bg-notion-panel-hover"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave && !saving) onSubmit(v);
      }}
    >
      <Field label="タイトル" error={v.title ? errors.title : undefined}>
        <input autoFocus className="input text-base font-medium" value={v.title}
          disabled={saving}
          onChange={(e) => { const title = e.target.value; setV((cur) => ({ ...cur, title })); }} />
      </Field>
      <Field optional label="リンク" error={errors.url}>
        <input type="url" className="input" placeholder="https://" value={v.url ?? ""} disabled={saving}
          onChange={(e) => { const url = e.target.value; setV((cur) => ({ ...cur, url })); }} />
      </Field>
      <Field optional label="学ぶこと・メモ" error={errors.note}>
        {/* Enter adds a line break here; save with the button (IME-safe). */}
        <textarea className="input min-h-[4.5rem] resize-y" rows={3} disabled={saving}
          placeholder="例：第3章の非同期処理を理解する" value={v.note ?? ""}
          onChange={(e) => { const note = e.target.value; setV((cur) => ({ ...cur, note })); }} />
      </Field>
      {phases.length > 0 && (
        <Field group optional label="関連するフェーズ">
          <div className="flex flex-wrap gap-1.5">
            {phases.map((p) => {
              const on = v.phase_ids.includes(p.id);
              return (
                <button key={p.id} type="button" aria-pressed={on} disabled={saving}
                  onClick={() => togglePhase(p.id)}
                  className={clsx("rounded-full border px-3 py-1 text-xs",
                    !on && "border-slate-300 dark:border-notion-border muted")}
                  style={on ? { borderColor: color, background: `${color}26` } : undefined}>
                  {p.name}
                </button>
              );
            })}
          </div>
        </Field>
      )}
      <Field group label="状態">
        <div className="flex gap-1.5">
          {MATERIAL_STATUSES.map((s) => (
            <button key={s} type="button" aria-pressed={v.status === s} disabled={saving}
              onClick={() => setV((cur) => ({ ...cur, status: s }))}
              className={choiceClass(v.status === s)}>
              {MATERIAL_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </Field>
      <FormActions onDelete={onDelete} onCancel={onCancel}
        canSave={canSave} saving={saving} error={failed} />
    </form>
  );
}
