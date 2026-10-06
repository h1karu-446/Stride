import { useEffect, useRef, useState } from "react";
import { useRestoreDeletedTask } from "@/lib/queries";
import {
  canUndo,
  nextExpiry,
  noticeAnnouncements,
  restoreErrorMessage,
  UndoNotice,
} from "@/lib/taskUndo";
import { useTaskUndoStore } from "@/lib/taskUndoStore";

// One notice per deleted task, stacked at the bottom of the screen (Issue #56).
export function TaskUndoNotices() {
  const notices = useTaskUndoStore((s) => s.notices);
  const expire = useTaskUndoStore((s) => s.expire);

  // Screen readers: one persistent polite region and one assertive region
  // (nesting live regions, or adding them together with their text, is not
  // announced reliably). Each holds only the latest event, so a change to one
  // notice does not re-read the others.
  const [announce, setAnnounce] = useState({ polite: "", alert: "" });
  const previous = useRef<UndoNotice[]>([]);
  useEffect(() => {
    const next = noticeAnnouncements(previous.current, notices);
    previous.current = notices;
    if (next.polite || next.alert) {
      setAnnounce((cur) => ({ polite: next.polite || cur.polite, alert: next.alert || cur.alert }));
    }
  }, [notices]);

  // A notice that held focus disappears after undo or expiry; keep focus on
  // the page instead of letting it fall to <body>.
  const listRef = useRef<HTMLUListElement>(null);
  const hadFocus = useRef(false);
  useEffect(() => {
    if (!hadFocus.current) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const next = listRef.current?.querySelector<HTMLElement>("[data-undo-action]");
    (next ?? document.getElementById("main"))?.focus({ preventScroll: true });
    hadFocus.current = !!next && document.activeElement === next;
  }, [notices]);

  useEffect(() => {
    const at = nextExpiry(notices);
    if (at === null) return;
    const timer = window.setTimeout(
      () => expire(Date.now()),
      Math.max(0, at - Date.now())
    );
    return () => window.clearTimeout(timer);
  }, [notices, expire]);

  return (
    <div
      role="region"
      aria-label="タスクの削除"
      className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 pointer-events-none"
    >
      <p role="status" className="sr-only">{announce.polite}</p>
      <p role="alert" className="sr-only">{announce.alert}</p>
      <ul
        ref={listRef}
        className="flex w-full max-w-md flex-col gap-2"
        onFocus={() => { hadFocus.current = true; }}
        onBlur={(event) => {
          // A focused button that is removed may blur with relatedTarget null and
          // is then disconnected; keep the flag only in that case.
          const to = event.relatedTarget as Node | null;
          if (to ? !listRef.current?.contains(to) : event.target.isConnected) {
            hadFocus.current = false;
          }
        }}
      >
        {notices.map((n) => (
          <NoticeItem key={n.key} notice={n} />
        ))}
      </ul>
    </div>
  );
}

function NoticeItem({ notice }: { notice: UndoNotice }) {
  const remove = useTaskUndoStore((s) => s.remove);
  const restoring = useTaskUndoStore((s) => s.restoring);
  const restoreFailed = useTaskUndoStore((s) => s.restoreFailed);
  const restore = useRestoreDeletedTask();
  const actionRef = useRef<HTMLButtonElement>(null);

  // The delete button disappears with its row, which drops keyboard focus to
  // the page. Move it to this notice's action so Undo is one key away.
  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body) actionRef.current?.focus({ preventScroll: true });
  }, []);

  function undo() {
    if (notice.kind !== "deleted" || !canUndo(notice, Date.now())) return;
    restoring(notice.key);
    // mutateAsync: mutate()'s own callbacks only fire for the latest call, and
    // several notices can be restored at once.
    restore.mutateAsync(notice.snapshot).then(
      () => remove(notice.key),
      (err) => restoreFailed(notice.key, restoreErrorMessage(err))
    );
  }

  const failed =
    notice.kind === "delete-failed" ||
    (notice.kind === "deleted" && notice.status === "failed");

  return (
    <li
      className={
        "pointer-events-auto flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm shadow-lg " +
        (failed
          ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800/60 dark:bg-rose-950 dark:text-rose-100"
          : "border-slate-200 bg-white text-slate-900 dark:border-notion-border dark:bg-notion-panel dark:text-notion-fg")
      }
    >
      <span className="flex-1 min-w-0">
        {notice.kind === "delete-failed" ? (
          <span>
            「<span className="break-all">{notice.title}</span>」を削除できませんでした。{notice.error}
          </span>
        ) : notice.status === "failed" ? (
          <span>
            「<span className="break-all">{notice.title}</span>」を元に戻せませんでした。{notice.error}
          </span>
        ) : (
          <>
            「<span className="break-all">{notice.title}</span>」を削除しました
          </>
        )}
      </span>
      {notice.kind === "deleted" && (
        <button
          ref={actionRef}
          data-undo-action
          type="button"
          className="shrink-0 font-semibold text-notion-blue hover:underline aria-disabled:opacity-50"
          // aria-disabled, not disabled: a disabled button loses focus.
          aria-disabled={notice.status === "restoring"}
          onClick={undo}
          aria-label={`「${notice.title}」の削除を${notice.status === "failed" ? "もう一度" : ""}元に戻す`}
        >
          {notice.status === "restoring"
            ? "戻しています…"
            : notice.status === "failed"
            ? "再試行"
            : "元に戻す"}
        </button>
      )}
      {failed && (
        <button
          ref={notice.kind === "delete-failed" ? actionRef : undefined}
          data-undo-action
          type="button"
          className="shrink-0 text-xs muted hover:underline"
          onClick={() => remove(notice.key)}
          aria-label={`「${notice.title}」の通知を閉じる`}
        >
          閉じる
        </button>
      )}
    </li>
  );
}

