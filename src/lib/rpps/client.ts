import { api } from "@/lib/api/client";
import type { PortableRppsManifest, PortableRppsLock, RppsValidationReport } from "./portable";

export type PortableRppsValidation = {
  manifest: PortableRppsManifest;
  normalizedManifest: string;
  lockfile?: PortableRppsLock;
  report: RppsValidationReport;
};

export type PortableRppsRelease = {
  id: string;
  projectId: string;
  stableReleaseId: string;
  version: string;
  schemaVersion: string;
  manifest: string;
  lockfile: string | null;
  manifestSha256: string;
  packageSha256: string;
  report: RppsValidationReport;
  status: "draft" | "published" | "superseded" | "withdrawn";
  createdAt: string;
  publishedAt: string | null;
};
export type PortableRppsReleaseSummary = Omit<PortableRppsRelease, "manifest" | "lockfile"> & { hasLockfile: boolean };

export type RppsProposalType = "substitute_component" | "correct_component_identity" | "add_assembly_step" |
  "change_configuration" | "add_compatibility_condition" | "attach_test_evidence" | "introduce_variant" |
  "withdraw_claim" | "backport_fix";
export type RppsChangeProposal = {
  id: string;
  type: RppsProposalType;
  status: "open" | "accepted" | "rejected" | "withdrawn";
  payload: Record<string, unknown> & { type: RppsProposalType };
  createdByUserId: string;
  reviewedByUserId: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
};
export type RppsReleaseCollaboration = {
  release: { id: string; version: string; packageSha256: string };
  evidence: { achieved: Array<"structured" | "tested" | "reproduced" | "repeated">; current: false; succeededMaintainer: number; succeededIndependent: number };
  outcomes: Array<{ id: string; outcome: "succeeded" | "partially_succeeded" | "failed" | "abandoned"; independence: "maintainer" | "independent"; conditions: Record<string, string | number | boolean | null>; summary: string; submittedAt: string; buildId: string | null; evidenceCount: number }>;
  proposals: RppsChangeProposal[];
  eligibleBuilds: Array<{ id: string; slug: string; name: string; status: string }>;
  canManage: boolean;
};
export type RppsSemanticDiff = {
  from: { id: string; version: string; packageSha256: string };
  to: { id: string; version: string; packageSha256: string };
  collections: Record<string, { added: string[]; removed: string[]; changed: Array<{ id: string; fields: string[] }> }>;
};

export function validatePortablePackage(manifest: string, lockfile?: string): Promise<PortableRppsValidation> {
  return api.post<PortableRppsValidation>("/api/v1/rpps/validate", { manifest, lockfile: lockfile?.trim() || undefined });
}

export async function createPortableRelease(projectId: string, input: { manifest: string; lockfile?: string; status: "draft" | "published" }): Promise<PortableRppsRelease> {
  return (await api.post<{ item: PortableRppsRelease }>(`/api/v1/projects/${encodeURIComponent(projectId)}/releases`, {
    ...input,
    lockfile: input.lockfile?.trim() || undefined,
  })).item;
}

export async function listPortableReleases(projectId: string): Promise<PortableRppsReleaseSummary[]> {
  return (await api.get<{ items: PortableRppsReleaseSummary[] }>(`/api/v1/projects/${encodeURIComponent(projectId)}/releases`)).items;
}

export async function getPortableRelease(projectId: string, releaseId: string): Promise<PortableRppsRelease> {
  return (await api.get<{ item: PortableRppsRelease }>(`/api/v1/projects/${encodeURIComponent(projectId)}/releases/${encodeURIComponent(releaseId)}`)).item;
}

export async function publishPortableRelease(projectId: string, releaseId: string): Promise<PortableRppsRelease> {
  return (await api.post<{ item: PortableRppsRelease }>(`/api/v1/projects/${encodeURIComponent(projectId)}/releases/${encodeURIComponent(releaseId)}/publish`)).item;
}

export async function createReleaseBuildPassport(projectId: string, releaseId: string, input: {
  name?: string; organizationId?: string | null; visibility?: "private" | "organization" | "unlisted" | "public";
} = {}): Promise<{ item: { id: string; slug: string; name: string }; passport: { releaseId: string; stableReleaseId: string; version: string; packageSha256: string } }> {
  return api.post(`/api/v1/projects/${encodeURIComponent(projectId)}/releases/${encodeURIComponent(releaseId)}/build-passports`, input);
}

export async function getReleaseCollaboration(projectId: string, releaseId: string): Promise<RppsReleaseCollaboration> {
  return api.get(`/api/v1/projects/${encodeURIComponent(projectId)}/releases/${encodeURIComponent(releaseId)}/collaboration`);
}

export async function submitReleaseOutcome(projectId: string, releaseId: string, input: {
  buildId: string;
  outcome: "succeeded" | "partially_succeeded" | "failed" | "abandoned";
  summary: string;
  conditions?: Record<string, string | number | boolean | null>;
  evidenceFileIds?: string[];
}): Promise<void> {
  await api.post(`/api/v1/projects/${encodeURIComponent(projectId)}/releases/${encodeURIComponent(releaseId)}/outcomes`, input);
}

export async function createReleaseProposal(projectId: string, releaseId: string, payload: Record<string, unknown> & { type: RppsProposalType }): Promise<RppsChangeProposal> {
  return (await api.post<{ item: RppsChangeProposal }>(`/api/v1/projects/${encodeURIComponent(projectId)}/releases/${encodeURIComponent(releaseId)}/proposals`, payload)).item;
}

export async function reviewReleaseProposal(projectId: string, releaseId: string, proposalId: string, action: "accept" | "reject" | "withdraw", note?: string): Promise<void> {
  await api.patch(`/api/v1/projects/${encodeURIComponent(projectId)}/releases/${encodeURIComponent(releaseId)}/proposals/${encodeURIComponent(proposalId)}`, { action, note: note?.trim() || undefined });
}

export async function getReleaseDiff(projectId: string, releaseId: string, againstReleaseId: string): Promise<RppsSemanticDiff> {
  return api.get(`/api/v1/projects/${encodeURIComponent(projectId)}/releases/${encodeURIComponent(releaseId)}/diff?against=${encodeURIComponent(againstReleaseId)}`);
}
