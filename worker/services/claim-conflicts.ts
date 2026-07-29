import { canonicalFingerprint, canonicalJson } from "./data-normalization";

export interface ConflictClaim {
  id: string;
  claimKey: string;
  normalizedValue: unknown;
  evidenceId: string;
  withdrawnAt?: string;
  withdrawalReason?: string;
}

export interface ConflictSet {
  id: string;
  claimKey: string;
  status: "open" | "resolved";
  memberClaimIds: string[];
  preferredClaimId: string | null;
  distinctValues: Array<{
    canonicalValue: string;
    claimIds: string[];
  }>;
  resolvedAt?: string;
  resolutionNotes?: string;
}

export async function buildConflictSet(claims: ConflictClaim[]): Promise<ConflictSet | null> {
  const active = claims.filter((claim) => !claim.withdrawnAt);
  if (active.length < 2) return null;
  const keys = new Set(active.map((claim) => claim.claimKey));
  if (keys.size !== 1) throw new Error("Conflict claims must share one claimKey.");
  const grouped = new Map<string, string[]>();
  for (const claim of active) {
    const value = canonicalJson(claim.normalizedValue);
    grouped.set(value, [...(grouped.get(value) ?? []), claim.id].sort());
  }
  if (grouped.size < 2) return null;
  const claimKey = active[0]!.claimKey;
  const memberClaimIds = active.map((claim) => claim.id).sort();
  const distinctValues = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([canonicalValue, claimIds]) => ({ canonicalValue, claimIds }));
  const id = await canonicalFingerprint({ claimKey, memberClaimIds, distinctValues });
  return {
    id,
    claimKey,
    status: "open",
    memberClaimIds,
    preferredClaimId: null,
    distinctValues,
  };
}

export function resolveConflictSet(
  conflict: ConflictSet,
  preferredClaimId: string,
  resolvedAt: string,
  notes: string,
): ConflictSet {
  if (conflict.status !== "open") throw new Error("Conflict set is already resolved.");
  if (!conflict.memberClaimIds.includes(preferredClaimId)) {
    throw new Error("Preferred claim must be a conflict member.");
  }
  if (!Number.isFinite(Date.parse(resolvedAt)) || !resolvedAt.endsWith("Z")) {
    throw new Error("resolvedAt must be an ISO-8601 UTC timestamp.");
  }
  if (!notes.trim()) throw new Error("Conflict resolution notes are required.");
  return {
    ...conflict,
    status: "resolved",
    preferredClaimId,
    resolvedAt,
    resolutionNotes: notes.trim(),
  };
}

export function withdrawClaim(
  claims: ConflictClaim[],
  claimId: string,
  withdrawnAt: string,
  reason: string,
): ConflictClaim[] {
  if (!Number.isFinite(Date.parse(withdrawnAt)) || !withdrawnAt.endsWith("Z")) {
    throw new Error("withdrawnAt must be an ISO-8601 UTC timestamp.");
  }
  if (!reason.trim()) throw new Error("Claim withdrawal reason is required.");
  let found = false;
  const result = claims.map((claim) => {
    if (claim.id !== claimId) return claim;
    if (claim.withdrawnAt) throw new Error("Claim is already withdrawn.");
    found = true;
    return {
      ...claim,
      withdrawnAt,
      withdrawalReason: reason.trim(),
    };
  });
  if (!found) throw new Error("Claim to withdraw was not found.");
  return result;
}
