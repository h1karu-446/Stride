import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { todayISO } from "@/lib/date";
import { linkablePhaseIds, materialStatusPatch } from "@/lib/plans/logic";
import type {
  Importance,
  Material,
  MaterialStatus,
  Phase,
  Plan,
  PlanColor,
  PlanStatus,
  Routine,
} from "@/types";

export const PLANS_KEY = ["plans"] as const;

interface RoutineRow {
  id: string;
  phase_id: string;
  title: string;
  minutes: number;
  weekdays: number[];
  importance: Importance;
  menu: string | null;
  created_at: string;
}
interface PhaseRow {
  id: string;
  plan_id: string;
  is_implicit: boolean;
  name: string | null;
  start_date: string | null;
  end_date: string | null;
  routines: RoutineRow[] | null;
}
interface PlanRow {
  id: string;
  name: string;
  color: PlanColor;
  status: PlanStatus;
  due_date: string | null;
  goal: string | null;
  goal_note: string | null;
  completed_at: string | null;
  overdue_notice_dismissed_for: string | null;
  created_at: string;
  updated_at: string;
  phases: PhaseRow[] | null;
  materials: MaterialRow[] | null;
}
interface MaterialRow {
  id: string;
  plan_id: string;
  title: string;
  url: string | null;
  note?: string | null; // undefined until migration 0017 is applied
  status: MaterialStatus;
  completed_at: string | null;
  created_at: string;
  material_phases: { phase_id: string }[] | null;
}

function rowToMaterial(r: MaterialRow): Material {
  return {
    id: r.id,
    plan_id: r.plan_id,
    title: r.title,
    url: r.url ?? undefined,
    note: r.note ?? undefined,
    status: r.status,
    completed_at: r.completed_at ?? undefined,
    phase_ids: (r.material_phases ?? []).map((mp) => mp.phase_id),
    created_at: r.created_at,
  };
}

function rowToRoutine(r: RoutineRow): Routine {
  return {
    id: r.id,
    phase_id: r.phase_id,
    title: r.title,
    minutes: r.minutes,
    weekdays: r.weekdays,
    importance: r.importance,
    menu: r.menu ?? undefined,
  };
}

function rowToPhase(r: PhaseRow): Phase {
  return {
    id: r.id,
    plan_id: r.plan_id,
    is_implicit: r.is_implicit,
    name: r.name ?? undefined,
    start_date: r.start_date ?? undefined,
    end_date: r.end_date ?? undefined,
    routines: [...(r.routines ?? [])]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(rowToRoutine),
  };
}

function rowToPlan(r: PlanRow): Plan {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    status: r.status,
    due_date: r.due_date ?? undefined,
    goal: r.goal ?? undefined,
    goal_note: r.goal_note ?? undefined,
    completed_at: r.completed_at ?? undefined,
    overdue_notice_dismissed_for: r.overdue_notice_dismissed_for ?? undefined,
    phases: (r.phases ?? []).map(rowToPhase),
    materials: (r.materials ?? []).map(rowToMaterial),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function usePlans() {
  const { session } = useAuth();
  return useQuery({
    queryKey: PLANS_KEY,
    enabled: !!session,
    queryFn: async (): Promise<Plan[]> => {
      const { data, error } = await supabase
        .from("plans")
        .select("*, phases(*, routines(*)), materials(*, material_phases(phase_id))");
      if (error) throw error;
      return ((data ?? []) as PlanRow[]).map(rowToPlan);
    },
  });
}

// --- plans -------------------------------------------------------------

export type PlanInput = {
  name: string;
  color: PlanColor;
  status: PlanStatus;
  due_date?: string;
  goal?: string;
  goal_note?: string;
};

export function useCreatePlan() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: PlanInput): Promise<string> => {
      if (!session) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("plans")
        .insert({
          user_id: session.user.id,
          name: input.name.trim(),
          color: input.color,
          status: input.status,
          due_date: input.due_date || null,
          goal: input.goal?.trim() || null,
          goal_note: input.goal_note?.trim() || null,
          completed_at: input.status === "done" ? todayISO() : null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLANS_KEY });
      qc.invalidateQueries({ queryKey: ["achievements"] });
    },
  });
}

