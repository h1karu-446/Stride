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
  highlight?: string;
  tomorrow_intention?: string;
  memo?: string;
  completion_score: number;
  fulfillment_score: number;
  wake_score: number;
  total_score: number;
  cluster: Cluster;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_WAKE_TARGET = "07:00";

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
