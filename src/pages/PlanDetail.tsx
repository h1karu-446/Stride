import { useCallback, useMemo, useState } from "react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { Link, useNavigate, useParams } from "react-router-dom";
import EmptyAddButton from "@/components/common/EmptyAddButton";
import ExecutionSquares from "@/components/plans/ExecutionSquares";
import GoalPanel from "@/components/plans/GoalPanel";
import PhaseBar from "@/components/plans/PhaseBar";
import PhaseForm from "@/components/plans/PhaseForm";
import PlanFormModal from "@/components/plans/PlanFormModal";
import RoutineCard from "@/components/plans/RoutineCard";
import RoutineForm from "@/components/plans/RoutineForm";
import StatusMenu from "@/components/plans/StatusMenu";
import { addDaysISO, todayISO } from "@/lib/date";
import { planHex } from "@/lib/plans/colors";
import {
  daysLeftLabel,
  executionCells,
  formatDateLabel,
  initialPhase,
  shouldShowOverdueNotice,
  sortedPhases,
} from "@/lib/plans/logic";
import {
  useDeletePhase,
  useDeletePlan,
  useDeleteRoutine,
  usePlans,
  useSavePhase,
  useSaveRoutine,
  useUpdatePlan,
} from "@/lib/plans/queries";
import { useTasks } from "@/lib/queries";

type Editing =
  | { kind: "phase-add" }
  | { kind: "phase-edit" }
  | { kind: "routine-add" }
  | { kind: "routine-edit"; id: string }
  | null;

