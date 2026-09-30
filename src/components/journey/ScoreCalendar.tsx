import { Link } from "react-router-dom";
import clsx from "clsx";
import { addMonths, format } from "date-fns";
import type { Cluster, DailyReview } from "@/types";
import { todayISO } from "@/lib/date";
import { calendarDays, type CalendarDay } from "@/lib/journey/calendar";
import { ClusterBadge } from "@/components/ClusterBadge";

const DOW = ["月", "火", "水", "木", "金", "土", "日"];

/** ランクの面色と文字色。面は控えめにし、点数とランク文字は濃い色で読めるようにする（ClusterBadge と同系）。 */
const RANK_STYLE: Record<Cluster, string> = {
  A: "bg-emerald-100 border-emerald-200 text-emerald-800 dark:bg-emerald-500/15 dark:border-emerald-500/25 dark:text-emerald-300",
  B: "bg-blue-100 border-blue-200 text-blue-800 dark:bg-blue-500/15 dark:border-blue-500/25 dark:text-blue-300",
  C: "bg-amber-100 border-amber-200 text-amber-800 dark:bg-amber-500/15 dark:border-amber-500/25 dark:text-amber-300",
  D: "bg-orange-100 border-orange-200 text-orange-800 dark:bg-orange-500/15 dark:border-orange-500/25 dark:text-orange-300",
  E: "bg-rose-100 border-rose-200 text-rose-800 dark:bg-rose-500/15 dark:border-rose-500/25 dark:text-rose-300",
};

function cellClass(day: CalendarDay) {
  return clsx(
    // 寸法は内容に依存させない：全セル同じ高さ・列幅（grid-cols-7 の 1fr）・同じ内側余白
    "relative block h-12 sm:h-14 min-w-0 overflow-hidden rounded-md border px-1 py-0.5 sm:px-1.5 sm:py-1 tabular-nums transition",
    "hover:border-slate-400 dark:hover:border-notion-muted",
    "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:focus-visible:outline-notion-fg",
    day.cluster
      ? RANK_STYLE[day.cluster]
      : day.kind === "future"
        ? "border-dashed border-slate-200 bg-transparent text-slate-400 dark:border-notion-border dark:text-notion-muted"
        : "border-slate-200 bg-slate-100 text-slate-500 dark:border-notion-border dark:bg-notion-panel-hover dark:text-notion-muted",
    !day.inMonth && "opacity-50",
    day.isToday && "!border-2 !border-blue-600 dark:!border-notion-blue",
  );
}

export default function ScoreCalendar({ month, setMonth, reviews }: { month: Date; setMonth: (month: Date) => void; reviews: DailyReview[] }) {
  const days = calendarDays(month, reviews, todayISO());
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <h2 className="whitespace-nowrap font-semibold">スコアのカレンダー</h2>
        <div className="flex items-center gap-1">
          <button type="button" className="btn-ghost !px-2 !py-1" aria-label={`前の月（${format(prev, "yyyy年M月")}）`} onClick={() => setMonth(prev)}>
            <Chevron dir="left" />
          </button>
          <span className="w-24 text-center text-sm font-semibold tabular-nums" aria-live="polite">
            {format(month, "yyyy年M月")}
          </span>
          <button type="button" className="btn-ghost !px-2 !py-1" aria-label={`次の月（${format(next, "yyyy年M月")}）`} onClick={() => setMonth(next)}>
            <Chevron dir="right" />
          </button>
        </div>
      </div>

      <div>
        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] muted" aria-hidden>
          {DOW.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => (
            <Link key={day.iso} to={day.href} aria-label={day.label} aria-current={day.isToday ? "date" : undefined} className={cellClass(day)}>
              <span
                className={clsx(
                  "absolute left-1 top-0.5 sm:left-1.5 sm:top-1 text-[11px] leading-4",
                  day.isToday ? "font-bold text-blue-700 dark:text-blue-300" : "font-medium",
                )}
              >
                {day.day}
              </span>
              {day.cluster && (
                <span className="absolute right-1 top-0.5 sm:right-1.5 sm:top-1 hidden text-[10px] font-semibold leading-4 opacity-80 sm:block" aria-hidden>
                  {day.cluster}
                </span>
              )}
              <span className="absolute bottom-0.5 right-1 sm:bottom-1 sm:right-1.5 text-xs sm:text-base font-bold leading-4 sm:leading-5" aria-hidden>
                {day.score ?? (day.kind === "missing" ? <span className="font-normal text-slate-400 dark:text-notion-muted/70">—</span> : null)}
              </span>
            </Link>
          ))}
        </div>
      </div>

      <Legend />
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points={dir === "left" ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
    </svg>
  );
}

function Legend() {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs muted">凡例:</span>
        {(["A", "B", "C", "D", "E"] as const).map((c) => (
          <ClusterBadge key={c} cluster={c} size="sm" />
        ))}
      </div>
      <p className="text-xs muted">
        数字は合計点、「—」は記録なし、青枠は今日。日付を押すとその日の詳細を開く
      </p>
    </div>
  );
}
