import { afterEach, describe, expect, it, vi } from "vitest";
import { addDaysISO, rangeBefore, todayISO, weekRange } from "./date";

afterEach(() => {
  vi.useRealTimers();
});

describe("date helpers", () => {
  it("todayISO uses the local date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 23, 59));
    expect(todayISO()).toBe("2026-09-29");
  });

  it("addDaysISO crosses month and year boundaries", () => {
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("weekRange starts on Monday", () => {
    expect(weekRange("2026-09-30")).toEqual([
      "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01",
      "2026-10-02", "2026-10-03", "2026-10-04",
    ]);
  });

  it("rangeBefore returns days in ascending order ending at the given date", () => {
    expect(rangeBefore("2026-03-01", 3)).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
  });
});
