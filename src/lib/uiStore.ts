import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PhaseView = "timeline" | "calendar";

interface UiState {
  darkMode: boolean;
  toggleDarkMode: () => void;
  /** How a plan's phases are shown on its detail screen. */
  phaseView: PhaseView;
  setPhaseView: (view: PhaseView) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      darkMode: false,
      phaseView: "timeline",
      setPhaseView: (phaseView) => set({ phaseView }),
      toggleDarkMode: () => {
        const next = !get().darkMode;
        set({ darkMode: next });
        if (typeof document !== "undefined") {
          document.documentElement.classList.toggle("dark", next);
        }
      },
    }),
    {
      name: "stride-ui-v1",
      onRehydrateStorage: () => (state) => {
        if (state?.darkMode && typeof document !== "undefined") {
          document.documentElement.classList.add("dark");
        }
      },
    }
  )
);
