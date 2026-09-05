import { stableId } from "./physical-design-wave-import";
import { resolveUpstreamIdentity } from "../shared/provenance";
import { ROBOT_CATEGORIES, type RobotCategory } from "../shared/robotCategory";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommercialCandidate {
  slug: string;
  name: string;
  manufacturer: string;
  model: string;
  category: RobotCategory;
  officialProductUrl: string;
  officialDocsUrl?: string;
  lifecycle: string;
  retrievedAt: string;
  aliases: string[];
  kind: "complete_robot";
  sourceAvailability: "closed_source";
}

export interface CommercialSpec {
  key: string;
  label: string;
  value?: string | number;
  undisclosed?: boolean;
  unit?: string;
  sourceUrl: string;
  observedAt: string;
  confidence: number;
}

export type CommercialPriceKind =
  | "published_price"
  | "published_range"
  | "market_estimate"
  | "not_published";

export interface CommercialPricedValue {
  kind: Exclude<CommercialPriceKind, "not_published">;
  currency: "USD";
  /** USD price expressed in minor units (cents). */
  minMinor: number;
  maxMinor: number;
  confidence: number;
  methodVersion: string;
  valuedAt: string;
  expiresAt?: string;
  sourceUrls: string[];
}

export interface CommercialPriceUnavailable {
  kind: "not_published";
  confidence: number;
  methodVersion: string;
  valuedAt: string;
  sourceUrls: string[];
  summary: string;
}

export type CommercialPrice = CommercialPricedValue | CommercialPriceUnavailable;

export interface CommercialTrend {
  rank: number;
  searchInterest: number;
  newsVelocity: number;
  videoViewVelocity: number;
  officialActivity: number;
  firstPartyTraffic: number | null;
  trafficSampleSufficient: boolean;
  compositeScore: number;
  methodologyVersion: string;
  windowStart: string;
  windowEnd: string;
  capturedAt: string;
}

export interface CommercialEvidence {
  title: string;
  sourceType: string;
  sourceUrl: string;
  retrievedAt: string;
  confidence: number;
}

export interface CommercialMediaDeclaration {
  kind: "product_image" | "identity_illustration";
  sourceUrl: string;
  retrievedAt: string;
  title: string;
  altText: string;
  attribution: string;
}

export interface CommercialProfile extends CommercialCandidate {
  description: string;
  useCases: string[];
  specs: CommercialSpec[];
  price: CommercialPrice;
  trend: CommercialTrend;
  evidence: CommercialEvidence[];
  media: CommercialMediaDeclaration[];
}

// ---------------------------------------------------------------------------
// Deterministic IDs
// ---------------------------------------------------------------------------

/** Deterministic project id seeded from the candidate's slug. */
export function commercialCatalogProjectId(
  candidate: Pick<CommercialCandidate, "slug">,
): string {
  return stableId("proj", `commercial-catalog:${candidate.slug}`);
}

