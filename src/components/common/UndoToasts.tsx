import { useDeferredDelete } from "@/lib/deferredDelete";

/** Bottom toasts for deferred deletes ("元に戻す"). */
export default function UndoToasts() {
  const pending = useDeferredDelete((state) => state.pending);
  const failed = useDeferredDelete((state) => state.failed);
  const undo = useDeferredDelete((state) => state.undo);
  const dismissError = useDeferredDelete((state) => state.dismissError);
  if (!pending.length && !failed) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {pending.map((item) => (
        <div key={item.key} role="status"
          className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-2xl motion-safe:animate-[feed-in_0.3s_ease-out_both] dark:bg-notion-panel-hover dark:ring-1 dark:ring-notion-border">
          <span className="min-w-0 flex-1 truncate">「{item.label}」を削除しました</span>
          <button type="button" onClick={() => undo(item.key)}
            className="shrink-0 rounded-md px-2 py-1 font-semibold text-sky-300 hover:bg-white/10 focus-visible:outline focus-visible:outline-2">
            元に戻す
          </button>
        </div>
      ))}
      {failed && (
        <div role="alert" className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl bg-rose-600 px-4 py-3 text-sm text-white shadow-2xl">
          <span className="min-w-0 flex-1">{failed}。もう一度操作してください</span>
          <button type="button" onClick={dismissError} aria-label="閉じる" className="shrink-0 rounded-md px-2 py-1 hover:bg-white/10">✕</button>
        </div>
      )}
    </div>
  );
}
