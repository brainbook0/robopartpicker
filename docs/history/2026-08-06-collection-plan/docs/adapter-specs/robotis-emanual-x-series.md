# ROBOTIS e-Manual DYNAMIXEL X-series adapter packet

## Packet status

- Source ID: `src:robotis-emanual`
- Adapter family: `github-versioned-source`
- Source repository: `ROBOTIS-GIT/emanual`
- Pilot scope: DYNAMIXEL X-series only
- Technical readiness: implementation-ready for offline fixtures and Cloudflare staging
- Live schedule: disabled
- Canonical promotion: blocked until the [`component specification promotion contract`](../architecture/component-spec-promotion-contract.md) is implemented and pilot review approves the source
- Verified source revision: `95e2dfa4b64cd282180f9350c467fa06861b1458`
- Verification date: 2026-08-06

## Objective

Build the first deterministic Cloudflare-hosted source adapter. It collects official DYNAMIXEL X-series component identities and specifications from the versioned ROBOTIS e-Manual repository, preserves commit- and path-level provenance, isolates malformed source records, and submits bounded versioned batches to the existing Application Worker ingestion boundary.

Routine execution must require no laptop, shell session, browser automation, or AI agent.

## Why this is first

- Official manufacturer source.
- Directly useful actuator and servo comparison data.
- Versioned public repository with stable paths and commit hashes.
- GitHub adapter can be reused for ROS, SDK, firmware, BOM, URDF, MJCF, and project sources.
- Structured YAML and Markdown are easier to test than rendered marketplace pages.
- A known malformed source record provides a real test of record-level rejection and breakage reporting.

## Source and policy evidence

| Evidence | Observed state | Adapter consequence |
|---|---|---|
| Repository identity | `https://github.com/ROBOTIS-GIT/emanual`, under the official ROBOTIS GitHub organization | Treat as first-party manufacturer evidence. |
| Repository state | Public, active, default branch `master` | Use commit-pinned GitHub REST access. |
| License detection | GitHub reports MIT. Repository contains `LICENSE.txt`. | Retain license identity and source locator with every snapshot. Final review must confirm the intended metadata and display scope. |
| Rendered documentation | Product pages link back to the same repository using “Edit on GitHub” | Repository path is the primary evidence locator. Rendered page is a secondary verification locator only. |
| GitHub API terms | Current Terms include API-specific conditions. Public API is rate-limited. | Use an approved GitHub App, honor rate headers, and keep a bounded request ledger. |
| e-Manual robots file | `/robots.txt` returned 404 when checked | Do not infer a prohibition or an approval from absence. The pilot uses repository APIs, not a site crawler. |

## Cloudflare runtime placement

The binding names, Operations D1 schema, Queue message, atomic lease, R2 object key, service-binding handoff, log envelope, and sentinel behavior are authoritative in [`../architecture/collection-runtime-contract.md`](../architecture/collection-runtime-contract.md).

| Concern | Cloudflare component |
|---|---|
| Cadence and source lease | Collection Worker scheduled handler and Operations D1 |
| Durable source-run job | Collection Queue |
| Terminal job | Collection dead-letter queue |
| GitHub requests and parsing | Collection Worker Queue consumer |
| Raw source blobs and manifest | Private raw-evidence R2 |
| Run, metrics, health, incident, checkpoint | Operations D1 |
| Batch validation and staging | Existing Application Worker ingestion service |
| Canonical review and promotion | Existing Application Worker and canonical D1 |
| Browser rendering | Not used |
| AI | Not used |
| Cloudflare Container | Not used |

## Allowed GitHub operations

The adapter may call only these GitHub REST resource classes for `ROBOTIS-GIT/emanual`:

1. Repository metadata.
2. Default-branch or named-branch commit resolution.
3. Recursive Git tree for the resolved commit.
4. Git blob or Contents API for allowlisted changed files.
5. Rate-limit endpoint when required for diagnostics.

It must not:

- clone the repository
- execute repository code or Jekyll
- enumerate other organizations
- follow submodules
- fetch issues, pull requests, users, or unrelated social metadata
- download repository archives
- fetch assets, images, CAD, or PDFs during the X-series pilot
- use the rendered e-Manual site as an unrestricted crawler frontier

