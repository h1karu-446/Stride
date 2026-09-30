import { useState } from "react";
import { useDeferredDelete, useHiddenKeys } from "@/lib/deferredDelete";
import { useQueryClient } from "@tanstack/react-query";
import EmptyAddButton from "@/components/common/EmptyAddButton";
import { FoldButton, SAVE_ERROR_MESSAGE } from "@/components/common/FormParts";
import ScheduleForm, { type ScheduleInput } from "./ScheduleForm";
import {
  canCarryOver,
  carriedIds,
  carryOverInput,
  formatDateLabel,
  isLockedSchedule,
  isOverdue,
  carryOverOnce,
  withId,
  planScheduleSave,
  scheduleGroups,
} from "@/lib/plans/logic";
import { useAddTask, useDeleteTask, useUpdateTask } from "@/lib/queries";
import type { Task } from "@/types";

const OVERDUE = "#F2994A";

/**
 * 予定 on the plan detail screen (spec 4.2, BR-04). Schedules are tasks with
 * plan_id set; completing them only happens on Today. Carrying an overdue one
 * over inserts a copy; the original stays on its day and is listed with the
 * closed ones as "持ち越し".
 * `editing` is the open form: a task id, "new", or null. The page keeps it so
 * only one form is open across the whole screen (spec 3.6).
 */
