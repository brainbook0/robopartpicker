# External data ingestion contract

The scraper agent submits versioned batches to `POST /api/v1/imports/batches`. It authenticates with a dedicated service credential in `Authorization: Bearer <credential>` and does not use a user session. The raw credential is a Worker secret and is never stored in D1; audit records store only a credential identifier.

The machine-readable contracts are `contracts/import-batch.v1.schema.json` and `contracts/import-batch.v2.schema.json`; accepted examples live beside them in `contracts/examples/`. Version 1 remains the bounded compatibility contract. New provenance-aware collectors use version 2.

## Interactive project import is separate

The scraper ingestion endpoint is not used by the interactive project importer. A visitor can analyze a bounded BOM, RPPS manifest, URDF, or canonical public GitHub repository through `POST /api/v1/projects/import/analyze`. Signed-in users can upload a project archive through `POST /api/v1/projects/import/archive` or analyze an authorized mixed R2 file set through `POST /api/v1/projects/import/files`; source bytes remain private or organization-scoped by default.

Interactive extraction inventories source files and can propose explicit BOM identities, model/joint structure, software dependencies, configuration key types, procedures, previews, and engineering-repository signals. It never writes inferred parts or prices into the canonical catalog. Future pricing resolves reviewed BOM identities only against RoboPartPicker's internal component and supplier-offer records; scraping and price collection are a separate ingestion run.

Interactive analysis is deterministic and does not call an AI model. It inventories artifacts, records hashes and source provenance, preserves unknown namespaced RPPS extensions, resolves only unambiguous BOM identities, and produces a progressive buildability scorecard. It never writes catalog components, supplier offers, prices, or scraped records. Saving creates a private project draft and portable RPPS release only after explicit user action.

The public GitHub path accepts only canonical repository URLs and reads repository metadata through the bounded GitHub API integration. Direct text inputs are limited to 1 MiB. ZIP inputs are limited to 10 MiB compressed, 25 MiB expanded, 500 entries, and 5 MiB of extracted text; absolute paths, traversal paths, unsupported compression, encrypted entries, and oversized packages are rejected. Imported files and repository content are always untrusted data, never executable instructions.

## Batch envelope

```json
{
  "schemaVersion": "1.0",
  "batchId": "01J...",
  "idempotencyKey": "source-job-2026-07-19-001",
  "source": {
    "name": "example-catalog",
    "type": "supplier_catalog"
  },
  "retrievalTimestamp": "2026-07-19T14:00:00.000Z",
  "records": [
    {
      "externalRecordId": "servo-123",
      "recordType": "component",
      "sourceUrl": "https://example.invalid/servo-123",
      "confidence": 0.94,
      "parsedData": {},
      "rawPayload": {}
    }
  ]
}
```

Accepted record types are `manufacturer`, `supplier`, `component`, `offer`, `project`, `bom`, `integration`, `evidence`, `teardown`, `commercial_robot`, and `marketplace_reference`.

Version 2 adds one lowercase 32-hex `traceId`, an optional W3C version-00 `traceparent`, source policy metadata, universal record provenance, an immutable snapshot manifest, field-level claims, and lifecycle events. Source-submitted robots/terms/reuse metadata is stored as an **unreviewed** policy revision; it never grants live collection approval.

Every v2 accepted record retains the same trace ID on its import job, import record, errors, and audit events. Staging rows resolve trace context through `import_record_id`. Snapshot bytes are not accepted by this endpoint. A batch snapshot must use an immutable external URL; an external collector cannot assert that an arbitrary R2 key is retained.

## Immutable evidence registration

Policy-approved evidence bytes use the separate `contracts/evidence-registration.v1.schema.json` contract:

1. The collector sends bytes to `PUT /api/v1/source-evidence/objects/{sha256}` with the ingestion credential, exact `Content-Length`, declared and detected MIME types, evidence class, and an approved source-policy revision.
2. The Worker streams the body directly to the private `FILES` R2 binding and supplies the declared SHA-256 to R2 for integrity verification. It never buffers an entire document or accepts a caller-selected object key.
3. The object key is derived as `source-evidence/sha256/{first-two-hex}/{sha256}`. Identical bytes reuse that object.
4. The collector sends the checked-in registration manifest to `POST /api/v1/source-evidence/registrations`. Retained registrations are accepted only after the exact object exists. External-reference, metadata-only, and typed rejection modes store no hidden bytes.

Retention caps are 8 MiB for structured text, 25 MiB for documents, 10 MiB for images, and 50 MiB for archives or CAD. `media_or_other` is external-reference or metadata-only. Each retained class has an explicit MIME allowlist and requires its declared and detected MIME types to match.

Source-submitted policy fields in an import batch remain untrusted. Their append-only revisions supersede only earlier external-untrusted assertions, never an independently approved policy revision. Retention requires a current, separately approved policy revision with `retention_approved` reuse. Production additionally requires an enabled `approved_live` source profile. Fixture approvals work only in test and development.

