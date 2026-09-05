#!/usr/bin/env tsx
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { validateCommercialProfile, type CommercialPrice, type CommercialProfile } from "../src/lib/commercial-catalog";

type MarketStatus = "buy_now" | "contact_sales" | "early_access" | "enterprise_deployment" | "enterprise_pilot" | "preorder" | "raas" | "rental_or_quote" | "reservation";
type MarketCandidate = Omit<CommercialProfile, "description" | "useCases" | "specs" | "price" | "trend" | "evidence" | "media"> & {
  marketStatus: MarketStatus;
  availabilityEvidenceUrl: string;
};
type OfficialResult = {
  candidate: MarketCandidate;
  fetch: { ok: boolean; transport?: string; error?: string | null };
  profileDraft: Pick<CommercialProfile, "description" | "useCases" | "specs" | "price" | "evidence" | "media">;
};
type MarketProfile = CommercialProfile & { marketStatus: MarketStatus; availabilityEvidenceUrl: string };

function argument(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
const officialPath = resolve(argument("--official") ?? "data/commercial-catalog/market-expansion/official-pages.json");
const pricesPath = resolve(argument("--prices") ?? "data/commercial-catalog/market-expansion/price-overrides.json");
const mediaOverridesPath = resolve(argument("--media-overrides") ?? "data/commercial-catalog/market-expansion/media-overrides.json");
const sourceOverridesPath = resolve(argument("--source-overrides") ?? "data/commercial-catalog/market-expansion/source-overrides.json");
const outputPath = resolve(argument("--output") ?? "data/commercial-catalog/market-expansion/profiles.json");
const official = JSON.parse(readFileSync(officialPath, "utf8")) as { capturedAt: string; candidates: number; results: OfficialResult[] };
const prices = JSON.parse(readFileSync(pricesPath, "utf8")) as Record<string, CommercialPrice>;
type MediaOverride = string | { kind?: "product_image" | "identity_illustration"; sourceUrl: string; localPath?: string; transform?: string };
let mediaOverrides: Record<string, MediaOverride> = {};
try { mediaOverrides = JSON.parse(readFileSync(mediaOverridesPath, "utf8")) as Record<string, MediaOverride>; } catch { /* optional until the source audit identifies gaps */ }
let sourceOverrides: Record<string, { sourceUrl: string; description: string; imageUrl: string; reviewedAt: string; reason: string }> = {};
try { sourceOverrides = JSON.parse(readFileSync(sourceOverridesPath, "utf8")) as typeof sourceOverrides; } catch { /* explicit reviewed exceptions are optional */ }

const profiles: MarketProfile[] = [];
const invalid: Array<{ slug: string; errors: string[] }> = [];
for (const [index, result] of official.results.sort((left, right) => left.candidate.slug.localeCompare(right.candidate.slug)).entries()) {
  const sourceOverride = sourceOverrides[result.candidate.slug];
  const sourceOk = result.fetch.ok || sourceOverride?.sourceUrl === result.candidate.officialProductUrl;
  const mediaOverride = mediaOverrides[result.candidate.slug];
  const imageUrl = (typeof mediaOverride === "string" ? mediaOverride : mediaOverride?.sourceUrl) ?? sourceOverride?.imageUrl ?? result.profileDraft.media[0]?.sourceUrl;
  const errors: string[] = [];
  if (!sourceOk) errors.push(`official source unavailable${result.fetch.error ? `: ${result.fetch.error}` : ""}`);
  if (!imageUrl) errors.push("official product image unavailable");
  if (!result.candidate.marketStatus || !result.candidate.availabilityEvidenceUrl) errors.push("market availability evidence missing");
  const description = marketDescription(result.candidate);
  const evidence = [...result.profileDraft.evidence];
  if (!evidence.some((item) => item.sourceUrl === result.candidate.availabilityEvidenceUrl)) {
    evidence.push({
      title: `Official ${result.candidate.manufacturer} market availability evidence for ${result.candidate.model}`,
      sourceType: "official_availability_page",
      sourceUrl: result.candidate.availabilityEvidenceUrl,
      retrievedAt: result.candidate.retrievedAt,
      confidence: 0.9,
    });
  }
  const profile: MarketProfile = {
    ...result.candidate,
    description,
    useCases: [marketStatusLabel(result.candidate.marketStatus), ...result.profileDraft.useCases].filter((value, itemIndex, values) => values.indexOf(value) === itemIndex),
    specs: result.profileDraft.specs,
    price: prices[result.candidate.slug] ?? result.profileDraft.price,
    trend: {
      rank: index + 1,
      searchInterest: 0,
      newsVelocity: 0,
      videoViewVelocity: 0,
      officialActivity: 0,
      firstPartyTraffic: null,
      trafficSampleSufficient: false,
      compositeScore: 0,
      methodologyVersion: "humanoid-market-official-listing-v1",
      windowStart: "2026-08-26T00:00:00.000Z",
      windowEnd: "2026-08-27T00:00:00.000Z",
      capturedAt: official.capturedAt,
    },
    evidence,
    media: imageUrl ? [{
      kind: typeof mediaOverride === "object" && mediaOverride.kind === "identity_illustration" ? "identity_illustration" : "product_image",
      sourceUrl: imageUrl,
      retrievedAt: result.candidate.retrievedAt,
      title: typeof mediaOverride === "object" && mediaOverride.kind === "identity_illustration" ? `Identity illustration for ${result.candidate.name}` : `Official product image for ${result.candidate.name}`,
      altText: typeof mediaOverride === "object" && mediaOverride.kind === "identity_illustration" ? `${result.candidate.name} identity illustration, not a product photograph` : `${result.candidate.manufacturer} ${result.candidate.model} product image`,
      attribution: typeof mediaOverride === "object" && mediaOverride.kind === "identity_illustration" ? "RoboPartPicker identity illustration" : result.candidate.manufacturer,
    }] : [],
    marketStatus: result.candidate.marketStatus,
    availabilityEvidenceUrl: result.candidate.availabilityEvidenceUrl,
  };
  errors.push(...validateCommercialProfile(profile));
  if (errors.length) invalid.push({ slug: result.candidate.slug, errors: [...new Set(errors)] });
  else profiles.push(profile);
}
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify({ generatedAt: official.capturedAt, methodologyVersion: "humanoid-market-official-listing-v1", profiles, invalid }, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, candidates: official.candidates, profiles: profiles.length, invalid: invalid.length, invalidRecords: invalid }, null, 2));
if (profiles.length !== official.candidates || invalid.length) process.exitCode = 1;