export default function PlanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: plans, isLoading } = usePlans();
  const { data: tasks = [] } = useTasks();
  const updatePlan = useUpdatePlan();
  const deletePlan = useDeletePlan();
  const savePhase = useSavePhase();
  const deletePhase = useDeletePhase();
  const saveRoutine = useSaveRoutine();
  const deleteRoutine = useDeleteRoutine();

  const [selectedId, setSelectedId] = useState<string>();
  const [editing, setEditingRaw] = useState<Editing>(null);
  const [planModal, setPlanModal] = useState(false);
  const today = todayISO();

  const plan = plans?.find((p) => p.id === id);
  const phases = useMemo(() => plan?.phases ?? [], [plan]);
  // Fall back to the initial choice when nothing (or a deleted phase) is selected.
  const selected =
    phases.find((p) => p.id === selectedId) ?? initialPhase(phases, today);
  const exec = useMemo(
    () => (plan ? executionCells(tasks, plan.id, today, 14) : undefined),
    [tasks, plan, today]
  );

  // Only one edit form at a time: opening another discards the current one.
  const setEditing = useCallback((e: Editing) => {
    savePhase.reset();
    saveRoutine.reset();
    deletePhase.reset();
    deleteRoutine.reset();
    setEditingRaw(e);
  }, [savePhase, saveRoutine, deletePhase, deleteRoutine]);
  const closeEditing = useCallback(() => setEditing(null), [setEditing]);

  if (isLoading) return <p className="text-sm muted">読み込み中…</p>;
  if (!plan || !selected || !exec) {
    return (
      <div className="py-24 text-center space-y-3">
        <p className="muted">計画が見つかりません</p>
        <Link to="/plans" className="text-blue-500 hover:underline text-sm">
          計画一覧へ
        </Link>
      </div>
    );
  }

  const color = planHex(plan.color);
  const explicit = sortedPhases(phases.filter((p) => !p.is_implicit));
  const hasPhases = explicit.length > 0;

  const phaseHeading = () => {
    if (!selected.start_date || !selected.end_date) return "";
    if (selected.start_date <= today && today <= selected.end_date) {
      return `残り ${differenceInCalendarDays(parseISO(selected.end_date), parseISO(today))}日`;
    }
    return selected.start_date > today
      ? `${formatDateLabel(selected.start_date, today)} から`
      : "終了";
  };

  const lastEnd = explicit[explicit.length - 1]?.end_date;
  const newPhaseStart = lastEnd && lastEnd >= today ? addDaysISO(lastEnd, 1) : today;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/plans" className="text-sm muted hover:underline">‹ 計画</Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: color }} />
          <h1 className="text-3xl font-bold tracking-tight break-words min-w-0">{plan.name}</h1>
          <StatusMenu
            status={plan.status}
            onChange={(status) => updatePlan.mutate({ id: plan.id, patch: { status } })}
          />
          {plan.due_date && (
            <span className="text-sm muted">
              {formatDateLabel(plan.due_date, today)} · {daysLeftLabel(plan.due_date, today)}
            </span>
          )}
          <button type="button" aria-label="計画を編集" className="ml-auto btn-outline !p-2"
            onClick={() => { updatePlan.reset(); setPlanModal(true); }}>
            ✎
          </button>
        </div>
        {updatePlan.isError && !planModal && (
          <p className="mt-2 text-xs text-red-500">保存できませんでした。もう一度お試しください</p>
        )}
      </div>

      {shouldShowOverdueNotice(plan, today) && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-orange-400/50 bg-orange-500/10 px-4 py-3 text-sm">
          <span>期日を過ぎました。この計画を完了にしますか？</span>
          <button type="button" className="btn-outline !py-1"
            onClick={() => updatePlan.mutate({ id: plan.id, patch: { status: "done" } })}>
            完了にする
          </button>
          <button type="button" aria-label="閉じる" className="ml-auto btn-ghost !p-1.5"
            onClick={() =>
              updatePlan.mutate({
                id: plan.id,
                patch: { overdue_notice_dismissed_for: plan.due_date! },
              })
            }>
            ✕
          </button>
        </div>
      )}

      <GoalPanel plan={plan} onEdit={() => setPlanModal(true)} />

      {hasPhases && (
        <PhaseBar
          phases={explicit}
          color={plan.color}
          selectedId={selected.id}
          today={today}
          onSelect={(pid) => { setSelectedId(pid); setEditing(null); }}
          onAdd={() => setEditing({ kind: "phase-add" })}
        />
      )}
      {!hasPhases && editing?.kind !== "phase-add" && (
        <button type="button" onClick={() => setEditing({ kind: "phase-add" })}
          className="text-sm muted hover:underline">
          ＋ フェーズを追加
        </button>
      )}

      {editing?.kind === "phase-add" && (
        <PhaseForm
          initial={{ name: "", start_date: newPhaseStart, end_date: addDaysISO(newPhaseStart, 29) }}
          siblings={phases}
          saving={savePhase.isPending}
          failed={savePhase.isError}
          onCancel={closeEditing}
          onSubmit={(input) =>
            savePhase.mutate({ planId: plan.id, input }, { onSuccess: closeEditing })
          }
        />
      )}

      <section className="card space-y-4">
        {!selected.is_implicit && (
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{selected.name}</h2>
            <div className="flex items-center gap-2 text-sm muted">
              <span>{phaseHeading()}</span>
              <button type="button" aria-label="フェーズを編集" className="btn-ghost !p-1.5"
                onClick={() => setEditing({ kind: "phase-edit" })}>✎</button>
            </div>
          </div>
        )}

        {editing?.kind === "phase-edit" && !selected.is_implicit && (
          <PhaseForm
            initial={{
              name: selected.name ?? "",
              start_date: selected.start_date ?? "",
              end_date: selected.end_date ?? "",
            }}
            siblings={phases}
            selfId={selected.id}
            saving={savePhase.isPending}
            failed={savePhase.isError || deletePhase.isError}
            onCancel={closeEditing}
            onSubmit={(input) =>
              savePhase.mutate(
                { planId: plan.id, phaseId: selected.id, input },
                { onSuccess: closeEditing }
              )
            }
            onDelete={() =>
              deletePhase.mutate(selected.id, {
                onSuccess: () => { setSelectedId(undefined); closeEditing(); },
              })
            }
          />
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            {selected.routines.map((r) =>
              editing?.kind === "routine-edit" && editing.id === r.id ? (
                <RoutineForm
                  key={r.id}
                  initial={{ ...r, menu: r.menu ?? "" }}
                  saving={saveRoutine.isPending}
                  failed={saveRoutine.isError || deleteRoutine.isError}
                  onCancel={closeEditing}
                  onSubmit={(input) =>
                    saveRoutine.mutate(
                      { phaseId: selected.id, routineId: r.id, input },
                      { onSuccess: closeEditing }
                    )
                  }
                  onDelete={() =>
                    deleteRoutine.mutate(r.id, { onSuccess: closeEditing })
                  }
                />
              ) : (
                <RoutineCard key={r.id} routine={r}
                  onEdit={() => setEditing({ kind: "routine-edit", id: r.id })} />
              )
            )}
            {editing?.kind === "routine-add" ? (
              <RoutineForm
                initial={{
                  title: plan.name, minutes: 30, weekdays: [1, 2, 3, 4, 5, 6, 7],
                  importance: "中", menu: "",
                }}
                saving={saveRoutine.isPending}
                failed={saveRoutine.isError}
                onCancel={closeEditing}
                onSubmit={(input) =>
                  saveRoutine.mutate({ phaseId: selected.id, input }, { onSuccess: closeEditing })
                }
              />
            ) : selected.routines.length === 0 ? (
              <EmptyAddButton label="ルーティンを追加"
                onClick={() => setEditing({ kind: "routine-add" })} />
            ) : (
              <button type="button" className="text-sm muted hover:underline"
                onClick={() => setEditing({ kind: "routine-add" })}>
                ＋ ルーティンを追加
              </button>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-notion-border p-4 flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <span className="text-sm muted">直近14日</span>
              <span>
                <span className="text-xl font-bold">{exec.done}</span>
                <span className="text-xs muted"> / {exec.target}日</span>
              </span>
            </div>
            <div className="mt-auto">
              <ExecutionSquares cells={exec.cells} color={color} today={today} size="lg" showNone />
            </div>
          </div>
        </div>
      </section>

      {planModal && (
        <PlanFormModal
          mode="edit"
          initial={{
            name: plan.name,
            color: plan.color,
            status: plan.status,
            due_date: plan.due_date,
            goal: plan.goal ?? "",
            goal_note: plan.goal_note ?? "",
          }}
          saving={updatePlan.isPending}
          failed={updatePlan.isError || deletePlan.isError}
          onClose={() => setPlanModal(false)}
          onSubmit={(v) =>
            updatePlan.mutate(
              {
                id: plan.id,
                patch: {
                  name: v.name, color: v.color, due_date: v.due_date ?? "",
                  goal: v.goal ?? "", goal_note: v.goal_note ?? "",
                },
              },
              { onSuccess: () => setPlanModal(false) }
            )
          }
          onDelete={() => {
            if (window.confirm("この計画を削除しますか？ フェーズ・ルーティン・教材も削除されます")) {
              deletePlan.mutate(plan.id, { onSuccess: () => navigate("/plans") });
            }
          }}
        />
      )}
    </div>
  );
}
