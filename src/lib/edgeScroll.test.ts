import { describe, expect, it } from "vitest";
import { EDGE_SCROLL_MAX, EDGE_SCROLL_PX, edgeScrollSpeed } from "./edgeScroll";

// A scroll box from y = 100 to y = 660 (the timeline's 560px viewport).
const TOP = 100;
const BOTTOM = 660;

describe("edgeScrollSpeed", () => {
  it("does not scroll away from the edges", () => {
    expect(edgeScrollSpeed(380, TOP, BOTTOM)).toBe(0);
    expect(edgeScrollSpeed(TOP + EDGE_SCROLL_PX, TOP, BOTTOM)).toBe(0);
    expect(edgeScrollSpeed(BOTTOM - EDGE_SCROLL_PX, TOP, BOTTOM)).toBe(0);
  });
  it("scrolls up near the top and down near the bottom, faster closer to the edge", () => {
    const slowUp = edgeScrollSpeed(TOP + 40, TOP, BOTTOM);
    const fastUp = edgeScrollSpeed(TOP + 5, TOP, BOTTOM);
    expect(slowUp).toBeLessThan(0);
    expect(fastUp).toBeLessThan(slowUp);
    const slowDown = edgeScrollSpeed(BOTTOM - 40, TOP, BOTTOM);
    const fastDown = edgeScrollSpeed(BOTTOM - 5, TOP, BOTTOM);
    expect(slowDown).toBeGreaterThan(0);
    expect(fastDown).toBeGreaterThan(slowDown);
  });
  it("scrolls at full speed at or past the edge", () => {
    expect(edgeScrollSpeed(TOP, TOP, BOTTOM)).toBe(-EDGE_SCROLL_MAX);
    expect(edgeScrollSpeed(TOP - 200, TOP, BOTTOM)).toBe(-EDGE_SCROLL_MAX);
    expect(edgeScrollSpeed(BOTTOM, TOP, BOTTOM)).toBe(EDGE_SCROLL_MAX);
    expect(edgeScrollSpeed(BOTTOM + 200, TOP, BOTTOM)).toBe(EDGE_SCROLL_MAX);
  });
  it("keeps the bands from covering a small box", () => {
    // 60px box: each band is 20px, the middle 20px does not scroll.
    expect(edgeScrollSpeed(130, 100, 160)).toBe(0);
    expect(edgeScrollSpeed(110, 100, 160)).toBeLessThan(0);
  });
});
