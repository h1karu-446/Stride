import { describe, expect, it } from "vitest";
import { reelMonths, reelTier } from "./reel";
import type { Achievement } from "@/types";

const row = (id: string, kind: Achievement["kind"], achieved_on: string, emphasized: boolean | null = null): Achievement => ({
  id, kind, achieved_on, emphasized, user_id: "u", title: id, plan_id: null, plan_name: null, plan_color: null, started_at: null,
});

describe("reelTier", () => {
  it("sizes wishes by importance and steps emphasized ones up", () => {
    expect(reelTier(row("a", "wish", "2026-09-01", false), "軽")).toBe("s");
    expect(reelTier(row("a", "wish", "2026-09-01", false), "重")).toBe("l");
    expect(reelTier(row("a", "wish", "2026-09-01", true), "重")).toBe("xl");
    expect(reelTier(row("a", "wish", "2026-09-01", true), "中")).toBe("l");
  });
  it("gives plans the large tier and materials the small one", () => {
    expect(reelTier(row("p", "plan", "2026-09-01"))).toBe("l");
    expect(reelTier(row("m", "milestone", "2026-09-01"))).toBe("m");
    expect(reelTier(row("t", "material", "2026-09-01"))).toBe("s");
  });
});

describe("reelMonths", () => {
  it("groups oldest month first and oldest first within a month, skipping empty months", () => {
    const months = reelMonths([row("c", "wish", "2026-09-20"), row("a", "plan", "2026-06-02"), row("b", "wish", "2026-09-01")]);
    expect(months.map((m) => m.key)).toEqual(["2026-06", "2026-09"]);
    expect(months[1].rows.map((r) => r.id)).toEqual(["b", "c"]);
    expect(months[1]).toMatchObject({ year: 2026, month: 9 });
  });
});
