import { describe, expect, it } from "vitest";
import type { Phase, Plan, Routine, Task } from "@/types";
import {
  daysLeftLabel,
  defaultPlanColor,
  executionCells,
  formatDateLabel,
  formatMinutes,
  dropTimes,
  initialPhase,
  memoOneLine,
  phaseForDate,
  phaseProgress,
  routinesForDate,
  shouldShowOverdueNotice,
  sortActivePlans,
  sortInactivePlans,
  todaySummary,
  validatePhase,
  validatePlan,
  validateRoutine,
  weekdaysLabel,
} from "./logic";

const TODAY = "2026-09-30"; // Wednesday (ISO weekday 3)

const routine = (over: Partial<Routine> = {}): Routine => ({
  id: "r1", phase_id: "ph1", title: "英語", minutes: 60,
  weekdays: [1, 2, 3, 4, 5, 6, 7], importance: "中", ...over,
});
const phase = (over: Partial<Phase> = {}): Phase => ({
  id: "ph1", plan_id: "p1", is_implicit: false, name: "P1",
  start_date: "2026-09-01", end_date: "2026-09-30", routines: [], ...over,
});
const implicit = (routines: Routine[] = []): Phase => ({
  id: "imp", plan_id: "p1", is_implicit: true, routines,
});
const plan = (over: Partial<Plan> = {}): Plan => ({
  id: "p1", name: "英語", color: "pink", status: "active", phases: [], materials: [],
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  ...over,
});
const task = (date: string, completed: boolean, over: Partial<Task> = {}): Task => ({
  id: `${date}-${Math.random()}`, user_id: "u", title: "t", importance: "中",
  scheduled_date: date, completed, plan_id: "p1", routine_id: "r1",
  is_milestone: false, created_at: "", updated_at: "", ...over,
});

describe("UT-01 phaseForDate", () => {
  const phases = [
    phase({ id: "a", start_date: "2026-09-01", end_date: "2026-09-30" }),
    phase({ id: "b", start_date: "2026-10-05", end_date: "2026-10-31" }),
  ];
  it("includes start and end days", () => {
    expect(phaseForDate(phases, "2026-09-01")?.id).toBe("a");
    expect(phaseForDate(phases, "2026-09-30")?.id).toBe("a");
    expect(phaseForDate(phases, "2026-10-05")?.id).toBe("b");
  });
  it("returns undefined outside every phase", () => {
    expect(phaseForDate(phases, "2026-10-01")).toBeUndefined();
    expect(phaseForDate(phases, "2026-08-31")).toBeUndefined();
  });
  it("returns the implicit phase for a plan without phases", () => {
    expect(phaseForDate([implicit()], TODAY)?.id).toBe("imp");
  });
});

describe("UT-02 initialPhase", () => {
  const a = phase({ id: "a", start_date: "2026-09-01", end_date: "2026-09-30" });
  const b = phase({ id: "b", start_date: "2026-10-05", end_date: "2026-10-31" });
  it("prefers the phase containing today", () => {
    expect(initialPhase([b, a], TODAY)?.id).toBe("a");
  });
  it("falls back to the nearest upcoming phase", () => {
    expect(initialPhase([a, b], "2026-10-01")?.id).toBe("b");
  });
  it("falls back to the last phase", () => {
    expect(initialPhase([a, b], "2026-12-01")?.id).toBe("b");
  });
});

describe("UT-03 weekdaysLabel", () => {
  it.each([
    [[1, 2, 3, 4, 5, 6, 7], "毎日"],
    [[1, 2, 3, 4, 5], "平日"],
    [[6, 7], "土日"],
    [[1, 3, 5], "月水金"],
    [[5, 1, 3], "月水金"],
  ])("%j -> %s", (days, label) => {
    expect(weekdaysLabel(days)).toBe(label);
  });
});

describe("routinesForDate (UT-04 conditions)", () => {
  const p = (status: Plan["status"]) =>
    plan({ status, phases: [phase({ routines: [routine()] })] });
  it("only active plans generate", () => {
    expect(routinesForDate(p("active"), TODAY)).toHaveLength(1);
    for (const s of ["idea", "paused", "done"] as const) {
      expect(routinesForDate(p(s), TODAY)).toHaveLength(0);
    }
  });
  it("requires today inside the phase", () => {
    expect(routinesForDate(p("active"), "2026-10-01")).toHaveLength(0);
  });
  it("requires a matching weekday", () => {
    const weekdayOnly = plan({
      phases: [implicit([routine({ weekdays: [1, 2, 3, 4, 5] })])],
    });
    expect(routinesForDate(weekdayOnly, TODAY)).toHaveLength(1);
    expect(routinesForDate(weekdayOnly, "2026-10-03")).toHaveLength(0); // Sat
  });
});

