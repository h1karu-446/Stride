import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SAVE_ERROR_MESSAGE } from "@/components/common/FormParts";
import PlanCard from "@/components/plans/PlanCard";
import PlanFormModal from "@/components/plans/PlanFormModal";
import { planHex } from "@/lib/plans/colors";
import {
  defaultPlanColor,
  formatMinutes,
  PLAN_STATUS_LABEL,
  planSpanLabel,
  sortActivePlans,
  sortInactivePlans,
  todaySummary,
} from "@/lib/plans/logic";
import { useCreatePlan, usePlans, useUpdatePlan } from "@/lib/plans/queries";
import { useTasks } from "@/lib/queries";
import { todayISO } from "@/lib/date";
import type { Plan, PlanStatus } from "@/types";

const LIST_LIMIT = 5;

export default function Plans() {
  const navigate = useNavigate();
  const { data: plans, isLoading, isError } = usePlans();
  const { data: tasks = [] } = useTasks();
  const create = useCreatePlan();
  const [creating, setCreating] = useState(false);
  const today = todayISO();

  const groups = useMemo(() => {
    const all = plans ?? [];
    const by = (s: PlanStatus) => all.filter((p) => p.status === s);
    return {
      active: sortActivePlans(by("active")),
      paused: sortInactivePlans(by("paused"), "paused"),
      idea: sortInactivePlans(by("idea"), "idea"),
      done: sortInactivePlans(by("done"), "done"),
    };
  }, [plans]);
  const summary = useMemo(() => todaySummary(plans ?? [], today), [plans, today]);

  if (isLoading) return <p className="text-sm muted">読み込み中…</p>;
  if (isError) return <p className="text-sm text-red-500">計画を読み込めませんでした</p>;

  const openCreate = () => {
    create.reset();
    setCreating(true);
  };

  const header = (
    <div className="flex items-center justify-between">
      <h1 className="text-3xl font-bold tracking-tight">計画</h1>
      <button type="button" className="btn-primary" onClick={openCreate}>
        ＋ 新しい計画
      </button>
    </div>
  );

  return (
    <div className="space-y-8">
      {(plans ?? []).length === 0 ? (
        <div className="py-24 text-center space-y-4">
          <p className="muted">まだ計画がありません</p>
          <button type="button" className="btn-primary" onClick={openCreate}>
            ＋ 新しい計画
          </button>
        </div>
      ) : (
        <>
          {header}
          {summary.totalMinutes > 0 && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="flex items-baseline gap-3">
                <span className="text-sm muted">今日の学習予定</span>
                <span className="text-2xl font-bold">{formatMinutes(summary.totalMinutes)}</span>
              </div>
              <div className="flex-1 min-w-[240px] max-w-xl space-y-1.5">
                <div className="flex h-1.5 gap-0.5 rounded-full overflow-hidden">
                  {summary.byPlan.map(({ plan, minutes }) => (
                    <div
                      key={plan.id}
                      style={{ flexGrow: minutes, background: planHex(plan.color) }}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 text-xs muted">
                  {summary.byPlan.map(({ plan, minutes }) => (
                    <span key={plan.id}>{plan.name} {minutes}分</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {groups.active.length === 0 ? (
            <p className="card text-sm muted">進行中の計画はありません</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {groups.active.map((p) => (
                <PlanCard key={p.id} plan={p} tasks={tasks} today={today} />
              ))}
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-3">
            <StatusColumn status="paused" plans={groups.paused} />
            <StatusColumn status="idea" plans={groups.idea} />
            <StatusColumn status="done" plans={groups.done} />
          </div>
        </>
      )}

      {creating && (
        <PlanFormModal
          mode="create"
          initial={{
            name: "",
            color: defaultPlanColor(plans ?? []),
            status: "active",
          }}
          saving={create.isPending}
          failed={create.isError}
          onClose={() => setCreating(false)}
          onSubmit={(v) =>
            create.mutate(v, {
              onSuccess: (id) => navigate(`/plans/${id}`),
            })
          }
        />
      )}
    </div>
  );
}

function StatusColumn({ status, plans }: { status: PlanStatus; plans: Plan[] }) {
  const update = useUpdatePlan();
  const [open, setOpen] = useState(false);
  const shown = open ? plans : plans.slice(0, LIST_LIMIT);
  const rest = plans.length - LIST_LIMIT;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold muted">
        {PLAN_STATUS_LABEL[status]}　{plans.length}
      </h2>
      {plans.length === 0 ? (
        <p className="text-sm muted px-1">なし</p>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-notion-border divide-y divide-slate-200 dark:divide-notion-border overflow-hidden">
          {shown.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-notion-panel-hover"
            >
              <Link to={`/plans/${p.id}`} className="flex flex-1 items-center gap-2.5 min-w-0">
                <Marker plan={p} />
                <span className="truncate">{p.name}</span>
                {status === "done" && (
                  <span className="ml-auto text-xs muted shrink-0">{planSpanLabel(p)}</span>
                )}
              </Link>
              {status !== "done" && (
                <button
                  type="button"
                  className="btn-outline !py-1 !px-2.5 text-xs"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id: p.id, patch: { status: "active" } })}
                >
                  {status === "paused" ? "再開" : "開始"}
                </button>
              )}
            </div>
          ))}
          {update.isError && (
            <p className="px-4 py-2 text-xs text-red-500">{SAVE_ERROR_MESSAGE}</p>
          )}
          {rest > 0 && (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="w-full px-4 py-2 text-left text-xs muted hover:bg-slate-50 dark:hover:bg-notion-panel-hover"
            >
              {open ? "閉じる" : `他 ${rest}件`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Marker({ plan }: { plan: Plan }) {
  const hex = planHex(plan.color);
  if (plan.status === "done") return <span className="text-emerald-500 text-xs">✓</span>;
  if (plan.status === "idea") {
    return <span className="w-2 h-2 rounded-full border shrink-0" style={{ borderColor: hex }} />;
  }
  return <span className="w-2 h-2 rounded-full shrink-0 opacity-50" style={{ background: hex }} />;
}
