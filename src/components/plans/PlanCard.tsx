import { Link } from "react-router-dom";
import ExecutionSquares from "./ExecutionSquares";
import PlanIcon from "./PlanIcon";
import { planHex } from "@/lib/plans/colors";
import {
  daysLeftLabel,
  executionCells,
  formatDateLabel,
  nextSchedule,
  phasesForDate,
  phaseProgress,
  routinesForDate,
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
  const activePhases = phasesForDate(plan.phases, today);
  const phase = activePhases[0];
  const routines = routinesForDate(plan, today);
  const exec = executionCells(tasks, plan.id, today, 7);

  let middle: React.ReactNode = null;
  if (explicit.length > 0) {
    middle = activePhases.length > 1 ? (
      <div className="space-y-1">
        <div className="truncate text-sm">{activePhases.map((p) => p.name).join(" · ")}</div>
        <div className="text-xs muted">{activePhases.length}フェーズが進行中</div>
      </div>
    ) : phase && !phase.is_implicit ? (
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
      className="group relative flex flex-col gap-4 overflow-hidden rounded-xl border border-slate-200 bg-white p-5 transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-notion-blue dark:border-notion-border dark:bg-notion-panel dark:hover:border-notion-border-strong"
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 opacity-70" style={{ background: color }} />
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <PlanIcon plan={plan} />
          <span className="truncate text-[15px] font-semibold">{plan.name}</span>
        </span>
        {plan.due_date && (
          <span className="mt-1 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium tabular-nums muted dark:bg-notion-panel-hover">
            {daysLeftLabel(plan.due_date, today)}
          </span>
        )}
      </div>
      {middle}
      <div className="flex items-center justify-between gap-2 text-sm muted">
        {routineLine}
        <ExecutionSquares cells={exec.cells} color={color} today={today} />
      </div>
      <div className="mt-auto flex min-w-0 items-center gap-2 border-t border-slate-100 pt-3 text-sm dark:border-notion-border">
        <span aria-hidden className="text-xs muted">◷</span>
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
    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-notion-border">
      <div className="h-full" style={{ width: `${Math.round(ratio * 100)}%`, background: color }} />
    </div>
  );
}
