import { useState } from "react";
import { formatMinutes, weekdaysLabel } from "@/lib/plans/logic";
import type { Routine } from "@/types";

const MENU_LINES = 4;

export default function RoutineCard({
  routine,
  onEdit,
}: {
  routine: Routine;
  onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const lines = (routine.menu ?? "").split("\n");
  const long = lines.length > MENU_LINES;

  return (
    // A tile in the menu grid: title and ✎ on top, then the schedule, then the free-form detail.
    <div className="flex min-w-0 flex-col gap-2.5 rounded-lg border border-slate-200 p-4 transition hover:border-slate-300 dark:border-notion-border dark:hover:border-notion-border-strong">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 break-words font-semibold leading-snug">{routine.title}</span>
        <button type="button" onClick={onEdit} aria-label="メニューを編集"
          className="btn-ghost -mr-1.5 -mt-1 shrink-0 !p-1.5 muted">✎</button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip>{formatMinutes(routine.minutes)}</Chip>
        <Chip>{weekdaysLabel(routine.weekdays)}</Chip>
        <Chip>重要度 {routine.importance}</Chip>
      </div>
      {routine.menu && (
        <div className="border-t border-slate-100 pt-2.5 text-sm leading-relaxed whitespace-pre-wrap muted dark:border-notion-border" aria-label="メニューの詳細">
          {expanded || !long ? routine.menu : lines.slice(0, MENU_LINES).join("\n")}
          {long && (
            <button type="button" onClick={() => setExpanded(!expanded)}
              className="block mt-1 text-xs text-blue-500 hover:underline">
              {expanded ? "閉じる" : "続きを表示"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-slate-100 dark:bg-notion-panel-hover px-2.5 py-0.5 text-xs">
      {children}
    </span>
  );
}
