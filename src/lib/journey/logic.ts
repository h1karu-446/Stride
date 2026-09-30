import { addMonths, format, parseISO, startOfMonth } from "date-fns";
import { rangeBefore } from "@/lib/date";
import { streakCount } from "@/lib/score";
import { IMPORTANCE_LIST } from "@/types";
import type { Achievement, AchievementKind, DailyReview, Wish } from "@/types";

export const ACHIEVEMENT_STYLE: Record<AchievementKind, { icon: string; className: string; prominent: boolean }> = {
  wish: { icon: "★", className: "text-amber-600 dark:text-amber-400 font-bold", prominent: true },
  plan: { icon: "🏆", className: "text-blue-600 dark:text-blue-400 font-bold", prominent: true },
  milestone: { icon: "◇", className: "text-slate-500 dark:text-notion-muted", prominent: false },
  material: { icon: "▤", className: "text-slate-500 dark:text-notion-muted", prominent: false },
};

// A wish whose emphasis is turned off looks like the other quiet records.
const QUIET_WISH_STYLE = { icon: "☆", className: "text-slate-500 dark:text-notion-muted", prominent: false };

export function achievementStyle(row: Pick<Achievement, "kind" | "emphasized">) {
  return row.kind === "wish" && row.emphasized === false ? QUIET_WISH_STYLE : ACHIEVEMENT_STYLE[row.kind];
}

// The wish to fill an edit form with: only data that has finished loading, never
// a cached copy that is being refetched (it may predate a ★/☆ toggle).
export function freshWish(query: { data?: Wish; isFetching: boolean }): Wish | null {
  return query.isFetching ? null : query.data ?? null;
}

// Pending wishes: 重 → 中 → 軽, keeping the added order within each level.
export function sortWishes(wishes: Wish[]): Wish[] {
  return [...wishes].sort((a, b) => IMPORTANCE_LIST.indexOf(a.importance) - IMPORTANCE_LIST.indexOf(b.importance));
}

export function groupAchievements(rows: Achievement[]): [string, Achievement[]][] {
  const groups = new Map<string, Achievement[]>();
  for (const row of [...rows].sort((a, b) => b.achieved_on.localeCompare(a.achieved_on) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id))) {
    const month = row.achieved_on.slice(0, 7);
    groups.set(month, [...(groups.get(month) ?? []), row]);
  }
  return [...groups];
}

export function achievementRange(today: string, months: number) {
  const month = startOfMonth(parseISO(today));
  return { from: format(addMonths(month, 1 - months), "yyyy-MM-dd"), to: format(addMonths(month, 1), "yyyy-MM-dd") };
}

export function monthlyAverage(reviews: DailyReview[], month: string): number | null {
  const rows = reviews.filter((r) => r.date.startsWith(month) && Number.isFinite(r.total_score));
  return rows.length ? Math.floor(rows.reduce((sum, r) => sum + r.total_score, 0) / rows.length) : null;
}

export function annualAchievementCount(rows: Achievement[], year: string): number {
  return rows.filter((r) => r.achieved_on.startsWith(`${year}-`) && (r.kind === "plan" || r.kind === "wish")).length;
}

// Keep the same last-30-days calculation used by Today.
export function journeyStreak(reviews: DailyReview[], today: string): number {
  const dates = rangeBefore(today, 30);
  return streakCount(reviews.filter((r) => dates.includes(r.date)));
}
