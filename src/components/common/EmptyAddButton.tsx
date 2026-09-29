export default function EmptyAddButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg border border-dashed border-slate-300 dark:border-notion-border-strong px-3 py-3 text-sm muted hover:bg-slate-50 dark:hover:bg-notion-panel-hover transition"
    >
      ＋ {label}
    </button>
  );
}
