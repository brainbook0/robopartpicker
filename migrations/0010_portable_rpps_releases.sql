-- Portable RPPS 0.1 Draft releases. Releases are append-only; corrections create a new release.
CREATE TABLE rpps_releases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stable_release_id TEXT NOT NULL,
  version_label TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  manifest_yaml TEXT NOT NULL,
  lock_yaml TEXT,
  manifest_sha256 TEXT NOT NULL CHECK (length(manifest_sha256) = 64),
  package_sha256 TEXT NOT NULL CHECK (length(package_sha256) = 64),
  conformance_report_json TEXT NOT NULL CHECK (json_valid(conformance_report_json)),
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'superseded', 'withdrawn')),
  created_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  published_at TEXT,
  withdrawn_at TEXT,
  UNIQUE (project_id, stable_release_id),
  UNIQUE (project_id, version_label)
);

CREATE INDEX idx_rpps_releases_project_status_created ON rpps_releases(project_id, status, created_at DESC);
CREATE INDEX idx_rpps_releases_package_hash ON rpps_releases(package_sha256);

CREATE TABLE rpps_release_assemblies (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES rpps_releases(id) ON DELETE CASCADE,
  stable_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  UNIQUE (release_id, stable_id)
);

CREATE TABLE rpps_release_interfaces (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES rpps_releases(id) ON DELETE CASCADE,
  stable_id TEXT NOT NULL,
  interface_kind TEXT NOT NULL,
  name TEXT NOT NULL,
  specifications_json TEXT NOT NULL CHECK (json_valid(specifications_json)),
  UNIQUE (release_id, stable_id)
);

CREATE TABLE rpps_source_mappings (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES rpps_releases(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL,
  object_stable_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_path TEXT,
  source_revision TEXT,
  parser_id TEXT,
  retrieved_at TEXT,
  confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_rpps_source_mappings_object ON rpps_source_mappings(release_id, object_type, object_stable_id);

CREATE TABLE rpps_validation_findings (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES rpps_releases(id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('blocker', 'warning', 'suggestion')),
  profile TEXT NOT NULL CHECK (profile IN ('core', 'buildable', 'reproducible', 'collaborative')),
  dimension TEXT NOT NULL,
  affected_object_stable_id TEXT,
  message TEXT NOT NULL,
  suggestion TEXT NOT NULL,
  deterministic INTEGER NOT NULL CHECK (deterministic IN (0, 1)),
  effect INTEGER NOT NULL CHECK (effect >= 0 AND effect <= 100),
  UNIQUE (release_id, rule_id, affected_object_stable_id)
);

CREATE INDEX idx_rpps_validation_findings_release_severity ON rpps_validation_findings(release_id, severity, rule_id);

CREATE TABLE rpps_change_proposals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_release_id TEXT NOT NULL REFERENCES rpps_releases(id) ON DELETE CASCADE,
  proposal_type TEXT NOT NULL CHECK (proposal_type IN ('substitute_component', 'correct_component_identity', 'add_assembly_step', 'change_configuration', 'add_compatibility_condition', 'attach_test_evidence', 'introduce_variant', 'withdraw_claim', 'backport_fix')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'rejected', 'withdrawn')),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_by_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  reviewed_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);

CREATE INDEX idx_rpps_change_proposals_target_status ON rpps_change_proposals(target_release_id, status, created_at DESC);

CREATE TABLE rpps_build_outcomes (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES rpps_releases(id) ON DELETE CASCADE,
  build_id TEXT REFERENCES builds(id) ON DELETE SET NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('succeeded', 'partially_succeeded', 'failed', 'abandoned')),
  independence TEXT NOT NULL CHECK (independence IN ('maintainer', 'independent')),
  conditions_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(conditions_json)),
  summary TEXT,
  submitted_by_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  submitted_at TEXT NOT NULL,
  UNIQUE (release_id, build_id)
);

CREATE INDEX idx_rpps_build_outcomes_release_result ON rpps_build_outcomes(release_id, outcome, independence, submitted_at DESC);
