import { useEffect, useMemo, useState } from "react";
import { todayISO } from "@/lib/date";
import {
  canUnschedule,
  deadlineLabel,
  deadlineState,
  draftAfterAdd,
  sortBacklog,
} from "@/lib/backlog/logic";
import {
  useAddBacklogItem,
  useBacklogItems,
  useDeleteBacklogItem,
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
// the day's task list or timeline to make it a task of the displayed day;
// drag an unfinished hand task here to move it back. Moving is drag only
// (Issue #87): touch screens drag after a long press.

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

export function BacklogPanel({ tasks }: { tasks: Task[] }) {
  const today = todayISO();
  const { data, isLoading } = useBacklogItems();
  const items = useMemo(() => sortBacklog(data ?? []), [data]);
  const unschedule = useUnscheduleTask();
  const [dropActive, setDropActive] = useState(false);

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
      <header className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-notion-border">
        <h2 id="backlog-heading" className="text-base font-semibold">
          やることリスト
        </h2>
        <span className="text-sm tabular-nums muted">{items.length}</span>
      </header>

      <BacklogAdd />
      <BacklogNotices />

      {/* Empty: the add row above is the whole panel; no placeholder text. */}
      {!isLoading && items.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-notion-border overflow-y-auto" style={{ maxHeight: 360 }}>
          {items.map((item) => (
            <BacklogRow
              key={item.id}
              item={item}
              today={today}
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
      <p role="status" className={status ? "px-5 py-1.5 text-xs muted" : "sr-only"}>{status}</p>
      <p role="alert" className={alert ? "px-5 py-1.5 text-xs text-rose-600 dark:text-rose-300" : "sr-only"}>{alert}</p>
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
    // Cleared only on success (a failure keeps what was typed), and only if
    // the form still holds what was sent (an entry typed meanwhile stays).
    const sent = v;
    add.mutate({ ...v, title }, { onSuccess: () => setV((cur) => draftAfterAdd(cur, sent)) });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-center gap-2 px-5 py-2.5 border-b border-slate-100 dark:border-notion-border"
    >
      <input
        aria-label="やることを追加"
        className={INPUT + " min-w-[10rem] flex-1"}
        placeholder="やることを追加"
        value={v.title}
        onChange={(e) => setV({ ...v, title: e.target.value })}
        onKeyDown={(e) => {
          // Enter that confirms an IME conversion must not submit.
          if (e.key === "Enter" && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault();
        }}
      />
      <BacklogFields value={v} onChange={setV} />
      <button type="submit" className="btn-primary !py-2 !px-3 text-xs" disabled={!v.title.trim() || add.isPending}>
        追加
      </button>
      {add.isError && (
        <p className="basis-full text-xs text-rose-600 dark:text-rose-300" role="alert">追加できませんでした。</p>
      )}
    </form>
  );
}

const INPUT =
  "rounded-md border border-slate-200 dark:border-notion-border bg-white dark:bg-notion-panel px-2.5 py-2 text-sm outline-none placeholder:text-slate-400 dark:placeholder:text-notion-muted focus:ring-2 focus:ring-notion-blue focus:border-transparent";

/**
 * Priority (one segmented control: the colored dots say what it is) and the
 * optional deadline, shared by add and edit. Laid out inline by the parent.
 */
function BacklogFields({
  value,
  onChange,
}: {
  value: BacklogInput;
  onChange: (v: BacklogInput) => void;
}) {
  return (
    <>
      <div
        role="group"
        aria-label="優先度"
        className="inline-flex rounded-md border border-slate-200 dark:border-notion-border p-0.5"
      >
        {IMPORTANCE_LIST.map((i) => (
          <button
            key={i}
            type="button"
            aria-pressed={value.importance === i}
            aria-label={`優先度 ${i}`}
            onClick={() => onChange({ ...value, importance: i })}
            className={
              "inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition " +
              (value.importance === i
                ? "bg-slate-100 dark:bg-notion-panel-hover font-semibold"
                : "muted hover:text-slate-700 dark:hover:text-notion-fg")
            }
          >
            <span className={"size-2 rounded-full " + DOT[i]} aria-hidden />
            {i}
          </button>
        ))}
      </div>
      <DatePicker
        label="締め切り"
        value={value.deadline ?? ""}
        emptyLabel="締め切り"
        allowClear
        onChange={(d) => onChange({ ...value, deadline: d || undefined })}
      />
    </>
  );
}

function BacklogRow({
  item,
  today,
}: {
  item: BacklogItem;
  today: string;
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
      <li className="flex flex-wrap items-center gap-2 px-5 py-2.5 bg-slate-50/60 dark:bg-notion-panel-hover/30">
        <input
          autoFocus
          aria-label="やることのタイトル"
          className={INPUT + " basis-full"}
          value={editing.title}
          onChange={(e) => setEditing({ ...editing, title: e.target.value })}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(null);
          }}
        />
        <BacklogFields value={editing} onChange={setEditing} />
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="btn-ghost !py-1.5 !px-2.5 text-xs text-rose-600 dark:text-rose-300 disabled:opacity-50"
            disabled={remove.isPending}
            onClick={() => remove.mutate(item.id)}
          >
            削除
          </button>
          <button type="button" className="btn-ghost !py-1.5 !px-2.5 text-xs" onClick={() => setEditing(null)}>
            キャンセル
          </button>
          <button type="button" className="btn-primary !py-1.5 !px-3 text-xs" disabled={!editing.title.trim() || update.isPending} onClick={save}>
            保存
          </button>
        </div>
        {(update.isError || remove.isError) && (
          <p className="basis-full text-xs text-rose-600 dark:text-rose-300" role="alert">保存できませんでした。</p>
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
    </li>
  );
}
