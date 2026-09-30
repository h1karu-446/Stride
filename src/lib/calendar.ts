import { addDays, addMonths, format, parseISO, startOfMonth, startOfWeek } from "date-fns";

export function calendarDates(month: string): string[] {
  const first = startOfWeek(startOfMonth(parseISO(`${month}-01`)), { weekStartsOn: 1 });
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
  if (key === "Home") return format(startOfWeek(current, { weekStartsOn: 1 }), "yyyy-MM-dd");
  if (key === "End") return format(addDays(startOfWeek(current, { weekStartsOn: 1 }), 6), "yyyy-MM-dd");
  if (key === "PageUp" || key === "PageDown") {
    return format(addMonths(current, key === "PageUp" ? -1 : 1), "yyyy-MM-dd");
  }
  if (key === "Shift+PageUp" || key === "Shift+PageDown") {
    return format(addMonths(current, key === "Shift+PageUp" ? -12 : 12), "yyyy-MM-dd");
  }
  return date;
}
