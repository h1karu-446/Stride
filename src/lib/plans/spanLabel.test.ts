import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Achievement, Plan } from "@/types";
import { planSpanLabel, spanLabel } from "./logic";

// Issue #34: Journey used the UTC date of plans.created_at, so a plan created
// between 00:00 and 09:00 JST started a day (or month) earlier than on Plans.
// Pin the device time zone to Japan for these cases; Node reads TZ on each use.
beforeAll(() => { vi.stubEnv("TZ", "Asia/Tokyo"); });
afterAll(() => { vi.unstubAllEnvs(); });

const plan = (created_at: string, completed_at?: string): Plan => ({
  id: "p1", name: "英語", color: "pink", status: "done", phases: [], materials: [],
  created_at, updated_at: created_at, completed_at,
});
// What the achievements view returns for the same plan (0012: started_at = plans.created_at).
const achievement = (p: Plan): Achievement => ({
  kind: "plan", id: p.id, user_id: "owner", title: p.name, achieved_on: p.completed_at!,
  plan_id: p.id, plan_name: p.name, plan_color: p.color, started_at: p.created_at,
});
const journeyLabel = (a: Achievement) => spanLabel(a.started_at!, a.achieved_on);

describe("UT-34 plan span matches between Plans and Journey", () => {
  it("runs in Japan time", () => {
    expect(new Date("2026-03-31T20:30:00Z").getDate()).toBe(1);
  });
  it("uses the local month for a plan created between 00:00 and 09:00 JST", () => {
    // 2026-04-01 05:30 JST is still 2026-03-31 in UTC.
    const p = plan("2026-03-31T20:30:00+00:00", "2026-08-15");
    expect(planSpanLabel(p)).toBe("2026/4 – 8");
    expect(journeyLabel(achievement(p))).toBe(planSpanLabel(p));
  });
  it("uses the local year when the UTC date is still the previous year", () => {
    // 2026-01-01 00:30 JST is 2025-12-31 in UTC.
    const p = plan("2025-12-31T15:30:00+00:00", "2026-03-01");
    expect(planSpanLabel(p)).toBe("2026/1 – 3");
    expect(journeyLabel(achievement(p))).toBe(planSpanLabel(p));
  });
  it("uses the same unpadded format as Plans across years and within a month", () => {
    const acrossYears = plan("2025-11-10T01:00:00+00:00", "2026-02-03");
    expect(journeyLabel(achievement(acrossYears))).toBe("2025/11 – 2026/2");
    const sameMonth = plan("2026-05-02T01:00:00+00:00", "2026-05-20");
    expect(journeyLabel(achievement(sameMonth))).toBe("2026/5");
    expect(planSpanLabel(sameMonth)).toBe("2026/5");
  });
});
