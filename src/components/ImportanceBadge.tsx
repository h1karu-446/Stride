import clsx from "clsx";
import { Importance } from "@/types";

const STYLE: Record<Importance, string> = {
  重: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  中: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  軽: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export function ImportanceBadge({ importance }: { importance: Importance }) {
  return (
    <span className={clsx("badge", STYLE[importance])}>{importance}</span>
  );
}
