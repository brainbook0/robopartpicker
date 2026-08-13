-- IU-SOURCING-OPTIMIZER: user sourcing preferences (constraints).
CREATE TABLE sourcing_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
  preferred_supplier_ids TEXT NOT NULL DEFAULT '[]',
  blocked_supplier_ids TEXT NOT NULL DEFAULT '[]',
  region_code TEXT,
  max_delivery_days INTEGER,
  exact_parts_only INTEGER NOT NULL DEFAULT 0 CHECK (exact_parts_only IN (0, 1)),
  allow_substitutes INTEGER NOT NULL DEFAULT 1 CHECK (allow_substitutes IN (0, 1)),
  allow_used INTEGER NOT NULL DEFAULT 0 CHECK (allow_used IN (0, 1)),
  allow_surplus INTEGER NOT NULL DEFAULT 0 CHECK (allow_surplus IN (0, 1)),
  default_objective TEXT NOT NULL DEFAULT 'lowest-cost',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
