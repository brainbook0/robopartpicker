-- RoboPartPicker BOM display honesty: label auto-generated artifact BOMs.
-- Applied to the preview D1 on 2026-08-11 (56 BOMs).
-- These BOMs are auto-generated demo/artifact placeholders whose items are repo
-- config/package files (component_id IS NULL) rather than priced component parts.
-- They already carry is_demo=1 and the list endpoint returns dataMode="demo";
-- this makes the label explicit in the BOM's own name so the site is honest
-- about what these BOMs are (an artifact index, not a priced parts list).

BEGIN;
UPDATE boms
SET name = CASE
      WHEN instr(name, 'auto-generated artifact list') > 0 THEN name
      ELSE substr(name, 1, 60) || ' (auto-generated artifact list)'
    END,
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE is_demo = 1
  AND instr(name, 'artifact list') = 0;
COMMIT;

-- Verify:
-- SELECT is_demo, count(*) FROM boms GROUP BY is_demo;
-- GET /api/v1/boms  -> names carry '(auto-generated artifact list)'