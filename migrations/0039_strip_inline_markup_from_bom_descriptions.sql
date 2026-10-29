-- 0039: strip leftover inline Markdown/HTML markup from BOM line descriptions.
--
-- The SO-101 importer kept the source README's footnote markers verbatim. Upstream writes
-- `**<sup>[2](#leaderbundle)</sup>` on the servo rows and `<sup>[1](#myfootnote1)</sup>` on the
-- screwdriver rows; the link target was dropped on import, leaving
-- `STS3215 Servo 7.4V, 1/345 gear (C001) <sup>2</sup>` in bom_items.description. Five rows carry
-- it, all on BOM version e00be3c2-92d9-4898-9c49-963d7d443639 (project `therobotstudio-so-arm100`).
--
-- Every renderer escapes text before output, so those five lines published the literal characters
-- `<sup>2</sup>` to humans (BomItemsDisplay) and to crawlers (`<div id="seo-prerender">` on
-- /projects/therobotstudio-so-arm100, the one page that ranks on page 1 for
-- "so-101 robot arm bill of materials"). A superscript with no footnote to point at carries no
-- information for a reader, so the marker is removed rather than rendered.
--
-- Idempotent: each REPLACE is a no-op once the marker is gone; verified by re-running against a
-- scratch SQLite copy of the five affected rows (2026-10-27).
-- Written as one statement because SQLite's UPDATE ... FROM is newer than the D1 baseline.

UPDATE bom_items
SET description = TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(description, '<sup>1</sup>', ''), '<sup>2</sup>', ''), '<sup>3</sup>', ''), '<sup>4</sup>', ''), '<sup>5</sup>', ''), '<sup>6</sup>', ''), '<sup>7</sup>', ''), '<sup>8</sup>', ''), '<sup>9</sup>', ''), '<sup>', ''), '</sup>', ''), '**', ''), '&nbsp;', ' '), '&amp;', '&'))
WHERE description LIKE '%<sup%'
   OR description LIKE '%</sup>%'
   OR description LIKE '%**%'
   OR description LIKE '%&nbsp;%'
   OR description LIKE '%&amp;%';