export type PlanPatch = Partial<
  PlanInput & { overdue_notice_dismissed_for: string | null }
>;

export function useUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({
    scope: { id: "plan-update" },
    mutationFn: async ({ id, patch }: { id: string; patch: PlanPatch }) => {
      const db: Record<string, unknown> = { ...patch };
      if ("name" in patch && patch.name !== undefined) db.name = patch.name.trim();
      for (const k of ["due_date", "goal", "goal_note"] as const) {
        if (k in patch) db[k] = patch[k]?.trim?.() || null;
      }
      // The client sends its local date so completed_at is not shifted by UTC.
      if (patch.status === "done") db.completed_at = todayISO();
      const { error } = await supabase.from("plans").update(db).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLANS_KEY });
      qc.invalidateQueries({ queryKey: ["achievements"] });
    },
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_plan", {
        p_plan_id: id,
        p_today: todayISO(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLANS_KEY });
      qc.invalidateQueries({ queryKey: ["achievements"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["reviews"] });
    },
  });
}

// --- phases ------------------------------------------------------------

export type PhaseInput = { name: string; start_date: string; end_date: string };

export type PhaseRoutineInput = RoutineInput & { id?: string };

/** Phase fields and the complete routine list are committed in one DB transaction. */
export function useSavePhaseSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, phaseId, input, routines }: {
      planId: string;
      phaseId?: string;
      input: PhaseInput;
      routines: PhaseRoutineInput[];
    }): Promise<string> => {
      const { data, error } = await supabase.rpc("save_phase_settings", {
        p_plan_id: planId,
        p_phase_id: phaseId ?? null,
        p_name: input.name.trim(),
        p_start_date: input.start_date,
        p_end_date: input.end_date,
        p_routines: routines.map(({ id, ...routine }) => ({
          ...(id ? { id } : {}),
          ...routine,
          title: routine.title.trim(),
          menu: routine.menu?.trim() || null,
          weekdays: [...routine.weekdays].sort((a, b) => a - b),
        })),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PLANS_KEY }),
  });
}

export function useDeletePhase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (phaseId: string) => {
      const { error } = await supabase.rpc("delete_phase", {
        p_phase_id: phaseId,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PLANS_KEY }),
  });
}

// --- materials (BR-05) ---------------------------------------------------

export type MaterialInput = {
  title: string;
  url?: string;
  note?: string;
  status: MaterialStatus;
  phase_ids: string[];
};

/** The material row was saved, but syncing its phase links failed. */
export class MaterialSaveError extends Error {
  constructor(public readonly materialId: string, cause: unknown) {
    super("material_phases sync failed");
    this.cause = cause;
  }
}

/**
 * Makes the stored links equal `phaseIds`. It compares with the DB, not with
 * the cached row, so retrying after a partial failure converges.
 */
async function syncMaterialPhases(
  materialId: string,
  phaseIds: string[],
  { userId, isNew }: { userId: string; isNew: boolean }
) {
  if (!isNew) {
    let del = supabase.from("material_phases").delete().eq("material_id", materialId);
    if (phaseIds.length > 0) del = del.not("phase_id", "in", `(${phaseIds.join(",")})`);
    const { error } = await del;
    if (error) throw error;
  }
  if (phaseIds.length > 0) {
    const { error } = await supabase.from("material_phases").upsert(
      phaseIds.map((phase_id) => ({ material_id: materialId, phase_id, user_id: userId })),
      { onConflict: "material_id,phase_id", ignoreDuplicates: true }
    );
    if (error) throw error;
  }
}

/**
 * Inserts or updates a material and syncs its material_phases rows.
 * `phases` are the plan's phases: links to any other phase are dropped, since
 * the DB only checks ownership, not that the phase is in the same plan.
 */
