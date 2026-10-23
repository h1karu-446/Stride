import { useEffect, useMemo, useRef, useState } from "react";
import { todayISO } from "@/lib/date";
import {
  canUnschedule,
  deadlineLabel,
  deadlineState,
  scheduleButtonLabel,
  sortBacklog,
} from "@/lib/backlog/logic";
import {
  useAddBacklogItem,
  useBacklogItems,
  useDeleteBacklogItem,
  useScheduleBacklogItem,
  useUnscheduleTask,
  useUpdateBacklogItem,
  type BacklogInput,
} from "@/lib/backlog/queries";
import {
  BACKLOG_DRAG_TYPE,
  DRAG_ID_TYPE,
  DRAG_MOVABLE_TYPE,
  setActiveDragTitle,
} from "@/lib/dnd";
import { useBacklogNotice } from "@/lib/backlog/notice";
import DatePicker from "@/components/common/DatePicker";
import { IMPORTANCE_LIST, type BacklogItem, type Importance, type Task } from "@/types";

// やることリスト (Issue #83): things to do soon without a day. Drag an item to
// the day's task list or timeline (or press its button) to make it a task of
// the displayed day; drag an unfinished hand task here to move it back.

const DOT: Record<Importance, string> = {
  重: "bg-rose-400",
  中: "bg-amber-400",
  軽: "bg-slate-300 dark:bg-notion-border",
};

const DEADLINE_STYLE: Record<ReturnType<typeof deadlineState>, string> = {
  overdue: "text-rose-600 dark:text-rose-300 font-semibold",
  today: "text-rose-600 dark:text-rose-300",
  soon: "text-amber-700 dark:text-amber-300",
  later: "muted",
};

