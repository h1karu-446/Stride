import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { addMonths, format, getDaysInMonth, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { calendarDates, moveCalendarDate } from "@/lib/calendar";
import { todayISO } from "@/lib/date";

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

export default function DatePicker({
  value,
  onChange,
  label,
  emptyLabel = "＋ 日付を設定",
  allowClear = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  emptyLabel?: string;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState((value || todayISO()).slice(0, 7));
  const [focused, setFocused] = useState(value || todayISO());
  const [position, setPosition] = useState({ top: 0, left: 0, width: 288 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLButtonElement>(null);
  const today = todayISO();

  function openCalendar() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.min(288, window.innerWidth - 32);
      const top = rect.bottom + 8 + 336 > window.innerHeight
        ? Math.max(16, rect.top - 344)
        : rect.bottom + 8;
      setPosition({ top, left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)), width });
    }
    const initial = value || todayISO();
    setMonth(initial.slice(0, 7));
    setFocused(initial);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    focusRef.current?.focus();
  }, [open, focused, month]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popupRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    const onFocus = (event: FocusEvent) => {
      const target = event.target as Node;
      if (!popupRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("focusin", onFocus);
    };
  }, [open]);

  function select(date: string) {
    onChange(date);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function changeMonth(delta: number) {
    const next = format(addMonths(parseISO(`${month}-01`), delta), "yyyy-MM");
    const day = Math.min(Number(focused.slice(-2)), getDaysInMonth(parseISO(`${next}-01`)));
    setMonth(next);
    setFocused(`${next}-${String(day).padStart(2, "0")}`);
  }

  function onCalendarKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    const key = event.shiftKey && (event.key === "PageUp" || event.key === "PageDown")
      ? `Shift+${event.key}` : event.key;
    const next = moveCalendarDate(focused, key);
    if (next !== focused) {
      event.preventDefault();
      setFocused(next);
      setMonth(next.slice(0, 7));
    }
  }

  const dates = calendarDates(month);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${label}: ${value ? format(parseISO(value), "yyyy年M月d日", { locale: ja }) : "未設定"}`}
        aria-expanded={open}
        onClick={() => open ? setOpen(false) : openCalendar()}
        className={`inline-flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-notion-blue ${value ? "border-slate-300 bg-white font-medium dark:border-notion-border dark:bg-notion-panel" : "border-dashed border-slate-300 muted hover:border-notion-blue dark:border-notion-border"}`}
      >
        <span aria-hidden="true">▦</span>
        <span>{value ? format(parseISO(value), "yyyy年M月d日 (EEE)", { locale: ja }) : emptyLabel}</span>
      </button>
      {value && allowClear && (
        <button type="button" onClick={() => onChange("")} className="text-xs muted hover:text-rose-600">解除</button>
      )}
      {open && createPortal(
        <div
          ref={popupRef}
          role="dialog"
          aria-label={`${label}のカレンダー`}
          onKeyDown={onCalendarKey}
          className="fixed z-[70] rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-notion-border dark:bg-notion-panel"
          style={{ top: position.top, left: position.left, width: position.width }}
        >
          <div className="mb-2 flex items-center justify-between gap-1">
            <button type="button" aria-label="前の年" className="rounded px-1 py-1 hover:bg-slate-100 dark:hover:bg-notion-panel-hover" onClick={() => changeMonth(-12)}>«</button>
            <button type="button" aria-label="前の月" className="rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-notion-panel-hover" onClick={() => changeMonth(-1)}>‹</button>
            <span className="text-sm font-semibold tabular-nums">{format(parseISO(`${month}-01`), "yyyy年M月", { locale: ja })}</span>
            <button type="button" aria-label="次の月" className="rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-notion-panel-hover" onClick={() => changeMonth(1)}>›</button>
            <button type="button" aria-label="次の年" className="rounded px-1 py-1 hover:bg-slate-100 dark:hover:bg-notion-panel-hover" onClick={() => changeMonth(12)}>»</button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs muted">
            {WEEKDAYS.map((day) => <span key={day} className="py-1">{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {dates.map((date) => (
              <button
                key={date}
                ref={date === focused ? focusRef : undefined}
                type="button"
                aria-label={format(parseISO(date), "yyyy年M月d日", { locale: ja })}
                aria-pressed={date === value}
                tabIndex={date === focused ? 0 : -1}
                onClick={() => select(date)}
                className={`aspect-square rounded-md text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-notion-blue ${date === value ? "bg-notion-blue text-white font-bold" : date === today ? "border border-notion-blue text-notion-blue" : date.slice(0, 7) !== month ? "muted opacity-45 hover:bg-slate-100 dark:hover:bg-notion-panel-hover" : "hover:bg-slate-100 dark:hover:bg-notion-panel-hover"}`}
              >{Number(date.slice(-2))}</button>
            ))}
          </div>
          <div className="mt-2 flex justify-end border-t border-slate-100 pt-2 dark:border-notion-border">
            <button type="button" className="text-xs text-notion-blue hover:underline" onClick={() => select(today)}>今日を選ぶ</button>
          </div>
        </div>, document.body
      )}
    </div>
  );
}
