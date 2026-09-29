import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  useAddTask,
  useBedTarget,
  useDeleteTask,
  useReviews,
  useTasks,
  useToggleTask,
  useUpdateBedFields,
  useUpdateTask,
  useUpdateWakeFields,
  useUpdateReviewFields,
  useWakeTarget,
} from "@/lib/queries";
import { addDaysISO, rangeBefore, todayISO } from "@/lib/date";
import { useEnsureRoutineTasks, usePlans } from "@/lib/plans/queries";
import { memoOneLine } from "@/lib/plans/logic";
import { planHex } from "@/lib/plans/colors";
import {
  calculateScore,
  normalizeLateNight,
  storedFulfillment,
  streakCount,
} from "@/lib/score";
import { IMPORTANCE_LIST, Importance, Task } from "@/types";
import { ScoreRing } from "@/components/ScoreRing";
import { ClusterBadge } from "@/components/ClusterBadge";
import { TimelineView, UnscheduledPanel } from "@/components/TimelineView";

type ViewMode = "list" | "timeline";

export default function Today() {
  const { date: paramDate } = useParams<{ date?: string }>();
  const navigate = useNavigate();
  const today = todayISO();
  const date = paramDate ?? today;
  const isToday = date === today;

  // Adds today's routine tasks in the background (ADR-0002). Only when the
  // displayed date is today; past / future days never generate.
  useEnsureRoutineTasks(date);
  usePlans(); // start loading plan names / colors together with the tasks

  const tasksQuery = useTasks();
  const reviewsQuery = useReviews();
  const allTasks = tasksQuery.data ?? [];
  const reviews = reviewsQuery.data ?? [];
  const review = reviews.find((r) => r.date === date);
  const updateReviewFieldsMut = useUpdateReviewFields();
  const updateWakeFieldsMut = useUpdateWakeFields();
  const updateBedFieldsMut = useUpdateBedFields();

  const tasks = useMemo(
    () =>
      allTasks
        .filter((t) => t.scheduled_date === date)
        .sort((a, b) => {
          const aHas = !!a.start_time;
          const bHas = !!b.start_time;
          if (aHas && bHas) {
            const cmp = a.start_time!.localeCompare(b.start_time!);
            if (cmp !== 0) return cmp;
            return a.created_at.localeCompare(b.created_at);
          }
          if (aHas) return -1;
          if (bHas) return 1;
          return a.created_at.localeCompare(b.created_at);
        }),
    [allTasks, date]
  );

  const globalWakeTarget = useWakeTarget();
  const globalBedTarget = useBedTarget();
  const [fulfillment, setFulfillment] = useState<number | null>(
    storedFulfillment(review)
  );
  const [wakeTime, setWakeTime] = useState(review?.wake_time ?? "");
  const [wakeTargetOverride, setWakeTargetOverride] = useState(
    review?.wake_target ?? ""
  );
  const [bedTime, setBedTime] = useState(review?.bed_time ?? "");
  const [bedTargetOverride, setBedTargetOverride] = useState(
    review?.bed_target ?? ""
  );
  const [highlight, setHighlight] = useState(review?.highlight ?? "");
  const [intention, setIntention] = useState(review?.tomorrow_intention ?? "");

  useEffect(() => {
    setFulfillment(storedFulfillment(review));
    setWakeTime(review?.wake_time ?? "");
    setWakeTargetOverride(review?.wake_target ?? "");
    setBedTime(review?.bed_time ?? "");
    setBedTargetOverride(review?.bed_target ?? "");
    setHighlight(review?.highlight ?? "");
    setIntention(review?.tomorrow_intention ?? "");
  }, [date, reviewsQuery.isSuccess]);

  const wakeSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const bedSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const reviewSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const pendingReview = useRef<{
    fulfillment?: number;
    highlight?: string;
    tomorrow_intention?: string;
  }>({});
  const flushReviewSave = useRef<() => void>(() => {});
  flushReviewSave.current = () => {
    clearTimeout(reviewSaveTimer.current);
    const fields = pendingReview.current;
    if (Object.keys(fields).length === 0) return;
    pendingReview.current = {};
    updateReviewFieldsMut.mutate({ date, ...fields });
  };
  useEffect(() => {
    return () => {
      clearTimeout(wakeSaveTimer.current);
      clearTimeout(bedSaveTimer.current);
      // Text edits are not thrown away when the day changes: send them now.
      flushReviewSave.current();
    };
  }, [date]);

  function scheduleReviewSave(fields: typeof pendingReview.current) {
    pendingReview.current = { ...pendingReview.current, ...fields };
    clearTimeout(reviewSaveTimer.current);
    reviewSaveTimer.current = setTimeout(() => flushReviewSave.current(), 500);
  }

  function handleFulfillmentChange(v: number) {
    setFulfillment(v);
    scheduleReviewSave({ fulfillment: v });
  }

  function handleHighlightChange(v: string) {
    setHighlight(v);
    scheduleReviewSave({ highlight: v });
  }

  function handleIntentionChange(v: string) {
    setIntention(v);
    scheduleReviewSave({ tomorrow_intention: v });
  }

  function scheduleWakeSave(nextWakeTime: string, nextWakeTargetOverride: string) {
    clearTimeout(wakeSaveTimer.current);
    wakeSaveTimer.current = setTimeout(() => {
      updateWakeFieldsMut.mutate({
        date,
        wake_time: nextWakeTime || undefined,
        wake_target: nextWakeTargetOverride || undefined,
      });
    }, 500);
  }

  function handleWakeTimeChange(v: string) {
    setWakeTime(v);
    scheduleWakeSave(v, wakeTargetOverride);
  }

  function handleWakeTargetChange(v: string) {
    setWakeTargetOverride(v);
    scheduleWakeSave(wakeTime, v);
  }

  function handleWakeTargetReset() {
    setWakeTargetOverride("");
    scheduleWakeSave(wakeTime, "");
  }

  function scheduleBedSave(nextBedTime: string, nextBedTargetOverride: string) {
    clearTimeout(bedSaveTimer.current);
    bedSaveTimer.current = setTimeout(() => {
      updateBedFieldsMut.mutate({
        date,
        bed_time: nextBedTime || undefined,
        bed_target: nextBedTargetOverride || undefined,
      });
    }, 500);
  }

  function handleBedTimeChange(v: string) {
    setBedTime(v);
    scheduleBedSave(v, bedTargetOverride);
  }

  function handleBedTargetChange(v: string) {
    setBedTargetOverride(v);
    scheduleBedSave(bedTime, v);
  }

  function handleBedTargetReset() {
    setBedTargetOverride("");
    scheduleBedSave(bedTime, "");
  }

  const wakeTarget = wakeTargetOverride || globalWakeTarget;
  const bedTarget = bedTargetOverride || globalBedTarget;

  const preview = useMemo(
    () =>
      calculateScore(
        tasks,
        fulfillment,
        wakeTime || null,
        wakeTarget,
        bedTime || null,
        bedTarget
      ),
    [tasks, fulfillment, wakeTime, wakeTarget, bedTime, bedTarget]
  );

  const last30 = useMemo(() => rangeBefore(today, 30), [today]);
  const streak = useMemo(
    () => streakCount(reviews.filter((r) => last30.includes(r.date))),
    [reviews, last30]
  );

  const completedCount = tasks.filter((t) => t.completed).length;
  const [view, setView] = useState<ViewMode>("list");

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

      <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-4 lg:items-stretch">
        <TasksPanel
          tasks={tasks}
          date={date}
          completedCount={completedCount}
          view={view}
          onViewChange={setView}
          bedTarget={bedTarget}
        />
        <div className="flex flex-col gap-4 min-h-0">
          <SummaryPanel
            fulfillment={fulfillment == null ? null : preview.fulfillment_score}
            completedWeight={preview.completed_weight}
            scheduledWeight={preview.scheduled_weight}
            wakeScore={preview.wake_score}
            wakeTime={wakeTime}
            wakeTarget={wakeTarget}
            isWakeTargetOverridden={!!wakeTargetOverride}
            onWakeTimeChange={handleWakeTimeChange}
            onWakeTargetChange={handleWakeTargetChange}
            onWakeTargetReset={handleWakeTargetReset}
            bedScore={preview.bed_score}
            bedTime={bedTime}
            bedTarget={bedTarget}
            isBedTargetOverridden={!!bedTargetOverride}
            onBedTimeChange={handleBedTimeChange}
            onBedTargetChange={handleBedTargetChange}
            onBedTargetReset={handleBedTargetReset}
            totalScore={preview.total_score}
            cluster={preview.cluster}
            streak={streak}
            fulfillmentValue={fulfillment}
            onFulfillmentChange={handleFulfillmentChange}
            highlight={highlight}
            onHighlightChange={handleHighlightChange}
            intention={intention}
            onIntentionChange={handleIntentionChange}
            saveState={
              updateReviewFieldsMut.isError ||
              updateWakeFieldsMut.isError ||
              updateBedFieldsMut.isError
                ? "error"
                : updateReviewFieldsMut.isPending ||
                  updateWakeFieldsMut.isPending ||
                  updateBedFieldsMut.isPending
                ? "saving"
                : "idle"
            }
          />
        </div>
      </div>
    </div>
  );
}