## Path allowlist

Initial full runs may retrieve only:

- `LICENSE.txt`
- `_data/dxl_x_info.yml`
- `_includes/en/dxl/specifications_x.md`
- `docs/en/dxl/x/*.md`

All other paths are inventory-only and produce no blob request.

## Run budgets

| Budget | Pilot limit |
|---|---:|
| Concurrent GitHub requests | 2 |
| Total GitHub requests on initial full run | 60 |
| Total GitHub requests on unchanged check | 4 |
| Total fetched source bytes | 10 MiB |
| Individual blob size | 512 KiB |
| Direct X-series Markdown files | 50 maximum |
| YAML product blocks | 50 maximum |
| Queue messages per source run | 1 initial pointer plus bounded continuation pointers only if required |
| Adapter wall-clock target | 2 minutes |
| Retry attempts | 2 transient retries after the first attempt |
| Full refresh cadence | Weekly |
| Lightweight commit check | Daily |

Rate-limit responses obey `Retry-After` and GitHub rate headers. The adapter never retries a policy stop, authentication rejection, malformed source record, or deterministic parser failure as though it were transient.

### Pagination and checkpoint rules

- Branch resolution is a single direct request. This source does not paginate commit history during routine checks.
- The recursive Git Trees response is non-paginated. If GitHub returns `truncated: true`, stop before blob fetch and open `github-tree-truncated`; do not treat the partial tree as complete.
- Any generic GitHub list operation used by future sources must request `per_page=100`, follow only the server-provided `Link: rel="next"` URL, and stop at the source profile `maxPages` bound. S1 sets `maxPages` to 1 because no paginated list is required.
- Contents API directory listings are not a fallback for an incomplete recursive tree in S1. A reviewed adapter revision is required before adding such a fallback.
- Store the successful checkpoint only after R2 evidence persistence and complete Application Worker batch acceptance.
- The S1 checkpoint is `(repositoryId, branch, commitSha, treeSha, manifestHash, adapterVersion, completedAt)`.
- Failed, partial, rejected, or policy-stopped runs never advance `commitSha` or `manifestHash`.
- A new adapter version against an unchanged source commit is a replay candidate, not a source change. It uses a distinct batch idempotency key and requires review before promotion.
- `ETag` is an optimization only. Immutable commit and content hashes are the correctness boundary.

On `429`, `403` with a rate-limit reason, or secondary-limit response, record `Retry-After`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `X-RateLimit-Resource`, and `X-GitHub-Request-Id` when present. Do not sleep or busy-wait in an invocation. The run terminates retryable and may be re-enqueued no earlier than the provider time plus 0 to 60 seconds deterministic jitter.

## Acquisition algorithm

1. Load the source profile and verify `enabled`, policy revision, budgets, allowed repository, branch, paths, and adapter version.
2. Acquire the source lease in Operations D1.
3. Resolve `master` to one immutable commit SHA.
4. If the commit SHA equals the last successful source revision and no forced replay is due, record an unchanged success and stop.
5. Retrieve the recursive tree at that commit.
6. Select allowlisted blobs and reject any path, type, count, or size outside the packet limits.
7. Fetch only blobs whose SHA is not already present in the source manifest.
8. Write raw permitted blobs and a manifest to private R2 using source ID, commit SHA, path, blob SHA, byte size, MIME, retrieved time, adapter version, and content hash.
9. Parse from the immutable R2-backed run manifest, never from a moving branch URL.
10. Produce component and evidence records plus record-level rejections.
11. Validate the exact import-batch v1 schema and current Worker Zod schemas.
12. Submit one bounded idempotent batch through the Application Worker ingestion service.
13. Record acceptance, rejection, drift, request, byte, duration, and provenance metrics.
14. Release the lease and schedule the next check according to the terminal outcome.

## Discovery and join algorithm

### Product data

`_data/dxl_x_info.yml` contains shared anchors in `common_x_specs` and top-level product records.

