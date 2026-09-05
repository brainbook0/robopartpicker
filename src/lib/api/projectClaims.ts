import { api } from "./client";
import type { ProjectClaimEligibility, ProjectClaimReceipt, ProjectClaimReviewItem, ProjectClaimStatus } from "@/shared/projectClaims";

const encode = encodeURIComponent;

export const projectClaimsApi = {
  eligibility: async (projectId: string, signal?: AbortSignal) =>
    (await api.get<{ item: ProjectClaimEligibility }>(`/api/v1/projects/${encode(projectId)}/claim-eligibility`, { signal })).item,
  mine: async (projectId?: string, signal?: AbortSignal) =>
    (await api.get<{ items: ProjectClaimReceipt[] }>(`/api/v1/project-claims/mine${projectId ? `?projectId=${encode(projectId)}` : ""}`, { signal })).items,
  submit: async (projectId: string, input: { evidenceFileId: string; evidenceReference?: string }) =>
    (await api.post<{ item: ProjectClaimReceipt }>(`/api/v1/projects/${encode(projectId)}/claims`, input)).item,
  withdraw: async (claimId: string) =>
    (await api.post<{ item: ProjectClaimReceipt }>(`/api/v1/project-claims/${encode(claimId)}/withdraw`)).item,
  reviewQueue: async (status: ProjectClaimStatus, signal?: AbortSignal) =>
    (await api.get<{ items: ProjectClaimReviewItem[] }>(`/api/v1/admin/project-claims?status=${encode(status)}`, { signal })).items,
  review: async (claimId: string, input: { action: "approve" | "reject"; privateModeratorNotes: string }) =>
    (await api.patch<{ item: ProjectClaimReceipt }>(`/api/v1/admin/project-claims/${encode(claimId)}`, input)).item,
};
