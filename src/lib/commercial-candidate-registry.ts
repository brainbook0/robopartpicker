import {
  validateCommercialCandidates,
  type CommercialCandidate,
} from "./commercial-catalog";

export type CommercialCandidateBatchInput = {
  name: string;
  value?: unknown;
  error?: string;
};

export type CommercialCandidateBatchValidation = {
  files: string[];
  candidateCount: number;
  manufacturerCount: number;
  categoryCounts: Record<string, number>;
  errors: string[];
  candidates: CommercialCandidate[];
};

export function validateCommercialCandidateBatches(
  inputs: readonly CommercialCandidateBatchInput[],
  minimumCandidates = 400,
): CommercialCandidateBatchValidation {
  const batches = [...inputs].sort((left, right) => left.name.localeCompare(right.name));
  const errors: string[] = [];
  const candidates: unknown[] = [];

  if (!Number.isSafeInteger(minimumCandidates) || minimumCandidates < 1) {
    errors.push("minimumCandidates must be a positive integer");
  }
  if (batches.length === 0) errors.push("candidate registry contains no JSON batch files");

  for (const batch of batches) {
    if (batch.error) {
      errors.push(`${batch.name} cannot be parsed as JSON: ${batch.error}`);
      continue;
    }
    if (!Array.isArray(batch.value)) {
      errors.push(`${batch.name} must contain a JSON array`);
      continue;
    }
    if (batch.value.length === 0) errors.push(`${batch.name} must not be empty`);
    candidates.push(...batch.value);
  }

  errors.push(...validateCommercialCandidates(candidates));
  if (Number.isSafeInteger(minimumCandidates) && minimumCandidates > 0 && candidates.length < minimumCandidates) {
    errors.push(`candidate registry must contain at least ${minimumCandidates} records; found ${candidates.length}`);
  }

  const manufacturers = new Set<string>();
  const categoryCounts: Record<string, number> = {};
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const record = candidate as Record<string, unknown>;
    if (typeof record.manufacturer === "string" && record.manufacturer.trim()) {
      manufacturers.add(record.manufacturer.trim());
    }
    if (typeof record.category === "string" && record.category.trim()) {
      categoryCounts[record.category] = (categoryCounts[record.category] ?? 0) + 1;
    }
  }

  return {
    files: batches.map((batch) => batch.name),
    candidateCount: candidates.length,
    manufacturerCount: manufacturers.size,
    categoryCounts: Object.fromEntries(Object.entries(categoryCounts).sort(([left], [right]) => left.localeCompare(right))),
    errors,
    candidates: errors.length === 0 ? candidates as CommercialCandidate[] : [],
  };
}
