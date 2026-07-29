import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import { DataReviewPanel } from "./DataReviewPanel";
import { dataReviewApi } from "@/lib/api/imports";

vi.mock("@/lib/api/imports", () => ({
  dataReviewApi: {
    list: vi.fn(),
    detail: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    defer: vi.fn(),
    recordConflict: vi.fn(),
  },
}));

const item = {
  id: "review-record",
  import_job_id: "review-job",
  external_record_id: "actuator-rev-a",
  record_type: "component",
  source_name: "Fixture Manufacturer",
  confidence: 0.91,
  status: "review",
  trace_id: "1234567890abcdef1234567890abcdef",
  schema_version: "2.0",
  created_at: "2026-07-29T16:00:00.000Z",
  parsedData: { name: "Fixture Actuator" },
};

const detail = {
  permissions: { canRead: true as const, canMutate: true },
  record: {
    id: item.id,
    importJobId: item.import_job_id,
    sourceId: "fixture-source",
    sourceName: item.source_name,
    externalRecordId: item.external_record_id,
    recordType: item.record_type,
    sourceUrl: "https://example.com/actuator",
    confidence: item.confidence,
    status: "review",
    reviewState: "pending",
    traceId: item.trace_id,
    schemaVersion: "2.0",
    parsedData: item.parsedData,
    createdAt: item.created_at,
    updatedAt: item.created_at,
  },
  claims: [{
    id: "claim-ai",
    claimKey: "actuator.rated_torque",
    originalValue: "11.4 N.m",
    normalizedValue: 11.4,
    unit: "N.m",
    confidence: 0.7,
    evidenceLocator: "ai:comparison",
    classification: "ai_inferred",
    aiInferred: true,
    applicableRevision: "rev-a",
  }],
  evidence: [{
    id: "snapshot",
    sourceClass: "official",
    sourceUrl: "https://example.com/actuator",
    immutableExternalUrl: "https://example.com/actuator?rev=a",
    retrievedAt: item.created_at,
    applicableRevision: "rev-a",
    detectedMediaType: "application/json",
    byteSize: 20_000,
    contentSha256: "a".repeat(64),
    authorizedContentUrl: null,
    retentionState: "external_reference",
    policy: {
      robotsStatus: "allowed",
      termsStatus: "approved",
      reuseStatus: "metadata_and_facts",
      decision: "unreviewed",
    },
  }],
  previews: [{
    kind: "raw_payload_json",
    text: "{\"bounded\":true}",
    byteSize: 16,
    originalByteSize: 20_000,
    truncated: true,
  }],
  candidates: [],
  conflicts: [],
  lifecycle: [],
  proposedMutation: {
    diff: { operation: "create", canonicalEntityId: item.id },
    hash: "b".repeat(64),
  },
};

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><DataReviewPanel /></QueryClientProvider>);
}

describe("DataReviewPanel", () => {
  it("shows claim provenance and approves only the displayed diff hash", async () => {
    vi.mocked(dataReviewApi.list).mockResolvedValue({
      items: [item],
      permissions: { canRead: true, canMutate: true },
    });
    vi.mocked(dataReviewApi.detail).mockResolvedValue(detail);
    vi.mocked(dataReviewApi.approve).mockResolvedValue({});

    renderPanel();
    fireEvent.click(await screen.findByText("Fixture Actuator"));

    expect(await screen.findByText("Exact proposed mutation")).toBeInTheDocument();
    expect(screen.getByText("ai inferred")).toBeInTheDocument();
    expect(screen.getByText(/truncated/u)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Approve displayed diff/u }));

    await waitFor(() => expect(dataReviewApi.approve).toHaveBeenCalledWith(item.id, {
      decision: "create",
      canonicalEntityId: null,
      expectedDiffHash: detail.proposedMutation.hash,
    }));
  });
});
