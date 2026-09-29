import { getISODay, parseISO, differenceInCalendarDays, format } from "date-fns";
import { addDaysISO } from "@/lib/date";
import type { Phase, Plan, PlanColor, PlanStatus, Routine, Task } from "@/types";
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

export function isDateInPhase(phase: Phase, date: string): boolean {
  if (phase.is_implicit) return true;
  return !!phase.start_date && !!phase.end_date &&
    phase.start_date <= date && date <= phase.end_date;
}

/** The phase that contains `date`; the implicit phase always matches. */
export function phaseForDate(phases: Phase[], date: string): Phase | undefined {
  return phases.find((p) => isDateInPhase(p, date));
}

export function sortedPhases(phases: Phase[]): Phase[] {
  return [...phases].sort((a, b) =>
    (a.start_date ?? "").localeCompare(b.start_date ?? "")
  );
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

const WEEKDAY_CHARS = ["月", "火", "水", "木", "金", "土", "日"];

export function weekdaysLabel(weekdays: number[]): string {
  const days = [...new Set(weekdays)].sort((a, b) => a - b);
  const key = days.join(",");
  if (key === "1,2,3,4,5,6,7") return "毎日";
  if (key === "1,2,3,4,5") return "平日";
  if (key === "6,7") return "土日";
  return days.map((d) => WEEKDAY_CHARS[d - 1]).join("");
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
    if (t.plan_id !== planId || !t.routine_id) continue;
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
 * Like the existing timeline, the start is kept at least an hour before
 * midnight and the end is clamped to 24:00 instead of wrapping to the next day.
 */
export function dropTimes(
  startMin: number,
  plannedMinutes?: number | null
): { start: number; end: number } {
  const start = Math.max(0, Math.min(DAY_MIN - DROP_DEFAULT_MIN, startMin));
  const dur = plannedMinutes && plannedMinutes > 0 ? plannedMinutes : DROP_DEFAULT_MIN;
  return { start, end: Math.min(DAY_MIN, start + dur) };
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
  const s = parseISO(plan.created_at);
  const e = plan.completed_at ? parseISO(plan.completed_at) : undefined;
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
  siblings: Phase[],
  selfId?: string
): Errors<"name" | "start_date" | "end_date"> {
  const e: Errors<"name" | "start_date" | "end_date"> = {};
  if (len(v.name) < 1) e.name = "名前を入力してください";
  else if (len(v.name) > 30) e.name = "名前は30文字までです";
  if (!v.start_date) e.start_date = "開始日を入力してください";
  if (!v.end_date) e.end_date = "終了日を入力してください";
  if (v.start_date && v.end_date) {
    if (v.start_date > v.end_date) {
      e.end_date = "終了日は開始日以降にしてください";
    } else {
      const clash = siblings.find(
        (p) =>
          !p.is_implicit &&
          p.id !== selfId &&
          p.start_date! <= v.end_date &&
          v.start_date <= p.end_date!
      );
      if (clash) e.start_date = `「${clash.name}」の期間と重なっています`;
    }
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
  if (len(v.title) < 1) e.title = "タイトルを入力してください";
  else if (len(v.title) > 40) e.title = "タイトルは40文字までです";
  if (!Number.isInteger(v.minutes) || v.minutes < 5 || v.minutes > 600 ||
      v.minutes % 5 !== 0) {
    e.minutes = "所要時間は5〜600分の5分刻みで入力してください";
  }
  if (v.weekdays.length < 1) e.weekdays = "曜日を1つ以上選んでください";
  if (len(v.menu) > 2000) e.menu = "メニューは2000文字までです";
  return e;
}

export const hasErrors = (e: object) => Object.keys(e).length > 0;
