import { create } from "zustand";

// The latest outcome of a move between the to-do list and a day (Issue #83).
// Moves start from several drop targets (the panel, the list view, the
// timeline), so the result is kept here and BacklogPanel announces it.
export interface BacklogNotice {
  id: number;
  kind: "status" | "alert";
  text: string;
}

interface BacklogNoticeState {
  notice: BacklogNotice | null;
  show: (kind: BacklogNotice["kind"], text: string) => void;
  dismiss: (id: number) => void;
}

let seq = 0;
export const useBacklogNotice = create<BacklogNoticeState>()((set) => ({
  notice: null,
  show: (kind, text) => set({ notice: { id: ++seq, kind, text } }),
  dismiss: (id) => set((s) => (s.notice?.id === id ? { notice: null } : s)),
}));
