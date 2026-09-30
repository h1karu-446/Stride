import { useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { addMonths, differenceInCalendarDays, format, parseISO, startOfMonth } from "date-fns";
import { addDaysISO } from "@/lib/date";
import { planHex } from "@/lib/plans/colors";
import { phaseDatesAfterDrag, sortedPhases } from "@/lib/plans/logic";
import type { PhaseDragEdge } from "@/lib/plans/logic";
import type { Phase, PlanColor } from "@/types";

const md = (d: string) => `${parseISO(d).getMonth() + 1}/${parseISO(d).getDate()}`;
type Dates = { start_date: string; end_date: string };
type Drag = { id: string; pointerId: number; x: number; edge: PhaseDragEdge;
  start: string; end: string };
type CreateDrag = { pointerId: number; startDay: number };

/** A shared date axis keeps adjacent, empty, and overlapping periods honest. */
export default function PhaseBar({ phases, color, selectedId, today, onSelect, onAdd, onAdjustDates }: {
  phases: Phase[];
  color: PlanColor;
  selectedId?: string;
  today: string;
  onSelect: (id: string) => void;
  onAdd: (dates?: Dates) => void;
  onAdjustDates: (id: string, dates: Dates) => void;
}) {
  const ordered = sortedPhases(phases);
  const first = ordered[0];
  const lastEnd = ordered.reduce((end, phase) => phase.end_date! > end ? phase.end_date! : end,
    first?.end_date ?? today);
  const axisStart = addDaysISO(first?.start_date ?? today, -7);
  const axisEnd = addDaysISO(lastEnd > today ? lastEnd : today, 37);
  const totalDays = differenceInCalendarDays(parseISO(axisEnd), parseISO(axisStart)) + 1;
  const width = Math.max(360, totalDays * (totalDays > 180 ? 8 : totalDays > 60 ? 10 : 14));
  const dayWidth = width / totalDays;
  const xFor = (date: string) => differenceInCalendarDays(parseISO(date), parseISO(axisStart)) * dayWidth;
  const drag = useRef<Drag | null>(null);
  const createDrag = useRef<CreateDrag | null>(null);
  const ignoreClickUntil = useRef(0);
  const [preview, setPreview] = useState<{ id: string; dates: Dates } | null>(null);
  const [createPreview, setCreatePreview] = useState<Dates | null>(null);
  const hex = planHex(color);

  // Month dividers make the axis readable at a glance.
  const months: { date: string; label: string }[] = [];
  for (let m = startOfMonth(addMonths(parseISO(axisStart), 1)); format(m, "yyyy-MM-dd") <= axisEnd; m = addMonths(m, 1)) {
    const date = format(m, "yyyy-MM-dd");
    months.push({ date, label: m.getMonth() === 0 ? format(m, "yyyy/M月") : `${m.getMonth() + 1}月` });
  }
  // Phases that do not overlap share a row; overlapping ones go to the next free row.
  const lanes: Phase[][] = [];
  for (const phase of ordered) {
    const lane = lanes.find((row) => row[row.length - 1].end_date! < phase.start_date!);
    if (lane) lane.push(phase); else lanes.push([phase]);
  }

  const gaps: { start: string; end: string; days: number }[] = [];
  let coveredUntil = first?.end_date ?? today;
  for (const phase of ordered.slice(1)) {
    if (phase.start_date! > addDaysISO(coveredUntil, 1)) {
      const start = addDaysISO(coveredUntil, 1);
      const end = addDaysISO(phase.start_date!, -1);
      gaps.push({ start, end, days: differenceInCalendarDays(parseISO(end), parseISO(start)) + 1 });
    }
    if (phase.end_date! > coveredUntil) coveredUntil = phase.end_date!;
  }

  function pointerDown(event: PointerEvent<HTMLButtonElement>, phase: Phase, edge: PhaseDragEdge) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: phase.id, pointerId: event.pointerId, x: event.clientX,
      edge, start: phase.start_date!, end: phase.end_date! };
  }

  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const days = Math.round((event.clientX - active.x) / dayWidth);
    setPreview({ id: active.id, dates: phaseDatesAfterDrag(active.start, active.end, active.edge, days) });
  }

  function pointerUp(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    setPreview(null);
    const days = Math.round((event.clientX - active.x) / dayWidth);
    const dates = phaseDatesAfterDrag(active.start, active.end, active.edge, days);
    if (dates.start_date !== active.start || dates.end_date !== active.end) {
      ignoreClickUntil.current = Date.now() + 350;
      onAdjustDates(active.id, dates);
    }
  }

  function keyAdjust(event: KeyboardEvent<HTMLButtonElement>, phase: Phase, edge: PhaseDragEdge) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const dates = phaseDatesAfterDrag(phase.start_date!, phase.end_date!, edge,
      event.key === "ArrowLeft" ? -1 : 1);
    onAdjustDates(phase.id, dates);
  }

  function dayAt(clientX: number, row: HTMLDivElement) {
    return Math.max(0, Math.min(totalDays - 1,
      Math.floor((clientX - row.getBoundingClientRect().left) / dayWidth)));
  }

  function selectedDates(startDay: number, endDay: number): Dates {
    return {
      start_date: addDaysISO(axisStart, Math.min(startDay, endDay)),
      end_date: addDaysISO(axisStart, Math.max(startDay, endDay)),
    };
  }

  function createPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const startDay = dayAt(event.clientX, event.currentTarget);
    event.currentTarget.setPointerCapture(event.pointerId);
    createDrag.current = { pointerId: event.pointerId, startDay };
    setCreatePreview(selectedDates(startDay, startDay));
  }

  function createPointerMove(event: PointerEvent<HTMLDivElement>) {
    const active = createDrag.current;
    if (active?.pointerId !== event.pointerId) return;
    setCreatePreview(selectedDates(active.startDay, dayAt(event.clientX, event.currentTarget)));
  }

  function createPointerUp(event: PointerEvent<HTMLDivElement>) {
    const active = createDrag.current;
    if (active?.pointerId !== event.pointerId) return;
    const dates = selectedDates(active.startDay, dayAt(event.clientX, event.currentTarget));
    createDrag.current = null;
    setCreatePreview(null);
    onAdd(dates);
  }

  const dragEvents = {
    onPointerMove: pointerMove,
    onPointerUp: pointerUp,
    onPointerCancel: () => { drag.current = null; setPreview(null); },
  };

  return <section aria-label="フェーズの期間" className="space-y-2">
    <div className="flex items-end justify-between gap-3">
      <h2 className="text-sm font-semibold">フェーズ</h2>
      <p className="hidden text-[11px] muted sm:block">帯をドラッグで移動・端で期間を調整</p>
    </div>
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-notion-border dark:bg-notion-panel">
      <div className="relative" style={{ width }}>
        <div className="relative h-7 border-b border-slate-200 bg-slate-50 text-[11px] muted dark:border-notion-border dark:bg-notion-panel-hover">
          {months.map((m) => <span key={m.date} className="absolute top-1.5 pl-1.5 font-medium" style={{ left: xFor(m.date) }}>{m.label}</span>)}
        </div>
        {months.map((m) => <div key={m.date} aria-hidden="true" className="pointer-events-none absolute bottom-0 top-0 border-l border-slate-200 dark:border-notion-border" style={{ left: xFor(m.date) }} />)}
        {gaps.map((gap) => <div key={gap.start} aria-hidden="true"
          className="pointer-events-none absolute bottom-0 top-7 border-x border-dashed border-slate-300 bg-slate-100/70 dark:border-notion-border-strong dark:bg-notion-panel-hover/70"
          style={{ left: xFor(gap.start), width: gap.days * dayWidth }} />)}
        {lanes.map((lane, laneIndex) => <div key={laneIndex} className="relative h-12 border-b border-slate-100 dark:border-notion-border/60">
          {lane.map((phase) => {
          const dates = preview?.id === phase.id ? preview.dates : {
              start_date: phase.start_date!, end_date: phase.end_date!,
            };
            const days = differenceInCalendarDays(parseISO(dates.end_date), parseISO(dates.start_date)) + 1;
            const selected = phase.id === selectedId;
            const wide = days * dayWidth >= 130;
            return <div key={phase.id} className="absolute top-1.5 z-10 flex h-9 min-w-12 overflow-hidden rounded-md border transition-shadow"
                style={{ left: xFor(dates.start_date), width: Math.max(48, days * dayWidth),
                  borderColor: selected ? hex : `${hex}55`,
                  background: selected ? `${hex}38` : `${hex}1d`,
                  boxShadow: selected ? `0 0 0 1px ${hex}, 0 4px 12px -4px ${hex}66` : undefined }}>
                <button type="button" aria-label={`${phase.name}の開始日 ${md(dates.start_date)} を調整`}
                  title="開始日をドラッグ（左右キーでも1日ずつ調整）"
                  className="w-3 shrink-0 cursor-ew-resize border-r border-current/20 touch-none"
                  onPointerDown={(event) => pointerDown(event, phase, "start")}
                  onKeyDown={(event) => keyAdjust(event, phase, "start")} {...dragEvents} />
                <button type="button" aria-label={`${phase.name} ${md(dates.start_date)}から${md(dates.end_date)}、ドラッグで移動`}
                  title={`${phase.name}: ${md(dates.start_date)}–${md(dates.end_date)}`}
                  className="min-w-0 flex-1 cursor-grab truncate px-1 text-left text-xs font-medium touch-none active:cursor-grabbing"
                  onPointerDown={(event) => pointerDown(event, phase, "move")}
                  onKeyDown={(event) => keyAdjust(event, phase, "move")}
                  onClick={() => { if (Date.now() >= ignoreClickUntil.current) onSelect(phase.id); }}
                  {...dragEvents}><span className="truncate">{phase.name}</span>{wide && <span className="ml-1.5 font-normal tabular-nums opacity-60">{md(dates.start_date)}–{md(dates.end_date)}</span>}</button>
                <button type="button" aria-label={`${phase.name}の終了日 ${md(dates.end_date)} を調整`}
                  title="終了日をドラッグ（左右キーでも1日ずつ調整）"
                  className="w-3 shrink-0 cursor-ew-resize border-l border-current/20 touch-none"
                  onPointerDown={(event) => pointerDown(event, phase, "end")}
                  onKeyDown={(event) => keyAdjust(event, phase, "end")} {...dragEvents} />
              </div>
          })}
        </div>)}
        <div title="ドラッグして新しいフェーズの期間を選択"
          className="relative h-12 cursor-crosshair touch-none border-t border-slate-200/70 bg-slate-50/60 dark:border-notion-border dark:bg-notion-panel-hover/40"
          onPointerDown={createPointerDown} onPointerMove={createPointerMove}
          onPointerUp={createPointerUp}
          onPointerCancel={() => { createDrag.current = null; setCreatePreview(null); }}>
          {createPreview && <div aria-hidden="true"
            className="pointer-events-none absolute top-1.5 h-9 rounded-md border border-dashed"
            style={{ left: xFor(createPreview.start_date),
              width: (differenceInCalendarDays(parseISO(createPreview.end_date), parseISO(createPreview.start_date)) + 1) * dayWidth,
              borderColor: hex, background: `${hex}38` }} />}
          <button type="button" onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onAdd()}
            className="sticky left-2 z-10 ml-2 mt-2 rounded-full border border-dashed border-slate-300 bg-white/95 px-3 py-1 text-xs font-medium text-notion-blue hover:border-notion-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-notion-blue dark:border-notion-border dark:bg-notion-panel">
            ＋ フェーズを追加
          </button>
          {!createPreview && <span className="pointer-events-none sticky left-40 ml-3 text-[11px] muted">またはドラッグして期間を選ぶ</span>}
          {createPreview && <span className="pointer-events-none absolute right-2 top-3 z-10 rounded bg-white/90 px-1.5 text-xs tabular-nums dark:bg-notion-panel-hover">
            {md(createPreview.start_date)}–{md(createPreview.end_date)}
          </span>}
        </div>
        {axisStart <= today && today <= axisEnd && <div aria-label="今日" className="pointer-events-none absolute bottom-0 top-0 z-20" style={{ left: xFor(today) + dayWidth / 2 }}>
          <span className="absolute -translate-x-1/2 top-1 whitespace-nowrap rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold leading-4 text-white">今日</span>
          <span className="absolute bottom-0 top-6 w-px bg-rose-500/70" />
        </div>}
      </div>
    </div>
    {gaps.length > 0 && <p className="text-xs muted">{gaps.map((gap) =>
      `空白 ${gap.days}日（${md(gap.start)}–${md(gap.end)}）`).join(" · ")}</p>}
  </section>;
}
