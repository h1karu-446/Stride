import { describe, expect, it } from "vitest";
import { CLUSTER_META } from "@/types";
import type { DailyReview, Importance, Task } from "@/types";
import {
  calculateBedScore,
  calculateScore,
  calculateWakeScore,
  clusterFromScore,
  roundTotalScore,
  storedFulfillment,
  streakCount,
} from "./score";

const task = (importance: Importance, completed: boolean) =>
  ({ importance, completed }) as Task;

const review = (date: string, cluster: DailyReview["cluster"]) =>
  ({ date, cluster }) as DailyReview;

describe("clusterFromScore", () => {
  it.each([
    [100, "A"], [85, "A"], [84.9, "B"], [70, "B"], [69.9, "C"],
    [50, "C"], [49.9, "D"], [30.1, "D"], [30, "D"], [29.9, "E"], [0, "E"],
  ] as const)("%s → %s", (score, cluster) => {
    expect(clusterFromScore(score)).toBe(cluster);
  });

  it("puts exactly 30 in D, matching CLUSTER_META.D.min (Issue #35)", () => {
    expect(clusterFromScore(CLUSTER_META.D.min)).toBe("D");
    expect(clusterFromScore(CLUSTER_META.D.min - 0.1)).toBe("E");
  });

  // Decided on the total rounded to 2 decimals, like the stored total_score
  // and calculate_daily_score (Issue #35).
  it.each([
    [29.995, "D"], [29.994, "E"], [29.99, "E"],
    [29.999999999999996, "D"], [30.000000000000004, "D"],
    [49.995, "C"], [49.994, "D"],
    [69.995, "B"], [69.994, "C"],
    [84.995, "A"], [84.994, "B"],
  ] as const)("rounds %s to 2 decimals → %s", (score, cluster) => {
    expect(clusterFromScore(score)).toBe(cluster);
  });
});

describe("roundTotalScore", () => {
  it.each([
    [29.995, 30], [29.994, 29.99], [29.999999999999996, 30],
    [49.995, 50], [1.005, 1.01], [72.345, 72.35], [100, 100], [0, 0],
  ] as const)("%s → %s (like numeric(5,2))", (score, rounded) => {
    expect(roundTotalScore(score)).toBe(rounded);
  });
});

describe("calculateWakeScore", () => {
  it("gives full points when on time or early", () => {
    expect(calculateWakeScore("07:00", "07:00")).toBe(7.5);
    expect(calculateWakeScore("06:30", "07:00")).toBe(7.5);
  });

  it("decreases linearly and reaches 0 at 150 minutes late", () => {
    expect(calculateWakeScore("08:15", "07:00")).toBeCloseTo(3.75);
    expect(calculateWakeScore("09:30", "07:00")).toBe(0);
    expect(calculateWakeScore("11:00", "07:00")).toBe(0);
  });

  it("returns 0 for missing or invalid times", () => {
    expect(calculateWakeScore(null, "07:00")).toBe(0);
    expect(calculateWakeScore("07:00", undefined)).toBe(0);
    expect(calculateWakeScore("abc", "07:00")).toBe(0);
  });
});

describe("calculateBedScore", () => {
  it("treats times after midnight as the same night", () => {
    expect(calculateBedScore("00:30", "23:00")).toBeCloseTo(3);
    expect(calculateBedScore("01:30", "23:00")).toBe(0);
  });

  it("gives full points when going to bed early", () => {
    expect(calculateBedScore("22:00", "23:00")).toBe(7.5);
  });
});

describe("calculateScore", () => {
  it("weights completion by importance and sums all parts", () => {
    const result = calculateScore(
      [task("重", true), task("中", false), task("軽", true)],
      4,
      "07:00", "07:00",
      "23:00", "23:00"
    );
    expect(result).toMatchObject({
      completed_weight: 4,
      scheduled_weight: 6,
      completion_score: 53.3,
      fulfillment_score: 4,
      wake_score: 7.5,
      bed_score: 7.5,
      total_score: 72.3,
      cluster: "B",
    });
  });

  it("ranks a day stored as 30.00 as D even when the float sum is just under 30", () => {
    // 重要度 3/16 完了 (15) + 充実度 5 + 起床 100 分遅れ (2.5) + 就寝どおり (7.5).
    // calculate_daily_score computes 29.999…975 here; both sides round first.
    const tasks = [
      task("重", true), task("重", false), task("重", false),
      task("重", false), task("重", false), task("軽", false),
    ];
    const result = calculateScore(tasks, 5, "08:40", "07:00", "23:00", "23:00");
    expect(result.total_score).toBe(30);
    expect(result.cluster).toBe("D");
  });

  it("scores 0 completion when there are no tasks", () => {
    const result = calculateScore([], null);
    expect(result.completion_score).toBe(0);
    expect(result.total_score).toBe(0);
    expect(result.cluster).toBe("E");
  });
});

describe("unsaved fulfillment (Issue #30)", () => {
  it("treats a missing review or a NULL fulfillment as not selected", () => {
    expect(storedFulfillment(undefined)).toBeNull();
    expect(storedFulfillment({ fulfillment: null })).toBeNull();
    expect(storedFulfillment({ fulfillment: 4 })).toBe(4);
  });

  it("scores an unsaved fulfillment as 0, like coalesce(p_fulfillment, 0) in calculate_daily_score", () => {
    // Tasks all done, on time for wake and bed, fulfillment never saved.
    // The DB stores 80 + 0 + 7.5 + 7.5 = 95 (not 98 as if 3 were selected).
    const result = calculateScore(
      [task("重", true), task("軽", true)],
      storedFulfillment({ fulfillment: null }),
      "07:00", "07:00",
      "23:00", "23:00"
    );
    expect(result.fulfillment_score).toBe(0);
    expect(result.total_score).toBe(95);
    expect(result.cluster).toBe("A");
  });
});

describe("streakCount", () => {
  it("counts consecutive A/B days from the latest, regardless of input order", () => {
    const reviews = [
      review("2026-09-26", "A"),
      review("2026-09-29", "A"),
      review("2026-09-27", "C"),
      review("2026-09-28", "B"),
    ];
    expect(streakCount(reviews)).toBe(2);
  });

  it("returns 0 when the latest day is below B", () => {
    expect(streakCount([review("2026-09-29", "D"), review("2026-09-28", "A")])).toBe(0);
  });
});
