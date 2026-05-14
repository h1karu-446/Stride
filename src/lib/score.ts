import {
  Cluster,
  DailyReview,
  IMPORTANCE_WEIGHT,
  Task,
} from "@/types";

export function clusterFromScore(total: number): Cluster {
  if (total >= 85) return "A";
  if (total >= 70) return "B";
  if (total >= 50) return "C";
  return "D";
}

export interface ScoreResult {
  completion_score: number;
  fulfillment_score: number;
  total_score: number;
  cluster: Cluster;
  completed_weight: number;
  scheduled_weight: number;
}

/**
 * Mirrors the PostgreSQL calculate_daily_score function defined in
 * supabase/migrations. Kept in TS so the UI can preview scores
 * before the row is persisted.
 */
export function calculateScore(
  tasks: Task[],
  fulfillment: number | null | undefined
): ScoreResult {
  const scheduled_weight = tasks.reduce(
    (acc, t) => acc + IMPORTANCE_WEIGHT[t.importance],
    0
  );
  const completed_weight = tasks
    .filter((t) => t.completed)
    .reduce((acc, t) => acc + IMPORTANCE_WEIGHT[t.importance], 0);

  const completion_score =
    scheduled_weight === 0 ? 0 : (completed_weight / scheduled_weight) * 90;
  const fulfillment_score = (fulfillment ?? 0) * 2;
  const total_score = completion_score + fulfillment_score;

  return {
    completion_score: round(completion_score),
    fulfillment_score: round(fulfillment_score),
    total_score: round(total_score),
    cluster: clusterFromScore(total_score),
    completed_weight,
    scheduled_weight,
  };
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}

export function streakCount(reviews: DailyReview[]): number {
  // Reviews sorted by date desc — count consecutive A/B from latest
  const sorted = [...reviews].sort((a, b) => b.date.localeCompare(a.date));
  let count = 0;
  for (const r of sorted) {
    if (r.cluster === "A" || r.cluster === "B") count += 1;
    else break;
  }
  return count;
}