function marketDescription(candidate: MarketCandidate): string {
  const availability: Record<MarketStatus, string> = {
    buy_now: "sold through an official manufacturer purchase channel",
    contact_sales: "listed for manufacturer sales inquiries",
    early_access: "offered through manufacturer early access",
    enterprise_deployment: "deployed through an active manufacturer enterprise program",
    enterprise_pilot: "offered through manufacturer enterprise pilots",
    preorder: "available for manufacturer preorder",
    raas: "offered through a manufacturer robot-as-a-service program",
    rental_or_quote: "available by rental or manufacturer quote",
    reservation: "available through an official manufacturer reservation channel",
  };
  return `${candidate.name} is a closed-source humanoid robot from ${candidate.manufacturer}. It is ${availability[candidate.marketStatus]}. Public build documentation and a reproducible manufacturer BOM are not available for this catalog entry.`;
}
function marketStatusLabel(status: MarketStatus): string {
  const labels: Record<MarketStatus, string> = {
    buy_now: "Available through an official purchase channel",
    contact_sales: "Available through manufacturer sales inquiry",
    early_access: "Available through manufacturer early access",
    enterprise_deployment: "Active manufacturer-backed enterprise deployment",
    enterprise_pilot: "Available through manufacturer enterprise pilots",
    preorder: "Available for manufacturer preorder",
    raas: "Available through a manufacturer robot-as-a-service program",
    rental_or_quote: "Available by rental or manufacturer quote",
    reservation: "Available through an official reservation channel",
  };
  return labels[status];
}