The observed source revision contains 34 product keys after excluding `common_x_specs`.

### Product pages

`docs/en/dxl/x/*.md` contains 38 direct Markdown files in the observed tree.

- `docs/en/dxl/x/x.md` is a family index with ref `dxl_x` and is not a component.
- `docs/en/dxl/x/xl430-w250_test.md` is a test page with ref `xl430-w250-test` and is not a component.
- The remaining 36 files are product pages.
- All 34 data keys have at least one product page.
- `XC430-T150BB` intentionally shares data ref `xc430-w150` with `XC430-W150`.
- `XC430-T240BB` intentionally shares data ref `xc430-w240` with `XC430-W240`.

The page permalink slug is the component identity. The frontmatter `ref` is the specification-data identity. Multiple distinct products may intentionally share one specification record.

A product page is eligible only when all are true:

- frontmatter parses safely
- `ref` is present
- `permalink` matches `/docs/en/dxl/x/<slug>/`
- the permalink slug is a valid product identity and is not the family or test page
- `ref` matches one top-level product-data key
- page title or quoted model identity is consistent with the permalink product identity

Unmatched pages, unmatched data keys, duplicate permalinks, and new shared refs are reported as coverage or identity changes. Shared refs are allowed only when each page has a distinct permalink product identity and the relationship is preserved in provenance.

## Safe YAML strategy and known source defect

The source YAML uses anchors and aliases. The full observed file fails strict safe parsing because the `2xl430-w250` block references undefined alias `*ttl_connection_5v_5v`.

The adapter must isolate records instead of correcting the source silently:

1. Preserve the raw file unchanged.
2. Split only on unindented top-level mapping keys using a tested source-specific scanner.
3. Preserve the `common_x_specs` block as the shared anchor prefix.
4. For each product, concatenate the unchanged common block and exactly one unchanged product block in memory.
5. Parse that bounded document with a safe YAML loader that permits aliases but disallows custom object construction.
6. Apply alias-count, nesting-depth, scalar-length, collection-size, and expanded-byte limits.
7. If one product document fails, reject that product record and continue other products.
8. Emit incident signature `robotis-emanual:yaml-undefined-alias:<alias>` and preserve the exact line locator.
9. Do not substitute a guessed alias, copy a value from another model, or parse the rendered page to hide the repository defect.

Expected baseline at the observed revision:

- 34 product-data blocks discovered
- 33 product-data blocks parse successfully
- `2xl430-w250` is rejected for undefined alias `ttl_connection_5v_5v`
- 36 eligible product pages discovered
- 35 component records can be produced because two pairs of products intentionally share parsed specification blocks
- one component, `2XL430-W250`, is rejected with its malformed data block
- zero silent source corrections

A later source revision that fixes the alias should make the fixture fail until the expected baseline and fixture are reviewed and updated.

## Current ingestion mapping

The adapter emits one aggregate source-revision evidence record, one manufacturer record, and one component record per accepted product page. The external component ID and manufacturer part number come from the distinct permalink product identity, not from a possibly shared specification ref.

This representative batch must remain valid against both import-batch JSON Schema and the Application Worker record-specific runtime validation:

