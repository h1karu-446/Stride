import { describe, expect, it } from "vitest";
import type { Task } from "@/types";
import {
  canCarryOver,
  carriedIds,
  carryOverInput,
  isLockedSchedule,
  isOverdue,
  carryOverOnce,
  isAlreadyCarried,
  withId,
  nextSchedule,
  planScheduleSave,
  scheduleGroups,
} from "./logic";

// Carrying an overdue schedule over copies it; past schedules only change
// their title (spec BR-04, 4.1, 4.2, Issue #36). UT-21.

const TODAY = "2026-09-30";
const PAST = "2026-09-20";

let seq = 0;
const sched = (date: string, over: Partial<Task> = {}): Task => {
  seq += 1;
  return {
    id: `c${seq}`, user_id: "u", title: `予定${seq}`, importance: "中",
    scheduled_date: date, completed: false, plan_id: "p1",
    from_routine: false,
    is_milestone: false, created_at: `2026-01-01T00:00:${String(seq).padStart(2, "0")}Z`,
    updated_at: "", ...over,
  };
};

describe("UT-21 isLockedSchedule", () => {
  it("locks schedules dated before today only", () => {
    expect(isLockedSchedule(sched(PAST), TODAY)).toBe(true);
    expect(isLockedSchedule(sched(PAST, { completed: true }), TODAY)).toBe(true);
    expect(isLockedSchedule(sched(TODAY), TODAY)).toBe(false);
    expect(isLockedSchedule(sched("2026-10-01"), TODAY)).toBe(false);
  });

  it("does not lock routine tasks or manual tasks", () => {
    expect(isLockedSchedule(sched(PAST, { routine_id: "r1", from_routine: true }), TODAY)).toBe(false);
    // The menu was deleted: routine_id is cleared, but it is still a routine task.
    expect(isLockedSchedule(sched(PAST, { from_routine: true }), TODAY)).toBe(false);
    expect(isLockedSchedule(sched(PAST, { plan_id: undefined }), TODAY)).toBe(false);
  });
});

describe("UT-21 carryOverInput", () => {
  it("copies the content as a new open task on the date, pointing at the original", () => {
    const t = sched(PAST, {
      id: "orig", title: "模試", importance: "重", is_milestone: true,
      memo: "メモ", planned_minutes: 90, start_time: "09:00", end_time: "10:30",
    });
    expect(carryOverInput(t, TODAY)).toEqual({
      title: "模試",
      importance: "重",
      scheduled_date: TODAY,
      memo: "メモ",
      plan_id: "p1",
      is_milestone: true,
      planned_minutes: 90,
      carried_from: "orig",
    });
  });
});

describe("UT-21 carried originals in the lists", () => {
  it("is no longer overdue once a copy exists", () => {
    const orig = sched(PAST, { id: "orig" });
    const copy = sched(TODAY, { id: "copy", carried_from: "orig" });
    const carried = carriedIds([orig, copy]);
    expect(carried).toEqual(new Set(["orig"]));
    expect(isOverdue(orig, TODAY)).toBe(true);
    expect(isOverdue(orig, TODAY, carried)).toBe(false);
  });

  it("moves the original to the closed group and keeps the copy open", () => {
    const orig = sched(PAST, { id: "orig" });
    const copy = sched(TODAY, { id: "copy", carried_from: "orig" });
    const done = sched("2026-09-25", { id: "done", completed: true });
    const g = scheduleGroups([orig, copy, done], "p1");
    expect(g.visible.map((t) => t.id)).toEqual(["copy"]);
    expect(g.done.map((t) => t.id)).toEqual(["done", "orig"]);
    expect(g.carriedCount).toBe(1);
  });

  it("counts a completed original as done, not carried", () => {
    const orig = sched(PAST, { id: "orig", completed: true });
    const copy = sched(TODAY, { id: "copy", carried_from: "orig" });
    expect(scheduleGroups([orig, copy], "p1").carriedCount).toBe(0);
  });

  it("is overdue again when the copy is deleted", () => {
    const orig = sched(PAST, { id: "orig" });
    expect(scheduleGroups([orig], "p1").visible.map((t) => t.id)).toEqual(["orig"]);
  });

  it("plan card shows the copy, not the carried original", () => {
    const orig = sched(PAST, { id: "orig" });
    const copy = sched("2026-10-02", { id: "copy", carried_from: "orig" });
    expect(nextSchedule([orig, copy], "p1", TODAY)).toEqual({ task: copy, overdue: false });
  });

  it("can carry an overdue original only once", () => {
    const orig = sched(PAST, { id: "orig" });
    expect(canCarryOver(orig, TODAY, new Set())).toBe(true);
    expect(canCarryOver(orig, TODAY, new Set(["orig"]))).toBe(false);
    expect(canCarryOver(sched(PAST, { completed: true }), TODAY, new Set())).toBe(false);
    expect(canCarryOver(sched(TODAY), TODAY, new Set())).toBe(false);
  });
});

