import { useEffect, useId, useRef, useState } from "react";
import { useDeferredDelete, useHiddenKeys } from "@/lib/deferredDelete";
import clsx from "clsx";
import EmptyAddButton from "@/components/common/EmptyAddButton";
import { FoldButton } from "@/components/common/FormParts";
import MaterialForm from "./MaterialForm";
import MaterialStatusMenu from "./MaterialStatusMenu";
import { materialGroups } from "@/lib/plans/logic";
import {
  MaterialSaveError,
  type MaterialInput,
  useDeleteMaterial,
  useSaveMaterial,
  useSetMaterialStatus,
} from "@/lib/plans/queries";
import type { Material, MaterialStatus, Phase, Plan } from "@/types";

const STATUS_ERROR_MESSAGE = "状態を変更できませんでした。もう一度お試しください";

/**
 * 「学ぶこと・メモ」 in a row: at most two lines, with a toggle to read the
 * whole note that appears only when the note is actually cut off.
 */
function MaterialNote({ note }: { note: string }) {
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  const id = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const check = () => setClipped(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [note, expanded]);

  return (
    <div className="mt-0.5">
      <p ref={ref} id={id}
        className={clsx("whitespace-pre-line text-xs muted [overflow-wrap:anywhere]",
          !expanded && "line-clamp-2")}>
        {note}
      </p>
      {(clipped || expanded) && (
        <button type="button" aria-expanded={expanded} aria-controls={id}
          onClick={() => setExpanded((x) => !x)}
          className="mt-0.5 rounded text-xs text-blue-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-notion-blue dark:focus-visible:ring-notion-blue">
          {expanded ? "閉じる" : "全文を表示"}
        </button>
      )}
    </div>
  );
}

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
  const deferDelete = useDeferredDelete((state) => state.schedule);
  const hidden = useHiddenKeys();
  const setStatus = useSetMaterialStatus();
  const [showOther, setShowOther] = useState(false);
  const [showDone, setShowDone] = useState(false);
  // What the user typed when a save failed. The form may remount after a
  // failure (the row moves to another group, or a new row gets its id), so
  // the input is restored from here instead of from the saved row.
  const [draft, setDraft] = useState<{ id: string; input: MaterialInput } | null>(null);
  // Materials whose status change is in flight: their badge is disabled so
  // two changes can never be applied out of order.
  const [statusPending, setStatusPending] = useState<ReadonlySet<string>>(new Set());
  const materials = plan.materials.filter((m) => !hidden.has(`material:${m.id}`));
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
        ? { id, plan_id: plan.id, title: own.title, note: own.note, status: own.status, phase_ids: [], created_at: "" }
        : undefined);
    return (
      <MaterialForm
        key={key}
        initial={
          own ??
          (m
            ? { title: m.title, url: m.url ?? "", note: m.note ?? "", status: m.status, phase_ids: m.phase_ids }
            : { title: "", url: "", note: "", status: "todo", phase_ids: [] })
        }
        phases={phases}
        color={color}
        saving={save.isPending || del.isPending}
        failed={save.isError || del.isError}
        onCancel={close}
        onSubmit={(input) => submit(input, target)}
        onDelete={target ? () => {
          deferDelete({ key: `material:${target.id}`, label: target.title, commit: () => del.mutateAsync(target.id) });
          close();
        } : undefined}
      />
    );
  };

  const changeStatus = (m: Material, status: MaterialStatus) => {
    if (statusPending.has(m.id) || status === m.status) return;
    setStatusPending((s) => new Set(s).add(m.id));
    setStatus
      .mutateAsync({ id: m.id, status })
      .catch(() => undefined) // shown via setStatus.isError; the cache is rolled back
      .finally(() =>
        setStatusPending((s) => {
          const next = new Set(s);
          next.delete(m.id);
          return next;
        })
      );
  };

  // Title (a link that opens a new tab when there is a URL), note, status
  // menu and the edit button at the right edge. Their hit areas never overlap.
  const row = (m: Material) => {
    if (editing === m.id) return form(m);
    const done = m.status === "done";
    const titleTone = done || m.status === "todo" ? "muted" : undefined;
    return (
      <div key={m.id} className="flex items-start gap-2 py-1.5 text-sm">
        {done && <span aria-label="完了" className="mt-0.5 shrink-0 text-teal-500">✓</span>}
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="line-clamp-2 [overflow-wrap:anywhere]" title={m.title}>
            {m.url ? (
              <a href={m.url} target="_blank" rel="noopener noreferrer"
                className={clsx("rounded underline decoration-slate-300 underline-offset-2 hover:decoration-current focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:decoration-notion-border-strong dark:focus-visible:ring-notion-blue", titleTone)}>
                {m.title}
                <span aria-hidden="true" className="ml-0.5 text-xs">↗</span>
                <span className="sr-only">（新しいタブで開く）</span>
              </a>
            ) : (
              <span className={titleTone}>{m.title}</span>
            )}
          </p>
          {m.note && <MaterialNote note={m.note} />}
        </div>
        <MaterialStatusMenu material={m} color={color} today={today}
          pending={statusPending.has(m.id)}
          onChange={(s) => changeStatus(m, s)} />
        <button type="button" onClick={() => open(m.id)}
          aria-label={`「${m.title}」を編集`}
          className="shrink-0 rounded px-2 py-1 text-xs leading-none muted hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-notion-panel-hover dark:hover:text-notion-fg dark:focus-visible:ring-notion-blue">
          編集
        </button>
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
        <h2 className="section-title">教材</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs muted">
            {groups.done.length} / {materials.length} 完了
          </span>
          <button type="button" aria-label="教材を追加" onClick={() => open("new")}
            className="btn-ghost !px-2 !py-0.5 text-lg leading-none muted">＋</button>
        </div>
      </div>
      {setStatus.isError && (
        <p role="alert" className="text-xs text-red-500">{STATUS_ERROR_MESSAGE}</p>
      )}
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
