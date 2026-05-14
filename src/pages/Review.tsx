import { useMemo, useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { useStore } from "@/lib/store";
import { addDaysISO, todayISO } from "@/lib/date";
import { calculateScore } from "@/lib/score";
import { ScoreRing } from "@/components/ScoreRing";
import { ClusterBadge } from "@/components/ClusterBadge";
import { ImportanceBadge } from "@/components/ImportanceBadge";

export default function Review() {
  const { date = todayISO() } = useParams();
  const navigate = useNavigate();
  const allTasks = useStore((s) => s.tasks);
  const reviews = useStore((s) => s.reviews);
  const toggleTask = useStore((s) => s.toggleTask);
  const upsertReview = useStore((s) => s.upsertReview);
  const tasks = useMemo(
    () =>
      allTasks
        .filter((t) => t.scheduled_date === date)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [allTasks, date]
  );
  const existing = useMemo(
    () => reviews.find((r) => r.date === date),
    [reviews, date]
  );

  const [fulfillment, setFulfillment] = useState(existing?.fulfillment ?? 3);
  const [highlight, setHighlight] = useState(existing?.highlight ?? "");
  const [intention, setIntention] = useState(existing?.tomorrow_intention ?? "");
  const [memo, setMemo] = useState(existing?.memo ?? "");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setFulfillment(existing?.fulfillment ?? 3);
    setHighlight(existing?.highlight ?? "");
    setIntention(existing?.tomorrow_intention ?? "");
    setMemo(existing?.memo ?? "");
    setSaved(false);
  }, [date, existing?.id]);

  const preview = useMemo(
    () => calculateScore(tasks, fulfillment),
    [tasks, fulfillment]
  );

  function save() {
    upsertReview({
      date,
      fulfillment,
      highlight: highlight || undefined,
      tomorrow_intention: intention || undefined,
      memo: memo || undefined,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Daily Review</h1>
          <p className="text-sm text-slate-500">
            {format(parseISO(date), "yyyy年M月d日 (EEE)")}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate(`/review/${addDaysISO(date, -1)}`)}
            className="btn-outline"
          >
            ← 前日
          </button>
          <button
            type="button"
            onClick={() => navigate(`/review/${addDaysISO(date, 1)}`)}
            className="btn-outline"
          >
            翌日 →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-4">
          <section className="card">
            <h2 className="text-sm font-semibold mb-3">Today's Tasks</h2>
            {tasks.length === 0 ? (
              <p className="text-sm text-slate-500">
                この日に予定タスクはありません。
                <Link to="/tasks" className="text-blue-600 underline ml-1">
                  Tasksから追加
                </Link>
              </p>
            ) : (
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2">
                    <input
                      type="checkbox"
                      checked={t.completed}
                      onChange={() => toggleTask(t.id)}
                      className="size-4 accent-blue-600"
                    />
                    <span
                      className={
                        "flex-1 " +
                        (t.completed ? "line-through text-slate-400" : "")
                      }
                    >
                      {t.title}
                    </span>
                    <ImportanceBadge importance={t.importance} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card space-y-4">
            <div>
              <label className="label">
                充実度: <span className="text-slate-900 dark:text-slate-100 font-bold">{fulfillment}</span> / 5
              </label>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={fulfillment}
                onChange={(e) => setFulfillment(Number(e.target.value))}
                className="w-full accent-blue-600"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>1 低</span>
                <span>2</span>
                <span>3</span>
                <span>4</span>
                <span>5 高</span>
              </div>
            </div>

            <div>
              <label className="label">今日のハイライト</label>
              <textarea
                className="input min-h-[80px]"
                placeholder="今日一番良かったこと"
                value={highlight}
                onChange={(e) => setHighlight(e.target.value)}
              />
            </div>

            <div>
              <label className="label">明日の意図</label>
              <textarea
                className="input min-h-[80px]"
                placeholder="明日意識したいこと"
                value={intention}
                onChange={(e) => setIntention(e.target.value)}
              />
            </div>

            <div>
              <label className="label">メモ</label>
              <textarea
                className="input min-h-[60px]"
                placeholder="その他"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              {saved ? (
                <span className="text-sm text-green-600">✓ 保存しました</span>
              ) : (
                <span />
              )}
              <button type="button" onClick={save} className="btn-primary">
                保存
              </button>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="card flex flex-col items-center gap-3 sticky top-20">
            <div className="text-xs uppercase tracking-wide text-slate-500 self-start">
              プレビュー
            </div>
            <ScoreRing
              score={preview.total_score}
              cluster={preview.cluster}
              size={140}
            />
            <ClusterBadge cluster={preview.cluster} size="lg" />
            <div className="w-full grid grid-cols-1 gap-2 text-sm">
              <Row label="完了率スコア" value={`${preview.completion_score} / 90`} />
              <Row label="充実度スコア" value={`${preview.fulfillment_score} / 10`} />
              <Row
                label="総合スコア"
                value={`${preview.total_score} / 100`}
                emphasis
              />
              <div className="border-t border-slate-200 dark:border-slate-800 my-1" />
              <Row
                label="完了重み"
                value={`${preview.completed_weight} / ${preview.scheduled_weight} pt`}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500 text-xs">{label}</span>
      <span
        className={
          "tabular-nums " + (emphasis ? "font-bold" : "font-medium")
        }
      >
        {value}
      </span>
    </div>
  );
}
