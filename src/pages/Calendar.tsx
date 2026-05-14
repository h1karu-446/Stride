import { useState } from "react";
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
import { useStore } from "@/lib/store";
import { CLUSTER_META } from "@/types";
import { todayISO } from "@/lib/date";
import { ClusterBadge } from "@/components/ClusterBadge";

const DOW = ["月", "火", "水", "木", "金", "土", "日"];

export default function Calendar() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const reviews = useStore((s) => s.reviews);

  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start, end });

  const reviewMap = new Map(reviews.map((r) => [r.date, r] as const));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-slate-500">月間スコアを俯瞰</p>
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
        <div className="grid grid-cols-7 text-center text-xs text-slate-500 mb-2">
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
            const isToday = iso === todayISO();
            return (
              <Link
                key={iso}
                to={`/review/${iso}`}
                className={
                  "aspect-square sm:aspect-[4/3] rounded-lg border p-2 flex flex-col justify-between transition hover:shadow " +
                  (inMonth
                    ? "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                    : "border-transparent bg-slate-50 dark:bg-slate-950/60 text-slate-400") +
                  (isToday ? " ring-2 ring-blue-500" : "")
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
                            ? "#16a34a"
                            : r.cluster === "B"
                            ? "#2563eb"
                            : r.cluster === "C"
                            ? "#d97706"
                            : "#dc2626",
                      }}
                    >
                      {Math.round(r.total_score)}
                    </div>
                  </div>
                ) : (
                  <div className="text-right text-[10px] text-slate-300 dark:text-slate-600">
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
      <span className="text-xs text-slate-500">凡例:</span>
      {(["A", "B", "C", "D"] as const).map((c) => (
        <ClusterBadge key={c} cluster={c} size="sm" />
      ))}
      <span className="text-xs text-slate-500 ml-2">
        日付をクリックでReviewを開く
      </span>
    </div>
  );
}

