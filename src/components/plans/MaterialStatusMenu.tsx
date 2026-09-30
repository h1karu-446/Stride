import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import clsx from "clsx";
import { formatDateLabel, MATERIAL_STATUS_LABEL, MATERIAL_STATUSES } from "@/lib/plans/logic";
import type { Material, MaterialStatus } from "@/types";

/**
 * The status badge of a material row (spec 4.2, BR-05, Issue #53). Pressing it
 * opens a menu of 未着手 / 使用中 / 完了 with the current one checked; choosing
 * another one saves it directly. Choosing the current one only closes it.
 * Keyboard: ↑/↓/Home/End move, Enter/Space choose, Esc/Tab close.
 */
export default function MaterialStatusMenu({
  material,
  color,
  today,
  pending,
  onChange,
}: {
  material: Material;
  color: string;
  today: string;
  /** A change is in flight: the badge is disabled so clicks cannot race. */
  pending: boolean;
  onChange: (s: MaterialStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const { status } = material;
  const label = MATERIAL_STATUS_LABEL[status];

  // Focus the current value when the menu opens.
  useEffect(() => {
    if (open) itemRefs.current[MATERIAL_STATUSES.indexOf(status)]?.focus();
  }, [open, status]);

  // Close on a press outside (mouse or touch).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // A pending change disables the badge; do not leave a menu open behind it.
  useEffect(() => {
    if (pending) setOpen(false);
  }, [pending]);

  const close = (focusButton: boolean) => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  };

  const choose = (s: MaterialStatus) => {
    close(true);
    if (s !== status) onChange(s);
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = itemRefs.current;
    const at = items.findIndex((el) => el === document.activeElement);
    const move = (i: number) => items[(i + items.length) % items.length]?.focus();
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(at + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(at - 1);
        break;
      case "Home":
        e.preventDefault();
        move(0);
        break;
      case "End":
        e.preventDefault();
        move(items.length - 1);
        break;
      case "Escape":
        // Keep an open edit form (useEscToCancel on window) from closing too.
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
    }
  };

  const badgeStyle =
    status === "in_progress"
      ? { background: `${color}33`, color }
      : status === "done"
        ? { background: "#4DAB9A26", color: "#4DAB9A" }
        : { background: "#8A898526", color: "#8A8985" };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`状態: ${label}（押して変更）`}
        disabled={pending}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] leading-none transition hover:ring-1 hover:ring-current focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-notion-blue disabled:cursor-wait disabled:opacity-60"
        style={badgeStyle}
      >
        {status === "done" && material.completed_at
          ? `${formatDateLabel(material.completed_at, today)} 完了`
          : label}
        <span aria-hidden="true" className="text-[9px] opacity-70">▾</span>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="教材の状態"
          onKeyDown={onMenuKey}
          className="absolute right-0 top-full z-20 mt-1 w-32 rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-notion-border dark:bg-notion-panel"
        >
          {MATERIAL_STATUSES.map((s, i) => {
            const current = s === status;
            return (
              <button
                key={s}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={current}
                tabIndex={-1}
                onClick={() => choose(s)}
                className={clsx(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none dark:hover:bg-notion-panel-hover dark:focus:bg-notion-panel-hover",
                  current && "font-semibold"
                )}
              >
                <span aria-hidden="true" className="w-3 text-center">
                  {current ? "✓" : ""}
                </span>
                {MATERIAL_STATUS_LABEL[s]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
