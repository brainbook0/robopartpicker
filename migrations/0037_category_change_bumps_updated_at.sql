-- 0037: keep `updated_at` honest when a component's category changes.
--
-- A component page's canonical URL is /parts/<category>/<slug>, so changing `category` changes the
-- URL and the content that URL serves. 0034 and 0035 (which moved 177 components on 2026-10-22)
-- set `updated_at` explicitly for that reason. 0036 (which moved the head-noun class on 2026-10-23)
-- did not, so those rows kept an August `updated_at`: sitemap.xml advertised URLs whose canonical
-- path had just changed with a months-old <lastmod>. Measured 2026-10-24 on the live sitemap:
-- 141 entries carried 2026-10-22 (the 0034/0035 rows) and 0 carried 2026-10-23.
--
-- The rows moved by 0036 cannot be back-filled per id: its id lists do not exist in any live
-- database. Verified 2026-10-24 against production D1 (robopartpicker-production), the preview
-- database, staging_components and robot_component_candidates: 0 of the 933 ids listed in 0036
-- match a row, and no live component id shares their 8-hex slug suffix. The file holds 85
-- statements / 933 ids while the run log claims 1,011 accepted rows, and `d1_migrations` has no
-- 0036 record, so the file is not the artifact that produced the live state. The live state itself
-- is correct and was verified independently of the file: re-running the guarded classifier over a
-- full production dump on 2026-10-24 gives accepted = 0, rejected_ambiguous = 113 — every change
-- 0036 could still make is applied, and the 113 remaining are the documented ambiguous rejects.
--
-- So this migration does not re-stamp those rows (a guessed date would be a dishonest <lastmod>)
-- and does not rewrite 0036 (applied migrations are immutable). It closes the mechanism instead:
-- any UPDATE that moves `category` bumps `updated_at` in the same statement, so no future
-- migration, script or manual fix can leave sitemap.xml claiming a stale date for a page whose
-- canonical URL just changed.
--
-- Follow-up worth doing (recorded, not done here): regenerate 0036's intent as an
-- environment-independent, name-guarded statement set, so a fresh database converges to the same
-- categories the live one holds. That needs the guarded classifier's per-row decisions, not ids.
CREATE TRIGGER IF NOT EXISTS components_category_change_bumps_updated_at
AFTER UPDATE OF category ON components
WHEN NEW.category <> OLD.category
BEGIN
  UPDATE components SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
END;
