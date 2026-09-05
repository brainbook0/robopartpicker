import { describe, expect, it } from "vitest";
import { validateCommercialCandidate } from "./commercial-catalog";
import candidatesJson from "../../data/commercial-catalog/market-expansion/candidates/humanoid-market-2026-08-27.json?raw";
import pricesJson from "../../data/commercial-catalog/market-expansion/price-overrides.json?raw";
import sourceOverridesJson from "../../data/commercial-catalog/market-expansion/source-overrides.json?raw";
import mediaOverridesJson from "../../data/commercial-catalog/market-expansion/media-overrides.json?raw";
import publisher from "../../scripts/publish-commercial-humanoid-market.ts?raw";
import mirror from "../../scripts/mirror-commercial-humanoid-market-media.ts?raw";
import builder from "../../scripts/build-commercial-humanoid-market-profiles.ts?raw";

const candidates = JSON.parse(candidatesJson) as Array<Record<string, unknown>>;
const prices = JSON.parse(pricesJson) as Record<string, { methodVersion: string; sourceUrls: string[] }>;
const sourceOverrides = JSON.parse(sourceOverridesJson) as Record<string, { sourceUrl: string; imageUrl: string; reason: string }>;
const mediaOverrides = JSON.parse(mediaOverridesJson) as Record<string, string | { kind?: string; sourceUrl: string }>;

describe("current-market closed-source humanoid expansion", () => {
  it("contains 49 unique source-valid humanoids from active manufacturer channels", () => {
    expect(candidates).toHaveLength(49);
    expect(new Set(candidates.map((item) => String(item.slug).toLocaleLowerCase("en-US"))).size).toBe(49);
    expect(new Set(candidates.map((item) => String(item.officialProductUrl).toLocaleLowerCase("en-US").replace(/\/$/u, ""))).size).toBe(49);
    for (const candidate of candidates) {
      expect(validateCommercialCandidate(candidate), String(candidate.slug)).toEqual([]);
      expect(candidate.category).toBe("humanoid");
      expect(candidate.sourceAvailability).toBe("closed_source");
      expect(candidate.marketStatus).toMatch(/^(?:buy_now|contact_sales|early_access|enterprise_deployment|enterprise_pilot|preorder|raas|rental_or_quote|reservation)$/u);
      expect(String(candidate.availabilityEvidenceUrl)).toMatch(/^https?:\/\//u);
    }
  });

  it("excludes announced or historical products without a current manufacturer market channel", () => {
    const names = candidates.map((item) => `${item.manufacturer} ${item.model}`.toLocaleLowerCase("en-US")).join(" ");
    expect(names).not.toContain("xpeng iron");
    expect(names).not.toContain("pepper");
    expect(names).not.toContain("nao");
  });

  it("publishes market availability without mutating the active trend snapshot", () => {
    expect(publisher).toContain("market_availability");
    expect(publisher).toContain("current-market");
    expect(publisher).not.toContain("INSERT INTO project_trend_snapshots");
    expect(publisher).not.toContain("UPDATE project_trend_snapshots SET active = 0");
  });

  it("requires one mirrored reviewed visual for every profile", () => {
    expect(mirror).toContain("items.length !== payload.profiles.length");
    expect(builder).toContain("official product image unavailable");
    expect(publisher).toContain("one mirrored media item per profile");
    expect(Object.entries(mediaOverrides).filter(([, value]) => typeof value === "object" && value.kind === "identity_illustration").map(([slug]) => slug)).toEqual(["persona-industrial-humanoid"]);
  });

  it("keeps generated public descriptions normal and free of collector debris", () => {
    expect(builder).toContain("marketDescription(result.candidate)");
    expect(builder).not.toContain("normalDescription(sourceOverride?.description");
    expect(builder).not.toContain("URL Source:");
    expect(builder).not.toContain("Title:");
  });

  it("stores only reviewed official-product USD prices", () => {
    expect(Object.keys(prices).sort()).toEqual(["booster-robotics-k1", "unitree-r1"]);
    for (const price of Object.values(prices)) {
      expect(price.methodVersion).toBe("official-product-price-v1");
      expect(price.sourceUrls.every((url) => /^https?:\/\//u.test(url))).toBe(true);
    }
  });

  it("limits blocked-source exceptions to documented manufacturer-owned evidence", () => {
    expect(Object.keys(sourceOverrides)).toEqual(["persona-industrial-humanoid"]);
    expect(sourceOverrides["persona-industrial-humanoid"].sourceUrl).toMatch(/^https:\/\/persona\.ai\//u);
    expect(sourceOverrides["persona-industrial-humanoid"].imageUrl).toMatch(/^https:\/\/persona\.ai\//u);
    expect(sourceOverrides["persona-industrial-humanoid"].reason).toContain("maintenance mode");
  });
});