function TasksPanel({
  tasks,
  date,
  completedCount,
  view,
  onViewChange,
  bedTarget,
}: {
  tasks: Task[];
  date: string;
  completedCount: number;
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  bedTarget: string;
}) {
  return (
    <section className="card !p-0 overflow-hidden">
      <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-notion-border">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">タスク</h2>
          <ViewToggle value={view} onChange={onViewChange} />
        </div>
        <span className="text-sm tabular-nums muted">
          <span className="text-slate-900 dark:text-notion-fg font-semibold">
            {completedCount}
          </span>{" "}
          / {tasks.length}
        </span>
      </header>

      {view === "list" ? (
        <>
          <QuickAdd defaultDate={date} />
          {tasks.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm muted">
              タスクはまだありません。上のフォームから追加してください。
            </p>
          ) : (
            <div className="overflow-y-auto" style={{ maxHeight: 480 }}>
              <ul className="divide-y divide-slate-100 dark:divide-notion-border">
                {tasks.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col md:flex-row">
          <UnscheduledPanel
            tasks={tasks}
            className="md:w-[220px] md:flex-shrink-0 border-b md:border-b-0 md:border-r border-slate-100 dark:border-notion-border"
          />
          <div className="flex-1 min-w-0">
            <TimelineView tasks={tasks} date={date} bedTarget={bedTarget} />
          </div>
        </div>
      )}
    </section>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const opts: { v: ViewMode; label: string }[] = [
    { v: "list", label: "リスト" },
    { v: "timeline", label: "タイムライン" },
  ];
  return (
    <div className="inline-flex rounded-md border border-slate-200 dark:border-notion-border p-0.5 bg-slate-50 dark:bg-notion-panel-hover/40">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={
            "text-xs px-2.5 py-1 rounded transition " +
            (value === o.v
              ? "bg-white dark:bg-notion-panel shadow-sm text-slate-900 dark:text-notion-fg"
              : "muted hover:text-slate-700 dark:hover:text-notion-fg")
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function QuickAdd({ defaultDate }: { defaultDate: string }) {
  const addTask = useAddTask();
  const [title, setTitle] = useState("");
  const [importance, setImportance] = useState<Importance>("中");
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!title.trim()) return;
    addTask.mutate({
      title: title.trim(),
      importance,
      scheduled_date: defaultDate,
    });
    setTitle("");
    setImportance("中");
    inputRef.current?.focus();
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (
          e.key === "Enter" &&
          !e.shiftKey &&
          !e.isDefaultPrevented() &&
          !e.nativeEvent.isComposing &&
          e.keyCode !== 229
        ) {
          e.preventDefault();
          submit();
        }
      }}
      className="px-5 py-4 border-b border-slate-100 dark:border-notion-border bg-slate-50/40 dark:bg-notion-panel-hover/40 space-y-3"
    >
      <div className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-notion-border bg-white dark:bg-notion-panel px-3 py-2 focus-within:ring-2 focus-within:ring-notion-blue focus-within:border-transparent transition">
        <span className="text-notion-blue text-base leading-none select-none">+</span>
        <input
          ref={inputRef}
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-slate-400 dark:placeholder:text-notion-muted"
          placeholder="新しいタスクを追加..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button
          type="submit"
          className="btn-primary !py-1 !px-3 text-xs"
          disabled={!title.trim()}
        >
          追加
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide muted">重要度</span>
        <ImportancePicker
          value={importance}
          onChange={(v) => {
            setImportance(v);
            inputRef.current?.focus();
          }}
        />
      </div>
    </form>
  );
}

const IMPORTANCE_META: Record<
  Importance,
  { dot: string; activeBg: string; activeText: string; pt: number }
> = {
  重: {
    dot: "bg-rose-500",
    activeBg: "bg-rose-500/10 border-rose-400 dark:bg-rose-500/20",
    activeText: "text-rose-700 dark:text-rose-200",
    pt: 3,
  },
  中: {
    dot: "bg-amber-500",
    activeBg: "bg-amber-500/10 border-amber-400 dark:bg-amber-500/20",
    activeText: "text-amber-700 dark:text-amber-200",
    pt: 2,
  },
  軽: {
    dot: "bg-slate-400 dark:bg-notion-muted",
    activeBg:
      "bg-slate-200/70 border-slate-400 dark:bg-notion-panel-hover dark:border-notion-border-strong",
    activeText: "text-slate-700 dark:text-notion-fg",
    pt: 1,
  },
};

function ImportancePicker({
  value,
  onChange,
}: {
  value: Importance;
  onChange: (v: Importance) => void;
}) {
  return (
    <div className="inline-flex gap-1">
      {IMPORTANCE_LIST.map((i) => {
        const meta = IMPORTANCE_META[i];
        const active = value === i;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            className={
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition " +
              (active
                ? `${meta.activeBg} ${meta.activeText} font-semibold`
                : "border-slate-200 dark:border-notion-border muted hover:bg-slate-100 dark:hover:bg-notion-panel-hover")
            }
            aria-pressed={active}
          >
            <span className={"size-2 rounded-full " + meta.dot} aria-hidden />
            <span>{i}</span>
            <span className="text-[10px] opacity-70 tabular-nums">
              {meta.pt}pt
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ImportanceMenu({
  value,
  onChange,
}: {
  value: Importance;
  onChange: (v: Importance) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        triggerRef.current?.contains(t) ||
        popRef.current?.contains(t)
      )
        return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen(true);
  }

  const meta = IMPORTANCE_META[value];
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className={
          "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs transition " +
          meta.activeBg +
          " " +
          meta.activeText
        }
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={"size-2 rounded-full " + meta.dot} aria-hidden />
        <span className="font-medium">{value}</span>
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            role="listbox"
            style={{ position: "fixed", top: pos.top, right: pos.right }}
            className="z-50 rounded-md border border-slate-200 dark:border-notion-border bg-white dark:bg-notion-panel shadow-lg py-1 min-w-[110px]"
          >
            {IMPORTANCE_LIST.map((i) => {
              const m = IMPORTANCE_META[i];
              const isActive = i === value;
              return (
                <button
                  key={i}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => {
                    onChange(i);
                    setOpen(false);
                  }}
                  className={
                    "flex items-center gap-2 w-full px-2.5 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-notion-panel-hover " +
                    (isActive ? "font-semibold" : "")
                  }
                >
                  <span className={"size-2 rounded-full " + m.dot} aria-hidden />
                  <span>{i}</span>
                  <span className="text-[10px] muted ml-auto tabular-nums">
                    {m.pt}pt
                  </span>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}

function TaskRow({ task }: { task: Task }) {
  const toggleTask = useToggleTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { data: plans } = usePlans();
  const plan = task.plan_id
    ? plans?.find((p) => p.id === task.plan_id)
    : undefined;
  const memoLine = plan ? memoOneLine(task.memo) : "";
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);

  function save() {
    if (title.trim() && title !== task.title) {
      updateTask.mutate({ id: task.id, patch: { title: title.trim() } });
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
        onChange={() => toggleTask(task)}
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
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
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
        {plan && (
          <div className="mt-1 flex items-center gap-2 text-xs muted min-w-0">
            <Link
              to={`/plans/${plan.id}`}
              className="flex items-center gap-1.5 flex-shrink-0 hover:underline"
              style={{ color: planHex(plan.color) }}
            >
              <span
                className="size-[7px] rounded-full"
                style={{ background: planHex(plan.color) }}
                aria-hidden
              />
              {plan.name}
            </Link>
            {memoLine && (
              <span className="truncate" title={task.memo}>
                {memoLine}
              </span>
            )}
          </div>
        )}
      </div>
      <ImportanceMenu
        value={task.importance}
        onChange={(v) =>
          updateTask.mutate({ id: task.id, patch: { importance: v } })
        }
      />
      <button
        type="button"
        onClick={() => deleteTask.mutate(task.id)}
        className="text-slate-300 dark:text-notion-muted hover:text-rose-500 opacity-0 group-hover:opacity-100 transition text-sm"
        aria-label="Delete"
      >
        ✕
      </button>
    </li>
  );
}

function TargetTimeEditor({
  target,
  isOverridden,
  onChange,
  onReset,
}: {
  target: string;
  isOverridden: boolean;
  onChange: (v: string) => void;
  onReset: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(target);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(target);
  }, [target]);

  function commit() {
    if (draft && draft !== target) {
      onChange(draft);
    }
    setEditing(false);
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setEditing(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="text-[11px] muted hover:text-notion-blue tabular-nums underline-offset-2 hover:underline"
          title="この日の目標時刻を変更"
        >
          目標 {target}
          {isOverridden && "・カスタム"} ✎
        </button>
        {isOverridden && (
          <button
            type="button"
            onClick={onReset}
            className="text-[11px] muted hover:text-notion-blue underline-offset-2 hover:underline"
            title="設定の目標時刻に戻す"
          >
            既定に戻す
          </button>
        )}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <span className="text-[11px] muted">目標</span>
      <input
        ref={inputRef}
        type="time"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(target);
            setEditing(false);
          }
        }}
        className="text-[11px] tabular-nums bg-transparent border border-slate-300 dark:border-notion-border rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-notion-blue"
      />
    </span>
  );
}

function WakeTimeInput({
  value,
  target,
  onChange,
  isTargetOverridden,
  onTargetChange,
  onTargetReset,
}: {
  value: string;
  target: string;
  onChange: (v: string) => void;
  isTargetOverridden: boolean;
  onTargetChange: (v: string) => void;
  onTargetReset: () => void;
}) {
  const wakeMin = toMinutes(value);
  const targetMin = toMinutes(target);
  const diff =
    wakeMin != null && targetMin != null ? wakeMin - targetMin : null;

  const tone =
    diff == null
      ? { text: "text-slate-500 dark:text-notion-muted", bar: "bg-slate-300 dark:bg-notion-border" }
      : diff <= 0
      ? { text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" }
      : diff <= 30
      ? { text: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" }
      : diff <= 90
      ? { text: "text-orange-600 dark:text-orange-400", bar: "bg-orange-500" }
      : { text: "text-rose-600 dark:text-rose-400", bar: "bg-rose-500" };

  const diffLabel =
    diff == null
      ? "未入力"
      : diff === 0
      ? "ぴったり"
      : diff < 0
      ? `目標より${Math.abs(diff)}分早い☀️`
      : `目標より${diff}分遅れ😣`;

  function setNow() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    onChange(`${hh}:${mm}`);
  }

  // Bar position: -60min (full early) → 0%, target → ~28%, +150min → 100%
  const BAR_MIN = -60;
  const BAR_MAX = 150;
  const markerPct =
    diff == null
      ? null
      : Math.max(
          0,
          Math.min(100, ((diff - BAR_MIN) / (BAR_MAX - BAR_MIN)) * 100)
        );
  const targetPct = ((0 - BAR_MIN) / (BAR_MAX - BAR_MIN)) * 100;

  return (
    <div className="w-full space-y-2 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide muted">
          🌅 起床時刻
        </span>
        <TargetTimeEditor
          target={target}
          isOverridden={isTargetOverridden}
          onChange={onTargetChange}
          onReset={onTargetReset}
        />
      </div>

      <div className="flex items-center gap-1 rounded-md border border-slate-300 dark:border-notion-border bg-white dark:bg-notion-panel px-1.5 py-1 focus-within:ring-2 focus-within:ring-notion-blue focus-within:border-transparent transition">
        <input
          aria-label="起床時刻"
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-transparent outline-none text-lg font-bold tabular-nums flex-1 min-w-0 px-1"
        />
        <button
          type="button"
          onClick={setNow}
          className="text-[11px] font-medium text-notion-blue hover:bg-notion-blue/10 rounded px-2 py-1 transition whitespace-nowrap"
          title="現在時刻を入力"
        >
          今すぐ
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-slate-400 hover:text-rose-500 px-1.5 text-sm"
            aria-label="クリア"
            title="クリア"
          >
            ✕
          </button>
        )}
      </div>
      <div className={"text-xs font-semibold tabular-nums " + tone.text}>
        {diffLabel}
      </div>
    </div>
  );
}

function toMinutes(time: string): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function BedTimeInput({
  value,
  target,
  onChange,
  isTargetOverridden,
  onTargetChange,
  onTargetReset,
}: {
  value: string;
  target: string;
  onChange: (v: string) => void;
  isTargetOverridden: boolean;
  onTargetChange: (v: string) => void;
  onTargetReset: () => void;
}) {
  const bedMin = toMinutes(value);
  const targetMin = toMinutes(target);
  const diff =
    bedMin != null && targetMin != null
      ? normalizeLateNight(bedMin) - normalizeLateNight(targetMin)
      : null;

  const tone =
    diff == null
      ? { text: "text-slate-500 dark:text-notion-muted", bar: "bg-slate-300 dark:bg-notion-border" }
      : diff <= 0
      ? { text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" }
      : diff <= 30
      ? { text: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" }
      : diff <= 90
      ? { text: "text-orange-600 dark:text-orange-400", bar: "bg-orange-500" }
      : { text: "text-rose-600 dark:text-rose-400", bar: "bg-rose-500" };

  const diffLabel =
    diff == null
      ? "未入力"
      : diff === 0
      ? "ぴったり"
      : diff < 0
      ? `目標より${Math.abs(diff)}分早い🌙`
      : `目標より${diff}分遅れ😵`;

  function setNow() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    onChange(`${hh}:${mm}`);
  }

  // Bar position: -60min (full early) → 0%, target → ~28%, +150min → 100%
  const BAR_MIN = -60;
  const BAR_MAX = 150;
  const markerPct =
    diff == null
      ? null
      : Math.max(
          0,
          Math.min(100, ((diff - BAR_MIN) / (BAR_MAX - BAR_MIN)) * 100)
        );
  const targetPct = ((0 - BAR_MIN) / (BAR_MAX - BAR_MIN)) * 100;

  return (
    <div className="w-full space-y-2 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide muted">
          🌙 就寝時刻
        </span>
        <TargetTimeEditor
          target={target}
          isOverridden={isTargetOverridden}
          onChange={onTargetChange}
          onReset={onTargetReset}
        />
      </div>

      <div className="flex items-center gap-1 rounded-md border border-slate-300 dark:border-notion-border bg-white dark:bg-notion-panel px-1.5 py-1 focus-within:ring-2 focus-within:ring-notion-blue focus-within:border-transparent transition">
        <input
          aria-label="就寝時刻"
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-transparent outline-none text-lg font-bold tabular-nums flex-1 min-w-0 px-1"
        />
        <button
          type="button"
          onClick={setNow}
          className="text-[11px] font-medium text-notion-blue hover:bg-notion-blue/10 rounded px-2 py-1 transition whitespace-nowrap"
          title="現在時刻を入力"
        >
          今すぐ
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-slate-400 hover:text-rose-500 px-1.5 text-sm"
            aria-label="クリア"
            title="クリア"
          >
            ✕
          </button>
        )}
      </div>
      <div className={"text-xs font-semibold tabular-nums " + tone.text}>
        {diffLabel}
      </div>
    </div>
  );
}

function SummaryPanel({
  fulfillment,
  completedWeight,
  scheduledWeight,
  wakeScore,
  wakeTime,
  wakeTarget,
  isWakeTargetOverridden,
  onWakeTimeChange,
  onWakeTargetChange,
  onWakeTargetReset,
  bedScore,
  bedTime,
  bedTarget,
  isBedTargetOverridden,
  onBedTimeChange,
  onBedTargetChange,
  onBedTargetReset,
  totalScore,
  cluster,
  streak,
  fulfillmentValue,
  onFulfillmentChange,
  highlight,
  onHighlightChange,
  intention,
  onIntentionChange,
  saveState,
}: {
  fulfillment: number | null;
  completedWeight: number;
  scheduledWeight: number;
  wakeScore: number;
  wakeTime: string;
  wakeTarget: string;
  isWakeTargetOverridden: boolean;
  onWakeTimeChange: (v: string) => void;
  onWakeTargetChange: (v: string) => void;
  onWakeTargetReset: () => void;
  bedScore: number;
  bedTime: string;
  bedTarget: string;
  isBedTargetOverridden: boolean;
  onBedTimeChange: (v: string) => void;
  onBedTargetChange: (v: string) => void;
  onBedTargetReset: () => void;
  totalScore: number;
  cluster: import("@/types").Cluster;
  streak: number;
  fulfillmentValue: number | null;
  onFulfillmentChange: (n: number) => void;
  highlight: string;
  onHighlightChange: (s: string) => void;
  intention: string;
  onIntentionChange: (s: string) => void;
  saveState: "idle" | "saving" | "error";
}) {
  const completionPct =
    scheduledWeight === 0
      ? 0
      : Math.round((completedWeight / scheduledWeight) * 100);
  return (
    <aside className="card flex flex-col items-center gap-3">
      <div className="self-stretch flex items-center justify-between text-xs">
        <span className="uppercase tracking-wide muted">スコア</span>
        <span
          role="status"
          className={
            saveState === "error"
              ? "text-rose-500"
              : "muted"
          }
        >
          {saveState === "error"
            ? "保存に失敗しました（入力は残っています。再度編集すると再試行します）"
            : saveState === "saving"
            ? "保存中…"
            : "自動保存"}
        </span>
      </div>
      <ScoreRing score={Math.round(totalScore)} cluster={cluster} size={140} />
      <ClusterBadge cluster={cluster} size="lg" />
      <div className="w-full grid grid-cols-4 gap-1.5 text-center text-[11px]">
        <div className="rounded-md bg-slate-50 dark:bg-notion-panel-hover p-2">
          <div className="muted">完了 (80)</div>
          <div className="font-semibold tabular-nums">
            {scheduledWeight === 0 ? "—" : `${completionPct}%`}
          </div>
        </div>
        <div className="rounded-md bg-slate-50 dark:bg-notion-panel-hover p-2">
          <div className="muted">充実 (5)</div>
          <div className="font-semibold tabular-nums">
            {fulfillment == null ? "—" : fulfillment} / 5
          </div>
        </div>
        <div className="rounded-md bg-slate-50 dark:bg-notion-panel-hover p-2">
          <div className="muted">起床 (7.5)</div>
          <div className="font-semibold tabular-nums">
            {wakeTime ? wakeScore.toFixed(1) : "—"} / 7.5
          </div>
        </div>
        <div className="rounded-md bg-slate-50 dark:bg-notion-panel-hover p-2">
          <div className="muted">就寝 (7.5)</div>
          <div className="font-semibold tabular-nums">
            {bedTime ? bedScore.toFixed(1) : "—"} / 7.5
          </div>
        </div>
      </div>

      <div className="w-full pt-3 border-t border-slate-100 dark:border-notion-border">
        <FulfillmentPicker
          value={fulfillmentValue}
          onChange={onFulfillmentChange}
        />
      </div>

      <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
        <WakeTimeInput
          value={wakeTime}
          target={wakeTarget}
          onChange={onWakeTimeChange}
          isTargetOverridden={isWakeTargetOverridden}
          onTargetChange={onWakeTargetChange}
          onTargetReset={onWakeTargetReset}
        />

        <BedTimeInput
          value={bedTime}
          target={bedTarget}
          onChange={onBedTimeChange}
          isTargetOverridden={isBedTargetOverridden}
          onTargetChange={onBedTargetChange}
          onTargetReset={onBedTargetReset}
        />
      </div>

      <div className="w-full pt-3 border-t border-slate-100 dark:border-notion-border space-y-3">
        <div>
          <label className="label" htmlFor="review-highlight">
            今日のハイライト
          </label>
          <AutoGrowTextarea
            id="review-highlight"
            placeholder="今日一番良かったこと"
            value={highlight}
            onChange={onHighlightChange}
          />
        </div>
        <div>
          <label className="label" htmlFor="review-intention">
            明日の意図
          </label>
          <AutoGrowTextarea
            id="review-intention"
            placeholder="明日意識したいこと"
            value={intention}
            onChange={onIntentionChange}
          />
        </div>
      </div>

      <div className="w-full pt-3 border-t border-slate-100 dark:border-notion-border flex items-center justify-between text-xs">
        <span className="muted">A/B 連続日数</span>
        <span className="tabular-nums font-semibold">
          {streak} <span className="muted font-normal">日</span>
        </span>
      </div>
    </aside>
  );
}

// Shows the text as plain text once it has content; clicking it (or Enter /
// Space when focused) switches back to the textarea. Empty values stay editable.
function AutoGrowTextarea({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [editing, setEditing] = useState(false);
  const showText = !!value && !editing;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, showText]);

  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  if (showText) {
    return (
      <div
        id={id}
        role="button"
        tabIndex={0}
        title="クリックして編集"
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setEditing(true);
          }
        }}
        className="text-sm whitespace-pre-wrap break-words rounded-md px-3 py-2 cursor-text hover:bg-slate-50 dark:hover:bg-notion-panel-hover transition"
      >
        {value}
      </div>
    );
  }

  return (
    <textarea
      ref={ref}
      id={id}
      rows={1}
      className="input resize-none overflow-hidden"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setEditing(true)}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") e.currentTarget.blur();
      }}
    />
  );
}

