import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import WishForm from "./WishForm";

describe("WishForm (Issue #57)", () => {
  it("renders the wish form with the shared parts", () => {
    const out = renderToStaticMarkup(<WishForm initial={{ title: "", note: "", importance: "中",
      emphasize_achievement: false, achieved_at: null }} onSubmit={() => {}} onCancel={() => {}}
      saving={false} failed={false} />);
    expect(out).toContain("やりたいこと");
    expect(out).toContain("（任意）");
    expect(out).toContain('aria-pressed="true"');
  });
});
