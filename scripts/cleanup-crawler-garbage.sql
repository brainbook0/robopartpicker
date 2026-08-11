-- RoboPartPicker data hygiene: remove crawler-garbage components.
-- Applied to the preview D1 on 2026-08-11 (203 components soft-deleted).
-- Idempotent: only touches rows whose name matches JS/template-literal corruption
-- (crawler captured URL-encoded template fragments like '$%7B$($btn).attr(' as product names).
--
-- These rows carry ~no specs/offers and chrome-only image refs, so hiding them
-- removes fake products from search without losing real catalog data.
--
-- NOTE: components.lifecycle_status has a CHECK constraint ('active','limited',
-- 'obsolete','prototype','unknown'), so clean-up uses deleted_at only.

-- 0) review what matches first
-- SELECT count(*) FROM components
--   WHERE name LIKE '%$%7B%' OR name LIKE '%$(%' OR name LIKE '%{$%'
--      OR name LIKE '%(%{%' OR name LIKE '%{%}';

BEGIN;

-- 1) detach image/file references for the garbage components
DELETE FROM component_files
WHERE component_id IN (
  SELECT id FROM components
  WHERE name LIKE '%$%7B%' OR name LIKE '%$(%' OR name LIKE '%{$%'
     OR name LIKE '%(%{%' OR name LIKE '%{%}'
);

-- 2) soft-delete the garbage components
UPDATE components
SET deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE (name LIKE '%$%7B%' OR name LIKE '%$(%' OR name LIKE '%{$%'
    OR name LIKE '%(%{%' OR name LIKE '%{%}')
  AND deleted_at IS NULL;

COMMIT;

-- after: SELECT count(*) FROM components WHERE deleted_at IS NULL;