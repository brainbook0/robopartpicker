CREATE TABLE import_sources (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  base_url TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  trust_weight REAL NOT NULL DEFAULT 0.5 CHECK (trust_weight >= 0 AND trust_weight <= 1),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'retired')),
  service_credential_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE import_jobs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES import_sources(id) ON DELETE RESTRICT,
  batch_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted', 'validating', 'staged', 'review', 'processing', 'complete', 'partial', 'failed', 'cancelled')),
  retrieval_timestamp TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  accepted_count INTEGER NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
  rejected_count INTEGER NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
  duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (source_id, batch_id),
  UNIQUE (source_id, idempotency_key)
);

CREATE TABLE import_records (
  id TEXT PRIMARY KEY,
  import_job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES import_sources(id) ON DELETE RESTRICT,
  external_record_id TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('manufacturer', 'supplier', 'component', 'offer', 'project', 'bom', 'integration', 'evidence', 'teardown', 'commercial_robot', 'marketplace_reference')),
  source_url TEXT,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  raw_payload_json TEXT NOT NULL CHECK (json_valid(raw_payload_json)),
  parsed_data_json TEXT NOT NULL CHECK (json_valid(parsed_data_json)),
  normalized_fingerprint TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'rejected', 'duplicate', 'staged', 'review', 'approved', 'withdrawn', 'failed')),
  withdrawal_of_record_id TEXT REFERENCES import_records(id) ON DELETE SET NULL,
  canonical_entity_type TEXT,
  canonical_entity_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (source_id, record_type, external_record_id, import_job_id)
);

CREATE TABLE staging_manufacturers (
  id TEXT PRIMARY KEY,
  import_record_id TEXT NOT NULL UNIQUE REFERENCES import_records(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website_url TEXT,
  headquarters_region TEXT,
  normalized_name TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected', 'merged')),
  created_at TEXT NOT NULL
);

CREATE TABLE staging_suppliers (
  id TEXT PRIMARY KEY,
  import_record_id TEXT NOT NULL UNIQUE REFERENCES import_records(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website_url TEXT,
  normalized_name TEXT NOT NULL,
  regions_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(regions_json)),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected', 'merged')),
  created_at TEXT NOT NULL
);

CREATE TABLE staging_components (
  id TEXT PRIMARY KEY,
  import_record_id TEXT NOT NULL UNIQUE REFERENCES import_records(id) ON DELETE CASCADE,
  manufacturer_name TEXT,
  manufacturer_part_number TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  specs_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(specs_json)),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected', 'merged')),
  created_at TEXT NOT NULL
);

CREATE TABLE staging_offers (
  id TEXT PRIMARY KEY,
  import_record_id TEXT NOT NULL UNIQUE REFERENCES import_records(id) ON DELETE CASCADE,
  supplier_external_id TEXT,
  component_external_id TEXT,
  supplier_sku TEXT,
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  region_code TEXT,
  observed_at TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected', 'merged')),
  created_at TEXT NOT NULL
);

CREATE TABLE staging_projects (
  id TEXT PRIMARY KEY,
  import_record_id TEXT NOT NULL UNIQUE REFERENCES import_records(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  repository_url TEXT,
  license_spdx TEXT,
  extracted_json TEXT NOT NULL CHECK (json_valid(extracted_json)),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected', 'merged')),
  created_at TEXT NOT NULL
);

CREATE TABLE staging_integrations (
  id TEXT PRIMARY KEY,
  import_record_id TEXT NOT NULL UNIQUE REFERENCES import_records(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  integration_type TEXT NOT NULL,
  entities_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(entities_json)),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected', 'merged')),
  created_at TEXT NOT NULL
);

CREATE TABLE staging_boms (
  id TEXT PRIMARY KEY,
  import_record_id TEXT NOT NULL UNIQUE REFERENCES import_records(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  items_json TEXT NOT NULL CHECK (json_valid(items_json)),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected', 'merged')),
  created_at TEXT NOT NULL
);

CREATE TABLE canonical_match_candidates (
  id TEXT PRIMARY KEY,
  import_record_id TEXT NOT NULL REFERENCES import_records(id) ON DELETE CASCADE,
  canonical_entity_type TEXT NOT NULL,
  canonical_entity_id TEXT NOT NULL,
  match_method TEXT NOT NULL,
  score REAL NOT NULL CHECK (score >= 0 AND score <= 1),
  explanation_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(explanation_json)),
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'accepted', 'rejected')),
  decided_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  decided_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (import_record_id, canonical_entity_type, canonical_entity_id)
);

