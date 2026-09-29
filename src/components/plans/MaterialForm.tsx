import { useState } from "react";
import clsx from "clsx";
import { Field, FormActions, useEscToCancel } from "@/components/common/FormParts";
import {
  hasErrors,
  MATERIAL_STATUS_LABEL,
  validateMaterial,
} from "@/lib/plans/logic";
import type { MaterialInput } from "@/lib/plans/queries";
import type { MaterialStatus, Phase } from "@/types";

const STATUSES: MaterialStatus[] = ["todo", "in_progress", "done"];

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
  useEscToCancel(onCancel);

  const togglePhase = (id: string) =>
    setV((cur) => ({
      ...cur,
      phase_ids: cur.phase_ids.includes(id)
        ? cur.phase_ids.filter((x) => x !== id)
        : [...cur.phase_ids, id],
    }));

  return (
    <form
      className="rounded-lg border border-slate-200 dark:border-notion-border p-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave && !saving) onSubmit(v);
      }}
    >
      <Field label="タイトル" error={v.title ? errors.title : undefined}>
        <input autoFocus className="input" value={v.title}
          onChange={(e) => { const title = e.target.value; setV((cur) => ({ ...cur, title })); }} />
      </Field>
      <Field label="リンク（任意）" error={errors.url}>
        <input type="url" className="input" placeholder="https://" value={v.url ?? ""}
          onChange={(e) => { const url = e.target.value; setV((cur) => ({ ...cur, url })); }} />
      </Field>
      {phases.length > 0 && (
        <Field group label="関連するフェーズ">
          <div className="flex flex-wrap gap-1.5">
            {phases.map((p) => {
              const on = v.phase_ids.includes(p.id);
              return (
                <button key={p.id} type="button" aria-pressed={on}
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
          {STATUSES.map((s) => (
            <button key={s} type="button" aria-pressed={v.status === s}
              onClick={() => setV((cur) => ({ ...cur, status: s }))}
              className={clsx("flex-1 rounded-md border px-2 py-1.5 text-sm",
                v.status === s
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-slate-300 dark:border-notion-border")}>
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
