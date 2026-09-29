import { useEffect, useMemo, useRef, useState } from "react";
import {
  useAddTask,
  useDeleteTask,
  useToggleTask,
  useUpdateTask,
} from "@/lib/queries";
import { usePlans } from "@/lib/plans/queries";
import { dropTimes, formatMinutes } from "@/lib/plans/logic";
import { planHex } from "@/lib/plans/colors";
import { IMPORTANCE_LIST, Importance, Task } from "@/types";

// While dragging, dataTransfer values cannot be read (only the types can), so
// the duration of the dragged task is carried in the type name to size the
// preview frame.
const DRAG_ID_TYPE = "application/x-task-id";
const DRAG_MINUTES_PREFIX = "application/x-task-minutes-";

const START_HOUR = 0;
const END_HOUR = 24;
const HOUR_PX = 56;
const SNAP_MIN = 15;
const VIEWPORT_PX = 560;
const DRAG_THRESHOLD_PX = 4;

type DragState =
  | {
      kind: "create";
      startMin: number;
      currentMin: number;
    }
  | {
      kind: "move";
      taskId: string;
      origStart: number;
      origEnd: number;
      pointerStartMin: number;
      pointerStartClientY: number;
      currentMin: number;
      activated: boolean;
    }
  | {
      kind: "resize";
      taskId: string;
      edge: "top" | "bottom";
      origStart: number;
      origEnd: number;
      currentStart: number;
      currentEnd: number;
    };

function toMin(time?: string): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function toTime(min: number): string {
  const clamped = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60, min));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function snap(min: number): number {
  return Math.round(min / SNAP_MIN) * SNAP_MIN;
}

function packLayout(
  events: Array<{ id: string; start: number; end: number }>
): Map<string, { col: number; totalCols: number }> {
  const sorted = [...events].sort(
    (a, b) => a.start - b.start || a.end - b.end
  );
  const result = new Map<string, { col: number; totalCols: number }>();
  let group: Array<{ id: string; start: number; end: number }> = [];
  let groupEnd = -Infinity;

  const flush = () => {
    if (group.length === 0) return;
    const cols: number[] = [];
    const assigned: Array<{ id: string; col: number }> = [];
    for (const ev of group) {
      let placed = false;
      for (let i = 0; i < cols.length; i += 1) {
        if (cols[i] <= ev.start) {
          cols[i] = ev.end;
          assigned.push({ id: ev.id, col: i });
          placed = true;
          break;
        }
      }
      if (!placed) {
        cols.push(ev.end);
        assigned.push({ id: ev.id, col: cols.length - 1 });
      }
    }
    const totalCols = cols.length;
    for (const a of assigned) {
      result.set(a.id, { col: a.col, totalCols });
    }
    group = [];
    groupEnd = -Infinity;
  };

  for (const ev of sorted) {
    if (group.length > 0 && ev.start >= groupEnd) {
      flush();
    }
    group.push(ev);
    groupEnd = Math.max(groupEnd, ev.end);
  }
  flush();
  return result;
}

function scheduledMin(tasks: Task[]): number | null {
  let earliest: number | null = null;
  for (const t of tasks) {
    const m = toMin(t.start_time);
    if (m == null) continue;
    if (earliest == null || m < earliest) earliest = m;
  }
  return earliest;
}

function minToY(min: number): number {
  return ((min - START_HOUR * 60) / 60) * HOUR_PX;
}

function yToMin(y: number): number {
  return START_HOUR * 60 + (y / HOUR_PX) * 60;
}

const IMPORTANCE_COLOR: Record<Importance, string> = {
  重: "bg-rose-100 dark:bg-rose-900/30 border-rose-300 dark:border-rose-700/60 text-rose-900 dark:text-rose-100",
  中: "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700/60 text-blue-900 dark:text-blue-100",
  軽: "bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700/60 text-emerald-900 dark:text-emerald-100",
};

