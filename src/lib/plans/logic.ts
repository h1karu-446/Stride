import { ISO_WEEKDAY_CHAR, ISO_WEEKDAYS_IN_ORDER } from "@/lib/calendar";
import { getISODay, parseISO, differenceInCalendarDays, format } from "date-fns";
import { addDaysISO } from "@/lib/date";
import type {
  Material,
  MaterialStatus,
  Phase,
  Plan,
  PlanColor,
  PlanStatus,
  Routine,
  Task,
} from "@/types";
import type { AddTaskInput } from "@/lib/queries";
import { PLAN_COLORS } from "./colors";

// Pure helpers for the plan screens. No Supabase access here so they can be
// unit tested (see logic.test.ts).

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  idea: "構想中",
  active: "進行中",
  paused: "休止中",
  done: "完了",
};

// --- phases ------------------------------------------------------------

/** Same rule as generate_routine_tasks: a completed phase ends on its completion day. */
export function isDateInPhase(phase: Phase, date: string): boolean {
  if (phase.is_implicit) return true;
  return !!phase.start_date && !!phase.end_date &&
    phase.start_date <= date && date <= phase.end_date &&
    (!phase.completed_at || date <= phase.completed_at);
}

/** All phases covering `date`; overlapping phases can run together. */
export function phasesForDate(phases: Phase[], date: string): Phase[] {
  return sortedPhases(phases).filter((p) => isDateInPhase(p, date));
}

/** The first phase covering `date`, used only as an initial selection. */
export function phaseForDate(phases: Phase[], date: string): Phase | undefined {
  return phasesForDate(phases, date)[0];
}

export function sortedPhases(phases: Phase[]): Phase[] {
  return [...phases].sort((a, b) =>
    (a.start_date ?? "").localeCompare(b.start_date ?? "")
  );
}

export type PhaseDragEdge = "move" | "start" | "end";

/** Preview a day-granularity timeline adjustment without crossing its own edge. */
export function phaseDatesAfterDrag(
  start: string, end: string, edge: PhaseDragEdge, days: number
): { start_date: string; end_date: string } {
  if (edge === "move") return { start_date: addDaysISO(start, days), end_date: addDaysISO(end, days) };
  if (edge === "start") return { start_date: [addDaysISO(start, days), end].sort()[0], end_date: end };
  return { start_date: start, end_date: [start, addDaysISO(end, days)].sort()[1] };
}

/** Initial selection on the detail screen (spec 4.2). */
export function initialPhase(phases: Phase[], today: string): Phase | undefined {
  const sorted = sortedPhases(phases);
  const current = phaseForDate(sorted, today);
  if (current) return current;
  const upcoming = sorted.find((p) => (p.start_date ?? "") > today);
  return upcoming ?? sorted[sorted.length - 1];
}

/** Elapsed share of a phase (0..1) for the progress bar. */
export function phaseProgress(phase: Phase, today: string): number {
  if (!phase.start_date || !phase.end_date) return 0;
  const total = differenceInCalendarDays(
    parseISO(phase.end_date), parseISO(phase.start_date)) + 1;
  const elapsed = differenceInCalendarDays(
    parseISO(today), parseISO(phase.start_date)) + 1;
  return Math.min(1, Math.max(0, elapsed / total));
}

// --- routines ----------------------------------------------------------


export function weekdaysLabel(weekdays: number[]): string {
  const days = [...new Set(weekdays)].sort((a, b) => a - b);
  const key = days.join(",");
  if (key === "1,2,3,4,5,6,7") return "毎日";
  if (key === "1,2,3,4,5") return "平日";
  if (key === "6,7") return "土日";
  // Sunday first, like the calendars.
  return ISO_WEEKDAYS_IN_ORDER.filter((d) => days.includes(d)).map((d) => ISO_WEEKDAY_CHAR[d]).join("");
}

export function isoWeekday(date: string): number {
  return getISODay(parseISO(date));
}

