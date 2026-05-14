import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useStore, selectReviewByDate } from "@/lib/store";
import { rangeBefore, todayISO } from "@/lib/date";
import { calculateScore, streakCount } from "@/lib/score";
import { ScoreRing } from "@/components/ScoreRing";
import { ClusterBadge } from "@/components/ClusterBadge";
import { CLUSTER_META } from "@/types";
import { format, parseISO } from "date-fns";

export default function Dashboard() {
  const today = todayISO();
  const tasks = useStore((s) => s.tasks);
  const review = useStore(selectReviewByDate(today));

  // If no review yet, show preview of completion-only score
  const todayTasks = tasks.filter((t) => t.scheduled_date === today);
  const preview = calculateScore(todayTasks, review?.fulfillment ?? null);
  const todayScore = review ?? {
    completion_score: preview.completion_score,
    fulfillment_score: 0,
    total_score: preview.completion_score,
    cluster: preview.cluster,
  };

  // Weekly trend (last 7 days)
  const last7 = rangeBefore(today, 7);
  const reviews = useStore((s) => s.reviews);
  const trendData = last7.map((d) => {
    const r = reviews.find((x) => x.date === d);
    return {
      date: format(parseISO(d), "M/d"),
      score: r?.total_score ?? null,
    };
  });

  const last30 = rangeBefore(today, 30);
  const reviewsInRange = reviews.filter((r) => last30.includes(r.date));
  const streak = streakCount(reviewsInRange);

  // Cluster distribution
  const dist = (["A", "B", "C", "D"] as const).map((c) => ({
    cluster: c,
    count: reviewsInRange.filter((r) => r.cluster === c).length,
  }));
  const totalReviews = reviewsInRange.length || 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-slate-500">{format(parseISO(today), "yyyy年M月d日 (EEE)")}</p>
        </div>
        <div className="flex gap-2">
          <Link to={`/review/${today}`} className="btn-primary">
            今日のReviewを書く
          </Link>
          <Link to="/tasks" className="btn-outline">
            タスク追加
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-1 flex flex-col items-center gap-4">
          <div className="self-start text-xs uppercase tracking-wide text-slate-500">
            Today's Score
          </div>
          <ScoreRing
            score={todayScore.total_score}
            cluster={todayScore.cluster}
          />
          <ClusterBadge cluster={todayScore.cluster} size="lg" />
          <div className="w-full grid grid-cols-2 gap-2 text-center text-xs">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2">
              <div className="text-slate-500">完了率</div>
              <div className="font-semibold tabular-nums">
                {todayScore.completion_score} / 90
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2">
              <div className="text-slate-500">充実度</div>
              <div className="font-semibold tabular-nums">
                {todayScore.fulfillment_score} / 10
              </div>
            </div>
          </div>
          {!review && (
            <p className="text-xs text-slate-500 text-center">
              まだ今日のReviewを書いていません。完了率のみのプレビュー表示中。
            </p>
          )}
        </div>

        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">Weekly Trend</h2>
            <span className="text-xs text-slate-500">直近7日</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "rgb(15 23 42)",
                    border: "none",
                    borderRadius: 8,
                    color: "white",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#g1)"
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Streak (A/B 連続日数)
          </div>
          <div className="mt-2 text-4xl font-bold tabular-nums">
            {streak}
            <span className="text-base font-normal text-slate-500"> 日</span>
          </div>
        </div>
        {(["A", "B", "C", "D"] as const).map((c) => {
          const meta = CLUSTER_META[c];
          const count = dist.find((d) => d.cluster === c)?.count ?? 0;
          const pct = Math.round((count / totalReviews) * 100);
          return (
            <div key={c} className="card">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  {meta.emoji} {c}
                </span>
                <span className="text-xs text-slate-500">{meta.label}</span>
              </div>
              <div className="mt-2 text-3xl font-bold tabular-nums">
                {count}
                <span className="text-sm font-normal text-slate-500"> / {pct}%</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background:
                      c === "A"
                        ? "#22c55e"
                        : c === "B"
                        ? "#3b82f6"
                        : c === "C"
                        ? "#f59e0b"
                        : "#ef4444",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
