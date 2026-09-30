/** Shared quick picks for routine (menu) forms: the phase settings and the single-menu editor. */
export const MINUTE_PRESETS = [15, 30, 45, 60, 90];
export const WEEKDAY_PRESETS: { label: string; days: number[] }[] = [
  { label: "毎日", days: [1, 2, 3, 4, 5, 6, 7] },
  { label: "平日", days: [1, 2, 3, 4, 5] },
  { label: "週末", days: [6, 7] },
];
export const chip = (active: boolean) => `rounded-full border px-3 py-1 text-xs transition ${active
  ? "border-notion-blue bg-notion-blue text-white" : "border-slate-300 hover:border-slate-400 dark:border-notion-border"}`;
export const sameDays = (a: number[], b: number[]) => [...a].sort().join() === [...b].sort().join();