export function BacklogPanel({ date, tasks }: { date: string; tasks: Task[] }) {
  const today = todayISO();
  const { data, isLoading } = useBacklogItems();
  const items = useMemo(() => sortBacklog(data ?? []), [data]);
  const schedule = useScheduleBacklogItem();
  const unschedule = useUnscheduleTask();
  const [dropActive, setDropActive] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  return (
    <section
      className={
        "card !p-0 overflow-hidden transition " +
        (dropActive ? "ring-2 ring-notion-blue" : "")
      }
      aria-labelledby="backlog-heading"
      onDragOver={(e) => {
        // Only a task that can go back (DRAG_MOVABLE_TYPE) shows the drop frame.
        if (!e.dataTransfer.types.includes(DRAG_MOVABLE_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDropActive(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDropActive(false);
      }}
      onDrop={(e) => {
        setDropActive(false);
        const id = e.dataTransfer.getData(DRAG_ID_TYPE);
        const task = tasks.find((t) => t.id === id);
        if (!task || !canUnschedule(task, today)) return;
        e.preventDefault();
        unschedule.mutate(task);
      }}
    >
      <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-notion-border">
        <div>
          <h2 id="backlog-heading" ref={headingRef} tabIndex={-1} className="text-base font-semibold outline-none">
            やることリスト
          </h2>
          <p className="text-[11px] muted mt-0.5">
            日付を決めていないこと。タスクへドラッグするとこの日に入ります
          </p>
        </div>
        <span className="text-sm tabular-nums muted">{items.length}</span>
      </header>

      <BacklogAdd />
      <BacklogNotices />

      {isLoading ? null : items.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm muted">
          まだありません。日付を決めていないことを上から追加してください。
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-notion-border overflow-y-auto" style={{ maxHeight: 360 }}>
          {items.map((item) => (
            <BacklogRow
              key={item.id}
              item={item}
              today={today}
              date={date}
              onSchedule={(hadFocus) => {
                schedule.mutate({ itemId: item.id, date });
                // The row leaves at once; keep keyboard users in the panel.
                if (hadFocus) headingRef.current?.focus();
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

const NOTICE_MS = { status: 5000, alert: 10000 } as const;

/**
 * The latest move's outcome, from wherever it started. The two live regions
 * stay mounted so screen readers announce each new text.
 */
function BacklogNotices() {
  const notice = useBacklogNotice((s) => s.notice);
  const dismiss = useBacklogNotice((s) => s.dismiss);
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => dismiss(notice.id), NOTICE_MS[notice.kind]);
    return () => window.clearTimeout(id);
  }, [notice, dismiss]);
  const status = notice?.kind === "status" ? notice.text : "";
  const alert = notice?.kind === "alert" ? notice.text : "";
  return (
    <>
      <p role="status" className={status ? "px-5 pt-2 text-xs muted" : "sr-only"}>{status}</p>
      <p role="alert" className={alert ? "px-5 pt-2 text-xs text-rose-600 dark:text-rose-300" : "sr-only"}>{alert}</p>
    </>
  );
}

function BacklogAdd() {
  const add = useAddBacklogItem();
  const [v, setV] = useState<BacklogInput>({ title: "", importance: "中" });

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const title = v.title.trim();
    if (!title) return;
    // Cleared only on success, so a failure keeps what was typed.
    add.mutate({ ...v, title }, { onSuccess: () => setV((cur) => ({ ...cur, title: "", deadline: undefined })) });
  }

  return (
    <form
      onSubmit={submit}
      className="px-5 py-3 border-b border-slate-100 dark:border-notion-border bg-slate-50/40 dark:bg-notion-panel-hover/40 space-y-2"
    >
      <div className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-notion-border bg-white dark:bg-notion-panel px-3 py-1.5 focus-within:ring-2 focus-within:ring-notion-blue focus-within:border-transparent transition">
        <span className="text-notion-blue text-base leading-none select-none" aria-hidden>+</span>
        <input
          aria-label="やることを追加"
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-slate-400 dark:placeholder:text-notion-muted"
          placeholder="やることを追加..."
          value={v.title}
          onChange={(e) => setV({ ...v, title: e.target.value })}
          onKeyDown={(e) => {
            // Enter that confirms an IME conversion must not submit.
            if (e.key === "Enter" && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault();
          }}
        />
        <button type="submit" className="btn-primary !py-1 !px-3 text-xs" disabled={!v.title.trim() || add.isPending}>
          追加
        </button>
      </div>
      <BacklogFields value={v} onChange={setV} />
      {add.isError && (
        <p className="text-xs text-rose-600 dark:text-rose-300" role="alert">追加できませんでした。</p>
      )}
    </form>
  );
}

/** Priority pills and the optional deadline, shared by add and edit. */
function BacklogFields({
  value,
  onChange,
}: {
  value: BacklogInput;
  onChange: (v: BacklogInput) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] uppercase tracking-wide muted">優先度</span>
      <div className="inline-flex gap-1">
        {IMPORTANCE_LIST.map((i) => (
          <button
            key={i}
            type="button"
            aria-pressed={value.importance === i}
            onClick={() => onChange({ ...value, importance: i })}
            className={
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs transition " +
              (value.importance === i
                ? "border-slate-400 dark:border-notion-border-strong bg-white dark:bg-notion-panel font-semibold"
                : "border-slate-200 dark:border-notion-border muted hover:bg-slate-100 dark:hover:bg-notion-panel-hover")
            }
          >
            <span className={"size-2 rounded-full " + DOT[i]} aria-hidden />
            {i}
          </button>
        ))}
      </div>
      <div className="w-56 max-w-full">
        <DatePicker
          label="締め切り"
          value={value.deadline ?? ""}
          emptyLabel="＋ 締め切り"
          allowClear
          onChange={(d) => onChange({ ...value, deadline: d || undefined })}
        />
      </div>
    </div>
  );
}

function BacklogRow({
  item,
  today,
  date,
  onSchedule,
}: {
  item: BacklogItem;
  today: string;
  /** The displayed day (today or later: the panel is not shown on a past day). */
  date: string;
  onSchedule: (hadFocus: boolean) => void;
}) {
  const update = useUpdateBacklogItem();
  const remove = useDeleteBacklogItem();
  const [editing, setEditing] = useState<BacklogInput | null>(null);

  if (editing) {
    const save = () => {
      const title = editing.title.trim();
      if (!title) return;
      update.mutate({ id: item.id, input: { ...editing, title } }, { onSuccess: () => setEditing(null) });
    };
    return (
      <li className="px-5 py-3 space-y-2 bg-slate-50/60 dark:bg-notion-panel-hover/30">
        <input
          autoFocus
          aria-label="やることのタイトル"
          className="w-full rounded-md border border-slate-200 dark:border-notion-border bg-white dark:bg-notion-panel px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-notion-blue"
          value={editing.title}
          onChange={(e) => setEditing({ ...editing, title: e.target.value })}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(null);
          }}
        />
        <BacklogFields value={editing} onChange={setEditing} />
        <div className="flex items-center gap-2">
          <button type="button" className="btn-primary !py-1 !px-3 text-xs" disabled={!editing.title.trim() || update.isPending} onClick={save}>
            保存
          </button>
          <button type="button" className="btn-ghost !py-1 !px-3 text-xs" onClick={() => setEditing(null)}>
            キャンセル
          </button>
          <button
            type="button"
            className="ml-auto text-xs text-rose-600 dark:text-rose-300 hover:underline disabled:opacity-50"
            disabled={remove.isPending}
            onClick={() => remove.mutate(item.id)}
          >
            削除
          </button>
        </div>
        {(update.isError || remove.isError) && (
          <p className="text-xs text-rose-600 dark:text-rose-300" role="alert">保存できませんでした。</p>
        )}
      </li>
    );
  }

  return (
    <li
      draggable
      onDragStart={(e) => {
        setActiveDragTitle(item.title);
        e.dataTransfer.setData(BACKLOG_DRAG_TYPE, item.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => setActiveDragTitle(null)}
      className={
        "group flex items-center gap-2 px-5 py-2 text-sm hover:bg-slate-50 dark:hover:bg-notion-panel-hover transition " +
        "cursor-grab active:cursor-grabbing"
      }
    >
      <span className="text-slate-300 dark:text-notion-muted text-xs select-none" aria-hidden>⋮⋮</span>
      <span className={"inline-block w-1.5 h-4 rounded-sm flex-shrink-0 " + DOT[item.importance]} aria-hidden />
      <span className="sr-only">優先度 {item.importance}</span>
      <div className="flex-1 min-w-0">
        <button
          type="button"
          className="text-left w-full truncate"
          onClick={() =>
            setEditing({ title: item.title, importance: item.importance, deadline: item.deadline })
          }
          title="編集"
        >
          {item.title}
        </button>
        {item.memo && <p className="text-xs muted truncate" title={item.memo}>{item.memo}</p>}
      </div>
      {item.deadline && (
        <span className={"text-[11px] tabular-nums flex-shrink-0 " + DEADLINE_STYLE[deadlineState(item.deadline, today)]}>
          {deadlineLabel(item.deadline, today)}
        </span>
      )}
      <button
        type="button"
        className="flex-shrink-0 rounded border border-slate-200 dark:border-notion-border px-2 py-0.5 text-[11px] muted hover:text-slate-900 dark:hover:text-notion-fg hover:bg-white dark:hover:bg-notion-panel transition"
        onClick={(e) => onSchedule(document.activeElement === e.currentTarget)}
        aria-label={`「${item.title}」を${scheduleButtonLabel(date, today)}`}
      >
        {scheduleButtonLabel(date, today)}
      </button>
    </li>
  );
}