```json
{
  "schemaVersion": "1.0",
  "batchId": "robotis-emanual-95e2dfa4b64c-adapter-1.0.0",
  "idempotencyKey": "robotis-emanual:x-series:95e2dfa4b64cd282180f9350c467fa06861b1458:1.0.0",
  "retrievalTimestamp": "2026-08-06T22:00:00.000Z",
  "source": {
    "name": "robotis-emanual",
    "type": "manufacturer_repository",
    "baseUrl": "https://github.com/ROBOTIS-GIT/emanual",
    "priority": 1,
    "trustWeight": 1
  },
  "records": [
    {
      "externalRecordId": "evidence:robotis-emanual:95e2dfa4b64cd282180f9350c467fa06861b1458",
      "recordType": "evidence",
      "sourceUrl": "https://github.com/ROBOTIS-GIT/emanual/commit/95e2dfa4b64cd282180f9350c467fa06861b1458",
      "rawPayload": {
        "sourceRevision": "95e2dfa4b64cd282180f9350c467fa06861b1458",
        "adapterId": "github-versioned-source",
        "adapterVersion": "1.0.0",
        "licensePath": "LICENSE.txt",
        "manifestKey": "manifests/src:robotis-emanual/robotis-emanual-95e2dfa4b64c-adapter-1.0.0.json"
      },
      "parsedData": {
        "title": "ROBOTIS e-Manual source revision 95e2dfa4b64c",
        "sourceType": "official_manufacturer_repository",
        "sourceUrl": "https://github.com/ROBOTIS-GIT/emanual/commit/95e2dfa4b64cd282180f9350c467fa06861b1458"
      },
      "confidence": 1
    },
    {
      "externalRecordId": "manufacturer:robotis",
      "recordType": "manufacturer",
      "sourceUrl": "https://github.com/ROBOTIS-GIT/emanual",
      "rawPayload": {
        "authority": "official_manufacturer",
        "evidenceExternalId": "evidence:robotis-emanual:95e2dfa4b64cd282180f9350c467fa06861b1458",
        "sourceRevision": "95e2dfa4b64cd282180f9350c467fa06861b1458"
      },
      "parsedData": {
        "name": "ROBOTIS",
        "websiteUrl": "https://www.robotis.us/"
      },
      "confidence": 1
    },
    {
      "externalRecordId": "dynamixel:xm430-w350",
      "recordType": "component",
      "sourceUrl": "https://github.com/ROBOTIS-GIT/emanual/blob/95e2dfa4b64cd282180f9350c467fa06861b1458/docs/en/dxl/x/xm430-w350.md",
      "rawPayload": {
        "evidenceExternalId": "evidence:robotis-emanual:95e2dfa4b64cd282180f9350c467fa06861b1458",
        "sourceRevision": "95e2dfa4b64cd282180f9350c467fa06861b1458",
        "adapterId": "github-versioned-source",
        "adapterVersion": "1.0.0",
        "dataPath": "_data/dxl_x_info.yml",
        "dataBlobSha": "6f7e2e054dc1c0705cab4ba04692906067072ebb",
        "dataKey": "xm430-w350",
        "pagePath": "docs/en/dxl/x/xm430-w350.md",
        "pageBlobSha": "430c5244a692be7722c35a312b20f0bf5a18b819",
        "specificationRef": "xm430-w350"
      },
      "parsedData": {
        "name": "DYNAMIXEL XM430-W350",
        "category": "actuator",
        "manufacturerName": "ROBOTIS",
        "manufacturerPartNumber": "XM430-W350",
        "specs": {
          "weight": {
            "label": "Weight",
            "state": "observed",
            "raw": "82 [g]",
            "valueNumber": 82,
            "unit": "g",
            "normalizedValue": 0.082,
            "normalizedUnit": "kg",
            "structured": null,
            "source": {
              "dataPath": "_data/dxl_x_info.yml",
              "dataKey": "xm430-w350",
              "field": "weight",
              "pagePath": "docs/en/dxl/x/xm430-w350.md"
            }
          },
          "dimensions": {
            "label": "Dimensions (W x H x D)",
            "state": "observed",
            "raw": "28.5 x 46.5 x 34 [mm]",
            "unit": "mm",
            "structured": {
              "width": 28.5,
              "height": 46.5,
              "depth": 34,
              "unit": "mm"
            },
            "source": {
              "dataPath": "_data/dxl_x_info.yml",
              "dataKey": "xm430-w350",
              "field": "dimensions",
              "pagePath": "docs/en/dxl/x/xm430-w350.md"
            }
          }
        }
      },
      "confidence": 0.99
    }
  ]
}
```

The component-to-evidence reference is `rawPayload.evidenceExternalId`. Component-specific repository paths remain in the same `rawPayload`, while the evidence record points to the complete immutable R2 manifest.

Initial spec keys:

