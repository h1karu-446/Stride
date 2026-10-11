import type { PlanColor } from "@/types";

/** Order matters: it is the order used for the default color (spec 3.2). */
export const PLAN_COLORS: { key: PlanColor; label: string; hex: string }[] = [
  { key: "pink", label: "ピンク", hex: "#D15796" },
  { key: "orange", label: "オレンジ", hex: "#D9730D" },
  { key: "yellow", label: "イエロー", hex: "#CB912F" },
  { key: "green", label: "グリーン", hex: "#529E72" },
  { key: "teal", label: "ティール", hex: "#4DAB9A" },
  { key: "blue", label: "ブルー", hex: "#5B8FD9" },
  { key: "purple", label: "パープル", hex: "#9A6DD7" },
  { key: "gray", label: "グレー", hex: "#8A8985" },
  { key: "coral", label: "コーラル", hex: "#D66B5B" },
  { key: "lime", label: "ライム", hex: "#839B35" },
  { key: "indigo", label: "インディゴ", hex: "#6467BE" },
  { key: "brown", label: "ブラウン", hex: "#956E56" },
];

export function planHex(color: PlanColor): string {
  return PLAN_COLORS.find((c) => c.key === color)?.hex ?? "#8A8985";
}

/**
 * Steps away from the plan's color, as [hue in degrees, lightness in %], nearest first.
 * Mostly lightness: around orange and yellow even 30° of hue reads as another color.
 */
const SHADE_STEPS: [number, number][] = [
  [0, 0], [7, -10], [-7, 9], [12, 3], [-12, -6], [3, 14], [-3, -16], [10, -4], [-10, 5],
];
/** For a color with hardly any hue (gray), only the lightness changes. */
const GRAY_STEPS = [0, -12, 10, -22, 18, -6, 5, -17, 14];

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

/**
 * A color near the plan's color for the `index`-th phase, so neighbouring phase
 * bars can be told apart while the plan still reads as one color. The first
 * phase keeps the plan's color; the steps repeat after nine phases. For bars and
 * lines, not text: some shades are too light to read on white.
 */
export function phaseShade(planColor: string, index: number): string {
  const [h, s, l] = hexToHsl(planColor);
  const step = index % SHADE_STEPS.length;
  const clamp = (value: number) => Math.max(28, Math.min(68, value));
  if (s < 12) return hslToHex(h, s, clamp(l + GRAY_STEPS[step]));
  const [dh, dl] = SHADE_STEPS[step];
  return hslToHex((h + dh + 360) % 360, s, clamp(l + dl));
}
