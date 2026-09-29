import { useState } from "react";
import EmptyAddButton from "@/components/common/EmptyAddButton";
import { planHex } from "@/lib/plans/colors";
import type { Plan } from "@/types";

const NOTE_LINES = 6;

export default function GoalPanel({
  plan,
  onEdit,
}: {
  plan: Plan;
  onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!plan.goal) return <EmptyAddButton label="目標を設定" onClick={onEdit} />;

  const lines = (plan.goal_note ?? "").split("\n");
  const long = lines.length > NOTE_LINES;
  return (
    <div
      className="rounded-xl border px-6 py-5 grid gap-4 md:grid-cols-2"
      style={{ background: `${planHex(plan.color)}1F`, borderColor: `${planHex(plan.color)}55` }}
    >
      <div>
        <div className="label">目標</div>
        <div className="text-2xl font-bold break-words">{plan.goal}</div>
      </div>
      {plan.goal_note && (
        <div className="text-sm whitespace-pre-wrap md:border-l md:pl-6"
          style={{ borderColor: `${planHex(plan.color)}55` }}>
          {expanded || !long ? plan.goal_note : lines.slice(0, NOTE_LINES).join("\n")}
          {long && (
            <button type="button" onClick={() => setExpanded(!expanded)}
              className="block mt-1 text-xs text-blue-500 hover:underline">
              {expanded ? "閉じる" : "続きを表示"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
