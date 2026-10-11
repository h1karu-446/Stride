import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { addMonths, differenceInCalendarDays, format, parseISO } from "date-fns";
import { addDaysISO } from "@/lib/date";
import { WEEKDAY_HEADERS } from "@/lib/calendar";
import { planHex } from "@/lib/plans/colors";
import { monthWeeks, weekSegments } from "@/lib/plans/calendar";
import { phaseColors, phaseDatesAfterDrag } from "@/lib/plans/logic";
import type { PhaseDragEdge, ScheduleDay } from "@/lib/plans/logic";
import ScheduleMarker from "./ScheduleMarker";
import type { Phase, PlanColor } from "@/types";

const md = (d: string) => `${parseISO(d).getMonth() + 1}/${parseISO(d).getDate()}`;
type Dates = { start_date: string; end_date: string };
type Drag =
  | { kind: "phase"; pointerId: number; id: string; edge: PhaseDragEdge; origin: string; start: string; end: string }
  | { kind: "create"; pointerId: number; origin: string };

/** Layout of a week row, in px. */
const DAY_LABEL = 26;
const LANE = 24;
const BAR = 20;
const MIN_ROW = 92;

/**
 * The calendar view of the phases: a month grid with each phase as a bar across
 * its days. Bars move and resize by dragging, as on the timeline; dragging over
 * empty days selects the period of a new phase.
 */
