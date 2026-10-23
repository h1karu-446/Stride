// Scrolling a list while dragging near (or past) its top / bottom edge, so a
// drag can reach what is outside the visible part (the timeline on Today).

/** Height of the band along each edge where scrolling starts. */
export const EDGE_SCROLL_PX = 48;
/** Fastest scroll, in px per step of about 16ms (at or past the edge). */
export const EDGE_SCROLL_MAX = 16;

/**
 * Pixels to scroll per step (about 16ms) for a pointer at `clientY` over a scroll box
 * spanning `top`..`bottom`: negative near the top, positive near the bottom,
 * 0 in between. Faster the closer to the edge; full speed at or past it.
 */
export function edgeScrollSpeed(clientY: number, top: number, bottom: number): number {
  const band = Math.min(EDGE_SCROLL_PX, (bottom - top) / 3);
  if (band <= 0) return 0;
  const fromTop = clientY - top;
  const fromBottom = bottom - clientY;
  if (fromTop < band) return -speedFor(fromTop, band);
  if (fromBottom < band) return speedFor(fromBottom, band);
  return 0;
}

function speedFor(distance: number, band: number): number {
  if (distance <= 0) return EDGE_SCROLL_MAX;
  return Math.max(1, Math.ceil((EDGE_SCROLL_MAX * (band - distance)) / band));
}
