import { describe, expect, it } from "vitest";
import type { BacklogItem, Task } from "@/types";
import {
  canScheduleOn,
  canUnschedule,
  deadlineLabel,
  deadlineState,
  dayName,
  draftAfterAdd,
  sortBacklog,
} from "./logic";

const TODAY = "2026-10-23";

const item = (over: Partial<BacklogItem> = {}): BacklogItem => ({
  id: "i", user_id: "u", title: "t", importance: "中",
  created_at: "2026-10-01T00:00:00Z", updated_at: "", ...over,
});
const task = (over: Partial<Task> = {}): Task => ({
  id: "t", user_id: "u", title: "t", importance: "中", scheduled_date: TODAY,
  completed: false, from_routine: false, is_milestone: false,
  created_at: "", updated_at: "", ...over,
});

describe("sortBacklog", () => {
  it("orders by importance, then deadline (none last), then creation", () => {
    const items = [
      item({ id: "light", importance: "軽", deadline: "2026-10-24" }),
      item({ id: "mid-none", importance: "中" }),
      item({ id: "mid-late", importance: "中", deadline: "2026-11-01" }),
      item({ id: "mid-early", importance: "中", deadline: "2026-10-25" }),
      item({ id: "heavy", importance: "重", created_at: "2026-10-05T00:00:00Z" }),
      item({ id: "heavy-old", importance: "重" }),
    ];
    expect(sortBacklog(items).map((i) => i.id)).toEqual([
      "heavy-old", "heavy", "mid-early", "mid-late", "mid-none", "light",
    ]);
  });
  it("does not change the input", () => {
    const items = [item({ id: "b", importance: "軽" }), item({ id: "a", importance: "重" })];
    sortBacklog(items);
    expect(items.map((i) => i.id)).toEqual(["b", "a"]);
  });
});

describe("canScheduleOn", () => {
  it("allows today and later only", () => {
    expect(canScheduleOn(TODAY, TODAY)).toBe(true);
    expect(canScheduleOn("2026-10-30", TODAY)).toBe(true);
    expect(canScheduleOn("2026-10-22", TODAY)).toBe(false);
  });
});

describe("canUnschedule (same rules as unschedule_task)", () => {
  it("allows an unfinished hand task of today or later", () => {
    expect(canUnschedule(task(), TODAY)).toBe(true);
    expect(canUnschedule(task({ scheduled_date: "2026-10-30" }), TODAY)).toBe(true);
  });
  it("keeps the others where they are", () => {
    expect(canUnschedule(task({ completed: true }), TODAY)).toBe(false);
    expect(canUnschedule(task({ plan_id: "p" }), TODAY)).toBe(false);
    expect(canUnschedule(task({ from_routine: true }), TODAY)).toBe(false);
    expect(canUnschedule(task({ routine_id: "r" }), TODAY)).toBe(false);
    expect(canUnschedule(task({ carried_from: "x" }), TODAY)).toBe(false);
    expect(canUnschedule(task({ is_milestone: true }), TODAY)).toBe(false);
    expect(canUnschedule(task({ scheduled_date: "2026-10-22" }), TODAY)).toBe(false);
  });
});

describe("deadline", () => {
  it("states and labels", () => {
    expect(deadlineState("2026-10-22", TODAY)).toBe("overdue");
    expect(deadlineLabel("2026-10-22", TODAY)).toBe("期限切れ 10/22");
    expect(deadlineState(TODAY, TODAY)).toBe("today");
    expect(deadlineLabel(TODAY, TODAY)).toBe("今日まで");
    expect(deadlineState("2026-10-26", TODAY)).toBe("soon");
    expect(deadlineLabel("2026-10-26", TODAY)).toBe("あと3日 10/26");
    expect(deadlineState("2026-10-27", TODAY)).toBe("later");
    expect(deadlineLabel("2026-10-27", TODAY)).toBe("10/27まで");
  });
});

describe("dayName", () => {
  it("names the displayed day", () => {
    expect(dayName(TODAY, TODAY)).toBe("今日");
    expect(dayName("2026-10-24", TODAY)).toBe("10/24");
  });
});

describe("draftAfterAdd", () => {
  const sent = { title: "A", importance: "重" as const, deadline: "2026-10-30" };
  it("clears the title and deadline it sent, keeping the priority", () => {
    expect(draftAfterAdd(sent, sent)).toEqual({ title: "", importance: "重", deadline: undefined });
  });
  it("keeps a next entry typed while the add was saving", () => {
    const next = { title: "B", importance: "重" as const, deadline: "2026-11-02" };
    expect(draftAfterAdd(next, sent)).toBe(next);
    const sameTitleNewDeadline = { ...sent, deadline: "2026-11-02" };
    expect(draftAfterAdd(sameTitleNewDeadline, sent)).toBe(sameTitleNewDeadline);
  });
});
