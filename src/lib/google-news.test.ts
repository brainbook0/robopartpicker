import { describe, expect, it } from "vitest";
import { googleNewsMentionCount, googleNewsQueryUrl } from "./google-news";

describe("Google News 90-day mention signal", () => {
  it("counts unique RSS items rather than duplicate GUIDs", () => {
    const xml = `<rss><channel><item><guid>a</guid><title>One</title></item><item><guid>b</guid><title>Two</title></item><item><guid>a</guid><title>Duplicate</title></item></channel></rss>`;
    expect(googleNewsMentionCount(xml)).toBe(2);
  });

  it("returns null for non-RSS or malformed payloads", () => {
    expect(googleNewsMentionCount("<html>blocked</html>")).toBeNull();
  });

  it("builds an English-US exact identity query bounded to 90 days", () => {
    const url = new URL(googleNewsQueryUrl("Unitree Robotics", "G1"));
    expect(url.hostname).toBe("news.google.com");
    expect(url.searchParams.get("q")).toBe('"Unitree Robotics G1" robot when:90d');
    expect(url.searchParams.get("ceid")).toBe("US:en");
  });
});
