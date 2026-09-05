-- Recover public technical profile evidence from retained canonical source URLs,
-- without exposing supplier offers or asserting unverified field-level claims.
INSERT OR IGNORE INTO evidence (
  id, source_type, source_url, title, publisher, retrieved_at, published_at,
  confidence, content_hash, excerpt, file_id, is_demo, created_at
)
SELECT
  'ev-component-source:' || c.id,
  'product_page',
  c.source_url,
  'Canonical product source for ' || c.name,
  m.name,
  COALESCE(c.freshness_at, c.updated_at, c.created_at),
  NULL,
  0.7,
  NULL,
  'Imported catalog source URL. Technical values must be verified against the current linked page.',
  NULL,
  0,
  '2026-08-25T00:00:00.000Z'
FROM components c
LEFT JOIN manufacturers m ON m.id = c.manufacturer_id
WHERE c.deleted_at IS NULL
  AND c.is_demo = 0
  AND c.source_url IS NOT NULL
  AND trim(c.source_url) <> '';

INSERT OR IGNORE INTO evidence_claims (
  id, evidence_id, entity_type, entity_id, claim_key, claim_value, unit,
  confidence, created_at
)
SELECT
  'ec-component-source:' || c.id,
  'ev-component-source:' || c.id,
  'component',
  c.id,
  'product_source',
  c.source_url,
  NULL,
  0.7,
  '2026-08-25T00:00:00.000Z'
FROM components c
WHERE c.deleted_at IS NULL
  AND c.is_demo = 0
  AND c.source_url IS NOT NULL
  AND trim(c.source_url) <> '';

-- Adafruit's retained CDN image names use
--   <32-hex-download-id>-<numeric-product-id>-<image-sequence>.<ext>
-- and canonical component sources use https://www.adafruit.com/product/<id>.
-- The join below rejects non-numeric IDs and never falls back to fuzzy names.
WITH image_tokens AS (
  SELECT
    f.id AS file_id,
    substr(f.original_name, 34, instr(substr(f.original_name, 34), '-') - 1) AS product_id,
    CAST(substr(substr(f.original_name, 34), instr(substr(f.original_name, 34), '-') + 1) AS INTEGER) AS image_sequence
  FROM files f
  WHERE f.status = 'ready'
    AND f.deleted_at IS NULL
    AND f.visibility = 'public'
    AND f.media_type LIKE 'image/%'
    AND length(f.original_name) > 36
    AND substr(f.original_name, 33, 1) = '-'
    AND substr(f.original_name, 1, 32) NOT GLOB '*[^0-9a-f]*'
    AND instr(substr(f.original_name, 34), '-') > 1
),
validated_images AS (
  SELECT file_id, product_id, image_sequence
  FROM image_tokens
  WHERE product_id <> ''
    AND product_id NOT GLOB '*[^0-9]*'
)
INSERT OR IGNORE INTO component_files (
  component_id, component_revision_id, file_id, purpose, sort_order, created_at
)
SELECT
  c.id,
  NULL,
  vi.file_id,
  'image',
  vi.image_sequence,
  '2026-08-25T00:00:00.000Z'
FROM validated_images vi
JOIN components c
  ON rtrim(c.source_url, '/') = 'https://www.adafruit.com/product/' || vi.product_id
WHERE c.deleted_at IS NULL
  AND c.is_demo = 0;