export function TimelineView({
  tasks,
  date,
  bedTarget,
}: {
  tasks: Task[];
  date: string;
  bedTarget?: string;
}) {
  const addTaskMut = useAddTask();
  const updateTaskMut = useUpdateTask();
  const deleteTaskMut = useDeleteTask();
  const toggleTaskMut = useToggleTask();

  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pendingCreate, setPendingCreate] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftImportance, setDraftImportance] = useState<Importance>("中");
  const [dropRange, setDropRange] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const { data: plans } = usePlans();
  const planColorOf = (t: Task) => {
    const plan = t.plan_id ? plans?.find((p) => p.id === t.plan_id) : undefined;
    return plan ? planHex(plan.color) : undefined;
  };
  const [editing, setEditing] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editImportance, setEditImportance] = useState<Importance>("中");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [nowMin, setNowMin] = useState<number>(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const earliest = scheduledMin(tasks);
    const target = earliest ?? new Date().getHours() * 60;
    el.scrollTop = Math.max(0, ((target - START_HOUR * 60) / 60) * HOUR_PX - HOUR_PX);
  }, []);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const isToday = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return date === `${y}-${m}-${day}`;
  }, [date]);

  const scheduled = useMemo(
    () => tasks.filter((t) => t.start_time && t.end_time),
    [tasks]
  );

  const bedTargetMin = toMin(bedTarget);

  function pointerMin(e: React.PointerEvent | PointerEvent): number {
    const grid = gridRef.current;
    if (!grid) return START_HOUR * 60;
    const rect = grid.getBoundingClientRect();
    const y = e.clientY - rect.top;
    return Math.max(
      START_HOUR * 60,
      Math.min(END_HOUR * 60, snap(yToMin(y)))
    );
  }

  function handleGridPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const min = pointerMin(e);
    setDrag({ kind: "create", startMin: min, currentMin: min + SNAP_MIN });
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const min = pointerMin(e);
    if (drag.kind === "create") {
      setDrag({ ...drag, currentMin: min });
    } else if (drag.kind === "move") {
      const activated =
        drag.activated ||
        Math.abs(e.clientY - drag.pointerStartClientY) > DRAG_THRESHOLD_PX;
      setDrag({ ...drag, currentMin: min, activated });
    } else if (drag.kind === "resize") {
      if (drag.edge === "top") {
        const newStart = Math.max(
          START_HOUR * 60,
          Math.min(drag.origEnd - SNAP_MIN, min)
        );
        setDrag({ ...drag, currentStart: newStart });
      } else {
        const newEnd = Math.min(
          END_HOUR * 60,
          Math.max(drag.origStart + SNAP_MIN, min)
        );
        setDrag({ ...drag, currentEnd: newEnd });
      }
    }
  }

  function handlePointerUp() {
    if (!drag) return;
    if (drag.kind === "create") {
      const a = Math.min(drag.startMin, drag.currentMin);
      const b = Math.max(drag.startMin, drag.currentMin);
      const startMin = a;
      const endMin = b === a ? b + SNAP_MIN * 2 : b;
      setPendingCreate({ start: toTime(startMin), end: toTime(endMin) });
      setDraftTitle("");
      setDraftImportance("中");
    } else if (drag.kind === "move") {
      if (!drag.activated) {
        const task = tasks.find((t) => t.id === drag.taskId);
        if (task) openEdit(task);
      } else {
        const delta = drag.currentMin - drag.pointerStartMin;
        const newStart = Math.max(START_HOUR * 60, drag.origStart + delta);
        const newEnd = Math.min(END_HOUR * 60, drag.origEnd + delta);
        updateTaskMut.mutate({
          id: drag.taskId,
          patch: {
            start_time: toTime(newStart),
            end_time: toTime(newEnd),
          },
        });
      }
    } else if (drag.kind === "resize") {
      const patch: { start_time?: string; end_time?: string } = {};
      if (drag.edge === "top") {
        patch.start_time = toTime(drag.currentStart);
      } else {
        patch.end_time = toTime(drag.currentEnd);
      }
      updateTaskMut.mutate({ id: drag.taskId, patch });
    }
    setDrag(null);
  }

  function openEdit(task: Task) {
    setEditing(task);
    setEditTitle(task.title);
    setEditImportance(task.importance);
    setEditStart(task.start_time ?? "");
    setEditEnd(task.end_time ?? "");
  }

  function commitEdit() {
    if (!editing) return;
    const title = editTitle.trim();
    if (!title) {
      setEditing(null);
      return;
    }
    const sMin = toMin(editStart);
    const eMin = toMin(editEnd);
    if (sMin == null || eMin == null || eMin <= sMin) {
      return;
    }
    updateTaskMut.mutate({
      id: editing.id,
      patch: {
        title,
        importance: editImportance,
        start_time: editStart,
        end_time: editEnd,
      },
    });
    setEditing(null);
  }

  function commitCreate() {
    if (!pendingCreate || !draftTitle.trim()) {
      setPendingCreate(null);
      return;
    }
    addTaskMut.mutate({
      title: draftTitle.trim(),
      importance: draftImportance,
      scheduled_date: date,
      start_time: pendingCreate.start,
      end_time: pendingCreate.end,
    });
    setPendingCreate(null);
  }

  function startMoveDrag(
    e: React.PointerEvent<HTMLDivElement>,
    task: Task,
    startMin: number,
    endMin: number
  ) {
    e.stopPropagation();
    e.preventDefault();
    const min = pointerMin(e);
    setDrag({
      kind: "move",
      taskId: task.id,
      origStart: startMin,
      origEnd: endMin,
      pointerStartMin: min,
      pointerStartClientY: e.clientY,
      currentMin: min,
      activated: false,
    });
  }

  function startResizeDrag(
    e: React.PointerEvent<HTMLDivElement>,
    task: Task,
    startMin: number,
    endMin: number,
    edge: "top" | "bottom"
  ) {
    e.stopPropagation();
    e.preventDefault();
    setDrag({
      kind: "resize",
      taskId: task.id,
      edge,
      origStart: startMin,
      origEnd: endMin,
      currentStart: startMin,
      currentEnd: endMin,
    });
  }

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = START_HOUR; h <= END_HOUR; h += 1) arr.push(h);
    return arr;
  }, []);

  const gridHeight = ((END_HOUR - START_HOUR) * HOUR_PX);

  return (
    <div className="space-y-3">

      <div className="relative px-5 pb-5 pt-5 select-none">
        <div
          ref={scrollRef}
          className="overflow-y-auto rounded-md border border-slate-200 dark:border-notion-border"
          style={{ maxHeight: VIEWPORT_PX }}
        >
        <div className="flex pt-2">
          <div
            className="text-[10px] muted pr-2 pl-2 flex-shrink-0"
            style={{ width: 56 }}
          >
            {hours.map((h) => (
              <div
                key={h}
                className="text-right tabular-nums"
                style={{ height: HOUR_PX, transform: "translateY(-6px)" }}
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          <div
            ref={gridRef}
            onPointerDown={handleGridPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(DRAG_ID_TYPE)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const rect = gridRef.current!.getBoundingClientRect();
              const y = e.clientY - rect.top;
              const minutesType = e.dataTransfer.types.find((t) =>
                t.startsWith(DRAG_MINUTES_PREFIX)
              );
              const minutes = minutesType
                ? Number(minutesType.slice(DRAG_MINUTES_PREFIX.length))
                : undefined;
              setDropRange(dropTimes(snap(yToMin(y)), minutes));
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              setDropRange(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData(DRAG_ID_TYPE);
              setDropRange(null);
              if (!id) return;
              const rect = gridRef.current!.getBoundingClientRect();
              const y = e.clientY - rect.top;
              // A task with a duration (routine tasks) gets a frame of that
              // length; others keep the previous 60 minutes.
              const dropped = tasks.find((t) => t.id === id);
              const { start, end } = dropTimes(
                snap(yToMin(y)),
                dropped?.planned_minutes
              );
              updateTaskMut.mutate({
                id,
                patch: {
                  start_time: toTime(start),
                  end_time: toTime(end),
                },
              });
            }}
            className="relative flex-1 mr-2 rounded bg-slate-50/40 dark:bg-notion-panel-hover/30 cursor-crosshair touch-none"
            style={{ height: gridHeight }}
          >
            {hours.slice(0, -1).map((h, i) => (
              <div
                key={h}
                className="absolute left-0 right-0 border-t border-slate-200/70 dark:border-notion-border/60"
                style={{ top: i * HOUR_PX }}
              />
            ))}
            {hours.slice(0, -1).map((h, i) => (
              <div
                key={`half-${h}`}
                className="absolute left-0 right-0 border-t border-dashed border-slate-200/40 dark:border-notion-border/30"
                style={{ top: i * HOUR_PX + HOUR_PX / 2 }}
              />
            ))}

            {(() => {
              const resolved = scheduled.map((t) => {
                const sMin = toMin(t.start_time)!;
                const eMin = toMin(t.end_time)!;
                const isMoving =
                  drag?.kind === "move" &&
                  drag.taskId === t.id &&
                  drag.activated;
                const isResizing =
                  drag?.kind === "resize" && drag.taskId === t.id;
                const start = isMoving
                  ? Math.max(
                      START_HOUR * 60,
                      drag.origStart + (drag.currentMin - drag.pointerStartMin)
                    )
                  : isResizing
                  ? drag.currentStart
                  : sMin;
                const end = isMoving
                  ? Math.min(
                      END_HOUR * 60,
                      drag.origEnd + (drag.currentMin - drag.pointerStartMin)
                    )
                  : isResizing
                  ? drag.currentEnd
                  : eMin;
                return { t, sMin, eMin, start, end };
              });
              const layout = packLayout(
                resolved.map((r) => ({ id: r.t.id, start: r.start, end: r.end }))
              );
              return resolved.map(({ t, sMin, eMin, start, end }) => {
                const slot = layout.get(t.id) ?? { col: 0, totalCols: 1 };
                const widthPct = 100 / slot.totalCols;
                const leftPct = slot.col * widthPct;
                return (
                  <TimelineBlock
                    key={t.id}
                    task={t}
                    planColor={planColorOf(t)}
                    top={minToY(start)}
                    height={Math.max(HOUR_PX / 4, minToY(end) - minToY(start))}
                    leftPct={leftPct}
                    widthPct={widthPct}
                    isDragging={
                      drag?.kind === "move" &&
                      drag.taskId === t.id &&
                      drag.activated
                    }
                    onMoveStart={(e) => startMoveDrag(e, t, sMin, eMin)}
                    onResizeTopStart={(e) =>
                      startResizeDrag(e, t, sMin, eMin, "top")
                    }
                    onResizeBottomStart={(e) =>
                      startResizeDrag(e, t, sMin, eMin, "bottom")
                    }
                    onToggle={() => toggleTaskMut(t)}
                    onDelete={() => deleteTaskMut.mutate(t.id)}
                  />
                );
              });
            })()}

            {drag?.kind === "create" && (
              <div
                className="absolute left-1 right-1 rounded border-2 border-dashed border-notion-blue bg-notion-blue/10 pointer-events-none"
                style={{
                  top: minToY(Math.min(drag.startMin, drag.currentMin)),
                  height: Math.max(
                    8,
                    minToY(Math.max(drag.startMin, drag.currentMin)) -
                      minToY(Math.min(drag.startMin, drag.currentMin))
                  ),
                }}
              >
                <div className="text-[10px] text-notion-blue px-1.5 py-0.5 tabular-nums">
                  {toTime(Math.min(drag.startMin, drag.currentMin))} -{" "}
                  {toTime(Math.max(drag.startMin, drag.currentMin))}
                </div>
              </div>
            )}

            {isToday && nowMin >= START_HOUR * 60 && nowMin <= END_HOUR * 60 && (
              <div
                className="absolute left-0 right-0 pointer-events-none z-10"
                style={{ top: minToY(nowMin) }}
              >
                <div className="relative h-0 border-t border-rose-500">
                  <div className="absolute -left-1 -top-1 size-2 rounded-full bg-rose-500" />
                </div>
              </div>
            )}

            {bedTargetMin != null &&
              bedTargetMin >= START_HOUR * 60 &&
              bedTargetMin <= END_HOUR * 60 && (
                <div
                  className="absolute left-0 right-0 pointer-events-none z-10"
                  style={{ top: minToY(bedTargetMin) }}
                >
                  <div className="relative h-0 border-t border-dashed border-indigo-400">
                    <div className="absolute -left-1 -top-1 size-2 rounded-full bg-indigo-400" />
                    <span className="absolute left-2 -top-2.5 text-[10px] leading-none text-indigo-500 bg-white dark:bg-notion-panel px-1 rounded tabular-nums">
                      就寝目標 {bedTarget}
                    </span>
                  </div>
                </div>
              )}

            {dropRange != null && (
              <div
                className="absolute left-1 right-1 rounded border-2 border-dashed border-notion-blue bg-notion-blue/10 pointer-events-none"
                style={{
                  top: minToY(dropRange.start),
                  height: minToY(dropRange.end) - minToY(dropRange.start),
                }}
              >
                <div className="text-[10px] text-notion-blue px-1.5 py-0.5 tabular-nums">
                  {toTime(dropRange.start)} - {toTime(dropRange.end)}
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      {editing && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onClick={() => setEditing(null)}
        >
          <div
            className="card w-[min(92vw,360px)] space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold">予定を編集</div>
            <input
              autoFocus
              className="input"
              placeholder="タイトル"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") setEditing(null);
              }}
            />
            <div className="flex items-center gap-2">
              <input
                type="time"
                className="input flex-1"
                value={editStart}
                onChange={(e) => setEditStart(e.target.value)}
              />
              <span className="text-xs muted">〜</span>
              <input
                type="time"
                className="input flex-1"
                value={editEnd}
                onChange={(e) => setEditEnd(e.target.value)}
              />
            </div>
            <select
              className="input"
              value={editImportance}
              onChange={(e) =>
                setEditImportance(e.target.value as Importance)
              }
            >
              {IMPORTANCE_LIST.map((i) => (
                <option key={i} value={i}>
                  {i} ({i === "重" ? 3 : i === "中" ? 2 : 1}pt)
                </option>
              ))}
            </select>
            <div className="flex justify-between gap-2">
              <button
                type="button"
                className="btn-ghost !py-1 !px-3 text-xs text-rose-500"
                onClick={() => {
                  deleteTaskMut.mutate(editing.id);
                  setEditing(null);
                }}
              >
                削除
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-ghost !py-1 !px-3 text-xs"
                  onClick={() => setEditing(null)}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  className="btn-primary !py-1 !px-3 text-xs"
                  onClick={commitEdit}
                  disabled={!editTitle.trim()}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingCreate && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onClick={() => setPendingCreate(null)}
        >
          <div
            className="card w-[min(92vw,360px)] space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold">新しいタスク</div>
            <div className="text-xs muted tabular-nums">
              {pendingCreate.start} - {pendingCreate.end}
            </div>
            <input
              autoFocus
              className="input"
              placeholder="タイトル"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                if (e.key === "Enter") commitCreate();
                if (e.key === "Escape") setPendingCreate(null);
              }}
            />
            <select
              className="input"
              value={draftImportance}
              onChange={(e) =>
                setDraftImportance(e.target.value as Importance)
              }
            >
              {IMPORTANCE_LIST.map((i) => (
                <option key={i} value={i}>
                  {i} ({i === "重" ? 3 : i === "中" ? 2 : 1}pt)
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-ghost !py-1 !px-3 text-xs"
                onClick={() => setPendingCreate(null)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="btn-primary !py-1 !px-3 text-xs"
                onClick={commitCreate}
                disabled={!draftTitle.trim()}
              >
                追加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineBlock({
  task,
  planColor,
  top,
  height,
  leftPct,
  widthPct,
  isDragging,
  onMoveStart,
  onResizeTopStart,
  onResizeBottomStart,
  onToggle,
  onDelete,
}: {
  task: Task;
  planColor?: string;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
  isDragging: boolean;
  onMoveStart: (e: React.PointerEvent<HTMLDivElement>) => void;
  onResizeTopStart: (e: React.PointerEvent<HTMLDivElement>) => void;
  onResizeBottomStart: (e: React.PointerEvent<HTMLDivElement>) => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const handleSize = Math.min(10, Math.max(6, Math.floor(height / 4)));
  return (
    <div
      className={
        "group absolute rounded-md border px-2 py-1 text-xs shadow-sm overflow-hidden " +
        (isDragging ? "cursor-grabbing " : "cursor-default ") +
        IMPORTANCE_COLOR[task.importance] +
        (task.completed ? " opacity-60" : "")
      }
      style={{
        top,
        height,
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        ...(planColor
          ? { borderLeftColor: planColor, borderLeftWidth: 3 }
          : {}),
      }}
      onPointerDown={onMoveStart}
    >
      <div className="flex items-start gap-1.5">
        <input
          type="checkbox"
          className="size-3.5 rounded accent-notion-blue cursor-pointer mt-0.5"
          checked={task.completed}
          onChange={onToggle}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        />
        <div className="flex-1 min-w-0">
          <div
            className={
              "truncate font-medium " +
              (task.completed ? "line-through" : "")
            }
          >
            {task.title}
          </div>
          {height > 32 && (
            <div className="text-[10px] opacity-70 tabular-nums">
              {task.start_time} - {task.end_time}
            </div>
          )}
        </div>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 transition text-current/60 hover:text-rose-500 text-[11px] leading-none"
          aria-label="Delete"
        >
          ✕
        </button>
      </div>
      <div
        className="absolute left-0 right-0 top-0 cursor-ns-resize flex items-start justify-center"
        style={{ height: handleSize }}
        onPointerDown={onResizeTopStart}
      >
        <div className="h-1 w-8 rounded-full bg-current/40 opacity-0 group-hover:opacity-100 transition mt-0.5" />
      </div>
      <div
        className="absolute left-0 right-0 bottom-0 cursor-ns-resize flex items-end justify-center"
        style={{ height: handleSize }}
        onPointerDown={onResizeBottomStart}
      >
        <div className="h-1 w-8 rounded-full bg-current/40 opacity-0 group-hover:opacity-100 transition mb-0.5" />
      </div>
    </div>
  );
}

export function UnscheduledPanel({
  tasks,
  className = "",
}: {
  tasks: Task[];
  className?: string;
}) {
  const deleteTaskMut = useDeleteTask();
  const toggleTaskMut = useToggleTask();
  const unscheduled = useMemo(
    () => tasks.filter((t) => !t.start_time || !t.end_time),
    [tasks]
  );

  if (unscheduled.length === 0) return null;

  return (
    <aside className={"flex flex-col " + className}>
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-notion-border flex-shrink-0">
        <div>
          <div className="text-xs uppercase tracking-wide muted">時刻未設定</div>
          <div className="text-[11px] muted mt-0.5">タイムラインへドラッグ</div>
        </div>
        <span className="text-xs muted tabular-nums">{unscheduled.length}</span>
      </header>
      <ul className="divide-y divide-slate-100 dark:divide-notion-border overflow-y-auto flex-1 min-h-0">
        {unscheduled.map((t) => (
          <li
            key={t.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_ID_TYPE, t.id);
              if (t.planned_minutes) {
                e.dataTransfer.setData(
                  DRAG_MINUTES_PREFIX + t.planned_minutes,
                  ""
                );
              }
              e.dataTransfer.effectAllowed = "move";
            }}
            className={
              "group flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-notion-panel-hover transition cursor-grab active:cursor-grabbing"
            }
          >
            <span
              className="text-slate-300 dark:text-notion-muted text-xs select-none"
              aria-hidden
            >
              ⋮⋮
            </span>
            <input
              type="checkbox"
              className="size-3.5 rounded accent-notion-blue cursor-pointer"
              checked={t.completed}
              onChange={() => toggleTaskMut(t)}
              onPointerDown={(e) => e.stopPropagation()}
            />
            <span
              className={
                "inline-block w-1.5 h-4 rounded-sm flex-shrink-0 " +
                (t.importance === "重"
                  ? "bg-rose-400"
                  : t.importance === "中"
                  ? "bg-amber-400"
                  : "bg-slate-300 dark:bg-notion-border")
              }
              aria-hidden
            />
            <span
              className={
                "flex-1 min-w-0 truncate " +
                (t.completed ? "line-through muted" : "")
              }
            >
              {t.title}
            </span>
            {t.planned_minutes ? (
              <span className="text-[11px] muted tabular-nums flex-shrink-0">
                {formatMinutes(t.planned_minutes)}
              </span>
            ) : null}
            <button
              type="button"
              className="text-slate-300 dark:text-notion-muted hover:text-rose-500 opacity-0 group-hover:opacity-100 transition text-xs"
              onClick={() => deleteTaskMut.mutate(t.id)}
              aria-label="Delete"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