describe("UT-05 todaySummary", () => {
  it("sums minutes with a per-plan breakdown", () => {
    const a = plan({ id: "a", phases: [implicit([routine({ minutes: 60 })])] });
    const b = plan({
      id: "b",
      phases: [phase({ routines: [routine({ minutes: 90 }), routine({ minutes: 30 })] })],
    });
    const c = plan({ id: "c", status: "paused", phases: [implicit([routine()])] });
    const s = todaySummary([a, b, c], TODAY);
    expect(s.totalMinutes).toBe(180);
    expect(s.byPlan.map((x) => [x.plan.id, x.minutes])).toEqual([["a", 60], ["b", 120]]);
  });
  it("is 0 when nothing applies", () => {
    expect(todaySummary([], TODAY)).toEqual({ totalMinutes: 0, byPlan: [] });
  });
  it("formatMinutes", () => {
    expect(formatMinutes(180)).toBe("3h00m");
    expect(formatMinutes(95)).toBe("1h35m");
    expect(formatMinutes(45)).toBe("45m");
  });
});

describe("UT-06 executionCells", () => {
  it("classifies days and excludes today / none from tallies", () => {
    const tasks = [
      task("2026-09-27", true),
      task("2026-09-28", true),
      task("2026-09-28", false, { id: "x" }), // one incomplete -> missed
      task("2026-09-29", true),
      task(TODAY, false), // today, incomplete
    ];
    const r = executionCells(tasks, "p1", TODAY, 5);
    expect(r.cells.map((c) => c.state)).toEqual([
      "none", "done", "missed", "done", "today",
    ]);
    expect(r.cells[0].date).toBe("2026-09-26");
    expect(r.cells[4].date).toBe(TODAY);
    expect(r.done).toBe(2);
    expect(r.target).toBe(3);
  });
  it("ignores other plans and non-routine tasks", () => {
    const tasks = [
      task("2026-09-29", true, { plan_id: "other" }),
      task("2026-09-29", true, { routine_id: undefined }),
    ];
    const r = executionCells(tasks, "p1", TODAY, 3);
    expect(r.cells.every((c) => c.state === "none")).toBe(true);
    expect(r.target).toBe(0);
  });
  it("a fully completed today is shown done but not counted", () => {
    const r = executionCells([task(TODAY, true)], "p1", TODAY, 2);
    expect(r.cells[1].state).toBe("done");
    expect(r.done).toBe(0);
    expect(r.target).toBe(0);
  });
});

describe("UT-11 daysLeftLabel / UT-12 formatDateLabel", () => {
  it("counts days left", () => {
    expect(daysLeftLabel("2026-10-03", TODAY)).toBe("あと 3日");
    expect(daysLeftLabel(TODAY, TODAY)).toBe("今日が期日");
    expect(daysLeftLabel("2026-09-29", TODAY)).toBe("期日を過ぎています");
  });
  it("formats dates", () => {
    expect(formatDateLabel(TODAY, TODAY)).toBe("今日");
    expect(formatDateLabel("2026-12-05", TODAY)).toBe("12/5");
    expect(formatDateLabel("2027-04-01", TODAY)).toBe("2027/4/1");
  });
});

describe("UT-13 shouldShowOverdueNotice", () => {
  const overdue = plan({ due_date: "2026-09-29" });
  it("shows for an active, past-due plan", () => {
    expect(shouldShowOverdueNotice(overdue, TODAY)).toBe(true);
  });
  it("hides once dismissed for the same due date, shows for a new one", () => {
    const dismissed = { ...overdue, overdue_notice_dismissed_for: "2026-09-29" };
    expect(shouldShowOverdueNotice(dismissed, TODAY)).toBe(false);
    expect(shouldShowOverdueNotice({ ...dismissed, due_date: "2026-09-25" }, TODAY)).toBe(true);
  });
  it("hides when not active, not due yet, or no due date", () => {
    expect(shouldShowOverdueNotice({ ...overdue, status: "paused" }, TODAY)).toBe(false);
    expect(shouldShowOverdueNotice(plan({ due_date: TODAY }), TODAY)).toBe(false);
    expect(shouldShowOverdueNotice(plan(), TODAY)).toBe(false);
  });
});

describe("UT-15 defaultPlanColor", () => {
  it("picks the first unused color among active plans", () => {
    const plans = [
      plan({ color: "pink" }),
      plan({ color: "orange", status: "active" }),
      plan({ color: "yellow", status: "paused" }), // inactive: not counted
    ];
    expect(defaultPlanColor(plans)).toBe("yellow");
  });
  it("falls back to pink when all are used", () => {
    const all = (
      ["pink", "orange", "yellow", "green", "teal", "blue", "purple", "gray"] as const
    ).map((c) => plan({ color: c }));
    expect(defaultPlanColor(all)).toBe("pink");
  });
});

