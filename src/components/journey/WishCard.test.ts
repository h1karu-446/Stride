import { describe, expect, it } from "vitest";
import { daysSinceLabel } from "./WishCard";

describe("daysSinceLabel", () => {
  it("shows today for a wish added today", () => {
    expect(daysSinceLabel("2026-09-30T03:00:00+00:00", "2026-09-30")).toBe("今日思いついた");
  });
  it("counts calendar days since the wish was added", () => {
    expect(daysSinceLabel("2026-09-20T03:00:00+00:00", "2026-09-30")).toBe("思い立って 10 日");
  });
});
