import { useEffect, useLayoutEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import clsx from "clsx";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { todayISO } from "@/lib/date";
import { planHex } from "@/lib/plans/colors";
import { spanLabel } from "@/lib/plans/logic";
import { reelMonths, reelTier, type ReelTier } from "@/lib/journey/reel";
import { useAchievedWishImportance, useAllAchievements } from "@/lib/journey/queries";
import type { Achievement } from "@/types";

gsap.registerPlugin(ScrollTrigger);

const KIND_LABEL: Record<Achievement["kind"], string> = { wish: "Wish", plan: "Plan", milestone: "Milestone", material: "Material" };

// Taller cards take longer to scroll past, so bigger tiers also stay on screen longer.
const TIER: Record<ReelTier, { slot: string; title: string }> = {
  xl: { slot: "min-h-[78vh]", title: "text-4xl sm:text-6xl" },
  l: { slot: "min-h-[62vh]", title: "text-3xl sm:text-5xl" },
  m: { slot: "min-h-[46vh]", title: "text-2xl sm:text-3xl" },
  s: { slot: "min-h-[34vh]", title: "text-lg sm:text-xl" },
};

function dotted(date: string) {
  return date.replaceAll("-", ".");
}

function ReelCard({ row, tier }: { row: Achievement; tier: ReelTier }) {
  const t = TIER[tier];
  const golden = tier === "xl" || tier === "l";
  return (
    <li className={clsx("flex items-center justify-center py-6", t.slot)}>
      <article data-reel-card className={clsx(
        "relative w-full rounded-2xl border px-6 py-8 text-center sm:px-10 sm:py-12 will-change-transform [backface-visibility:hidden]",
        golden ? "border-[#c9a86a]/40 bg-gradient-to-b from-[#1d1812] to-[#0d0b09] shadow-[0_0_60px_-15px_rgba(201,168,106,0.35)]" : "border-white/10 bg-gradient-to-b from-[#161514] to-[#0c0b0b]",
      )}>
        <p className="font-display text-sm italic tracking-[0.3em] text-[#c9a86a]/80">
          {dotted(row.achieved_on)} · {KIND_LABEL[row.kind]}{row.kind === "wish" && row.emphasized ? " ★" : ""}
        </p>
        <h3 className={clsx("mt-4 break-words font-mincho leading-tight", t.title, golden ? "reel-gold" : "text-stone-100")}>{row.title}</h3>
        {(row.plan_name || (row.kind === "plan" && row.started_at)) && (
          <p className="mt-5 flex items-center justify-center gap-2 text-xs tracking-widest text-stone-400">
            {row.plan_name && row.kind !== "plan" && <><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: planHex(row.plan_color ?? "gray") }} />{row.plan_name}</>}
            {row.kind === "plan" && row.started_at && <span>{spanLabel(row.started_at, row.achieved_on)}</span>}
          </p>
        )}
      </article>
    </li>
  );
}

