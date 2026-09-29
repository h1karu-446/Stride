import { useState } from "react";
import { weekdaysLabel } from "@/lib/plans/logic";
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
    <div className="rounded-lg border border-slate-200 dark:border-notion-border p-4 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold">{routine.title}</span>
        <Chip>{routine.minutes}分</Chip>
        <Chip>{weekdaysLabel(routine.weekdays)}</Chip>
        <Chip>{routine.importance}</Chip>
        <button type="button" onClick={onEdit} aria-label="ルーティンを編集"
          className="ml-auto btn-ghost !p-1.5">✎</button>
      </div>
      {routine.menu && (
        <div className="text-sm whitespace-pre-wrap muted">
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
