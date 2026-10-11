import type { ComponentProps, ReactNode } from "react";
import { parseISO } from "date-fns";
import { phaseGaps } from "@/lib/plans/logic";
import { useUiStore, type PhaseView } from "@/lib/uiStore";
import PhaseBar from "./PhaseBar";
import PhaseCalendar from "./PhaseCalendar";

const md = (d: string) => `${parseISO(d).getMonth() + 1}/${parseISO(d).getDate()}`;

const VIEWS: { value: PhaseView; label: string; icon: ReactNode }[] = [
  { value: "timeline", label: "タイムライン", icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
    <path d="M2 4h7M5 8h8M3 12h6" /></svg> },
  { value: "calendar", label: "カレンダー", icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
    <rect x="2" y="3" width="12" height="11" rx="1.5" /><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" strokeLinecap="round" /></svg> },
];

/**
 * The phases of a plan, as a timeline or a calendar (chosen like a Notion view and
 * remembered on this device). `notice` reports a date change saved from a drag.
 */
export default function PhasePanel({ notice, ...props }: ComponentProps<typeof PhaseBar> & { notice?: ReactNode }) {
  const view = useUiStore((state) => state.phaseView);
  const setView = useUiStore((state) => state.setPhaseView);
  const gaps = phaseGaps(props.phases, props.today);

  return <section aria-label="フェーズの期間" className="space-y-2">
    <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
      <div className="flex items-center gap-3">
        <h2 className="section-title">フェーズ</h2>
        <div role="group" aria-label="表示" className="flex items-center gap-0.5">
          {VIEWS.map(({ value, label, icon }) => <button key={value} type="button" aria-pressed={view === value}
            onClick={() => setView(value)}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-notion-blue ${view === value
              ? "bg-slate-100 font-semibold text-slate-900 dark:bg-notion-panel-hover dark:text-notion-fg"
              : "muted hover:bg-slate-100/70 dark:hover:bg-notion-panel-hover/60"}`}>
            {icon}{label}
          </button>)}
        </div>
      </div>
      <p className="hidden text-[11px] muted sm:block">
        帯をドラッグで移動・端で期間を調整・空いている{view === "calendar" ? "日" : "所"}をドラッグで追加
      </p>
    </div>
    {view === "calendar" ? <PhaseCalendar {...props} /> : <PhaseBar {...props} />}
    {notice}
    {gaps.length > 0 && <p className="text-xs muted">{gaps.map((gap) =>
      `空白 ${gap.days}日（${md(gap.start)}–${md(gap.end)}）`).join(" · ")}</p>}
  </section>;
}