- `mcu`
- `position_sensor`
- `motor`
- `baud_rate`
- `control_algorithm`
- `resolution`
- `backlash`
- `operating_modes`
- `weight`
- `dimensions`
- `gear_ratio`
- `stall_torque`
- `no_load_speed`
- `radial_load`
- `axial_load`
- `operating_temperature`
- `ingress_protection`
- `input_voltage`
- `command_signal`
- `physical_connection`
- `protocol_type`
- `supported_id_range`
- `feedback`
- `case_material`
- `gear_material`
- `standby_current`

Multi-condition torque and speed values remain one raw official field plus an array of deterministic operating points. A partial operating-point parse must not replace the raw field.

## Field mapping and normalization

The YAML data block is authoritative for specification values. Markdown frontmatter is authoritative for product identity, permalink, product group, and specification ref. The shared include file is authoritative only for its explicit conditional ingress-protection rule. Rendered HTML is a canary and review aid. It never silently overrides repository source.

| Source field | Target key | Requirement and state | Deterministic normalization |
|---|---|---|---|
| `mcu` | `mcu` | Optional. Preserve raw text. | Parse clock MHz and architecture bit width into `structured` only when explicit. |
| `encoder` | `position_sensor` | Optional. Preserve maker and part number text. | Parse explicit bit resolution and angular range. |
| `motor` | `motor` | Optional. | Raw categorical text only. |
| `baudrate` | `baud_rate` | Optional. | Parse minimum and maximum bps into structured range. Preserve raw punctuation. |
| `control` | `control_algorithm` | Optional. | Raw text and normalized lowercase token list. |
| `resolution` | `resolution` | Expected. | Parse pulses per revolution. Reject only this spec on ambiguous unit, while preserving raw as `unparsed`. |
| `backlash` | `backlash` | Optional. Source `N/A` becomes `not_applicable`. | Parse arcminutes and, when supplied or exactly convertible, degrees. |
| `mode_en` | `operating_modes` | Expected. | Split only on source `<br />` boundaries into an ordered string array. |
| `weight` | `weight` | Required for pilot component acceptance. | Parse grams. Store raw `g`, numeric grams, normalized kilograms. |
| `dimensions` | `dimensions` | Required for pilot component acceptance. | Parse ordered width, height, depth in millimeters into `structured`; do not collapse to one number. |
| `gearratio` | `gear_ratio` | Expected. | Parse the left-side numeric ratio against one. Preserve raw. |
| `stalltorque` | `stall_torque` | Required for pilot component acceptance. | Split source `<br />` conditions. Parse torque Nm, voltage V, current A, and optional Nm/A into an ordered operating-point array. |
| `noloadspeed` | `no_load_speed` | Required for pilot component acceptance. | Split source `<br />` conditions. Parse rev/min and voltage V into an ordered operating-point array. |
| `radialload_en` | `radial_load` | Optional. `N/A` is `not_applicable`. | Parse load N and explicit horn offset mm. |
| `axialload` | `axial_load` | Optional. `N/A` is `not_applicable`. | Parse load N. |
| `temperature` | `operating_temperature` | Expected. | Parse minimum and maximum degrees Celsius. |
| frontmatter `product_group` plus `_includes/en/dxl/specifications_x.md` rule | `ingress_protection` | Optional conditional fact. | Emit raw `IP 68 (1 m, 24 hr)` and structured IP code only for explicitly named product groups in the pinned include. |
| `voltage_en` | `input_voltage` | Required for pilot component acceptance. | Parse minimum, maximum, and recommended voltage when explicit. |
| `command` | `command_signal` | Optional. | Raw text only. |
| `physicalconnection` | `physical_connection` | Expected. | Split explicit `<br />` values into an ordered string array. |
| `protocoltype` | `protocol_type` | Expected. | Split explicit `<br />` values into an ordered string array. |
| `id` | `supported_id_range` | Optional. | Parse inclusive minimum, maximum, and count when explicit. |
| `feedback` | `feedback` | Optional. | Split comma-delimited explicit capabilities into an ordered string array without inventing taxonomy. |
| `case_material` | `case_material` | Optional. | Raw text and explicit section-to-material pairs only when present. |
| `gear_material` | `gear_material` | Optional. | Raw text only. |
| `standbycurrent` | `standby_current` | Optional. | Parse mA. Store raw mA and normalized A. |

