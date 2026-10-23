import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { IMPORTANCE_WEIGHT, type BacklogItem, type Task } from "@/types";

// Pure helpers for the to-do list (やることリスト, Issue #83). No Supabase
// access here so they can be unit tested (see logic.test.ts).

/** Importance (重 → 軽), then the nearest deadline (none last), then oldest first. */
export function sortBacklog(items: readonly BacklogItem[]): BacklogItem[] {
  return [...items].sort(
    (a, b) =>
      IMPORTANCE_WEIGHT[b.importance] - IMPORTANCE_WEIGHT[a.importance] ||
      (a.deadline ?? "9999-12-31").localeCompare(b.deadline ?? "9999-12-31") ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id)
  );
}

/** Items go to today or a later day; a past day's score must not change. */
export function canScheduleOn(date: string, today: string): boolean {
  return date >= today;
}

/**
 * Whether a task can go back to the list (same rules as unschedule_task):
 * an unfinished hand task of today or later. Plan schedules, routine tasks,
 * carried copies and milestones stay where they are.
 */
export function canUnschedule(task: Task, today: string): boolean {
  return (
    !task.completed &&
    !task.plan_id &&
    !task.from_routine &&
    !task.routine_id &&
    !task.carried_from &&
    !task.is_milestone &&
    task.scheduled_date >= today
  );
}

export type DeadlineState = "overdue" | "today" | "soon" | "later";

/** "soon" = within 3 days. */
export function deadlineState(deadline: string, today: string): DeadlineState {
  const days = differenceInCalendarDays(parseISO(deadline), parseISO(today));
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  return days <= 3 ? "soon" : "later";
}

/** "期限切れ 10/20" / "今日まで" / "あと2日 10/25" / "10/30まで" */
export function deadlineLabel(deadline: string, today: string): string {
  const md = format(parseISO(deadline), "M/d");
  const days = differenceInCalendarDays(parseISO(deadline), parseISO(today));
  if (days < 0) return `期限切れ ${md}`;
  if (days === 0) return "今日まで";
  if (days <= 3) return `あと${days}日 ${md}`;
  return `${md}まで`;
}

/** "今日" or "10/24". */
export function dayName(date: string, today: string): string {
  return date === today ? "今日" : format(parseISO(date), "M/d");
}
