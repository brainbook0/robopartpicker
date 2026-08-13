-- IU-BOM-COMPILER: per-line completeness on materialized BOM items.
-- The portable manifest is the compiled source of truth; these columns mirror the
-- same per-line provenance so the BOM API exposes honest completeness without
-- re-deriving it from the manifest.
ALTER TABLE bom_items ADD COLUMN extraction_method TEXT NOT NULL DEFAULT 'explicit-bom';
ALTER TABLE bom_items ADD COLUMN completeness TEXT NOT NULL DEFAULT 'probable';
ALTER TABLE bom_items ADD COLUMN evidence_locator TEXT;
ALTER TABLE bom_items ADD COLUMN confidence REAL;
