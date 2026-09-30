import type { Achievement, Importance } from "@/types";

/**
 * Visual weight of an achievement in the full-screen reel. Bigger tiers get
 * larger type and a taller card, so they also stay on screen longer while
 * scrolling.
 */
export type ReelTier = "xl" | "l" | "m" | "s";

const WISH_TIER: Record<Importance, ReelTier> = { 重: "l", 中: "m", 軽: "s" };
const BASE_TIER: Record<Exclude<Achievement["kind"], "wish">, ReelTier> = { plan: "l", milestone: "m", material: "s" };
const UP: Record<ReelTier, ReelTier> = { s: "m", m: "l", l: "xl", xl: "xl" };

export function reelTier(row: Achievement, importance?: Importance): ReelTier {
  const base = row.kind === "wish" ? WISH_TIER[importance ?? "中"] : BASE_TIER[row.kind];
  // ★ (emphasized) wishes step up one tier.
  return row.kind === "wish" && row.emphasized ? UP[base] : base;
}

export type ReelMonth = { key: string; year: number; month: number; rows: Achievement[] };

/** Oldest month first, and oldest first within a month. */
export function reelMonths(rows: Achievement[]): ReelMonth[] {
  const sorted = [...rows].sort((a, b) => a.achieved_on.localeCompare(b.achieved_on) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  const months: ReelMonth[] = [];
  for (const row of sorted) {
    const key = row.achieved_on.slice(0, 7);
    let last = months[months.length - 1];
    if (!last || last.key !== key) {
      last = { key, year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)), rows: [] };
      months.push(last);
    }
    last.rows.push(row);
  }
  return months;
}
