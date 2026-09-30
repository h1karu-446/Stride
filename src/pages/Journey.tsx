import { useEffect, useState } from "react";
import { format, startOfMonth } from "date-fns";
import { Link } from "react-router-dom";
import ScoreCalendar from "@/components/journey/ScoreCalendar";
import WishForm from "@/components/journey/WishForm";
import { SAVE_ERROR_MESSAGE } from "@/components/common/FormParts";
import { ImportanceBadge } from "@/components/ImportanceBadge";
import { todayISO } from "@/lib/date";
import { useReviews } from "@/lib/queries";
import { planHex } from "@/lib/plans/colors";
import { formatDateLabel, spanLabel } from "@/lib/plans/logic";
import { achievementRange, achievementStyle, groupAchievements, journeyStreak, monthlyAverage, sortWishes } from "@/lib/journey/logic";
import { NEW_WISH, useAchievements, useAnnualAchievements, useMutateWish, useOldestAchievement, useWish, useWishes } from "@/lib/journey/queries";
import type { WishInput } from "@/lib/journey/queries";
import type { Wish } from "@/types";

export default function Journey() {
  const today = todayISO();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [months, setMonths] = useState(3);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ id: string; title: string } | null>(null);
  const reviews = useReviews();
  const wishes = useWishes();
  const achievements = useAchievements(months, today);
  const oldest = useOldestAchievement();
  const annual = useAnnualAchievements(today.slice(0, 4));
  const feedFrom = achievementRange(today, months).from;
  const hasOlder = !!oldest.data && oldest.data < feedFrom;
  const mutation = useMutateWish();
  const pending = sortWishes((wishes.data ?? []).filter((wish) => !wish.achieved_at));
  // An achieved wish opened from the feed is loaded on its own (the view has no note or importance).
  const achievedEditing = useWish(editing && editing !== "new" && !pending.some((wish) => wish.id === editing) ? editing : null);
  const average = monthlyAverage(reviews.data ?? [], format(month, "yyyy-MM"));
  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 5000);
    return () => window.clearTimeout(timer);
  }, [undo]);
  const edit = (id: string | null) => { if (!mutation.isPending) { mutation.reset(); setEditing(id); } };
  const save = (input: WishInput) => mutation.mutate({ type: "save", id: editing === "new" ? undefined : editing ?? undefined, input }, { onSuccess: () => setEditing(null) });
  const restore = (id: string) => mutation.mutate({ type: "achieve", id, achieved: false }, { onSuccess: () => setUndo((current) => (current?.id === id ? null : current)) });
  const form = (id: string, initial: WishInput) => <WishForm key={id} initial={initial} onSubmit={save} onCancel={() => edit(null)} saving={mutation.isPending} failed={mutation.isError}
    onDelete={id === "new" ? undefined : () => mutation.mutate({ type: "delete", id }, { onSuccess: () => setEditing(null) })} />;
  const inputOf = (wish: Wish): WishInput => ({ title: wish.title, note: wish.note ?? "", importance: wish.importance, emphasize_achievement: wish.emphasize_achievement });

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-2xl font-bold tracking-tight">Journey</h1><p className="text-sm muted">日々の歩みと、達成したこと</p></div>
      <dl className="flex gap-6 text-center">
        <div><dt className="text-xs muted">A/B 連続</dt><dd className="text-xl font-semibold">{reviews.isPending || reviews.isError ? "—" : journeyStreak(reviews.data ?? [], today)} <span className="text-xs">日</span></dd></div>
        <div><dt className="text-xs muted">月の平均</dt><dd className="text-xl font-semibold">{reviews.isPending || reviews.isError ? "—" : average ?? "—"}</dd></div>
        <div><dt className="text-xs muted">年の達成</dt><dd className="text-xl font-semibold">{annual.isPending || annual.isError ? "—" : annual.data} <span className="text-xs">件</span></dd></div>
      </dl>
    </div>
    {(reviews.isError || wishes.isError || achievements.isError || oldest.isError || annual.isError) && <div role="alert" className="card text-sm text-red-500">読み込めませんでした。<button className="underline ml-2" onClick={() => { void reviews.refetch(); void wishes.refetch(); void achievements.refetch(); void oldest.refetch(); void annual.refetch(); }}>再試行</button></div>}
    <div className="grid lg:grid-cols-2 gap-6 items-stretch">
      <section className="card"><ScoreCalendar month={month} setMonth={setMonth} reviews={reviews.data ?? []} /></section>
      <section className="card space-y-3" aria-label="やりたいこと">
        <div className="flex items-center justify-between"><h2 className="font-semibold">やりたいこと</h2><button className="btn-ghost" aria-label="やりたいことを追加" disabled={mutation.isPending} onClick={() => edit("new")}>＋</button></div>
        {wishes.isPending && <p className="text-sm muted">読み込み中…</p>}
        {(expanded ? pending : pending.slice(0, 8)).map((wish) => editing === wish.id ? form(wish.id, inputOf(wish)) : <div key={wish.id} className="flex items-start gap-3 py-2">
          <button className="shrink-0 rounded-full border border-slate-400 w-5 h-5 mt-1" aria-label={`${wish.title}を達成`} disabled={mutation.isPending} onClick={() => mutation.mutate({ type: "achieve", id: wish.id, achieved: true }, { onSuccess: () => { setUndo({ id: wish.id, title: wish.title }); if (editing === wish.id) setEditing(null); } })} />
          <button className="text-left min-w-0 flex-1" disabled={mutation.isPending} onClick={() => edit(wish.id)}><span className="flex items-center gap-2 text-sm"><span className="sr-only">重要度</span><ImportanceBadge importance={wish.importance} /><span className="truncate">{wish.title}</span></span>{wish.note && <span className="block text-xs muted break-words">{wish.note}</span>}</button>
        </div>)}
        {pending.length > 8 && <button className="text-xs muted hover:underline" onClick={() => setExpanded(!expanded)}>{expanded ? "閉じる" : `他 ${pending.length - 8}件`}</button>}
        {editing === "new" && form("new", NEW_WISH)}
        {!wishes.isPending && !wishes.isError && !pending.length && editing !== "new" && <button className="w-full rounded-lg border border-dashed border-slate-300 dark:border-notion-border p-4 text-sm muted" onClick={() => edit("new")}>＋ やりたいことを追加</button>}
        {undo && <div role="status" className="text-sm">「{undo.title}」を達成しました <button className="text-blue-500 underline" disabled={mutation.isPending} onClick={() => restore(undo.id)}>元に戻す</button></div>}
        {mutation.isError && !editing && <p role="alert" className="text-sm text-red-500">{SAVE_ERROR_MESSAGE}</p>}
      </section>
    </div>
    <section className="card space-y-5" aria-label="達成の記録">
      <h2 className="font-semibold">達成の記録</h2>
      {achievements.isPending && <p className="text-sm muted">読み込み中…</p>}
      {!achievements.isPending && !achievements.isError && !oldest.isPending && !oldest.isError && !achievements.data?.length && <p className="text-sm muted">{hasOlder ? `直近${months}か月の記録はありません` : "達成したことがここに並びます"}</p>}
      {groupAchievements(achievements.data ?? []).map(([key, rows]) => <div key={key} className="space-y-2">
        <h3 className="text-xs muted border-b border-slate-200 dark:border-notion-border pb-2">{Number(key.slice(0, 4))}年{Number(key.slice(5))}月</h3>
        {rows.map((row) => {
          const style = achievementStyle(row);
          if (row.kind === "wish" && editing === row.id) {
            return <div key={`${row.kind}-${row.id}`}>{achievedEditing.data ? form(row.id, inputOf(achievedEditing.data))
              : <p role={achievedEditing.isError ? "alert" : undefined} className={`text-sm py-2 ${achievedEditing.isError ? "text-red-500" : "muted"}`}>{achievedEditing.isError ? "読み込めませんでした。" : "読み込み中…"}
                {achievedEditing.isError && <button className="underline ml-2" onClick={() => edit(null)}>閉じる</button>}</p>}</div>;
          }
          return <div key={`${row.kind}-${row.id}`} className={`group flex flex-wrap items-center gap-3 py-2 text-sm ${style.className}`}>
            <span className="min-w-10 shrink-0 text-xs font-normal tabular-nums">{formatDateLabel(row.achieved_on, today)}</span>
            {row.kind === "wish"
              ? <button type="button" aria-pressed={style.prominent} aria-label={`「${row.title}」を達成の記録で目立たせる`} title="達成の記録で目立たせる" disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ type: "emphasize", id: row.id, emphasized: !style.prominent })} className="rounded focus-visible:outline focus-visible:outline-2">{style.icon}</button>
              : <span aria-hidden>{style.icon}</span>}
            {row.kind === "wish"
              ? <button type="button" className="min-w-0 flex-1 break-words text-left" disabled={mutation.isPending} onClick={() => edit(row.id)}>{row.title}</button>
              : <span className="min-w-0 flex-1 break-words">{row.title}</span>}
            {row.kind === "plan" && row.started_at && <span className="text-xs font-normal muted">{spanLabel(row.started_at, row.achieved_on)}</span>}
            {row.plan_id && row.plan_name && row.kind !== "plan" && <Link className="text-xs font-normal hover:underline" style={{ color: planHex(row.plan_color ?? "gray") }} to={`/plans/${row.plan_id}`}>{row.plan_name}</Link>}
            {row.kind === "wish" && <button disabled={mutation.isPending} onClick={() => restore(row.id)} className="text-xs font-normal muted opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:outline focus-visible:outline-2">未達成に戻す</button>}
          </div>;
        })}
      </div>)}
      {hasOlder && <button className="btn-outline text-sm" disabled={achievements.isFetching} onClick={() => setMonths(months + 3)}>もっと見る</button>}
    </section>
  </div>;
}