export default function ScheduleList({
  planId,
  color,
  tasks: allTasks,
  today,
  editing,
  onEdit,
  onClose,
}: {
  planId: string;
  color: string;
  /** Every task (not only this plan's), to find carried-over originals. */
  tasks: Task[];
  today: string;
  editing: string | null;
  onEdit: (target: string) => void;
  onClose: () => void;
}) {
  const add = useAddTask();
  const update = useUpdateTask();
  const del = useDeleteTask();
  const deferDelete = useDeferredDelete((state) => state.schedule);
  const hidden = useHiddenKeys();
  const tasks = allTasks.filter((task) => !hidden.has(`task:${task.id}`));
  const carry = useAddTask();
  const qc = useQueryClient();
  // Rows whose carry-over is in flight or whose list refresh has not landed
  // yet. The button stays off until the refreshed list closes the row, so a
  // second click cannot hit the one-copy index (tasks_carried_from_uniq).
  const [carrying, setCarrying] = useState<ReadonlySet<string>>(new Set());
  // Rows whose last carry-over failed (shown as the save error).
  const [carryFailed, setCarryFailed] = useState<ReadonlySet<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const carried = carriedIds(tasks);
  const groups = scheduleGroups(tasks, planId, undefined, carried);
  const total = groups.visible.length + groups.hidden.length + groups.done.length;
  const doneCount = groups.done.length - groups.carriedCount;

  // Each click has its own promise: mutate() callbacks of an earlier click are
  // dropped when another row is clicked (TanStack Query v5), so neither the
  // pending ids nor the error rely on them or on carry.isError.
  const carryOver = (t: Task) => {
    if (carrying.has(t.id)) return;
    setCarrying((s) => withId(s, t.id, true));
    setCarryFailed((s) => withId(s, t.id, false));
    void carryOverOnce(
      () => carry.mutateAsync(carryOverInput(t, today)),
      () => qc.invalidateQueries({ queryKey: ["tasks"] })
    ).then(({ failed }) => {
      if (failed) setCarryFailed((s) => withId(s, t.id, true));
      setCarrying((s) => withId(s, t.id, false));
    });
  };

  const open = (target: string) => {
    add.reset();
    update.reset();
    del.reset();
    onEdit(target);
  };

  // A past schedule only sends its title; a new date copies it (BR-04). The
  // title goes first so a failed copy can be retried from the same form.
  const submit = async (v: ScheduleInput, task?: Task) => {
    try {
      if (!task) {
        await add.mutateAsync({ ...v, plan_id: planId });
      } else {
        const { patch, copy } = planScheduleSave(task, v, today, carried);
        if (patch) await update.mutateAsync({ id: task.id, patch });
        if (copy) await add.mutateAsync(copy);
      }
      onClose();
    } catch {
      // The form stays open and shows the error (spec 3.5).
    }
  };

  const form = (task?: Task) => (
    <ScheduleForm
      key={task?.id ?? "new"}
      initial={
        task
          ? {
              title: task.title,
              scheduled_date: task.scheduled_date,
              importance: task.importance,
              is_milestone: task.is_milestone,
            }
          : { title: "", scheduled_date: today, importance: "中", is_milestone: false }
      }
      originalDate={task?.scheduled_date}
      today={today}
      lock={task && isLockedSchedule(task, today)
        ? { carry: canCarryOver(task, today, carried) }
        : undefined}
      saving={add.isPending || update.isPending || del.isPending}
      failed={add.isError || update.isError || del.isError}
      onCancel={onClose}
      onSubmit={(v) => submit(v, task)}
      onDelete={task ? () => {
        deferDelete({ key: `task:${task.id}`, label: task.title, commit: () => del.mutateAsync(task.id) });
        onClose();
      } : undefined}
    />
  );

  const row = (t: Task) => {
    if (editing === t.id) return form(t);
    const overdue = isOverdue(t, today, carried);
    const wasCarried = carried.has(t.id) && !t.completed;
    const dateColor = overdue ? OVERDUE : t.scheduled_date === today ? color : undefined;
    return (
      <div key={t.id} className="flex items-center gap-2.5 py-1.5 text-sm">
        {t.completed ? (
          <span aria-label="完了" className="w-3 shrink-0 text-center text-teal-500">✓</span>
        ) : wasCarried ? (
          <span aria-label="持ち越し済み" className="w-3 shrink-0 text-center muted">→</span>
        ) : (
          <span aria-label="未完了" className="w-3 h-3 shrink-0 rounded-full border-[1.5px]"
            style={{ borderColor: overdue ? OVERDUE : "#8A8985" }} />
        )}
        <button type="button" onClick={() => open(t.id)}
          className="flex flex-1 min-w-0 items-center gap-2.5 text-left hover:opacity-80">
          <span className={t.completed || wasCarried || !dateColor ? "w-12 shrink-0 muted" : "w-12 shrink-0"}
            style={t.completed || wasCarried ? undefined : { color: dateColor }}>
            {formatDateLabel(t.scheduled_date, today)}
          </span>
          <span className={t.completed || wasCarried ? "truncate muted" : "truncate"}>{t.title}</span>
          {t.is_milestone && (
            <span aria-label="マイルストーン" className="shrink-0" style={{ color }}>◇</span>
          )}
          {wasCarried && <span className="shrink-0 text-xs muted">持ち越し</span>}
        </button>
        {overdue && (
          <button type="button" disabled={carrying.has(t.id)}
            onClick={() => carryOver(t)}
            className="shrink-0 rounded-md border px-2.5 py-0.5 text-xs hover:bg-orange-500/10"
            style={{ borderColor: `${OVERDUE}80`, color: OVERDUE }}>
            今日に移す
          </button>
        )}
      </div>
    );
  };

  // A collapsed group still shows the row being edited (spec 3.5).
  const shown = (list: Task[], open: boolean) =>
    open ? list : list.filter((t) => t.id === editing);

  if (total === 0 && editing !== "new") {
    // Not stretched to the height of the card next to it (spec 3.4).
    return (
      <div className="self-start">
        <EmptyAddButton label="予定を追加" onClick={() => open("new")} />
      </div>
    );
  }

  return (
    <section className="card flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="section-title">予定</h2>
        <button type="button" aria-label="予定を追加" onClick={() => open("new")}
          className="btn-ghost !px-2 !py-0.5 text-lg leading-none muted">＋</button>
      </div>
      {carryFailed.size > 0 && <p className="text-xs text-red-500">{SAVE_ERROR_MESSAGE}</p>}
      <div className="flex flex-col">
        {editing === "new" && form()}
        {groups.visible.map(row)}
        {shown(groups.hidden, showHidden).map(row)}
      </div>
      {groups.hidden.length > 0 && (
        <FoldButton open={showHidden} label={`他 ${groups.hidden.length}件`}
          onToggle={() => setShowHidden(!showHidden)} />
      )}
      {groups.done.length > 0 && (
        <>
          <div className="flex flex-col">{shown(groups.done, showDone).map(row)}</div>
          <FoldButton open={showDone}
            label={groups.carriedCount > 0
              ? `完了 ${doneCount} · 持ち越し ${groups.carriedCount}`
              : `完了 ${doneCount}`}
            onToggle={() => setShowDone(!showDone)} />
        </>
      )}
    </section>
  );
}
