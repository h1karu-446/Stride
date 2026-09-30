import { describe, expect, it } from "vitest";
import { parseVision, serializeVision } from "./vision";

describe("vision bullets", () => {
  it("reads existing plain and marked lines without duplicate bullets", () => {
    expect(parseVision("字幕なしで映画を見る")).toEqual(["字幕なしで映画を見る"]);
    expect(parseVision("- 映画を見る\n• 英語で研究する\n2. 発表する\n")).toEqual([
      "映画を見る", "英語で研究する", "発表する",
    ]);
  });

  it("serializes only nonempty items in order", () => {
    expect(serializeVision([" 映画を見る ", "", "英語で研究する"])).toBe("映画を見る\n英語で研究する");
  });
});
