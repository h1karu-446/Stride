import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invalidateQueries: vi.fn(),
  cancelQueries: vi.fn(),
  setQueryData: vi.fn(),
  getQueryData: vi.fn(),
  isMutating: vi.fn(),
  lastOptions: null as null | Record<string, unknown>,
}));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ session: { user: { id: "owner" } } }) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => options,
  useMutation: (options: Record<string, unknown>) => {
    mocks.lastOptions = options;
    return { ...options, mutate: vi.fn() };
  },
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidateQueries,
    cancelQueries: mocks.cancelQueries,
    setQueryData: mocks.setQueryData,
    getQueryData: mocks.getQueryData,
    isMutating: mocks.isMutating,
  }),
}));
import {
  BACKLOG_KEY,
  BACKLOG_MOVE_KEY,
  isAlreadyMoved,
  useScheduleBacklogItem,
  useUnscheduleTask,
} from "./queries";
import { useBacklogNotice } from "./notice";
import type { BacklogItem, Task } from "@/types";

type Fn = (...args: unknown[]) => unknown;
const opt = (name: string) => (mocks.lastOptions as Record<string, Fn>)[name];

const item: BacklogItem = {
  id: "i1", user_id: "owner", title: "レポート", importance: "重",
  created_at: "", updated_at: "",
};
const task = { id: "t1", title: "申請書" } as Task;

beforeEach(() => {
  vi.clearAllMocks();
  useBacklogNotice.setState({ notice: null });
});

describe("useScheduleBacklogItem", () => {
  it("shares the move key and sends both times or none", async () => {
    useScheduleBacklogItem();
    expect(mocks.lastOptions?.mutationKey).toEqual(BACKLOG_MOVE_KEY);
    mocks.rpc.mockResolvedValue({ error: null });
    await opt("mutationFn")({ itemId: "i1", date: "2026-10-24" });
    expect(mocks.rpc).toHaveBeenCalledWith("schedule_backlog_item", {
      p_item_id: "i1", p_date: "2026-10-24", p_start_time: null, p_end_time: null,
    });
  });

  it("removes the item at once and keeps its title for the notice", async () => {
    useScheduleBacklogItem();
    mocks.getQueryData.mockReturnValue([item]);
    const ctx = await opt("onMutate")({ itemId: "i1", date: "2026-10-24" });
    expect(ctx).toEqual({ title: "レポート" });
    const updater = mocks.setQueryData.mock.calls[0][1] as (old: BacklogItem[]) => BacklogItem[];
    expect(mocks.setQueryData.mock.calls[0][0]).toEqual(BACKLOG_KEY);
    expect(updater([item])).toEqual([]);
  });

  it("alerts on a failure, but not when the item was already moved", () => {
    useScheduleBacklogItem();
    opt("onError")({ code: "P0002" }, { itemId: "i1", date: "2026-10-24" }, { title: "レポート" });
    expect(useBacklogNotice.getState().notice).toBeNull();
    opt("onError")(new Error("offline"), { itemId: "i1", date: "2026-10-24" }, { title: "レポート" });
    expect(useBacklogNotice.getState().notice).toMatchObject({
      kind: "alert", text: "「レポート」をタスクにできませんでした。もう一度お試しください。",
    });
  });

  it("refetches only after the last move settles", () => {
    useScheduleBacklogItem();
    mocks.isMutating.mockReturnValue(2); // another move still running
    opt("onSettled")();
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
    mocks.isMutating.mockReturnValue(1); // only the settling one
    opt("onSettled")();
    expect(mocks.isMutating).toHaveBeenCalledWith({ mutationKey: BACKLOG_MOVE_KEY });
    expect(mocks.invalidateQueries.mock.calls.map((c) => c[0].queryKey)).toEqual([
      BACKLOG_KEY, ["tasks"], ["reviews"],
    ]);
  });
});

describe("useUnscheduleTask", () => {
  it("removes the task from the day at once", async () => {
    useUnscheduleTask();
    expect(mocks.lastOptions?.mutationKey).toEqual(BACKLOG_MOVE_KEY);
    await opt("onMutate")(task);
    expect(mocks.cancelQueries).toHaveBeenCalledWith({ queryKey: ["tasks"], exact: true });
    const updater = mocks.setQueryData.mock.calls[0][1] as (old: Task[]) => Task[];
    expect(updater([task, { ...task, id: "t2" }]).map((t) => t.id)).toEqual(["t2"]);
  });

  it("announces the result", () => {
    useUnscheduleTask();
    opt("onSuccess")(undefined, task);
    expect(useBacklogNotice.getState().notice).toMatchObject({
      kind: "status", text: "「申請書」をやることリストに戻しました",
    });
    opt("onError")({ code: "P0002" }, task);
    expect(useBacklogNotice.getState().notice?.kind).toBe("status"); // unchanged
  });
});

describe("isAlreadyMoved", () => {
  it("is P0002 only", () => {
    expect(isAlreadyMoved({ code: "P0002" })).toBe(true);
    expect(isAlreadyMoved({ code: "42501" })).toBe(false);
    expect(isAlreadyMoved(null)).toBe(false);
  });
});
