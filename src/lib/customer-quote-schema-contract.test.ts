import { describe, expect, it } from "vitest";
import migration from "../../migrations/0029_customer_quote_requests_and_project_proposals.sql?raw";

describe("customer quote and project proposal migration", () => {
  it("stores private quote PII with frozen estimates, consent, status and retention", () => {
    for (const token of [
      "CREATE TABLE customer_quote_requests",
      "requester_user_id",
      "first_name",
      "last_name",
      "email",
      "address_line1",
      "city",
      "region",
      "postal_code",
      "country_code",
      "materials_estimate_minor",
      "shipping_estimate_minor",
      "shipping_method_version",
      "estimate_snapshot_json",
      "consent_at",
      "retention_expires_at",
      "CHECK (status IN ('submitted', 'reviewing', 'quoted', 'closed', 'deleted'))",
    ]) expect(migration).toContain(token);
    expect(migration).toContain("REFERENCES \"user\"(id) ON DELETE CASCADE");
    expect(migration).toContain("CHECK (project_id IS NOT NULL OR bom_id IS NOT NULL)");
    expect(migration).toContain("idx_customer_quote_requests_retention");
  });

  it("stores source-linked moderated proposals with canonical revision provenance", () => {
    for (const token of [
      "CREATE TABLE project_change_proposals",
      "proposal_type",
      "payload_json",
      "source_urls_json",
      "reviewed_by_user_id",
      "resulting_project_version_id",
      "CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn'))",
      "idx_project_change_proposals_project_status",
    ]) expect(migration).toContain(token);
  });
});
