/**
 * Shared project-profile DTOs and pure display/freshness/trend/completeness
 * rules for RoboPartPicker.  Framework-free; no side effects.
 *
 * Design reference:
 *   docs/superpowers/specs/2026-08-25-trending-commercial-catalog-reviews-design.md
 */

// ---------------------------------------------------------------------------
// DTO types (immutable records)
// ---------------------------------------------------------------------------

export type PriceEstimateType = "published_price" | "published_range" | "market_estimate";

export type EstimateConfidence = "high" | "medium" | "low";

export interface ProjectPriceEstimate {
  readonly id: string;
  readonly project_id: string;
  readonly estimate_type: PriceEstimateType;
  readonly currency: string;
  readonly min_minor: number;
  readonly max_minor: number;
  readonly representative_minor: number | null;
  readonly confidence: EstimateConfidence;
  readonly method_version: string;
  readonly summary: string | null;
  readonly valued_at: string;
  readonly expires_at: string | null;
  readonly status: "active" | "superseded" | "withdrawn";
  readonly created_at: string;
  readonly updated_at: string;
}

export type PriceFreshness = "current" | "refresh_required";

export interface ProjectTrendSnapshot {
  readonly id: string;
  readonly project_id: string;
  readonly methodology_version: string;
  readonly window_start: string;
  readonly window_end: string;
  readonly search_score: number;
  readonly news_score: number;
  readonly video_score: number;
  readonly official_score: number;
  readonly first_party_traffic_score: number | null;
  readonly traffic_sample_sufficient: boolean;
  readonly composite_score: number;
  readonly rank: number;
  readonly active: boolean;
  readonly captured_at: string;
  readonly created_at: string;
}

export interface ProjectSpec {
  readonly id: string;
  readonly project_id: string;
  readonly spec_key: string;
  readonly label: string;
  readonly value_text: string | null;
  readonly value_number: number | null;
  readonly unit: string | null;
  readonly confidence: number;
  readonly observed_at: string;
  readonly evidence_id: string | null;
  readonly is_current: boolean;
  readonly sort_order: number;
  readonly created_at: string;
  readonly updated_at: string;
}

// ---------------------------------------------------------------------------
// Trend weights
// ---------------------------------------------------------------------------

export interface TrendWeights {
  readonly search: number;
  readonly news: number;
  readonly video: number;
  readonly official: number;
  readonly firstParty: number;
}

export interface TrendSignals {
  readonly search: number;
  readonly news: number;
  readonly video: number;
  readonly official: number;
  readonly firstParty: number;
}

// ---------------------------------------------------------------------------
// Commercial profile completeness
// ---------------------------------------------------------------------------

export type ProfileFieldState = "source-backed" | "undisclosed" | "missing";

export interface CommercialProfileFields {
  identity?: unknown;
  manufacturer?: unknown;
  model?: unknown;
  category?: unknown;
  description?: unknown;
  officialUrls?: unknown;
  lifecycle?: unknown;
  observedDate?: unknown;
  specStates?: unknown;
  productMedia?: unknown;
  publicPriceOrEstimate?: unknown;
  trend?: unknown;
  evidence?: unknown;
}

export interface CompletenessResult {
  complete: boolean;
  missing: string[];
  fields: Record<string, ProfileFieldState>;
}

// ---------------------------------------------------------------------------
// selectActiveProjectPriceEstimate
// ---------------------------------------------------------------------------

/**
 * Returns the newest active (status === "active") estimate by valued_at.
 * Expired-but-still-active estimates are returned (freshness callers label them).
 * Returns null when no active estimate exists.
 *
 * Invalid valued_at dates are excluded (fail-closed).
 */
export function selectActiveProjectPriceEstimate(
  estimates: readonly ProjectPriceEstimate[],
): ProjectPriceEstimate | null {
  const active = estimates.filter((estimate) => estimate.status === "active" && toMsOrNull(estimate.valued_at) !== null);
  if (active.length === 0) return null;

  const sorted = [...active].sort((a, b) => {
    const da = toMsOrNull(a.valued_at);
    const db = toMsOrNull(b.valued_at);
    if (da === null || db === null) return 0;
    return db - da;
  });

  return sorted[0];
}

/** Returns the newest active trend snapshot by captured_at. Historical and
 * malformed active rows are ignored so an invalid timestamp never replaces a
 * valid ranking snapshot. */
export function selectActiveTrendSnapshot(
  snapshots: readonly ProjectTrendSnapshot[],
): ProjectTrendSnapshot | null {
  const active = snapshots.filter((snapshot) => snapshot.active && toMsOrNull(snapshot.captured_at) !== null);
  if (active.length === 0) return null;
  return [...active].sort((left, right) =>
    (toMsOrNull(right.captured_at) ?? 0) - (toMsOrNull(left.captured_at) ?? 0)
  )[0];
}

// ---------------------------------------------------------------------------
// projectPriceFreshness
// ---------------------------------------------------------------------------

/**
 * Labels an estimate as "current" or "refresh_required" relative to `asOf`.
 * `asOf` defaults to the current instant when omitted.
 *
 * Invalid `expires_at` or `asOf` are treated fail-closed (refresh_required).
 */
