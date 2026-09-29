import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { todayISO } from "@/lib/date";
import { achievementRange } from "./logic";
import type { Achievement, Wish } from "@/types";

export function useWishes() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["wishes", session?.user.id], enabled: !!session,
    queryFn: async (): Promise<Wish[]> => {
      const rows: Wish[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from("wishes").select("*").is("achieved_at", null).order("created_at").order("id").range(offset, offset + 499);
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < 500) return rows;
      }
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
    queryFn: async (): Promise<Achievement[]> => {
      const rows: Achievement[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from("achievements").select("*").gte("achieved_on", from).lt("achieved_on", to)
          .order("achieved_on", { ascending: false }).order("kind").order("id").range(offset, offset + 499);
        if (error) throw error;
        rows.push(...((data ?? []) as Achievement[]));
        if (!data || data.length < 500) return rows;
      }
    },
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

export type WishInput = { title: string; note: string };
export type WishAction = { type: "save"; id?: string; input: WishInput } | { type: "delete"; id: string } | { type: "achieve"; id: string; achieved: boolean };
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
        const patch = action.type === "achieve" ? { achieved_at: action.achieved ? todayISO() : null } : { title: action.input.title.trim(), note: action.input.note || null };
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
