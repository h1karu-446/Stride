import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { fetchAllPages } from "@/lib/pagination";
import { format, parseISO } from "date-fns";
import { todayISO } from "@/lib/date";
import { useBacklogNotice } from "./notice";
import type { BacklogItem, Importance, Task } from "@/types";

// The to-do list (やることリスト, Issue #83, migration 0026). Moving between
// the list and a day goes through RPCs so the task and the item change in one
// transaction.

export const BACKLOG_KEY = ["backlog_items"] as const;

interface BacklogRow {
  id: string;
  user_id: string;
  title: string;
  importance: Importance;
  deadline: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

function rowToItem(r: BacklogRow): BacklogItem {
  return {
    id: r.id,
    user_id: r.user_id,
    title: r.title,
    importance: r.importance,
    deadline: r.deadline ?? undefined,
    memo: r.memo ?? undefined,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function useBacklogItems() {
  const { session } = useAuth();
  return useQuery({
    queryKey: BACKLOG_KEY,
    enabled: !!session,
    queryFn: async (): Promise<BacklogItem[]> => {
      const rows = await fetchAllPages<BacklogRow>((from, to) =>
        supabase
          .from("backlog_items")
          .select("*")
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to)
      );
      return rows.map(rowToItem);
    },
  });
}

export interface BacklogInput {
  title: string;
  importance: Importance;
  deadline?: string;
}

export function useAddBacklogItem() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: BacklogInput): Promise<void> => {
      if (!session) throw new Error("Not signed in");
      const { error } = await supabase.from("backlog_items").insert({
        user_id: session.user.id,
        title: input.title,
        importance: input.importance,
        deadline: input.deadline ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BACKLOG_KEY }),
  });
}

export function useUpdateBacklogItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: BacklogInput }): Promise<void> => {
      const { error } = await supabase
        .from("backlog_items")
        .update({
          title: input.title,
          importance: input.importance,
          deadline: input.deadline ?? null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BACKLOG_KEY }),
  });
}

export function useDeleteBacklogItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("backlog_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BACKLOG_KEY }),
  });
}

/** Moves between the list and a day share this key (see invalidateMoved). */
export const BACKLOG_MOVE_KEY = ["backlog_move"] as const;

/**
 * Refetches the list, the tasks and the reviews once the last move has
 * settled. Refetching after each one would bring back an item whose own move
 * is still running (it is removed optimistically), and it could be moved twice.
 * Called from onSettled, where the settling move still counts as running.
 */
function invalidateMoved(qc: ReturnType<typeof useQueryClient>) {
  if (qc.isMutating({ mutationKey: BACKLOG_MOVE_KEY }) > 1) return;
  qc.invalidateQueries({ queryKey: BACKLOG_KEY });
  qc.invalidateQueries({ queryKey: ["tasks"] });
  qc.invalidateQueries({ queryKey: ["reviews"] });
}

/** P0002: the item / task is already gone (moved on another device, or twice). */
export function isAlreadyMoved(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === "P0002";
}

// Read from the store at call time: the callbacks outlive the component that
// started the move (a dropped row unmounts at once).
function show(kind: "status" | "alert", text: string) {
  useBacklogNotice.getState().show(kind, text);
}

function dayLabel(date: string): string {
  return date === todayISO() ? "今日" : format(parseISO(date), "M/d");
}

/**
 * Moves an item to `date` (a time-less task, or with both times). The item
 * leaves the list at once; on a failure it comes back with the refetch and an
 * alert says so. An item already moved is not an error.
 */
export function useScheduleBacklogItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: BACKLOG_MOVE_KEY,
    mutationFn: async (v: {
      itemId: string;
      date: string;
      start_time?: string;
      end_time?: string;
    }): Promise<void> => {
      const { error } = await supabase.rpc("schedule_backlog_item", {
        p_item_id: v.itemId,
        p_date: v.date,
        p_start_time: v.start_time ?? null,
        p_end_time: v.end_time ?? null,
      });
      if (error) throw error;
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: BACKLOG_KEY });
      // The title is only for the notice; drops know the id alone.
      const title =
        qc.getQueryData<BacklogItem[]>(BACKLOG_KEY)?.find((i) => i.id === v.itemId)?.title ?? "";
      qc.setQueryData<BacklogItem[]>(BACKLOG_KEY, (old) =>
        old?.filter((i) => i.id !== v.itemId)
      );
      return { title };
    },
    onSuccess: (_d, v, ctx) =>
      show("status", `「${ctx?.title ?? ""}」を${dayLabel(v.date)}のタスクにしました`),
    onError: (e, _v, ctx) => {
      if (!isAlreadyMoved(e)) {
        show("alert", `「${ctx?.title ?? ""}」をタスクにできませんでした。もう一度お試しください。`);
      }
    },
    onSettled: () => invalidateMoved(qc),
  });
}

/**
 * Moves a task back to the list (see canUnschedule for which tasks). The task
 * leaves the day at once, like the item above.
 */
export function useUnscheduleTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: BACKLOG_MOVE_KEY,
    mutationFn: async (task: Pick<Task, "id" | "title">): Promise<void> => {
      const { error } = await supabase.rpc("unschedule_task", { p_task_id: task.id });
      if (error) throw error;
    },
    onMutate: async (task) => {
      await qc.cancelQueries({ queryKey: ["tasks"], exact: true });
      qc.setQueryData<Task[]>(["tasks"], (old) => old?.filter((t) => t.id !== task.id));
    },
    onSuccess: (_d, task) => show("status", `「${task.title}」をやることリストに戻しました`),
    onError: (e, task) => {
      if (!isAlreadyMoved(e)) show("alert", `「${task.title}」をやることリストに戻せませんでした。もう一度お試しください。`);
    },
    onSettled: () => invalidateMoved(qc),
  });
}
