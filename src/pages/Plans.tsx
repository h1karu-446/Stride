import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SAVE_ERROR_MESSAGE } from "@/components/common/FormParts";
import PlanCard from "@/components/plans/PlanCard";
import PlanFormModal from "@/components/plans/PlanFormModal";
import PlanIcon from "@/components/plans/PlanIcon";
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

  const counts = [
    ["進行中", groups.active.length], ["休止中", groups.paused.length],
    ["構想中", groups.idea.length], ["完了", groups.done.length],
  ] as const;
  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">計画</h1>
        <p className="mt-1 text-sm muted">{counts.filter(([, n]) => n > 0).map(([label, n]) => `${label} ${n}`).join(" · ")}</p>
      </div>
      <button type="button" className="btn-primary" onClick={openCreate}>
        ＋ 新しい計画
      </button>
    </div>
  );

  return (
    <div className="space-y-8">
      {(plans ?? []).length === 0 ? (
        <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-dashed border-slate-300 py-20 text-center dark:border-notion-border">
          <p className="text-4xl" aria-hidden>🗺️</p>
          <p className="font-semibold">まだ計画がありません</p>
          <p className="text-sm muted">目標と期間を決めて、毎日のメニューにつなげましょう</p>
          <button type="button" className="btn-primary" onClick={openCreate}>
            ＋ 新しい計画
          </button>
        </div>
      ) : (
        <>
          {header}
          {summary.totalMinutes > 0 && (
            <section aria-label="今日の学習予定" className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-slate-200 bg-white px-5 py-4 dark:border-notion-border dark:bg-notion-panel">
              <div>
                <p className="section-title">今日の学習予定</p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums">{formatMinutes(summary.totalMinutes)}</p>
              </div>
              <div className="min-w-[240px] flex-1 space-y-2">
                <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-slate-100 dark:bg-notion-border">
                  {summary.byPlan.map(({ plan, minutes }) => (
                    <div key={plan.id} style={{ flexGrow: minutes, background: planHex(plan.color) }} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs muted">
                  {summary.byPlan.map(({ plan, minutes }) => (
                    <span key={plan.id} className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: planHex(plan.color) }} />
                      {plan.name} <span className="tabular-nums">{minutes}分</span>
                    </span>
                  ))}
                </div>
              </div>
            </section>
          )}

          {groups.active.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-5 py-8 text-center text-sm muted dark:border-notion-border">進行中の計画はありません</p>
          ) : (
            <section aria-label="進行中" className="space-y-3">
            <h2 className="section-title">進行中</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {groups.active.map((p) => (
                <PlanCard key={p.id} plan={p} tasks={tasks} today={today} />
              ))}
            </div>
            </section>
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
      <h2 className="section-title flex items-center gap-2">
        {PLAN_STATUS_LABEL[status]}
        <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-medium tabular-nums dark:bg-notion-panel-hover">{plans.length}</span>
      </h2>
      {plans.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-xs muted dark:border-notion-border">なし</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-notion-border dark:bg-notion-panel">
          {shown.map((p) => (
            <div
              key={p.id}
              className="group flex items-center justify-between gap-2 px-3 py-2 text-sm transition hover:bg-slate-50 dark:hover:bg-notion-panel-hover"
            >
              <Link to={`/plans/${p.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                <span className={p.status === "done" ? "" : "opacity-70"}><PlanIcon plan={p} size="sm" /></span>
                <span className="truncate">{p.name}</span>
                {status === "done" && <span className="text-xs text-emerald-600 dark:text-emerald-400" aria-label="完了">✓</span>}
                {status === "done" && (
                  <span className="ml-auto text-xs muted shrink-0">{planSpanLabel(p)}</span>
                )}
              </Link>
              {status !== "done" && (
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-xs font-medium text-notion-blue opacity-70 transition hover:bg-notion-blue/10 group-hover:opacity-100 focus-visible:opacity-100"
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
