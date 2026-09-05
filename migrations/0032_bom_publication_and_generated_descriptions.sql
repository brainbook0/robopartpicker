ALTER TABLE bom_generation_runs ADD COLUMN compiler_version TEXT NOT NULL DEFAULT 'bom-compiler/0';
ALTER TABLE bom_generation_runs ADD COLUMN policy_version TEXT NOT NULL DEFAULT 'bom-publication/0';
ALTER TABLE bom_generation_runs ADD COLUMN publication_state TEXT NOT NULL DEFAULT 'draft'
  CHECK (publication_state IN ('draft', 'verified', 'partial', 'unavailable', 'manufacturer_unavailable', 'not_applicable', 'classification_required', 'rejected'));
ALTER TABLE bom_generation_runs ADD COLUMN source_inventory_complete INTEGER NOT NULL DEFAULT 0
  CHECK (source_inventory_complete IN (0, 1));
ALTER TABLE bom_generation_runs ADD COLUMN row_accounting_complete INTEGER NOT NULL DEFAULT 0
  CHECK (row_accounting_complete IN (0, 1));

ALTER TABLE bom_versions ADD COLUMN publication_state TEXT NOT NULL DEFAULT 'draft'
  CHECK (publication_state IN ('draft', 'verified', 'partial', 'unavailable', 'manufacturer_unavailable', 'not_applicable', 'classification_required', 'rejected'));
ALTER TABLE bom_versions ADD COLUMN coverage_note TEXT
  CHECK (coverage_note IS NULL OR length(coverage_note) <= 4000);
ALTER TABLE bom_versions ADD COLUMN omission_report_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(omission_report_json) AND json_type(omission_report_json) = 'array');
ALTER TABLE bom_versions ADD COLUMN compiler_version TEXT NOT NULL DEFAULT 'bom-compiler/0';
ALTER TABLE bom_versions ADD COLUMN policy_version TEXT NOT NULL DEFAULT 'bom-publication/0';

CREATE TABLE bom_source_artifacts (
  id TEXT PRIMARY KEY,
  generation_run_id TEXT NOT NULL REFERENCES bom_generation_runs(id) ON DELETE CASCADE,
  source_path TEXT NOT NULL,
  media_type TEXT,
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  checksum_sha256 TEXT CHECK (checksum_sha256 IS NULL OR checksum_sha256 GLOB '[0-9a-f]*' AND length(checksum_sha256) = 64),
  source_url TEXT,
  source_revision TEXT,
  retrieval_status TEXT NOT NULL CHECK (retrieval_status IN ('fetched', 'inventory_only', 'unsupported', 'failed', 'skipped')),
  adapter_id TEXT,
  adapter_version TEXT,
  parser_status TEXT NOT NULL DEFAULT 'pending' CHECK (parser_status IN ('pending', 'parsed', 'unsupported', 'failed', 'skipped')),
  object_count INTEGER NOT NULL DEFAULT 0 CHECK (object_count >= 0),
  error_code TEXT,
  error_message TEXT CHECK (error_message IS NULL OR length(error_message) <= 4000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (generation_run_id, source_path)
);

CREATE TABLE bom_source_object_outcomes (
  id TEXT PRIMARY KEY,
  generation_run_id TEXT NOT NULL REFERENCES bom_generation_runs(id) ON DELETE CASCADE,
  artifact_id TEXT NOT NULL REFERENCES bom_source_artifacts(id) ON DELETE CASCADE,
  source_object_id TEXT NOT NULL,
  source_locator TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('published_purchased', 'published_optional', 'aggregated', 'non_procurement', 'metadata', 'rejected', 'unsupported')),
  candidate_line_id TEXT REFERENCES bom_candidate_lines(id) ON DELETE SET NULL,
  aggregate_target_id TEXT,
  reason TEXT CHECK (reason IS NULL OR length(reason) <= 1000),
  raw_fields_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(raw_fields_json)),
  created_at TEXT NOT NULL,
  UNIQUE (generation_run_id, source_object_id),
  CHECK (outcome <> 'aggregated' OR aggregate_target_id IS NOT NULL),
  CHECK (outcome NOT IN ('rejected', 'unsupported') OR reason IS NOT NULL)
);

CREATE INDEX idx_bom_source_artifacts_run_status
  ON bom_source_artifacts(generation_run_id, retrieval_status, parser_status);
CREATE INDEX idx_bom_source_outcomes_run_outcome
  ON bom_source_object_outcomes(generation_run_id, outcome);
CREATE INDEX idx_bom_versions_publication_state
  ON bom_versions(publication_state, created_at DESC);

CREATE TABLE project_description_generations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_project_version_id TEXT REFERENCES project_versions(id) ON DELETE SET NULL,
  published_project_version_id TEXT REFERENCES project_versions(id) ON DELETE SET NULL,
  source_fingerprint TEXT NOT NULL CHECK (length(source_fingerprint) = 64),
  model_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  voice_profile TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'validated', 'published', 'rejected', 'superseded')),
  source_packet_json TEXT NOT NULL CHECK (json_valid(source_packet_json)),
  summary_text TEXT NOT NULL CHECK (length(summary_text) BETWEEN 20 AND 1000),
  description_text TEXT NOT NULL CHECK (length(description_text) BETWEEN 100 AND 40000),
  omitted_facts_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(omitted_facts_json) AND json_type(omitted_facts_json) = 'array'),
  validation_report_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(validation_report_json)),
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  created_at TEXT NOT NULL,
  validated_at TEXT,
  published_at TEXT,
  rejected_at TEXT,
  UNIQUE (project_id, source_fingerprint, prompt_version, voice_profile),
  CHECK (
    (status = 'draft' AND validated_at IS NULL AND published_at IS NULL AND rejected_at IS NULL)
    OR (status = 'validated' AND validated_at IS NOT NULL AND published_at IS NULL AND rejected_at IS NULL)
    OR (status = 'published' AND validated_at IS NOT NULL AND published_at IS NOT NULL AND rejected_at IS NULL)
    OR (status = 'rejected' AND published_at IS NULL AND rejected_at IS NOT NULL)
    OR (status = 'superseded' AND validated_at IS NOT NULL AND published_at IS NOT NULL AND rejected_at IS NULL)
  )
);

CREATE TABLE project_description_sentence_sources (
  generation_id TEXT NOT NULL REFERENCES project_description_generations(id) ON DELETE CASCADE,
  sentence_index INTEGER NOT NULL CHECK (sentence_index >= 0),
  sentence_text TEXT NOT NULL CHECK (length(sentence_text) BETWEEN 1 AND 4000),
  source_refs_json TEXT NOT NULL CHECK (json_valid(source_refs_json) AND json_type(source_refs_json) = 'array'),
  PRIMARY KEY (generation_id, sentence_index),
  UNIQUE (generation_id, sentence_index)
);

CREATE UNIQUE INDEX idx_project_description_generation_published
  ON project_description_generations(project_id)
  WHERE status = 'published';
CREATE INDEX idx_project_description_generation_status
  ON project_description_generations(status, created_at);

ALTER TABLE projects ADD COLUMN current_description_generation_id TEXT;
