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
  if (total >= 30) return "D";
  return "E";
}

export interface ScoreResult {
  completion_score: number;
  fulfillment_score: number;
  wake_score: number;
  bed_score: number;
  total_score: number;
  cluster: Cluster;
  completed_weight: number;
  scheduled_weight: number;
}

const WAKE_MAX = 7.5;
const BED_MAX = 7.5;
const PENALTY_MIN_FULL = 150; // 150min late → 0 pt
const NOON_MIN = 12 * 60;
const DAY_MIN = 24 * 60;

function timeToMin(time: string | null | undefined): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// Bedtimes can cross midnight (e.g. target 23:00, actual 00:30). Treat any
// time before noon as belonging to the next day so late-night times compare
// correctly against evening targets instead of looking artificially early.
export function normalizeLateNight(min: number): number {
  return min < NOON_MIN ? min + DAY_MIN : min;
}

export function calculateWakeScore(
  wakeTime: string | null | undefined,
  wakeTarget: string | null | undefined
): number {
  const w = timeToMin(wakeTime);
  const t = timeToMin(wakeTarget);
  if (w == null || t == null) return 0;
  const lateMin = Math.max(0, w - t);
  const ratio = Math.max(0, 1 - lateMin / PENALTY_MIN_FULL);
  return WAKE_MAX * ratio;
}

export function calculateBedScore(
  bedTime: string | null | undefined,
  bedTarget: string | null | undefined
): number {
  const b = timeToMin(bedTime);
  const t = timeToMin(bedTarget);
  if (b == null || t == null) return 0;
  const lateMin = Math.max(
    0,
    normalizeLateNight(b) - normalizeLateNight(t)
  );
  const ratio = Math.max(0, 1 - lateMin / PENALTY_MIN_FULL);
  return BED_MAX * ratio;
}

/**
 * The fulfillment value the UI should show for a stored review. A day without
 * a review row, or whose row has fulfillment NULL (e.g. only the wake time was
 * saved), is "not selected" — not 3. calculate_daily_score scores NULL as 0,
 * so the preview must receive null too to match the stored score.
 */
export function storedFulfillment(
  review: Pick<DailyReview, "fulfillment"> | undefined
): number | null {
  return review?.fulfillment ?? null;
}

/**
 * Mirrors the PostgreSQL calculate_daily_score function defined in
 * supabase/migrations. Kept in TS so the UI can preview scores
 * before the row is persisted.
 *
 * Weights: completion 80 / fulfillment 5 / wake 7.5 / bed 7.5 (max 100).
 */
export function calculateScore(
  tasks: Task[],
  fulfillment: number | null | undefined,
  wakeTime?: string | null,
  wakeTarget?: string | null,
  bedTime?: string | null,
  bedTarget?: string | null
): ScoreResult {
  const scheduled_weight = tasks.reduce(
    (acc, t) => acc + IMPORTANCE_WEIGHT[t.importance],
    0
  );
  const completed_weight = tasks
    .filter((t) => t.completed)
    .reduce((acc, t) => acc + IMPORTANCE_WEIGHT[t.importance], 0);

  const completion_score =
    scheduled_weight === 0 ? 0 : (completed_weight / scheduled_weight) * 80;
  const fulfillment_score = (fulfillment ?? 0) * 1;
  const wake_score = calculateWakeScore(wakeTime, wakeTarget);
  const bed_score = calculateBedScore(bedTime, bedTarget);
  const total_score =
    completion_score + fulfillment_score + wake_score + bed_score;

  return {
    completion_score: round(completion_score),
    fulfillment_score: round(fulfillment_score),
    wake_score: round(wake_score),
    bed_score: round(bed_score),
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
