import { bomStateForProject, validateSourceAccounting, type BomPublicationState, type SourceObjectOutcome } from "@/shared/bomPublication";
import type { ExplicitBomCandidate, ExplicitBomParseResult } from "./bom-source-adapters";

export type BomCompilerArtifact = {
  path: string;
  checksumSha256?: string;
  sourceUrl?: string;
  sourceRevision?: string;
  parse: ExplicitBomParseResult;
};

export type CompiledBomLine = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  manufacturer?: string;
  mpn?: string;
  optional: boolean;
  lineClassification: "purchased" | "optional";
  completeness: "verified" | "unresolved";
  componentMatchStatus: "exact_candidate" | "unresolved";
  evidenceLocator: string;
  aggregatedLocators: string[];
  rawFields: Record<string, unknown>[];
};

export type CompiledProjectBom = {
  schemaVersion: "bom-compiler/1";
  compilerVersion: "bom-compiler/1";
  policyVersion: "bom-publication/1";
  projectId: string;
  sourceRevision: string | null;
  sourceFingerprint: string;
  publicationState: BomPublicationState;
  lines: CompiledBomLine[];
  omissions: Array<{ sourceObjectId: string; reason: string }>;
  accounting: { ok: boolean; errors: string[]; objectsSeen: number; outcomesRecorded: number };
  outcomes: SourceObjectOutcome[];
  artifacts: BomCompilerArtifact[];
};

export async function compileProjectBom(input: {
  projectId: string;
  projectKind: "physical_design" | "robotics_software" | "commercial_showcase" | "unknown";
  commercial: boolean;
  sourceRevision?: string | null;
  sourceInventoryComplete?: boolean;
  artifacts: BomCompilerArtifact[];
}): Promise<CompiledProjectBom> {
  const artifacts = [...input.artifacts].sort((left, right) => left.path.localeCompare(right.path, "en-US"));
  const explicitArtifacts = artifacts.filter((artifact) => artifact.parse.publishCapable);
  const sourceObjectIds = artifacts.flatMap((artifact) => artifact.parse.sourceObjectIds);
  const outcomes = artifacts.flatMap((artifact) => artifact.parse.outcomes.map((outcome) => ({ ...outcome })));
  const candidates = artifacts.flatMap((artifact) => artifact.parse.candidates);
  const lines = aggregateCandidates(candidates, outcomes);
  const accountingBase = validateSourceAccounting(sourceObjectIds, outcomes);
  const omissions = outcomes
    .filter((outcome) => outcome.outcome === "rejected" || outcome.outcome === "unsupported")
    .map((outcome) => ({ sourceObjectId: outcome.sourceObjectId, reason: outcome.reason ?? "unspecified" }));
  const sourceInventoryComplete = input.sourceInventoryComplete !== false;
  const explicitBomFound = explicitArtifacts.length > 0;
  let publicationState = bomStateForProject({
    projectKind: input.projectKind,
    commercial: input.commercial,
    explicitBomFound,
    accountingValid: accountingBase.ok && sourceInventoryComplete,
    sourceComplete: explicitBomFound && lines.length > 0 && omissions.length === 0,
  });
  if (explicitBomFound && lines.length === 0) publicationState = "rejected";
  if (explicitBomFound && lines.length > 0 && (!sourceInventoryComplete || omissions.length > 0)) publicationState = "partial";

  const sourceFingerprint = await sha256(canonicalJson({
    projectId: input.projectId,
    sourceRevision: input.sourceRevision ?? null,
    compilerVersion: "bom-compiler/1",
    policyVersion: "bom-publication/1",
    artifacts: artifacts.map((artifact) => ({
      path: artifact.path,
      checksumSha256: artifact.checksumSha256 ?? null,
      sourceRevision: artifact.sourceRevision ?? null,
      adapterId: artifact.parse.adapterId,
      sourceObjectIds: artifact.parse.sourceObjectIds,
      candidates: artifact.parse.candidates,
      outcomes: artifact.parse.outcomes,
    })),
  }));

  return {
    schemaVersion: "bom-compiler/1",
    compilerVersion: "bom-compiler/1",
    policyVersion: "bom-publication/1",
    projectId: input.projectId,
    sourceRevision: input.sourceRevision ?? null,
    sourceFingerprint,
    publicationState,
    lines,
    omissions,
    accounting: {
      ...accountingBase,
      objectsSeen: sourceObjectIds.length,
      outcomesRecorded: outcomes.length,
    },
    outcomes,
    artifacts,
  };
}

function aggregateCandidates(candidates: ExplicitBomCandidate[], outcomes: SourceObjectOutcome[]): CompiledBomLine[] {
  const groups = new Map<string, { primary: ExplicitBomCandidate; entries: ExplicitBomCandidate[] }>();
  const ordered: Array<{ primary: ExplicitBomCandidate; entries: ExplicitBomCandidate[] }> = [];
  for (const candidate of candidates) {
    const manufacturer = normalizeIdentity(candidate.manufacturer);
    const mpn = normalizeIdentity(candidate.mpn);
    const exactKey = manufacturer && mpn
      ? `${manufacturer}\u0000${mpn}\u0000${normalizeIdentity(candidate.unit)}\u0000${candidate.optional ? "optional" : "required"}`
      : null;
    if (!exactKey) {
      ordered.push({ primary: candidate, entries: [candidate] });
      continue;
    }
    const existing = groups.get(exactKey);
    if (existing) {
      existing.entries.push(candidate);
      const outcome = outcomes.find((item) => item.sourceObjectId === candidate.sourceObjectId);
      if (outcome) {
        outcome.outcome = "aggregated";
        outcome.aggregateTargetId = existing.primary.sourceObjectId;
      }
    } else {
      const group = { primary: candidate, entries: [candidate] };
      groups.set(exactKey, group);
      ordered.push(group);
    }
  }

  return ordered.map((group, index) => {
    const exact = Boolean(group.primary.manufacturer && group.primary.mpn);
    return {
      id: `compiled-line-${index + 1}`,
      description: group.primary.name,
      quantity: group.entries.reduce((total, candidate) => total + candidate.quantity, 0),
      unit: group.primary.unit,
      manufacturer: group.primary.manufacturer,
      mpn: group.primary.mpn,
      optional: group.primary.optional,
      lineClassification: group.primary.optional ? "optional" : "purchased",
      completeness: exact ? "verified" : "unresolved",
      componentMatchStatus: exact ? "exact_candidate" : "unresolved",
      evidenceLocator: group.primary.sourceLocator,
      aggregatedLocators: group.entries.map((candidate) => candidate.sourceLocator),
      rawFields: group.entries.map((candidate) => candidate.rawFields),
    };
  });
}

function normalizeIdentity(value: string | undefined): string {
  return value?.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/[\s_-]+/gu, "") ?? "";
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
