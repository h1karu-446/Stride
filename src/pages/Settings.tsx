import { useStore } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase";

export default function Settings() {
  const tasks = useStore((s) => s.tasks);
  const reviews = useStore((s) => s.reviews);
  const resetAll = useStore((s) => s.resetAll);
  const loadSeed = useStore((s) => s.loadSeed);

  function exportJSON() {
    const blob = new Blob(
      [JSON.stringify({ tasks, reviews }, null, 2)],
      { type: "application/json" }
    );
    download(blob, `stride-export-${todayLocal()}.json`);
  }

  function exportCSV() {
    const rows = [
      ["date", "total_score", "completion_score", "fulfillment_score", "cluster", "fulfillment", "highlight", "tomorrow_intention"],
      ...reviews
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => [
          r.date,
          r.total_score,
          r.completion_score,
          r.fulfillment_score,
          r.cluster,
          r.fulfillment,
          quoteCSV(r.highlight ?? ""),
          quoteCSV(r.tomorrow_intention ?? ""),
        ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    download(blob, `stride-reviews-${todayLocal()}.csv`);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm muted">データ管理と環境情報</p>
      </div>

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold">バックエンド</h2>
        <div className="text-sm">
          Supabase 接続:{" "}
          {isSupabaseConfigured ? (
            <span className="text-emerald-500 font-medium">設定済み</span>
          ) : (
            <span className="text-amber-500 font-medium">
              未設定（ローカルモック使用中）
            </span>
          )}
        </div>
        <p className="text-xs muted">
          <code className="rounded bg-slate-100 dark:bg-notion-panel-hover px-1.5 py-0.5">
            .env.local
          </code>{" "}
          に <code>VITE_SUPABASE_URL</code> /{" "}
          <code>VITE_SUPABASE_ANON_KEY</code> を設定し、
          <code>supabase/migrations/0001_init.sql</code>{" "}
          をプロジェクトに適用すると連携できます。
        </p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold">エクスポート</h2>
        <div className="flex gap-2">
          <button type="button" onClick={exportJSON} className="btn-outline">
            JSON エクスポート
          </button>
          <button type="button" onClick={exportCSV} className="btn-outline">
            CSV エクスポート（レビュー）
          </button>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold">データ</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Stat label="タスク数" value={tasks.length} />
          <Stat label="レビュー数" value={reviews.length} />
        </div>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              if (confirm("シードデータを再読み込みします（既存データは置き換わります）。")) {
                resetAll();
                loadSeed();
              }
            }}
            className="btn-outline"
          >
            シードを再読み込み
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm("すべてのローカルデータを削除します。よろしいですか？")) {
                resetAll();
              }
            }}
            className="btn-outline text-rose-500"
          >
            全データ削除
          </button>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-slate-50 dark:bg-notion-panel-hover p-3">
      <div className="text-xs muted">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function quoteCSV(s: string) {
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
