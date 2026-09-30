import { useEffect, useState } from "react";
import { format, startOfMonth } from "date-fns";
import { Link } from "react-router-dom";
import ScoreCalendar from "@/components/journey/ScoreCalendar";
import WishForm from "@/components/journey/WishForm";
import WishCard from "@/components/journey/WishCard";
import { SAVE_ERROR_MESSAGE } from "@/components/common/FormParts";
import { ImportanceBadge } from "@/components/ImportanceBadge";
import { todayISO } from "@/lib/date";
import { useReviews } from "@/lib/queries";
import { planHex } from "@/lib/plans/colors";
import { formatDateLabel, spanLabel } from "@/lib/plans/logic";
import { achievementStyle, editableWish, groupAchievements, journeyStreak, monthlyAverage, sortWishes } from "@/lib/journey/logic";
import { NEW_WISH, useAnnualAchievements, useMutateWish, useRecentAchievements, useWish, useWishes } from "@/lib/journey/queries";
import type { WishInput } from "@/lib/journey/queries";
import type { Wish } from "@/types";

export default function Journey() {
  const today = todayISO();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  // The feed shows the latest few records (about the height of the calendar card beside
  // the wishes); everything else lives in the full-screen reel.
  const FEED_LIMIT = 8;
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ id: string; title: string } | null>(null);
  const reviews = useReviews();
  const wishes = useWishes();
  const achievements = useRecentAchievements(FEED_LIMIT);
  const annual = useAnnualAchievements(today.slice(0, 4));
  const mutation = useMutateWish();
  const pending = sortWishes((wishes.data ?? []).filter((wish) => !wish.achieved_at));
  // An achieved wish opened from the feed is loaded on its own (the view has no note or importance).
  const achievedEditing = useWish(editing && editing !== "new" && !pending.some((wish) => wish.id === editing) ? editing : null);
  // The achieved wish whose form has been shown; later refetches keep the form (and its input).
  const [shownWish, setShownWish] = useState<string | null>(null);
  const achievedWish = editableWish(achievedEditing, !!editing && shownWish === editing);
  useEffect(() => { if (achievedWish && editing && shownWish !== editing) setShownWish(editing); }, [achievedWish, editing, shownWish]);
  const average = monthlyAverage(reviews.data ?? [], format(month, "yyyy-MM"));
  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 5000);
    return () => window.clearTimeout(timer);
  }, [undo]);
  const edit = (id: string | null) => { if (!mutation.isPending) { mutation.reset(); setShownWish(null); setEditing(id); } };
  const save = (input: WishInput) => mutation.mutate({ type: "save", id: editing === "new" ? undefined : editing ?? undefined, input }, { onSuccess: () => setEditing(null) });
  const restore = (id: string) => mutation.mutate({ type: "achieve", id, achieved: false }, { onSuccess: () => setUndo((current) => (current?.id === id ? null : current)) });
  // Achieved wishes are not deleted from the feed; restore them first (spec 4.4).
  const form = (id: string, initial: WishInput, deletable = true) => <WishForm key={id} initial={initial} onSubmit={save} onCancel={() => edit(null)} saving={mutation.isPending} failed={mutation.isError}
    onDelete={id === "new" || !deletable ? undefined : () => mutation.mutate({ type: "delete", id }, { onSuccess: () => setEditing(null) })}
    onRestore={initial.achieved_at ? () => mutation.mutate({ type: "achieve", id, achieved: false }, { onSuccess: () => { setEditing(null); setUndo((current) => (current?.id === id ? null : current)); } }) : undefined} />;
  const inputOf = (wish: Wish): WishInput => ({ title: wish.title, note: wish.note ?? "", importance: wish.importance, emphasize_achievement: wish.emphasize_achievement, achieved_at: wish.achieved_at });

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-2xl font-bold tracking-tight">Journey</h1><p className="text-sm muted">日々の歩みと、達成したこと</p></div>
      <dl className="flex gap-6 text-center">
        <div><dt className="text-xs muted">A/B 連続</dt><dd className="text-xl font-semibold">{reviews.isPending || reviews.isError ? "—" : journeyStreak(reviews.data ?? [], today)} <span className="text-xs">日</span></dd></div>
        <div><dt className="text-xs muted">月の平均</dt><dd className="text-xl font-semibold">{reviews.isPending || reviews.isError ? "—" : average ?? "—"}</dd></div>
        <div><dt className="text-xs muted">年の達成</dt><dd className="text-xl font-semibold">{annual.isPending || annual.isError ? "—" : annual.data} <span className="text-xs">件</span></dd></div>
      </dl>
    </div>
    {(reviews.isError || wishes.isError || achievements.isError || annual.isError) && <div role="alert" className="card text-sm text-red-500">読み込めませんでした。<button className="underline ml-2" onClick={() => { void reviews.refetch(); void wishes.refetch(); void achievements.refetch(); void annual.refetch(); }}>再試行</button></div>}
    <div className="grid lg:grid-cols-2 gap-6 items-stretch">
      <section className="card"><ScoreCalendar month={month} setMonth={setMonth} reviews={reviews.data ?? []} /></section>
      <section className="card space-y-3" aria-label="やりたいこと">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold">やりたいこと</h2>
            <p className="text-xs muted">{pending.length ? `${pending.length} 個のやりたいこと` : "いつかやりたいことを書き出そう"}{!annual.isPending && !annual.isError && annual.data ? ` · 今年 ${annual.data} 個かなえた` : ""}</p>
          </div>
        </div>
        {wishes.isPending && <p className="text-sm muted">読み込み中…</p>}
        <ul className="space-y-2">
          {(expanded ? pending : pending.slice(0, 8)).map((wish) => editing === wish.id ? <li key={wish.id}>{form(wish.id, inputOf(wish))}</li> : <WishCard key={wish.id} wish={wish} today={today} disabled={mutation.isPending}
            onEdit={() => edit(wish.id)}
            onAchieve={() => mutation.mutate({ type: "achieve", id: wish.id, achieved: true }, { onSuccess: () => { setUndo({ id: wish.id, title: wish.title }); if (editing === wish.id) setEditing(null); } })} />)}
        </ul>
        {pending.length > 8 && <button className="text-xs muted hover:underline" onClick={() => setExpanded(!expanded)}>{expanded ? "閉じる" : `他 ${pending.length - 8}件`}</button>}
        {editing === "new" && form("new", NEW_WISH)}
        {!!pending.length && editing !== "new" && <button type="button" disabled={mutation.isPending} onClick={() => edit("new")} className="w-full rounded-xl border border-dashed border-slate-300 py-2.5 text-sm muted transition hover:border-amber-400 hover:text-amber-600 dark:border-notion-border">＋ やりたいことを追加</button>}
        {!wishes.isPending && !wishes.isError && !pending.length && editing !== "new" && <button className="w-full rounded-xl border-2 border-dashed border-slate-300 p-6 text-center text-sm muted hover:border-amber-400 hover:text-amber-600 dark:border-notion-border" onClick={() => edit("new")}><span className="block text-2xl" aria-hidden>✨</span>行ってみたい場所、挑戦したいこと、手に入れたいもの。<br />まずは1つ書いてみよう</button>}
        {undo && <div role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"><span aria-hidden>🎉</span><span className="min-w-0 flex-1 break-words">「{undo.title}」をかなえました！</span><button className="shrink-0 text-xs underline" disabled={mutation.isPending} onClick={() => restore(undo.id)}>元に戻す</button></div>}
        {mutation.isError && !editing && mutation.variables?.type !== "emphasize" && <p role="alert" className="text-sm text-red-500">{SAVE_ERROR_MESSAGE}</p>}
      </section>
    </div>
    {/* Always dark ("dark" turns on the dark: variants inside) with gold accents. */}
    <section className="dark space-y-6 rounded-2xl border border-[#c9a86a]/25 bg-gradient-to-b from-[#17140f] to-[#0b0a09] p-5 text-stone-200 shadow-[0_20px_60px_-30px_rgba(201,168,106,0.45)] sm:p-7" aria-label="達成の記録">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-xs italic tracking-[0.35em] text-[#c9a86a]">Achievements</p>
          <h2 className="mt-1 font-mincho text-xl text-stone-100">達成の記録</h2>
        </div>
        {!!achievements.data?.length && <Link to="/journey/achievements" className="group inline-flex items-center gap-2 rounded-full border border-[#c9a86a]/50 px-4 py-1.5 text-xs tracking-widest text-[#c9a86a] transition hover:bg-[#c9a86a]/10">もっと見る<span aria-hidden className="transition group-hover:translate-x-1">→</span></Link>}
      </div>
      {achievements.isPending && <p className="text-sm muted">読み込み中…</p>}
      {!achievements.isPending && !achievements.isError && !achievements.data?.length && <p className="text-sm muted">達成したことがここに並びます</p>}
      {groupAchievements(achievements.data ?? []).map(([key, rows]) => <div key={key} className="space-y-2">
        <h3 className="flex items-baseline gap-2 border-b border-[#c9a86a]/20 pb-2"><span className="font-display text-2xl italic text-[#e8d3a0]">{Number(key.slice(5))}</span><span className="font-mincho text-xs text-stone-400">{Number(key.slice(0, 4))}年{Number(key.slice(5))}月</span></h3>
        {rows.map((row, index) => {
          const style = achievementStyle(row);
          if (row.kind === "wish" && editing === row.id) {
            return <div key={`${row.kind}-${row.id}`}>{achievedWish ? form(row.id, inputOf(achievedWish), false)
              : <p role={achievedEditing.isError ? "alert" : undefined} className={`text-sm py-2 ${achievedEditing.isError ? "text-red-500" : "muted"}`}>{achievedEditing.isError ? "読み込めませんでした。" : "読み込み中…"}
                {achievedEditing.isError && <button className="underline ml-2" onClick={() => edit(null)}>閉じる</button>}</p>}</div>;
          }
          const toggleFailed = mutation.isError && mutation.variables?.type === "emphasize" && mutation.variables.id === row.id;
          return <div key={`${row.kind}-${row.id}`} style={{ animationDelay: `${Math.min(index, 8) * 70}ms` }}
            className={`group flex flex-wrap items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-white/[0.03] motion-safe:animate-[feed-in_0.7s_cubic-bezier(0.22,1,0.36,1)_both] ${style.className}`}>
            <span className="min-w-10 shrink-0 text-xs font-normal tabular-nums">{formatDateLabel(row.achieved_on, today)}</span>
            {row.kind === "wish"
              ? <button type="button" aria-pressed={style.prominent} aria-label={`「${row.title}」を達成の記録で目立たせる`} title="達成の記録で目立たせる" disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ type: "emphasize", id: row.id, emphasized: !style.prominent })} className="-my-2 -mx-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-notion-panel-hover focus-visible:outline focus-visible:outline-2">{style.icon}</button>
              : <span aria-hidden>{style.icon}</span>}
            <span className={`min-w-0 flex-1 break-words ${style.prominent && (row.kind === "wish" || row.kind === "plan") ? "font-mincho text-base shimmer-gold" : ""}`}>{row.title}</span>
            {row.kind === "plan" && row.started_at && <span className="text-xs font-normal muted">{spanLabel(row.started_at, row.achieved_on)}</span>}
            {row.plan_id && row.plan_name && row.kind !== "plan" && <Link className="text-xs font-normal hover:underline" style={{ color: planHex(row.plan_color ?? "gray") }} to={`/plans/${row.plan_id}`}>{row.plan_name}</Link>}
            {row.kind === "wish" && <button type="button" disabled={mutation.isPending} onClick={() => edit(row.id)} aria-label={`「${row.title}」を編集`} className="shrink-0 rounded-md px-2 py-1 text-xs font-normal muted hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 dark:hover:bg-notion-panel-hover">編集</button>}
            {toggleFailed && <p role="alert" className="basis-full text-xs font-normal text-red-500">{SAVE_ERROR_MESSAGE}</p>}
          </div>;
        })}
      </div>)}
    </section>
  </div>;
}