### Raw-only fallback

When the source field exists but a deterministic numeric parser does not match:

1. preserve the exact raw value
2. set state `unparsed`
3. emit no guessed numeric or structured value
4. increment the field-specific parse-failure metric
5. reject the whole component only when the field is marked required

Source `N/A` maps to state `not_applicable`, not missing. An absent key maps to state `missing` only when the field is expected for that product family. Optional absent keys are omitted.

### Conflict rules

- YAML versus rendered HTML disagreement creates a conflict and pauses promotion for the affected component.
- Frontmatter permalink identity versus quoted page model disagreement rejects the page identity.
- A new shared specification ref is rejected until added to the reviewed shared-ref fixture.
- Markdown basename is not allowed to overwrite a distinct permalink product identity.
- A normalized value never outranks or replaces raw official text.

### Evidence cardinality

Emit exactly one aggregate evidence record per source revision and adapter version:

- External ID: `evidence:robotis-emanual:<commit-sha>`.
- The evidence `rawPayload` references the immutable R2 manifest containing every fetched path, blob SHA, content hash, byte size, license locator, retrieval time, and parse disposition.
- Every component `rawPayload.evidenceExternalId` references that evidence external ID.
- Every component `rawPayload` also includes its exact YAML data path/key, Markdown page path, both blob SHAs, specification ref, product permalink identity, adapter version, and known source defect IDs.
- Canonical approval resolves the aggregate evidence record once, then stores the canonical evidence ID and the component-specific locator through the component specification promotion contract.

Do not emit one duplicate canonical evidence entity per component. Do not omit component-specific paths from the component raw payload.

## Blocking application integration gap

Application revision inspected: `b9e7449fcf2b3edff869943007347308ab7eee67`.

Fresh validation on 2026-08-06 showed:

- `npm run contracts:validate` passed with ingestion contract version `1.0`.
- `npm run test:worker` passed all 26 Worker tests.
- The existing tests cover import staging and reviewed canonical promotion, but do not prove component specifications are promoted.

The current application accepts `component.parsedData.specs` and stores it in `staging_components.specs_json`, but current component canonical creation inserts only the `components` row. It does not create `component_revisions` or `component_specs` rows.

Therefore canonical promotion of S1 is blocked until the [`component specification promotion contract`](../architecture/component-spec-promotion-contract.md) is implemented. That contract requires the Application Worker promotion path to:

1. creates a source-revision-aware `component_revisions` row
2. converts reviewed `specs_json` entries into `component_specs`
3. preserves raw text even when normalized values exist
4. uses stable spec keys and labels
5. records source commit and import linkage
6. appends a new revision or reviewed spec change instead of silently overwriting mutable data
7. handles merge into an existing component without losing the prior revision

This is the minimum website-backend work required. It uses existing tables and does not justify a new database, warehouse, or display service.

## Provenance requirements

Every record must include or be traceable to:

- source ID `src:robotis-emanual`
- official repository identity
- immutable commit SHA
- source path
- Git blob SHA
- content hash
- retrieval timestamp
- adapter version
- schema version
- manufacturer identity
- product key and model identity
- extraction method
- raw official values
- normalized values and conversion method where present
- record-level parse status
- known source defect IDs
- import batch and idempotency key
- supersession or withdrawal state

## Idempotency

- Source revision key: `robotis-emanual:<commit-sha>`.
- Component external ID: `dynamixel:<normalized-product-key>`.
- Batch idempotency key: `robotis-emanual:x-series:<commit-sha>:<adapter-version>`.
- Replaying the same commit and adapter version must create no duplicate import, staging, canonical, revision, spec, evidence, or audit rows.
- A new adapter version against the same source commit may create a new reviewed extraction event but must not silently duplicate canonical entities.

## Health baseline

### Canary

Path: `docs/en/dxl/x/xm430-w350.md`.

Required canary observations:

- frontmatter `ref` equals `xm430-w350`
- permalink equals `/docs/en/dxl/x/xm430-w350/`
- page includes the X-series specifications include
- data file contains product key `xm430-w350`
- parsed product contains `weight`, `dimensions`, `gear_ratio`, `stall_torque`, `no_load_speed`, and `input_voltage`

