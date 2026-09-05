import { describe, expect, it } from "vitest";
import migration from "../../migrations/0031_project_claim_requests.sql?raw";

describe("project claim request migration", () => {
  it("stores private evidence and stale-review snapshots without public projection fields", () => {
    for (const token of [
      "CREATE TABLE project_claim_requests",
      "claimant_user_id TEXT NOT NULL REFERENCES \"user\"(id) ON DELETE CASCADE",
      "evidence_file_id TEXT NOT NULL REFERENCES files(id) ON DELETE RESTRICT",
      "evidence_reference",
      "owner_user_id_snapshot",
      "project_version_snapshot",
      "private_moderator_notes",
      "CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn'))",
    ]) expect(migration).toContain(token);
  });

  it("enforces one pending claim per claimant and indexed private queues", () => {
    expect(migration).toContain("CREATE UNIQUE INDEX idx_project_claim_requests_pending_claimant");
    expect(migration).toContain("WHERE status = 'pending'");
    expect(migration).toContain("CREATE INDEX idx_project_claim_requests_moderation_queue");
    expect(migration).toContain("CREATE INDEX idx_project_claim_requests_claimant_history");
  });

  it("uses a guarded approval trigger so ownership and claim state cannot diverge", () => {
    for (const token of [
      "CREATE TRIGGER project_claim_requests_approve_transfer",
      "RAISE(ABORT, 'PROJECT_CLAIM_STALE')",
      "owner_user_id = NEW.claimant_user_id",
      "version = version + 1",
      "INSERT INTO project_maintainers",
      "ON CONFLICT(project_id, user_id) DO UPDATE SET role = 'owner'",
    ]) expect(migration).toContain(token);
  });
});
