import { api } from "@/lib/api/client";

export type ExperienceBadge = { badgeType: "owner" | "operator" | "manufacturer_representative"; verifiedAt: string; displayName?: string };
export type ProjectReviewInput = { overallRating: number; reliabilityRating: number | null; usabilityRating: number | null; valueRating: number | null; supportRating: number | null; relationship: "owner" | "operator" | "evaluator" | "observer"; title: string; body: string };
export type ProjectReview = ProjectReviewInput & { id: string; projectId: string; authorName: string; experienceBadges: ExperienceBadge[]; moderationStatus: "published" | "under_review" | "removed"; version: number; editCount: number; createdAt: string; updatedAt: string; editedAt: string | null };
export type ProjectReviewAggregate = { count: number; overallAverage: number | null; reliabilityAverage: number | null; usabilityAverage: number | null; valueAverage: number | null; supportAverage: number | null };
export type ProjectComment = { id: string; projectId: string; parentId: string | null; body: string; authorName: string; experienceBadges: ExperienceBadge[]; helpfulCount: number; helpfulByMe: boolean; createdAt: string; updatedAt: string; editedAt: string | null };

export const projectCommunityApi = {
  listReviews: async (projectId: string) => api.get<{ items: ProjectReview[]; aggregate: ProjectReviewAggregate }>(`/api/v1/projects/${encodeURIComponent(projectId)}/reviews`),
  upsertReview: async (projectId: string, input: ProjectReviewInput) => (await api.put<{ item: ProjectReview }>(`/api/v1/projects/${encodeURIComponent(projectId)}/reviews/mine`, input)).item,
  listComments: async (projectId: string) => (await api.get<{ items: ProjectComment[] }>(`/api/v1/projects/${encodeURIComponent(projectId)}/comments`)).items,
  createComment: async (projectId: string, input: { body: string; parentId?: string | null }) => (await api.post<{ item: ProjectComment }>(`/api/v1/projects/${encodeURIComponent(projectId)}/comments`, input)).item,
  markHelpful: async (projectId: string, commentId: string) => (await api.post<{ item: { helpfulCount: number; helpfulByMe: boolean } }>(`/api/v1/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(commentId)}/helpful`, {})).item,
  report: async (input: { entityType: "review" | "comment"; entityId: string; reason: "spam" | "harassment" | "misinformation" | "conflict_of_interest" | "other"; details?: string }) => (await api.post<{ item: { id: string; status: "open"; createdAt: string } }>("/api/v1/project-content-reports", input)).item,
  listBadges: async (projectId: string) => (await api.get<{ items: ExperienceBadge[] }>(`/api/v1/projects/${encodeURIComponent(projectId)}/experience-badges`)).items,
  submitExperienceClaim: async (projectId: string, input: { claimType: ExperienceBadge["badgeType"]; evidenceFileId: string; evidenceReference?: string }) => (await api.post<{ item: { id: string; projectId: string; claimType: string; status: string; createdAt: string; updatedAt: string } }>(`/api/v1/projects/${encodeURIComponent(projectId)}/experience-claims`, input)).item,
};