describe("UT-21 isAlreadyCarried", () => {
  const dup = 'duplicate key value violates unique constraint "tasks_carried_from_uniq"';
  it("is only the unique violation of tasks_carried_from_uniq", () => {
    expect(isAlreadyCarried({ code: "23505", message: dup })).toBe(true);
    expect(isAlreadyCarried({ code: "23505", message: "x", details: dup })).toBe(true);
    expect(isAlreadyCarried({ code: "23505", message: 'violates unique constraint "tasks_pkey"' })).toBe(false);
    expect(isAlreadyCarried({ code: "42501", message: dup })).toBe(false);
    expect(isAlreadyCarried(new Error("network"))).toBe(false);
    expect(isAlreadyCarried(null)).toBe(false);
  });
});

describe("UT-21 carryOverOnce", () => {
  const deferred = () => {
    let resolve!: () => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };

  it("settles each click on its own when two rows are clicked together", async () => {
    const a = deferred();
    const b = deferred();
    const refresh = () => Promise.resolve();
    const ra = carryOverOnce(() => a.promise, refresh);
    const rb = carryOverOnce(() => b.promise, refresh);
    b.resolve();
    a.reject({ code: "42501", message: "permission denied" });
    expect(await ra).toEqual({ failed: true });
    expect(await rb).toEqual({ failed: false });
  });

  it("treats an existing copy as done and always reloads the list", async () => {
    const order: string[] = [];
    const r = await carryOverOnce(
      () => { order.push("insert"); return Promise.reject({ code: "23505", message: "tasks_carried_from_uniq" }); },
      async () => { order.push("refresh"); }
    );
    expect(r).toEqual({ failed: false });
    expect(order).toEqual(["insert", "refresh"]);
  });

  it("does not reject when the reload fails", async () => {
    await expect(carryOverOnce(() => Promise.resolve(), () => Promise.reject(new Error("x"))))
      .resolves.toEqual({ failed: false });
  });
});

describe("withId", () => {
  it("adds and removes without touching other ids", () => {
    const s = withId(withId(new Set<string>(), "a", true), "b", true);
    expect([...withId(s, "a", false)]).toEqual(["b"]);
    expect(withId(s, "a", true)).toBe(s);
  });
});

describe("UT-21 planScheduleSave", () => {
  const values = (t: Task, over = {}) => ({
    title: t.title, scheduled_date: t.scheduled_date,
    importance: t.importance, is_milestone: t.is_milestone, ...over,
  });

  it("sends every field for today and future schedules", () => {
    const t = sched(TODAY);
    const v = values(t, { title: "新", scheduled_date: "2026-10-05", importance: "重", is_milestone: true });
    expect(planScheduleSave(t, v, TODAY)).toEqual({
      patch: { title: "新", scheduled_date: "2026-10-05", importance: "重", is_milestone: true },
    });
  });

  it("sends only the title for a past schedule, even if other fields were changed", () => {
    const t = sched(PAST, { completed: true });
    const v = values(t, { title: "改名", importance: "重", is_milestone: true, scheduled_date: TODAY });
    expect(planScheduleSave(t, v, TODAY)).toEqual({ patch: { title: "改名" } });
  });

  it("sends nothing when a past schedule's title is unchanged", () => {
    const t = sched(PAST);
    expect(planScheduleSave(t, values(t, { importance: "軽" }), TODAY)).toEqual({});
  });

  it("copies an overdue schedule to a new date instead of moving it", () => {
    const t = sched(PAST, { id: "orig", importance: "重" });
    const out = planScheduleSave(t, values(t, { scheduled_date: "2026-10-03", importance: "軽" }), TODAY);
    expect(out.patch).toBeUndefined();
    expect(out.copy).toMatchObject({
      scheduled_date: "2026-10-03", importance: "重", carried_from: "orig", title: t.title,
    });
  });

  it("renames both the original and the copy when both change", () => {
    const t = sched(PAST, { id: "orig" });
    const out = planScheduleSave(t, values(t, { title: "新名", scheduled_date: TODAY }), TODAY);
    expect(out.patch).toEqual({ title: "新名" });
    expect(out.copy).toMatchObject({ title: "新名", scheduled_date: TODAY, carried_from: "orig" });
  });

  it("does not copy an already carried or a completed past schedule", () => {
    const t = sched(PAST, { id: "orig" });
    expect(planScheduleSave(t, values(t, { scheduled_date: TODAY }), TODAY, new Set(["orig"]))).toEqual({});
    const done = sched(PAST, { completed: true });
    expect(planScheduleSave(done, values(done, { scheduled_date: TODAY }), TODAY)).toEqual({});
  });

  it("does not copy to another past date", () => {
    const t = sched(PAST);
    expect(planScheduleSave(t, values(t, { scheduled_date: "2026-09-25" }), TODAY)).toEqual({});
  });
});
