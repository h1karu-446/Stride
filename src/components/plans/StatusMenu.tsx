import { useState } from "react";
import { PLAN_STATUS_LABEL } from "@/lib/plans/logic";
import type { PlanStatus } from "@/types";

export default function StatusMenu({
  status,
  onChange,
}: {
  status: PlanStatus;
  onChange: (s: PlanStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        aria-haspopup="menu" aria-expanded={open}
        className="rounded-full border border-slate-300 dark:border-notion-border px-3 py-1 text-xs hover:bg-slate-50 dark:hover:bg-notion-panel-hover">
        {PLAN_STATUS_LABEL[status]} ▾
      </button>
      {open && (
        <div role="menu"
          className="absolute left-0 z-20 mt-1 w-28 rounded-md border border-slate-200 dark:border-notion-border bg-white dark:bg-notion-panel shadow-lg py-1">
          {(Object.keys(PLAN_STATUS_LABEL) as PlanStatus[]).map((s) => (
            <button key={s} role="menuitem" type="button"
              onClick={() => { setOpen(false); if (s !== status) onChange(s); }}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-notion-panel-hover">
              {s === status ? "✓ " : ""}{PLAN_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
