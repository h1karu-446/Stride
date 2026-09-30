import clsx from "clsx";
import { planHex } from "@/lib/plans/colors";
import type { Plan } from "@/types";

const SIZE = {
  sm: "h-7 w-7 rounded-md text-sm",
  md: "h-9 w-9 rounded-lg text-base",
  lg: "h-12 w-12 rounded-xl text-2xl",
};

/** Notion-style page icon: the plan's first character on a tint of its colour. */
export default function PlanIcon({ plan, size = "md", className }: {
  plan: Pick<Plan, "name" | "color">;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const hex = planHex(plan.color);
  return (
    <span aria-hidden className={clsx("inline-flex shrink-0 select-none items-center justify-center font-bold", SIZE[size], className)}
      style={{ background: `${hex}1f`, color: hex, boxShadow: `inset 0 0 0 1px ${hex}33` }}>
      {Array.from(plan.name.trim())[0] ?? "・"}
    </span>
  );
}