/** Routines that generate_routine_tasks would create for `date` (BR-02). */
export function routinesForDate(plan: Plan, date: string): Routine[] {
  if (plan.status !== "active") return [];
  const wd = isoWeekday(date);
  return plan.phases
    .filter((ph) => isDateInPhase(ph, date))
    .flatMap((ph) => ph.routines)
    .filter((r) => r.weekdays.includes(wd));
}

export interface TodaySummary {
  totalMinutes: number;
  byPlan: { plan: Plan; minutes: number }[];
}

export function todaySummary(plans: Plan[], today: string): TodaySummary {
  const byPlan = plans
    .map((plan) => ({
      plan,
      minutes: routinesForDate(plan, today).reduce((s, r) => s + r.minutes, 0),
    }))
    .filter((x) => x.minutes > 0);
  return {
    totalMinutes: byPlan.reduce((s, x) => s + x.minutes, 0),
    byPlan,
  };
}

/** 180 -> "3h00m", 45 -> "45m" */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return `${h}h${String(m).padStart(2, "0")}m`;
}

function clockMinutes(time?: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * How long a task takes, for the compact label in the list and timeline
 * (Issue #59). A placed task uses the length of its frame (end - start) so
 * the label matches what the timeline shows; otherwise the routine's
 * planned_minutes. null when neither is known.
 */
export function taskDurationMinutes(
  task: Pick<Task, "start_time" | "end_time" | "planned_minutes">
): number | null {
  const start = clockMinutes(task.start_time);
  const end = clockMinutes(task.end_time);
  if (start != null && end != null && end > start) return end - start;
  if (task.planned_minutes && task.planned_minutes > 0) {
    return task.planned_minutes;
  }
  return null;
}

// --- execution squares (BR-06) ----------------------------------------

export type CellState = "done" | "missed" | "today" | "none";

export interface Cell {
  date: string;
  state: CellState;
}

export interface Execution {
  cells: Cell[];
  done: number;
  target: number;
}

/** Last `days` days ending today, oldest first. */
export function executionCells(
  tasks: Task[],
  planId: string,
  today: string,
  days: number
): Execution {
  const byDate = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.plan_id !== planId || !t.from_routine) continue;
    const list = byDate.get(t.scheduled_date) ?? [];
    list.push(t);
    byDate.set(t.scheduled_date, list);
  }
  const cells: Cell[] = [];
  let done = 0;
  let target = 0;
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = addDaysISO(today, -i);
    const list = byDate.get(date);
    let state: CellState;
    if (!list || list.length === 0) state = "none";
    else if (list.every((t) => t.completed)) state = "done";
    else state = date === today ? "today" : "missed";
    // "today" that is already fully done still counts as done in the square,
    // but is excluded from the tallies below (spec BR-06).
    if (date !== today) {
      if (state === "done") { done += 1; target += 1; }
      else if (state === "missed") target += 1;
    }
    cells.push({ date, state });
  }
  return { cells, done, target };
}

// --- Today: task rows and timeline (spec 4.3) ---------------------------

/** One-line summary of a memo: line breaks become " / ", blank lines dropped. */
export function memoOneLine(memo?: string | null): string {
  if (!memo) return "";
  return memo
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join(" / ");
}

const DAY_MIN = 24 * 60;
const DROP_DEFAULT_MIN = 60;

/**
 * Start / end minutes (from 00:00) for a task dropped on the timeline.
 * The end is start + plannedMinutes (60 when the task has none, as before).
 * Keep the entire duration within this day. A late drop moves its start
 * earlier just enough to finish at midnight, as shown by the preview.
 */
export function dropTimes(
  startMin: number,
  plannedMinutes?: number | null
): { start: number; end: number } {
  const dur = plannedMinutes && plannedMinutes > 0 ? plannedMinutes : DROP_DEFAULT_MIN;
  const boundedDur = Math.min(DAY_MIN, dur);
  const start = Math.max(0, Math.min(DAY_MIN - boundedDur, startMin));
  return { start, end: start + boundedDur };
}

// --- dates -------------------------------------------------------------