export default function PhaseCalendar({ phases, schedules = [], color, selectedId, today, onSelect, onAdd, onAdjustDates }: {
  phases: Phase[];
  schedules?: ScheduleDay[];
  color: PlanColor;
  selectedId?: string;
  today: string;
  onSelect: (id: string) => void;
  onAdd: (dates?: Dates) => void;
  onAdjustDates: (id: string, dates: Dates) => void;
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const weeks = monthWeeks(month);
  const grid = useRef<HTMLDivElement>(null);
  const [cellWidth, setCellWidth] = useState(0);
  // Measured before the first paint, so the bars do not start squeezed at the left.
  useLayoutEffect(() => {
    const element = grid.current;
    if (!element) return;
    setCellWidth(element.clientWidth / 7);
    const observer = new ResizeObserver(() => setCellWidth(element.clientWidth / 7));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const hex = planHex(color);
  const shades = phaseColors(phases, hex);
  const drag = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<{ id: string; dates: Dates } | null>(null);
  const [createPreview, setCreatePreview] = useState<Dates | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const closeDay = useCallback(() => setOpenDay(null), []);
  const monthDate = parseISO(`${month}-01`);
  const shift = (months: number) => setMonth(format(addMonths(monthDate, months), "yyyy-MM"));

  const shown = phases.map((phase) => ({ phase,
    ...(preview?.id === phase.id ? preview.dates : { start_date: phase.start_date!, end_date: phase.end_date! }) }));
  const byDate = new Map(schedules.map((day) => [day.date, day]));

  /** The day under the pointer; above or below the grid counts as the first or last week. */
  function dateAt(clientX: number, clientY: number): string {
    const rows = [...(grid.current?.querySelectorAll<HTMLElement>("[data-week]") ?? [])];
    const row = rows.find((r) => clientY < r.getBoundingClientRect().bottom) ?? rows[rows.length - 1];
    const rect = row.getBoundingClientRect();
    const col = Math.max(0, Math.min(6, Math.floor((clientX - rect.left) / (rect.width / 7))));
    return addDaysISO(row.dataset.week!, col);
  }
  const daysBetween = (from: string, to: string) => differenceInCalendarDays(parseISO(to), parseISO(from));
  const span = (a: string, b: string): Dates => a <= b ? { start_date: a, end_date: b } : { start_date: b, end_date: a };

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !grid.current) return;
    const target = event.target as HTMLElement;
    const bar = target.closest<HTMLElement>("[data-edge]");
    const origin = dateAt(event.clientX, event.clientY);
    if (bar) {
      const phase = phases.find((p) => p.id === bar.dataset.phaseId);
      if (!phase) return;
      drag.current = { kind: "phase", pointerId: event.pointerId, id: phase.id,
        edge: bar.dataset.edge as PhaseDragEdge, origin, start: phase.start_date!, end: phase.end_date! };
    } else if (target.closest("button") || event.pointerType === "touch") {
      // A touch on empty days scrolls the page; a phase is added with the button below.
      return;
    } else {
      drag.current = { kind: "create", pointerId: event.pointerId, origin };
      setCreatePreview(span(origin, origin));
    }
    grid.current.setPointerCapture(event.pointerId);
  }

  function datesFor(active: Extract<Drag, { kind: "phase" }>, clientX: number, clientY: number) {
    return phaseDatesAfterDrag(active.start, active.end, active.edge, daysBetween(active.origin, dateAt(clientX, clientY)));
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (active?.pointerId !== event.pointerId) return;
    if (active.kind === "phase") setPreview({ id: active.id, dates: datesFor(active, event.clientX, event.clientY) });
    else setCreatePreview(span(active.origin, dateAt(event.clientX, event.clientY)));
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (active?.pointerId !== event.pointerId) return;
    drag.current = null;
    setPreview(null);
    setCreatePreview(null);
    if (active.kind === "create") {
      onAdd(span(active.origin, dateAt(event.clientX, event.clientY)));
      return;
    }
    const dates = datesFor(active, event.clientX, event.clientY);
    if (dates.start_date !== active.start || dates.end_date !== active.end) onAdjustDates(active.id, dates);
    else if (active.edge === "move") onSelect(active.id);
  }

  function cancel() {
    drag.current = null;
    setPreview(null);
    setCreatePreview(null);
  }

  // A bar that moves into another week is a new element; keep the keyboard on it.
  const refocus = useRef<{ id: string; edge: PhaseDragEdge; until: number } | null>(null);
  useEffect(() => {
    const target = refocus.current;
    // Only right after the key: later the focus may have gone elsewhere on purpose.
    if (target && Date.now() > target.until) refocus.current = null;
    if (!refocus.current || !target || grid.current?.contains(document.activeElement)) return;
    refocus.current = null;
    const find = (edge: PhaseDragEdge) => grid.current?.querySelector<HTMLElement>(
      `[data-phase-id="${target.id}"][data-edge="${edge}"]`);
    (find(target.edge) ?? find("move"))?.focus();
  });

  function keyAdjust(event: KeyboardEvent<HTMLButtonElement>, phase: Phase, edge: PhaseDragEdge) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    refocus.current = { id: phase.id, edge, until: Date.now() + 2000 };
    onAdjustDates(phase.id, phaseDatesAfterDrag(phase.start_date!, phase.end_date!, edge,
      event.key === "ArrowLeft" ? -1 : 1));
  }
  // Pointer clicks are handled in pointerUp (the grid captures the pointer); this is Enter / Space.
  const keyboardSelect = (event: MouseEvent, id: string) => { if (event.detail === 0) onSelect(id); };

  const handle = "w-2 shrink-0 cursor-ew-resize transition hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-notion-blue dark:hover:bg-white/15";

  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-notion-border dark:bg-notion-panel">
    <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-2 py-1 dark:border-notion-border dark:bg-notion-panel-hover">
      <span className="pl-1 text-sm font-semibold tabular-nums" aria-live="polite">{format(monthDate, "yyyy年M月")}</span>
      <div className="flex items-center gap-0.5">
        <button type="button" className="btn-ghost !px-2 !py-1" aria-label="前の月" onClick={() => shift(-1)}>
          <Chevron dir="left" />
        </button>
        <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setMonth(today.slice(0, 7))}>今日</button>
        <button type="button" className="btn-ghost !px-2 !py-1" aria-label="次の月" onClick={() => shift(1)}>
          <Chevron dir="right" />
        </button>
      </div>
    </div>
    <div aria-hidden="true" className="grid grid-cols-7 border-b border-slate-200 text-center text-[11px] muted dark:border-notion-border">
      {WEEKDAY_HEADERS.map((d) => <div key={d} className="py-1">{d}</div>)}
    </div>
    <div ref={grid} title="空いている日をドラッグして新しいフェーズの期間を選択"
      className="relative cursor-crosshair touch-pan-y select-none"
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={cancel}>
      {weeks.map((week) => {
        const segments = weekSegments(shown, week);
        const created = createPreview ? weekSegments([createPreview], week)[0] : undefined;
        const lanes = segments.reduce((max, s) => Math.max(max, s.lane + 1), 0);
        const height = Math.max(MIN_ROW, DAY_LABEL + lanes * LANE + 20);
        return <div key={week} data-week={week} className="relative border-b border-slate-100 last:border-b-0 dark:border-notion-border/60" style={{ height }}>
          {Array.from({ length: 7 }, (_, col) => {
            const date = addDaysISO(week, col);
            const inMonth = date.startsWith(month);
            const day = byDate.get(date);
            return <div key={date} className={`absolute bottom-0 top-0 border-slate-100 dark:border-notion-border/60 ${col > 0 ? "border-l" : ""} ${inMonth ? "" : "bg-slate-50/80 dark:bg-notion-panel-hover/40"}`}
              style={{ left: col * cellWidth, width: cellWidth }}>
              <span aria-current={date === today ? "date" : undefined}
                className={`pointer-events-none absolute left-1 top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] tabular-nums ${
                  date === today ? "bg-rose-500 font-semibold text-white" : inMonth ? "font-medium" : "muted"}`}>
                {parseISO(date).getDate() === 1 ? `${parseISO(date).getMonth() + 1}/1` : parseISO(date).getDate()}
              </span>
              {/* The mark and its popover (a child here) are not part of the grid's drags. */}
              {day && <div role="group" aria-label="予定" className="absolute right-0 top-1 h-5" style={{ width: cellWidth / 2 }}
                onPointerDown={(event) => event.stopPropagation()}>
                <ScheduleMarker day={day} left={0} width={cellWidth / 2} color={hex} today={today}
                  open={openDay === day.date}
                  onToggle={() => setOpenDay((current) => current === day.date ? null : day.date)}
                  onClose={closeDay} />
              </div>}
            </div>;
          })}
          {created && <div aria-hidden="true"
            className="pointer-events-none absolute rounded-md border border-dashed"
            style={{ top: DAY_LABEL + lanes * LANE, height: BAR, left: created.startCol * cellWidth + 2,
              width: (created.endCol - created.startCol + 1) * cellWidth - 4, borderColor: hex, background: `${hex}38` }} />}
          {created && createPreview && !created.continuesAfter && <span
            className="pointer-events-none absolute z-20 rounded bg-white/90 px-1.5 text-xs tabular-nums dark:bg-notion-panel-hover"
            style={{ top: DAY_LABEL + lanes * LANE + BAR + 2, left: created.startCol * cellWidth + 2 }}>
            {md(createPreview.start_date)}–{md(createPreview.end_date)}
          </span>}
          {segments.map(({ item: { phase, start_date, end_date }, startCol, endCol, continuesBefore, continuesAfter, lane }) => {
            const selected = phase.id === selectedId;
            const shade = shades.get(phase.id) ?? hex;
            const done = phase.completed_at;
            const left = startCol * cellWidth + (continuesBefore ? 0 : 3);
            const width = (endCol - startCol + 1) * cellWidth - (continuesBefore ? 0 : 3) - (continuesAfter ? 0 : 3);
            const label = `${phase.name} ${md(start_date)}から${md(end_date)}${done ? `、${md(done)}に完了` : ""}`;
            return <div key={phase.id}
              className={`absolute z-10 flex touch-none overflow-hidden border text-xs font-medium ${continuesBefore ? "rounded-l-none border-l-0" : "rounded-l-md"} ${continuesAfter ? "rounded-r-none border-r-0" : "rounded-r-md"}`}
              style={{ top: DAY_LABEL + lane * LANE, height: BAR, left, width,
                borderColor: selected ? shade : `${shade}66`,
                background: selected ? `${shade}40` : `${shade}24`,
                boxShadow: selected ? `0 0 0 1px ${shade}` : undefined }}>
              {!continuesBefore && <button type="button" data-phase-id={phase.id} data-edge="start"
                aria-label={`${phase.name}の開始日 ${md(start_date)} を調整`} title="開始日をドラッグ（左右キーでも1日ずつ調整）"
                className={handle} onKeyDown={(event) => keyAdjust(event, phase, "start")} />}
              <button type="button" data-phase-id={phase.id} data-edge="move"
                aria-label={`${label}、ドラッグで移動`} title={label}
                className={`min-w-0 flex-1 cursor-grab truncate text-left active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-notion-blue ${continuesBefore ? "pl-1.5" : ""}`}
                onKeyDown={(event) => keyAdjust(event, phase, "move")}
                onClick={(event) => keyboardSelect(event, phase.id)}>
                {done && <span aria-hidden="true" className="mr-1">✓</span>}{phase.name}
              </button>
              {!continuesAfter && <button type="button" data-phase-id={phase.id} data-edge="end"
                aria-label={`${phase.name}の終了日 ${md(end_date)} を調整`} title="終了日をドラッグ（左右キーでも1日ずつ調整）"
                className={handle} onKeyDown={(event) => keyAdjust(event, phase, "end")} />}
            </div>;
          })}
        </div>;
      })}
    </div>
    <div className="border-t border-slate-200/70 bg-slate-50/60 px-2 py-1.5 dark:border-notion-border dark:bg-notion-panel-hover/40">
      <button type="button" onClick={() => onAdd()}
        className="rounded-md px-2 py-1 text-xs font-medium text-notion-blue hover:bg-notion-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-notion-blue">
        ＋ フェーズを追加
      </button>
    </div>
  </div>;
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points={dir === "left" ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
  </svg>;
}
