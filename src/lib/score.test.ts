import { describe, expect, it } from "vitest";
import type { DailyReview, Importance, Task } from "@/types";
import {
  calculateBedScore,
  calculateScore,
  calculateWakeScore,
  clusterFromScore,
  streakCount,
} from "./score";

const task = (importance: Importance, completed: boolean) =>
  ({ importance, completed }) as Task;

const review = (date: string, cluster: DailyReview["cluster"]) =>
  ({ date, cluster }) as DailyReview;

describe("clusterFromScore", () => {
  it.each([
    [100, "A"], [85, "A"], [84.9, "B"], [70, "B"], [69.9, "C"],
    [50, "C"], [49.9, "D"], [30.1, "D"], [30, "E"], [0, "E"],
  ] as const)("%s → %s", (score, cluster) => {
    expect(clusterFromScore(score)).toBe(cluster);
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

  it("scores 0 completion when there are no tasks", () => {
    const result = calculateScore([], null);
    expect(result.completion_score).toBe(0);
    expect(result.total_score).toBe(0);
    expect(result.cluster).toBe("E");
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
