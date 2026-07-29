-- Additive source-policy, provenance, observation, budget, and acquisition-job substrate.
-- Large evidence bytes remain in R2; D1 stores bounded metadata and immutable references.

CREATE TABLE source_collection_profiles (
  source_id TEXT PRIMARY KEY REFERENCES import_sources(id) ON DELETE CASCADE,
  source_tier TEXT NOT NULL CHECK (source_tier IN ('official_manufacturer', 'authorized_distributor', 'repository', 'standards_reference', 'community', 'marketplace', 'media', 'other')),
  policy_state TEXT NOT NULL DEFAULT 'unreviewed' CHECK (policy_state IN ('unreviewed', 'approved_fixture_only', 'approved_live', 'denied', 'withdrawn')),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  access_method TEXT NOT NULL,
  owner_reference TEXT,
  user_agent TEXT,
  cadence_class TEXT NOT NULL DEFAULT 'manual' CHECK (cadence_class IN ('manual', 'daily', 'weekly', 'monthly')),
  rate_limit_per_minute INTEGER CHECK (rate_limit_per_minute IS NULL OR rate_limit_per_minute > 0),
  next_due_at TEXT,
  last_successful_check_at TEXT,
  freshness_target_seconds INTEGER NOT NULL CHECK (freshness_target_seconds > 0),
  freshness_debt_seconds INTEGER NOT NULL DEFAULT 0 CHECK (freshness_debt_seconds >= 0),
  circuit_state TEXT NOT NULL DEFAULT 'closed' CHECK (circuit_state IN ('closed', 'open', 'half_open')),
  scraper_version TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE source_policy_revisions (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES import_sources(id) ON DELETE RESTRICT,
  robots_status TEXT NOT NULL CHECK (robots_status IN ('unknown', 'allowed', 'disallowed', 'not_applicable')),
  robots_checked_at TEXT,
  terms_status TEXT NOT NULL CHECK (terms_status IN ('unknown', 'approved', 'denied', 'requires_review', 'not_applicable')),
  reuse_status TEXT NOT NULL CHECK (reuse_status IN ('unknown', 'metadata_only', 'metadata_and_facts', 'retention_approved', 'denied')),
  decision TEXT NOT NULL CHECK (decision IN ('unreviewed', 'approved_fixture_only', 'approved_live', 'denied', 'withdrawn')),
  decision_notes TEXT,
  approval_authority_reference TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  superseded_at TEXT,
  supersedes_policy_revision_id TEXT REFERENCES source_policy_revisions(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  CHECK (superseded_at IS NULL OR superseded_at >= effective_at)
);

CREATE TABLE source_snapshots (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES import_sources(id) ON DELETE RESTRICT,
  import_record_id TEXT REFERENCES import_records(id) ON DELETE SET NULL,
  source_policy_revision_id TEXT NOT NULL REFERENCES source_policy_revisions(id) ON DELETE RESTRICT,
  source_class TEXT NOT NULL CHECK (source_class IN ('official', 'reported', 'measured', 'calculated', 'estimated', 'ai_inferred')),
  source_url TEXT NOT NULL,
  original_published_at TEXT,
  retrieved_at TEXT NOT NULL,
  language TEXT,
  region_code TEXT,
  applicable_revision TEXT,
  declared_media_type TEXT,
  detected_media_type TEXT,
  byte_size INTEGER CHECK (byte_size IS NULL OR byte_size >= 0),
  content_sha256 TEXT CHECK (content_sha256 IS NULL OR (length(content_sha256) = 64 AND content_sha256 NOT GLOB '*[^0-9a-f]*')),
  file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  retained_object_key TEXT,
  immutable_external_url TEXT,
  retrieval_metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(retrieval_metadata_json) AND length(retrieval_metadata_json) <= 131072),
  copyright_reuse_status TEXT,
  retention_state TEXT NOT NULL CHECK (retention_state IN ('active', 'retained', 'takedown_pending', 'takedown_complete', 'external_reference', 'metadata_only', 'rejected')),
  supersedes_snapshot_id TEXT REFERENCES source_snapshots(id) ON DELETE SET NULL,
  withdrawn_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (file_id IS NOT NULL OR retained_object_key IS NOT NULL OR immutable_external_url IS NOT NULL OR retention_state IN ('metadata_only', 'rejected', 'takedown_complete'))
);

CREATE TABLE field_claims (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES import_sources(id) ON DELETE RESTRICT,
  import_record_id TEXT NOT NULL REFERENCES import_records(id) ON DELETE RESTRICT,
  snapshot_id TEXT REFERENCES source_snapshots(id) ON DELETE SET NULL,
  claim_key TEXT NOT NULL,
  original_value_json TEXT NOT NULL CHECK (json_valid(original_value_json) AND length(original_value_json) <= 131072),
  normalized_value_json TEXT CHECK (normalized_value_json IS NULL OR (json_valid(normalized_value_json) AND length(normalized_value_json) <= 131072)),
  unit TEXT,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence_locator TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('official', 'reported', 'measured', 'calculated', 'estimated', 'ai_inferred')),
  language TEXT,
  region_code TEXT,
  applicable_revision TEXT,
  extraction_method TEXT NOT NULL,
  extraction_model TEXT,
  extractor_version TEXT,
  schema_version TEXT NOT NULL,
  promoted_evidence_claim_id TEXT REFERENCES evidence_claims(id) ON DELETE SET NULL,
  supersedes_claim_id TEXT REFERENCES field_claims(id) ON DELETE SET NULL,
  withdrawn_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE temporal_observations (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES import_sources(id) ON DELETE RESTRICT,
  import_record_id TEXT NOT NULL REFERENCES import_records(id) ON DELETE RESTRICT,
  snapshot_id TEXT REFERENCES source_snapshots(id) ON DELETE SET NULL,
  field_claim_id TEXT REFERENCES field_claims(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_external_id TEXT NOT NULL,
  observation_type TEXT NOT NULL CHECK (observation_type IN ('price', 'stock', 'availability', 'specification', 'firmware', 'release', 'project_version', 'source_policy_status', 'delisting', 'other')),
  original_value_json TEXT NOT NULL CHECK (json_valid(original_value_json) AND length(original_value_json) <= 131072),
  normalized_value_json TEXT CHECK (normalized_value_json IS NULL OR (json_valid(normalized_value_json) AND length(normalized_value_json) <= 131072)),
  unit TEXT,
  currency TEXT CHECK (currency IS NULL OR length(currency) = 3),
  observed_at TEXT NOT NULL,
  valid_from TEXT,
  valid_to TEXT,
  first_seen_at TEXT,
  last_seen_at TEXT,
  supersedes_observation_id TEXT REFERENCES temporal_observations(id) ON DELETE SET NULL,
  withdrawal_reason TEXT,
  created_at TEXT NOT NULL,
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

CREATE TABLE collection_missing_information (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES import_sources(id) ON DELETE RESTRICT,
  import_record_id TEXT REFERENCES import_records(id) ON DELETE CASCADE,
  snapshot_id TEXT REFERENCES source_snapshots(id) ON DELETE SET NULL,
  field_key TEXT,
  reason_code TEXT NOT NULL CHECK (reason_code IN ('missing', 'unresolved_identity', 'ambiguous', 'unsupported_format', 'denied_source', 'conflicting', 'other')),
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'deferred', 'resolved', 'promoted')),
  promoted_request_id TEXT REFERENCES missing_information_requests(id) ON DELETE SET NULL,
  resolution_claim_id TEXT REFERENCES field_claims(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE claim_conflict_sets (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES import_sources(id) ON DELETE RESTRICT,
  import_record_id TEXT REFERENCES import_records(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_external_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  conflict_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  promoted_data_conflict_id TEXT REFERENCES data_conflicts(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE claim_conflict_members (
  conflict_set_id TEXT NOT NULL REFERENCES claim_conflict_sets(id) ON DELETE CASCADE,
  field_claim_id TEXT NOT NULL REFERENCES field_claims(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'claim' CHECK (member_role IN ('claim', 'preferred', 'rejected')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (conflict_set_id, field_claim_id)
);

CREATE TABLE collection_jobs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES import_sources(id) ON DELETE RESTRICT,
  source_policy_revision_id TEXT REFERENCES source_policy_revisions(id) ON DELETE RESTRICT,
  job_type TEXT NOT NULL CHECK (job_type IN ('discovery', 'acquisition', 'parsing', 'submission', 'maintenance')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'leased', 'fetching', 'parsing', 'submitting', 'complete', 'failed', 'deferred', 'denied', 'cancelled')),
  requested_url TEXT,
  payload_hash TEXT CHECK (payload_hash IS NULL OR (length(payload_hash) = 64 AND payload_hash NOT GLOB '*[^0-9a-f]*')),
  dedup_key TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  scheduled_for TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  lease_token TEXT,
  lease_owner TEXT,
  leased_at TEXT,
  lease_expires_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  backoff_until TEXT,
  last_error TEXT,
  import_job_id TEXT REFERENCES import_jobs(id) ON DELETE SET NULL,
  trace_id TEXT NOT NULL CHECK (length(trace_id) = 32 AND trace_id NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (source_id, dedup_key),
  CHECK (
    (status IN ('leased', 'fetching', 'parsing', 'submitting') AND lease_token IS NOT NULL AND lease_owner IS NOT NULL AND leased_at IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR status NOT IN ('leased', 'fetching', 'parsing', 'submitting')
  ),
  CHECK (import_job_id IS NULL OR status IN ('submitting', 'complete', 'failed'))
);

CREATE TABLE collection_budget_ledger (
  id TEXT PRIMARY KEY,
  cost_class TEXT NOT NULL CHECK (cost_class IN ('ai_token', 'cloudflare_infra', 'paid_source_api')),
  source_id TEXT REFERENCES import_sources(id) ON DELETE SET NULL,
  collection_job_id TEXT REFERENCES collection_jobs(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('limit', 'projection', 'reservation', 'commit', 'release', 'adjustment')),
  reservation_id TEXT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  limit_microusd INTEGER NOT NULL CHECK (limit_microusd >= 0),
  consumed_microusd INTEGER NOT NULL DEFAULT 0 CHECK (consumed_microusd >= 0),
  projected_microusd INTEGER NOT NULL DEFAULT 0 CHECK (projected_microusd >= 0),
  approval_state TEXT NOT NULL DEFAULT 'not_required' CHECK (approval_state IN ('not_required', 'pending', 'approved', 'denied')),
  paused_at TEXT,
  pause_reason TEXT,
  trace_id TEXT NOT NULL CHECK (length(trace_id) = 32 AND trace_id NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL,
  CHECK (period_end > period_start),
  CHECK ((paused_at IS NULL AND pause_reason IS NULL) OR (paused_at IS NOT NULL AND pause_reason IS NOT NULL))
);

CREATE TABLE collection_lifecycle_events (
  id TEXT PRIMARY KEY,
  collection_job_id TEXT NOT NULL REFERENCES collection_jobs(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL REFERENCES import_sources(id) ON DELETE RESTRICT,
  import_job_id TEXT REFERENCES import_jobs(id) ON DELETE SET NULL,
  import_record_id TEXT REFERENCES import_records(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  reason TEXT,
  details_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json) AND length(details_json) <= 131072),
  trace_id TEXT NOT NULL CHECK (length(trace_id) = 32 AND trace_id NOT GLOB '*[^0-9a-f]*'),
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TRIGGER source_policy_revisions_no_update
BEFORE UPDATE ON source_policy_revisions
BEGIN
  SELECT RAISE(ABORT, 'source_policy_revisions is append-only');
END;
CREATE TRIGGER source_policy_revisions_no_delete
BEFORE DELETE ON source_policy_revisions
BEGIN
  SELECT RAISE(ABORT, 'source_policy_revisions is append-only');
END;

CREATE TRIGGER source_snapshots_no_update
BEFORE UPDATE ON source_snapshots
BEGIN
  SELECT RAISE(ABORT, 'source_snapshots is append-only');
END;
CREATE TRIGGER source_snapshots_no_delete
BEFORE DELETE ON source_snapshots
BEGIN
  SELECT RAISE(ABORT, 'source_snapshots is append-only');
END;

CREATE TRIGGER field_claims_no_update
BEFORE UPDATE ON field_claims
BEGIN
  SELECT RAISE(ABORT, 'field_claims is append-only');
END;
CREATE TRIGGER field_claims_no_delete
BEFORE DELETE ON field_claims
BEGIN
  SELECT RAISE(ABORT, 'field_claims is append-only');
END;

CREATE TRIGGER temporal_observations_no_update
BEFORE UPDATE ON temporal_observations
BEGIN
  SELECT RAISE(ABORT, 'temporal_observations is append-only');
END;
CREATE TRIGGER temporal_observations_no_delete
BEFORE DELETE ON temporal_observations
BEGIN
  SELECT RAISE(ABORT, 'temporal_observations is append-only');
END;

CREATE TRIGGER collection_budget_ledger_no_update
BEFORE UPDATE ON collection_budget_ledger
BEGIN
  SELECT RAISE(ABORT, 'collection_budget_ledger is append-only');
END;
CREATE TRIGGER collection_budget_ledger_no_delete
BEFORE DELETE ON collection_budget_ledger
BEGIN
  SELECT RAISE(ABORT, 'collection_budget_ledger is append-only');
END;

CREATE TRIGGER collection_lifecycle_events_no_update
BEFORE UPDATE ON collection_lifecycle_events
BEGIN
  SELECT RAISE(ABORT, 'collection_lifecycle_events is append-only');
END;
CREATE TRIGGER collection_lifecycle_events_no_delete
BEFORE DELETE ON collection_lifecycle_events
BEGIN
  SELECT RAISE(ABORT, 'collection_lifecycle_events is append-only');
END;

ALTER TABLE import_jobs
  ADD COLUMN trace_id TEXT CHECK (trace_id IS NULL OR (length(trace_id) = 32 AND trace_id NOT GLOB '*[^0-9a-f]*'));
ALTER TABLE import_records
  ADD COLUMN trace_id TEXT CHECK (trace_id IS NULL OR (length(trace_id) = 32 AND trace_id NOT GLOB '*[^0-9a-f]*'));
ALTER TABLE import_errors
  ADD COLUMN trace_id TEXT CHECK (trace_id IS NULL OR (length(trace_id) = 32 AND trace_id NOT GLOB '*[^0-9a-f]*'));
ALTER TABLE import_audit_events
  ADD COLUMN trace_id TEXT CHECK (trace_id IS NULL OR (length(trace_id) = 32 AND trace_id NOT GLOB '*[^0-9a-f]*'));

CREATE INDEX source_collection_profiles_due_idx ON source_collection_profiles(enabled, policy_state, next_due_at);
CREATE INDEX source_collection_profiles_circuit_idx ON source_collection_profiles(circuit_state, next_due_at);
CREATE INDEX source_policy_revisions_source_effective_idx ON source_policy_revisions(source_id, effective_at DESC);
CREATE INDEX source_snapshots_source_retrieved_idx ON source_snapshots(source_id, retrieved_at DESC);
CREATE INDEX source_snapshots_hash_idx ON source_snapshots(content_sha256);
CREATE INDEX source_snapshots_import_record_idx ON source_snapshots(import_record_id);
CREATE INDEX field_claims_import_record_key_idx ON field_claims(import_record_id, claim_key, created_at);
CREATE INDEX field_claims_source_key_idx ON field_claims(source_id, claim_key, created_at DESC);
CREATE INDEX field_claims_promoted_idx ON field_claims(promoted_evidence_claim_id);
CREATE INDEX temporal_observations_current_idx ON temporal_observations(source_id, entity_type, entity_external_id, observation_type, observed_at DESC);
CREATE INDEX temporal_observations_record_idx ON temporal_observations(import_record_id, observation_type, observed_at DESC);
CREATE INDEX collection_missing_information_review_idx ON collection_missing_information(source_id, status, created_at);
CREATE INDEX collection_missing_information_record_idx ON collection_missing_information(import_record_id, status);
CREATE INDEX claim_conflict_sets_open_idx ON claim_conflict_sets(source_id, status, created_at);
CREATE INDEX claim_conflict_sets_record_idx ON claim_conflict_sets(import_record_id, field_key);
CREATE INDEX claim_conflict_members_claim_idx ON claim_conflict_members(field_claim_id);
CREATE INDEX collection_jobs_due_idx ON collection_jobs(status, scheduled_for, backoff_until, priority);
CREATE INDEX collection_jobs_lease_expiry_idx ON collection_jobs(status, lease_expires_at);
CREATE INDEX collection_jobs_source_status_idx ON collection_jobs(source_id, status, updated_at DESC);
CREATE INDEX collection_jobs_trace_idx ON collection_jobs(trace_id);
CREATE INDEX collection_budget_ledger_class_period_idx ON collection_budget_ledger(cost_class, period_start, period_end, created_at DESC);
CREATE INDEX collection_budget_ledger_source_period_idx ON collection_budget_ledger(source_id, cost_class, period_start, created_at DESC);
CREATE INDEX collection_budget_ledger_job_idx ON collection_budget_ledger(collection_job_id, created_at);
CREATE INDEX collection_lifecycle_events_job_time_idx ON collection_lifecycle_events(collection_job_id, occurred_at);
CREATE INDEX collection_lifecycle_events_source_time_idx ON collection_lifecycle_events(source_id, occurred_at DESC);
CREATE INDEX collection_lifecycle_events_trace_idx ON collection_lifecycle_events(trace_id, occurred_at);
CREATE INDEX import_jobs_trace_idx ON import_jobs(trace_id);
CREATE INDEX import_records_trace_idx ON import_records(trace_id);
CREATE INDEX import_errors_trace_idx ON import_errors(trace_id);
CREATE INDEX import_audit_events_trace_idx ON import_audit_events(trace_id, created_at);
