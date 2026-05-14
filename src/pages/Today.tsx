import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { useStore, selectReviewByDate } from "@/lib/store";
import { addDaysISO, rangeBefore, todayISO } from "@/lib/date";
import { calculateScore, streakCount } from "@/lib/score";
import { IMPORTANCE_LIST, Importance, Task } from "@/types";
import { ScoreRing } from "@/components/ScoreRing";
import { ClusterBadge } from "@/components/ClusterBadge";
import { ImportanceBadge } from "@/components/ImportanceBadge";

export default function Today() {
  const { date: paramDate } = useParams<{ date?: string }>();
  const navigate = useNavigate();
  const today = todayISO();
  const date = paramDate ?? today;
  const isToday = date === today;
  const tomorrow = addDaysISO(today, 1);

  const allTasks = useStore((s) => s.tasks);
  const reviews = useStore((s) => s.reviews);
  const review = useStore(selectReviewByDate(date));
  const toggleTask = useStore((s) => s.toggleTask);
  const upsertReview = useStore((s) => s.upsertReview);

  const tasks = useMemo(
    () =>
      allTasks
        .filter((t) => t.scheduled_date === date)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [allTasks, date]
  );

  const tomorrowTasks = useMemo(
    () => allTasks.filter((t) => t.scheduled_date === tomorrow),
    [allTasks, tomorrow]
  );

  const [fulfillment, setFulfillment] = useState(review?.fulfillment ?? 3);
  const [highlight, setHighlight] = useState(review?.highlight ?? "");
  const [intention, setIntention] = useState(review?.tomorrow_intention ?? "");
  const [memo, setMemo] = useState(review?.memo ?? "");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setFulfillment(review?.fulfillment ?? 3);
    setHighlight(review?.highlight ?? "");
    setIntention(review?.tomorrow_intention ?? "");
    setMemo(review?.memo ?? "");
    setSaved(false);
  }, [date, review?.id]);

  const preview = useMemo(
    () => calculateScore(tasks, review ? fulfillment : null),
    [tasks, fulfillment, review]
  );

  const last30 = useMemo(() => rangeBefore(today, 30), [today]);
  const streak = useMemo(
    () => streakCount(reviews.filter((r) => last30.includes(r.date))),
    [reviews, last30]
  );

  const completedCount = tasks.filter((t) => t.completed).length;

  function saveReview() {
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

  function jumpTo(targetDate: string) {
    navigate(targetDate === today ? "/" : `/day/${targetDate}`);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isToday ? "Today" : format(parseISO(date), "M月d日")}
          </h1>
          <p className="text-sm muted">
            {format(parseISO(date), "yyyy年M月d日 (EEE)")}
            {!isToday && (
              <span className="ml-2">
                <Link to="/" className="text-notion-blue hover:underline">
                  → 今日に戻る
                </Link>
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => jumpTo(addDaysISO(date, -1))}
            className="btn-outline"
            aria-label="前日"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => jumpTo(today)}
            className="btn-outline"
            disabled={isToday}
          >
            今日
          </button>
          <button
            type="button"
            onClick={() => jumpTo(addDaysISO(date, 1))}
            className="btn-outline"
            aria-label="翌日"
          >
            →
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-4">
        <TasksPanel
          tasks={tasks}
          date={date}
          completedCount={completedCount}
        />
        <SummaryPanel
          score={preview.total_score}
          completion={preview.completion_score}
          fulfillment={preview.fulfillment_score}
          completedWeight={preview.completed_weight}
          scheduledWeight={preview.scheduled_weight}
          cluster={preview.cluster}
          streak={streak}
          hasReview={!!review}
        />
      </div>

      <ReviewPanel
        date={date}
        fulfillment={fulfillment}
        setFulfillment={setFulfillment}
        highlight={highlight}
        setHighlight={setHighlight}
        intention={intention}
        setIntention={setIntention}
        memo={memo}
        setMemo={setMemo}
        onSave={saveReview}
        saved={saved}
        hasReview={!!review}
      />

      {isToday && (
        <TomorrowPanel tasks={tomorrowTasks} date={tomorrow} />
      )}
    </div>
  );
}

