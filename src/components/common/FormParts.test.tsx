import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { choiceClass, Field, FormActions } from "./FormParts";
import WishForm from "@/components/journey/WishForm";

describe("form conventions (Issue #57)", () => {
  it("marks optional fields in the visible label and the group name", () => {
    const out = renderToStaticMarkup(<Field group optional label="期日"><span /></Field>);
    expect(out).toContain('aria-label="期日（任意）"');
    expect(out).toContain("（任意）");
    expect(renderToStaticMarkup(<Field label="計画名"><input /></Field>)).not.toContain("任意");
  });

  it("shows the current choice and gives touch targets", () => {
    expect(choiceClass(true)).toContain("border-notion-blue");
    expect(choiceClass(false)).not.toContain("border-notion-blue");
    expect(choiceClass(false)).toContain("pointer:coarse");
  });

  it("disables the actions and says so while saving", () => {
    const out = renderToStaticMarkup(<FormActions onCancel={() => {}} canSave saving error />);
    expect(out).toContain("保存中…");
    expect(out).toContain('role="alert"');
    expect(out.match(/disabled=""/g)?.length).toBe(2);
  });

  it("renders the wish form with the shared parts", () => {
    const out = renderToStaticMarkup(<WishForm initial={{ title: "", note: "", importance: "中",
      emphasize_achievement: false, achieved_at: null }} onSubmit={() => {}} onCancel={() => {}}
      saving={false} failed={false} />);
    expect(out).toContain("やりたいこと");
    expect(out).toContain("（任意）");
    expect(out).toContain('aria-pressed="true"');
  });
});
