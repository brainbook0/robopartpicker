# Data collection source coverage

The coverage registry is a versioned, machine-readable translation of the canonical 1,694-line RoboPartPicker scrape inventory. It does not contact any source or authorize live collection.

## Verified scope

The registry currently accounts for:

- all 38 numbered inventory sections;
- 962 named fields with unique stable claim keys, value shapes, normalizers or expected units, evidence-locator classes, temporal behavior, and coverage state;
- 227 unique named source families across 309 inventory occurrences;
- 103 product, file-format, sensor, publication, and evidence-classification terms;
- all 28 entries in the three priority source tiers;
- all 27 canonical object types; and
- the exact known prefix of truncated line 1,694 as `deferred_unknown_tail`.

The source inventory is pinned by SHA-256:

`ec9336c4f8ddd32d1cb64868037d2b5b34023185ac637ea9cae1b87d70f1e7e0`

No suffix is inferred for the truncated final sentence.

## Files

- `source-coverage.yaml` contains section traceability, deduplicated source-family records, extraction approach, formats, cadence, risk, rollout wave, policy state, ownership, deferments, source tiers, scale targets, canonical object types, and the truncated-tail record.
- `field-coverage.yaml` contains every field and controlled inventory term.
- `adapter-families.yaml` defines the standalone `SourceAdapter` lifecycle contract. Its exact capability flags are `discover`, `acquire`, `snapshot`, `extract`, `normalize`, and `submit`.
- `pilot-sources.yaml` contains exactly five disabled candidates.

The YAML files are generated deterministically from the hash-pinned source inventory and then validated byte-semantically against the same derivation:

```sh
node scripts/validate-source-coverage.mjs --write
node scripts/validate-source-coverage.mjs
```

Normal validation never performs network access.

## Pilot gate

The five candidates are:

| Pilot ID | Inventory candidate | Adapter family |
| --- | --- | --- |
| `manufacturer_pilot` | Robotis e-Manual and Dynamixel documentation | `official_web` |
| `distributor_pilot` | DigiKey | `distributor_catalog` |
| `github_repository_pilot` | GitHub | `repository_api` |
| `ros_bom_pilot` | Poppy Project | `repository_api` |
| `volatile_offer_pilot` | RobotShop | `marketplace_listing` |

Candidate selection is not source approval. Every pilot remains `enabled: false` and `policy_state: unreviewed`. Live source contact requires a separate current `approved_live` policy revision covering source identity, base URL, robots directives, terms, reuse rights, request and cost budgets, user agent, ownership, and cadence.

R2 metered usage is authorized at the account’s stated rates for policy-approved immutable evidence. That authorization does not enable a source, waive reuse restrictions, authorize paid source APIs, remove the USD 50 monthly AI pilot ceiling, or upgrade D1 write capacity. The five-source pilot remains the safe population boundary until the offline and preview gates pass.

## Rollout interpretation

- `structured_expansion` covers sources that are structurally suitable for later policy review.
- `semi_structured` covers volatile marketplaces and bounded publications.
- `unstructured_deferred` covers community, media, and CAD references that need stricter policy and extraction controls.
- Every source is still `unreviewed`; rollout waves describe technical sequencing, not permission.

Unsupported or unavailable facts must produce missing-information or unresolved-identity records. They must never be synthesized to make a field appear complete.
