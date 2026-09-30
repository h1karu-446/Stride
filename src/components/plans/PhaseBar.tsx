import { Fragment } from "react";
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
  const ordered = sortedPhases(phases);
  return (
    <div className="flex overflow-x-auto rounded-xl border border-slate-200 dark:border-notion-border">
      {ordered.map((ph, index) => {
        const days = differenceInCalendarDays(parseISO(ph.end_date!), parseISO(ph.start_date!)) + 1;
        const previousEnd = ordered[index - 1]?.end_date;
        const gapDays = previousEnd
          ? differenceInCalendarDays(parseISO(ph.start_date!), parseISO(previousEnd)) - 1
          : 0;
        const todayInGap = !!previousEnd && previousEnd < today && today < ph.start_date!;
        const selected = ph.id === selectedId;
        const containsToday = ph.start_date! <= today && today <= ph.end_date!;
        const past = ph.end_date! < today;
        const todayPos = containsToday
          ? ((differenceInCalendarDays(parseISO(today), parseISO(ph.start_date!)) + 0.5) / days) * 100
          : undefined;
        return <Fragment key={ph.id}>
          {gapDays > 0 && (
            <div aria-label={`フェーズのない期間 ${gapDays}日`}
              style={{ flex: `${gapDays} 1 0`, minWidth: 96 }}
              className="relative flex shrink-0 items-center justify-center border-r border-slate-200 bg-slate-50 px-2 text-xs muted dark:border-notion-border dark:bg-notion-panel-hover">
              <span>空白 {gapDays}日</span>
              {todayInGap && <span aria-label="今日"
                className="absolute inset-y-0 w-px bg-slate-900 dark:bg-white"
                style={{ left: `${((differenceInCalendarDays(parseISO(today), parseISO(previousEnd)) - 0.5) / gapDays) * 100}%` }} />}
            </div>
          )}
          <button
            type="button"
            onClick={() => onSelect(ph.id)}
            style={{
              flex: `${days} 1 0`,
              minWidth: 120,
              background: selected ? `${hex}26` : undefined,
              boxShadow: selected ? `inset 0 -3px 0 ${hex}` : undefined,
            }}
            className={clsx(
              "relative border-r border-slate-200 px-3 py-2.5 text-left transition dark:border-notion-border",
              selected
                ? ""
                : "hover:bg-slate-50 dark:hover:bg-notion-panel-hover",
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
        </Fragment>;
      })}
      <button
        type="button"
        onClick={onAdd}
        aria-label="フェーズを追加"
        className="shrink-0 w-12 border-l border-dashed border-slate-300 muted hover:bg-slate-50 dark:border-notion-border-strong dark:hover:bg-notion-panel-hover"
      >
        ＋
      </button>
    </div>
  );
}
