CREATE TABLE manufacturers (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  website_url TEXT,
  headquarters_region TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'unverified')),
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  website_url TEXT,
  description TEXT,
  documentation_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'unverified')),
  freshness_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE supplier_regions (
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  region_code TEXT NOT NULL,
  local_currency TEXT CHECK (local_currency IS NULL OR length(local_currency) = 3),
  ships_from INTEGER NOT NULL DEFAULT 0 CHECK (ships_from IN (0, 1)),
  ships_to INTEGER NOT NULL DEFAULT 1 CHECK (ships_to IN (0, 1)),
  PRIMARY KEY (supplier_id, region_code)
);

CREATE TABLE components (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  manufacturer_id TEXT REFERENCES manufacturers(id) ON DELETE SET NULL,
  manufacturer_part_number TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  summary TEXT,
  lifecycle_status TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle_status IN ('active', 'limited', 'obsolete', 'prototype', 'unknown')),
  primary_region TEXT,
  source_url TEXT,
  provenance_label TEXT NOT NULL DEFAULT 'unverified',
  freshness_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (manufacturer_id, manufacturer_part_number)
);

CREATE TABLE component_revisions (
  id TEXT PRIMARY KEY,
  component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  revision_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'superseded')),
  notes TEXT,
  effective_at TEXT,
  created_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  UNIQUE (component_id, revision_label)
);

CREATE TABLE component_specs (
  id TEXT PRIMARY KEY,
  component_revision_id TEXT NOT NULL REFERENCES component_revisions(id) ON DELETE CASCADE,
  spec_key TEXT NOT NULL,
  label TEXT NOT NULL,
  value_text TEXT,
  value_number REAL,
  unit TEXT,
  normalized_value REAL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (component_revision_id, spec_key),
  CHECK (value_text IS NOT NULL OR value_number IS NOT NULL)
);

CREATE TABLE component_files (
  component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  component_revision_id TEXT REFERENCES component_revisions(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('image', 'datasheet', 'cad', 'drawing', 'firmware', 'document', 'other')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (component_id, file_id)
);

CREATE TABLE supplier_offers (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  supplier_sku TEXT,
  product_url TEXT,
  region_code TEXT,
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  minimum_quantity INTEGER NOT NULL DEFAULT 1 CHECK (minimum_quantity > 0),
  stock_quantity INTEGER CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  lead_time_days INTEGER CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
  availability TEXT NOT NULL DEFAULT 'unknown' CHECK (availability IN ('in_stock', 'limited', 'backorder', 'preorder', 'out_of_stock', 'unknown')),
  observed_at TEXT NOT NULL,
  expires_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (supplier_id, component_id, supplier_sku, region_code)
);

CREATE TABLE offer_price_history (
  id TEXT PRIMARY KEY,
  supplier_offer_id TEXT NOT NULL REFERENCES supplier_offers(id) ON DELETE CASCADE,
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  stock_quantity INTEGER CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  observed_at TEXT NOT NULL,
  source_import_record_id TEXT
);

CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_url TEXT,
  title TEXT NOT NULL,
  publisher TEXT,
  retrieved_at TEXT NOT NULL,
  published_at TEXT,
  confidence REAL NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  content_hash TEXT,
  excerpt TEXT,
  file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE evidence_claims (
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  claim_key TEXT NOT NULL,
  claim_value TEXT NOT NULL,
  unit TEXT,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at TEXT NOT NULL
);

CREATE TABLE data_conflicts (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  left_evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  right_evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution_notes TEXT,
  resolved_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE integrations (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  integration_type TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'unverified' CHECK (status IN ('verified', 'reported', 'unverified', 'incompatible')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE integration_entities (
  integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  role TEXT NOT NULL,
  notes TEXT,
  PRIMARY KEY (integration_id, entity_type, entity_id)
);

CREATE TABLE component_alternatives (
  component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  alternative_component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL CHECK (relationship IN ('candidate', 'similar', 'reported_substitute', 'incompatible')),
  compatibility_notes TEXT,
  evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  confidence REAL NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  created_at TEXT NOT NULL,
  PRIMARY KEY (component_id, alternative_component_id),
  CHECK (component_id <> alternative_component_id)
);

CREATE TABLE saved_components (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, component_id)
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  summary TEXT,
  description TEXT,
  owner_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'organization', 'unlisted', 'public')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
  current_version_id TEXT,
  license_spdx TEXT,
  repository_url TEXT,
  difficulty TEXT,
  estimated_cost_minor INTEGER CHECK (estimated_cost_minor IS NULL OR estimated_cost_minor >= 0),
  estimated_cost_currency TEXT CHECK (estimated_cost_currency IS NULL OR length(estimated_cost_currency) = 3),
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (owner_user_id IS NOT NULL OR organization_id IS NOT NULL OR is_demo = 1)
);

CREATE TABLE project_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_label TEXT NOT NULL,
  rpps_schema_version TEXT NOT NULL,
  changelog TEXT,
  rpps_json TEXT NOT NULL CHECK (json_valid(rpps_json)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'superseded')),
  created_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  published_at TEXT,
  UNIQUE (project_id, version_label)
);

