import type { ReactNode } from "react";

export const SAVE_ERROR_MESSAGE = "保存できませんでした。もう一度お試しください";

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
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
