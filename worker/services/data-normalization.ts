export interface NormalizedClaim {
  claimKey: string;
  originalValue: unknown;
  normalizedValue: number;
  originalUnit: string;
  normalizedUnit: string;
  conversion: {
    registryVersion: "engineering-units/1";
    source: string;
    observedAt: string;
  };
}

interface UnitRule {
  normalizedUnit: string;
  multiplier: number;
  source: string;
}

const unitRegistry = new Map<string, UnitRule>([
  ["a", { normalizedUnit: "A", multiplier: 1, source: "SI canonical identity" }],
  ["ma", { normalizedUnit: "A", multiplier: 0.001, source: "SI exact conversion" }],
  ["v", { normalizedUnit: "V", multiplier: 1, source: "SI canonical identity" }],
  ["mv", { normalizedUnit: "V", multiplier: 0.001, source: "SI exact conversion" }],
  ["kg", { normalizedUnit: "kg", multiplier: 1, source: "SI canonical identity" }],
  ["g", { normalizedUnit: "kg", multiplier: 0.001, source: "SI exact conversion" }],
  ["mg", { normalizedUnit: "kg", multiplier: 0.000_001, source: "SI exact conversion" }],
  ["m", { normalizedUnit: "m", multiplier: 1, source: "SI canonical identity" }],
  ["cm", { normalizedUnit: "m", multiplier: 0.01, source: "SI exact conversion" }],
  ["mm", { normalizedUnit: "m", multiplier: 0.001, source: "SI exact conversion" }],
  ["n.m", { normalizedUnit: "N.m", multiplier: 1, source: "SI canonical identity" }],
  ["n·m", { normalizedUnit: "N.m", multiplier: 1, source: "SI punctuation alias" }],
  ["nm", { normalizedUnit: "N.m", multiplier: 1, source: "SI punctuation alias" }],
  ["rpm", { normalizedUnit: "rpm", multiplier: 1, source: "engineering canonical identity" }],
  ["rad/s", { normalizedUnit: "rad/s", multiplier: 1, source: "SI canonical identity" }],
  ["w", { normalizedUnit: "W", multiplier: 1, source: "SI canonical identity" }],
  ["wh", { normalizedUnit: "Wh", multiplier: 1, source: "engineering canonical identity" }],
]);

export function normalizeClaim(input: {
  claimKey: string;
  originalValue: unknown;
  numericValue: number;
  unit: string;
  observedAt: string;
}): NormalizedClaim {
  if (!Number.isFinite(input.numericValue)) throw new Error("Normalized numeric values must be finite.");
  assertIsoTimestamp(input.observedAt, "observedAt");
  const originalUnit = input.unit.trim();
  const rule = unitRegistry.get(originalUnit.toLocaleLowerCase("en-US"));
  if (!rule) throw new Error(`Unsupported unit: ${input.unit}`);
  const normalizedValue = Number((input.numericValue * rule.multiplier).toPrecision(15));
  if (!Number.isFinite(normalizedValue)) throw new Error("Normalized numeric values must be finite.");
  return {
    claimKey: input.claimKey,
    originalValue: input.originalValue,
    normalizedValue,
    originalUnit,
    normalizedUnit: rule.normalizedUnit,
    conversion: {
      registryVersion: "engineering-units/1",
      source: rule.source,
      observedAt: input.observedAt,
    },
  };
}

export function normalizeCurrencyAmount(input: {
  amountMinor: number;
  currency: string;
  observedAt: string;
  exchangeRate?: {
    targetCurrency: string;
    multiplier: number;
    source: string;
    publishedAt: string;
  };
}) {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 0) {
    throw new Error("Currency amountMinor must be a non-negative safe integer.");
  }
  assertIsoTimestamp(input.observedAt, "observedAt");
  const originalCurrency = normalizeCurrencyCode(input.currency);
  if (!input.exchangeRate) {
    return {
      originalAmountMinor: input.amountMinor,
      originalCurrency,
      normalizedAmountMinor: input.amountMinor,
      normalizedCurrency: originalCurrency,
      conversion: null,
    };
  }
  const rate = input.exchangeRate;
  if (!Number.isFinite(rate.multiplier) || rate.multiplier <= 0) {
    throw new Error("Exchange-rate multiplier must be finite and positive.");
  }
  if (!rate.source.trim()) throw new Error("Exchange-rate source is required.");
  assertIsoTimestamp(rate.publishedAt, "exchangeRate.publishedAt");
  const normalizedCurrency = normalizeCurrencyCode(rate.targetCurrency);
  const normalizedAmountMinor = Math.round(input.amountMinor * rate.multiplier);
  if (!Number.isSafeInteger(normalizedAmountMinor)) {
    throw new Error("Converted currency amount exceeds safe integer bounds.");
  }
  return {
    originalAmountMinor: input.amountMinor,
    originalCurrency,
    normalizedAmountMinor,
    normalizedCurrency,
    conversion: {
      multiplier: rate.multiplier,
      source: rate.source.trim(),
      publishedAt: rate.publishedAt,
      observedAt: input.observedAt,
    },
  };
}

export function normalizeEngineeringName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

export function normalizePartNumber(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleUpperCase("en-US");
}

export function normalizeEngineeringRevision(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

export async function canonicalFingerprint(value: unknown): Promise<string> {
  const canonical = canonicalJson(value);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function canonicalJson(value: unknown): string {
  const active = new Set<object>();
  const encode = (current: unknown): string => {
    if (current === null) return "null";
    if (typeof current === "string" || typeof current === "boolean") return JSON.stringify(current);
    if (typeof current === "number") {
      if (!Number.isFinite(current)) throw new Error("Canonical JSON numbers must be finite.");
      return JSON.stringify(current);
    }
    if (Array.isArray(current)) {
      if (active.has(current)) throw new Error("Canonical JSON cannot contain cycles.");
      active.add(current);
      try {
        return `[${current.map((item) => encode(item)).join(",")}]`;
      } finally {
        active.delete(current);
      }
    }
    if (typeof current === "object") {
      const object = current as Record<string, unknown>;
      if (active.has(object)) throw new Error("Canonical JSON cannot contain cycles.");
      active.add(object);
      try {
        return `{${Object.keys(object).sort().map((key) => {
          const item = object[key];
          if (item === undefined) throw new Error("Canonical JSON cannot contain undefined.");
          return `${JSON.stringify(key)}:${encode(item)}`;
        }).join(",")}}`;
      } finally {
        active.delete(object);
      }
    }
    throw new Error(`Canonical JSON does not support ${typeof current}.`);
  };
  return encode(value);
}

function normalizeCurrencyCode(value: string): string {
  const normalized = value.trim().toLocaleUpperCase("en-US");
  if (!/^[A-Z]{3}$/u.test(normalized)) throw new Error("Currency must be an ISO 4217 three-letter code.");
  return normalized;
}

function assertIsoTimestamp(value: string, label: string): void {
  if (!Number.isFinite(Date.parse(value)) || !/Z$/u.test(value)) {
    throw new Error(`${label} must be an ISO-8601 UTC timestamp.`);
  }
}
