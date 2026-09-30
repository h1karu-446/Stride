import { create } from "zustand";
import {
  addNotice,
  expireNotices,
  markRestoreFailed,
  markRestoring,
  removeNotice,
  UndoNotice,
} from "@/lib/taskUndo";

// Undo notices shared by every delete button on Today (list, unscheduled
// panel, timeline). Not persisted: after a reload the deletes stay as they are.
interface TaskUndoState {
  notices: UndoNotice[];
  add: (notice: UndoNotice) => void;
  remove: (key: string) => void;
  expire: (now: number) => void;
  restoring: (key: string) => void;
  restoreFailed: (key: string, error: string) => void;
}

export const useTaskUndoStore = create<TaskUndoState>()((set) => ({
  notices: [],
  add: (notice) => set((s) => ({ notices: addNotice(s.notices, notice) })),
  remove: (key) => set((s) => ({ notices: removeNotice(s.notices, key) })),
  expire: (now) => set((s) => ({ notices: expireNotices(s.notices, now) })),
  restoring: (key) => set((s) => ({ notices: markRestoring(s.notices, key) })),
  restoreFailed: (key, error) =>
    set((s) => ({ notices: markRestoreFailed(s.notices, key, error) })),
}));

let seq = 0;
export function nextNoticeKey(): string {
  seq += 1;
  return `undo-${Date.now()}-${seq}`;
}
