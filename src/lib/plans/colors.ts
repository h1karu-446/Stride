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
];

export function planHex(color: PlanColor): string {
  return PLAN_COLORS.find((c) => c.key === color)?.hex ?? "#8A8985";
}
