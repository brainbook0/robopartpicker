import { describe, expect, it } from "vitest";
import { parseYouTubeSearchHtml, recentVideoViewVelocity, youtubeSearchUrl } from "./youtube-velocity";

describe("YouTube commercial video velocity", () => {
  const data = { contents: [{ videoRenderer: { videoId: "a", title: { runs: [{ text: "Robot demo" }] }, viewCountText: { simpleText: "4,983 views" }, publishedTimeText: { simpleText: "3 months ago" } } }, { videoRenderer: { videoId: "b", title: { runs: [{ text: "Old demo" }] }, viewCountText: { simpleText: "2,000 views" }, publishedTimeText: { simpleText: "2 years ago" } } }] };
  const html = `<script>var ytInitialData = ${JSON.stringify(data)};</script>`;

  it("extracts unique video view counts and relative ages from public search data", () => {
    expect(parseYouTubeSearchHtml(html)).toEqual([
      { id: "a", title: "Robot demo", viewCount: 4983, ageDays: 90 },
      { id: "b", title: "Old demo", viewCount: 2000, ageDays: 730 },
    ]);
  });

  it("sums views per day only for videos published within the recent window", () => {
    expect(recentVideoViewVelocity(parseYouTubeSearchHtml(html), 365)).toBeCloseTo(4983 / 90);
  });

  it("builds a reproducible public search URL", () => {
    const url = new URL(youtubeSearchUrl("Unitree Robotics", "G1"));
    expect(url.hostname).toBe("www.youtube.com");
    expect(url.searchParams.get("search_query")).toBe("Unitree Robotics G1 robot");
  });
});
