import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { useStore } from "@/lib/store";
import { Cluster } from "@/types";
import { ClusterBadge } from "@/components/ClusterBadge";

export default function Archive() {
  const reviews = useStore((s) => s.reviews);
  const [query, setQuery] = useState("");
  const [cluster, setCluster] = useState<"all" | Cluster>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...reviews]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((r) => (cluster === "all" ? true : r.cluster === cluster))
      .filter((r) => {
        if (!q) return true;
        return [r.highlight, r.tomorrow_intention, r.memo]
          .filter((s): s is string => Boolean(s))
          .some((s) => s.toLowerCase().includes(q));
      });
  }, [reviews, query, cluster]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Archive</h1>
        <p className="text-sm text-slate-500">
          過去のDaily Reviewを検索・閲覧
        </p>
      </div>

      <div className="card grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-2">
        <input
          className="input"
          placeholder="ハイライト・意図・メモを検索…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="input"
          value={cluster}
          onChange={(e) => setCluster(e.target.value as "all" | Cluster)}
        >
          <option value="all">全クラスタ</option>
          <option value="A">A - Great Day</option>
          <option value="B">B - Good Day</option>
          <option value="C">C - Off Day</option>
          <option value="D">D - Bad Day</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center text-slate-500">
          該当するReviewはありません
        </div>
      ) : (
        <div className="card !p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">日付</th>
                <th className="px-4 py-2 text-left">スコア</th>
                <th className="px-4 py-2 text-left">クラスタ</th>
                <th className="px-4 py-2 text-left">ハイライト</th>
                <th className="px-4 py-2 text-left">明日の意図</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                  <td className="px-4 py-2 whitespace-nowrap tabular-nums">
                    {format(parseISO(r.date), "yyyy-MM-dd")}
                  </td>
                  <td className="px-4 py-2 tabular-nums font-semibold">
                    {Math.round(r.total_score)}
                  </td>
                  <td className="px-4 py-2">
                    <ClusterBadge cluster={r.cluster} size="sm" />
                  </td>
                  <td className="px-4 py-2 max-w-[240px] truncate text-slate-700 dark:text-slate-300">
                    {r.highlight ?? "—"}
                  </td>
                  <td className="px-4 py-2 max-w-[240px] truncate text-slate-700 dark:text-slate-300">
                    {r.tomorrow_intention ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      to={`/review/${r.date}`}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      開く →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
