import { normalizeEngineeringName, normalizePartNumber } from "./data-normalization";

export interface CanonicalIdentity {
  id: string;
  entityType: string;
  validatedEntityType: string;
  exists: boolean;
  name: string;
  manufacturerName?: string | null;
  manufacturerPartNumber?: string | null;
  category?: string | null;
}

export interface IdentityCandidate {
  canonicalEntityId: string;
  canonicalEntityType: string;
  deterministicScore: number;
  matchMethod: string;
  evidence: {
    existenceValidated: true;
    entityTypeValidated: true;
    fields: string[];
  };
  aiSignal: {
    score: number;
    model: string;
  } | null;
}

export interface IdentityResolution {
  state: "candidate_found" | "ambiguous" | "unresolved";
  canonicalEntityId: null;
  promotionAllowed: false;
  candidates: IdentityCandidate[];
  rejections: Array<{
    canonicalEntityId: string;
    reason: "canonical_entity_not_found" | "wrong_canonical_entity_type";
  }>;
}

export function buildComponentRelationship(input: {
  relationship: "alternative" | "substitution";
  original: CanonicalIdentity;
  replacement: CanonicalIdentity;
  reason: string;
  evidenceIds: string[];
  adaptations: {
    mechanical: string | null;
    electrical: string | null;
    software: string | null;
  };
  reportedOutcome: {
    successful: boolean;
    evidenceId: string;
    verificationState: "reported" | "measured";
  } | null;
}) {
  for (const [label, entity] of [["original", input.original], ["replacement", input.replacement]] as const) {
    if (!entity.exists) throw new Error(`${label} component was not found.`);
    if (entity.entityType !== "component" || entity.validatedEntityType !== "component") {
      throw new Error(`${label} relationship entity must be a validated component.`);
    }
  }
  if (input.original.id === input.replacement.id) {
    throw new Error("A component cannot be its own alternative or substitution.");
  }
  if (!input.reason.trim()) throw new Error("Component relationship reason is required.");
  const evidenceIds = [...new Set(input.evidenceIds.filter((id) => id.trim()).map((id) => id.trim()))].sort();
  if (evidenceIds.length === 0) throw new Error("Component relationship evidence is required.");
  if (input.reportedOutcome && !input.reportedOutcome.evidenceId.trim()) {
    throw new Error("Reported substitution outcome evidence is required.");
  }
  return {
    relationship: input.relationship,
    originalComponentId: input.original.id,
    replacementComponentId: input.replacement.id,
    reason: input.reason.trim(),
    evidenceIds,
    adaptations: { ...input.adaptations },
    verificationState: input.reportedOutcome?.verificationState ?? "unverified",
    successful: input.reportedOutcome?.successful ?? null,
  };
}

export async function createIdentityCandidates(input: {
  recordType: string;
  name: string;
  manufacturerName?: string | null;
  manufacturerPartNumber?: string | null;
  category?: string | null;
  canonical: CanonicalIdentity[];
  aiSignals?: Array<{ canonicalEntityId: string; score: number; model: string }>;
}): Promise<IdentityResolution> {
  const rejections: IdentityResolution["rejections"] = [];
  const aiSignals = new Map(
    (input.aiSignals ?? []).map((signal) => [
      signal.canonicalEntityId,
      Number.isFinite(signal.score) && signal.score >= 0 && signal.score <= 1
        ? { score: signal.score, model: signal.model }
        : null,
    ]),
  );
  const candidates: IdentityCandidate[] = [];
  for (const entity of input.canonical) {
    if (!entity.exists) {
      rejections.push({ canonicalEntityId: entity.id, reason: "canonical_entity_not_found" });
      continue;
    }
    if (entity.entityType !== input.recordType || entity.validatedEntityType !== input.recordType) {
      rejections.push({ canonicalEntityId: entity.id, reason: "wrong_canonical_entity_type" });
      continue;
    }
    const score = deterministicIdentityScore(input, entity);
    if (score === null || score.deterministicScore < 0.5) continue;
    candidates.push({
      canonicalEntityId: entity.id,
      canonicalEntityType: entity.entityType,
      ...score,
      evidence: {
        existenceValidated: true,
        entityTypeValidated: true,
        fields: score.fields,
      },
      aiSignal: aiSignals.get(entity.id) ?? null,
    });
  }
  candidates.sort((left, right) =>
    right.deterministicScore - left.deterministicScore
    || left.canonicalEntityId.localeCompare(right.canonicalEntityId),
  );
  const top = candidates[0];
  const second = candidates[1];
  const state = !top
    ? "unresolved"
    : second && Math.abs(top.deterministicScore - second.deterministicScore) < 0.01
      ? "ambiguous"
      : "candidate_found";
  return {
    state,
    canonicalEntityId: null,
    promotionAllowed: false,
    candidates,
    rejections,
  };
}

function deterministicIdentityScore(
  input: {
    name: string;
    manufacturerName?: string | null;
    manufacturerPartNumber?: string | null;
    category?: string | null;
  },
  entity: CanonicalIdentity,
): {
  deterministicScore: number;
  matchMethod: string;
  fields: string[];
} | null {
  const inputMpn = input.manufacturerPartNumber ? normalizePartNumber(input.manufacturerPartNumber) : null;
  const entityMpn = entity.manufacturerPartNumber ? normalizePartNumber(entity.manufacturerPartNumber) : null;
  const inputManufacturer = input.manufacturerName ? normalizeEngineeringName(input.manufacturerName) : null;
  const entityManufacturer = entity.manufacturerName ? normalizeEngineeringName(entity.manufacturerName) : null;
  if (inputMpn && entityMpn && inputMpn === entityMpn) {
    if (inputManufacturer && entityManufacturer && inputManufacturer === entityManufacturer) {
      return {
        deterministicScore: 1,
        matchMethod: "manufacturer_part_number_and_manufacturer_exact",
        fields: ["manufacturerPartNumber", "manufacturerName"],
      };
    }
    return {
      deterministicScore: 0.97,
      matchMethod: "manufacturer_part_number_exact",
      fields: ["manufacturerPartNumber"],
    };
  }

  const inputName = normalizeEngineeringName(input.name);
  const entityName = normalizeEngineeringName(entity.name);
  const categoryExact = Boolean(
    input.category
    && entity.category
    && normalizeEngineeringName(input.category) === normalizeEngineeringName(entity.category),
  );
  if (inputName === entityName) {
    return {
      deterministicScore: categoryExact ? 0.9 : 0.85,
      matchMethod: categoryExact ? "normalized_name_and_category_exact" : "normalized_name_exact",
      fields: categoryExact ? ["normalizedName", "category"] : ["normalizedName"],
    };
  }
  const similarity = tokenJaccard(inputName, entityName);
  if (similarity <= 0) return null;
  return {
    deterministicScore: Math.min(0.8, similarity * 0.75 + (categoryExact ? 0.05 : 0)),
    matchMethod: categoryExact ? "name_token_similarity_and_category" : "name_token_similarity",
    fields: categoryExact ? ["normalizedNameTokens", "category"] : ["normalizedNameTokens"],
  };
}

function tokenJaccard(left: string, right: string): number {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}
