import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { useStore } from "@/lib/store";
import { rangeBefore, todayISO } from "@/lib/date";
import { IMPORTANCE_LIST, IMPORTANCE_WEIGHT } from "@/types";

type Range = "7" | "30" | "90";

export default function Trends() {
  const [range, setRange] = useState<Range>("30");
  const today = todayISO();
  const days = rangeBefore(today, Number(range));
  const reviews = useStore((s) => s.reviews);
  const tasks = useStore((s) => s.tasks);

  const reviewMap = useMemo(
    () => new Map(reviews.map((r) => [r.date, r] as const)),
    [reviews]
  );

  const trendData = days.map((d) => {
    const r = reviewMap.get(d);
    return {
      date: format(parseISO(d), Number(range) > 31 ? "M/d" : "M/d"),
      total: r?.total_score ?? null,
      completion: r?.completion_score ?? null,
      fulfillment: r ? r.fulfillment_score * 10 : null, // scaled to 0-100
    };
  });

  // Importance breakdown — completed pt / scheduled pt per day
  const importanceData = days.map((d) => {
    const dayTasks = tasks.filter((t) => t.scheduled_date === d);
    const row: Record<string, number | string> = {
      date: format(parseISO(d), "M/d"),
    };
    for (const imp of IMPORTANCE_LIST) {
      const completed = dayTasks
        .filter((t) => t.importance === imp && t.completed)
        .reduce((a, t) => a + IMPORTANCE_WEIGHT[t.importance], 0);
      row[imp] = completed;
    }
    return row;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Trends</h1>
          <p className="text-sm text-slate-500">スコア推移と内訳分析</p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 text-sm">
          {(["7", "30", "90"] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={
                "px-3 py-1.5 rounded-md " +
                (range === r
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-600 dark:text-slate-300")
              }
            >
              {r === "7" ? "週" : r === "30" ? "月" : "3ヶ月"}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold mb-2">スコア推移（折れ線）</h2>
        <div className="h-72">
          <ResponsiveContainer>
            <LineChart data={trendData}>
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
              <Legend />
              <Line
                type="monotone"
                dataKey="total"
                name="総合"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="completion"
                name="完了率"
                stroke="#22c55e"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="fulfillment"
                name="充実度 ×10"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold mb-2">
          重要度別 完了ポイント（スタックバー）
        </h2>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={importanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "rgb(15 23 42)",
                  border: "none",
                  borderRadius: 8,
                  color: "white",
                }}
              />
              <Legend />
              <Bar dataKey="重" stackId="a" fill="#ef4444" />
              <Bar dataKey="中" stackId="a" fill="#f59e0b" />
              <Bar dataKey="軽" stackId="a" fill="#94a3b8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
