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
  if (total > 30) return "D";
  return "E";
}

export interface ScoreResult {
  completion_score: number;
  fulfillment_score: number;
  wake_score: number;
  total_score: number;
  cluster: Cluster;
  completed_weight: number;
  scheduled_weight: number;
}

const WAKE_MAX = 5;
const WAKE_PENALTY_MIN_FULL = 150; // 150min late → 0 pt

function timeToMin(time: string | null | undefined): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function calculateWakeScore(
  wakeTime: string | null | undefined,
  wakeTarget: string | null | undefined
): number {
  const w = timeToMin(wakeTime);
  const t = timeToMin(wakeTarget);
  if (w == null || t == null) return 0;
  const lateMin = Math.max(0, w - t);
  const ratio = Math.max(0, 1 - lateMin / WAKE_PENALTY_MIN_FULL);
  return WAKE_MAX * ratio;
}

/**
 * Mirrors the PostgreSQL calculate_daily_score function defined in
 * supabase/migrations. Kept in TS so the UI can preview scores
 * before the row is persisted.
 *
 * Weights: completion 90 / fulfillment 5 / wake 5 (max 100).
 */
export function calculateScore(
  tasks: Task[],
  fulfillment: number | null | undefined,
  wakeTime?: string | null,
  wakeTarget?: string | null
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
  const fulfillment_score = (fulfillment ?? 0) * 1;
  const wake_score = calculateWakeScore(wakeTime, wakeTarget);
  const total_score = completion_score + fulfillment_score + wake_score;

  return {
    completion_score: round(completion_score),
    fulfillment_score: round(fulfillment_score),
    wake_score: round(wake_score),
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
