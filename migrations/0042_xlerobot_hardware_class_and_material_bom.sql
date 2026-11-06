-- 0042: XLeRobot is a hardware robot, not software — classify it correctly and publish its real BOM.
--
-- Root cause of a thin, misleading page. `xlerobot` (github.com/vector-wangel/xlerobot, 5,405 stars)
-- was imported as `project_kind = 'robotics_software'`, so the BOM compiler marked its bill of
-- materials `not_applicable` with the note "This is a software project, so a hardware BOM does not
-- apply". The generated summary/description repeated that ("xlerobot is cataloged as robotics
-- software ... A hardware BOM does not apply because this is a software project.") and the project
-- page rendered the 5,405-star flagship with "BOM lines indexed: 0" and no line items.
--
-- XLeRobot is unambiguously hardware: "XLeRobot: Practical Dual-Arm Mobile Household Robot", a
-- ~$660 build assembled from two SO-101 arms, a wheeled base and off-the-shelf parts. Its upstream
-- documentation publishes a full material list, so the empty BOM was wrong, not merely missing.
--
-- This migration (a) corrects the project kind/category and the false description text and
-- (b) publishes version 2 of the existing BOM `xlerobot-bom-9402d205` with the 19 priced line
-- items plus one fabricated line transcribed from that list.
--
-- Source of every line (primary, fetched 2026-11-06):
--   https://xlerobot.readthedocs.io/en/latest/hardware/getting_started/material.html
--   https://xlerobot.readthedocs.io/en/latest/hardware/getting_started/3d.html
-- Prices are the source's published US unit prices (USD), used verbatim; nothing is inferred. The
-- lines are labelled `probable` (transcribed from the project's own list, not yet matched to
-- supplier catalog identities) and the version is published `partial`, matching the honesty policy
-- used by every other imported BOM. The 3D-printed line is `fabricated` because its cost is
-- excluded from the source estimate.
--
-- Idempotent and guarded: a database without the imported xlerobot catalogue is a no-op rather
-- than an FK failure, and re-running changes nothing.

UPDATE projects
  SET project_kind = 'physical_design',
      robot_category = 'manipulator',
      summary = 'XLeRobot is a low-cost dual-arm mobile household robot built from two SO-101 arms, a wheeled base and off-the-shelf parts. RoboPartPicker catalogs its published bill of materials and source repository files.',
      description = 'XLeRobot is a practical, low-cost dual-arm mobile household robot. This page indexes its published bill of materials — servos, cart, power, electronics and sensors, with the published US unit prices — alongside the repository files RoboPartPicker has actually indexed. The upstream project publishes a basic-build estimate of about $660, excluding 3D printing, tools, shipping and taxes.',
      updated_at = '2026-11-06T06:30:00.000Z'
  WHERE id = '775f659d-6934-4d6a-ba43-3a412f44725b';

INSERT INTO bom_versions
  (id, bom_id, version_label, notes, currency, created_by_user_id, created_at, generation_run_id,
   source_fingerprint, validation_report_json, quote_ready, confirmed_at, publication_state,
   coverage_note, omission_report_json, compiler_version, policy_version)
SELECT
  '5ff3b6e4-59a6-4d0d-9e77-f7e5ad478cc5', '9402d205-17b7-4826-9609-ecebb1dfe42f', '2',
  'Transcribed from the upstream XLeRobot material list (material.html) and 3D printing page.',
  'USD', NULL, '2026-11-06T06:30:00.000Z', NULL, NULL, '{}', 0, NULL, 'partial',
  'Partial: 19 priced line items plus one fabricated line transcribed from the published material list of the upstream XLeRobot documentation (fetched 2026-11-06). Prices are the published US unit prices in USD; they exclude 3D printing, shipping and taxes. Assembly tools are listed as optional lines. Lines are not yet matched to supplier catalog identities.',
  '[]', 'bom-compiler/1', 'bom-publication/1'
WHERE EXISTS (SELECT 1 FROM boms WHERE id = '9402d205-17b7-4826-9609-ecebb1dfe42f')
  AND NOT EXISTS (SELECT 1 FROM bom_versions WHERE bom_id = '9402d205-17b7-4826-9609-ecebb1dfe42f' AND version_label = '2');

INSERT INTO bom_items
  (id, bom_version_id, component_id, slot_key, description, quantity, unit, selected_supplier_offer_id,
   target_unit_price_minor, notes, extraction_method, completeness, evidence_locator, confidence,
   line_classification, included, optional, raw_fields_json, aggregated_locators_json, sort_order)