### Baseline metrics

| Metric | Observed baseline | Initial threshold |
|---|---:|---:|
| X-series data keys | 34 | Suspect outside 32 to 40. Pause on unexplained drop below 30. |
| Direct X-series Markdown files | 38 | Suspect outside 35 to 45. |
| Eligible product pages | 36 | Degraded below 35. Pause below 33. |
| Successful data-block parses | 33 | Degraded below 32. Pause below 30. |
| Accepted component records | 35 | Degraded below 34. Pause below 32. |
| Known malformed aliases | 1 | Incident on any new alias signature. Review if it becomes 0 because the source may have fixed the defect. |
| Page-to-data join yield | 100 percent for 36 eligible pages at the observed revision | Pause below 95 percent after reviewed exclusions. |
| Manufacturer part number completeness | 100 percent of accepted components | Pause promotion below 100 percent. |
| Raw evidence hash coverage | 100 percent | Immediate pause below 100 percent. |
| Ingestion validation acceptance | 100 percent excluding explicit source-record rejects | Stop submission on any unexplained rejection. |

## Failure classification

| Failure | Retry? | State and response |
|---|---:|---|
| Network timeout or GitHub 5xx | Bounded | `suspect`, honor backoff, retry twice. |
| 429 or rate budget exhausted | After allowed delay only | Pause work until reset, preserve freshness debt. |
| 401 or 403 | No automatic retry loop | Immediate source pause and credential or policy incident. |
| Default branch changes | No | Pause and require profile update. |
| Path count or byte budget exceeded | No | Circuit break before blob fetch. |
| New undefined alias or YAML structure failure | No | Reject affected record, degrade source, stop promotion if thresholds fail. |
| Missing manufacturer part number | No | Reject component record. |
| Contract validation failure | No | Reject batch before submission. |
| Raw evidence write failure | Bounded infrastructure retry | Do not parse or submit without durable evidence. |
| Application ingestion partial rejection | No blind replay | Record exact per-record errors and require diagnosis. |

## Required fixtures

Fixture root: `tests/collection/fixtures/robotis-emanual-x-series/` in `/home/lenovo/robopartpicker`.

```text
source-profile.json
transport/
  repository.json
  branch-master.json
  tree.json
  blobs/
    LICENSE.txt
    _data__dxl_x_info.yml
    _includes__en__dxl__specifications_x.md
    docs__en__dxl__x__*.md
expected/
  manifest.json
  import-batch.json
  accepted-components.json
  rejected-records.json
  metrics.json
faults/
  tree-truncated.json
  oversized-blob.json
  unapproved-path.json
  rate-limit-429.json
  auth-401.json
  auth-403.json
  ingestion-partial-rejection.json
```

`transport` emulates GitHub at the HTTP boundary. Each JSON response fixture includes request method, exact URL, status, selected headers, and body. Blob files preserve the policy-approved bytes of the pinned source revision or a clearly labeled synthetic equivalent. Secrets, cookies, user IDs, and unrelated headers are forbidden in fixtures.

`expected/import-batch.json` is the canonical sorted output for adapter version `1.0.0`. Dynamic `runId`, retrieval timestamp, and R2 account details use explicit placeholders. All other values, including batch ID, idempotency key, 35 accepted component external IDs, one `2XL430-W250` rejection, source paths, blob SHAs, raw SHA-256 hashes, and metrics, compare exactly.

The golden packet must assert:

- 34 data blocks and 38 direct Markdown pages discovered
- exactly `x.md` and `xl430-w250_test.md` excluded as non-components
- 36 eligible product pages
- 35 accepted components
- exactly one rejected component, external ID `dynamixel:2xl430-w250`, with `robotis-emanual:yaml-undefined-alias:ttl_connection_5v_5v`
- four distinct component IDs across the two reviewed shared-ref pairs
- `dynamixel:xm430-w350` maps to manufacturer `ROBOTIS`, part number `XM430-W350`, category `actuator`, weight raw `82 [g]`, normalized weight `0.082 kg`, and dimensions `28.5 x 46.5 x 34 mm`
- byte-identical canonical output on a second parse and no duplicate staging rows on replay
- every accepted record references the aggregate revision evidence and exact component source paths

