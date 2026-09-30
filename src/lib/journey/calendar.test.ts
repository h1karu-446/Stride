import { describe, expect, it } from "vitest";
import type { DailyReview } from "@/types";
import { calendarDays } from "./calendar";

const review = (date: string, total_score: number, cluster: DailyReview["cluster"]) => ({ date, total_score, cluster });

describe("Journey calendar days", () => {
  it("covers whole Monday-start weeks for 4, 5 and 6 week months", () => {
    expect(calendarDays(new Date(2027, 1, 1), [], "2026-09-30")).toHaveLength(28); // 2027-02: 月曜始まり・28日
    expect(calendarDays(new Date(2026, 8, 1), [], "2026-09-30")).toHaveLength(35);
    expect(calendarDays(new Date(2026, 5, 1), [], "2026-09-30")).toHaveLength(35);
    expect(calendarDays(new Date(2026, 7, 1), [], "2026-09-30")).toHaveLength(42); // 2026-08: 土曜始まり・31日
  });

  it("classifies recorded, missing, today and future days and keeps navigation targets", () => {
    const days = calendarDays(new Date(2026, 8, 1), [review("2026-09-01", 99.6, "A"), review("2026-09-02", 0, "E")], "2026-09-29");
    const at = (iso: string) => days.find((d) => d.iso === iso)!;
    expect(at("2026-09-01")).toMatchObject({ kind: "recorded", score: 100, cluster: "A", href: "/day/2026-09-01", label: "2026年9月1日 100点 ランクA" });
    expect(at("2026-09-02")).toMatchObject({ kind: "recorded", score: 0, cluster: "E" });
    expect(at("2026-09-03")).toMatchObject({ kind: "missing", score: null, label: "2026年9月3日 記録なし" });
    expect(at("2026-09-29")).toMatchObject({ kind: "today", isToday: true, href: "/", label: "2026年9月29日（今日） 記録なし" });
    expect(at("2026-09-30")).toMatchObject({ kind: "future", label: "2026年9月30日 未来" });
    expect(days[0]).toMatchObject({ iso: "2026-08-31", inMonth: false, day: 31 });
  });

  it("treats a recorded today as recorded while still linking to Today", () => {
    const [today] = calendarDays(new Date(2026, 8, 1), [review("2026-09-29", 72.4, "B")], "2026-09-29").filter((d) => d.isToday);
    expect(today).toMatchObject({ kind: "recorded", score: 72, href: "/", label: "2026年9月29日（今日） 72点 ランクB" });
  });
});
