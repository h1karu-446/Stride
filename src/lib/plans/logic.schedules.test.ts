import { describe, expect, it } from "vitest";
import type { Material, Phase, Task } from "@/types";
import {
  isOverdue,
  linkablePhaseIds,
  MATERIAL_STATUSES,
  materialGroups,
  materialStatusPatch,
  nextSchedule,
  mergeNearbyDays,
  scheduleDays,
  scheduleGroups,
  validateMaterial,
  validateSchedule,
} from "./logic";

// Schedules (予定) and materials (教材): spec 4.1 / 4.2, BR-04, BR-05, 6.

const TODAY = "2026-09-30";

let seq = 0;
const sched = (date: string, over: Partial<Task> = {}): Task => {
  seq += 1;
  return {
    id: `s${seq}`, user_id: "u", title: `予定${seq}`, importance: "中",
    scheduled_date: date, completed: false, plan_id: "p1",
    from_routine: false,
    is_milestone: false, created_at: `2026-01-01T00:00:${String(seq).padStart(2, "0")}Z`,
    updated_at: "", ...over,
  };
};
const mat = (id: string, over: Partial<Material> = {}): Material => ({
  id, plan_id: "p1", title: id, status: "todo", phase_ids: [],
  created_at: `2026-01-01T00:00:0${id.length}Z`, ...over,
});
const phase = (id: string, over: Partial<Phase> = {}): Phase => ({
  id, plan_id: "p1", is_implicit: false, name: id,
  start_date: "2026-09-01", end_date: "2026-09-30", routines: [], ...over,
});

describe("UT-07 scheduleGroups", () => {
  it("orders overdue (oldest first) -> today -> future (nearest first)", () => {
    const tasks = [
      sched("2026-10-10", { id: "future-far" }),
      sched(TODAY, { id: "today" }),
      sched("2026-09-20", { id: "overdue-new" }),
      sched("2026-10-01", { id: "future-near" }),
      sched("2026-09-10", { id: "overdue-old" }),
    ];
    const g = scheduleGroups(tasks, "p1", 10);
    expect(g.visible.map((t) => t.id)).toEqual([
      "overdue-old", "overdue-new", "today", "future-near", "future-far",
    ]);
  });

  it("shows 3 open schedules and folds the rest", () => {
    const tasks = ["10-01", "10-02", "10-03", "10-04", "10-05"].map((d) =>
      sched(`2026-${d}`)
    );
    const g = scheduleGroups(tasks, "p1");
    expect(g.visible).toHaveLength(3);
    expect(g.hidden).toHaveLength(2);
    expect(g.hidden[0].scheduled_date).toBe("2026-10-04");
  });

  it("puts completed schedules in done, newest date first", () => {
    const tasks = [
      sched("2026-09-01", { id: "d-old", completed: true }),
      sched("2026-09-25", { id: "d-new", completed: true }),
      sched(TODAY, { id: "open" }),
    ];
    const g = scheduleGroups(tasks, "p1");
    expect(g.visible.map((t) => t.id)).toEqual(["open"]);
    expect(g.done.map((t) => t.id)).toEqual(["d-new", "d-old"]);
  });

  it("ignores routine tasks, manual tasks, and other plans", () => {
    const tasks = [
      sched(TODAY, { id: "mine" }),
      sched(TODAY, { routine_id: "r1", from_routine: true }),
      sched(TODAY, { plan_id: undefined }),
      sched(TODAY, { plan_id: "p2" }),
    ];
    const g = scheduleGroups(tasks, "p1");
    expect([...g.visible, ...g.hidden, ...g.done].map((t) => t.id)).toEqual(["mine"]);
  });

  it("keeps routine tasks out after their menu is deleted (routine_id cleared)", () => {
    const tasks = [
      sched("2026-09-28", { id: "orphan", routine_id: undefined, from_routine: true }),
      sched(TODAY, { id: "mine" }),
    ];
    const g = scheduleGroups(tasks, "p1");
    expect([...g.visible, ...g.hidden, ...g.done].map((t) => t.id)).toEqual(["mine"]);
    expect(nextSchedule(tasks, "p1", TODAY)?.task.id).toBe("mine");
  });

  it("isOverdue: before today and not completed", () => {
    expect(isOverdue(sched("2026-09-29"), TODAY)).toBe(true);
    expect(isOverdue(sched(TODAY), TODAY)).toBe(false);
    expect(isOverdue(sched("2026-09-29", { completed: true }), TODAY)).toBe(false);
  });
});