export function useSaveMaterial() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({
      planId,
      material,
      phases,
      input,
    }: {
      planId: string;
      material?: Material; // the saved row when editing
      phases: Phase[];
      input: MaterialInput;
    }) => {
      if (!session) throw new Error("Not signed in");
      const body: Record<string, unknown> = {
        title: input.title.trim(),
        url: input.url?.trim() || null,
        note: input.note?.trim() || null,
        status: input.status,
      };
      // The client sends its local date so completed_at is not shifted by UTC.
      // Keep the stored date when an already-done material is saved again.
      if (input.status === "done" && material?.status !== "done") {
        body.completed_at = todayISO();
      }
      let id = material?.id;
      if (id) {
        const { error } = await supabase.from("materials").update(body).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("materials")
          .insert({ ...body, user_id: session.user.id, plan_id: planId })
          .select("id")
          .single();
        if (error) throw error;
        id = (data as { id: string }).id;
      }

      // The row is saved from here on. If syncing the links fails, report the
      // id so the caller retries as an edit of this row instead of inserting
      // a duplicate (the two writes are not one transaction).
      try {
        await syncMaterialPhases(id, linkablePhaseIds(input.phase_ids, phases), {
          userId: session.user.id,
          isNew: !material,
        });
      } catch (e) {
        throw new MaterialSaveError(id, e);
      }
      return id;
    },
    // Invalidate on failure too: a partial save (row saved, links not) must
    // not leave the cache showing the old state. Completed materials appear
    // in the achievements view (Journey).
    onSettled: () => {
      qc.invalidateQueries({ queryKey: PLANS_KEY });
      qc.invalidateQueries({ queryKey: ["achievements"] });
    },
  });
}

export function useDeleteMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("materials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLANS_KEY });
      qc.invalidateQueries({ queryKey: ["achievements"] });
    },
  });
}

/** The status menu: saves the chosen status, updating the cache first (design 5.4). */
export function useSetMaterialStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: MaterialStatus }) => {
      const { error } = await supabase
        .from("materials")
        .update(materialStatusPatch(status, todayISO()))
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: PLANS_KEY });
      const previous = qc.getQueryData<Plan[]>(PLANS_KEY);
      qc.setQueryData<Plan[]>(PLANS_KEY, (plans) =>
        plans?.map((p) => ({
          ...p,
          materials: p.materials.map((m) =>
            m.id === id
              ? {
                  ...m,
                  status,
                  completed_at: materialStatusPatch(status, todayISO()).completed_at ?? undefined,
                }
              : m
          ),
        }))
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(PLANS_KEY, ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: PLANS_KEY });
      qc.invalidateQueries({ queryKey: ["achievements"] });
    },
  });
}

// --- routines ----------------------------------------------------------

export type RoutineInput = {
  title: string;
  minutes: number;
  weekdays: number[];
  importance: Importance;
  menu?: string;
};

export function useSaveRoutine() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({
      phaseId,
      routineId,
      input,
    }: {
      phaseId: string;
      routineId?: string;
      input: RoutineInput;
    }) => {
      if (!session) throw new Error("Not signed in");
      const body = {
        title: input.title.trim(),
        minutes: input.minutes,
        weekdays: [...input.weekdays].sort((a, b) => a - b),
        importance: input.importance,
        menu: input.menu?.trim() || null,
      };
      if (routineId) {
        const { error } = await supabase
          .from("routines").update(body).eq("id", routineId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("routines").insert({
          ...body,
          user_id: session.user.id,
          phase_id: phaseId,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PLANS_KEY }),
  });
}

export function useDeleteRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("routines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PLANS_KEY }),
  });
}

// --- routine generation (ADR-0002, design 6.1) --------------------------

/**
 * Calls generate_routine_tasks for `date` when it is the device's today, once
 * per date. Runs in the background: the task list is never blocked on it, and
 * a failure only goes to the console (it is retried on the next open).
 * Past / future dates never generate (BR-02).
 */
export function useEnsureRoutineTasks(date: string) {
  const qc = useQueryClient();
  const { session } = useAuth();
  const calledFor = useRef<string | null>(null);
  const isToday = date === todayISO();
  const signedIn = !!session;

  useEffect(() => {
    if (!signedIn || !isToday) return;
    if (calledFor.current === date) return;
    calledFor.current = date;
    supabase
      .rpc("generate_routine_tasks", { p_date: date })
      .then(({ data, error }) => {
        if (error) {
          console.error("generate_routine_tasks failed", error);
          return;
        }
        if (typeof data === "number" && data > 0) {
          qc.invalidateQueries({ queryKey: ["tasks"] });
          qc.invalidateQueries({ queryKey: ["reviews"] });
        }
      });
  }, [date, isToday, signedIn, qc]);
}