Evidence metadata and content endpoints are under `/api/v1/admin/source-evidence/{snapshotId}` and require a platform moderator or administrator. Responses never expose an arbitrary R2 key. An administrator can append `takedown_pending` and then `takedown_complete` snapshot revisions; each transition creates a durable collection job and lifecycle event. Superseded bytes become inaccessible immediately. Takedown completion uses durable access restriction rather than a racy physical delete; content-addressed bytes remain non-enumerable for deduplication and no completed lineage can retrieve them.

Collector handoff hashes for evidence-registration v1:

- JSON Schema: `e636dd8574abe8d655a1998a5c712e17871baff1e1f890e130dc11c198fe63e3`
- Canonical example: `667be52488490a3c7bef8cc89da8cfec72f3b049c07f6851e2e67b0db51907c9`

## Semantics

- `batchId`, `idempotencyKey`, and `(source, externalRecordId, recordType)` provide independent deduplication boundaries.
- `retrievalTimestamp` is when the source was observed, not when the batch was uploaded.
- `sourceUrl` must be HTTP(S), pass URL normalization, and is never fetched during ingestion.
- `rawPayload` is retained as untrusted evidence. `parsedData` is validated against the record-type schema.
- `confidence` is a source assertion in `[0,1]`; it never bypasses canonical review policy.
- Withdrawal is a new import event referencing the external identity; history is not deleted.
- Reusing a batch ID or idempotency key with the same normalized body returns the prior result. Reusing either with different content returns `IDEMPOTENCY_CONFLICT`.
- Claimed canonical IDs are checked against the correct entity table before staging. Missing and wrong-type IDs return `CANONICAL_REFERENCE_NOT_FOUND` or `CANONICAL_REFERENCE_TYPE_MISMATCH`.

## Record disposition

| Record type | Pre-promotion disposition |
| --- | --- |
| `manufacturer`, `supplier`, `component`, `offer`, `project`, `bom`, `integration` | Typed staging table plus optional deterministic match candidates |
| `evidence` | Typed parsed import record in mandatory review; canonical evidence is created only after approval |
| `teardown`, `commercial_robot`, `marketplace_reference` | Typed parsed reference record in mandatory review; never projected into an unrelated catalog table |

No accepted type is treated as an unreviewable raw-only success. Unsupported schema versions or record types fail with stable typed errors.

## Response

The endpoint returns `202` for an accepted batch and reports each record independently:

```json
{
  "duplicate": false,
  "job": {
    "id": "019...",
    "status": "partial",
    "acceptedCount": 9,
    "rejectedCount": 1,
    "duplicateCount": 2
  },
  "records": [
    { "index": 0, "externalRecordId": "servo-123", "status": "staged", "recordId": "..." },
    { "index": 1, "externalRecordId": "bad", "status": "rejected", "errors": [{ "path": "name", "message": "Required" }] }
  ]
}
```

Malformed records are recorded in `import_errors` and never reach staging or canonical tables. Retrying a previously accepted `batchId` or idempotency key returns the existing job as `duplicate: true` without creating another record. The HTTP `Idempotency-Key` header is mandatory and must exactly equal the payload value.

## Promotion pipeline

Validation -> raw import record -> record-specific staging row -> normalized fingerprint -> deterministic match candidates -> conflict detection -> manual review or configured auto-approval -> canonical write -> import audit event.

An administrator can create canonical manufacturers, suppliers, components, offers, projects, BOMs, integrations, and evidence, or merge an import into an existing canonical record. Teardowns, commercial robots, and Marketplace references remain reviewed reference records rather than being projected into an unrelated product table. Canonical creation, import linkage, staging status, and the import audit event are committed in one D1 batch.

Offers, BOM items, and integration entities can refer to an already-approved record from the same source by external ID. They may also include a canonical ID where the service has one, but that ID is checked against the relevant canonical table. Dependency records must be approved first; otherwise review returns `CANONICAL_DEPENDENCY_NOT_APPROVED` without a partial canonical write.

Canonical merge operations retain the import-to-canonical linkage so an administrator can reassess the association. Source priority and freshness influence review, but never silently erase conflicting evidence.

## Security and compatibility limits

Both versions are limited to 1 MiB of actual UTF-8 request bytes, independent of `Content-Length`, and 100 records. JSON is limited to depth 10, 256 properties per object, 64 KiB per string, and 64 KiB of serialized `rawPayload` per record. Version 2 additionally caps claims at 256 and lifecycle events at 20 per record. Oversized source bodies belong in R2; they never spill into D1 metadata or privileged prompts.

Stable contract error codes include `UNSUPPORTED_SCHEMA_VERSION`, `INVALID_TRACE_ID`, `INVALID_TRACEPARENT`, `PAYLOAD_TOO_LARGE`, `RAW_PAYLOAD_TOO_LARGE`, `STRING_TOO_LARGE`, `OBJECT_TOO_DEEP`, `TOO_MANY_PROPERTIES`, `CANONICAL_REFERENCE_NOT_FOUND`, `CANONICAL_REFERENCE_TYPE_MISMATCH`, `UNSUPPORTED_RECORD_TYPE`, and `IDEMPOTENCY_CONFLICT`.

Repository content, scraped text, and documents are untrusted data. The ingestion endpoint never fetches a submitted URL, executes source content, places it in system/developer prompts, or lets it request tools or alter policy.
