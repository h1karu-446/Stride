import { describe, expect, it } from "vitest";
import {
  addNotice,
  canUndo,
  deletedNotice,
  deleteErrorMessage,
  expireNotices,
  markRestoreFailed,
  markRestoring,
  nextExpiry,
  parseDeleteResult,
  removeNotice,
  restoreErrorMessage,
  UNDO_WINDOW_MS,
  UndoNotice,
} from "./taskUndo";

const row = (id: string) => ({
  id,
  user_id: "u1",
  title: `task ${id}`,
  routine_id: "r1",
  scheduled_date: "2026-09-30",
  carried_from: null,
});
const snap = (id: string) => ({ task: row(id), carriedCopyIds: [] });

describe("parseDeleteResult", () => {
  it("keeps every column of the deleted row and the carried copies", () => {
    const parsed = parseDeleteResult({
      task: row("t1"),
      carried_copy_ids: ["c1", 3, null],
    });
    expect(parsed.task).toEqual(row("t1"));
    expect(parsed.carriedCopyIds).toEqual(["c1"]);
  });
  it("treats a missing copy list as empty", () => {
    expect(parseDeleteResult({ task: row("t1") }).carriedCopyIds).toEqual([]);
  });
  it.each([null, "x", {}, { task: {} }, { task: { id: 1 } }])(
    "rejects a malformed result %#",
    (data) => {
      expect(() => parseDeleteResult(data)).toThrow();
    }
  );
});

describe("undo notices", () => {
  const t0 = 1_000_000;

  it("gives each delete its own notice, in delete order", () => {
    let list: UndoNotice[] = [];
    list = addNotice(list, deletedNotice(snap("a"), "A", t0, "k1"));
    list = addNotice(list, deletedNotice(snap("b"), "B", t0 + 100, "k2"));
    expect(list.map((n) => n.title)).toEqual(["A", "B"]);
    expect(list.map((n) => n.taskId)).toEqual(["a", "b"]);
    expect(removeNotice(list, "k1").map((n) => n.key)).toEqual(["k2"]);
  });

  it("allows undo during the 5 seconds and not at or after the boundary", () => {
    const n = deletedNotice(snap("a"), "A", t0, "k1");
    expect(UNDO_WINDOW_MS).toBe(5000);
    expect(canUndo(n, t0)).toBe(true);
    expect(canUndo(n, t0 + 4999)).toBe(true);
    expect(canUndo(n, t0 + 5000)).toBe(false);
    expect(expireNotices([n], t0 + 4999)).toHaveLength(1);
    expect(expireNotices([n], t0 + 5000)).toHaveLength(0);
  });

  it("expires each notice on its own timer", () => {
    const list = [
      deletedNotice(snap("a"), "A", t0, "k1"),
      deletedNotice(snap("b"), "B", t0 + 2000, "k2"),
    ];
    expect(nextExpiry(list)).toBe(t0 + 5000);
    const left = expireNotices(list, t0 + 5000);
    expect(left.map((n) => n.key)).toEqual(["k2"]);
    expect(nextExpiry(left)).toBe(t0 + 7000);
  });

  it("keeps restoring and failed notices past the window", () => {
    let list: UndoNotice[] = [
      deletedNotice(snap("a"), "A", t0, "k1"),
      deletedNotice(snap("b"), "B", t0, "k2"),
    ];
    list = markRestoring(list, "k1");
    list = markRestoreFailed(list, "k2", "reason");
    const later = expireNotices(list, t0 + 60_000);
    expect(later).toHaveLength(2);
    expect(nextExpiry(later)).toBeNull();
    // a restore in flight cannot start again; a failed one can be retried
    expect(canUndo(later[0], t0 + 60_000)).toBe(false);
    expect(canUndo(later[1], t0 + 60_000)).toBe(true);
    // retrying clears the previous error
    const retry = markRestoring(later, "k2")[1];
    expect(retry.kind === "deleted" && retry.status).toBe("restoring");
    expect(retry.kind === "deleted" && retry.error).toBeUndefined();
  });

  it("does not expire or undo a delete failure notice", () => {
    const failure: UndoNotice = {
      kind: "delete-failed",
      key: "k1",
      taskId: "a",
      title: "A",
      error: "x",
    };
    expect(expireNotices([failure], t0 + 60_000)).toHaveLength(1);
    expect(canUndo(failure, t0)).toBe(false);
    expect(nextExpiry([failure])).toBeNull();
  });

  it("returns the same list when nothing expires", () => {
    const list = [deletedNotice(snap("a"), "A", t0, "k1")];
    expect(expireNotices(list, t0)).toBe(list);
  });
});

describe("error messages", () => {
  it("explains restore conflicts without claiming success", () => {
    expect(restoreErrorMessage({ code: "23505" })).toContain("既に");
    expect(restoreErrorMessage({ code: "23503" })).toContain("持ち越し元の予定のいずれかが削除されています");
    expect(restoreErrorMessage({ code: "42501" })).toContain("権限");
    expect(restoreErrorMessage(new Error("offline"))).toContain("再試行");
  });
  it("distinguishes an already deleted task from a network failure", () => {
    expect(deleteErrorMessage({ code: "P0002" })).toContain("見つかりません");
    expect(deleteErrorMessage(new Error("offline"))).toContain("通信");
  });
});
