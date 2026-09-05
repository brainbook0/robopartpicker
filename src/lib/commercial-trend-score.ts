import {
  computeTrendComposite,
  effectiveTrendWeights,
  type TrendSignals,
  type TrendWeights,
} from "../shared/projectProfiles";

export const COMMERCIAL_TREND_SIGNALS = [
  "searchInterest",
  "newsVelocity",
  "videoViewVelocity",
  "officialActivity",
  "firstPartyTraffic",
] as const;

export type CommercialTrendSignal = (typeof COMMERCIAL_TREND_SIGNALS)[number];
export type CommercialTrendSourceStatus = "ok" | "missing" | "blocked";

export type CommercialTrendCandidate = {
  slug: string;
  name: string;
  aliases: string[];
};

export type CommercialTrendSourceRecord = {
  candidateKey: string;
  signal: CommercialTrendSignal;
  value: number | null;
  status: CommercialTrendSourceStatus;
  collectedAt: string;
  sourceUrl: string;
};

export type CommercialTrendSnapshotOptions = {
  methodologyVersion: string;
  windowStart: string;
  windowEnd: string;
  capturedAt: string;
  firstPartyTrafficSampleSufficient: boolean;
  limit: number;
};

export type RankedCommercialTrendRecord = {
  slug: string;
  name: string;
  rank: number;
  compositeScore: number;
  searchInterest: number;
  newsVelocity: number;
  videoViewVelocity: number;
  officialActivity: number;
  firstPartyTraffic: number | null;
  trafficSampleSufficient: boolean;
  rawSignals: Record<CommercialTrendSignal, number | null>;
  sourceRecords: CommercialTrendSourceRecord[];
};

export type ExcludedCommercialTrendCandidate = {
  slug: string;
  reasons: string[];
};

export type CommercialTrendSnapshot = {
  methodologyVersion: string;
  windowStart: string;
  windowEnd: string;
  capturedAt: string;
  weights: TrendWeights;
  records: RankedCommercialTrendRecord[];
  excluded: ExcludedCommercialTrendCandidate[];
};

export class CommercialTrendValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(`Invalid commercial trend inputs: ${errors.join("; ")}`);
    this.name = "CommercialTrendValidationError";
    this.errors = errors;
  }
}

const REQUIRED_PUBLIC_SIGNALS: CommercialTrendSignal[] = [
  "searchInterest",
  "newsVelocity",
  "videoViewVelocity",
  "officialActivity",
];
const RFC3339_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function normalizedKey(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function isRfc3339(value: unknown): value is string {
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
  return calendar.getUTCFullYear() === year
    && calendar.getUTCMonth() === month - 1
    && calendar.getUTCDate() === day
    && Number.isFinite(Date.parse(value));
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value || !value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

function finiteNonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function candidateIdentityMap(candidates: readonly CommercialTrendCandidate[], errors: string[]): Map<string, string> {
  const identities = new Map<string, string>();
  const slugs = new Set<string>();
  for (let index = 0; index < candidates.length; index++) {
    const value = candidates[index] as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`candidates[${index}] must be an object`);
      continue;
    }
    const candidate = value as Record<string, unknown>;
    const slug = typeof candidate.slug === "string" ? candidate.slug : "";
    if (!SLUG_RE.test(slug)) errors.push(`candidates[${index}].slug must be lowercase kebab-case`);
    else if (slugs.has(slug)) errors.push(`duplicate candidate slug "${slug}"`);
    else slugs.add(slug);
    if (!nonEmptyString(candidate.name)) errors.push(`candidates[${index}].name is required`);
    if (!Array.isArray(candidate.aliases)) {
      errors.push(`candidates[${index}].aliases must be an array`);
      continue;
    }
    const localAliases = new Set<string>();
    for (const identity of [slug, ...candidate.aliases]) {
      if (typeof identity !== "string" || !identity.trim()) {
        errors.push(`candidates[${index}] contains a blank alias`);
        continue;
      }
      const normalized = normalizedKey(identity);
      if (identity !== slug && localAliases.has(normalized)) errors.push(`candidates[${index}] contains duplicate alias "${identity.trim()}"`);
      if (identity !== slug) localAliases.add(normalized);
      const owner = identities.get(normalized);
      if (owner && owner !== slug) errors.push(`candidate identity "${identity.trim()}" collides between ${owner} and ${slug}`);
      else if (slug) identities.set(normalized, slug);
    }
  }
  return identities;
}

