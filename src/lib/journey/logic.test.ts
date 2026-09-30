import { describe, expect, it } from "vitest";
import type { Achievement, DailyReview, Wish } from "@/types";
import { ACHIEVEMENT_STYLE, achievementRange, achievementStyle, editableWish, sortWishes, annualAchievementCount, groupAchievements, journeyStreak, monthlyAverage } from "./logic";
const achievement = (id: string, kind: Achievement["kind"], achieved_on: string): Achievement => ({ id, kind, achieved_on, user_id: "owner", title: id, plan_id: null, plan_name: null, plan_color: null, started_at: null, emphasized: kind === "wish" ? true : null });
const review = (date: string, total_score: number, cluster: DailyReview["cluster"] = "A") => ({ date, total_score, cluster } as DailyReview);

describe("UT-17 achievement groups", () => {
  it("orders months and days newest first without mutating the source", () => {
    const rows = [achievement("old", "wish", "2025-12-31"), achievement("first", "material", "2026-01-01"), achievement("last", "plan", "2026-01-31")];
    expect(groupAchievements(rows).map(([month, values]) => [month, values.map((r) => r.id)])).toEqual([["2026-01", ["last", "first"]], ["2025-12", ["old"]]]);
    expect(rows[0].id).toBe("old");
    expect(groupAchievements([])).toEqual([]);
  });
  it("emphasizes only wishes and plans", () => {
    expect(Object.entries(ACHIEVEMENT_STYLE).filter(([, style]) => style.prominent).map(([kind]) => kind)).toEqual(["wish", "plan"]);
  });
  it("follows each wish's emphasis setting and leaves the other kinds to their kind (Issue #54)", () => {
    expect(achievementStyle(achievement("on", "wish", "2026-09-01"))).toBe(ACHIEVEMENT_STYLE.wish);
    const off = achievementStyle({ ...achievement("off", "wish", "2026-09-01"), emphasized: false });
    expect(off.prominent).toBe(false);
    expect(off.className).toBe(ACHIEVEMENT_STYLE.material.className);
    expect(off.icon).not.toBe(ACHIEVEMENT_STYLE.wish.icon);
    expect(achievementStyle(achievement("p", "plan", "2026-09-01"))).toBe(ACHIEVEMENT_STYLE.plan);
    expect(achievementStyle(achievement("m", "milestone", "2026-09-01"))).toBe(ACHIEVEMENT_STYLE.milestone);
  });
  it("extends calendar month windows by three, including across years", () => {
    expect(achievementRange("2026-01-31", 3)).toEqual({ from: "2025-11-01", to: "2026-02-01" });
    expect(achievementRange("2026-01-31", 6)).toEqual({ from: "2025-08-01", to: "2026-02-01" });
  });
});
describe("UT-18 Journey statistics", () => {
  it("averages recorded days of the selected month and floors decimals, retaining zero", () => {
    const rows = [review("2026-09-01", 0), review("2026-09-30", 85.9), review("2026-08-31", 100)];
    expect(monthlyAverage(rows, "2026-09")).toBe(42);
    expect(monthlyAverage(rows, "2026-07")).toBeNull();
    expect(monthlyAverage([], "2026-09")).toBeNull();
  });
  it("counts only this year's plans and wishes, independent of the visible quarter", () => {
    expect(annualAchievementCount([achievement("1", "wish", "2026-01-01"), achievement("2", "plan", "2026-09-30"), achievement("3", "material", "2026-09-30"), achievement("4", "milestone", "2026-09-30"), achievement("5", "plan", "2025-12-31")], "2026")).toBe(2);
  });
  it("preserves Today's A/B calculation and excludes future/out-of-window reviews", () => {
    expect(journeyStreak([review("2026-09-30", 90), review("2026-09-29", 90), review("2026-09-28", 75, "B"), review("2026-09-27", 60, "C"), review("2026-07-01", 95)], "2026-09-29")).toBe(2);
  });
});
describe("UT-22 pending wish order (Issue #54)", () => {
  const wish = (id: string, importance: Wish["importance"]): Wish => ({ id, importance, user_id: "owner", title: id, note: null, achieved_at: null, emphasize_achievement: false, created_at: "", updated_at: "" });
  it("orders 重 → 中 → 軽 and keeps the added order within a level, without mutating the source", () => {
    const rows = [wish("a", "軽"), wish("b", "中"), wish("c", "重"), wish("d", "中"), wish("e", "重")];
    expect(sortWishes(rows).map((w) => w.id)).toEqual(["c", "e", "b", "d", "a"]);
    expect(rows.map((w) => w.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("keeps today's order when every wish is 中 (existing wishes after migration 0018)", () => {
    expect(sortWishes([wish("x", "中"), wish("y", "中")]).map((w) => w.id)).toEqual(["x", "y"]);
  });
});
describe("editing an achieved wish from the feed (Issue #54 review)", () => {
  const wish = (emphasize_achievement: boolean, updated_at: string): Wish => ({ id: "w", importance: "中", user_id: "owner", title: "w", note: null, achieved_at: "2026-09-01", emphasize_achievement, created_at: "", updated_at });
  // Journey latches `shown` once editableWish first returns a wish, until the form closes.
  function openForm() {
    let shown = false;
    return (query: { data?: Wish; isFetching: boolean; isStale: boolean }) => {
      const value = editableWish(query, shown);
      if (value) shown = true;
      return value;
    };
  }
  it("open → cancel → toggle ★ → reopen: waits for the refetch instead of the copy cached before the toggle", () => {
    const cached = wish(false, "2026-09-30T00:00:00Z");
    const refetched = wish(true, "2026-09-30T00:01:00Z");
    const reopen = openForm();
    // The toggle invalidated ["wishes"], so the cached copy is stale and being refetched.
    expect(reopen({ data: cached, isFetching: false, isStale: true })).toBeNull();
    expect(reopen({ data: cached, isFetching: true, isStale: true })).toBeNull();
    // Only the refetched row fills the form, so saving keeps the toggle.
    expect(reopen({ data: refetched, isFetching: false, isStale: false })).toBe(refetched);
  });
  it("open → type → another refetch runs: the form stays, so the input is kept", () => {
    const row = wish(true, "2026-09-30T00:00:00Z");
    const open = openForm();
    expect(open({ data: row, isFetching: false, isStale: false })).toBe(row);
    // Another row's ○, undo or reconnect invalidates ["wishes"] while the form is open.
    expect(open({ data: row, isFetching: true, isStale: true })).toBe(row);
    expect(open({ data: wish(true, "2026-09-30T00:02:00Z"), isFetching: false, isStale: false })).not.toBeNull();
  });
  it("opens at once from a fresh cache, and never without data", () => {
    const row = wish(false, "2026-09-30T00:00:00Z");
    expect(openForm()({ data: row, isFetching: false, isStale: false })).toBe(row);
    expect(openForm()({ data: undefined, isFetching: true, isStale: true })).toBeNull();
    expect(editableWish({ data: undefined, isFetching: false, isStale: true }, true)).toBeNull();
  });
});
