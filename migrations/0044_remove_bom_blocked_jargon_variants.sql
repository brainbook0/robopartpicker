-- 0044: Finish removing the internal-jargon "BOM generation ... blocked until the project is
-- classified" line. 0043 replaced the one exact sentence variant; the import template rotates the
-- verb ("remains/stays/is currently/is blocked") and sometimes joins it to the preceding sentence
-- with ", and", so ~111 pages still carried a variant (fetched and enumerated 2026-11-12).
--
-- Two ordered passes, both exact-substring and idempotent:
--   (a) normalise the ", and <BOM clause>" join into a new sentence, so the rewrite in (b) never
--       yields "…, and No bill of materials…";
--   (b) replace each remaining clause variant with an honest, visitor-readable line.
-- Row-guarded by an instr() test for the shared phrase, so a database without these rows (or an
-- already-migrated one) is a no-op.

-- (a) Prefix normalisation: split the joined sentence at ", and".
UPDATE projects SET description = REPLACE(description, ', and' || char(10) || char(10) || 'Hardware BOM generation', '.' || char(10) || char(10) || 'Hardware BOM generation'),
    updated_at = '2026-11-12T02:30:00.000Z'
  WHERE instr(description, ', and' || char(10) || char(10) || 'Hardware BOM generation') > 0;
UPDATE projects SET description = REPLACE(description, ', and Hardware BOM generation', '. Hardware BOM generation'),
    updated_at = '2026-11-12T02:30:00.000Z'
  WHERE instr(description, ', and Hardware BOM generation') > 0;
UPDATE projects SET description = REPLACE(description, ', and BOM generation', '. BOM generation'),
    updated_at = '2026-11-12T02:30:00.000Z'
  WHERE instr(description, ', and BOM generation') > 0;

-- (b) Replace each clause variant with the honest line.
UPDATE projects SET updated_at = '2026-11-12T02:30:00.000Z',
    description = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        description,
    'Hardware BOM generation remains blocked until the project is classified.',        'No bill of materials has been published for this project yet.'),
    'Hardware BOM generation stays blocked until the project is classified.',          'No bill of materials has been published for this project yet.'),
    'Hardware BOM generation is currently blocked until the project is classified.',   'No bill of materials has been published for this project yet.'),
    'Hardware BOM generation is blocked until the project is classified.',             'No bill of materials has been published for this project yet.'),
    'Hardware BOM generation for this project is currently blocked until the project is classified.', 'No bill of materials has been published for this project yet.')
  WHERE instr(lower(description), 'blocked until the project is classified') > 0;

UPDATE projects SET updated_at = '2026-11-12T02:30:00.000Z',
    description = REPLACE(REPLACE(REPLACE(REPLACE(
        description,
    'hardware BOM generation is blocked until the project is classified.',  'no bill of materials has been published for this project.'),
    'BOM generation for this project is currently blocked until the project is classified.', 'No bill of materials has been published for this project yet.'),
    'BOM generation is blocked until the project is classified.',          'No bill of materials has been published for this project yet.'),
    'Hardware BOM generation is blocked until the project is classified',  'No bill of materials has been published for this project')
  WHERE instr(lower(description), 'blocked until the project is classified') > 0;
