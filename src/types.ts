export type Importance = "重" | "中" | "軽";

export interface Task {
  id: string;
  user_id: string;
  title: string;
  importance: Importance;
  scheduled_date: string; // YYYY-MM-DD
  start_time?: string; // "HH:mm"
  end_time?: string; // "HH:mm"
  completed: boolean;
  memo?: string;
  plan_id?: string; // set on plan schedules and routine tasks
  routine_id?: string; // set only on tasks generated from a routine
  planned_minutes?: number; // duration, used by routine tasks
  is_milestone: boolean; // milestone mark on plan schedules
  created_at: string;
  updated_at: string;
}

export type Cluster = "A" | "B" | "C" | "D" | "E";

export interface DailyReview {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  fulfillment: number; // 1-5
  wake_time?: string; // "HH:mm"
  wake_target?: string; // "HH:mm" — per-day override of the account default
  bed_time?: string; // "HH:mm"
  bed_target?: string; // "HH:mm" — per-day override of the account default
  highlight?: string;
  tomorrow_intention?: string;
  memo?: string;
  completion_score: number;
  fulfillment_score: number;
  wake_score: number;
  bed_score: number;
  total_score: number;
  cluster: Cluster;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_WAKE_TARGET = "07:00";
export const DEFAULT_BED_TARGET = "23:00";

export interface DailyScore {
  date: string;
  completion_score: number;
  fulfillment_score: number;
  total_score: number;
  cluster: Cluster;
}

export const IMPORTANCE_WEIGHT: Record<Importance, number> = {
  重: 3,
  中: 2,
  軽: 1,
};

export const CLUSTER_META: Record<
  Cluster,
  { label: string; emoji: string; color: string; min: number }
> = {
  A: { label: "Great Day", emoji: "🌟", color: "cluster-A", min: 85 },
  B: { label: "Good Day", emoji: "💪", color: "cluster-B", min: 70 },
  C: { label: "Off Day", emoji: "🌱", color: "cluster-C", min: 50 },
  D: { label: "Bad Day", emoji: "🛋️", color: "cluster-D", min: 30 },
  E: { label: "Worst Day", emoji: "💀", color: "cluster-E", min: 0 },
};

export const IMPORTANCE_LIST: Importance[] = ["重", "中", "軽"];

export type PlanStatus = "idea" | "active" | "paused" | "done";
export type PlanColor =
  | "pink"
  | "orange"
  | "yellow"
  | "green"
  | "teal"
  | "blue"
  | "purple"
  | "gray";

export interface Routine {
  id: string;
  phase_id: string;
  title: string;
  minutes: number;
  weekdays: number[]; // ISO weekdays, 1 = Mon ... 7 = Sun
  importance: Importance;
  menu?: string;
}

export type MaterialStatus = "todo" | "in_progress" | "done";

export interface Material {
  id: string;
  plan_id: string;
  title: string;
  url?: string;
  status: MaterialStatus;
  completed_at?: string; // YYYY-MM-DD, set while status is "done"
  phase_ids: string[]; // linked phases (material_phases)
  created_at: string;
}

export interface Phase {
  id: string;
  plan_id: string;
  is_implicit: boolean;
  name?: string;
  start_date?: string; // YYYY-MM-DD
  end_date?: string;
  routines: Routine[];
}

export interface Plan {
  id: string;
  name: string;
  color: PlanColor;
  status: PlanStatus;
  due_date?: string;
  goal?: string;
  goal_note?: string;
  completed_at?: string;
  overdue_notice_dismissed_for?: string;
  phases: Phase[];
  materials: Material[];
  created_at: string;
  updated_at: string;
}