export function formatDateLabel(date: string, today: string): string {
  if (date === today) return "今日";
  const d = parseISO(date);
  if (d.getFullYear() === parseISO(today).getFullYear()) {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export function daysLeftLabel(due: string, today: string): string {
  const n = differenceInCalendarDays(parseISO(due), parseISO(today));
  if (n > 0) return `あと ${n}日`;
  if (n === 0) return "今日が期日";
  return "期日を過ぎています";
}

export function shouldShowOverdueNotice(plan: Plan, today: string): boolean {
  return (
    plan.status === "active" &&
    !!plan.due_date &&
    plan.due_date < today &&
    plan.overdue_notice_dismissed_for !== plan.due_date
  );
}

// --- lists -------------------------------------------------------------

export function defaultPlanColor(plans: Plan[]): PlanColor {
  const used = new Set(
    plans.filter((p) => p.status === "active").map((p) => p.color)
  );
  return PLAN_COLORS.find((c) => !used.has(c.key))?.key ?? "pink";
}

/** Due date ascending, no due date last, then oldest first. */
export function sortActivePlans(plans: Plan[]): Plan[] {
  return [...plans].sort((a, b) => {
    if (a.due_date && b.due_date && a.due_date !== b.due_date) {
      return a.due_date.localeCompare(b.due_date);
    }
    if (a.due_date && !b.due_date) return -1;
    if (!a.due_date && b.due_date) return 1;
    return a.created_at.localeCompare(b.created_at);
  });
}

/** paused / idea: recently updated first. done: recently completed first. */
export function sortInactivePlans(plans: Plan[], status: PlanStatus): Plan[] {
  const key = (p: Plan) =>
    status === "done" ? p.completed_at ?? "" : p.updated_at;
  return [...plans].sort((a, b) => key(b).localeCompare(key(a)));
}

/** "2026/4 – 8" style span from creation month to completion month. */
export function planSpanLabel(plan: Plan): string {
  return spanLabel(plan.created_at, plan.completed_at);
}

/**
 * Shared by Plans and Journey so both show the same span. `startedAt` is a
 * timestamptz string read in the device's time zone (not its UTC date);
 * `completedOn` is a yyyy-MM-dd date.
 */
export function spanLabel(startedAt: string, completedOn?: string | null): string {
  const s = parseISO(startedAt);
  const e = completedOn ? parseISO(completedOn) : undefined;
  if (!e) return format(s, "yyyy/M");
  if (s.getFullYear() === e.getFullYear()) {
    return s.getMonth() === e.getMonth()
      ? format(s, "yyyy/M")
      : `${format(s, "yyyy/M")} – ${e.getMonth() + 1}`;
  }
  return `${format(s, "yyyy/M")} – ${format(e, "yyyy/M")}`;
}

// --- validation (spec 6) ----------------------------------------------

const len = (s: string | undefined) => (s ?? "").trim().length;

export type Errors<K extends string> = Partial<Record<K, string>>;

export function validatePlan(v: {
  name: string;
  goal?: string;
  goal_note?: string;
}): Errors<"name" | "goal" | "goal_note"> {
  const e: Errors<"name" | "goal" | "goal_note"> = {};
  if (len(v.name) < 1) e.name = "計画名を入力してください";
  else if (len(v.name) > 40) e.name = "計画名は40文字までです";
  if (len(v.goal) > 60) e.goal = "目標は60文字までです";
  if ((v.goal ?? "").includes("\n")) e.goal = "目標は1行で入力してください";
  if (len(v.goal_note) > 1000) e.goal_note = "補足は1000文字までです";
  return e;
}

export function validatePhase(
  v: { name: string; start_date: string; end_date: string },
  completedAt?: string
): Errors<"name" | "start_date" | "end_date"> {
  const e: Errors<"name" | "start_date" | "end_date"> = {};
  if (len(v.name) < 1) e.name = "名前を入力してください";
  else if (len(v.name) > 30) e.name = "名前は30文字までです";
  if (!v.start_date) e.start_date = "開始日を入力してください";
  if (!v.end_date) e.end_date = "終了日を入力してください";
  if (v.start_date && v.end_date) {
    if (v.start_date > v.end_date) {
      e.end_date = "終了日は開始日以降にしてください";
    }
  }
  // Same as the DB check phases_completed_at_shape.
  if (completedAt && v.start_date && v.start_date > completedAt && !e.start_date) {
    e.start_date = `完了した日（${format(parseISO(completedAt), "M/d")}）より後には開始日を移せません。先に完了を取り消してください`;
  }
  return e;
}

export function validateRoutine(v: {
  title: string;
  minutes: number;
  weekdays: number[];
  menu?: string;
}): Errors<"title" | "minutes" | "weekdays" | "menu"> {
  const e: Errors<"title" | "minutes" | "weekdays" | "menu"> = {};
  if (len(v.title) < 1) e.title = "メニューを入力してください";
  else if (len(v.title) > 40) e.title = "メニューは40文字までです";
  if (!Number.isInteger(v.minutes) || v.minutes < 5 || v.minutes > 600 ||
      v.minutes % 5 !== 0) {
    e.minutes = "所要時間は5〜600分の5分刻みで入力してください";
  }
  if (v.weekdays.length < 1) e.weekdays = "曜日を1つ以上選んでください";
  if (len(v.menu) > 2000) e.menu = "メニューの詳細は2000文字までです";
  return e;
}

export const hasErrors = (e: object) => Object.keys(e).length > 0;

// --- schedules (予定, spec 4.2 / BR-04) --------------------------------

/**
 * A plan's schedules are its tasks that were not generated from a routine.
 * from_routine, not routine_id: deleting a menu clears routine_id (migration 0021).
 */
export function planSchedules(tasks: Task[], planId: string): Task[] {
  return tasks.filter((t) => t.plan_id === planId && !t.from_routine);
}

/**
 * Ids of tasks that have been carried over: some task was copied from them
 * (tasks.carried_from, BR-04). Pass every task, not just one plan's.
 */
export function carriedIds(tasks: Task[]): Set<string> {
  const ids = new Set<string>();
  for (const t of tasks) if (t.carried_from) ids.add(t.carried_from);
  return ids;
}

/** Past and open, and not carried over yet (a carried one is handled). */
export function isOverdue(
  task: Task,
  today: string,
  carried: Set<string> = new Set()
): boolean {
  return !task.completed && task.scheduled_date < today && !carried.has(task.id);
}

/**
 * A schedule dated before today. Only its title can change: importance,
 * date, milestone, completion and deletion would change that day's score or
 * record (BR-04). Routine tasks and manual tasks are not schedules.
 */
export function isLockedSchedule(task: Task, today: string): boolean {
  return !!task.plan_id && !task.from_routine && task.scheduled_date < today;
}

/** An overdue schedule that can still be carried over (once per original). */
export function canCarryOver(
  task: Task,
  today: string,
  carried: Set<string> = new Set()
): boolean {
  return isLockedSchedule(task, today) && isOverdue(task, today, carried);
}

/**
 * A new open task on `date` with the same content as `task` (BR-04: carrying
 * over copies; the original stays on its day). Times are not copied because
 * they belonged to the original day.
 */
export function carryOverInput(task: Task, date: string): AddTaskInput {
  return {
    title: task.title,
    importance: task.importance,
    scheduled_date: date,
    memo: task.memo,
    plan_id: task.plan_id,
    is_milestone: task.is_milestone,
    planned_minutes: task.planned_minutes,
    carried_from: task.id,
  };
}

/**
 * The original already has a copy: a unique violation (23505) of
 * tasks_carried_from_uniq. Other unique violations are real failures.
 */
export function isAlreadyCarried(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const { code, message, details } = e as {
    code?: unknown; message?: unknown; details?: unknown;
  };
  if (code !== "23505") return false;
  return [message, details].some(
    (s) => typeof s === "string" && s.includes("tasks_carried_from_uniq")
  );
}

/**
 * One carry-over click: insert the copy, then reload the list (awaited, so
 * the row is closed before its button comes back). `failed` is false when
 * the copy already existed (isAlreadyCarried). Never rejects.
 */
export async function carryOverOnce(
  insert: () => Promise<unknown>,
  refresh: () => Promise<unknown>
): Promise<{ failed: boolean }> {
  let failed = false;
  try {
    await insert();
  } catch (e) {
    failed = !isAlreadyCarried(e);
  }
  try {
    await refresh();
  } catch {
    // A failed reload leaves the list as it was; the next load fixes it.
  }
  return { failed };
}

/** A copy of `set` with `id` added (`on`) or removed. */
export function withId(set: ReadonlySet<string>, id: string, on: boolean): ReadonlySet<string> {
  if (set.has(id) === on) return set;
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

export interface ScheduleValues {
  title: string;
  scheduled_date: string;
  importance: Task["importance"];
  is_milestone: boolean;
}

export interface ScheduleSave {
  /** Update of the saved task. Absent when nothing may or did change. */
  patch?: Partial<Task>;
  /** A carried-over copy to insert. */
  copy?: AddTaskInput;
}

/**
 * What saving the edit form of an existing schedule writes. A locked (past)
 * schedule only ever sends its title. For an overdue one that has not been
 * carried yet, choosing a date from today on makes a copy on that date
 * instead of moving it (BR-04).
 */
export function planScheduleSave(
  task: Task,
  v: ScheduleValues,
  today: string,
  carried: Set<string> = new Set()
): ScheduleSave {
  if (!isLockedSchedule(task, today)) {
    return {
      patch: {
        title: v.title,
        scheduled_date: v.scheduled_date,
        importance: v.importance,
        is_milestone: v.is_milestone,
      },
    };
  }
  const out: ScheduleSave = {};
  if (v.title !== task.title) out.patch = { title: v.title };
  if (
    canCarryOver(task, today, carried) &&
    v.scheduled_date !== task.scheduled_date &&
    v.scheduled_date >= today
  ) {
    out.copy = carryOverInput({ ...task, title: v.title }, v.scheduled_date);
  }
  return out;
}

export const SCHEDULE_LIMIT = 3;

export interface ScheduleGroups {
  /** Open schedules to show: overdue (oldest first) -> today -> future. */
  visible: Task[];
  /** Open schedules folded into "他 N件". */
  hidden: Task[];
  /**
   * Closed schedules, newest date first: completed ones and past ones that
   * were carried over ("完了 N · 持ち越し M").
   */
  done: Task[];
  /** How many of `done` were carried over rather than completed. */
  carriedCount: number;
}

const byDateThenCreated = (a: Task, b: Task) =>
  a.scheduled_date.localeCompare(b.scheduled_date) ||
  a.created_at.localeCompare(b.created_at);

/**
 * Open schedules sorted by date ascending, which is exactly overdue (oldest
 * first), today, then future (nearest first). The first `limit` are visible.
 * A schedule's completion date is its own date (BR-04). An open schedule
 * that was carried over is closed: its copy is the open one. `carried`
 * defaults to carriedIds over the given tasks.
 */
export function scheduleGroups(
  tasks: Task[],
  planId: string,
  limit = SCHEDULE_LIMIT,
  carried: Set<string> = carriedIds(tasks)
): ScheduleGroups {
  const all = planSchedules(tasks, planId);
  const isClosed = (t: Task) => t.completed || carried.has(t.id);
  const open = all.filter((t) => !isClosed(t)).sort(byDateThenCreated);
  const done = all.filter(isClosed).sort((a, b) => byDateThenCreated(b, a));
  return {
    visible: open.slice(0, limit),
    hidden: open.slice(limit),
    done,
    carriedCount: done.filter((t) => !t.completed).length,
  };
}

/**
 * The schedule shown on a plan card (spec 4.1): the oldest overdue one, else
 * the nearest open one. undefined means "予定なし". Carried-over originals
 * are skipped; their copies count instead.
 */
export function nextSchedule(
  tasks: Task[],
  planId: string,
  today: string
): { task: Task; overdue: boolean } | undefined {
  const carried = carriedIds(tasks);
  const first = scheduleGroups(tasks, planId, 1, carried).visible[0];
  return first
    ? { task: first, overdue: isOverdue(first, today, carried) }
    : undefined;
}

// --- materials (教材, spec 4.2 / BR-05) --------------------------------

export const MATERIAL_STATUS_LABEL: Record<MaterialStatus, string> = {
  todo: "未着手",
  in_progress: "使用中",
  done: "完了",
};

/** The order of the status menu and the edit form (BR-05). */
export const MATERIAL_STATUSES: readonly MaterialStatus[] = ["todo", "in_progress", "done"];

/** Longest 「学ぶこと・メモ」 (materials.note, migration 0017). */
export const MATERIAL_NOTE_MAX = 1000;

/**
 * The row update for choosing `status` directly (BR-05): `done` records the
 * device's local date as the completion date, anything else clears it.
 */
export function materialStatusPatch(
  status: MaterialStatus,
  today: string
): { status: MaterialStatus; completed_at: string | null } {
  return { status, completed_at: status === "done" ? today : null };
}

export interface MaterialGroups {
  /** Linked to the selected phase or to no phase: in use -> todo -> added. */
  main: Material[];
  /** Not done, linked only to other phases ("他のフェーズ N"). */
  otherPhases: Material[];
  /** Done, most recently completed first ("完了 N"). */
  done: Material[];
}

/**
 * `selectedPhaseId` is the phase selected on the detail screen. Pass undefined
 * when the plan only has the implicit phase: every open material is then main.
 */
export function materialGroups(
  materials: Material[],
  selectedPhaseId: string | undefined
): MaterialGroups {
  const rank = (m: Material) => (m.status === "in_progress" ? 0 : 1);
  const open = materials
    .filter((m) => m.status !== "done")
    .sort((a, b) => rank(a) - rank(b) || a.created_at.localeCompare(b.created_at));
  const isMain = (m: Material) =>
    m.phase_ids.length === 0 ||
    !selectedPhaseId ||
    m.phase_ids.includes(selectedPhaseId);
  const done = materials
    .filter((m) => m.status === "done")
    .sort(
      (a, b) =>
        (b.completed_at ?? "").localeCompare(a.completed_at ?? "") ||
        b.created_at.localeCompare(a.created_at)
    );
  return {
    main: open.filter(isMain),
    otherPhases: open.filter((m) => !isMain(m)),
    done,
  };
}

/**
 * Phases a material may be linked to: the plan's own non-implicit phases.
 * Any other id is dropped (the DB does not enforce the same-plan rule).
 */
export function linkablePhaseIds(ids: string[], phases: Phase[]): string[] {
  const allowed = new Set(phases.filter((p) => !p.is_implicit).map((p) => p.id));
  return [...new Set(ids)].filter((id) => allowed.has(id));
}

// --- validation: schedules and materials (spec 6) ----------------------

/**
 * `originalDate` is the saved date when editing: keeping it is allowed even if
 * it is already past (an overdue schedule can be renamed without moving it),
 * but a new past date cannot be chosen (BR-04).
 */
export function validateSchedule(
  v: { title: string; scheduled_date: string },
  today: string,
  originalDate?: string
): Errors<"title" | "scheduled_date"> {
  const e: Errors<"title" | "scheduled_date"> = {};
  if (len(v.title) < 1) e.title = "タイトルを入力してください";
  else if (len(v.title) > 100) e.title = "タイトルは100文字までです";
  if (!v.scheduled_date) e.scheduled_date = "日付を入力してください";
  else if (v.scheduled_date < today && v.scheduled_date !== originalDate) {
    e.scheduled_date = "今日以降の日付を選んでください";
  }
  return e;
}

export function validateMaterial(v: {
  title: string;
  url?: string;
  note?: string;
}): Errors<"title" | "url" | "note"> {
  const e: Errors<"title" | "url" | "note"> = {};
  if (len(v.title) < 1) e.title = "タイトルを入力してください";
  else if (len(v.title) > 100) e.title = "タイトルは100文字までです";
  const url = (v.url ?? "").trim();
  if (url && !/^https?:\/\/\S+$/.test(url)) {
    e.url = "http:// か https:// で始まるURLを入力してください";
  }
  if (len(v.note ?? "") > MATERIAL_NOTE_MAX) {
    e.note = `メモは${MATERIAL_NOTE_MAX}文字までです`;
  }
  return e;
}
