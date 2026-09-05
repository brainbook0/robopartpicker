CREATE TABLE project_claim_requests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  claimant_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  evidence_file_id TEXT NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  evidence_reference TEXT CHECK (evidence_reference IS NULL OR length(evidence_reference) <= 2000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  owner_user_id_snapshot TEXT NOT NULL,
  project_version_snapshot INTEGER NOT NULL CHECK (project_version_snapshot > 0),
  reviewer_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  private_moderator_notes TEXT CHECK (private_moderator_notes IS NULL OR length(private_moderator_notes) <= 4000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_at TEXT,
  transferred_at TEXT,
  withdrawn_at TEXT,
  CHECK (claimant_user_id <> owner_user_id_snapshot),
  CHECK (
    (status = 'pending' AND reviewer_user_id IS NULL AND private_moderator_notes IS NULL
      AND reviewed_at IS NULL AND transferred_at IS NULL AND withdrawn_at IS NULL)
    OR (status = 'approved' AND reviewer_user_id IS NOT NULL AND private_moderator_notes IS NOT NULL
      AND reviewed_at IS NOT NULL AND transferred_at IS NOT NULL AND withdrawn_at IS NULL)
    OR (status = 'rejected' AND reviewer_user_id IS NOT NULL AND private_moderator_notes IS NOT NULL
      AND reviewed_at IS NOT NULL AND transferred_at IS NULL AND withdrawn_at IS NULL)
    OR (status = 'withdrawn' AND reviewer_user_id IS NULL AND private_moderator_notes IS NULL
      AND reviewed_at IS NULL AND transferred_at IS NULL AND withdrawn_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_project_claim_requests_pending_claimant
  ON project_claim_requests(project_id, claimant_user_id)
  WHERE status = 'pending';

CREATE INDEX idx_project_claim_requests_moderation_queue
  ON project_claim_requests(status, created_at)
  WHERE status = 'pending';

CREATE INDEX idx_project_claim_requests_claimant_history
  ON project_claim_requests(claimant_user_id, created_at DESC);

CREATE TRIGGER project_claim_requests_approve_transfer
BEFORE UPDATE OF status ON project_claim_requests
WHEN NEW.status = 'approved'
BEGIN
  SELECT CASE WHEN OLD.status <> 'pending' OR NOT EXISTS (
    SELECT 1 FROM projects project
    WHERE project.id = NEW.project_id
      AND project.deleted_at IS NULL
      AND project.is_demo = 0
      AND project.visibility = 'public'
      AND project.status = 'published'
      AND project.organization_id IS NULL
      AND project.owner_user_id = NEW.owner_user_id_snapshot
      AND project.owner_user_id = 'robotics-catalog-import'
      AND project.version = NEW.project_version_snapshot
      AND project.project_kind <> 'commercial_showcase'
      AND project.repository_url IS NOT NULL
      AND trim(project.repository_url) <> ''
      AND project.license_spdx IS NOT NULL
      AND trim(project.license_spdx) <> ''
      AND lower(trim(project.license_spdx)) NOT IN (
        'proprietary', 'manufacturer terms', 'manufacturer-terms', 'unknown',
        'other', 'none', 'noassertion', 'unlicensed'
      )
  ) THEN RAISE(ABORT, 'PROJECT_CLAIM_STALE') END;

  UPDATE projects
  SET owner_user_id = NEW.claimant_user_id,
      version = version + 1,
      updated_at = NEW.reviewed_at
  WHERE id = NEW.project_id
    AND owner_user_id = NEW.owner_user_id_snapshot
    AND version = NEW.project_version_snapshot;

  DELETE FROM project_maintainers
  WHERE project_id = NEW.project_id AND user_id = NEW.owner_user_id_snapshot;

  INSERT INTO project_maintainers (project_id, user_id, role, created_at)
  VALUES (NEW.project_id, NEW.claimant_user_id, 'owner', NEW.reviewed_at)
  ON CONFLICT(project_id, user_id) DO UPDATE SET role = 'owner';
END;