CREATE TABLE import_errors (
  id TEXT PRIMARY KEY,
  import_job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  import_record_id TEXT REFERENCES import_records(id) ON DELETE CASCADE,
  error_code TEXT NOT NULL,
  path TEXT,
  message TEXT NOT NULL,
  retryable INTEGER NOT NULL DEFAULT 0 CHECK (retryable IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE import_audit_events (
  id TEXT PRIMARY KEY,
  import_job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  import_record_id TEXT REFERENCES import_records(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  actor_service_id TEXT,
  event_type TEXT NOT NULL,
  before_json TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json TEXT CHECK (after_json IS NULL OR json_valid(after_json)),
  created_at TEXT NOT NULL
);

CREATE TABLE ai_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  build_id TEXT REFERENCES builds(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'New conversation',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ai_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  provider_message_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE ai_tool_calls (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES ai_messages(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  input_json TEXT NOT NULL CHECK (json_valid(input_json)),
  output_json TEXT CHECK (output_json IS NULL OR json_valid(output_json)),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'confirmed', 'running', 'succeeded', 'failed', 'rejected')),
  requires_confirmation INTEGER NOT NULL DEFAULT 0 CHECK (requires_confirmation IN (0, 1)),
  authorized_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE ai_usage (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES ai_conversations(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_cost_microunits INTEGER NOT NULL DEFAULT 0 CHECK (estimated_cost_microunits >= 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (length(currency) = 3),
  request_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE project_memory (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  build_id TEXT REFERENCES builds(id) ON DELETE CASCADE,
  memory_key TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_entity_type TEXT,
  source_entity_id TEXT,
  evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (project_id IS NOT NULL OR build_id IS NOT NULL)
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  internal_path TEXT,
  data_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data_json)),
  read_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE notification_preferences (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  in_app_enabled INTEGER NOT NULL DEFAULT 1 CHECK (in_app_enabled IN (0, 1)),
  email_enabled INTEGER NOT NULL DEFAULT 0 CHECK (email_enabled IN (0, 1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, notification_type)
);

CREATE TABLE platform_user_roles (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('moderator', 'administrator')),
  granted_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  granted_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (user_id, role)
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  actor_service_id TEXT,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  request_id TEXT,
  ip_hash TEXT,
  before_json TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json TEXT CHECK (after_json IS NULL OR json_valid(after_json)),
  created_at TEXT NOT NULL
);

CREATE TABLE rate_limit_events (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  route TEXT NOT NULL,
  allowed INTEGER NOT NULL CHECK (allowed IN (0, 1)),
  retry_after_seconds INTEGER,
  request_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE feature_entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  limit_value INTEGER,
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL)
);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  provider TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT UNIQUE,
  plan_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'paused', 'cancelled', 'expired', 'manual')),
  current_period_end TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL)
);

CREATE TABLE usage_counters (
  subject_type TEXT NOT NULL CHECK (subject_type IN ('user', 'organization', 'service')),
  subject_id TEXT NOT NULL,
  counter_key TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0 CHECK (value >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (subject_type, subject_id, counter_key, period_start)
);

CREATE VIRTUAL TABLE search_index USING fts5(
  entity_type UNINDEXED,
  entity_id UNINDEXED,
  title,
  body,
  tags,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE INDEX import_jobs_source_status_idx ON import_jobs(source_id, status, created_at DESC);
CREATE INDEX import_records_job_status_idx ON import_records(import_job_id, status);
CREATE INDEX import_records_external_idx ON import_records(source_id, record_type, external_record_id);
CREATE INDEX import_records_fingerprint_idx ON import_records(record_type, normalized_fingerprint);
CREATE INDEX match_candidates_record_score_idx ON canonical_match_candidates(import_record_id, score DESC);
CREATE INDEX import_errors_job_created_idx ON import_errors(import_job_id, created_at);
CREATE INDEX ai_conversations_user_updated_idx ON ai_conversations(user_id, updated_at DESC);
CREATE INDEX ai_messages_conversation_created_idx ON ai_messages(conversation_id, created_at);
CREATE INDEX ai_tool_calls_conversation_status_idx ON ai_tool_calls(conversation_id, status, created_at);
CREATE INDEX notifications_user_unread_idx ON notifications(user_id, read_at, created_at DESC);
CREATE INDEX audit_events_entity_created_idx ON audit_events(entity_type, entity_id, created_at DESC);
CREATE INDEX audit_events_actor_created_idx ON audit_events(actor_user_id, created_at DESC);
CREATE INDEX rate_limit_events_key_created_idx ON rate_limit_events(key_hash, created_at DESC);
