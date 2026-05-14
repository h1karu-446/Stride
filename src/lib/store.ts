import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DailyReview,
  Importance,
  Task,
} from "@/types";
import { calculateScore } from "@/lib/score";
import { addDaysISO, todayISO } from "@/lib/date";

interface State {
  tasks: Task[];
  reviews: DailyReview[];
  darkMode: boolean;

  // Task ops
  addTask: (
    data: Pick<Task, "title" | "importance" | "scheduled_date"> &
      Partial<Pick<Task, "memo">>
  ) => Task;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  toggleTask: (id: string) => void;
  moveTask: (id: string, newDate: string) => void;

  // Review ops
  upsertReview: (
    data: Pick<DailyReview, "date" | "fulfillment"> &
      Partial<
        Pick<DailyReview, "highlight" | "tomorrow_intention" | "memo">
      >
  ) => DailyReview;
  deleteReview: (id: string) => void;

  // Bulk
  resetAll: () => void;
  loadSeed: () => void;
  toggleDarkMode: () => void;
}

const MOCK_USER = "demo-user";

function uid() {
  return crypto.randomUUID();
}

function nowISO() {
  return new Date().toISOString();
}

function buildReview(
  raw: Pick<DailyReview, "date" | "fulfillment"> &
    Partial<Pick<DailyReview, "highlight" | "tomorrow_intention" | "memo">>,
  tasks: Task[],
  existing?: DailyReview
): DailyReview {
  const dayTasks = tasks.filter((t) => t.scheduled_date === raw.date);
  const score = calculateScore(dayTasks, raw.fulfillment);
  return {
    id: existing?.id ?? uid(),
    user_id: MOCK_USER,
    date: raw.date,
    fulfillment: raw.fulfillment,
    highlight: raw.highlight ?? existing?.highlight,
    tomorrow_intention: raw.tomorrow_intention ?? existing?.tomorrow_intention,
    memo: raw.memo ?? existing?.memo,
    completion_score: score.completion_score,
    fulfillment_score: score.fulfillment_score,
    total_score: score.total_score,
    cluster: score.cluster,
    created_at: existing?.created_at ?? nowISO(),
    updated_at: nowISO(),
  };
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      tasks: [],
      reviews: [],
      darkMode: false,

      addTask: (data) => {
        const task: Task = {
          id: uid(),
          user_id: MOCK_USER,
          title: data.title,
          importance: data.importance,
          scheduled_date: data.scheduled_date,
          completed: false,
          memo: data.memo,
          created_at: nowISO(),
          updated_at: nowISO(),
        };
        set({ tasks: [...get().tasks, task] });
        recomputeReview(set, get, task.scheduled_date);
        return task;
      },

      updateTask: (id, patch) => {
        const prev = get().tasks.find((t) => t.id === id);
        if (!prev) return;
        const next: Task = { ...prev, ...patch, updated_at: nowISO() };
        set({
          tasks: get().tasks.map((t) => (t.id === id ? next : t)),
        });
        recomputeReview(set, get, prev.scheduled_date);
        if (patch.scheduled_date && patch.scheduled_date !== prev.scheduled_date) {
          recomputeReview(set, get, patch.scheduled_date);
        }
      },

      deleteTask: (id) => {
        const prev = get().tasks.find((t) => t.id === id);
        if (!prev) return;
        set({ tasks: get().tasks.filter((t) => t.id !== id) });
        recomputeReview(set, get, prev.scheduled_date);
      },

      toggleTask: (id) => {
        const t = get().tasks.find((x) => x.id === id);
        if (!t) return;
        get().updateTask(id, { completed: !t.completed });
      },

      moveTask: (id, newDate) => {
        get().updateTask(id, { scheduled_date: newDate });
      },

      upsertReview: (data) => {
        const existing = get().reviews.find((r) => r.date === data.date);
        const review = buildReview(data, get().tasks, existing);
        const others = get().reviews.filter((r) => r.date !== data.date);
        set({ reviews: [...others, review] });
        return review;
      },

      deleteReview: (id) => {
        set({ reviews: get().reviews.filter((r) => r.id !== id) });
      },

      resetAll: () => set({ tasks: [], reviews: [] }),

      loadSeed: () => {
        const seed = makeSeed();
        set({ tasks: seed.tasks, reviews: seed.reviews });
      },

      toggleDarkMode: () => {
        const next = !get().darkMode;
        set({ darkMode: next });
        if (typeof document !== "undefined") {
          document.documentElement.classList.toggle("dark", next);
        }
      },
    }),
    {
      name: "stride-store-v1",
      onRehydrateStorage: () => (state) => {
        if (state?.darkMode && typeof document !== "undefined") {
          document.documentElement.classList.add("dark");
        }
      },
    }
  )
);

