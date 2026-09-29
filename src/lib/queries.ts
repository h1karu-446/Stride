import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { todayISO } from "@/lib/date";
import {
  DailyReview,
  DEFAULT_BED_TARGET,
  DEFAULT_WAKE_TARGET,
  Importance,
  Task,
} from "@/types";

const TASKS_KEY = ["tasks"] as const;
const REVIEWS_KEY = ["reviews"] as const;

interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  importance: Importance;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  completed: boolean;
  memo: string | null;
  plan_id: string | null;
  routine_id: string | null;
  planned_minutes: number | null;
  created_at: string;
  updated_at: string;
}

interface ReviewRow {
  id: string;
  user_id: string;
  date: string;
  fulfillment: number;
  wake_time: string | null;
  wake_target: string | null;
  bed_time: string | null;
  bed_target: string | null;
  highlight: string | null;
  tomorrow_intention: string | null;
  memo: string | null;
  completion_score: number;
  fulfillment_score: number;
  wake_score: number;
  bed_score: number;
  total_score: number;
  cluster: "A" | "B" | "C" | "D" | "E";
  created_at: string;
  updated_at: string;
}

function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    user_id: r.user_id,
    title: r.title,
    importance: r.importance,
    scheduled_date: r.scheduled_date,
    start_time: r.start_time ? r.start_time.slice(0, 5) : undefined,
    end_time: r.end_time ? r.end_time.slice(0, 5) : undefined,
    completed: r.completed,
    memo: r.memo ?? undefined,
    plan_id: r.plan_id ?? undefined,
    routine_id: r.routine_id ?? undefined,
    planned_minutes: r.planned_minutes ?? undefined,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function rowToReview(r: ReviewRow): DailyReview {
  return {
    id: r.id,
    user_id: r.user_id,
    date: r.date,
    fulfillment: r.fulfillment,
    wake_time: r.wake_time ? r.wake_time.slice(0, 5) : undefined,
    wake_target: r.wake_target ? r.wake_target.slice(0, 5) : undefined,
    bed_time: r.bed_time ? r.bed_time.slice(0, 5) : undefined,
    bed_target: r.bed_target ? r.bed_target.slice(0, 5) : undefined,
    highlight: r.highlight ?? undefined,
    tomorrow_intention: r.tomorrow_intention ?? undefined,
    memo: r.memo ?? undefined,
    completion_score: Number(r.completion_score),
    fulfillment_score: Number(r.fulfillment_score),
    wake_score: Number(r.wake_score ?? 0),
    bed_score: Number(r.bed_score ?? 0),
    total_score: Number(r.total_score),
    cluster: r.cluster,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function useTasks() {
  const { session } = useAuth();
  return useQuery({
    queryKey: TASKS_KEY,
    enabled: !!session,
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(rowToTask);
    },
  });
}

export function useReviews() {
  const { session } = useAuth();
  return useQuery({
    queryKey: REVIEWS_KEY,
    enabled: !!session,
    queryFn: async (): Promise<DailyReview[]> => {
      const { data, error } = await supabase
        .from("daily_reviews")
        .select("*")
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToReview);
    },
  });
}

function invalidateAll(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: TASKS_KEY });
  qc.invalidateQueries({ queryKey: REVIEWS_KEY });
}

export type AddTaskInput = {
  title: string;
  importance: Importance;
  scheduled_date: string;
  start_time?: string;
  end_time?: string;
  memo?: string;
};

