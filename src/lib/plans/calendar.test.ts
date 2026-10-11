import { describe, expect, it } from "vitest";
import { monthWeeks, phaseDatesError, weekSegments } from "./calendar";

describe("monthWeeks", () => {
  it("lists the Sunday of every week touching the month", () => {
    // 2026-10-01 is a Thursday; 10/31 is a Saturday.
    expect(monthWeeks("2026-10")).toEqual(["2026-09-27", "2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25"]);
  });

  it("shows six weeks when the month needs them", () => {
    // 2026-08-01 is a Saturday; 8/31 is a Monday.
    expect(monthWeeks("2026-08")).toHaveLength(6);
  });
});

describe("weekSegments", () => {
  const p = (id: string, start_date: string, end_date: string) => ({ id, start_date, end_date });

  it("cuts a period to the week and marks where it goes on", () => {
    const [segment] = weekSegments([p("a", "2026-10-08", "2026-10-20")], "2026-10-11");
    expect(segment).toMatchObject({ startCol: 0, endCol: 6, continuesBefore: true, continuesAfter: true, lane: 0 });
    const [first] = weekSegments([p("a", "2026-10-08", "2026-10-20")], "2026-10-04");
    expect(first).toMatchObject({ startCol: 4, endCol: 6, continuesBefore: false, continuesAfter: true });
    const [last] = weekSegments([p("a", "2026-10-08", "2026-10-20")], "2026-10-18");
    expect(last).toMatchObject({ startCol: 0, endCol: 2, continuesBefore: true, continuesAfter: false });
  });

  it("leaves out periods outside the week", () => {
    expect(weekSegments([p("a", "2026-10-01", "2026-10-10")], "2026-10-11")).toEqual([]);
  });

  it("puts overlapping periods in separate lanes and reuses a free lane", () => {
    const segments = weekSegments([
      p("c", "2026-10-15", "2026-10-17"),
      p("a", "2026-10-11", "2026-10-13"),
      p("b", "2026-10-12", "2026-10-16"),
    ], "2026-10-11");
    expect(segments.map((s) => [s.item.id, s.lane])).toEqual([["a", 0], ["b", 1], ["c", 0]]);
  });

  it("does not put two periods in one lane when they share a day", () => {
    const segments = weekSegments([p("a", "2026-10-11", "2026-10-13"), p("b", "2026-10-13", "2026-10-14")], "2026-10-11");
    expect(segments.map((s) => s.lane)).toEqual([0, 1]);
  });
});

describe("phaseDatesError", () => {
  it("accepts valid dates", () => {
    expect(phaseDatesError({ start_date: "2026-10-01", end_date: "2026-10-10" })).toBeUndefined();
  });

  it("rejects dates that leave out the completion day", () => {
    expect(phaseDatesError({ start_date: "2026-10-06", end_date: "2026-10-10" }, "2026-10-05")).toMatch(/完了した日/);
    expect(phaseDatesError({ start_date: "2026-10-01", end_date: "2026-10-04" }, "2026-10-05")).toMatch(/完了した日/);
  });
});