function recomputeReview(
  set: (partial: Partial<State>) => void,
  get: () => State,
  date: string
) {
  const existing = get().reviews.find((r) => r.date === date);
  if (!existing) return;
  const review = buildReview(
    {
      date,
      fulfillment: existing.fulfillment,
      highlight: existing.highlight,
      tomorrow_intention: existing.tomorrow_intention,
      memo: existing.memo,
    },
    get().tasks,
    existing
  );
  set({
    reviews: get().reviews.map((r) => (r.date === date ? review : r)),
  });
}

function makeSeed(): { tasks: Task[]; reviews: DailyReview[] } {
  const today = todayISO();
  const tasks: Task[] = [];
  const reviews: DailyReview[] = [];

  const titles: Array<[string, Importance]> = [
    ["仕様書レビュー", "重"],
    ["朝の運動", "中"],
    ["メール返信", "軽"],
    ["設計ドキュメント執筆", "重"],
    ["読書 30分", "軽"],
    ["スプリント計画", "中"],
    ["買い物", "軽"],
  ];

  // Past 14 days of mock history
  for (let i = 14; i >= 1; i -= 1) {
    const date = addDaysISO(today, -i);
    const dayCount = 3 + (i % 3);
    for (let k = 0; k < dayCount; k += 1) {
      const [title, importance] = titles[(i + k) % titles.length];
      tasks.push({
        id: uid(),
        user_id: MOCK_USER,
        title,
        importance,
        scheduled_date: date,
        completed: Math.random() > 0.3,
        memo: undefined,
        created_at: nowISO(),
        updated_at: nowISO(),
      });
    }
    const dayTasks = tasks.filter((t) => t.scheduled_date === date);
    const fulfillment = 2 + Math.floor(Math.random() * 4); // 2..5
    const score = calculateScore(dayTasks, fulfillment);
    reviews.push({
      id: uid(),
      user_id: MOCK_USER,
      date,
      fulfillment,
      highlight: i % 3 === 0 ? "深い集中ができた日" : undefined,
      tomorrow_intention: i % 4 === 0 ? "朝の運動を継続する" : undefined,
      memo: undefined,
      completion_score: score.completion_score,
      fulfillment_score: score.fulfillment_score,
      total_score: score.total_score,
      cluster: score.cluster,
      created_at: nowISO(),
      updated_at: nowISO(),
    });
  }

  // Today's tasks (not yet completed)
  for (let k = 0; k < 4; k += 1) {
    const [title, importance] = titles[k];
    tasks.push({
      id: uid(),
      user_id: MOCK_USER,
      title,
      importance,
      scheduled_date: today,
      completed: k === 0,
      created_at: nowISO(),
      updated_at: nowISO(),
    });
  }

  // Tomorrow
  const tomorrow = addDaysISO(today, 1);
  for (let k = 4; k < 6; k += 1) {
    const [title, importance] = titles[k];
    tasks.push({
      id: uid(),
      user_id: MOCK_USER,
      title,
      importance,
      scheduled_date: tomorrow,
      completed: false,
      created_at: nowISO(),
      updated_at: nowISO(),
    });
  }

  return { tasks, reviews };
}

// Stable single-object selector — safe to use directly with useStore.
// Array-returning selectors should derive via useMemo in the component
// to avoid new-reference-per-render infinite loops.
export function selectReviewByDate(date: string) {
  return (state: State) => state.reviews.find((r) => r.date === date);
}