export function validateCommercialTrendInputs(
  candidates: readonly CommercialTrendCandidate[],
  sourceRecords: readonly CommercialTrendSourceRecord[],
  options: CommercialTrendSnapshotOptions,
): string[] {
  const errors: string[] = [];
  if (!Array.isArray(candidates) || candidates.length === 0) errors.push("candidates must be a non-empty array");
  if (!Array.isArray(sourceRecords)) errors.push("sourceRecords must be an array");
  if (!nonEmptyString(options.methodologyVersion)) errors.push("methodologyVersion is required");
  if (!isRfc3339(options.windowStart)) errors.push("windowStart must be RFC3339");
  if (!isRfc3339(options.windowEnd)) errors.push("windowEnd must be RFC3339");
  if (isRfc3339(options.windowStart) && isRfc3339(options.windowEnd) && Date.parse(options.windowStart) >= Date.parse(options.windowEnd)) errors.push("windowStart must precede windowEnd");
  if (!isRfc3339(options.capturedAt)) errors.push("capturedAt must be RFC3339");
  if (isRfc3339(options.capturedAt) && isRfc3339(options.windowEnd) && Date.parse(options.capturedAt) < Date.parse(options.windowEnd)) errors.push("capturedAt must be at or after windowEnd");
  if (typeof options.firstPartyTrafficSampleSufficient !== "boolean") errors.push("firstPartyTrafficSampleSufficient must be boolean");
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 300) errors.push("limit must be an integer from 1 through 300");

  const identities = candidateIdentityMap(candidates, errors);
  const seen = new Set<string>();
  for (let index = 0; index < sourceRecords.length; index++) {
    const value = sourceRecords[index] as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`sourceRecords[${index}] must be an object`);
      continue;
    }
    const record = value as Record<string, unknown>;
    const candidateKey = typeof record.candidateKey === "string" ? record.candidateKey : "";
    const slug = candidateKey ? identities.get(normalizedKey(candidateKey)) : undefined;
    if (!slug) errors.push(`sourceRecords[${index}] references unknown candidate "${String(record.candidateKey)}"`);
    const signalValid = COMMERCIAL_TREND_SIGNALS.includes(record.signal as CommercialTrendSignal);
    if (!signalValid) errors.push(`sourceRecords[${index}].signal is unsupported`);
    const statusValid = (["ok", "missing", "blocked"] as unknown[]).includes(record.status);
    if (!statusValid) errors.push(`sourceRecords[${index}].status is unsupported`);
    if (!isRfc3339(record.collectedAt)) errors.push(`sourceRecords[${index}].collectedAt must be RFC3339`);
    else if (isRfc3339(options.capturedAt) && Date.parse(record.collectedAt) > Date.parse(options.capturedAt)) errors.push(`sourceRecords[${index}].collectedAt is after capturedAt`);
    if (!isHttpUrl(record.sourceUrl)) errors.push(`sourceRecords[${index}].sourceUrl must be HTTP(S)`);
    if (record.status === "ok" && !finiteNonnegative(record.value)) errors.push(`sourceRecords[${index}].value must be a finite nonnegative number when status is ok`);
    if ((record.status === "missing" || record.status === "blocked") && record.value !== null) errors.push(`sourceRecords[${index}].value must be null when status is ${String(record.status)}`);
    if (slug && signalValid) {
      const signal = record.signal as CommercialTrendSignal;
      const key = `${slug}:${signal}`;
      if (seen.has(key)) errors.push(`duplicate source record for ${slug} ${signal}`);
      seen.add(key);
    }
  }
  return errors;
}

export function percentileScores(values: ReadonlyMap<string, number>): Map<string, number> {
  if (values.size === 0) return new Map();
  if (values.size === 1) return new Map([[values.keys().next().value as string, 100]]);
  const ordered = [...values.entries()].sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]));
  const scores = new Map<string, number>();
  for (let start = 0; start < ordered.length;) {
    let end = start;
    while (end + 1 < ordered.length && ordered[end + 1][1] === ordered[start][1]) end++;
    const averageIndex = (start + end) / 2;
    const percentile = (averageIndex / (ordered.length - 1)) * 100;
    for (let index = start; index <= end; index++) scores.set(ordered[index][0], percentile);
    start = end + 1;
  }
  return scores;
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

