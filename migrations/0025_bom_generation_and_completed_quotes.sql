-- BOM-first release: generation staging, confirmation metadata, and completed quote email delivery.

CREATE TABLE bom_generation_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  bom_id TEXT REFERENCES boms(id) ON DELETE SET NULL,
  source_revision TEXT,
  source_fingerprint TEXT NOT NULL,
  adapter_versions_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(adapter_versions_json)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready_for_confirmation', 'confirmed', 'failed', 'superseded')),
  file_count INTEGER NOT NULL DEFAULT 0 CHECK (file_count >= 0),
  objects_seen INTEGER NOT NULL DEFAULT 0 CHECK (objects_seen >= 0),
  candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  warning_count INTEGER NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
  error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  report_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(report_json)),
  created_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE bom_candidate_lines (
  id TEXT PRIMARY KEY,
  generation_run_id TEXT NOT NULL REFERENCES bom_generation_runs(id) ON DELETE CASCADE,
  artifact_id TEXT,
  source_locator TEXT NOT NULL,
  extraction_method TEXT NOT NULL,
  raw_fields_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(raw_fields_json)),
  raw_name TEXT NOT NULL,
  raw_quantity TEXT,
  raw_unit TEXT,
  raw_manufacturer TEXT,
  raw_mpn TEXT,
  raw_sku TEXT,
  normalized_name TEXT NOT NULL,
  normalized_quantity REAL,
  normalized_unit TEXT,
  normalized_manufacturer TEXT,
  normalized_mpn TEXT,
  normalized_sku TEXT,
  classification TEXT NOT NULL DEFAULT 'unresolved' CHECK (classification IN ('purchased', 'fabricated', 'optional', 'non-procurement', 'unresolved')),
  inclusion_state TEXT NOT NULL DEFAULT 'included' CHECK (inclusion_state IN ('included', 'excluded')),
  aggregation_key TEXT,
  aggregated_locators_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(aggregated_locators_json)),
  validation_errors_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(validation_errors_json)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE bom_versions ADD COLUMN generation_run_id TEXT REFERENCES bom_generation_runs(id) ON DELETE SET NULL;
ALTER TABLE bom_versions ADD COLUMN source_fingerprint TEXT;
ALTER TABLE bom_versions ADD COLUMN validation_report_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(validation_report_json));
ALTER TABLE bom_versions ADD COLUMN quote_ready INTEGER NOT NULL DEFAULT 0 CHECK (quote_ready IN (0, 1));
ALTER TABLE bom_versions ADD COLUMN confirmed_at TEXT;

ALTER TABLE bom_items ADD COLUMN line_classification TEXT NOT NULL DEFAULT 'purchased' CHECK (line_classification IN ('purchased', 'fabricated', 'optional', 'non-procurement', 'unresolved'));
ALTER TABLE bom_items ADD COLUMN included INTEGER NOT NULL DEFAULT 1 CHECK (included IN (0, 1));
ALTER TABLE bom_items ADD COLUMN optional INTEGER NOT NULL DEFAULT 0 CHECK (optional IN (0, 1));
ALTER TABLE bom_items ADD COLUMN raw_fields_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(raw_fields_json));
ALTER TABLE bom_items ADD COLUMN aggregated_locators_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(aggregated_locators_json));

CREATE TABLE quote_email_drafts (
  id TEXT PRIMARY KEY,
  bom_id TEXT NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
  bom_version_id TEXT NOT NULL REFERENCES bom_versions(id) ON DELETE RESTRICT,
  created_by_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  draft_version INTEGER NOT NULL DEFAULT 1 CHECK (draft_version > 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  subtotal_minor INTEGER NOT NULL CHECK (subtotal_minor > 0),
  shipping_tax_excluded INTEGER NOT NULL DEFAULT 1 CHECK (shipping_tax_excluded = 1),
  recipients_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(recipients_json)),
  introduction TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT NOT NULL,
  pricing_snapshot_json TEXT NOT NULL CHECK (json_valid(pricing_snapshot_json)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent', 'partial_failed', 'failed', 'invalidated')),
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE quote_email_deliveries (
  id TEXT PRIMARY KEY,
  quote_email_draft_id TEXT NOT NULL REFERENCES quote_email_drafts(id) ON DELETE CASCADE,
  recipient TEXT NOT NULL COLLATE NOCASE,
  recipient_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  provider_message_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (quote_email_draft_id, recipient)
);

CREATE INDEX bom_generation_runs_project_idx ON bom_generation_runs(project_id, created_at DESC);
CREATE INDEX bom_candidate_lines_run_sort_idx ON bom_candidate_lines(generation_run_id, sort_order);
CREATE INDEX quote_email_drafts_user_idx ON quote_email_drafts(created_by_user_id, created_at DESC);
CREATE INDEX quote_email_deliveries_draft_idx ON quote_email_deliveries(quote_email_draft_id, status);
