import { useState } from "react";
import EmptyAddButton from "@/components/common/EmptyAddButton";
import { FoldButton, SAVE_ERROR_MESSAGE } from "@/components/common/FormParts";
import ScheduleForm, { type ScheduleInput } from "./ScheduleForm";
import { formatDateLabel, isOverdue, scheduleGroups } from "@/lib/plans/logic";
import { useAddTask, useDeleteTask, useUpdateTask } from "@/lib/queries";
import type { Task } from "@/types";

const OVERDUE = "#F2994A";

/**
 * 予定 on the plan detail screen (spec 4.2, BR-04). Schedules are tasks with
 * plan_id set; completing them only happens on Today.
 * `editing` is the open form: a task id, "new", or null. The page keeps it so
 * only one form is open across the whole screen (spec 3.6).
 */
export default function ScheduleList({
  planId,
  color,
  tasks,
  today,
  editing,
  onEdit,
  onClose,
}: {
  planId: string;
  color: string;
  tasks: Task[];
  today: string;
  editing: string | null;
  onEdit: (target: string) => void;
  onClose: () => void;
}) {
  const add = useAddTask();
  const update = useUpdateTask();
  const del = useDeleteTask();
  const move = useUpdateTask();
  const [showHidden, setShowHidden] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const groups = scheduleGroups(tasks, planId);
  const total = groups.visible.length + groups.hidden.length + groups.done.length;

  const open = (target: string) => {
    add.reset();
    update.reset();
    del.reset();
    onEdit(target);
  };

  const submit = (v: ScheduleInput, task?: Task) => {
    if (task) {
      update.mutate({ id: task.id, patch: v }, { onSuccess: onClose });
    } else {
      add.mutate({ ...v, plan_id: planId }, { onSuccess: onClose });
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
      saving={add.isPending || update.isPending || del.isPending}
      failed={add.isError || update.isError || del.isError}
      onCancel={onClose}
      onSubmit={(v) => submit(v, task)}
      onDelete={task ? () => del.mutate(task.id, { onSuccess: onClose }) : undefined}
    />
  );

  const row = (t: Task) => {
    if (editing === t.id) return form(t);
    const overdue = isOverdue(t, today);
    const dateColor = overdue ? OVERDUE : t.scheduled_date === today ? color : undefined;
    return (
      <div key={t.id} className="flex items-center gap-2.5 py-1.5 text-sm">
        {t.completed ? (
          <span aria-label="完了" className="w-3 shrink-0 text-center text-teal-500">✓</span>
        ) : (
          <span aria-label="未完了" className="w-3 h-3 shrink-0 rounded-full border-[1.5px]"
            style={{ borderColor: overdue ? OVERDUE : "#8A8985" }} />
        )}
        <button type="button" onClick={() => open(t.id)}
          className="flex flex-1 min-w-0 items-center gap-2.5 text-left hover:opacity-80">
          <span className={t.completed || !dateColor ? "w-12 shrink-0 muted" : "w-12 shrink-0"}
            style={t.completed ? undefined : { color: dateColor }}>
            {formatDateLabel(t.scheduled_date, today)}
          </span>
          <span className={t.completed ? "truncate muted" : "truncate"}>{t.title}</span>
          {t.is_milestone && (
            <span aria-label="マイルストーン" className="shrink-0" style={{ color }}>◇</span>
          )}
        </button>
        {overdue && (
          <button type="button" disabled={move.isPending}
            onClick={() => move.mutate({ id: t.id, patch: { scheduled_date: today } })}
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
        <h2 className="text-sm font-semibold">予定</h2>
        <button type="button" aria-label="予定を追加" onClick={() => open("new")}
          className="btn-ghost !px-2 !py-0.5 text-lg leading-none muted">＋</button>
      </div>
      {move.isError && <p className="text-xs text-red-500">{SAVE_ERROR_MESSAGE}</p>}
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
          <FoldButton open={showDone} label={`完了 ${groups.done.length}`}
            onToggle={() => setShowDone(!showDone)} />
        </>
      )}
    </section>
  );
}
