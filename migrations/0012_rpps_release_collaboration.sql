-- Exact-release build passports and evidence attachments for the RPPS collaboration loop.
CREATE TABLE rpps_build_passports (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES rpps_releases(id) ON DELETE RESTRICT,
  build_id TEXT NOT NULL UNIQUE REFERENCES builds(id) ON DELETE CASCADE,
  stable_release_id TEXT NOT NULL,
  release_version TEXT NOT NULL,
  package_sha256 TEXT NOT NULL CHECK (length(package_sha256) = 64),
  created_by_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_rpps_build_passports_release_created
  ON rpps_build_passports(release_id, created_at DESC);

CREATE TABLE rpps_build_passport_items (
  build_item_id TEXT PRIMARY KEY REFERENCES build_items(id) ON DELETE CASCADE,
  passport_id TEXT NOT NULL REFERENCES rpps_build_passports(id) ON DELETE CASCADE,
  component_stable_id TEXT NOT NULL,
  UNIQUE (passport_id, component_stable_id)
);

CREATE TABLE rpps_build_passport_steps (
  build_step_id TEXT PRIMARY KEY REFERENCES build_steps(id) ON DELETE CASCADE,
  passport_id TEXT NOT NULL REFERENCES rpps_build_passports(id) ON DELETE CASCADE,
  procedure_stable_id TEXT NOT NULL,
  step_stable_id TEXT NOT NULL,
  UNIQUE (passport_id, procedure_stable_id, step_stable_id)
);

CREATE TABLE rpps_build_outcome_evidence (
  outcome_id TEXT NOT NULL REFERENCES rpps_build_outcomes(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (outcome_id, file_id)
);

ALTER TABLE rpps_change_proposals ADD COLUMN review_note TEXT;
