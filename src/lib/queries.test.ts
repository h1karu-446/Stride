import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ session: { user: { id: "owner" } } }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: (options: unknown) => options, useMutation: (options: unknown) => options, useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
import { useReviews, useTasks } from "./queries";
import { fetchAllPages, PAGE_SIZE } from "./pagination";

// Serves `total` rows in pages, like PostgREST with max_rows; `failAt` makes that page's request fail.
function queryMock(total: number, row: (n: number) => Record<string, unknown>, failAt?: number) {
  const q = { select: vi.fn(), order: vi.fn(), range: vi.fn() };
  q.select.mockReturnValue(q);
  q.order.mockReturnValue(q);
  q.range.mockImplementation((start: number, end: number) => {
    if (start === failAt) return Promise.resolve({ data: null, error: new Error("offline") });
    const size = Math.max(0, Math.min(end + 1, total, start + 1000) - start);
    return Promise.resolve({ data: Array.from({ length: size }, (_, n) => row(start + n)), error: null });
  });
  mocks.from.mockReturnValue(q);
  return q;
}
const taskRow = (n: number) => ({ id: `t${n}`, title: `task ${n}`, importance: "medium", scheduled_date: "2026-09-30", start_time: "09:00:00", end_time: null, completed: false, memo: null, plan_id: null, routine_id: null, planned_minutes: null, is_milestone: false, created_at: "2026-09-30T00:00:00Z", updated_at: "2026-09-30T00:00:00Z" });
const reviewRow = (n: number) => ({ id: `r${n}`, date: `d${n}`, fulfillment: 3, wake_time: null, wake_target: null, bed_time: null, bed_target: null, highlight: null, tomorrow_intention: null, memo: null, completion_score: "10", fulfillment_score: "10", wake_score: null, bed_score: null, total_score: "20", cluster: "D" });
const run = <T,>(hook: unknown) => (hook as { queryFn: () => Promise<T[]> }).queryFn();
beforeEach(() => vi.clearAllMocks());

describe("useTasks pagination", () => {
  it("loads every task beyond the 1000-row API cap with a stable order", async () => {
    const q = queryMock(1001, taskRow);
    const tasks = await run<{ id: string; start_time?: string }>(useTasks());
    expect(tasks).toHaveLength(1001);
    expect(tasks[1000].id).toBe("t1000");
    expect(tasks[0].start_time).toBe("09:00");
    expect(mocks.from).toHaveBeenCalledWith("tasks");
    expect(q.range.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499]]);
    expect(q.order.mock.calls.slice(0, 2)).toEqual([["created_at", { ascending: true }], ["id", { ascending: true }]]);
  });
  it("rejects when a later page fails instead of returning a partial list", async () => {
    queryMock(1001, taskRow, 500);
    await expect(run(useTasks())).rejects.toThrow("offline");
  });
});

describe("useReviews pagination", () => {
  it("loads every review beyond the 1000-row API cap, newest date first", async () => {
    const q = queryMock(1234, reviewRow);
    const reviews = await run<{ id: string; total_score: number; wake_score: number }>(useReviews());
    expect(reviews).toHaveLength(1234);
    expect(reviews[1233].id).toBe("r1233");
    expect(reviews[0]).toMatchObject({ total_score: 20, wake_score: 0 });
    expect(mocks.from).toHaveBeenCalledWith("daily_reviews");
    expect(q.range).toHaveBeenCalledTimes(3);
    expect(q.order.mock.calls.slice(0, 2)).toEqual([["date", { ascending: false }], ["id", { ascending: true }]]);
  });
  it("rejects when a later page fails", async () => {
    queryMock(1500, reviewRow, 1000);
    await expect(run(useReviews())).rejects.toThrow("offline");
  });
});

describe("fetchAllPages", () => {
  it("stops after one extra empty request when the total is an exact multiple of the page size", async () => {
    const page = vi.fn((from: number, to: number) => Promise.resolve({ data: Array.from({ length: Math.max(0, Math.min(to + 1, PAGE_SIZE * 2) - from) }, (_, n) => from + n), error: null }));
    expect(await fetchAllPages(page)).toHaveLength(PAGE_SIZE * 2);
    expect(page).toHaveBeenCalledTimes(3);
  });
  it("returns an empty list when there are no rows", async () => {
    const page = vi.fn(() => Promise.resolve({ data: [], error: null }));
    expect(await fetchAllPages(page)).toEqual([]);
    expect(page).toHaveBeenCalledTimes(1);
  });
});
