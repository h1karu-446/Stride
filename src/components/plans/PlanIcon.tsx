import clsx from "clsx";
import { planHex } from "@/lib/plans/colors";
import type { Plan } from "@/types";

const SIZE = {
  sm: "h-2.5 w-2.5 rounded-[3px]",
  md: "h-3 w-3 rounded-[4px]",
  lg: "h-4 w-4 rounded-[5px]",
};

/** A small rounded colour swatch that identifies a plan (Linear-style, no text). */
export default function PlanIcon({ plan, size = "md", className }: {
  plan: Pick<Plan, "color">;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const hex = planHex(plan.color);
  return (
    <span aria-hidden className={clsx("inline-block shrink-0", SIZE[size], className)}
      style={{ background: hex, boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.08), 0 0 0 3px ${hex}22` }} />
  );
}