Commit fixtures for these cases:

1. `xm430-w350` normal product page and data block.
2. One product using inherited anchors.
3. One product with `N/A` optional fields.
4. One product with multiple torque and speed operating points.
5. `2xl430-w250` undefined-alias rejection.
6. `x.md` family index that must not become a component.
7. `xl430-w250_test.md` test page that must not become a component.
8. Both intentional shared-ref pairs, proving four distinct component identities use two data records.
9. Data key with no page match.
10. Page ref with no data match.
11. Duplicate permalink identity.
12. Oversized blob metadata.
13. Unapproved path in the tree.
14. Unchanged commit replay.
15. New commit with one changed product.
16. GitHub 429 with reset headers.
17. GitHub 401 and 403.
18. R2 snapshot failure.
19. Application ingestion partial rejection.

## Required tests

### Repository adapter

- repository and branch allowlist
- immutable commit pinning
- tree path filtering
- blob count and byte limits
- ETag and unchanged short circuit
- rate headers and retry behavior
- no archive, clone, issue, user, or code-execution path

### Source parser

- frontmatter parsing
- top-level block isolation
- bounded anchor and alias handling
- record-level failure isolation
- stable product identity
- page/data join
- intentional shared-spec refs without component conflation
- stable spec keys
- raw value preservation
- deterministic unit normalization
- multiple operating-point parsing
- explicit missing and `N/A` handling

### Submission

- exact import-batch schema validation
- one manufacturer dependency and component records
- deterministic external IDs
- idempotent replay
- per-record source rejection
- complete provenance and raw hash
- no direct canonical D1 or application R2 writes

### Operations

- dispatcher Cron enqueues the due source without fetching
- source lease prevents overlap
- hourly sentinel detects stale run, count drift, new parser error, DLQ, and policy expiry
- source-local pause does not block unrelated sources
- canary must pass before resume

## Acceptance criteria

The S1 offline and staging pilot is accepted only when:

- all GitHub acquisition tests pass without live-target dependence
- a controlled Cloudflare staging run resolves one immutable commit and stays within every budget
- 34 data blocks and 38 direct Markdown pages are discovered at the pinned observed revision
- 36 eligible product pages are identified after the exact family and test exclusions
- all eligible pages join to data, including the two reviewed shared-ref pairs
- 33 data blocks parse, 35 component records are produced, and `2XL430-W250` is rejected with the exact defect signature
- no source value is guessed or silently corrected
- every accepted component has a manufacturer part number and complete evidence locator
- the exact batch passes JSON Schema and Worker Zod validation
- replay creates no duplicate staging records
- health metrics and incident evidence match the packet
- current application changes can promote reviewed component specs into existing `component_revisions` and `component_specs` tables
- schedules remain disabled until source policy, storage, alerting, canary, and rollback review is recorded

## Stop conditions

Stop implementation or pilot execution when:

- exact application contract or source files differ materially from this packet
- GitHub access would require a broader token than approved
- source paths escape the allowlist
- raw evidence cannot be stored before parsing
- safe record-level YAML isolation cannot be implemented without source-value invention
- canonical promotion would discard `specs_json`
- tests require executing repository content
- a live schedule would activate before the policy and pilot gates

## Primary references

- Source repository: <https://github.com/ROBOTIS-GIT/emanual>
- Representative page source: <https://github.com/ROBOTIS-GIT/emanual/blob/master/docs/en/dxl/x/xm430-w350.md>
- Representative rendered page: <https://emanual.robotis.com/docs/en/dxl/x/xm430-w350/>
- GitHub REST rate limits: <https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api>
- GitHub Terms and API Terms: <https://docs.github.com/en/site-policy/github-terms/github-terms-of-service>
- Current RoboPartPicker ingestion contract: <https://github.com/lucadominguez/robopartpicker/blob/master/docs/data-ingestion-contract.md>
