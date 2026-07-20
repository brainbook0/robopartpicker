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
