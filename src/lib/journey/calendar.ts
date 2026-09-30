import { eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import type { Cluster, DailyReview } from "@/types";

/** 記録あり・記録なしの過去日・今日（未記録）・未来日。月外かどうかは `inMonth` で別に持つ。 */
export type CalendarDayKind = "recorded" | "missing" | "today" | "future";

export interface CalendarDay {
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  kind: CalendarDayKind;
  cluster: Cluster | null;
  /** 表示する点数（整数）。記録がなければ null */
  score: number | null;
  href: string;
  label: string;
}

/** 月曜始まりで、表示月を含む週の全日（4〜6週 × 7日）を返す。 */
export function calendarDays(month: Date, reviews: Pick<DailyReview, "date" | "total_score" | "cluster">[], today: string): CalendarDay[] {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const byDate = new Map(reviews.map((r) => [r.date, r] as const));
  return eachDayOfInterval({ start, end }).map((d) => {
    const iso = format(d, "yyyy-MM-dd");
    const review = byDate.get(iso);
    const isToday = iso === today;
    const kind: CalendarDayKind = review ? "recorded" : isToday ? "today" : iso > today ? "future" : "missing";
    const score = review ? Math.round(review.total_score) : null;
    const status = review ? `${score}点 ランク${review.cluster}` : kind === "future" ? "未来" : "記録なし";
    return {
      iso,
      day: d.getDate(),
      inMonth: isSameMonth(d, month),
      isToday,
      kind,
      cluster: review?.cluster ?? null,
      score,
      href: isToday ? "/" : `/day/${iso}`,
      label: `${format(d, "yyyy年M月d日")}${isToday ? "（今日）" : ""} ${status}`,
    };
  });
}
