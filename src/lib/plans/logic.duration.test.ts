import { describe, expect, it } from "vitest";
import { formatMinutes, taskDurationMinutes } from "./logic";

// Issue #59: the compact duration shown on list rows and timeline blocks.
describe("taskDurationMinutes", () => {
  it("uses the frame length for a placed task", () => {
    expect(taskDurationMinutes({ start_time: "09:00", end_time: "10:30" })).toBe(90);
    expect(taskDurationMinutes({ start_time: "23:15", end_time: "24:00" })).toBe(45);
  });

  it("prefers the frame over planned_minutes when both exist", () => {
    expect(
      taskDurationMinutes({ start_time: "09:00", end_time: "09:30", planned_minutes: 60 })
    ).toBe(30);
  });

  it("accepts HH:mm:ss values from the database", () => {
    expect(taskDurationMinutes({ start_time: "09:00:00", end_time: "09:45:00" })).toBe(45);
  });

  it("falls back to planned_minutes without a usable frame", () => {
    expect(taskDurationMinutes({ planned_minutes: 45 })).toBe(45);
    expect(taskDurationMinutes({ start_time: "09:00", planned_minutes: 20 })).toBe(20);
    expect(
      taskDurationMinutes({ start_time: "10:00", end_time: "10:00", planned_minutes: 15 })
    ).toBe(15);
    expect(
      taskDurationMinutes({ start_time: "11:00", end_time: "10:00", planned_minutes: 15 })
    ).toBe(15);
  });

  it("returns null when nothing is known", () => {
    expect(taskDurationMinutes({})).toBeNull();
    expect(taskDurationMinutes({ planned_minutes: 0 })).toBeNull();
    expect(taskDurationMinutes({ start_time: "10:00", end_time: "09:00" })).toBeNull();
    expect(taskDurationMinutes({ start_time: "bad", end_time: "10:00" })).toBeNull();
  });

  it("formats with formatMinutes", () => {
    const min = taskDurationMinutes({ start_time: "09:00", end_time: "12:00" });
    expect(formatMinutes(min!)).toBe("3h00m");
  });
});