describe("UT-08 nextSchedule", () => {
  it("prefers the oldest overdue schedule", () => {
    const tasks = [
      sched(TODAY, { id: "today" }),
      sched("2026-09-20", { id: "newer" }),
      sched("2026-09-15", { id: "oldest" }),
    ];
    expect(nextSchedule(tasks, "p1", TODAY)).toEqual({
      task: expect.objectContaining({ id: "oldest" }),
      overdue: true,
    });
  });

  it("falls back to the nearest open schedule", () => {
    const tasks = [
      sched("2026-10-05", { id: "later" }),
      sched("2026-10-01", { id: "near" }),
      sched("2026-09-20", { id: "done-past", completed: true }),
    ];
    const next = nextSchedule(tasks, "p1", TODAY);
    expect(next?.task.id).toBe("near");
    expect(next?.overdue).toBe(false);
  });

  it("is undefined (予定なし) without open schedules", () => {
    expect(nextSchedule([], "p1", TODAY)).toBeUndefined();
    expect(
      nextSchedule([sched(TODAY, { completed: true })], "p1", TODAY)
    ).toBeUndefined();
    expect(nextSchedule([sched(TODAY, { routine_id: "r1", from_routine: true })], "p1", TODAY)).toBeUndefined();
  });
});

describe("UT-09 materialGroups", () => {
  const list = [
    mat("a-todo-unlinked", { created_at: "2026-01-01T00:00:01Z" }),
    mat("b-used-sel", { status: "in_progress", phase_ids: ["sel"], created_at: "2026-01-01T00:00:05Z" }),
    mat("c-todo-sel", { phase_ids: ["sel", "other"], created_at: "2026-01-01T00:00:02Z" }),
    mat("d-used-unlinked", { status: "in_progress", created_at: "2026-01-01T00:00:03Z" }),
    mat("e-other-only", { phase_ids: ["other"], created_at: "2026-01-01T00:00:04Z" }),
    mat("f-done-old", { status: "done", completed_at: "2026-09-01", phase_ids: ["sel"] }),
    mat("g-done-new", { status: "done", completed_at: "2026-09-20", phase_ids: ["other"] }),
  ];

  it("puts the selected phase and unlinked materials on top: in use -> todo -> added", () => {
    const g = materialGroups(list, "sel");
    expect(g.main.map((m) => m.id)).toEqual([
      "d-used-unlinked", "b-used-sel", "a-todo-unlinked", "c-todo-sel",
    ]);
    expect(g.otherPhases.map((m) => m.id)).toEqual(["e-other-only"]);
    expect(g.done.map((m) => m.id)).toEqual(["g-done-new", "f-done-old"]);
  });

  it("changes with the selected phase", () => {
    const g = materialGroups(list, "other");
    expect(g.main.map((m) => m.id)).toContain("e-other-only");
    expect(g.otherPhases.map((m) => m.id)).toEqual(["b-used-sel"]);
  });

  it("keeps every open material on top when there is no explicit phase", () => {
    const g = materialGroups(list, undefined);
    expect(g.otherPhases).toEqual([]);
    expect(g.main).toHaveLength(5);
  });
});

describe("UT-10 materialStatusPatch (direct status choice, Issue #53)", () => {
  it("offers the three statuses in a fixed order", () => {
    expect(MATERIAL_STATUSES).toEqual(["todo", "in_progress", "done"]);
  });
  it("any status can be chosen in one step, including todo -> done and done -> todo", () => {
    expect(materialStatusPatch("done", TODAY)).toEqual({ status: "done", completed_at: TODAY });
    expect(materialStatusPatch("todo", TODAY)).toEqual({ status: "todo", completed_at: null });
    expect(materialStatusPatch("in_progress", TODAY)).toEqual({
      status: "in_progress",
      completed_at: null,
    });
  });
  it("records the local date sent by the device as the completion date", () => {
    expect(materialStatusPatch("done", "2026-01-01").completed_at).toBe("2026-01-01");
  });
});

describe("linkablePhaseIds (phases of the same plan only)", () => {
  const phases = [phase("a"), phase("b"), phase("imp", { is_implicit: true })];
  it("drops phases of other plans and the implicit phase, and duplicates", () => {
    expect(linkablePhaseIds(["a", "x-other-plan", "imp", "b", "a"], phases)).toEqual([
      "a", "b",
    ]);
    expect(linkablePhaseIds([], phases)).toEqual([]);
  });
});

