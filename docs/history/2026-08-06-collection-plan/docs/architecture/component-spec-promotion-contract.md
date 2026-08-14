# Component specification promotion contract

## Purpose

This contract closes the current application gap between staged component `specs_json` and website-visible canonical component revisions and specifications. It is required before the ROBOTIS e-Manual pilot can promote any component.

Target application repository: `/home/lenovo/robopartpicker`.

Application revision inspected during planning: `b9e7449fcf2b3edff869943007347308ab7eee67`.

## Current behavior

- Import-batch v1 accepts `component.parsedData.specs`.
- The ingestion service stores the object in `staging_components.specs_json`.
- Component canonical creation inserts a `components` row only.
- It does not create `component_revisions` or `component_specs`.
- Merge approval only links the import record to an existing canonical component. It does not apply reviewed component fields or specifications.
- If `manufacturerName` does not resolve, component creation currently allows a null manufacturer.

This behavior is insufficient for comparison tables because reviewed specifications can disappear at promotion.

## Required application changes

### Target files

The implementing unit owns only these application paths unless repository evidence requires a narrowly documented adjustment:

- `migrations/<next>_component_spec_provenance.sql`
- `worker/services/component-spec-promotion.ts`
- `worker/routes/imports.ts`
- `tests/worker/component-spec-promotion.test.ts`
- `contracts/component-spec-value.v1.schema.json`
- `docs/data-ingestion-contract.md`
- `docs/database-schema.md`
- `package.json` only for additive validation or test scripts

Forbidden changes:

- collection Worker implementation
- source adapter parsing
- existing project-import semantics
- unrelated catalog tables or routes
- destructive migration or historical revision deletion

## Schema changes

### `component_revisions`

Add a deterministic specification fingerprint:

```sql
ALTER TABLE component_revisions ADD COLUMN spec_fingerprint TEXT;
CREATE UNIQUE INDEX idx_component_revisions_component_fingerprint
  ON component_revisions(component_id, spec_fingerprint)
  WHERE spec_fingerprint IS NOT NULL;
```

The fingerprint is SHA-256 over canonical JSON containing sorted stable spec keys, state, raw text, normalized fields, and structured values. Evidence IDs, timestamps, import IDs, and source commit are excluded so unchanged facts deduplicate across source observations.

### `component_specs`

Add lossless structured storage and provenance locator fields:

```sql
ALTER TABLE component_specs ADD COLUMN state TEXT NOT NULL DEFAULT 'observed'
  CHECK (state IN ('observed', 'not_applicable', 'missing', 'withheld', 'unparsed'));
ALTER TABLE component_specs ADD COLUMN normalized_unit TEXT;
ALTER TABLE component_specs ADD COLUMN value_json TEXT
  CHECK (value_json IS NULL OR json_valid(value_json));
ALTER TABLE component_specs ADD COLUMN source_locator_json TEXT
  CHECK (source_locator_json IS NULL OR json_valid(source_locator_json));
```

Existing `value_text`, `value_number`, `unit`, and `normalized_value` remain the simple website query path. `value_json` preserves structures that cannot be represented losslessly in one number, including dimensions and operating-point arrays.

### `component_revision_sources`

Create an append-only observation and evidence link:

```sql
CREATE TABLE component_revision_sources (
  id TEXT PRIMARY KEY,
  component_revision_id TEXT NOT NULL REFERENCES component_revisions(id) ON DELETE CASCADE,
  import_record_id TEXT NOT NULL REFERENCES import_records(id) ON DELETE RESTRICT,
  evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  source_revision TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  source_locator_json TEXT NOT NULL CHECK (json_valid(source_locator_json)),
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (import_record_id),
  UNIQUE (component_revision_id, source_revision, adapter_id, adapter_version, content_hash)
);

CREATE INDEX idx_component_revision_sources_revision
  ON component_revision_sources(component_revision_id, observed_at DESC);
```

This table allows a new source commit to confirm an unchanged canonical revision without creating a fake new component revision.

## Staged specification value schema

Every entry in `parsedData.specs` must conform to `component-spec-value.v1`:

```json
{
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
}
```

Required properties:

- `label`
- `state`
- `raw` when state is `observed`, `not_applicable`, `withheld`, or `unparsed`
- `source`

Optional properties:

- `valueNumber`
- `unit`
- `normalizedValue`
- `normalizedUnit`
- `structured`

Rules:

- Unknown properties are rejected until schema-versioned.
- At least one of `raw`, `valueNumber`, or `structured` is required.
- `structured` must be JSON and bounded to 16 KiB per specification.
- The entire `specs` object remains bounded by the current import record and batch limits.
- Raw official text is never discarded when numeric or structured normalization succeeds.

## Canonical mapping

For each reviewed stable spec key:

| Staged property | Canonical destination |
|---|---|
| map key | `component_specs.spec_key` |
| `label` | `component_specs.label` |
| `state` | `component_specs.state` |
| `raw` | `component_specs.value_text` |
| `valueNumber` | `component_specs.value_number` |
| `unit` | `component_specs.unit` |
| `normalizedValue` | `component_specs.normalized_value` |
| `normalizedUnit` | `component_specs.normalized_unit` |
| `structured` | `component_specs.value_json` |
| `source` | `component_specs.source_locator_json` |
| stable ordered key index | `component_specs.sort_order` |

`component_specs` rows are immutable after approval. Corrections create a new component revision.

## Revision algorithm

