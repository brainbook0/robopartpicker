-- Give the Waveshare/Feetech ST3215 serial-bus servo a published, source-backed specification set.
--
-- Root cause: the component `cmp-63619843a16558bd23755f5c` (slug `ws-st3215-servo`) was imported
-- with no `component_revisions` row at all. `worker/services/seo.ts` builds the part page's
-- "Source specifications" section from `component_specs JOIN component_revisions`, so the page
-- rendered the literal stub "No structured source specifications have been published for this
-- component yet." and the substance rule that governs `sitemap.xml` (source spec OR observed
-- price OR published-project usage) excluded it — the page existed but was never advertised.
--
-- The ST3215 is not a niche part: it is the servo specified by TheRobotStudio/SO-ARM100 (SO-100 /
-- SO-101) leader and follower arms and by a long list of other builds, so a stub page for it is a
-- real gap in the catalogue.
--
-- Values are transcribed from primary sources only:
--   * Waveshare "ST3215 Servo" product wiki (specifications block), fetched 2026-11-04:
--     https://www.waveshare.com/wiki/ST3215_Servo
--   * TheRobotStudio/SO-ARM100 README gearing table (gear-ratio variants C001/C044/C046), the same
--     source the SO-101 project page cites.
-- Nothing is inferred: no weight, no torque-at-6V, no price is invented here.
--
-- Guarded with WHERE EXISTS so a local/CI database that does not carry the imported catalogue
-- is a no-op rather than an FK failure; the statement is still deterministic where the row exists.

UPDATE components
  SET updated_at = '2026-11-04T17:00:00.000Z'
  WHERE id = 'cmp-63619843a16558bd23755f5c';

INSERT INTO component_revisions (id, component_id, revision_label, status, notes, effective_at, created_at)
SELECT 'cmp-63619843a16558bd23755f5c-rev-st3215-specs', 'cmp-63619843a16558bd23755f5c', 'st3215-specs-2026-11', 'published',
       'Specifications transcribed from the Waveshare ST3215 Servo product wiki and the TheRobotStudio/SO-ARM100 gearing table.',
       '2026-11-04T00:00:00.000Z', '2026-11-04T17:00:00.000Z'
WHERE EXISTS (SELECT 1 FROM components WHERE id = 'cmp-63619843a16558bd23755f5c')
  AND NOT EXISTS (SELECT 1 FROM component_revisions WHERE id = 'cmp-63619843a16558bd23755f5c-rev-st3215-specs');

INSERT INTO component_specs (id, component_revision_id, spec_key, label, value_text, value_number, unit, normalized_value, sort_order, created_at)
WITH specs(id, spec_key, label, value_text, unit, sort_order) AS (VALUES
  ('st3215-spec-input_voltage',         'input_voltage',         'Input voltage',           '6-12.6 V',                                     NULL,  0),
  ('st3215-spec-stall_torque',          'stall_torque',          'Stall torque',            '30 kg.cm @ 12 V; 19.5 kg.cm @ 7.4 V',          NULL,  1),
  ('st3215-spec-no_load_speed',         'no_load_speed',         'No-load speed',           '0.222 s/60deg (45 rpm) @ 12 V',                NULL,  2),
  ('st3215-spec-position_resolution',   'position_resolution',   'Position resolution',     '4096 steps (360deg/4096)',                     NULL,  3),
  ('st3215-spec-encoder',               'encoder',               'Encoder',                 '360deg magnetic encoder, two-way feedback',    NULL,  4),
  ('st3215-spec-bus_interface',         'bus_interface',         'Bus interface',           'TTL half-duplex serial bus (ST/SCS protocol)', NULL,  5),
  ('st3215-spec-baud_rate',             'baud_rate',             'Baud rate',               '1 Mbps',                                       NULL,  6),
  ('st3215-spec-id_range',              'id_range',              'Bus ID range',            '0-253 (up to 253 servos on one bus)',          NULL,  7),
  ('st3215-spec-feedback',              'feedback',              'Feedback',                'Position, load, speed, input voltage',         NULL,  8),
  ('st3215-spec-operating_mode',        'operating_mode',        'Operating mode',          'Servo angle control or continuous motor mode', NULL,  9),
  ('st3215-spec-gear',                  'gear',                  'Gear train',              'High-precision metal gear',                    NULL, 10),
  ('st3215-spec-gear_ratio_options',    'gear_ratio_options',    'Gear ratio options',      '1/345 (C001), 1/191 (C044), 1/147 (C046)',     NULL, 11),
  ('st3215-spec-mechanical_angle',      'mechanical_angle',      'Mechanical limited angle','No limit',                                     NULL, 12),
  ('st3215-spec-no_load_current',       'no_load_current',       'No-load current',         '200 mA',                                       NULL, 13),
  ('st3215-spec-locked_rotor_current',  'locked_rotor_current',  'Locked-rotor current',    '2.7 A',                                        NULL, 14),
  ('st3215-spec-dimensions',            'dimensions',            'Dimensions (W x H x D)',  '45.22 x 35 x 24.72',                           'mm', 15)
)
SELECT id, 'cmp-63619843a16558bd23755f5c-rev-st3215-specs', spec_key, label, value_text, NULL, unit, NULL, sort_order, '2026-11-04T17:00:00.000Z'
FROM specs
WHERE EXISTS (SELECT 1 FROM component_revisions WHERE id = 'cmp-63619843a16558bd23755f5c-rev-st3215-specs')
  AND NOT EXISTS (SELECT 1 FROM component_specs WHERE component_revision_id = 'cmp-63619843a16558bd23755f5c-rev-st3215-specs');