CREATE TABLE project_maintainers (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'maintainer', 'reviewer')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE project_files (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_version_id TEXT REFERENCES project_versions(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  relative_path TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, file_id)
);

CREATE TABLE project_media (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  caption TEXT,
  alt_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE project_requirements (
  id TEXT PRIMARY KEY,
  project_version_id TEXT NOT NULL REFERENCES project_versions(id) ON DELETE CASCADE,
  requirement_type TEXT NOT NULL,
  label TEXT NOT NULL,
  value_text TEXT,
  required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE project_steps (
  id TEXT PRIMARY KEY,
  project_version_id TEXT NOT NULL REFERENCES project_versions(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),
  UNIQUE (project_version_id, step_key)
);

CREATE TABLE project_known_issues (
  id TEXT PRIMARY KEY,
  project_version_id TEXT NOT NULL REFERENCES project_versions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  workaround TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'mitigated', 'resolved')),
  evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE boms (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  slug TEXT,
  name TEXT NOT NULL,
  current_version_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'organization', 'unlisted', 'public')),
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (project_id IS NOT NULL OR owner_user_id IS NOT NULL OR organization_id IS NOT NULL OR is_demo = 1),
  UNIQUE (owner_user_id, slug)
);

CREATE TABLE bom_versions (
  id TEXT PRIMARY KEY,
  bom_id TEXT NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
  version_label TEXT NOT NULL,
  notes TEXT,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (length(currency) = 3),
  created_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  UNIQUE (bom_id, version_label)
);

CREATE TABLE bom_items (
  id TEXT PRIMARY KEY,
  bom_version_id TEXT NOT NULL REFERENCES bom_versions(id) ON DELETE CASCADE,
  component_id TEXT REFERENCES components(id) ON DELETE SET NULL,
  slot_key TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT 'each',
  selected_supplier_offer_id TEXT REFERENCES supplier_offers(id) ON DELETE SET NULL,
  target_unit_price_minor INTEGER CHECK (target_unit_price_minor IS NULL OR target_unit_price_minor >= 0),
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (bom_version_id, slot_key)
);

CREATE TABLE bom_item_alternatives (
  bom_item_id TEXT NOT NULL REFERENCES bom_items(id) ON DELETE CASCADE,
  component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  PRIMARY KEY (bom_item_id, component_id)
);

CREATE INDEX components_category_name_idx ON components(category, name);
CREATE INDEX components_manufacturer_idx ON components(manufacturer_id, category);
CREATE INDEX components_freshness_idx ON components(freshness_at DESC);
CREATE INDEX component_specs_key_number_idx ON component_specs(spec_key, normalized_value);
CREATE INDEX supplier_offers_component_region_price_idx ON supplier_offers(component_id, region_code, unit_price_minor);
CREATE INDEX supplier_offers_supplier_observed_idx ON supplier_offers(supplier_id, observed_at DESC);
CREATE INDEX offer_price_history_offer_observed_idx ON offer_price_history(supplier_offer_id, observed_at DESC);
CREATE INDEX evidence_claims_entity_idx ON evidence_claims(entity_type, entity_id, claim_key);
CREATE INDEX integrations_type_status_idx ON integrations(integration_type, status);
CREATE INDEX projects_visibility_status_updated_idx ON projects(visibility, status, updated_at DESC);
CREATE INDEX projects_owner_updated_idx ON projects(owner_user_id, updated_at DESC);
CREATE INDEX projects_org_updated_idx ON projects(organization_id, updated_at DESC);
CREATE INDEX project_versions_project_created_idx ON project_versions(project_id, created_at DESC);
CREATE INDEX boms_project_idx ON boms(project_id, updated_at DESC);
CREATE INDEX boms_owner_idx ON boms(owner_user_id, updated_at DESC);
CREATE INDEX bom_items_version_sort_idx ON bom_items(bom_version_id, sort_order);