function TasksPanel({
  tasks,
  date,
  completedCount,
}: {
  tasks: Task[];
  date: string;
  completedCount: number;
}) {
  return (
    <section className="card !p-0 overflow-hidden">
      <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-notion-border">
        <div>
          <h2 className="text-base font-semibold">タスク</h2>
          <p className="text-xs muted mt-0.5">
            この日の予定 — 重要度で重みづけ
          </p>
        </div>
        <span className="text-sm tabular-nums muted">
          <span className="text-slate-900 dark:text-notion-text font-semibold">
            {completedCount}
          </span>{" "}
          / {tasks.length}
        </span>
      </header>

      <QuickAdd defaultDate={date} />

      {tasks.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm muted">
          タスクはまだありません。上のフォームから追加してください。
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-notion-border">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </ul>
      )}
    </section>
  );
}

function QuickAdd({ defaultDate }: { defaultDate: string }) {
  const addTask = useStore((s) => s.addTask);
  const [title, setTitle] = useState("");
  const [importance, setImportance] = useState<Importance>("中");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    addTask({
      title: title.trim(),
      importance,
      scheduled_date: defaultDate,
    });
    setTitle("");
    setImportance("中");
  }

  return (
    <form
      onSubmit={submit}
      className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 dark:border-notion-border bg-slate-50/40 dark:bg-notion-panel-hover/40"
    >
      <span className="text-notion-blue text-lg leading-none select-none">+</span>
      <input
        className="flex-1 bg-transparent outline-none text-sm placeholder:text-slate-400 dark:placeholder:text-notion-muted"
        placeholder="新しいタスク..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <select
        className="text-xs bg-transparent border border-slate-200 dark:border-notion-border rounded px-2 py-1 outline-none"
        value={importance}
        onChange={(e) => setImportance(e.target.value as Importance)}
      >
        {IMPORTANCE_LIST.map((i) => (
          <option key={i} value={i}>
            {i} ({i === "重" ? 3 : i === "中" ? 2 : 1}pt)
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="btn-primary !py-1 !px-3 text-xs"
        disabled={!title.trim()}
      >
        追加
      </button>
    </form>
  );
}

function TaskRow({ task }: { task: Task }) {
  const toggleTask = useStore((s) => s.toggleTask);
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);

  function save() {
    if (title.trim() && title !== task.title) {
      updateTask(task.id, { title: title.trim() });
    } else {
      setTitle(task.title);
    }
    setEditing(false);
  }

  return (
    <li className="group flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-notion-panel-hover transition">
      <input
        type="checkbox"
        className="size-4 rounded accent-notion-blue cursor-pointer"
        checked={task.completed}
        onChange={() => toggleTask(task.id)}
      />
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            className="w-full bg-transparent outline-none text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                setTitle(task.title);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={
              "text-left w-full truncate text-sm " +
              (task.completed
                ? "line-through text-slate-400 dark:text-notion-muted"
                : "")
            }
          >
            {task.title}
          </button>
        )}
      </div>
      <select
        className="text-xs bg-transparent border border-transparent group-hover:border-slate-200 dark:group-hover:border-notion-border rounded px-1.5 py-0.5 outline-none"
        value={task.importance}
        onChange={(e) =>
          updateTask(task.id, { importance: e.target.value as Importance })
        }
      >
        {IMPORTANCE_LIST.map((i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
      </select>
      <ImportanceBadge importance={task.importance} />
      <button
        type="button"
        onClick={() => {
          if (confirm("削除しますか？")) deleteTask(task.id);
        }}
        className="text-slate-300 dark:text-notion-muted hover:text-rose-500 opacity-0 group-hover:opacity-100 transition text-sm"
        aria-label="Delete"
      >
        ✕
      </button>
    </li>
  );
}

function SummaryPanel({
  score,
  completion,
  fulfillment,
  completedWeight,
  scheduledWeight,
  cluster,
  streak,
  hasReview,
}: {
  score: number;
  completion: number;
  fulfillment: number;
  completedWeight: number;
  scheduledWeight: number;
  cluster: import("@/types").Cluster;
  streak: number;
  hasReview: boolean;
}) {
  return (
    <aside className="card flex flex-col items-center gap-3">
      <div className="self-start text-xs uppercase tracking-wide muted">
        スコア
      </div>
      <ScoreRing score={score} cluster={cluster} size={140} />
      <ClusterBadge cluster={cluster} size="lg" />
      <div className="w-full grid grid-cols-2 gap-2 text-center text-xs">
        <div className="rounded-md bg-slate-50 dark:bg-notion-panel-hover p-2">
          <div className="muted">完了率</div>
          <div className="font-semibold tabular-nums">{completion} / 90</div>
        </div>
        <div className="rounded-md bg-slate-50 dark:bg-notion-panel-hover p-2">
          <div className="muted">充実度</div>
          <div className="font-semibold tabular-nums">{fulfillment} / 10</div>
        </div>
      </div>
      <div className="w-full flex items-center justify-between text-xs pt-2 border-t border-slate-100 dark:border-notion-border">
        <span className="muted">完了重み</span>
        <span className="tabular-nums">
          {completedWeight} / {scheduledWeight} pt
        </span>
      </div>
      <div className="w-full flex items-center justify-between text-xs">
        <span className="muted">A/B 連続日数</span>
        <span className="tabular-nums font-semibold">
          {streak} <span className="muted font-normal">日</span>
        </span>
      </div>
      {!hasReview && (
        <p className="text-xs muted text-center pt-1">
          下のレビューを保存するとスコアが確定します
        </p>
      )}
    </aside>
  );
}

function ReviewPanel(props: {
  date: string;
  fulfillment: number;
  setFulfillment: (n: number) => void;
  highlight: string;
  setHighlight: (s: string) => void;
  intention: string;
  setIntention: (s: string) => void;
  memo: string;
  setMemo: (s: string) => void;
  onSave: () => void;
  saved: boolean;
  hasReview: boolean;
}) {
  const {
    fulfillment,
    setFulfillment,
    highlight,
    setHighlight,
    intention,
    setIntention,
    memo,
    setMemo,
    onSave,
    saved,
    hasReview,
  } = props;

  return (
    <section className="card space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">レビュー</h2>
          <p className="text-xs muted mt-0.5">
            一日の振り返りで翌日の方向を整える
          </p>
        </div>
        {hasReview && (
          <span className="text-xs muted">保存済み</span>
        )}
      </header>

      <div>
        <label className="label">
          充実度{" "}
          <span className="text-slate-900 dark:text-notion-text font-bold ml-1">
            {fulfillment}
          </span>
          <span className="muted"> / 5</span>
        </label>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={fulfillment}
          onChange={(e) => setFulfillment(Number(e.target.value))}
          className="w-full accent-notion-blue"
        />
        <div className="flex justify-between text-[10px] muted mt-1">
          <span>1 低</span>
          <span>2</span>
          <span>3</span>
          <span>4</span>
          <span>5 高</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">今日のハイライト</label>
          <textarea
            className="input min-h-[88px] resize-y"
            placeholder="今日一番良かったこと"
            value={highlight}
            onChange={(e) => setHighlight(e.target.value)}
          />
        </div>
        <div>
          <label className="label">明日の意図</label>
          <textarea
            className="input min-h-[88px] resize-y"
            placeholder="明日意識したいこと"
            value={intention}
            onChange={(e) => setIntention(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="label">メモ</label>
        <textarea
          className="input min-h-[64px] resize-y"
          placeholder="その他"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="text-sm text-emerald-500">✓ 保存しました</span>
        )}
        <button type="button" onClick={onSave} className="btn-primary">
          レビューを保存
        </button>
      </div>
    </section>
  );
}

function TomorrowPanel({ tasks, date }: { tasks: Task[]; date: string }) {
  const addTask = useStore((s) => s.addTask);
  const [title, setTitle] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    addTask({
      title: title.trim(),
      importance: "中",
      scheduled_date: date,
    });
    setTitle("");
  }

  return (
    <section className="card !p-0 overflow-hidden">
      <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-notion-border">
        <div>
          <h2 className="text-base font-semibold">明日の準備</h2>
          <p className="text-xs muted mt-0.5">
            {format(parseISO(date), "M月d日 (EEE)")} のタスクを先に並べる
          </p>
        </div>
        <span className="text-xs muted tabular-nums">{tasks.length} 件</span>
      </header>

      <form
        onSubmit={submit}
        className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 dark:border-notion-border bg-slate-50/40 dark:bg-notion-panel-hover/40"
      >
        <span className="text-notion-blue text-lg leading-none select-none">+</span>
        <input
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-slate-400 dark:placeholder:text-notion-muted"
          placeholder="明日のタスク..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button
          type="submit"
          className="btn-ghost !py-1 !px-3 text-xs"
          disabled={!title.trim()}
        >
          追加
        </button>
      </form>

      {tasks.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm muted">
          明日のタスクはまだありません
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-notion-border">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </ul>
      )}
    </section>
  );
}
