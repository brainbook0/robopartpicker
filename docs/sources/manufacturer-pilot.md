# Manufacturer pilot

## State

`manufacturer_pilot` is a disabled candidate for Robotis e-Manual and
Dynamixel documentation. Its persisted source policy remains `unreviewed`.
There is no live acquisition code, no live capture, and no production
submission in this unit.

The adapter runs only against synthetic fixtures under
`collector/tests/fixtures/manufacturer_pilot`. Its runtime result says
`approved_fixture_only` to distinguish safe offline execution from live
source approval. The fixture values must not be published as real product
facts.

## Field mapping

The fixture maps source identifiers, product family, manufacturer part
number, revision, torque, speed, weight, voltage, current, gear ratio, encoder
resolution, communication protocols, and a datasheet locator to a v2
`component` record. Every extracted claim is classified `official`, carries a
JSON Pointer evidence locator, and names its applicable revision.

Absent IP-rating data is emitted as an explicit open missing-information item.
No value is estimated or AI-inferred.

## Deterministic change fixtures

| Fixture | SHA-256 | Purpose |
| --- | --- | --- |
| `actuator-rev-a.json` | `12c060491c40ce2c297bb9ebdfd7b102f92179abb8d34ed82bab4121e8c8d8d1` | Initial revision |
| `actuator-rev-a-copy.json` | `12c060491c40ce2c297bb9ebdfd7b102f92179abb8d34ed82bab4121e8c8d8d1` | Unchanged-content proof |
| `actuator-rev-b.json` | `150ee91b3cf85e65c0ce2ce0c8cb8286cfa86bd2cd4e2ac6863e57b4ef6bff84` | Changed-content and revision proof |

## Live-source gate

Before any network contact, a new append-only source policy revision must
record the base URL, robots review, terms review, reuse decision, rate and cost
budget, contact-bearing user agent, and owner approval. The pilot must then be
separately enabled with `approved_live`. Candidate identity alone is not
approval.
