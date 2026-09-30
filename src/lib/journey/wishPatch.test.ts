import { describe, expect, it } from "vitest";
import { wishPatch } from "./queries";

const base = { title: " 富士山に登る ", note: "", importance: "重" as const, emphasize_achievement: true };

describe("wishPatch", () => {
  it("leaves achieved_at untouched for a pending wish", () => {
    expect(wishPatch({ ...base, achieved_at: null })).not.toHaveProperty("achieved_at");
  });
  it("sends the edited achieved date for an achieved wish", () => {
    expect(wishPatch({ ...base, achieved_at: "2026-09-01" })).toMatchObject({ title: "富士山に登る", achieved_at: "2026-09-01" });
  });
});
