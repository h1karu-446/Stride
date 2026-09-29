import { describe, expect, it } from "vitest";
import { normalizeRecordedTime } from "./recordedTime";

describe("normalizeRecordedTime", () => {
  it("accepts the full day and normalizes a single-digit hour", () => {
    expect(normalizeRecordedTime("00:00")).toBe("00:00");
    expect(normalizeRecordedTime("23:59")).toBe("23:59");
    expect(normalizeRecordedTime("7:05")).toBe("07:05");
    expect(normalizeRecordedTime("705")).toBe("07:05");
    expect(normalizeRecordedTime("0730")).toBe("07:30");
  });

  it("rejects values that the review must not save", () => {
    for (const value of ["24:00", "2460", "12:60", "7:5", "12:00:00", "hello", ""]) {
      expect(normalizeRecordedTime(value)).toBeNull();
    }
  });
});
