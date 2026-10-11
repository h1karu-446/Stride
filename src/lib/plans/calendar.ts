import { addDays, differenceInCalendarDays, endOfMonth, format, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { addDaysISO } from "@/lib/date";
import { WEEK_STARTS_ON } from "@/lib/calendar";
import { validatePhase } from "./logic";

type Dates = { start_date: string; end_date: string };

/** The first day of each week shown for a month ("yyyy-MM"): only weeks that touch the month. */
export function monthWeeks(month: string): string[] {
  const first = startOfMonth(parseISO(`${month}-01`));
  const last = format(endOfMonth(first), "yyyy-MM-dd");
  const weeks: string[] = [];
  for (let week = startOfWeek(first, { weekStartsOn: WEEK_STARTS_ON }); format(week, "yyyy-MM-dd") <= last;
    week = addDays(week, 7)) {
    weeks.push(format(week, "yyyy-MM-dd"));
  }
  return weeks;
}

export interface WeekSegment<T> {
  item: T;
  /** Columns 0–6 covered in this week. */
  startCol: number;
  endCol: number;
  /** The period goes on before / after this week. */
  continuesBefore: boolean;
  continuesAfter: boolean;
  lane: number;
}

/**
 * The parts of each period that fall in the week starting `weekStart`, for the
 * phase calendar. Overlapping parts go to the next free lane, earliest first.
 */
export function weekSegments<T extends Dates>(items: T[], weekStart: string): WeekSegment<T>[] {
  const weekEnd = addDaysISO(weekStart, 6);
  const col = (date: string) => differenceInCalendarDays(parseISO(date), parseISO(weekStart));
  const shown = items
    .filter((item) => item.start_date <= weekEnd && item.end_date >= weekStart)
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || b.end_date.localeCompare(a.end_date));
  const laneEnds: number[] = [];
  return shown.map((item) => {
    const startCol = item.start_date < weekStart ? 0 : col(item.start_date);
    const endCol = item.end_date > weekEnd ? 6 : col(item.end_date);
    let lane = laneEnds.findIndex((end) => end < startCol);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = endCol;
    return { item, startCol, endCol, continuesBefore: item.start_date < weekStart,
      continuesAfter: item.end_date > weekEnd, lane };
  });
}

/** Why new dates for a phase cannot be saved as they are, or undefined (same rules as the settings form). */
export function phaseDatesError(dates: Dates, completedAt?: string): string | undefined {
  const errors = validatePhase({ name: "-", ...dates }, completedAt);
  return errors.start_date ?? errors.end_date;
}
