import { Link } from "react-router-dom";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { DailyReview } from "@/types";
import { CLUSTER_META } from "@/types";
import { todayISO } from "@/lib/date";
import { ClusterBadge } from "@/components/ClusterBadge";

const DOW = ["月", "火", "水", "木", "金", "土", "日"];

export default function ScoreCalendar({ month, setMonth, reviews }: { month: Date; setMonth: (month: Date) => void; reviews: DailyReview[] }) {

  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start, end });

  const reviewMap = new Map(reviews.map((r) => [r.date, r] as const));
  const today = todayISO();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">スコアのカレンダー</h2>
          
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-outline"
            onClick={() => setMonth(addMonths(month, -1))}
          >
            ← {format(addMonths(month, -1), "M月")}
          </button>
          <span className="font-semibold tabular-nums w-28 text-center">
            {format(month, "yyyy年M月")}
          </span>
          <button
            type="button"
            className="btn-outline"
            onClick={() => setMonth(addMonths(month, 1))}
          >
            {format(addMonths(month, 1), "M月")} →
          </button>
        </div>
      </div>

      <div className="card !p-3">
        <div className="grid grid-cols-7 text-center text-xs muted mb-2">
          {DOW.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((d) => {
            const iso = format(d, "yyyy-MM-dd");
            const r = reviewMap.get(iso);
            const inMonth = isSameMonth(d, month);
            const isToday = iso === today;
            const linkTo = isToday ? "/" : `/day/${iso}`;
            return (
              <Link
                key={iso}
                to={linkTo}
                aria-label={`${iso}${r ? ` ${r.total_score}点` : " 記録なし"}`}
                style={r ? { backgroundColor: `${({ A: "#22c55e", B: "#3b82f6", C: "#f59e0b", D: "#f97316", E: "#ef4444" })[r.cluster]}20` } : undefined}
                className={
                  "aspect-square sm:aspect-[4/3] rounded-lg border p-2 flex flex-col justify-between transition hover:shadow-sm hover:border-slate-300 dark:hover:border-notion-border-strong " +
                  (inMonth
                    ? "border-slate-200 dark:border-notion-border bg-white dark:bg-notion-panel"
                    : "border-transparent bg-slate-50 dark:bg-notion-bg/40 text-slate-400 dark:text-notion-muted") +
                  (isToday ? " ring-2 ring-notion-blue" : "") +
                  (!r ? (iso > today ? " opacity-40" : " !bg-slate-100 dark:!bg-notion-panel-hover") : "")
                }
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold tabular-nums">
                    {format(d, "d")}
                  </span>
                  {r && (
                    <span aria-hidden>{CLUSTER_META[r.cluster].emoji}</span>
                  )}
                </div>
                {r ? (
                  <div className="text-right">
                    <div
                      className="text-base sm:text-lg font-bold tabular-nums leading-none"
                      style={{
                        color:
                          r.cluster === "A"
                            ? "#22c55e"
                            : r.cluster === "B"
                            ? "#3b82f6"
                            : r.cluster === "C"
                            ? "#f59e0b"
                            : r.cluster === "D"
                            ? "#f97316"
                            : "#ef4444",
                      }}
                    >
                      {Math.round(r.total_score)}
                    </div>
                  </div>
                ) : (
                  <div className="text-right text-[10px] text-slate-300 dark:text-notion-muted/60">
                    —
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs muted">凡例:</span>
      {(["A", "B", "C", "D", "E"] as const).map((c) => (
        <ClusterBadge key={c} cluster={c} size="sm" />
      ))}
      <span className="text-xs muted ml-2">
        日付をクリックして詳細を開く
      </span>
    </div>
  );
}
