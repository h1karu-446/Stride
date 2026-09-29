import { Link } from "react-router-dom";
import ExecutionSquares from "./ExecutionSquares";
import { planHex } from "@/lib/plans/colors";
import {
  daysLeftLabel,
  executionCells,
  formatDateLabel,
  nextSchedule,
  phaseForDate,
  phaseProgress,
  weekdaysLabel,
} from "@/lib/plans/logic";
import type { Plan, Task } from "@/types";

/** Card for an active plan on the list screen (spec 4.1). */
export default function PlanCard({
  plan,
  tasks,
  today,
}: {
  plan: Plan;
  tasks: Task[];
  today: string;
}) {
  const color = planHex(plan.color);
  const explicit = plan.phases.filter((p) => !p.is_implicit);
  const phase = phaseForDate(plan.phases, today);
  const routines = phase?.routines ?? [];
  const exec = executionCells(tasks, plan.id, today, 7);

  let middle: React.ReactNode = null;
  if (explicit.length > 0) {
    middle = phase && !phase.is_implicit ? (
      <div className="space-y-1.5">
        <div className="text-sm truncate">{phase.name}</div>
        <Bar ratio={phaseProgress(phase, today)} color={color} />
      </div>
    ) : (
      <div className="text-sm muted">フェーズ期間外</div>
    );
  } else if (plan.materials.length > 0) {
    // No phases: show material progress instead (spec 4.1).
    const doneCount = plan.materials.filter((m) => m.status === "done").length;
    middle = (
      <div className="space-y-1.5">
        <div className="text-sm muted">教材 {doneCount} / {plan.materials.length}</div>
        <Bar ratio={doneCount / plan.materials.length} color={color} />
      </div>
    );
  }
  const next = nextSchedule(tasks, plan.id, today);

  let routineLine: React.ReactNode;
  if (explicit.length > 0 && !phase) {
    routineLine = <span>今日のルーティンなし</span>;
  } else if (routines.length === 0) {
    routineLine = <span>ルーティンなし</span>;
  } else if (routines.length === 1) {
    routineLine = (
      <span>
        {routines[0].minutes}分 · {weekdaysLabel(routines[0].weekdays)}
      </span>
    );
  } else {
    routineLine = <span>{routines.reduce((s, r) => s + r.minutes, 0)}分</span>;
  }

  return (
    <Link
      to={`/plans/${plan.id}`}
      className="card !p-5 flex flex-col gap-4 hover:bg-slate-50 dark:hover:bg-notion-panel-hover transition"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
          <span className="truncate">{plan.name}</span>
        </span>
        {plan.due_date && (
          <span className="text-xs muted shrink-0">
            {daysLeftLabel(plan.due_date, today)}
          </span>
        )}
      </div>
      {middle}
      <div className="flex items-center justify-between gap-2 text-sm muted">
        {routineLine}
        <ExecutionSquares cells={exec.cells} color={color} today={today} />
      </div>
      <div className="mt-auto border-t border-slate-200 dark:border-notion-border pt-3 text-sm flex gap-2 min-w-0">
        {next ? (
          <>
            <span className="shrink-0"
              style={{ color: next.overdue ? "#F2994A" : next.task.scheduled_date === today ? color : undefined }}>
              {next.overdue ? "期限切れ" : formatDateLabel(next.task.scheduled_date, today)}
            </span>
            <span className="truncate">{next.task.title}</span>
          </>
        ) : (
          <span className="muted">予定なし</span>
        )}
      </div>
    </Link>
  );
}

function Bar({ ratio, color }: { ratio: number; color: string }) {
  return (
    <div className="h-1.5 rounded-full bg-slate-200 dark:bg-notion-border overflow-hidden">
      <div className="h-full" style={{ width: `${Math.round(ratio * 100)}%`, background: color }} />
    </div>
  );
}
