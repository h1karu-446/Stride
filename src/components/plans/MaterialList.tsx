import { useState } from "react";
import EmptyAddButton from "@/components/common/EmptyAddButton";
import { FoldButton, SAVE_ERROR_MESSAGE } from "@/components/common/FormParts";
import MaterialForm from "./MaterialForm";
import {
  formatDateLabel,
  MATERIAL_STATUS_LABEL,
  materialGroups,
  nextMaterialStatus,
} from "@/lib/plans/logic";
import {
  MaterialSaveError,
  type MaterialInput,
  useDeleteMaterial,
  useSaveMaterial,
  useSetMaterialStatus,
} from "@/lib/plans/queries";
import type { Material, Phase, Plan } from "@/types";

/**
 * 教材 on the plan detail screen (spec 4.2, BR-05).
 * `selectedPhaseId` is undefined when the plan only has the implicit phase.
 * `editing` is the open form (material id, "new", or null), kept by the page
 * so only one form is open across the screen (spec 3.6).
 */
export default function MaterialList({
  plan,
  color,
  phases,
  selectedPhaseId,
  today,
  editing,
  onEdit,
  onClose,
}: {
  plan: Plan;
  color: string;
  /** The plan's own non-implicit phases (the only ones a material can link to). */
  phases: Phase[];
  selectedPhaseId: string | undefined;
  today: string;
  editing: string | null;
  onEdit: (target: string) => void;
  onClose: () => void;
}) {
  const save = useSaveMaterial();
  const del = useDeleteMaterial();
  const setStatus = useSetMaterialStatus();
  const [showOther, setShowOther] = useState(false);
  const [showDone, setShowDone] = useState(false);
  // What the user typed when a save failed. The form may remount after a
  // failure (the row moves to another group, or a new row gets its id), so
  // the input is restored from here instead of from the saved row.
  const [draft, setDraft] = useState<{ id: string; input: MaterialInput } | null>(null);
  // Materials whose status change is in flight: their badge is disabled so
  // two clicks can never be applied out of order.
  const [statusPending, setStatusPending] = useState<ReadonlySet<string>>(new Set());
  const materials = plan.materials;
  const groups = materialGroups(materials, selectedPhaseId);
  const editingRow = materials.find((m) => m.id === editing);

  const open = (target: string) => {
    save.reset();
    del.reset();
    setDraft(null);
    onEdit(target);
  };
  const close = () => {
    setDraft(null);
    onClose();
  };

  const submit = (input: MaterialInput, m?: Material) => {
    save.mutate(
      { planId: plan.id, material: m, phases: plan.phases, input },
      {
        onSuccess: close,
        onError: (e) => {
          if (e instanceof MaterialSaveError) {
            // The row exists now: keep the input and retry as an edit of it,
            // so saving again never inserts a duplicate.
            setDraft({ id: e.materialId, input });
            if (!m) onEdit(e.materialId);
          } else if (m) {
            setDraft({ id: m.id, input });
          }
        },
      }
    );
  };

  /** `m` is undefined for "new"; `id` is set for a new row not yet refetched. */
  const form = (m?: Material, id?: string) => {
    const key = m?.id ?? id ?? "new";
    const own = draft && draft.id === key ? draft.input : undefined;
    const target: Material | undefined =
      m ??
      (id && own
        ? { id, plan_id: plan.id, title: own.title, status: own.status, phase_ids: [], created_at: "" }
        : undefined);
    return (
      <MaterialForm
        key={key}
        initial={
          own ??
          (m
            ? { title: m.title, url: m.url ?? "", status: m.status, phase_ids: m.phase_ids }
            : { title: "", url: "", status: "todo", phase_ids: [] })
        }
        phases={phases}
        color={color}
        saving={save.isPending || del.isPending}
        failed={save.isError || del.isError}
        onCancel={close}
        onSubmit={(input) => submit(input, target)}
        onDelete={target ? () => del.mutate(target.id, { onSuccess: close }) : undefined}
      />
    );
  };

  const cycleStatus = (m: Material) => {
    if (statusPending.has(m.id)) return;
    setStatusPending((s) => new Set(s).add(m.id));
    setStatus
      .mutateAsync({ id: m.id, status: nextMaterialStatus(m.status) })
      .catch(() => undefined) // shown via setStatus.isError
      .finally(() =>
        setStatusPending((s) => {
          const next = new Set(s);
          next.delete(m.id);
          return next;
        })
      );
  };

  const badge = (m: Material) => (
    <button type="button"
      aria-label={`状態: ${MATERIAL_STATUS_LABEL[m.status]}（押して切り替え）`}
      disabled={statusPending.has(m.id)}
      onClick={() => cycleStatus(m)}
      className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] disabled:opacity-60 disabled:cursor-wait"
      style={
        m.status === "in_progress"
          ? { background: `${color}33`, color }
          : m.status === "done"
            ? { background: "#4DAB9A26", color: "#4DAB9A" }
            : { background: "#8A898526", color: "#8A8985" }
      }>
      {m.status === "done" && m.completed_at
        ? `${formatDateLabel(m.completed_at, today)} 完了`
        : MATERIAL_STATUS_LABEL[m.status]}
    </button>
  );

  const row = (m: Material) => {
    if (editing === m.id) return form(m);
    const done = m.status === "done";
    return (
      <div key={m.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          {done && <span aria-label="完了" className="shrink-0 text-teal-500">✓</span>}
          <button type="button" onClick={() => open(m.id)}
            className={done || m.status === "todo"
              ? "truncate text-left muted hover:underline"
              : "truncate text-left hover:underline"}>
            {m.title}
          </button>
          {m.url && (
            <a href={m.url} target="_blank" rel="noopener noreferrer"
              aria-label="リンクを開く" className="shrink-0 muted hover:opacity-70">
              ↗
            </a>
          )}
        </span>
        {badge(m)}
      </div>
    );
  };

  // A form that has no row to sit in: a new material, or one whose row was
  // just inserted (partial failure) and is not in the cache yet.
  const topForm =
    editing === "new"
      ? form()
      : editing && !editingRow && draft?.id === editing
        ? form(undefined, editing)
        : null;
  // A collapsed group still shows the row being edited (spec 3.5: a failed
  // save keeps the form and the error visible).
  const shown = (list: Material[], open: boolean) =>
    open ? list : list.filter((m) => m.id === editing);

  if (materials.length === 0 && !topForm) {
    // Not stretched to the height of the card next to it (spec 3.4).
    return (
      <div className="self-start">
        <EmptyAddButton label="教材を追加" onClick={() => open("new")} />
      </div>
    );
  }

  return (
    <section className="card flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">教材</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs muted">
            {groups.done.length} / {materials.length} 完了
          </span>
          <button type="button" aria-label="教材を追加" onClick={() => open("new")}
            className="btn-ghost !px-2 !py-0.5 text-lg leading-none muted">＋</button>
        </div>
      </div>
      {setStatus.isError && <p className="text-xs text-red-500">{SAVE_ERROR_MESSAGE}</p>}
      <div className="flex flex-col">
        {topForm}
        {groups.main.map(row)}
      </div>
      {groups.otherPhases.length > 0 && (
        <>
          <div className="flex flex-col">{shown(groups.otherPhases, showOther).map(row)}</div>
          <FoldButton open={showOther} label={`他のフェーズ ${groups.otherPhases.length}`}
            onToggle={() => setShowOther(!showOther)} />
        </>
      )}
      {groups.done.length > 0 && (
        <>
          <div className="flex flex-col">{shown(groups.done, showDone).map(row)}</div>
          <FoldButton open={showDone} label={`完了 ${groups.done.length}`}
            onToggle={() => setShowDone(!showDone)} />
        </>
      )}
    </section>
  );
}
