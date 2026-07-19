# External data ingestion contract

The scraper agent submits versioned batches to `POST /api/v1/imports/batches`. It authenticates with a dedicated service credential in `Authorization: Bearer <credential>` and does not use a user session. The raw credential is a Worker secret and is never stored in D1; audit records store only a credential identifier.

The machine-readable contract is `contracts/import-batch.v1.schema.json`; an accepted example is `contracts/examples/import-batch.v1.json`. This document is the operational companion.

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

## Semantics

- `batchId`, `idempotencyKey`, and `(source, externalRecordId, recordType)` provide independent deduplication boundaries.
- `retrievedAt` is when the source was observed, not when the batch was uploaded.
- `sourceUrl` must be HTTP(S), pass URL normalization, and is never fetched during ingestion.
- `rawPayload` is retained as untrusted evidence. `parsedData` is validated against the record-type schema.
- `confidence` is a source assertion in `[0,1]`; it never bypasses canonical review policy.
- Withdrawal is a new import event referencing the external identity; history is not deleted.

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

Canonical merge operations record before/after linkage so an administrator can reverse the association where practical. Source priority and freshness influence review, but never silently erase conflicting evidence.

## Security limits

The Worker enforces a maximum of 100 records per batch, the global API request-size limit, per-field sizes, HTTP(S)-only URLs, service authentication, API rate limits, and schema version. Repository content, scraped text, and documents are never placed in system/developer prompts and cannot request tools or alter policy.
