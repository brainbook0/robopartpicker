-- Normalized project profiles: specifications, price estimates, and trend snapshots.
-- All values are evidence-backed; no runtime-supplied data is asserted as ground truth.

-- ---------------------------------------------------------------------------
-- 1. project_specs – structured key/value specifications for projects
-- ---------------------------------------------------------------------------
CREATE TABLE project_specs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  spec_key TEXT NOT NULL,
  label TEXT NOT NULL,
  value_text TEXT,
  value_number REAL,
  unit TEXT,
  confidence REAL NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  observed_at TEXT NOT NULL,
  evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (value_text IS NOT NULL OR value_number IS NOT NULL)
);

-- Partial unique: at most one current spec per project+key
CREATE UNIQUE INDEX project_specs_current_unique_idx
  ON project_specs(project_id, spec_key) WHERE is_current = 1;

-- Lookup / ordering indexes
CREATE INDEX idx_project_specs_project_current_sort
  ON project_specs(project_id, is_current, sort_order);
CREATE INDEX idx_project_specs_key_value
  ON project_specs(spec_key, value_number);

-- ---------------------------------------------------------------------------
-- 2. project_price_estimates – time-bounded price estimates with confidence
-- ---------------------------------------------------------------------------
CREATE TABLE project_price_estimates (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  estimate_type TEXT NOT NULL CHECK (
    estimate_type IN ('published_price', 'published_range', 'market_estimate')
  ),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (length(currency) = 3),
  min_minor INTEGER NOT NULL CHECK (min_minor >= 0),
  max_minor INTEGER NOT NULL CHECK (max_minor >= 0),
  representative_minor INTEGER CHECK (
    representative_minor IS NULL
    OR (representative_minor >= min_minor AND representative_minor <= max_minor)
  ),
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  method_version TEXT NOT NULL,
  summary TEXT,
  valued_at TEXT NOT NULL,
  expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'superseded', 'withdrawn')
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (min_minor <= max_minor)
);

-- Partial unique: at most one active estimate per project
CREATE UNIQUE INDEX project_price_estimates_active_unique_idx
  ON project_price_estimates(project_id) WHERE status = 'active';

-- Project-scoped ordered scans and expiry pruning
CREATE INDEX idx_project_price_estimates_project_status_valued
  ON project_price_estimates(project_id, status, valued_at);
CREATE INDEX idx_project_price_estimates_expiry
  ON project_price_estimates(expires_at) WHERE expires_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. project_trend_snapshots – periodic composite trend signals
-- ---------------------------------------------------------------------------
CREATE TABLE project_trend_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  methodology_version TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  search_score INTEGER NOT NULL CHECK (search_score >= 0 AND search_score <= 100),
  news_score INTEGER NOT NULL CHECK (news_score >= 0 AND news_score <= 100),
  video_score INTEGER NOT NULL CHECK (video_score >= 0 AND video_score <= 100),
  official_score INTEGER NOT NULL CHECK (official_score >= 0 AND official_score <= 100),
  first_party_traffic_score INTEGER CHECK (
    first_party_traffic_score IS NULL
    OR (first_party_traffic_score >= 0 AND first_party_traffic_score <= 100)
  ),
  traffic_sample_sufficient INTEGER NOT NULL DEFAULT 0 CHECK (
    traffic_sample_sufficient IN (0, 1)
    AND (traffic_sample_sufficient = 0 OR first_party_traffic_score IS NOT NULL)
  ),
  composite_score INTEGER NOT NULL CHECK (
    composite_score >= 0 AND composite_score <= 100
  ),
  rank INTEGER NOT NULL CHECK (rank > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  captured_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (window_start < window_end)
);

-- Deterministic dedup per version+window
CREATE UNIQUE INDEX project_trend_snapshots_version_window_project
  ON project_trend_snapshots(methodology_version, window_end, project_id);
CREATE UNIQUE INDEX project_trend_snapshots_version_window_rank
  ON project_trend_snapshots(methodology_version, window_end, rank);

-- At most one active snapshot per project; at most one active rank globally
CREATE UNIQUE INDEX project_trend_snapshots_active_project
  ON project_trend_snapshots(project_id) WHERE active = 1;
CREATE UNIQUE INDEX project_trend_snapshots_active_rank
  ON project_trend_snapshots(rank) WHERE active = 1;

-- Active leaderboard and per-project history scans
CREATE INDEX idx_project_trend_snapshots_active_rank
  ON project_trend_snapshots(active, rank);
CREATE INDEX idx_project_trend_snapshots_project_history
  ON project_trend_snapshots(project_id, window_end);