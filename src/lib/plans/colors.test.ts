import { describe, expect, it } from "vitest";
import { PLAN_COLORS, phaseShade } from "./colors";
import { phaseColors } from "./logic";
import type { Phase } from "@/types";

describe("phaseShade", () => {
  it("keeps the plan's color for the first phase", () => {
    for (const { hex } of PLAN_COLORS) expect(phaseShade(hex, 0)).toBe(hex.toUpperCase());
  });

  it("gives each of the first nine phases a different color", () => {
    for (const { hex } of PLAN_COLORS) {
      const shades = Array.from({ length: 9 }, (_, i) => phaseShade(hex, i));
      expect(new Set(shades).size).toBe(9);
    }
  });

  it("repeats after nine phases", () => {
    expect(phaseShade("#5B8FD9", 9)).toBe(phaseShade("#5B8FD9", 0));
  });

  it("returns a 6-digit hex color, so alpha can be appended", () => {
    for (const { hex } of PLAN_COLORS) {
      for (let i = 0; i < 9; i++) expect(phaseShade(hex, i)).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe("phaseColors", () => {
  const phase = (id: string, start_date?: string, is_implicit = false) =>
    ({ id, plan_id: "p", is_implicit, start_date, end_date: start_date, routines: [] }) as Phase;

  it("numbers the phases by start date, leaving out the implicit phase", () => {
    const colors = phaseColors([phase("late", "2026-11-01"), phase("implicit", undefined, true),
      phase("early", "2026-10-01")], "#5B8FD9");
    expect(colors.get("early")).toBe(phaseShade("#5B8FD9", 0));
    expect(colors.get("late")).toBe(phaseShade("#5B8FD9", 1));
    expect(colors.has("implicit")).toBe(false);
  });
});
