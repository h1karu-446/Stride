import clsx from "clsx";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { planHex } from "@/lib/plans/colors";
import { sortedPhases } from "@/lib/plans/logic";
import type { Phase, PlanColor } from "@/types";

const md = (d?: string) => (d ? `${parseISO(d).getMonth() + 1}/${parseISO(d).getDate()}` : "");

/** Horizontal phase strip, widths proportional to the period (spec 4.2). */
export default function PhaseBar({
  phases,
  color,
  selectedId,
  today,
  onSelect,
  onAdd,
}: {
  phases: Phase[];
  color: PlanColor;
  selectedId?: string;
  today: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const hex = planHex(color);
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {sortedPhases(phases).map((ph) => {
        const days = differenceInCalendarDays(parseISO(ph.end_date!), parseISO(ph.start_date!)) + 1;
        const selected = ph.id === selectedId;
        const containsToday = ph.start_date! <= today && today <= ph.end_date!;
        const past = ph.end_date! < today;
        const todayPos = containsToday
          ? ((differenceInCalendarDays(parseISO(today), parseISO(ph.start_date!)) + 0.5) / days) * 100
          : undefined;
        return (
          <button
            key={ph.id}
            type="button"
            onClick={() => onSelect(ph.id)}
            style={{
              flex: `${days} 1 0`,
              minWidth: 120,
              borderColor: selected ? hex : undefined,
              background: selected ? `${hex}26` : undefined,
            }}
            className={clsx(
              "relative text-left rounded-lg border-2 px-3 py-2.5 transition",
              selected
                ? ""
                : "border-slate-200 dark:border-notion-border hover:bg-slate-50 dark:hover:bg-notion-panel-hover",
              past && !selected && "opacity-60"
            )}
          >
            <div className="text-sm font-medium truncate">{ph.name}</div>
            <div className="text-xs muted">{md(ph.start_date)} – {md(ph.end_date)}</div>
            {todayPos !== undefined && (
              <span
                aria-label="今日"
                className="absolute -top-1 -bottom-1 w-px bg-slate-900 dark:bg-white"
                style={{ left: `${todayPos}%` }}
              />
            )}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onAdd}
        aria-label="フェーズを追加"
        className="shrink-0 w-12 rounded-lg border border-dashed border-slate-300 dark:border-notion-border-strong muted hover:bg-slate-50 dark:hover:bg-notion-panel-hover"
      >
        ＋
      </button>
    </div>
  );
}