export function projectPriceFreshness(
  estimate: ProjectPriceEstimate,
  asOf?: Date,
): { estimate: ProjectPriceEstimate; freshness: PriceFreshness } {
  const now = asOf ?? new Date();

  const expiresMs = toMsOrNull(estimate.expires_at);
  const asOfMs = now.getTime();

  // Fail-closed: if either date is invalid assume expired
  if (expiresMs === null || isNaN(asOfMs)) {
    return { estimate, freshness: "refresh_required" };
  }

  return {
    estimate,
    freshness: asOfMs <= expiresMs ? "current" : "refresh_required",
  };
}

// ---------------------------------------------------------------------------
// effectiveTrendWeights
// ---------------------------------------------------------------------------

const BASE_WEIGHTS: TrendWeights = {
  search: 0.35,
  news: 0.25,
  video: 0.20,
  official: 0.10,
  firstParty: 0.10,
};

/**
 * Returns the effective trend weights.  When the first-party traffic sample
 * is sufficient the five canonical weights are used.  When insufficient, the
 * 0.10 first-party weight is redistributed proportionally across the first
 * four signals so that the weights still total 1.
 */
export function effectiveTrendWeights(sampleSufficient: boolean): TrendWeights {
  if (sampleSufficient) return { ...BASE_WEIGHTS };

  // Redistribute firstParty (0.10) proportionally across the first four
  const baseFour = BASE_WEIGHTS.search + BASE_WEIGHTS.news + BASE_WEIGHTS.video + BASE_WEIGHTS.official; // 0.90
  const redistribute = BASE_WEIGHTS.firstParty; // 0.10

  return {
    search: BASE_WEIGHTS.search + (BASE_WEIGHTS.search / baseFour) * redistribute,
    news: BASE_WEIGHTS.news + (BASE_WEIGHTS.news / baseFour) * redistribute,
    video: BASE_WEIGHTS.video + (BASE_WEIGHTS.video / baseFour) * redistribute,
    official: BASE_WEIGHTS.official + (BASE_WEIGHTS.official / baseFour) * redistribute,
    firstParty: 0,
  };
}

// ---------------------------------------------------------------------------
// computeTrendComposite
// ---------------------------------------------------------------------------

/**
 * Computes the weighted composite trend score from 0–100 signals.
 * Each signal is a percentile-normalized value in [0, 100].
 */
export function computeTrendComposite(
  signals: TrendSignals,
  weights: TrendWeights,
): number {
  return (
    signals.search * weights.search +
    signals.news * weights.news +
    signals.video * weights.video +
    signals.official * weights.official +
    signals.firstParty * weights.firstParty
  );
}

// ---------------------------------------------------------------------------
// evaluateCommercialProfileCompleteness
// ---------------------------------------------------------------------------

const REQUIRED_PROFILE_FIELDS = [
  "identity",
  "manufacturer",
  "model",
  "category",
  "description",
  "officialUrls",
  "lifecycle",
  "observedDate",
  "specStates",
  "productMedia",
  "publicPriceOrEstimate",
  "trend",
  "evidence",
] as const;

const UNDISCLOSED_MARKER = "Not publicly disclosed";
const UNDISCLOSED_PERMITTED_FIELDS = new Set<(typeof REQUIRED_PROFILE_FIELDS)[number]>(["specStates"]);

/**
 * Determines whether a field value is source-backed, explicitly undisclosed
 * (where policy permits), or missing.
 */
function classifyField(value: unknown): ProfileFieldState {
  if (value == null) return "missing";

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return "missing";
    if (trimmed === UNDISCLOSED_MARKER) return "undisclosed";
    return "source-backed";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "missing";
    const states = value.map(classifyField);
    if (states.some((state) => state === "source-backed")) return "source-backed";
    if (states.some((state) => state === "undisclosed")) return "undisclosed";
    return "missing";
  }

  if (typeof value === "object") {
    const states = Object.values(value as Record<string, unknown>).map(classifyField);
    if (states.length === 0) return "missing";
    if (states.some((state) => state === "source-backed")) return "source-backed";
    if (states.some((state) => state === "undisclosed")) return "undisclosed";
    return "missing";
  }

  // Numbers, booleans, etc. — source-backed
  return "source-backed";
}

/**
 * Evaluates whether every required commercial-profile field is either
 * source-backed or explicitly undisclosed.  Returns completeness, the list
 * of missing field names, and the state of every required field.
 */
export function evaluateCommercialProfileCompleteness(
  profile: CommercialProfileFields,
): CompletenessResult {
  const fields: Record<string, ProfileFieldState> = {};
  const missing: string[] = [];

  for (const field of REQUIRED_PROFILE_FIELDS) {
    const state = classifyField((profile as Record<string, unknown>)[field]);
    fields[field] = state;
    if (state === "missing" || (state === "undisclosed" && !UNDISCLOSED_PERMITTED_FIELDS.has(field))) missing.push(field);
  }

  return {
    complete: missing.length === 0,
    missing,
    fields,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toMsOrNull(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return isNaN(ms) ? null : ms;
}