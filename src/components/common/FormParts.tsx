import { useEffect, type ReactNode } from "react";
import clsx from "clsx";

// Form conventions (Issue #57):
// - Labels: small caps style (.label). Optional fields say 「（任意）」; required ones are unmarked.
// - Errors: text-rose-600 right under the field they belong to.
// - Choices (importance, status): one row of buttons showing the current value and the options at once.
// - On touch screens (coarse pointer) buttons get a 44px touch target.

/** Larger hit area on touch screens without changing the desktop layout. */
export const TOUCH_TARGET = "[@media(pointer:coarse)]:min-h-11";

/** One option of a segmented choice (importance, status). */
export const choiceClass = (active: boolean) => clsx(
  "flex-1 rounded-md border px-2 py-2 text-sm transition disabled:opacity-60",
  TOUCH_TARGET,
  active
    ? "border-notion-blue bg-notion-blue/10 font-medium text-notion-blue"
    : "border-slate-300 hover:border-slate-400 dark:border-notion-border muted"
);

export const SAVE_ERROR_MESSAGE = "保存できませんでした。もう一度お試しください";

/** Esc acts as "キャンセル" on an inline edit form (spec 3.6). */
export function useEscToCancel(onCancel: () => void, saving = false) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc while converting Japanese input only cancels the conversion.
      if (e.isComposing || e.keyCode === 229) return;
      // A modal handles its own Esc; do not also discard this form.
      if (e.key === "Escape" && !saving && !document.querySelector("[role=dialog]")) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, saving]);
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
  optional,
  children,
}: {
  label: string;
  error?: string;
  group?: boolean;
  /** Adds 「（任意）」 to the label. */
  optional?: boolean;
  children: ReactNode;
}) {
  const name = optional ? `${label}（任意）` : label;
  const body = (
    <>
      <span className="label">{label}{optional && <span className="ml-1 normal-case tracking-normal font-normal">（任意）</span>}</span>
      {children}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </>
  );
  return group ? (
    <div role="group" aria-label={name}>{body}</div>
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
      {error && <p role="alert" className="text-xs text-rose-600">{SAVE_ERROR_MESSAGE}</p>}
      <div className="flex items-center justify-between gap-2">
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={saving}
            className={clsx("rounded-md px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10", TOUCH_TARGET)}
          >
            削除
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} disabled={saving} className={clsx("btn-outline !py-1.5", TOUCH_TARGET)}>
            キャンセル
          </button>
          <button
            type="submit"
            disabled={!canSave || saving}
            className={clsx("btn-primary !py-1.5", TOUCH_TARGET)}
          >
            {saving ? "保存中…" : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
