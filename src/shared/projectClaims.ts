export type ProjectClaimStatus = "pending" | "approved" | "rejected" | "withdrawn";

export type ProjectClaimEligibilityReason =
  | "not_public"
  | "not_importer_owned"
  | "organization_owned"
  | "commercial_project"
  | "repository_missing"
  | "open_source_license_missing";

export type ProjectClaimEligibility = {
  projectId: string;
  claimable: boolean;
  reason: ProjectClaimEligibilityReason | null;
};

export type ProjectClaimReceipt = {
  id: string;
  projectId: string;
  status: ProjectClaimStatus;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  transferredAt: string | null;
  withdrawnAt: string | null;
};

export type ProjectClaimReviewItem = ProjectClaimReceipt & {
  claimantUserId: string;
  claimantDisplayName: string;
  projectName: string;
  projectSlug: string;
  evidenceFile: {
    id: string;
    originalName: string;
    mediaType: string;
    sizeBytes: number;
    status: string;
    visibility: string;
    contentUrl: string;
  };
  evidenceReference: string | null;
};
