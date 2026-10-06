import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { formatDateLabel, type ScheduleDay, type ScheduleMarkState } from "@/lib/plans/logic";

const OVERDUE = "#F2994A";
const STATE_LABEL: Record<ScheduleMarkState, string> = { overdue: "期限切れ", open: "未完了", done: "完了" };
const POPOVER_WIDTH = 240;
const MARGIN = 8;

/**
 * Places a fixed box under its anchor (above it when it does not fit below), kept
 * inside the viewport. The timeline scrolls sideways and so clips anything inside it.
 */
function useFixedPlacement(shown: boolean, anchor: RefObject<HTMLElement>, box: RefObject<HTMLElement>) {
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  useLayoutEffect(() => {
    if (!shown || !anchor.current || !box.current) { setStyle({ visibility: "hidden" }); return; }
    const rect = anchor.current.getBoundingClientRect();
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - MARGIN * 2);
    const height = Math.min(box.current.scrollHeight, window.innerHeight - MARGIN * 2);
    const below = rect.bottom + 4;
    const above = rect.top - 4 - height;
    setStyle({
      left: Math.max(MARGIN, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - MARGIN)),
      top: Math.max(MARGIN, Math.min(below + height <= window.innerHeight - MARGIN || above < MARGIN ? below : above,
        window.innerHeight - MARGIN - height)),
      width,
      maxHeight: window.innerHeight - MARGIN * 2,
    });
  }, [shown, anchor, box]);
  return style;
}

const dot = (milestone: boolean, state: ScheduleMarkState, color: string, size: "small" | "large") =>
  <span aria-hidden="true" className={`block shrink-0 ${milestone
    ? size === "large" ? "h-2.5 w-2.5 rotate-45 rounded-[1px]" : "mt-1 h-2 w-2 rotate-45"
    : size === "large" ? "h-2 w-2 rounded-full" : "mt-1 h-1.5 w-1.5 rounded-full"}`}
    style={{ background: state === "overdue" ? OVERDUE : color, opacity: state === "done" ? 0.35 : 1 }} />;

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
  const hintBox = useRef<HTMLDivElement>(null);
  // A visible hint on hover and on keyboard focus (a title attribute only shows on hover).
  const [hint, setHint] = useState(false);
  const showHint = hint && !open;
  const popoverStyle = useFixedPlacement(open, button, popover);
  const hintStyle = useFixedPlacement(showHint, button, hintBox);
  const fill = day.state === "overdue" ? OVERDUE : color;
  const count = day.items.length;
  // A tap target at least 16px wide, centred on the covered days.
  const hit = Math.max(width, 16);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!button.current?.contains(target) && !popover.current?.contains(target)) onClose();
    };
    // Esc closes it wherever the focus is (Safari does not focus a clicked button).
    // It stops there, so an open form (useEscToCancel) is not cancelled by the same key.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    // A fixed popover would drift away from its marker, so close it instead.
    const close = () => onClose();
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, onClose]);

  return <>
    <button ref={button} type="button" aria-label={describe(day, today)} aria-expanded={open}
      onClick={onToggle}
      onPointerEnter={() => setHint(true)} onPointerLeave={() => setHint(false)}
      onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) setHint(true); }}
      onBlur={() => setHint(false)}
      className="absolute top-0 z-10 flex h-full items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-notion-blue"
      style={{ left: left + width / 2 - hit / 2, width: hit }}>
      {dot(day.milestone, day.state, color, "large")}
      {count > 1 && <span aria-hidden="true"
        className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-[10px] font-semibold tabular-nums leading-none"
        style={{ left: "calc(50% + 8px)", color: fill }}>{count}</span>}
    </button>
    {showHint && <div ref={hintBox} aria-hidden="true"
      className="pointer-events-none fixed z-50 overflow-hidden rounded-md bg-slate-800 px-2 py-1.5 text-[11px] leading-snug text-white shadow-lg dark:bg-notion-panel-hover"
      style={hintStyle}>
      <p className="font-semibold tabular-nums">{span(day, today)} · {count}件</p>
      {day.items.map(({ task }) => <p key={task.id} className="truncate">{task.is_milestone ? "◆ " : ""}{task.title}</p>)}
    </div>}
    {open && <div ref={popover} role="dialog" aria-label={`${span(day, today)}の予定`}
      className="fixed z-50 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-lg dark:border-notion-border dark:bg-notion-panel"
      style={popoverStyle}>
      <p className="font-semibold tabular-nums">{span(day, today)}</p>
      <ul className="space-y-1">
        {day.items.map(({ task, state }) => <li key={task.id} className="flex items-start gap-1.5">
          {dot(task.is_milestone, state, color, "small")}
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
