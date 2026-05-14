import { format, parseISO, addDays, startOfWeek } from "date-fns";

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function formatDate(date: string, fmt = "yyyy-MM-dd") {
  return format(parseISO(date), fmt);
}

export function addDaysISO(date: string, days: number): string {
  return format(addDays(parseISO(date), days), "yyyy-MM-dd");
}

export function weekRange(date: string = todayISO()) {
  const start = startOfWeek(parseISO(date), { weekStartsOn: 1 });
  const days: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    days.push(format(addDays(start, i), "yyyy-MM-dd"));
  }
  return days;
}

export function rangeBefore(end: string, days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    out.push(addDaysISO(end, -i));
  }
  return out;
}