export default function AchievementReel() {
  const navigate = useNavigate();
  const today = todayISO();
  const achievements = useAllAchievements();
  const importance = useAchievedWishImportance();
  const months = reelMonths(achievements.data ?? []);
  const ready = !achievements.isPending && !importance.isPending;
  const listRef = useRef<HTMLOListElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);

  // Start at the intro every time; scrolling down walks from the oldest record to today.
  useLayoutEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") navigate("/journey"); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [navigate]);

  useLayoutEffect(() => {
    const list = listRef.current;
    const marquee = marqueeRef.current;
    if (!ready || !list || !marquee || !months.length) return;
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      // Cards tilt in like panels on a turning drum, face the viewer at the centre, and tilt away.
      list.querySelectorAll<HTMLElement>("[data-reel-card]").forEach((card) => {
        gsap.timeline({ scrollTrigger: { trigger: card, start: "top bottom", end: "bottom top", scrub: true } })
          .fromTo(card, { rotateX: -70, scale: 0.82, opacity: 0, filter: "blur(6px)" }, { rotateX: 0, scale: 1, opacity: 1, filter: "blur(0px)", ease: "power2.out" })
          .to(card, { rotateX: 70, scale: 0.82, opacity: 0, filter: "blur(6px)", ease: "power2.in" });
      });
      // The month marquee slides so the month of the cards in view sits at the centre.
      const groups = [...list.querySelectorAll<HTMLElement>("[data-reel-month]")];
      const labels = [...marquee.querySelectorAll<HTMLElement>("[data-reel-label]")];
      const centreOn = (i: number) => window.innerWidth / 2 - (labels[i].offsetLeft + labels[i].offsetWidth / 2);
      gsap.set(marquee, { x: centreOn(0) });
      const band = marquee.parentElement!;
      gsap.fromTo(band, { autoAlpha: 0 }, { autoAlpha: 1, ease: "none", scrollTrigger: { trigger: list, start: "top 85%", end: "top 45%", scrub: true } });
      gsap.to(band, { autoAlpha: 0, ease: "none", immediateRender: false, scrollTrigger: { trigger: list, start: "bottom 55%", end: "bottom 15%", scrub: true } });
      const tl = gsap.timeline({ scrollTrigger: { trigger: list, start: "top center", end: "bottom center", scrub: 0.8, invalidateOnRefresh: true } });
      // A month's label is centred when the middle of its cards reaches the centre of the
      // screen; between two months the label glides over (half of each group's height).
      tl.to({}, { duration: groups[0].offsetHeight / 2 });
      groups.forEach((group, i) => {
        if (i + 1 < groups.length) tl.to(marquee, { x: () => centreOn(i + 1), duration: group.offsetHeight / 2 + groups[i + 1].offsetHeight / 2, ease: "power3.inOut" });
      });
      tl.to({}, { duration: groups[groups.length - 1].offsetHeight / 2 });
    });
    ScrollTrigger.refresh();
    return () => mm.revert();
  }, [ready, months.length]);

  return (
    <div className="min-h-screen bg-[#0a0908] text-stone-100 selection:bg-[#c9a86a]/30">
      <header className="fixed inset-x-0 top-0 z-30 px-5 py-4 mix-blend-difference">
        <p className="font-display text-sm italic tracking-[0.35em] text-stone-200">Stride · Achievements</p>
      </header>

      {ready && months.length > 0 && (
        <div aria-hidden className="pointer-events-none fixed inset-x-0 top-1/2 z-0 -translate-y-1/2 overflow-hidden motion-reduce:hidden">
          <div ref={marqueeRef} className="flex w-max items-baseline gap-[6vw] whitespace-nowrap will-change-transform">
            {months.map((m, i) => (
              <span key={m.key} data-reel-label className="flex items-baseline gap-[2vw] font-display text-[15vw] italic leading-none text-stone-100/25 sm:text-[11vw]">
                <span className="text-[0.28em] not-italic tracking-[0.2em] text-[#c9a86a]/50">{m.year}</span>
                {m.month}<span className="font-mincho text-[0.45em] not-italic">月</span>
                {i < months.length - 1 && <span className="ml-[3vw] text-[0.5em] text-stone-100/30">/</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      <main className="relative">
        <section className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
          <p className="font-display text-sm italic tracking-[0.4em] text-[#c9a86a]">Your journey</p>
          <h1 className="mt-4 font-mincho text-4xl sm:text-6xl reel-gold">達成の記録</h1>
          {ready && <p className="mt-6 text-sm tracking-widest text-stone-400">これまでに {achievements.data?.length ?? 0} のことを成し遂げた</p>}
        </section>

        {!ready && <p className="text-center text-sm text-stone-500">読み込み中…</p>}
        {(achievements.isError || importance.isError) && (
          <p role="alert" className="text-center text-sm text-rose-400">読み込めませんでした。<button className="ml-2 underline" onClick={() => { void achievements.refetch(); void importance.refetch(); }}>再試行</button></p>
        )}
        {ready && !achievements.isError && !months.length && <p className="text-center text-sm text-stone-500">まだ達成の記録はありません。最初の一歩をここに刻もう。</p>}

        <ol ref={listRef} className="relative z-10 mx-auto w-[min(36rem,88vw)] [perspective:1400px]">
          {months.map((m) => (
            <li key={m.key} data-reel-month>
              <h2 className="sr-only font-display text-2xl italic text-[#c9a86a] motion-reduce:not-sr-only motion-reduce:mb-4 motion-reduce:mt-12">{m.year}年{m.month}月</h2>
              <ol>
                {m.rows.map((row) => <ReelCard key={`${row.kind}-${row.id}`} row={row} tier={reelTier(row, importance.data?.get(row.id))} />)}
              </ol>
            </li>
          ))}
        </ol>

        {ready && months.length > 0 && (
          <section className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
            <p className="font-display text-sm italic tracking-[0.4em] text-[#c9a86a]">{dotted(today)}</p>
            <p className="mt-4 font-mincho text-2xl text-stone-200">そして、ここから先へ。</p>
            <Link to="/journey" className="mt-10 rounded-full border border-[#c9a86a]/50 px-6 py-2 text-sm tracking-widest text-[#c9a86a] hover:bg-[#c9a86a]/10">Journey に戻る</Link>
          </section>
        )}
      </main>
    </div>
  );
}