describe("UT-16 sorting", () => {
  it("active: due date asc, none last, then created asc", () => {
    const a = plan({ id: "a", due_date: "2026-12-01" });
    const b = plan({ id: "b", due_date: "2026-10-01" });
    const c = plan({ id: "c", created_at: "2026-02-01T00:00:00Z" });
    const d = plan({ id: "d", created_at: "2026-01-15T00:00:00Z" });
    expect(sortActivePlans([c, a, d, b]).map((p) => p.id)).toEqual(["b", "a", "d", "c"]);
  });
  it("done: completed desc; others: updated desc", () => {
    const x = plan({ id: "x", completed_at: "2026-04-01", updated_at: "2026-01-01" });
    const y = plan({ id: "y", completed_at: "2026-08-01", updated_at: "2026-01-02" });
    expect(sortInactivePlans([x, y], "done").map((p) => p.id)).toEqual(["y", "x"]);
    expect(sortInactivePlans([x, y], "paused").map((p) => p.id)).toEqual(["y", "x"]);
  });
});

describe("phaseProgress", () => {
  it("clamps to 0..1", () => {
    const ph = phase({ start_date: "2026-09-21", end_date: "2026-09-30" });
    expect(phaseProgress(ph, "2026-09-20")).toBe(0);
    expect(phaseProgress(ph, "2026-09-25")).toBe(0.5);
    expect(phaseProgress(ph, "2026-10-10")).toBe(1);
  });
});

describe("UT-19 validation", () => {
  it("plan", () => {
    expect(validatePlan({ name: "  " }).name).toBeDefined();
    expect(validatePlan({ name: "a".repeat(40) })).toEqual({});
    expect(validatePlan({ name: "a".repeat(41) }).name).toBeDefined();
    expect(validatePlan({ name: "a", goal: "a".repeat(61) }).goal).toBeDefined();
    expect(validatePlan({ name: "a", goal_note: "a".repeat(1001) }).goal_note).toBeDefined();
  });
  it("phase: required, order, overlap", () => {
    const sib = [phase({ id: "a", name: "A", start_date: "2026-10-01", end_date: "2026-10-31" })];
    const ok = { name: "B", start_date: "2026-11-01", end_date: "2026-11-30" };
    expect(validatePhase(ok, sib)).toEqual({});
    expect(validatePhase({ ...ok, name: "" }, sib).name).toBeDefined();
    expect(validatePhase({ ...ok, end_date: "2026-10-01" }, sib).end_date).toBeDefined();
    expect(validatePhase({ ...ok, start_date: "2026-10-31" }, sib).start_date).toBeDefined();
    // editing itself is not an overlap
    expect(validatePhase({ ...ok, start_date: "2026-10-05", end_date: "2026-10-10" }, sib, "a")).toEqual({});
  });
  it("routine: title, minutes, weekdays, menu", () => {
    const ok = { title: "英語", minutes: 30, weekdays: [1], menu: "" };
    expect(validateRoutine(ok)).toEqual({});
    expect(validateRoutine({ ...ok, minutes: 4 }).minutes).toBeDefined();
    expect(validateRoutine({ ...ok, minutes: 7 }).minutes).toBeDefined();
    expect(validateRoutine({ ...ok, minutes: 605 }).minutes).toBeDefined();
    expect(validateRoutine({ ...ok, minutes: 600 })).toEqual({});
    expect(validateRoutine({ ...ok, weekdays: [] }).weekdays).toBeDefined();
    expect(validateRoutine({ ...ok, title: "a".repeat(41) }).title).toBeDefined();
  });
});

describe("UT-14 memoOneLine", () => {
  it("joins lines with ' / ' and drops blank lines", () => {
    expect(memoOneLine("リスニング 20分\nスピーキング 20分")).toBe(
      "リスニング 20分 / スピーキング 20分"
    );
    expect(memoOneLine("a\n\n  \nb\r\nc")).toBe("a / b / c");
  });
  it("is empty without a memo", () => {
    expect(memoOneLine(undefined)).toBe("");
    expect(memoOneLine(null)).toBe("");
    expect(memoOneLine("")).toBe("");
    expect(memoOneLine("\n \n")).toBe("");
  });
});

describe("UT-20 dropTimes", () => {
  it("ends at start + planned minutes (13:00 + 60 = 14:00)", () => {
    expect(dropTimes(13 * 60, 60)).toEqual({ start: 780, end: 840 });
    expect(dropTimes(9 * 60, 90)).toEqual({ start: 540, end: 630 });
  });
  it("keeps the existing 60 minutes when there is no duration", () => {
    expect(dropTimes(13 * 60)).toEqual({ start: 780, end: 840 });
    expect(dropTimes(13 * 60, null)).toEqual({ start: 780, end: 840 });
  });
  it("moves a late start earlier only as much as the duration needs", () => {
    expect(dropTimes(23 * 60 + 45, 30)).toEqual({ start: 1410, end: 1440 });
    expect(dropTimes(23 * 60, 90)).toEqual({ start: 1350, end: 1440 });
    expect(dropTimes(23 * 60 + 45)).toEqual({ start: 1380, end: 1440 });
    expect(dropTimes(-15, 30)).toEqual({ start: 0, end: 30 });
    expect(dropTimes(1440, 600)).toEqual({ start: 840, end: 1440 });
  });
});
