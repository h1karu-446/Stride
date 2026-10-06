// Undo notices for tasks deleted on Today (Issue #56). Pure logic only; the
// store (taskUndoStore.ts) and the component (TaskUndoNotices.tsx) use it.
//
// The delete itself is immediate (RPC delete_task_for_undo). A notice keeps
// the deleted row for UNDO_WINDOW_MS so it can be put back with
// restore_deleted_task. While restoring, or after a failed restore, the notice
// does not expire so the result is never hidden.

export const UNDO_WINDOW_MS = 5000;

/** The deleted row as the DB returned it (every column), plus copies that
 *  pointed at it through carried_from. Sent back unchanged on undo. */
export interface DeletedTaskSnapshot {
  task: Record<string, unknown>;
  carriedCopyIds: string[];
}

export type UndoNotice =
  | {
      kind: "deleted";
      key: string;
      taskId: string;
      title: string;
      snapshot: DeletedTaskSnapshot;
      status: "idle" | "restoring" | "failed";
      expiresAt: number;
      error?: string;
    }
  | {
      kind: "delete-failed";
      key: string;
      taskId: string;
      title: string;
      error: string;
    };

/** Parses the jsonb returned by delete_task_for_undo. */
export function parseDeleteResult(data: unknown): DeletedTaskSnapshot {
  if (!data || typeof data !== "object") {
    throw new Error("削除の結果を読み取れませんでした");
  }
  const { task, carried_copy_ids } = data as {
    task?: unknown;
    carried_copy_ids?: unknown;
  };
  if (!task || typeof task !== "object" || typeof (task as { id?: unknown }).id !== "string") {
    throw new Error("削除の結果を読み取れませんでした");
  }
  const copies = Array.isArray(carried_copy_ids)
    ? carried_copy_ids.filter((v): v is string => typeof v === "string")
    : [];
  return { task: task as Record<string, unknown>, carriedCopyIds: copies };
}

export function deletedNotice(
  snapshot: DeletedTaskSnapshot,
  title: string,
  now: number,
  key: string
): UndoNotice {
  return {
    kind: "deleted",
    key,
    taskId: String(snapshot.task.id),
    title,
    snapshot,
    status: "idle",
    expiresAt: now + UNDO_WINDOW_MS,
  };
}

/** Newest last, so the order on screen follows the order of the deletes. */
export function addNotice(list: UndoNotice[], notice: UndoNotice): UndoNotice[] {
  return [...list.filter((n) => n.key !== notice.key), notice];
}

export function removeNotice(list: UndoNotice[], key: string): UndoNotice[] {
  return list.filter((n) => n.key !== key);
}

/** Drops idle "deleted" notices whose window has passed. The window is
 *  inclusive of its start and exclusive of its end: at exactly expiresAt the
 *  undo is gone. */
export function expireNotices(list: UndoNotice[], now: number): UndoNotice[] {
  const next = list.filter(
    (n) => !(n.kind === "deleted" && n.status === "idle" && now >= n.expiresAt)
  );
  return next.length === list.length ? list : next;
}

/** When the next idle notice expires, or null if none will. */
export function nextExpiry(list: UndoNotice[]): number | null {
  let min: number | null = null;
  for (const n of list) {
    if (n.kind === "deleted" && n.status === "idle") {
      if (min === null || n.expiresAt < min) min = n.expiresAt;
    }
  }
  return min;
}

/** Undo can start while the window is open, or again after a failure. */
export function canUndo(notice: UndoNotice, now: number): boolean {
  if (notice.kind !== "deleted") return false;
  if (notice.status === "failed") return true;
  return notice.status === "idle" && now < notice.expiresAt;
}

export function markRestoring(list: UndoNotice[], key: string): UndoNotice[] {
  return list.map((n) =>
    n.key === key && n.kind === "deleted"
      ? { ...n, status: "restoring" as const, error: undefined }
      : n
  );
}

export function markRestoreFailed(
  list: UndoNotice[],
  key: string,
  error: string
): UndoNotice[] {
  return list.map((n) =>
    n.key === key && n.kind === "deleted"
      ? { ...n, status: "failed" as const, error }
      : n
  );
}

function errorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/** Reason shown after 「タイトル」を元に戻せませんでした。 */
export function restoreErrorMessage(err: unknown): string {
  switch (errorCode(err)) {
    case "23505":
      return "別の画面で同じタスク（または同じ日のメニュー）が既に戻されています";
    // restore_deleted_task (0024) checks the plan, menu and carried-from source first.
    case "23503":
      return "計画・メニュー・持ち越し元の予定のいずれかが削除されています";
    case "42501":
      return "権限がありません。サインインし直してください";
    default:
      return "通信を確認して再試行してください";
  }
}

/** Reason shown after 「タイトル」を削除できませんでした。 */
export function deleteErrorMessage(err: unknown): string {
  return errorCode(err) === "P0002"
    ? "タスクが見つかりません（別の画面で削除済みの可能性があります）"
    : "通信を確認してください";
}

/**
 * What the live regions say for a change of the notice list: only the latest
 * event, so the other notices are not read again (Issue #67).
 */
export function noticeAnnouncements(
  before: UndoNotice[],
  after: UndoNotice[]
): { polite: string; alert: string } {
  const old = new Map(before.map((n) => [n.key, n]));
  let polite = "";
  let alert = "";
  for (const n of after) {
    const prev = old.get(n.key);
    if (n.kind === "delete-failed") {
      if (!prev) alert = `「${n.title}」を削除できませんでした。${n.error}`;
    } else if (n.status === "failed" && !(prev?.kind === "deleted" && prev.status === "failed")) {
      alert = `「${n.title}」を元に戻せませんでした。${n.error ?? ""}`;
    } else if (!prev) {
      polite = `「${n.title}」を削除しました。元に戻せます`;
    }
  }
  const kept = new Set(after.map((n) => n.key));
  for (const n of before) {
    // Removed while restoring = the undo succeeded (expiry never removes a restoring notice).
    if (!kept.has(n.key) && n.kind === "deleted" && n.status === "restoring") {
      polite = `「${n.title}」を元に戻しました`;
    }
  }
  return { polite, alert };
}
