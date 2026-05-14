import { Cluster } from "@/types";

const COLOR: Record<Cluster, string> = {
  A: "#22c55e",
  B: "#3b82f6",
  C: "#f59e0b",
  D: "#f97316",
  E: "#ef4444",
};

export function ScoreRing({
  score,
  cluster,
  size = 160,
}: {
  score: number;
  cluster: Cluster;
  size?: number;
}) {
  const r = (size - 18) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, score)) / 100;
  const offset = c * (1 - pct);
  const color = COLOR[cluster];
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={12}
          className="stroke-slate-200 dark:stroke-notion-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={12}
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset .6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="flex items-baseline gap-0.5">
          <span className="text-4xl font-bold tabular-nums">
            {Math.round(score)}
          </span>
          <span className="text-lg font-semibold text-slate-500 dark:text-notion-muted">
            %
          </span>
        </div>
        <div className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-notion-muted mt-0.5">
          Score
        </div>
      </div>
    </div>
  );
}
