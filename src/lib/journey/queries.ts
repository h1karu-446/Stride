import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { todayISO } from "@/lib/date";
import { fetchAllPages } from "@/lib/pagination";
import { achievementRange } from "./logic";
import type { Achievement, Importance, Wish } from "@/types";

export function useWishes() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["wishes", session?.user.id], enabled: !!session,
    queryFn: (): Promise<Wish[]> =>
      fetchAllPages<Wish>((from, to) => supabase.from("wishes").select("*").is("achieved_at", null).order("created_at").order("id").range(from, to)),
  });
}

// One wish, for editing an achieved wish from the achievement feed (the view
// does not carry the note or importance). Wish mutations invalidate ["wishes"],
// which marks a cached copy stale; switching to its key then refetches it.
// Journey waits for that refetch before showing the form (editableWish).
export function useWish(id: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["wishes", session?.user.id, "one", id], enabled: !!session && !!id,
    queryFn: async (): Promise<Wish> => {
      const { data, error } = await supabase.from("wishes").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as Wish;
    },
  });
}

export function useAchievements(months: number, today: string) {
  const { session } = useAuth();
  const { from, to } = achievementRange(today, months);
  return useQuery({
    queryKey: ["achievements", session?.user.id, from, to], enabled: !!session,
    // Keep the current feed on screen while "もっと見る" loads the wider range.
    placeholderData: keepPreviousData,
    queryFn: (): Promise<Achievement[]> =>
      fetchAllPages<Achievement>((start, end) => supabase.from("achievements").select("*").gte("achieved_on", from).lt("achieved_on", to)
        .order("achieved_on", { ascending: false }).order("kind").order("id").range(start, end)),
  });
}

// The oldest record date decides between "no records at all" and "none in this range",
// and whether "もっと見る" can reach anything older.
export function useOldestAchievement() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["achievements", session?.user.id, "oldest"], enabled: !!session,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.from("achievements").select("achieved_on").order("achieved_on").limit(1);
      if (error) throw error;
      return (data?.[0] as { achieved_on: string } | undefined)?.achieved_on ?? null;
    },
  });
}

// An exact count is independent of the three-month feed and the API row limit.
export function useAnnualAchievements(year: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["achievements", session?.user.id, "year", year], enabled: !!session,
    queryFn: async () => {
      const { count, error } = await supabase.from("achievements").select("id", { count: "exact", head: true })
        .in("kind", ["plan", "wish"]).gte("achieved_on", `${year}-01-01`).lt("achieved_on", `${Number(year) + 1}-01-01`);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/** achieved_at is set only when editing an achieved wish (YYYY-MM-DD in the user's timezone). */
export type WishInput = { title: string; note: string; importance: Importance; emphasize_achievement: boolean; achieved_at?: string | null };
/** New wishes: importance 中, emphasis OFF (Issue #43). */
export const NEW_WISH: WishInput = { title: "", note: "", importance: "中", emphasize_achievement: false };
export type WishAction = { type: "save"; id?: string; input: WishInput } | { type: "delete"; id: string } | { type: "achieve"; id: string; achieved: boolean }
  | { type: "emphasize"; id: string; emphasized: boolean };
export function wishPatch(input: WishInput) {
  return {
    title: input.title.trim(), note: input.note || null, importance: input.importance, emphasize_achievement: input.emphasize_achievement,
    ...(input.achieved_at ? { achieved_at: input.achieved_at } : {}),
  };
}

export function useMutateWish() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: WishAction) => {
      if (!session) throw new Error("Not signed in");
      if (action.type === "delete") {
        const { error } = await supabase.from("wishes").delete().eq("id", action.id);
        if (error) throw error;
      } else {
        const patch = action.type === "achieve" ? { achieved_at: action.achieved ? todayISO() : null }
          : action.type === "emphasize" ? { emphasize_achievement: action.emphasized } : wishPatch(action.input);
        const request = action.id ? supabase.from("wishes").update(patch).eq("id", action.id) : supabase.from("wishes").insert({ ...patch, user_id: session.user.id });
        const { error } = await request.select("id").single();
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ["wishes"] }), qc.invalidateQueries({ queryKey: ["achievements"] })]);
    },
  });
}