export function buildCommercialTrendSnapshot(
  candidates: readonly CommercialTrendCandidate[],
  sourceRecords: readonly CommercialTrendSourceRecord[],
  options: CommercialTrendSnapshotOptions,
): CommercialTrendSnapshot {
  const errors = validateCommercialTrendInputs(candidates, sourceRecords, options);
  if (errors.length > 0) throw new CommercialTrendValidationError(errors);

  const identities = candidateIdentityMap(candidates, []);
  const recordsByCandidate = new Map<string, Map<CommercialTrendSignal, CommercialTrendSourceRecord>>();
  for (const record of sourceRecords) {
    const slug = identities.get(normalizedKey(record.candidateKey));
    if (!slug) continue;
    const bySignal = recordsByCandidate.get(slug) ?? new Map<CommercialTrendSignal, CommercialTrendSourceRecord>();
    bySignal.set(record.signal, record);
    recordsByCandidate.set(slug, bySignal);
  }

  const excluded: ExcludedCommercialTrendCandidate[] = [];
  const eligible: CommercialTrendCandidate[] = [];
  for (const candidate of candidates) {
    const bySignal = recordsByCandidate.get(candidate.slug);
    const required = options.firstPartyTrafficSampleSufficient
      ? [...REQUIRED_PUBLIC_SIGNALS, "firstPartyTraffic" as const]
      : REQUIRED_PUBLIC_SIGNALS;
    const reasons = required.flatMap((signal) => {
      const source = bySignal?.get(signal);
      return source?.status === "ok" ? [] : [`${signal}: ${source?.status ?? "missing"}`];
    });
    if (reasons.length > 0) excluded.push({ slug: candidate.slug, reasons });
    else eligible.push(candidate);
  }

  const percentileBySignal = new Map<CommercialTrendSignal, Map<string, number>>();
  for (const signal of COMMERCIAL_TREND_SIGNALS) {
    if (signal === "firstPartyTraffic" && !options.firstPartyTrafficSampleSufficient) {
      percentileBySignal.set(signal, new Map());
      continue;
    }
    percentileBySignal.set(signal, percentileScores(new Map(eligible.map((candidate) => [
      candidate.slug,
      recordsByCandidate.get(candidate.slug)?.get(signal)?.value as number,
    ]))));
  }

  const weights = effectiveTrendWeights(options.firstPartyTrafficSampleSufficient);
  const ranked = eligible.map((candidate): RankedCommercialTrendRecord => {
    const sourceMap = recordsByCandidate.get(candidate.slug) as Map<CommercialTrendSignal, CommercialTrendSourceRecord>;
    const searchInterest = percentileBySignal.get("searchInterest")?.get(candidate.slug) as number;
    const newsVelocity = percentileBySignal.get("newsVelocity")?.get(candidate.slug) as number;
    const videoViewVelocity = percentileBySignal.get("videoViewVelocity")?.get(candidate.slug) as number;
    const officialActivity = percentileBySignal.get("officialActivity")?.get(candidate.slug) as number;
    const firstPartyTraffic = options.firstPartyTrafficSampleSufficient
      ? percentileBySignal.get("firstPartyTraffic")?.get(candidate.slug) as number
      : null;
    const signals: TrendSignals = {
      search: searchInterest,
      news: newsVelocity,
      video: videoViewVelocity,
      official: officialActivity,
      firstParty: firstPartyTraffic ?? 0,
    };
    return {
      slug: candidate.slug,
      name: candidate.name,
      rank: 0,
      compositeScore: rounded(computeTrendComposite(signals, weights)),
      searchInterest: rounded(searchInterest),
      newsVelocity: rounded(newsVelocity),
      videoViewVelocity: rounded(videoViewVelocity),
      officialActivity: rounded(officialActivity),
      firstPartyTraffic: firstPartyTraffic === null ? null : rounded(firstPartyTraffic),
      trafficSampleSufficient: options.firstPartyTrafficSampleSufficient,
      rawSignals: Object.fromEntries(COMMERCIAL_TREND_SIGNALS.map((signal) => [signal, sourceMap.get(signal)?.value ?? null])) as Record<CommercialTrendSignal, number | null>,
      sourceRecords: [...sourceMap.values()].sort((left, right) => left.signal.localeCompare(right.signal)),
    };
  }).sort((left, right) =>
    right.compositeScore - left.compositeScore
    || right.searchInterest - left.searchInterest
    || right.newsVelocity - left.newsVelocity
    || right.videoViewVelocity - left.videoViewVelocity
    || right.officialActivity - left.officialActivity
    || (right.firstPartyTraffic ?? -1) - (left.firstPartyTraffic ?? -1)
    || left.slug.localeCompare(right.slug)
  );

  const records = ranked.slice(0, options.limit).map((record, index) => ({ ...record, rank: index + 1 }));
  for (const record of ranked.slice(options.limit)) excluded.push({ slug: record.slug, reasons: ["below ranked snapshot cutoff"] });

  return {
    methodologyVersion: options.methodologyVersion,
    windowStart: options.windowStart,
    windowEnd: options.windowEnd,
    capturedAt: options.capturedAt,
    weights,
    records,
    excluded: excluded.sort((left, right) => left.slug.localeCompare(right.slug)),
  };
}
