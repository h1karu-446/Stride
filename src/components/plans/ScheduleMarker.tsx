import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatDateLabel, type ScheduleDay, type ScheduleMarkState } from "@/lib/plans/logic";

const OVERDUE = "#F2994A";
const STATE_LABEL: Record<ScheduleMarkState, string> = { overdue: "期限切れ", open: "未完了", done: "完了" };
const POPOVER_WIDTH = 240;

const span = (day: ScheduleDay, today: string) => day.end === day.date ? formatDateLabel(day.date, today)
  : `${formatDateLabel(day.date, today)}–${formatDateLabel(day.end, today)}`;
const describe = (day: ScheduleDay, today: string) =>
  `${span(day, today)}の予定 ${day.items.length}件: ${day.items.map(({ task, state }) =>
    `${day.end === day.date ? "" : `${formatDateLabel(task.scheduled_date, today)} `}${task.title}（${task.is_milestone ? "マイルストーン、" : ""}${STATE_LABEL[state]}）`).join("、")}`;

/**
 * The schedules of one day, or of a few nearby days merged at a small scale, on the
 * phase timeline (Issue #79): a dot, or a diamond when there is a milestone.
 * Clicking shows the details; editing stays in the list.
 */
export default function ScheduleMarker({ day, left, width, color, today, open, onToggle, onClose }: {
  day: ScheduleDay;
  /** Where the covered days start and how wide they are, in px. */
  left: number;
  width: number;
  color: string;
  today: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const fill = day.state === "overdue" ? OVERDUE : color;
  const count = day.items.length;
  // A tap target at least 16px wide, centred on the covered days.
  const hit = Math.max(width, 16);

  // The timeline scrolls sideways (and so clips), so the popover is fixed to the viewport.
  useLayoutEffect(() => {
    if (!open || !button.current) { setPosition(null); return; }
    const rect = button.current.getBoundingClientRect();
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - 16);
    setPosition({
      left: Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8)),
      top: rect.bottom + 4,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!button.current?.contains(target) && !popover.current?.contains(target)) onClose();
    };
    // A fixed popover would drift away from its marker, so close it instead.
    const close = () => onClose();
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, onClose]);

  return <>
    <button ref={button} type="button" aria-label={describe(day, today)} aria-expanded={open}
      title={describe(day, today)}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          // Keep open forms (useEscToCancel on window) from being cancelled too.
          event.nativeEvent.stopImmediatePropagation();
          onClose();
        }
      }}
      className="absolute top-0 z-10 flex h-full items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-notion-blue"
      style={{ left: left + width / 2 - hit / 2, width: hit }}>
      <span aria-hidden="true"
        className={`block shrink-0 ${day.milestone ? "h-2.5 w-2.5 rotate-45 rounded-[1px]" : "h-2 w-2 rounded-full"}`}
        style={{ background: fill, opacity: day.state === "done" ? 0.35 : 1 }} />
      {count > 1 && <span aria-hidden="true"
        className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-[10px] font-semibold tabular-nums leading-none"
        style={{ left: "calc(50% + 8px)", color: fill }}>{count}</span>}
    </button>
    {open && position && <div ref={popover} role="dialog" aria-label={`${span(day, today)}の予定`}
      className="fixed z-50 space-y-1.5 rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-lg dark:border-notion-border dark:bg-notion-panel"
      style={{ left: position.left, top: position.top, width: Math.min(POPOVER_WIDTH, window.innerWidth - 16) }}>
      <p className="font-semibold tabular-nums">{span(day, today)}</p>
      <ul className="space-y-1">
        {day.items.map(({ task, state }) => <li key={task.id} className="flex items-start gap-1.5">
          <span aria-hidden="true" className={`mt-1 block shrink-0 ${task.is_milestone ? "h-2 w-2 rotate-45" : "h-1.5 w-1.5 rounded-full"}`}
            style={{ background: state === "overdue" ? OVERDUE : color, opacity: state === "done" ? 0.35 : 1 }} />
          <span className={`min-w-0 flex-1 break-words ${state === "done" ? "muted line-through" : ""}`}>
            {day.end !== day.date && <span className="mr-1 tabular-nums muted">{formatDateLabel(task.scheduled_date, today)}</span>}
            {task.title}
          </span>
          <span className="shrink-0 muted" style={state === "overdue" ? { color: OVERDUE } : undefined}>
            {task.is_milestone ? "◆ " : ""}{STATE_LABEL[state]}
          </span>
        </li>)}
      </ul>
    </div>}
  </>;
}