1. Validate `specs_json` against the component spec schema.
2. Canonicalize every spec entry with lexicographically sorted keys and canonical JSON.
3. Compute `spec_fingerprint`.
4. Resolve the canonical component and manufacturer dependency.
5. Search for an existing revision with the same component ID and fingerprint.
6. If found, do not create revision or spec rows. Add one `component_revision_sources` observation link.
7. If not found:
   - create a new revision ID
   - derive revision label `import-<source-revision-prefix>-<fingerprint-prefix>` using 12 source-revision characters and 8 fingerprint characters
   - insert every specification row in stable-key order
   - add the source observation link
   - set any prior published revision for that component to `superseded`
   - set the new revision to `published`
8. Commit the canonical component operation, revision, specs, source link, import linkage, staging status, and audit event in one ordered D1 `batch()`.
9. Any failure leaves the import pending or failed without a partial canonical revision.

Revision labels are deterministic for the same source revision and spec fingerprint. The unique fingerprint index is the authoritative replay boundary.

## Manufacturer dependency

A component may not be created or merged with a null manufacturer when `manufacturerName` was supplied.

Before component promotion:

1. Resolve exact canonical manufacturer by approved same-source external identity when available.
2. Otherwise resolve a unique case-insensitive canonical manufacturer name.
3. If neither resolves exactly, return `CANONICAL_DEPENDENCY_NOT_APPROVED`.
4. The administrator must approve or merge the manufacturer import first.
5. Do not create an unowned component and repair it later.

For the ROBOTIS batch, `manufacturer:robotis` is staged in the same batch, but its review and canonical approval must precede component approval.

## Create approval path

When approving a new component:

1. Confirm no existing exact manufacturer-part-number match.
2. Resolve canonical manufacturer.
3. Insert `components` with manufacturer, MPN, source URL, freshness, and reviewed provenance.
4. Run the revision algorithm.
5. Link the import record to the new component.
6. Mark staging approved and append audit event.

## Merge approval path

When merging into an existing component:

1. Verify selected canonical component exists and manufacturer or MPN does not conflict.
2. Do not overwrite identity fields silently.
3. Apply only fields shown in the review mutation diff.
4. Run the same revision algorithm against the existing component.
5. Add the source observation link even when specs are unchanged.
6. Link the import record to the selected component.
7. Mark staging merged and append audit event.

A merge that contains an unresolved identity conflict must create a conflict or remain deferred.

## Evidence linkage

The adapter uses one aggregate source-revision evidence import record. During approval:

- approve or resolve that evidence record before component revision source links are finalized
- store its canonical evidence ID in `component_revision_sources.evidence_id`
- retain component-specific YAML and Markdown paths in `source_locator_json`
- retain the evidence external ID in the component import `rawPayload`

If the evidence record is not approved, component promotion returns a dependency error rather than dropping the link.

## Supersession and replay

- Same import record: rejected as duplicate by existing import idempotency.
- Same component, same fingerprint, new source commit: reuse revision and add observation link.
- Same component, changed fingerprint: create new revision and supersede prior published revision.
- Adapter-only change with same extracted canonical values: reuse revision and add new adapter-version observation link.
- Withdrawal: retain revisions and observation history, mark the import withdrawal, and apply existing reviewed withdrawal policy.
- Failed promotion: no revision, spec, observation link, or component mutation remains.

## Review mutation diff

Before approval, the administrator view or API must show:

- target new or existing component
- resolved manufacturer
- MPN and identity changes
- existing published revision
- proposed new fingerprint
- specs added, changed, removed, changed state, or unchanged
- raw and normalized values
- source commit, adapter version, import record, and evidence link
- exact revision and spec rows to be inserted or reused

## Required tests

File: `tests/worker/component-spec-promotion.test.ts`.

1. New component creates manufacturer-linked component, revision, specs, source link, import link, and audit row.
2. Missing manufacturer dependency fails with no partial canonical writes.
3. Same import replay creates no duplicate rows.
4. New source commit with unchanged fingerprint reuses revision and adds one observation link.
5. Changed spec creates a new revision and preserves the prior superseded revision.
6. Merge into an existing component creates or reuses revision and does not overwrite identity silently.
7. Structured dimensions survive round trip through `value_json`.
8. Torque and speed operating-point arrays survive round trip losslessly.
9. `normalizedUnit` is stored separately from raw `unit`.
10. `not_applicable`, `missing`, and `unparsed` states remain distinct.
11. Evidence dependency failure blocks promotion.
12. D1 batch failure leaves no partial component, revision, spec, source link, or audit mutation.
13. Previous component and project import tests remain green.

## Commands

```bash
rtk npm run contracts:validate
rtk vitest run tests/worker/component-spec-promotion.test.ts
rtk npm run test:worker
rtk npm run typecheck
rtk npm run lint
rtk npx wrangler deploy --dry-run
```

## Acceptance criteria

- Migration applies to a fully migrated local D1 database.
- Component spec JSON Schema and runtime validator agree.
- Create and merge paths use one shared promotion service.
- Manufacturer and evidence dependencies fail closed.
- Raw, numeric, normalized, structured, and state values are lossless.
- Source commit and adapter observations remain append-only.
- Unchanged replay produces no duplicate revision or spec rows.
- Changed facts create a new revision without deleting history.
- Existing Worker tests remain green.
- The ROBOTIS shadow batch can be reviewed without discarding specifications.

## Stop conditions

Stop implementation if:

- the migration requires deleting existing revisions or specs
- structured values must be flattened or guessed
- merge approval cannot share the same revision algorithm as create
- manufacturer or evidence can be silently null
- D1 operations cannot preserve all-or-nothing canonical invariants
- source observation and evidence linkage cannot be retained
- tests require bypassing review or writing canonical data from the Collection Worker
