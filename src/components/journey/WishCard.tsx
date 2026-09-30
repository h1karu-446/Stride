import clsx from "clsx";
import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Importance, Wish } from "@/types";

const ACCENT: Record<Importance, { bar: string; card: string; label: string }> = {
  重: {
    bar: "bg-gradient-to-b from-amber-400 to-rose-500",
    card: "bg-gradient-to-r from-amber-50 via-rose-50/60 to-transparent dark:from-amber-500/10 dark:via-rose-500/5",
    label: "text-rose-600 dark:text-rose-300",
  },
  中: { bar: "bg-amber-400", card: "", label: "text-amber-600 dark:text-amber-300" },
  軽: { bar: "bg-slate-300 dark:bg-notion-border", card: "", label: "muted" },
};

export function daysSinceLabel(createdAt: string, today: string): string {
  const days = differenceInCalendarDays(parseISO(today), parseISO(createdAt));
  if (days <= 0) return "今日思いついた";
  return `思い立って ${days} 日`;
}

export default function WishCard({ wish, today, disabled, onAchieve, onEdit }: {
  wish: Wish;
  today: string;
  disabled: boolean;
  onAchieve: () => void;
  onEdit: () => void;
}) {
  const accent = ACCENT[wish.importance];
  return (
    <li className={clsx("group relative flex items-center gap-3 overflow-hidden rounded-xl border border-slate-200 py-3 pl-4 pr-2 dark:border-notion-border", accent.card)}>
      <span aria-hidden className={clsx("absolute inset-y-0 left-0 w-1", accent.bar)} />
      <button type="button" disabled={disabled} onClick={onAchieve} aria-label={`「${wish.title}」をかなえた`}
        className="peer flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 text-transparent transition hover:border-emerald-500 hover:bg-emerald-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-notion-border">
        ✓
      </button>
      <div className="min-w-0 flex-1 peer-hover:[&_.celebrate]:inline peer-focus-visible:[&_.celebrate]:inline">
        <p className={clsx("break-words", wish.importance === "重" ? "font-semibold" : "font-medium")}>
          {wish.importance === "重" && <span aria-hidden className="mr-1 text-amber-500">★</span>}
          {wish.title}
        </p>
        {wish.note && <p className="mt-0.5 line-clamp-2 break-words text-xs muted">{wish.note}</p>}
        <p className="mt-1 flex items-center gap-2 text-[11px]">
          <span className={clsx("font-semibold", accent.label)}><span className="sr-only">重要度 </span>{wish.importance}</span>
          <span className="muted">{daysSinceLabel(wish.created_at, today)}</span>
          <span aria-hidden className="celebrate hidden font-semibold text-emerald-600 dark:text-emerald-400">かなえた！</span>
        </p>
      </div>
      <button type="button" disabled={disabled} onClick={onEdit} aria-label={`「${wish.title}」を編集`}
        className="shrink-0 rounded-md px-2 py-1 text-xs muted hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 dark:hover:bg-notion-panel-hover dark:hover:text-notion-text">
        編集
      </button>
    </li>
  );
}
