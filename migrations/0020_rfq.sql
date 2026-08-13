-- IU-RFQ: firm quote workflow state machine + normalized line items.
CREATE TABLE rfq_requests (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  bom_id TEXT REFERENCES boms(id) ON DELETE SET NULL,
  created_by_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'estimate_ready',
  estimate_snapshot_json TEXT NOT NULL CHECK (json_valid(estimate_snapshot_json)),
  total_estimate_minor INTEGER,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE rfq_line_items (
  id TEXT PRIMARY KEY,
  rfq_request_id TEXT NOT NULL REFERENCES rfq_requests(id) ON DELETE CASCADE,
  bom_item_id TEXT,
  component_id TEXT REFERENCES components(id) ON DELETE SET NULL,
  line_key TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  estimate_unit_price_minor INTEGER,
  quote_unit_price_minor INTEGER,
  quote_currency TEXT,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_sku TEXT,
  lead_time_days INTEGER,
  is_substitute INTEGER NOT NULL DEFAULT 0 CHECK (is_substitute IN (0, 1)),
  is_excluded INTEGER NOT NULL DEFAULT 0 CHECK (is_excluded IN (0, 1)),
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX rfq_requests_status_idx ON rfq_requests(status, updated_at DESC);
CREATE INDEX rfq_line_items_request_idx ON rfq_line_items(rfq_request_id, sort_order);
