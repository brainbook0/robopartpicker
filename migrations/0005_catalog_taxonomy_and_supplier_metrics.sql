-- Follow-up tables needed to preserve normalized catalog fixture behavior.
CREATE TABLE component_tags (
  component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  tag TEXT NOT NULL COLLATE NOCASE,
  PRIMARY KEY (component_id, tag)
);

CREATE TABLE component_compatibility_tags (
  component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  tag TEXT NOT NULL COLLATE NOCASE,
  PRIMARY KEY (component_id, tag)
);

CREATE TABLE supplier_capabilities (
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  PRIMARY KEY (supplier_id, category)
);

CREATE TABLE supplier_interfaces (
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  interface_name TEXT NOT NULL,
  PRIMARY KEY (supplier_id, interface_name)
);

CREATE TABLE supplier_metrics (
  supplier_id TEXT PRIMARY KEY REFERENCES suppliers(id) ON DELETE CASCADE,
  minimum_order_quantity INTEGER NOT NULL DEFAULT 1 CHECK (minimum_order_quantity > 0),
  typical_lead_days INTEGER NOT NULL DEFAULT 0 CHECK (typical_lead_days >= 0),
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  claimed INTEGER NOT NULL DEFAULT 0 CHECK (claimed IN (0, 1)),
  warranty_label TEXT,
  documentation_score INTEGER NOT NULL DEFAULT 0 CHECK (documentation_score >= 0 AND documentation_score <= 100),
  rating REAL CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
  review_count INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  notes TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX component_tags_tag_idx ON component_tags(tag, component_id);
CREATE INDEX component_compatibility_tag_idx ON component_compatibility_tags(tag, component_id);
CREATE INDEX supplier_capabilities_category_idx ON supplier_capabilities(category, supplier_id);
CREATE INDEX supplier_metrics_docs_idx ON supplier_metrics(documentation_score DESC);
