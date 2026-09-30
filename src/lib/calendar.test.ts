import { describe, expect, it } from "vitest";
import { calendarDates, moveCalendarDate } from "./calendar";

describe("calendar navigation", () => {
  it("fills six Sunday-first weeks across the year boundary", () => {
    const dates = calendarDates("2027-01");
    expect(dates).toHaveLength(42);
    expect(dates[0]).toBe("2026-12-27");
    expect(dates[41]).toBe("2027-02-06");
  });

  it("moves through leap day and clamps month movement", () => {
    expect(moveCalendarDate("2024-02-28", "ArrowRight")).toBe("2024-02-29");
    expect(moveCalendarDate("2024-02-29", "ArrowRight")).toBe("2024-03-01");
    expect(moveCalendarDate("2024-01-31", "PageDown")).toBe("2024-02-29");
    expect(moveCalendarDate("2024-12-31", "ArrowRight")).toBe("2025-01-01");
    expect(moveCalendarDate("2024-02-29", "Shift+PageDown")).toBe("2025-02-28");
  });
});
