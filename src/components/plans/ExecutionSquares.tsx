import clsx from "clsx";
import type { Cell } from "@/lib/plans/logic";
import { formatDateLabel } from "@/lib/plans/logic";

/** Small squares for recent routine execution (BR-06). */
export default function ExecutionSquares({
  cells,
  color,
  today,
  size = "sm",
  showNone = false,
}: {
  cells: Cell[];
  color: string;
  today: string;
  size?: "sm" | "lg";
  /** Draw days without routine tasks as dotted boxes (detail screen only). */
  showNone?: boolean;
}) {
  const box = size === "lg" ? "w-4 h-4 rounded" : "w-2.5 h-2.5 rounded-[3px]";
  return (
    <span className={clsx("flex", size === "lg" ? "gap-1.5" : "gap-[3px]")}>
      {cells.map((c) => {
        if (c.state === "none" && !showNone) return null;
        const title = `${formatDateLabel(c.date, today)}`;
        if (c.state === "done") {
          return <span key={c.date} title={title} className={box} style={{ background: color }} />;
        }
        if (c.state === "missed") {
          return <span key={c.date} title={title} className={clsx(box, "bg-slate-300 dark:bg-notion-border-strong")} />;
        }
        return (
          <span
            key={c.date}
            title={title}
            className={clsx(
              box,
              "border",
              c.state === "today"
                ? "border-slate-500 dark:border-notion-muted"
                : "border-dashed border-slate-300 dark:border-notion-border-strong"
            )}
          />
        );
      })}
    </span>
  );
}