WITH items(slot_key, description, quantity, price, notes, classification, optional, component_id, evidence, sort_order) AS (VALUES
  ('sts3215-servo',        'STS3215 serial-bus servo (12 V)',          17, 1400,  '17 servos total: 12 for the two arms, 3 for the base, 2 for the head.',              'purchased', 0, 'cmp-63619843a16558bd23755f5c', 'https://xlerobot.readthedocs.io/en/latest/hardware/getting_started/material.html#feature-parts', 0),
  ('ikea-raskog-cart',     'IKEA RASKOG utility cart',                  1, 3999,  'Any similar utility cart can be substituted with minor adjustments to the 3D-printed base connector.', 'purchased', 0, NULL, 'https://xlerobot.readthedocs.io/en/latest/hardware/getting_started/material.html#feature-parts', 1),
  ('anker-solix-c300',     'Anker SOLIX C300 portable power station',   1, 17999, 'Any power bank or station supporting two 60 W+ USB-C PD ports works.',                'purchased', 0, NULL, 'https://xlerobot.readthedocs.io/en/latest/hardware/getting_started/material.html#feature-parts', 2),
  ('omni-wheel-4in',       '4-inch omni wheels',                        3, 999,   'Three wheels for the holonomic base.',                                                'purchased', 0, NULL, 'https://xlerobot.readthedocs.io/en/latest/hardware/getting_started/material.html#feature-parts', 3),
  ('table-clamp-4pc',      'Table clamp set (4 pcs)',                   1, 899,   NULL,                                                                                  'purchased', 0, NULL, 'https://xlerobot.readthedocs.io/en/latest/hardware/getting_started/material.html#feature-parts', 4),
  ('tool-m3-screws',       'M3 screws and nuts set (with L-shape hex driver)', 1, 1499, 'Skip if already owned. 9x M4x10 screws are additionally needed for wheel assembly.', 'optional', 1, NULL, 'https://xlerobot.readthedocs.io/en/latest/hardware/getting_started/material.html#assembly-tools', 5),
  ('tool-flush-cutter',    'Flush cutter',                              1, 699,   'Used to cut the metal mesh for cable routing.',                                       'optional', 1, NULL, 'https://xlerobot.readthedocs.io/en/latest/hardware/getting_started/material.html#assembly-tools', 6),
  ('tool-screwdriver-set', 'Screwdriver set',                           1, 600,   NULL,                                                                                  'optional', 1, NULL, 'https://xlerobot.readthedocs.io/en/latest/hardware/getting_started/material.html#assembly-tools', 7),
  ('raspberry-pi-5',       'Raspberry Pi 5',                            1, 6000,  'Optional: a laptop can drive XLeRobot instead.',                                      'optional', 1, NULL, 'https://xlerobot.readthedocs.io/en/latest/hardware/getting_started/material.html#electronics', 8),
  ('motor-control-board',  'Motor control board',                       2, 1055,  NULL,                                                                                  'purchased', 0, NULL, 'https://xlerobot.readthedocs.io/en/latest/hardware/getting_started/material.html#electronics', 9),
  ('microsd-card',         'microSD card',                              1, 1123,  NULL,                                                                                  'purchased', 0, NULL, 'https://xlerobot.readthedocs.io/en/latest/hardware/getting_started/material.html#electronics', 10),
  ('usbc-to-usba-cable',   'USB-C to USB-A cable (2 pcs)',              1, 899,   'Connects the motor control board to the Raspberry Pi or PC.',                         'purchased', 0, NULL, 'https://xlerobot.readthedocs.io/en/latest/hardware/getting_started/material.html#electronics', 11),
  ('usbc-cable',           'USB-C cable (2 pcs)',                       1, 899,   'One cable connects the Raspberry Pi to the battery.',                                 'purchased', 0, NULL, 'https://xlerobot.readthedocs.io/en/latest/hardware/getting_started/material.html#electronics', 12),
  ('anker-usb-hub',        'Anker USB hub',                             1, 1599,  NULL,                                                                                  'purchased', 0, NULL, 'https://xlerobot.readthedocs.io/en/latest/hardware/getting_started/material.html#electronics', 13),
  ('wires-5264-4ft',       '4 ft 5264 wire (3P-1000 mm + 5264 connector)', 1, 2199, 'Ready-made long 5264 wires are sold as connector kits in the US.',                   'purchased', 0, NULL, 'https://xlerobot.readthedocs.io/en/latest/hardware/getting_started/material.html#electronics', 14),
  ('typec-to-dc-12v',      'USB-C to DC 12 V cable',                    2, 899,   'Connects the motor control board to the power supply.',                               'purchased', 0, NULL, 'https://xlerobot.readthedocs.io/en/latest/hardware/getting_started/material.html#electronics', 15),
  ('hand-camera',          'Hand camera (USB camera)',                  2, 1298,  NULL,                                                                                  'purchased', 0, NULL, 'https://xlerobot.readthedocs.io/en/latest/hardware/getting_started/material.html#sensors', 16),
  ('logitech-c920',        'Logitech C920 webcam',                      1, 6600,  'Head camera for the basic configuration.',                                            'purchased', 0, NULL, 'https://xlerobot.readthedocs.io/en/latest/hardware/getting_started/material.html#sensors', 17),
  ('realsense-d415',       'Intel RealSense D415 depth camera',         1, 27200, 'Listed as Optional for Pro by the source.',                                           'optional', 1, NULL, 'https://xlerobot.readthedocs.io/en/latest/hardware/getting_started/material.html#sensors', 18),
  ('3d-printed-parts',     '3D-printed structural parts (arms, base, head)', 1, NULL, 'Printed from the project files. Printing cost is excluded from the source estimate.', 'fabricated', 0, NULL, 'https://xlerobot.readthedocs.io/en/latest/hardware/getting_started/3d.html', 19)
)
SELECT 'xlerobot-bom2-' || slot_key, '5ff3b6e4-59a6-4d0d-9e77-f7e5ad478cc5', component_id, slot_key,
       description, quantity, 'each', NULL, price, notes, 'source-document', 'probable', evidence, 0.9,
       classification, 1, optional, '{}', '[]', sort_order
FROM items
WHERE EXISTS (SELECT 1 FROM bom_versions WHERE id = '5ff3b6e4-59a6-4d0d-9e77-f7e5ad478cc5')
  AND NOT EXISTS (SELECT 1 FROM bom_items WHERE bom_version_id = '5ff3b6e4-59a6-4d0d-9e77-f7e5ad478cc5');

UPDATE boms
  SET current_version_id = '5ff3b6e4-59a6-4d0d-9e77-f7e5ad478cc5',
      updated_at = '2026-11-06T06:30:00.000Z'
  WHERE id = '9402d205-17b7-4826-9609-ecebb1dfe42f'
    AND EXISTS (SELECT 1 FROM bom_versions WHERE id = '5ff3b6e4-59a6-4d0d-9e77-f7e5ad478cc5');
