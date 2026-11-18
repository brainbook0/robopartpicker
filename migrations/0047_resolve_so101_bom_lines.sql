-- The SO-101 BOM -- `/boms/therobotstudio-so-arm100-bom`, the bill behind the one page this
-- catalogue already ranks on page 1 for ("so-101 robot arm bill of materials") -- served 14 line
-- items with every single one rendered "(purchased, unresolved)". No line pointed at a catalogue
-- component, so the page gave a builder no part link and could not answer the query it competes on,
-- while the catalogue held the exact part all along. Measured against production D1 2026-11-18:
-- line items 14, lines with a resolved component 0, lines with an observed price 0.
--
-- Six of those lines resolve without inference:
--   * FOUR STS3215 servo lines (7 x C001, 2 x C044, 3 x C046 for the two-arm set; 6 x C001 for a
--     single follower). `cmp-63619843a16558bd23755f5c` (`ws-st3215-servo`) is the ST3215 serial-bus
--     servo, and its own published specification row reads
--     gear_ratio_options = "1/345 (C001), 1/191 (C044), 1/147 (C046)" -- exactly the three gearings
--     the bill names. The component summary states it "is the actuator specified in the
--     SO-ARM100 / SO-101 open-source robot arm BOM".
--   * TWO "Motor Control Board" lines are the board the upstream README links as
--     "Waveshare-Integrates-Control-Circuit-Supports": the catalogue's
--     `c-72b1da86484b0d7068981734`, "Serial Bus Servo Driver Board, Integrates Servo Power Supply And
--     Control Circuit, Applicable for ST/..." -- the same Waveshare serial-bus servo driver board.
--
-- The remaining EIGHT lines stay unresolved on purpose. The bill says "USB-C Cable 2 pcs", "Power
-- Supply", "Table Clamp 4pcs" and "Screwdriver Set"; the catalogue holds Adafruit/SparkFun/Waveshare
-- parts with similar generic names but they are different products from the specific items the
-- upstream README links, and the README itself says of the screwdriver "You do not need to use this
-- exact screwdriver set". Matching a different SKU would be an inferred substitution presented as
-- fact, which is the one thing this catalogue must not do, so those lines keep saying "unresolved".
--
-- `completeness` moves to 'probable' to match every other matched line in the catalogue (the
-- XLeRobot bill uses 'probable' for its matched servo lines). No price is written: the only prices in
-- the upstream README are list prices, not observed supplier offers, so the BOM page keeps its honest
-- "no observed supplier price" wording and its "inspect identities, quantities and source evidence"
-- description. Both statements are guarded on component_id IS NULL and scoped to this bill's current
-- version, so re-running adds nothing and a database without the imported catalogue is a no-op.

UPDATE bom_items
SET component_id = 'cmp-63619843a16558bd23755f5c', completeness = 'probable'
WHERE component_id IS NULL
  AND description LIKE 'STS3215 Servo %'
  AND bom_version_id IN (
    SELECT bv.id FROM boms b JOIN bom_versions bv ON bv.id = b.current_version_id
    WHERE b.slug = 'therobotstudio-so-arm100-bom'
  );

UPDATE bom_items
SET component_id = 'c-72b1da86484b0d7068981734', completeness = 'probable'
WHERE component_id IS NULL
  AND description = 'Motor Control Board'
  AND bom_version_id IN (
    SELECT bv.id FROM boms b JOIN bom_versions bv ON bv.id = b.current_version_id
    WHERE b.slug = 'therobotstudio-so-arm100-bom'
  );
