import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { useStore } from "@/lib/store";
import { addDaysISO, todayISO } from "@/lib/date";
import { IMPORTANCE_LIST, Importance, Task } from "@/types";
import { ImportanceBadge } from "@/components/ImportanceBadge";

type Tab = "today" | "tomorrow" | "week";

export default function Tasks() {
  const [tab, setTab] = useState<Tab>("today");
  const tasks = useStore((s) => s.tasks);
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);
  const week = useMemo(() => {
    const days: string[] = [];
    for (let i = 0; i < 7; i += 1) days.push(addDaysISO(today, i));
    return days;
  }, [today]);

  const targetDates = tab === "today" ? [today] : tab === "tomorrow" ? [tomorrow] : week;
  const filtered = tasks
    .filter((t) => targetDates.includes(t.scheduled_date))
    .sort((a, b) => {
      if (a.scheduled_date !== b.scheduled_date)
        return a.scheduled_date.localeCompare(b.scheduled_date);
      return a.created_at.localeCompare(b.created_at);
    });

  const grouped = groupBy(filtered, (t) => t.scheduled_date);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-sm text-slate-500">予定日でタスクを管理</p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 text-sm">
          {(["today", "tomorrow", "week"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={
                "px-3 py-1.5 rounded-md " +
                (tab === t
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-600 dark:text-slate-300")
              }
            >
              {t === "today" ? "今日" : t === "tomorrow" ? "明日" : "今週"}
            </button>
          ))}
        </div>
      </div>

      <NewTaskForm defaultDate={tab === "tomorrow" ? tomorrow : today} />

      {Object.keys(grouped).length === 0 && (
        <div className="card text-center text-slate-500">
          このビューに表示するタスクはありません
        </div>
      )}

      {Object.entries(grouped).map(([date, list]) => (
        <DateSection key={date} date={date} tasks={list} />
      ))}
    </div>
  );
}

function NewTaskForm({ defaultDate }: { defaultDate: string }) {
  const addTask = useStore((s) => s.addTask);
  const [title, setTitle] = useState("");
  const [importance, setImportance] = useState<Importance>("中");
  const [date, setDate] = useState(defaultDate);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    addTask({ title: title.trim(), importance, scheduled_date: date });
    setTitle("");
  }

  return (
    <form onSubmit={submit} className="card">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_160px_auto] gap-2">
        <input
          className="input"
          placeholder="新しいタスク..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select
          className="input"
          value={importance}
          onChange={(e) => setImportance(e.target.value as Importance)}
        >
          {IMPORTANCE_LIST.map((i) => (
            <option key={i} value={i}>
              {i} ({i === "重" ? 3 : i === "中" ? 2 : 1}pt)
            </option>
          ))}
        </select>
        <input
          type="date"
          className="input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={!title.trim()}>
          + 追加
        </button>
      </div>
    </form>
  );
}

function DateSection({ date, tasks }: { date: string; tasks: Task[] }) {
  const done = tasks.filter((t) => t.completed).length;
  return (
    <section>
      <header className="flex items-center justify-between mb-2 px-1">
        <h2 className="text-sm font-semibold">
          {format(parseISO(date), "M月d日 (EEE)")}
        </h2>
        <span className="text-xs text-slate-500 tabular-nums">
          {done} / {tasks.length} 完了
        </span>
      </header>
      <ul className="card divide-y divide-slate-200 dark:divide-slate-800 !p-0">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </ul>
    </section>
  );
}

function TaskRow({ task }: { task: Task }) {
  const toggleTask = useStore((s) => s.toggleTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const updateTask = useStore((s) => s.updateTask);
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
    <li className="flex items-center gap-3 px-4 py-2.5">
      <input
        type="checkbox"
        className="size-4 rounded accent-blue-600"
        checked={task.completed}
        onChange={() => toggleTask(task.id)}
      />
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            className="input"
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
              "text-left w-full truncate " +
              (task.completed ? "line-through text-slate-400" : "")
            }
          >
            {task.title}
          </button>
        )}
      </div>
      <select
        className="input !py-1 !w-20 text-xs"
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
      <input
        type="date"
        className="input !py-1 !w-36 text-xs"
        value={task.scheduled_date}
        onChange={(e) => updateTask(task.id, { scheduled_date: e.target.value })}
      />
      <ImportanceBadge importance={task.importance} />
      <button
        type="button"
        onClick={() => {
          if (confirm("削除しますか？")) deleteTask(task.id);
        }}
        className="btn-ghost text-rose-600 hover:text-rose-700 text-xs"
        aria-label="Delete"
      >
        ✕
      </button>
    </li>
  );
}

function groupBy<T, K extends string>(
  arr: T[],
  key: (item: T) => K
): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of arr) {
    const k = key(item);
    (out[k] ||= []).push(item);
  }
  return out;
}

