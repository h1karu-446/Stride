import { useCallback, useMemo, useState } from "react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { Link, useNavigate, useParams } from "react-router-dom";
import EmptyAddButton from "@/components/common/EmptyAddButton";
import ExecutionSquares from "@/components/plans/ExecutionSquares";
import GoalPanel from "@/components/plans/GoalPanel";
import MaterialList from "@/components/plans/MaterialList";
import PhaseBar from "@/components/plans/PhaseBar";
import PhaseSettings from "@/components/plans/PhaseSettings";
import PlanHeader from "@/components/plans/PlanHeader";
import RoutineCard from "@/components/plans/RoutineCard";
import RoutineForm from "@/components/plans/RoutineForm";
import ScheduleList from "@/components/plans/ScheduleList";
import { addDaysISO, todayISO } from "@/lib/date";
import { planHex } from "@/lib/plans/colors";
import {
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
  useSavePhaseSettings,
  useSaveRoutine,
  useUpdatePlan,
} from "@/lib/plans/queries";
import { useTasks } from "@/lib/queries";

type Editing =
  | { kind: "phase-add" }
  | { kind: "phase-edit"; addRoutine?: boolean; openRoutineId?: string }
  | { kind: "routine-add" }
  | { kind: "routine-edit"; id: string }
  | { kind: "schedule"; id: string } // task id, or "new"
  | { kind: "material"; id: string } // material id, or "new"
  | null;

