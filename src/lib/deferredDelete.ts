import { create } from "zustand";

/**
 * Deletes that are hard to redo (a plan, a phase with its menus, materials…) are
 * deferred: the item is hidden at once and a toast offers "元に戻す". The real
 * delete runs when the toast expires, or right away if the page is left.
 */
export const UNDO_MS = 6000;

type Pending = {
  key: string; // e.g. "phase:<id>"
  label: string;
  commit: () => Promise<void>;
  timer: ReturnType<typeof setTimeout>;
};

type State = {
  pending: Pending[];
  failed: string | null;
  schedule: (item: { key: string; label: string; commit: () => Promise<void> }) => void;
  undo: (key: string) => void;
  flushAll: () => void;
  dismissError: () => void;
};

export const useDeferredDelete = create<State>()((set, get) => {
  const run = (key: string) => {
    const item = get().pending.find((p) => p.key === key);
    if (!item) return;
    clearTimeout(item.timer);
    set((state) => ({ pending: state.pending.filter((p) => p.key !== key) }));
    item.commit().catch(() => set({ failed: `「${item.label}」を削除できませんでした` }));
  };
  return {
    pending: [],
    failed: null,
    schedule: ({ key, label, commit }) => {
      if (get().pending.some((p) => p.key === key)) return;
      const timer = setTimeout(() => run(key), UNDO_MS);
      set((state) => ({ pending: [...state.pending, { key, label, commit, timer }], failed: null }));
    },
    undo: (key) => {
      const item = get().pending.find((p) => p.key === key);
      if (item) clearTimeout(item.timer);
      set((state) => ({ pending: state.pending.filter((p) => p.key !== key) }));
    },
    flushAll: () => get().pending.forEach((p) => run(p.key)),
    dismissError: () => set({ failed: null }),
  };
});

/** Keys of items waiting to be deleted; lists hide them. */
export function useHiddenKeys(): Set<string> {
  const pending = useDeferredDelete((state) => state.pending);
  return new Set(pending.map((p) => p.key));
}

if (typeof window !== "undefined") {
  // Leaving or reloading the page commits whatever is still pending.
  window.addEventListener("pagehide", () => useDeferredDelete.getState().flushAll());
}
