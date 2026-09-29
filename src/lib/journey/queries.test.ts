import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), invalidateQueries: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ session: { user: { id: "owner" } } }) }));
vi.mock("@tanstack/react-query", () => ({ keepPreviousData: "keep-previous", useQuery: (options: unknown) => options, useMutation: (options: unknown) => options, useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) }));
import { useAchievements, useAnnualAchievements, useOldestAchievement, useWishes } from "./queries";
import { useCreatePlan, useUpdatePlan, useDeletePlan } from "@/lib/plans/queries";
import { useAddTask, useUpdateTask, useDeleteTask } from "@/lib/queries";

function queryMock(total: number, failure = false) {
  const q = { select: vi.fn(), is: vi.fn(), order: vi.fn(), gte: vi.fn(), lt: vi.fn(), in: vi.fn(), range: vi.fn() };
  for (const key of ["select", "is", "order", "gte", "lt", "in"] as const) q[key].mockReturnValue(q);
  q.range.mockImplementation((start: number, end: number) => Promise.resolve({ data: failure ? null : Array.from({ length: Math.max(0, Math.min(end + 1, total) - start) }, (_, n) => ({ id: String(start + n) })), error: failure ? new Error("offline") : null }));
  mocks.from.mockReturnValue(q);
  return q;
}
const run = (hook: unknown) => (hook as { queryFn: () => Promise<unknown[]> }).queryFn();
beforeEach(() => vi.clearAllMocks());
describe("Journey API pagination", () => {
  it("loads achievements beyond the API cap with stable ordering", async () => {
    const q = queryMock(1001);
    const rows = await run(useAchievements(3, "2026-09-29"));
    expect(rows).toHaveLength(1001);
    expect(q.range.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499]]);
    expect(q.order).toHaveBeenCalledWith("kind");
    expect(q.order).toHaveBeenCalledWith("id");
  });
  it("keeps the current feed visible while a wider range loads", () => {
    expect((useAchievements(6, "2026-09-29") as unknown as { placeholderData: unknown }).placeholderData).toBe("keep-previous");
  });
  it("reads only the oldest record date, or null when there is none", async () => {
    const q = { select: vi.fn(), order: vi.fn(), limit: vi.fn() };
    q.select.mockReturnValue(q); q.order.mockReturnValue(q);
    q.limit.mockResolvedValueOnce({ data: [{ achieved_on: "2025-01-02" }], error: null }).mockResolvedValueOnce({ data: [], error: null });
    mocks.from.mockReturnValue(q);
    const hook = useOldestAchievement() as unknown as { queryKey: unknown[]; queryFn: () => Promise<string | null> };
    expect(hook.queryKey[0]).toBe("achievements");
    expect(await hook.queryFn()).toBe("2025-01-02");
    expect(await hook.queryFn()).toBeNull();
    expect(q.order).toHaveBeenCalledWith("achieved_on");
    expect(q.limit).toHaveBeenCalledWith(1);
  });
  it("filters completed wishes on the server before fetching every page", async () => {
    const q = queryMock(501);
    expect(await run(useWishes())).toHaveLength(501);
    expect(q.is).toHaveBeenCalledWith("achieved_at", null);
    expect(q.range).toHaveBeenCalledTimes(2);
  });
  it("rejects failed loads rather than treating them as an empty history", async () => {
    queryMock(0, true);
    await expect(run(useWishes())).rejects.toThrow("offline");
  });
  it("counts the full calendar year separately from feed pagination", async () => {
    const q = queryMock(0);
    q.lt.mockResolvedValue({ count: 1205, error: null });
    expect(await run(useAnnualAchievements("2026"))).toBe(1205);
    expect(q.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(q.in).toHaveBeenCalledWith("kind", ["plan", "wish"]);
    expect(q.gte).toHaveBeenCalledWith("achieved_on", "2026-01-01");
    expect(q.lt).toHaveBeenCalledWith("achieved_on", "2027-01-01");
  });
});
it.each([useCreatePlan, useUpdatePlan, useDeletePlan, useAddTask, useUpdateTask, useDeleteTask])("invalidates achievements after %s", (hook) => {
  (hook() as unknown as { onSuccess: () => void }).onSuccess();
  expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["achievements"] });
});
