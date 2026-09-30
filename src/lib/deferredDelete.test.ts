import { afterEach, describe, expect, it, vi } from "vitest";
import { UNDO_MS, useDeferredDelete } from "./deferredDelete";

afterEach(() => { vi.useRealTimers(); useDeferredDelete.setState({ pending: [], failed: null }); });

describe("deferred delete", () => {
  it("commits after the undo window", async () => {
    vi.useFakeTimers();
    const commit = vi.fn().mockResolvedValue(undefined);
    useDeferredDelete.getState().schedule({ key: "phase:1", label: "基礎", commit });
    expect(useDeferredDelete.getState().pending).toHaveLength(1);
    vi.advanceTimersByTime(UNDO_MS);
    expect(commit).toHaveBeenCalledOnce();
    expect(useDeferredDelete.getState().pending).toHaveLength(0);
  });

  it("never deletes when undone", () => {
    vi.useFakeTimers();
    const commit = vi.fn().mockResolvedValue(undefined);
    useDeferredDelete.getState().schedule({ key: "plan:1", label: "IELTS", commit });
    useDeferredDelete.getState().undo("plan:1");
    vi.advanceTimersByTime(UNDO_MS * 2);
    expect(commit).not.toHaveBeenCalled();
  });

  it("commits everything at once when flushed (leaving the page)", () => {
    vi.useFakeTimers();
    const a = vi.fn().mockResolvedValue(undefined);
    const b = vi.fn().mockResolvedValue(undefined);
    useDeferredDelete.getState().schedule({ key: "a", label: "A", commit: a });
    useDeferredDelete.getState().schedule({ key: "b", label: "B", commit: b });
    useDeferredDelete.getState().flushAll();
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("reports a failed delete and shows the item again", async () => {
    vi.useFakeTimers();
    useDeferredDelete.getState().schedule({ key: "m:1", label: "教材", commit: () => Promise.reject(new Error("x")) });
    vi.advanceTimersByTime(UNDO_MS);
    await vi.runAllTimersAsync();
    expect(useDeferredDelete.getState().failed).toContain("教材");
    expect(useDeferredDelete.getState().pending).toHaveLength(0);
  });
});
