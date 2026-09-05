import { describe, expect, it } from "vitest";
import { gdeltArticleCount, gdeltQueryUrl } from "./gdelt-news";

describe("GDELT commercial news signal", () => {
  it("sums raw daily article counts without using normalized corpus volume", () => {
    expect(gdeltArticleCount({ timeline: [{ series: "Article Count", data: [{ value: 2, norm: 1000 }, { value: 3, norm: 2000 }] }] })).toBe(5);
  });

  it("returns null for malformed or missing article-count timelines", () => {
    expect(gdeltArticleCount({ timeline: [] })).toBeNull();
    expect(gdeltArticleCount({ timeline: [{ series: "Other", data: [{ value: 4 }] }] })).toBeNull();
  });

  it("builds a source URL with the exact model identity and bounded window", () => {
    const url = new URL(gdeltQueryUrl("Unitree Robotics", "G1", "20260527000000", "20260825000000"));
    expect(url.hostname).toBe("api.gdeltproject.org");
    expect(url.searchParams.get("query")).toContain('"Unitree Robotics G1"');
    expect(url.searchParams.get("mode")).toBe("timelinevolraw");
  });
});
