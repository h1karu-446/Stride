import { addDays, addMonths, format, parseISO, startOfMonth, startOfWeek } from "date-fns";

/** Calendars across the app start on Sunday (日 月 火 水 木 金 土). */
export const WEEK_STARTS_ON = 0;
export const WEEKDAY_HEADERS = ["日", "月", "火", "水", "木", "金", "土"];
/** ISO weekday numbers (月=1 … 日=7, as stored) in display order. */
export const ISO_WEEKDAYS_IN_ORDER = [7, 1, 2, 3, 4, 5, 6];
export const ISO_WEEKDAY_CHAR: Record<number, string> = { 1: "月", 2: "火", 3: "水", 4: "木", 5: "金", 6: "土", 7: "日" };

export function calendarDates(month: string): string[] {
  const first = startOfWeek(startOfMonth(parseISO(`${month}-01`)), { weekStartsOn: WEEK_STARTS_ON });
  return Array.from({ length: 42 }, (_, index) => format(addDays(first, index), "yyyy-MM-dd"));
}

export function moveCalendarDate(date: string, key: string): string {
  const current = parseISO(date);
  const movement: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
  };
  if (key in movement) return format(addDays(current, movement[key]), "yyyy-MM-dd");
  if (key === "Home") return format(startOfWeek(current, { weekStartsOn: WEEK_STARTS_ON }), "yyyy-MM-dd");
  if (key === "End") return format(addDays(startOfWeek(current, { weekStartsOn: WEEK_STARTS_ON }), 6), "yyyy-MM-dd");
  if (key === "PageUp" || key === "PageDown") {
    return format(addMonths(current, key === "PageUp" ? -1 : 1), "yyyy-MM-dd");
  }
  if (key === "Shift+PageUp" || key === "Shift+PageDown") {
    return format(addMonths(current, key === "Shift+PageUp" ? -12 : 12), "yyyy-MM-dd");
  }
  return date;
}
