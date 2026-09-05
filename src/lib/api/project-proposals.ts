import { api } from "@/lib/api/client";

export type ProjectProposalType = "assembly_step" | "assembly_video" | "integration" | "source" | "identity_correction" | "bom_correction" | "issue_report";
export type ProjectProposal = {
  id: string;
  projectId: string;
  proposalType: ProjectProposalType;
  title: string;
  details: string;
  sourceUrls: string[];
  status: "pending" | "approved" | "rejected" | "withdrawn";
  reviewNote: string | null;
  resultingProjectVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
};
export type ProjectProposalInput = { proposalType: ProjectProposalType; title: string; details: string; sourceUrls: string[] };
export type ProjectProposalReviewInput = { action: "approve" | "reject" | "withdraw"; reviewNote?: string; resultingProjectVersionId?: string };

export const projectProposalsApi = {
  listApproved: async (projectId: string): Promise<ProjectProposal[]> => (await api.get<{ items: ProjectProposal[] }>(`/api/v1/projects/${encodeURIComponent(projectId)}/proposals`)).items,
  listReviewQueue: async (projectId: string): Promise<ProjectProposal[]> => (await api.get<{ items: ProjectProposal[] }>(`/api/v1/projects/${encodeURIComponent(projectId)}/proposals/review`)).items,
  create: async (projectId: string, input: ProjectProposalInput): Promise<ProjectProposal> => (await api.post<{ item: ProjectProposal }>(`/api/v1/projects/${encodeURIComponent(projectId)}/proposals`, input)).item,
  review: async (projectId: string, proposalId: string, input: ProjectProposalReviewInput): Promise<ProjectProposal> => (await api.patch<{ item: ProjectProposal }>(`/api/v1/projects/${encodeURIComponent(projectId)}/proposals/${encodeURIComponent(proposalId)}`, input)).item,
};
