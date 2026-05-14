import clsx from "clsx";
import { CLUSTER_META, Cluster } from "@/types";

const STYLE: Record<Cluster, string> = {
  A: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  B: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  C: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  D: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

export function ClusterBadge({
  cluster,
  size = "md",
}: {
  cluster: Cluster;
  size?: "sm" | "md" | "lg";
}) {
  const meta = CLUSTER_META[cluster];
  return (
    <span
      className={clsx(
        "badge",
        STYLE[cluster],
        size === "sm" && "text-[10px] px-2 py-0",
        size === "lg" && "text-sm px-3 py-1"
      )}
    >
      <span>{meta.emoji}</span>
      <span>
        {cluster} · {meta.label}
      </span>
    </span>
  );
}
