import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { DailyReview, DEFAULT_WAKE_TARGET, Importance, Task } from "@/types";

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
  highlight: string | null;
  tomorrow_intention: string | null;
  memo: string | null;
  completion_score: number;
  fulfillment_score: number;
  wake_score: number;
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
    highlight: r.highlight ?? undefined,
    tomorrow_intention: r.tomorrow_intention ?? undefined,
    memo: r.memo ?? undefined,
    completion_score: Number(r.completion_score),
    fulfillment_score: Number(r.fulfillment_score),
    wake_score: Number(r.wake_score ?? 0),
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

export type UpsertReviewInput = {
  date: string;
  fulfillment: number;
  wake_time?: string;
  wake_target?: string;
  highlight?: string;
  tomorrow_intention?: string;
  memo?: string;
};

export function useUpsertReview() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: UpsertReviewInput): Promise<DailyReview> => {
      if (!session) throw new Error("Not signed in");
      const payload = {
        user_id: session.user.id,
        date: input.date,
        fulfillment: input.fulfillment,
        wake_time: input.wake_time ?? null,
        wake_target: input.wake_target ?? null,
        highlight: input.highlight ?? null,
        tomorrow_intention: input.tomorrow_intention ?? null,
        memo: input.memo ?? null,
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

export type UpdateWakeFieldsInput = {
  date: string;
  wake_time?: string;
  wake_target?: string;
};

// Saves only wake_time/wake_target, leaving fulfillment/highlight/memo on the
// row untouched — lets the wake fields autosave independently of the "save
// review" button.
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

export function useWakeTarget(): string {
  const { session } = useAuth();
  const meta = session?.user.user_metadata as
    | { wake_target?: string }
    | undefined;
  return meta?.wake_target || DEFAULT_WAKE_TARGET;
}

export function useUpdateWakeTarget() {
  return useMutation({
    mutationFn: async (wakeTarget: string): Promise<void> => {
      const { error } = await supabase.auth.updateUser({
        data: { wake_target: wakeTarget },
      });
      if (error) throw error;
    },
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