describe("UT-19 validation: schedules and materials", () => {
  const ok = { title: "模試", scheduled_date: TODAY };
  it("schedule: title 1-100 chars after trimming", () => {
    expect(validateSchedule(ok, TODAY)).toEqual({});
    expect(validateSchedule({ ...ok, title: "   " }, TODAY).title).toBeDefined();
    expect(validateSchedule({ ...ok, title: "a".repeat(100) }, TODAY)).toEqual({});
    expect(validateSchedule({ ...ok, title: ` ${"a".repeat(100)} ` }, TODAY)).toEqual({});
    expect(validateSchedule({ ...ok, title: "a".repeat(101) }, TODAY).title).toBeDefined();
  });
  it("schedule: date is required and today or later", () => {
    expect(validateSchedule({ ...ok, scheduled_date: "" }, TODAY).scheduled_date).toBeDefined();
    expect(validateSchedule({ ...ok, scheduled_date: "2026-09-29" }, TODAY).scheduled_date)
      .toBeDefined();
    expect(validateSchedule({ ...ok, scheduled_date: "2026-10-01" }, TODAY)).toEqual({});
  });
  it("schedule: an overdue schedule may keep its own date, but not pick another past one", () => {
    expect(
      validateSchedule({ ...ok, scheduled_date: "2026-09-20" }, TODAY, "2026-09-20")
    ).toEqual({});
    expect(
      validateSchedule({ ...ok, scheduled_date: "2026-09-21" }, TODAY, "2026-09-20")
        .scheduled_date
    ).toBeDefined();
  });

  it("material: title 1-100 chars after trimming", () => {
    expect(validateMaterial({ title: "金のフレーズ" })).toEqual({});
    expect(validateMaterial({ title: "" }).title).toBeDefined();
    expect(validateMaterial({ title: "a".repeat(100) })).toEqual({});
    expect(validateMaterial({ title: "a".repeat(101) }).title).toBeDefined();
  });
  it("material: link is optional and must start with http:// or https://", () => {
    expect(validateMaterial({ title: "x", url: "" })).toEqual({});
    expect(validateMaterial({ title: "x", url: "https://example.com/a" })).toEqual({});
    expect(validateMaterial({ title: "x", url: "http://example.com" })).toEqual({});
    expect(validateMaterial({ title: "x", url: "example.com" }).url).toBeDefined();
    expect(validateMaterial({ title: "x", url: "ftp://example.com" }).url).toBeDefined();
    expect(validateMaterial({ title: "x", url: "https://" }).url).toBeDefined();
  });
  it("material: note is optional, up to 1000 chars after trimming, line breaks allowed", () => {
    expect(validateMaterial({ title: "x", note: "" })).toEqual({});
    expect(validateMaterial({ title: "x", note: "第3章の非同期処理を理解する\n演習" })).toEqual({});
    expect(validateMaterial({ title: "x", note: "あ".repeat(1000) })).toEqual({});
    expect(validateMaterial({ title: "x", note: ` ${"あ".repeat(1000)}\n` })).toEqual({});
    expect(validateMaterial({ title: "x", note: "あ".repeat(1001) }).note).toBeDefined();
  });
});

describe("scheduleDays (Issue #79)", () => {
  it("groups a plan's schedules by day with the most urgent state first", () => {
    const old = sched("2026-09-20");
    const doneOld = sched("2026-09-20", { completed: true });
    const future = sched("2026-10-05", { is_milestone: true });
    const doneFuture = sched("2026-10-05", { completed: true });
    const allDone = sched("2026-09-25", { completed: true });
    const routine = sched("2026-09-21", { from_routine: true });
    const other = sched("2026-09-22", { plan_id: "p2" });
    const days = scheduleDays([future, doneFuture, allDone, old, doneOld, routine, other], "p1", TODAY);
    expect(days.map((d) => [d.date, d.state, d.milestone, d.items.length])).toEqual([
      ["2026-09-20", "overdue", false, 2],
      ["2026-09-25", "done", false, 1],
      ["2026-10-05", "open", true, 2],
    ]);
    expect(days[0].items.map((i) => [i.task.id, i.state])).toEqual([[old.id, "overdue"], [doneOld.id, "done"]]);
  });

  it("shows the copy of a carried-over schedule, not the original", () => {
    const original = sched("2026-09-10");
    const copy = sched(TODAY, { carried_from: original.id });
    expect(scheduleDays([original, copy], "p1", TODAY)).toEqual([
      { date: TODAY, end: TODAY, items: [{ task: copy, state: "open" }], state: "open", milestone: false },
    ]);
  });

  it("returns nothing when the plan has no schedules", () => {
    expect(scheduleDays([], "p1", TODAY)).toEqual([]);
  });
});

describe("mergeNearbyDays (Issue #79)", () => {
  it("merges days closer than minDays to the first day of the previous mark", () => {
    const days = scheduleDays([
      sched("2026-10-01", { completed: true }), sched("2026-10-02", { is_milestone: true }),
      sched("2026-10-03"), sched("2026-10-04"), sched("2026-10-10"),
    ], "p1", TODAY);
    expect(mergeNearbyDays(days, 3).map((d) => [d.date, d.end, d.items.length, d.state, d.milestone])).toEqual([
      ["2026-10-01", "2026-10-03", 3, "open", true],
      ["2026-10-04", "2026-10-04", 1, "open", false],
      ["2026-10-10", "2026-10-10", 1, "open", false],
    ]);
  });

  it("keeps an overdue state when merging and leaves days apart when minDays is 1", () => {
    const days = scheduleDays([sched("2026-09-28"), sched("2026-09-29", { completed: true })], "p1", TODAY);
    expect(mergeNearbyDays(days, 2)).toMatchObject([{ state: "overdue", items: [{}, {}] }]);
    expect(mergeNearbyDays(days, 1)).toHaveLength(2);
  });
});