export function useAddTask() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: AddTaskInput): Promise<Task> => {
      if (!session) throw new Error("Not signed in");
      const payload = {
        user_id: session.user.id,
        title: input.title,
        importance: input.importance,
        scheduled_date: input.scheduled_date,
        start_time: input.start_time ?? null,
        end_time: input.end_time ?? null,
        memo: input.memo ?? null,
      };
      const { data, error } = await supabase
        .from("tasks")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      return rowToTask(data as TaskRow);
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Task>;
    }): Promise<Task> => {
      const dbPatch: Record<string, unknown> = { ...patch };
      if ("start_time" in dbPatch) {
        dbPatch.start_time = patch.start_time ?? null;
      }
      if ("end_time" in dbPatch) {
        dbPatch.end_time = patch.end_time ?? null;
      }
      delete dbPatch.id;
      delete dbPatch.user_id;
      delete dbPatch.created_at;
      delete dbPatch.updated_at;
      const { data, error } = await supabase
        .from("tasks")
        .update(dbPatch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return rowToTask(data as TaskRow);
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useToggleTask() {
  const update = useUpdateTask();
  return (task: Task) =>
    update.mutate({ id: task.id, patch: { completed: !task.completed } });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export type UpdateReviewFieldsInput = {
  date: string;
  fulfillment?: number;
  highlight?: string;
  tomorrow_intention?: string;
};

// Autosaves fulfillment/highlight/tomorrow_intention. Only the keys present in
// the input are written, so untouched columns — including the legacy `memo`,
// which the UI no longer edits — keep their stored values on upsert.
export function useUpdateReviewFields() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: UpdateReviewFieldsInput): Promise<DailyReview> => {
      if (!session) throw new Error("Not signed in");
      const payload: Record<string, unknown> = {
        user_id: session.user.id,
        date: input.date,
      };
      if (input.fulfillment !== undefined) payload.fulfillment = input.fulfillment;
      if (input.highlight !== undefined) payload.highlight = input.highlight || null;
      if (input.tomorrow_intention !== undefined) {
        payload.tomorrow_intention = input.tomorrow_intention || null;
      }
      const { data, error } = await supabase
        .from("daily_reviews")
        .upsert(payload, { onConflict: "user_id,date" })
        .select("*")
        .single();
      if (error) throw error;
      return rowToReview(data as ReviewRow);
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export type UpdateWakeFieldsInput = {
  date: string;
  wake_time?: string;
  wake_target?: string;
};

// Saves only wake_time/wake_target, leaving fulfillment/highlight/memo on the
// row untouched — lets the wake fields autosave independently.
export function useUpdateWakeFields() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: UpdateWakeFieldsInput): Promise<DailyReview> => {
      if (!session) throw new Error("Not signed in");
      const payload = {
        user_id: session.user.id,
        date: input.date,
        wake_time: input.wake_time ?? null,
        wake_target: input.wake_target ?? null,
      };
      const { data, error } = await supabase
        .from("daily_reviews")
        .upsert(payload, { onConflict: "user_id,date" })
        .select("*")
        .single();
      if (error) throw error;
      return rowToReview(data as ReviewRow);
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export type UpdateBedFieldsInput = {
  date: string;
  bed_time?: string;
  bed_target?: string;
};

// Saves only bed_time/bed_target, leaving the rest of the row untouched —
// mirrors useUpdateWakeFields so bed fields autosave independently too.
export function useUpdateBedFields() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: UpdateBedFieldsInput): Promise<DailyReview> => {
      if (!session) throw new Error("Not signed in");
      const payload = {
        user_id: session.user.id,
        date: input.date,
        bed_time: input.bed_time ?? null,
        bed_target: input.bed_target ?? null,
      };
      const { data, error } = await supabase
        .from("daily_reviews")
        .upsert(payload, { onConflict: "user_id,date" })
        .select("*")
        .single();
      if (error) throw error;
      return rowToReview(data as ReviewRow);
    },
    onSuccess: () => invalidateAll(qc),
  });
}

// When the account-level default target changes, past days that never got a
// per-day override should keep scoring against whatever default was in
// effect at the time — not silently get re-scored against the new default.
// So before flipping the default, freeze it onto every past row (before
// today) that doesn't already have an explicit override. The scoring
// trigger recomputes those rows' scores as part of this update, so the
// persisted wake/bed scores stay pinned to the old default too.
async function backfillPastTarget(
  userId: string,
  column: "wake_target" | "bed_target",
  oldValue: string
): Promise<void> {
  const { error } = await supabase
    .from("daily_reviews")
    .update({ [column]: oldValue })
    .eq("user_id", userId)
    .lt("date", todayISO())
    .is(column, null);
  if (error) throw error;
}

export function useWakeTarget(): string {
  const { session } = useAuth();
  const meta = session?.user.user_metadata as
    | { wake_target?: string }
    | undefined;
  return meta?.wake_target || DEFAULT_WAKE_TARGET;
}

export function useUpdateWakeTarget() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (wakeTarget: string): Promise<void> => {
      if (!session) throw new Error("Not signed in");
      const meta = session.user.user_metadata as
        | { wake_target?: string }
        | undefined;
      const oldValue = meta?.wake_target || DEFAULT_WAKE_TARGET;
      if (oldValue !== wakeTarget) {
        await backfillPastTarget(session.user.id, "wake_target", oldValue);
      }
      const { error } = await supabase.auth.updateUser({
        data: { wake_target: wakeTarget },
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useBedTarget(): string {
  const { session } = useAuth();
  const meta = session?.user.user_metadata as
    | { bed_target?: string }
    | undefined;
  return meta?.bed_target || DEFAULT_BED_TARGET;
}

export function useUpdateBedTarget() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (bedTarget: string): Promise<void> => {
      if (!session) throw new Error("Not signed in");
      const meta = session.user.user_metadata as
        | { bed_target?: string }
        | undefined;
      const oldValue = meta?.bed_target || DEFAULT_BED_TARGET;
      if (oldValue !== bedTarget) {
        await backfillPastTarget(session.user.id, "bed_target", oldValue);
      }
      const { error } = await supabase.auth.updateUser({
        data: { bed_target: bedTarget },
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteAll() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      if (!session) throw new Error("Not signed in");
      const uid = session.user.id;
      const { error: e1 } = await supabase
        .from("daily_reviews")
        .delete()
        .eq("user_id", uid);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("tasks")
        .delete()
        .eq("user_id", uid);
      if (e2) throw e2;
    },
    onSuccess: () => invalidateAll(qc),
  });
}