const FULFILLMENT_OPTIONS: {
  value: number;
  emoji: string;
  label: string;
  active: string;
}[] = [
  { value: 1, emoji: "😞", label: "厳しい", active: "bg-rose-500/10 border-rose-400 text-rose-700 dark:text-rose-200 dark:bg-rose-500/20" },
  { value: 2, emoji: "😕", label: "不調", active: "bg-orange-500/10 border-orange-400 text-orange-700 dark:text-orange-200 dark:bg-orange-500/20" },
  { value: 3, emoji: "😐", label: "普通", active: "bg-amber-500/10 border-amber-400 text-amber-700 dark:text-amber-200 dark:bg-amber-500/20" },
  { value: 4, emoji: "🙂", label: "好調", active: "bg-blue-500/10 border-blue-400 text-blue-700 dark:text-blue-200 dark:bg-blue-500/20" },
  { value: 5, emoji: "😄", label: "最高", active: "bg-emerald-500/10 border-emerald-400 text-emerald-700 dark:text-emerald-200 dark:bg-emerald-500/20" },
];

function FulfillmentPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number) => void;
}) {
  const current = FULFILLMENT_OPTIONS.find((o) => o.value === value);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="label !mb-0">充実度</span>
        {current ? (
          <span className="text-xs muted">
            <span className="text-slate-900 dark:text-notion-fg font-semibold tabular-nums">
              {current.value}
            </span>{" "}
            / 5 · {current.label}
          </span>
        ) : (
          <span className="text-xs muted">未選択</span>
        )}
      </div>
      <div className="grid grid-cols-5 gap-2">
        {FULFILLMENT_OPTIONS.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={active}
              aria-label={`${o.value} ${o.label}`}
              className={
                "flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 transition " +
                (active
                  ? `${o.active} font-semibold shadow-sm`
                  : "border-slate-200 dark:border-notion-border hover:bg-slate-50 dark:hover:bg-notion-panel-hover")
              }
            >
              <span className={"text-2xl leading-none " + (active ? "" : "grayscale opacity-70")}>
                {o.emoji}
              </span>
              <span className="text-[10px] tabular-nums opacity-80">
                {o.value}
              </span>
              <span className="text-[10px]">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

