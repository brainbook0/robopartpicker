import { describe, expect, it } from "vitest";
import migration from "../../migrations/0030_project_reviews_comments_and_experience.sql?raw";

describe("project social and experience migration", () => {
  it("stores one editable, revision-audited review per user and project", () => {
    for (const token of [
      "CREATE TABLE project_reviews",
      "overall_rating",
      "reliability_rating",
      "usability_rating",
      "value_rating",
      "support_rating",
      "CHECK (relationship IN ('owner', 'operator', 'evaluator', 'observer'))",
      "CHECK (moderation_status IN ('published', 'under_review', 'removed'))",
      "UNIQUE (project_id, user_id)",
      "CREATE TABLE project_review_revisions",
      "snapshot_json",
    ]) expect(migration).toContain(token);
  });

  it("stores one-level project discussion with reactions and moderation reports", () => {
    for (const token of [
      "CREATE TABLE project_comments",
      "parent_id",
      "helpful_count",
      "project_comments_one_level_insert",
      "CREATE TABLE project_comment_reactions",
      "UNIQUE (comment_id, user_id)",
      "CREATE TABLE project_content_reports",
      "CHECK (entity_type IN ('review', 'comment'))",
      "CHECK (status IN ('open', 'resolved', 'dismissed'))",
    ]) expect(migration).toContain(token);
  });

  it("keeps experience evidence private while supporting verified public badge types", () => {
    for (const token of [
      "CREATE TABLE project_experience_claims",
      "evidence_file_id TEXT NOT NULL REFERENCES files(id) ON DELETE RESTRICT",
      "CHECK (claim_type IN ('owner', 'operator', 'manufacturer_representative'))",
      "CHECK (status IN ('pending', 'verified', 'rejected', 'revoked'))",
      "reviewer_user_id",
      "private_moderator_notes",
      "verified_at",
      "UNIQUE (project_id, user_id, claim_type)",
    ]) expect(migration).toContain(token);
  });
});
