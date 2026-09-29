import { useEffect, type ReactNode } from "react";

export const SAVE_ERROR_MESSAGE = "保存できませんでした。もう一度お試しください";

/** Esc acts as "キャンセル" on an inline edit form (spec 3.6). */
export function useEscToCancel(onCancel: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A modal handles its own Esc; do not also discard this form.
      if (e.key === "Escape" && !document.querySelector("[role=dialog]")) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
}

/** "他 N件" / "完了 N" style toggle that expands in place (spec 3.4). */
export function FoldButton({
  open,
  label,
  onToggle,
}: {
  open: boolean;
  label: ReactNode;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="self-start text-xs muted hover:underline py-1"
    >
      {open ? "閉じる" : label}
    </button>
  );
}

/** `group` is for controls made of several buttons (colors, weekdays). */
export function Field({
  label,
  error,
  group,
  children,
}: {
  label: string;
  error?: string;
  group?: boolean;
  children: ReactNode;
}) {
  const body = (
    <>
      <span className="label">{label}</span>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </>
  );
  return group ? (
    <div role="group" aria-label={label}>{body}</div>
  ) : (
    <label className="block">{body}</label>
  );
}

/** Bottom row shared by edit forms: delete on the left, cancel / save right. */
export function FormActions({
  onDelete,
  onCancel,
  saveLabel = "保存",
  canSave,
  saving,
  error,
}: {
  onDelete?: () => void;
  onCancel: () => void;
  saveLabel?: string;
  canSave: boolean;
  saving?: boolean;
  error?: boolean;
}) {
  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-red-500">{SAVE_ERROR_MESSAGE}</p>}
      <div className="flex items-center justify-between gap-2">
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="text-xs text-red-500 hover:underline"
          >
            削除
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="btn-outline !py-1.5">
            キャンセル
          </button>
          <button
            type="submit"
            disabled={!canSave || saving}
            className="btn-primary !py-1.5"
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