/** Deterministic profile id seeded from the project id. */
export function commercialCatalogProfileId(projectId: string): string {
  return stableId("prof", `commercial-catalog-profile:${projectId}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value || !value) return false;
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    return resolveUpstreamIdentity({ upstreamUrl: value }) !== null;
  } catch {
    return false;
  }
}

const RFC3339_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u;

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = RFC3339_RE.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (hour > 23 || minute > 59 || second > 59) return false;
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    calendar.getUTCFullYear() !== year
    || calendar.getUTCMonth() !== month - 1
    || calendar.getUTCDate() !== day
  ) return false;
  return Number.isFinite(Date.parse(value));
}

function isValidConfidence(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizedIdentity(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isSafeMinor(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

const PRICE_KINDS = new Set<string>([
  "published_price",
  "published_range",
  "market_estimate",
  "not_published",
]);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a single commercial candidate.
 * Returns an array of human-readable error strings (empty = valid).
 */
export function validateCommercialCandidate(
  candidate: unknown,
): string[] {
  const errors: string[] = [];

  if (!candidate || typeof candidate !== "object") {
    return ["Candidate must be a non-null object"];
  }

  const c = candidate as Record<string, unknown>;

  // slug
  if (!c.slug || typeof c.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(c.slug)) {
    errors.push("candidate.slug is required and must be lowercase kebab-case");
  }

  // name
  if (!c.name || typeof c.name !== "string" || !c.name.trim()) {
    errors.push("candidate.name is required and must be a non-empty string");
  }

  // manufacturer
  if (
    !c.manufacturer ||
    typeof c.manufacturer !== "string" ||
    !c.manufacturer.trim()
  ) {
    errors.push(
      "candidate.manufacturer is required and must be a non-empty string",
    );
  }

  // model
  if (!c.model || typeof c.model !== "string" || !c.model.trim()) {
    errors.push("candidate.model is required and must be a non-empty string");
  }

  // category
  if (
    !c.category ||
    typeof c.category !== "string" ||
    !ROBOT_CATEGORIES.includes(c.category as RobotCategory)
  ) {
    errors.push(
      `candidate.category must be one of: ${ROBOT_CATEGORIES.join(", ")}`,
    );
  }

  // officialProductUrl
  if (
    !c.officialProductUrl ||
    typeof c.officialProductUrl !== "string" ||
    !isValidUrl(c.officialProductUrl)
  ) {
    errors.push(
      "candidate.officialProductUrl is required and must be a valid HTTP(S) URL",
    );
  }

  // officialDocsUrl (optional)
  if (c.officialDocsUrl !== undefined && c.officialDocsUrl !== null) {
    if (
      typeof c.officialDocsUrl !== "string" ||
      !isValidUrl(c.officialDocsUrl)
    ) {
      errors.push(
        "candidate.officialDocsUrl must be a valid HTTP(S) URL when present",
      );
    }
  }

  // lifecycle
  if (
    !c.lifecycle ||
    typeof c.lifecycle !== "string" ||
    !c.lifecycle.trim()
  ) {
    errors.push(
      "candidate.lifecycle is required and must be a non-empty string",
    );
  }

  // retrievedAt
  if (!c.retrievedAt || typeof c.retrievedAt !== "string") {
    errors.push(
      "candidate.retrievedAt is required and must be an ISO 8601 string",
    );
  } else if (!isValidDate(c.retrievedAt)) {
    errors.push("candidate.retrievedAt must be a valid ISO 8601 date");
  }

  // kind
  if (c.kind !== "complete_robot") {
    errors.push('candidate.kind must be "complete_robot" (component-like records are not accepted)');
  }

  if (c.sourceAvailability !== "closed_source") {
    errors.push('candidate.sourceAvailability must be "closed_source"');
  }

  // aliases
  if (!Array.isArray(c.aliases)) {
    errors.push("candidate.aliases must be an array");
  } else {
    const aliases = new Set<string>();
    for (let index = 0; index < c.aliases.length; index++) {
      const alias = c.aliases[index];
      if (!isNonEmptyString(alias)) {
        errors.push(`candidate.aliases[${index}] must be a non-empty string`);
        continue;
      }
      const normalized = normalizedIdentity(alias);
      if (aliases.has(normalized)) errors.push(`candidate.aliases contains duplicate alias "${alias.trim()}"`);
      aliases.add(normalized);
    }
  }

  return errors;
}

/**
 * Validate a batch of commercial candidates for cross-record consistency.
 * Returns an array of human-readable error strings (empty = valid).
 */
export function validateCommercialCandidates(
  candidates: unknown,
): string[] {
  const errors: string[] = [];

  if (!Array.isArray(candidates)) {
    return ["Candidates must be an array"];
  }

  const slugs = new Map<string, number>();
  const upstreams = new Map<string, number>();
  const manufacturerModels = new Map<string, number>();
  const aliases = new Map<string, number>();

  for (let index = 0; index < candidates.length; index++) {
    for (const error of validateCommercialCandidate(candidates[index])) errors.push(`candidates[${index}]: ${error}`);
    const candidate = candidates[index] as Record<string, unknown> | undefined;
    if (!candidate || typeof candidate !== "object") continue;

    const slug = isNonEmptyString(candidate.slug) ? normalizedIdentity(candidate.slug) : "";
    if (slug) {
      const first = slugs.get(slug);
      if (first !== undefined) errors.push(`Duplicate case-insensitive slug "${String(candidate.slug)}" at index ${index} (first seen at index ${first})`);
      else slugs.set(slug, index);
    }

    const upstream = isValidUrl(candidate.officialProductUrl)
      ? resolveUpstreamIdentity({ upstreamUrl: candidate.officialProductUrl })
      : null;
    if (upstream) {
      const first = upstreams.get(upstream);
      if (first !== undefined) errors.push(`Duplicate canonical upstream identity "${upstream}" at index ${index} (first seen at index ${first})`);
      else upstreams.set(upstream, index);
    }

    if (isNonEmptyString(candidate.manufacturer) && isNonEmptyString(candidate.model)) {
      const manufacturerModel = `${normalizedIdentity(candidate.manufacturer)}:${normalizedIdentity(candidate.model)}`;
      const first = manufacturerModels.get(manufacturerModel);
      if (first !== undefined) errors.push(`Duplicate manufacturer/model identity at indices ${first} and ${index}: "${candidate.manufacturer}" / "${candidate.model}"; material variants require a distinct model/variant identity and official URL`);
      else manufacturerModels.set(manufacturerModel, index);
    }
  }

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index] as Record<string, unknown> | undefined;
    if (!candidate || typeof candidate !== "object" || !Array.isArray(candidate.aliases)) continue;
    for (const alias of candidate.aliases) {
      if (!isNonEmptyString(alias)) continue;
      const normalized = normalizedIdentity(alias);
      const slugOwner = slugs.get(normalized);
      if (slugOwner !== undefined) errors.push(`Alias collision: candidate at index ${index} has alias "${alias.trim()}" matching candidate slug at index ${slugOwner}`);
      const aliasOwner = aliases.get(normalized);
      if (aliasOwner !== undefined) errors.push(`Alias collision: candidate at index ${index} has alias "${alias.trim()}" already used at index ${aliasOwner}`);
      else aliases.set(normalized, index);
    }
  }

  return errors;
}

/**
 * Validate a commercial profile.  Runs candidate-level checks first,
 * then applies profile-specific rules.
 * Returns an array of human-readable error strings (empty = valid).
 */
export function validateCommercialProfile(profile: unknown): string[] {
  const errors = validateCommercialCandidate(profile);
  if (!profile || typeof profile !== "object") return errors;
  const p = profile as Record<string, unknown>;

  // description — must be substantial (≥ 50 chars)
  if (
    !p.description ||
    typeof p.description !== "string" ||
    p.description.trim().length < 50
  ) {
    errors.push(
      "profile.description must be a non-empty string with at least 50 characters",
    );
  }

  // useCases — non-empty array
  if (!Array.isArray(p.useCases) || p.useCases.length === 0 || p.useCases.some((value) => !isNonEmptyString(value))) {
    errors.push("profile.useCases must be a non-empty array");
  }

  // --- specs ---
  if (!Array.isArray(p.specs) || p.specs.length === 0) {
    errors.push("profile.specs must be a non-empty array");
  } else {
    const specs = p.specs as Record<string, unknown>[];
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];

      if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
        errors.push(`profile.specs[${i}] must be an object`);
        continue;
      }

      if (!isNonEmptyString(spec.key)) {
        errors.push(`profile.specs[${i}].key is required`);
      }
      if (!isNonEmptyString(spec.label)) {
        errors.push(`profile.specs[${i}].label is required`);
      }
      if (
        !spec.sourceUrl ||
        typeof spec.sourceUrl !== "string" ||
        !isValidUrl(spec.sourceUrl)
      ) {
        errors.push(
          `profile.specs[${i}].sourceUrl must be a valid HTTP(S) URL`,
        );
      }
      if (
        !spec.observedAt ||
        typeof spec.observedAt !== "string" ||
        !isValidDate(spec.observedAt)
      ) {
        errors.push(
          `profile.specs[${i}].observedAt must be a valid ISO 8601 date`,
        );
      }
      if (!isValidConfidence(spec.confidence)) {
        errors.push(
          `profile.specs[${i}].confidence must be a number > 0 and <= 1`,
        );
      }

      const hasValue = spec.value !== undefined && spec.value !== null;
      const hasUndisclosed = spec.undisclosed === true;

      if (spec.undisclosed !== undefined && typeof spec.undisclosed !== "boolean") {
        errors.push(`profile.specs[${i}].undisclosed must be boolean when present`);
      }
      if (hasValue && !(
        (typeof spec.value === "string" && spec.value.trim().length > 0)
        || (typeof spec.value === "number" && Number.isFinite(spec.value))
      )) errors.push(`profile.specs[${i}].value must be a non-empty string or finite number`);
      if (spec.unit !== undefined && !isNonEmptyString(spec.unit)) errors.push(`profile.specs[${i}].unit must be non-empty when present`);

      if (hasValue && hasUndisclosed) {
        errors.push(
          `profile.specs[${i}] cannot declare both value and undisclosed=true`,
        );
      }
      if (!hasValue && !hasUndisclosed) {
        errors.push(
          `profile.specs[${i}] must declare either value or undisclosed=true`,
        );
      }
    }
  }

  // --- media ---
  if (!Array.isArray(p.media) || p.media.length === 0) {
    errors.push(
      "profile.media must be a non-empty array of media declarations",
    );
  } else {
    for (let index = 0; index < p.media.length; index++) {
      const media = p.media[index] as Record<string, unknown>;
      if (!media || typeof media !== "object") { errors.push(`profile.media[${index}] must be an object`); continue; }
      if (media.kind !== "product_image" && media.kind !== "identity_illustration") errors.push(`profile.media[${index}].kind must be product_image or identity_illustration`);
      if (!isValidUrl(media.sourceUrl)) errors.push(`profile.media[${index}].sourceUrl must be a valid HTTP(S) URL`);
      if (!isValidDate(media.retrievedAt)) errors.push(`profile.media[${index}].retrievedAt must be a valid RFC3339 timestamp`);
      if (!isNonEmptyString(media.title)) errors.push(`profile.media[${index}].title is required`);
      if (!isNonEmptyString(media.altText)) errors.push(`profile.media[${index}].altText is required`);
      if (!isNonEmptyString(media.attribution)) errors.push(`profile.media[${index}].attribution is required`);
    }
  }

  // --- evidence ---
  if (!Array.isArray(p.evidence) || p.evidence.length === 0) {
    errors.push("profile.evidence must be a non-empty array");
  } else {
    for (let index = 0; index < p.evidence.length; index++) {
      const evidence = p.evidence[index] as Record<string, unknown>;
      if (!evidence || typeof evidence !== "object") { errors.push(`profile.evidence[${index}] must be an object`); continue; }
      if (!isNonEmptyString(evidence.title)) errors.push(`profile.evidence[${index}].title is required`);
      if (!isNonEmptyString(evidence.sourceType)) errors.push(`profile.evidence[${index}].sourceType is required`);
      if (!isValidUrl(evidence.sourceUrl)) errors.push(`profile.evidence[${index}].sourceUrl must be a valid HTTP(S) URL`);
      if (!isValidDate(evidence.retrievedAt)) errors.push(`profile.evidence[${index}].retrievedAt must be a valid RFC3339 timestamp`);
      if (!isValidConfidence(evidence.confidence)) errors.push(`profile.evidence[${index}].confidence must be > 0 and <= 1`);
    }
  }

  // --- price ---
  if (!p.price || typeof p.price !== "object") {
    errors.push("profile.price is required");
  } else {
    const price = p.price as Record<string, unknown>;

    if (!PRICE_KINDS.has(price.kind as string)) {
      errors.push(
        "profile.price.kind must be published_price, published_range, market_estimate, or not_published",
      );
    }

    if (price.kind === "not_published") {
      if (!isNonEmptyString(price.summary)) errors.push("profile.price.summary is required when price is not published");
      if (price.currency !== undefined || price.minMinor !== undefined || price.maxMinor !== undefined) {
        errors.push("profile.price not_published must not contain currency or numeric price fields");
      }
    } else {
      if (price.currency !== "USD") errors.push("profile.price.currency must be USD");
      if (!isSafeMinor(price.minMinor) || !isSafeMinor(price.maxMinor)) {
        errors.push("profile.price.minMinor and maxMinor must be safe nonnegative integers");
      } else if (price.minMinor > price.maxMinor) {
        errors.push("profile.price.minMinor must not exceed maxMinor");
      } else if (price.kind === "published_price" && price.minMinor !== price.maxMinor) {
        errors.push("profile.price published_price must have equal minMinor and maxMinor");
      }
    }

    if (!isValidConfidence(price.confidence)) {
      errors.push(
        "profile.price.confidence must be a number > 0 and <= 1",
      );
    }

    if (!isNonEmptyString(price.methodVersion)) {
      errors.push("profile.price.methodVersion is required");
    }

    if (
      !price.valuedAt ||
      !isValidDate(price.valuedAt)
    ) {
      errors.push("profile.price.valuedAt must be a valid ISO 8601 date");
    }

    if (price.expiresAt !== undefined) {
      if (!isValidDate(price.expiresAt)) errors.push("profile.price.expiresAt must be a valid RFC3339 timestamp");
      else if (isValidDate(price.valuedAt) && Date.parse(price.expiresAt) < Date.parse(price.valuedAt)) errors.push("profile.price.expiresAt must not precede valuedAt");
    }

    if (
      !Array.isArray(price.sourceUrls) ||
      price.sourceUrls.length === 0
    ) {
      errors.push("profile.price.sourceUrls must be a non-empty array");
    } else {
      const urls = price.sourceUrls as string[];
      for (let j = 0; j < urls.length; j++) {
        if (!isValidUrl(urls[j])) {
          errors.push(
            `profile.price.sourceUrls[${j}] must be a valid HTTP(S) URL`,
          );
        }
      }
    }
  }

  // --- trend ---
  if (!p.trend || typeof p.trend !== "object") {
    errors.push("profile.trend is required");
  } else {
    const trend = p.trend as Record<string, unknown>;
    if (!Number.isSafeInteger(trend.rank) || Number(trend.rank) < 1 || Number(trend.rank) > 300) errors.push("profile.trend.rank must be an integer between 1 and 300");
    for (const field of ["searchInterest", "newsVelocity", "videoViewVelocity", "officialActivity", "compositeScore"] as const) {
      if (!isScore(trend[field])) errors.push(`profile.trend.${field} must be between 0 and 100`);
    }
    if (typeof trend.trafficSampleSufficient !== "boolean") errors.push("profile.trend.trafficSampleSufficient must be boolean");
    if (trend.firstPartyTraffic !== null && !isScore(trend.firstPartyTraffic)) errors.push("profile.trend.firstPartyTraffic must be null or between 0 and 100");
    if (trend.trafficSampleSufficient === true && !isScore(trend.firstPartyTraffic)) errors.push("profile.trend.firstPartyTraffic is required when trafficSampleSufficient is true");
    if (!isNonEmptyString(trend.methodologyVersion)) errors.push("profile.trend.methodologyVersion is required");
    if (!isValidDate(trend.windowStart)) errors.push("profile.trend.windowStart must be a valid RFC3339 timestamp");
    if (!isValidDate(trend.windowEnd)) errors.push("profile.trend.windowEnd must be a valid RFC3339 timestamp");
    if (isValidDate(trend.windowStart) && isValidDate(trend.windowEnd) && Date.parse(trend.windowStart) >= Date.parse(trend.windowEnd)) errors.push("profile.trend windowStart must precede windowEnd");
    if (!isValidDate(trend.capturedAt)) errors.push("profile.trend.capturedAt must be a valid RFC3339 timestamp");
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Assert helpers
// ---------------------------------------------------------------------------

/** Narrow the type of `candidate` to `CommercialCandidate`, throwing on
 *  validation failure. */
export function assertCommercialCandidate(
  candidate: unknown,
): asserts candidate is CommercialCandidate {
  const errors = validateCommercialCandidate(candidate);
  if (errors.length > 0) {
    throw new Error(`Invalid commercial candidate: ${errors.join("; ")}`);
  }
}

/** Narrow the type of `profile` to `CommercialProfile`, throwing on
 *  validation failure. */
export function assertCommercialProfile(
  profile: unknown,
): asserts profile is CommercialProfile {
  const errors = validateCommercialProfile(profile);
  if (errors.length > 0) {
    throw new Error(`Invalid commercial profile: ${errors.join("; ")}`);
  }
}