export default function PlanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: plans, isLoading } = usePlans();
  const { data: tasks = [] } = useTasks();
  const updatePlan = useUpdatePlan();
  const deletePlan = useDeletePlan();
  const savePhase = useSavePhaseSettings();
  const deletePhase = useDeletePhase();
  const saveRoutine = useSaveRoutine();
  const deleteRoutine = useDeleteRoutine();

  const [selectedId, setSelectedId] = useState<string>();
  const [editing, setEditingRaw] = useState<Editing>(null);
  const [phaseDirty, setPhaseDirty] = useState(false);
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

  // Keep a draft when the user accidentally switches phases or editors.
  const setEditing = useCallback((e: Editing) => {
    if (savePhase.isPending) return false;
    // The current settings panel already edits this phase. Reopening it with
    // the same React key would clear the parent's dirty flag but keep its draft.
    if (editing?.kind === "phase-edit" && e?.kind === "phase-edit") return false;
    if ((editing?.kind === "phase-add" || editing?.kind === "phase-edit") && phaseDirty
        && !window.confirm("保存していないフェーズの変更を破棄しますか？")) return false;
    savePhase.reset();
    saveRoutine.reset();
    deletePhase.reset();
    deleteRoutine.reset();
    setPhaseDirty(false);
    setEditingRaw(e);
    return true;
  }, [editing, phaseDirty, savePhase, saveRoutine, deletePhase, deleteRoutine]);
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
  const settingsRoutines = selected.routines.map(({ id, title, minutes, weekdays, importance, menu }) =>
    ({ id, title, minutes, weekdays, importance, menu }));

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
      <PlanHeader key={`header-${plan.id}`} plan={plan} today={today} deleteFailed={deletePlan.isError}
        onDelete={() => {
          if (window.confirm("この計画を削除しますか？ フェーズ・ルーティン・教材と、明日以降の未完了の予定も削除され、元に戻せません")) {
            deletePlan.mutate(plan.id, { onSuccess: () => navigate("/plans") });
          }
        }} />

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
          {updatePlan.isError && <p role="alert" className="w-full text-xs text-rose-600">保存できませんでした。もう一度操作してください</p>}
        </div>
      )}

      <GoalPanel key={`goal-${plan.id}`} plan={plan} />

      {hasPhases && (
        <PhaseBar
          phases={explicit}
          color={plan.color}
          selectedId={selected.id}
          today={today}
          onSelect={(pid) => { if (setEditing(null)) setSelectedId(pid); }}
          onAdd={() => setEditing({ kind: "phase-add" })}
        />
      )}
      {!hasPhases && editing?.kind !== "phase-add" && (
        <div className="rounded-xl bg-slate-50 p-5 dark:bg-notion-panel-hover">
          <h2 className="font-semibold">最初のフェーズを設定</h2>
          <p className="mt-1 text-sm muted">期間と、期間中に繰り返すメニューを決めます。</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setEditing({ kind: "phase-add" })}
              className="btn-primary">最初のフェーズを設定</button>
            <a href="#phase-activity" className="text-sm muted hover:underline">フェーズなしで使う ↓</a>
          </div>
        </div>
      )}

      {editing?.kind === "phase-add" && (
        <PhaseSettings
          initial={{ name: "", start_date: newPhaseStart, end_date: addDaysISO(newPhaseStart, 29) }}
          siblings={phases}
          existingRoutines={selected.is_implicit ? settingsRoutines : []}
          saving={savePhase.isPending}
          failed={savePhase.isError}
          onCancel={closeEditing}
          onDirtyChange={setPhaseDirty}
          onSave={(input, routines) =>
            savePhase.mutate({ planId: plan.id, input, routines }, { onSuccess: (phaseId) => {
              setSelectedId(phaseId); setPhaseDirty(false); setEditingRaw(null);
            } })
          }
        />
      )}

      <section id="phase-activity" className={`card space-y-4 ${editing?.kind === "phase-add" && !hasPhases ? "hidden" : ""}`}>
        {!selected.is_implicit && (
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setEditing({ kind: "phase-edit" })}
              className="rounded-lg text-left text-lg font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-notion-blue">
              {selected.name}
            </button>
            <div className="flex items-center gap-2 text-sm muted">
              <span>{phaseHeading()}</span>
              <button type="button" aria-label="フェーズを編集" className="btn-ghost !p-1.5"
                onClick={() => setEditing({ kind: "phase-edit" })}>✎</button>
            </div>
          </div>
        )}

        {editing?.kind === "phase-edit" && !selected.is_implicit && (
          <PhaseSettings key={`${selected.id}-${editing.addRoutine ? "add" : editing.openRoutineId ?? "edit"}`}
            initial={{
              name: selected.name ?? "",
              start_date: selected.start_date ?? "",
              end_date: selected.end_date ?? "",
            }}
            siblings={phases}
            selfId={selected.id}
            existingRoutines={settingsRoutines}
            startWithNewRoutine={editing.addRoutine}
            openRoutineId={editing.openRoutineId}
            saving={savePhase.isPending}
            failed={savePhase.isError || deletePhase.isError}
            onCancel={closeEditing}
            onDirtyChange={setPhaseDirty}
            onSave={(input, routines) =>
              savePhase.mutate(
                { planId: plan.id, phaseId: selected.id, input, routines },
                { onSuccess: () => { setPhaseDirty(false); setEditingRaw(null); } }
              )
            }
            onDelete={() => {
              if (window.confirm("このフェーズとメニューを削除しますか？ 作成済みのTodayタスクは残ります")) {
                deletePhase.mutate(selected.id, {
                  onSuccess: () => { setSelectedId(undefined); setPhaseDirty(false); setEditingRaw(null); },
                });
              }
            }}
          />
        )}

        {editing?.kind !== "phase-edit" && <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-3">
            {selected.routines.map((r) =>
              selected.is_implicit && editing?.kind === "routine-edit" && editing.id === r.id ? (
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
                  onEdit={() => selected.is_implicit
                    ? setEditing({ kind: "routine-edit", id: r.id })
                    : setEditing({ kind: "phase-edit", openRoutineId: r.id })} />
              )
            )}
            {selected.is_implicit && editing?.kind === "routine-add" ? (
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
              <EmptyAddButton label="メニューを追加"
                onClick={() => selected.is_implicit
                  ? setEditing({ kind: "routine-add" })
                  : setEditing({ kind: "phase-edit", addRoutine: true })} />
            ) : (
              <button type="button" className="text-sm muted hover:underline"
                onClick={() => selected.is_implicit
                  ? setEditing({ kind: "routine-add" })
                  : setEditing({ kind: "phase-edit", addRoutine: true })}>
                ＋ メニューを追加
              </button>
            )}
          </div>

          <div className="min-w-0 rounded-lg border border-slate-200 p-4 flex flex-col gap-4 dark:border-notion-border">
            <div className="flex items-start justify-between">
              <span className="text-sm muted">直近14日</span>
              <span>
                <span className="text-xl font-bold">{exec.done}</span>
                <span className="text-xs muted"> / {exec.target}日</span>
              </span>
            </div>
            <div className="mt-auto overflow-x-auto">
              <ExecutionSquares cells={exec.cells} color={color} today={today} size="lg" showNone />
            </div>
          </div>
        </div>}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <ScheduleList
          planId={plan.id}
          color={color}
          tasks={tasks}
          today={today}
          editing={editing?.kind === "schedule" ? editing.id : null}
          onEdit={(target) => setEditing({ kind: "schedule", id: target })}
          onClose={closeEditing}
        />
        <MaterialList
          plan={plan}
          color={color}
          phases={explicit}
          selectedPhaseId={hasPhases ? selected.id : undefined}
          today={today}
          editing={editing?.kind === "material" ? editing.id : null}
          onEdit={(target) => setEditing({ kind: "material", id: target })}
          onClose={closeEditing}
        />
      </div>

    </div>
  );
}
