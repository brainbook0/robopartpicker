-- Private customer quotation intake and moderated structured project proposals.
-- Customer PII is never selected by public catalog routes and expires by retention policy.

CREATE TABLE customer_quote_requests (
  id TEXT PRIMARY KEY,
  requester_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  bom_id TEXT REFERENCES boms(id) ON DELETE SET NULL,
  bom_version_id TEXT REFERENCES bom_versions(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL CHECK (length(trim(first_name)) BETWEEN 1 AND 100),
  last_name TEXT NOT NULL CHECK (length(trim(last_name)) BETWEEN 1 AND 100),
  email TEXT NOT NULL CHECK (length(trim(email)) BETWEEN 3 AND 254),
  phone TEXT CHECK (phone IS NULL OR length(trim(phone)) BETWEEN 3 AND 40),
  address_line1 TEXT NOT NULL CHECK (length(trim(address_line1)) BETWEEN 1 AND 200),
  address_line2 TEXT CHECK (address_line2 IS NULL OR length(trim(address_line2)) <= 200),
  city TEXT NOT NULL CHECK (length(trim(city)) BETWEEN 1 AND 120),
  region TEXT NOT NULL CHECK (length(trim(region)) BETWEEN 1 AND 120),
  postal_code TEXT NOT NULL CHECK (length(trim(postal_code)) BETWEEN 1 AND 32),
  country_code TEXT NOT NULL CHECK (length(country_code) = 2 AND country_code = upper(country_code)),
  delivery_notes TEXT CHECK (delivery_notes IS NULL OR length(delivery_notes) <= 2000),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  materials_estimate_minor INTEGER NOT NULL CHECK (materials_estimate_minor >= 0),
  shipping_estimate_minor INTEGER NOT NULL CHECK (shipping_estimate_minor >= 0),
  shipping_method_version TEXT NOT NULL,
  shipping_confidence TEXT NOT NULL CHECK (shipping_confidence IN ('high', 'medium', 'low')),
  estimate_snapshot_json TEXT NOT NULL CHECK (json_valid(estimate_snapshot_json)),
  consent_at TEXT NOT NULL,
  retention_expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewing', 'quoted', 'closed', 'deleted')),
  reviewed_at TEXT,
  quoted_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (project_id IS NOT NULL OR bom_id IS NOT NULL),
  CHECK (bom_version_id IS NULL OR bom_id IS NOT NULL),
  CHECK (retention_expires_at > created_at)
);

CREATE INDEX idx_customer_quote_requests_requester_created
  ON customer_quote_requests(requester_user_id, created_at DESC);
CREATE INDEX idx_customer_quote_requests_status_created
  ON customer_quote_requests(status, created_at);
CREATE INDEX idx_customer_quote_requests_retention
  ON customer_quote_requests(retention_expires_at)
  WHERE status NOT IN ('deleted', 'closed');
CREATE INDEX idx_customer_quote_requests_project
  ON customer_quote_requests(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE TABLE project_change_proposals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  proposal_type TEXT NOT NULL CHECK (proposal_type IN (
    'assembly_step', 'assembly_video', 'integration', 'source',
    'identity_correction', 'bom_correction', 'issue_report'
  )),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND length(payload_json) <= 50000),
  source_urls_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(source_urls_json) AND length(source_urls_json) <= 12000),
  rationale TEXT NOT NULL CHECK (length(trim(rationale)) BETWEEN 10 AND 4000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  reviewed_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  review_note TEXT CHECK (review_note IS NULL OR length(review_note) <= 4000),
  resulting_project_version_id TEXT REFERENCES project_versions(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_at TEXT,
  CHECK (
    (status = 'pending' AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL AND resulting_project_version_id IS NULL)
    OR (status = 'withdrawn' AND resulting_project_version_id IS NULL)
    OR (status IN ('approved', 'rejected') AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CHECK (status <> 'rejected' OR resulting_project_version_id IS NULL)
);

CREATE INDEX idx_project_change_proposals_project_status
  ON project_change_proposals(project_id, status, created_at DESC);
CREATE INDEX idx_project_change_proposals_author
  ON project_change_proposals(author_user_id, created_at DESC);
CREATE INDEX idx_project_change_proposals_review_queue
  ON project_change_proposals(status, created_at)
  WHERE status = 'pending';

-- Hardening for migration 0028 without rewriting applied migration history.
CREATE TRIGGER project_price_estimates_usd_insert
BEFORE INSERT ON project_price_estimates
WHEN NEW.currency <> 'USD'
BEGIN
  SELECT RAISE(ABORT, 'project price estimates must use USD');
END;

CREATE TRIGGER project_price_estimates_usd_update
BEFORE UPDATE OF currency ON project_price_estimates
WHEN NEW.currency <> 'USD'
BEGIN
  SELECT RAISE(ABORT, 'project price estimates must use USD');
END;

CREATE TRIGGER project_trend_snapshots_top300_insert
BEFORE INSERT ON project_trend_snapshots
WHEN NEW.rank < 1 OR NEW.rank > 300
BEGIN
  SELECT RAISE(ABORT, 'project trend rank must be between 1 and 300');
END;

CREATE TRIGGER project_trend_snapshots_top300_update
BEFORE UPDATE OF rank ON project_trend_snapshots
WHEN NEW.rank < 1 OR NEW.rank > 300
BEGIN
  SELECT RAISE(ABORT, 'project trend rank must be between 1 and 300');
END;
