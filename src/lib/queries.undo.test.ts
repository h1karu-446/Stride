import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invalidateQueries: vi.fn(),
  cancelQueries: vi.fn(),
  setQueryData: vi.fn(),
  lastOptions: null as null | Record<string, (...args: unknown[]) => unknown>,
}));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ session: { user: { id: "owner" } } }) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => options,
  useMutation: (options: Record<string, (...args: unknown[]) => unknown>) => {
    mocks.lastOptions = options;
    return { ...options, mutate: vi.fn() };
  },
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidateQueries,
    cancelQueries: mocks.cancelQueries,
    setQueryData: mocks.setQueryData,
  }),
}));
import { useDeleteTaskWithUndo, useRestoreDeletedTask } from "./queries";
import { useTaskUndoStore } from "./taskUndoStore";
import type { Task } from "@/types";

const task: Task = {
  id: "t1",
  user_id: "owner",
  title: "英単語",
  importance: "重",
  scheduled_date: "2026-09-30",
  completed: false,
  routine_id: "r1",
  from_routine: true,
  plan_id: "p1",
  is_milestone: false,
  created_at: "2026-09-30T00:00:00Z",
  updated_at: "2026-09-30T00:00:00Z",
};
const row = { ...task, start_time: null, end_time: null, memo: null, planned_minutes: 30, carried_from: null };

function options() {
  if (!mocks.lastOptions) throw new Error("no mutation");
  return mocks.lastOptions;
}
// Applies the updater passed to setQueryData to a cache value.
function applyLastUpdate(cache: Task[]) {
  const updater = mocks.setQueryData.mock.calls.at(-1)?.[1] as (old: Task[]) => Task[];
  return updater(cache);
}

beforeEach(() => {
  vi.clearAllMocks();
  useTaskUndoStore.setState({ notices: [] });
});

describe("useDeleteTaskWithUndo", () => {
  it("deletes through the RPC and keeps the whole row for undo", async () => {
    useDeleteTaskWithUndo();
    mocks.rpc.mockResolvedValue({ data: { task: row, carried_copy_ids: ["c1"] }, error: null });
    const snapshot = await options().mutationFn(task);
    expect(mocks.rpc).toHaveBeenCalledWith("delete_task_for_undo", { p_task_id: "t1" });
    expect(snapshot).toEqual({ task: row, carriedCopyIds: ["c1"] });

    options().onSuccess(snapshot, task);
    const [notice] = useTaskUndoStore.getState().notices;
    expect(notice).toMatchObject({ kind: "deleted", taskId: "t1", title: "英単語", status: "idle" });
  });

  it("hides the row at once", async () => {
    useDeleteTaskWithUndo();
    await options().onMutate(task);
    expect(mocks.cancelQueries).toHaveBeenCalled();
    expect(applyLastUpdate([task, { ...task, id: "t2" }]).map((t) => t.id)).toEqual(["t2"]);
  });

  it("puts the row back and shows an error when the delete fails", () => {
    useDeleteTaskWithUndo();
    options().onError(new Error("offline"), task);
    expect(applyLastUpdate([]).map((t) => t.id)).toEqual(["t1"]);
    expect(useTaskUndoStore.getState().notices[0]).toMatchObject({ kind: "delete-failed", title: "英単語" });
    options().onSettled();
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["tasks"] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["reviews"] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["achievements"] });
  });

  it("does not bring back a task that is already gone", () => {
    useDeleteTaskWithUndo();
    options().onError({ code: "P0002", message: "not found" }, task);
    expect(mocks.setQueryData).not.toHaveBeenCalled();
    expect(useTaskUndoStore.getState().notices).toHaveLength(1);
  });
});

describe("useRestoreDeletedTask", () => {
  it("sends the snapshot back unchanged and refreshes scores and Journey", async () => {
    useRestoreDeletedTask();
    mocks.rpc.mockResolvedValue({ data: row, error: null });
    const restored = await options().mutationFn({ task: row, carriedCopyIds: ["c1"] });
    expect(mocks.rpc).toHaveBeenCalledWith("restore_deleted_task", { p_task: row, p_carried_copy_ids: ["c1"] });
    expect(restored).toMatchObject({ id: "t1", routine_id: "r1", plan_id: "p1", planned_minutes: 30 });
    options().onSettled();
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["achievements"] });
  });

  it("rejects a failed restore instead of reporting success", async () => {
    useRestoreDeletedTask();
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate" } });
    await expect(options().mutationFn({ task: row, carriedCopyIds: [] })).rejects.toMatchObject({ code: "23505" });
  });
});
