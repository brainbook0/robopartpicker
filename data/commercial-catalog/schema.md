# Commercial catalog reviewed-data contract

Status: active for the top-300 commercial catalog pipeline  
Implementation: `src/lib/commercial-catalog.ts`  
Validation tests: `src/lib/commercial-catalog.test.ts`, `src/lib/commercial-catalog-hardening.test.ts`

## Scope

This contract is for complete, closed-source robot products reviewed from public evidence. It is not a component, supplier-offer, or speculative-product schema.

A record may enter the candidate pool only when:

- it represents a complete robot product rather than a motor, sensor, gripper, controller, software package, accessory, or service;
- its exact manufacturer and model/variant identity are stated;
- it has a model-specific official manufacturer product page;
- its source availability is explicitly `closed_source`;
- its retrieval timestamp is strict RFC3339;
- its canonical URL, slug, manufacturer/model identity, and aliases do not collide with another candidate.

Use `validateCommercialCandidate` for one record and `validateCommercialCandidates` for a batch. Batch validation includes all single-record checks.

## Candidate record

```json
{
  "slug": "unitree-g1",
  "name": "Unitree G1",
  "manufacturer": "Unitree Robotics",
  "model": "G1",
  "category": "humanoid",
  "officialProductUrl": "https://www.unitree.com/g1/",
  "officialDocsUrl": "https://support.unitree.com/home/en/G1_developer",
  "lifecycle": "active",
  "retrievedAt": "2026-08-25T00:00:00.000Z",
  "aliases": ["G1 humanoid"],
  "kind": "complete_robot",
  "sourceAvailability": "closed_source"
}
```

### Candidate rules

- `slug`: lowercase kebab-case.
- `name`, `manufacturer`, `model`, `lifecycle`: non-empty strings.
- `category`: one value from `ROBOT_CATEGORIES` in `src/shared/robotCategory.ts`.
- `officialProductUrl`: valid HTTP(S), no credentials, exact model-specific official page.
- `officialDocsUrl`: optional valid HTTP(S), no credentials.
- `retrievedAt`: calendar-valid RFC3339 timestamp.
- `aliases`: array of non-empty strings, case/whitespace-normalized for deduplication.
- `kind`: exactly `complete_robot`.
- `sourceAvailability`: exactly `closed_source`.

Batch validation rejects:

- case-insensitive duplicate slugs;
- canonical official URLs that differ only by query, fragment, case, or trailing slash;
- duplicate normalized manufacturer/model identities;
- aliases colliding with any candidate slug or alias.

A material variant must therefore have both a distinct model/variant identity and a distinct official product URL.

## Profile record

A publishable profile extends its candidate record with all fields below.

```json
{
  "description": "A substantial source-backed description of the complete robot and its intended role.",
  "useCases": ["Officially documented use case"],
  "specs": [],
  "price": {},
  "trend": {},
  "evidence": [],
  "media": []
}
```

`validateCommercialProfile` applies the candidate rules first and then validates every nested declaration.

## Specification declaration

```json
{
  "key": "height",
  "label": "Height",
  "value": 1.27,
  "unit": "m",
  "sourceUrl": "https://www.unitree.com/g1/",
  "observedAt": "2026-08-25T00:00:00.000Z",
  "confidence": 0.95
}
```

When an expected field is not published, use an explicit declaration instead of guessing:

```json
{
  "key": "battery-capacity",
  "label": "Battery capacity",
  "undisclosed": true,
  "sourceUrl": "https://www.example.com/official-product-page",
  "observedAt": "2026-08-25T00:00:00.000Z",
  "confidence": 0.9
}
```

Rules:

- at least one specification declaration;
- non-empty `key` and `label`;
- exactly one of a finite/string `value` or `undisclosed: true`;
- valid source URL, observation timestamp, and confidence greater than zero through one;
- optional `unit` must be non-empty.

## Public price declaration

```json
{
  "kind": "published_price",
  "currency": "USD",
  "minMinor": 1600000,
  "maxMinor": 1600000,
  "confidence": 0.9,
  "methodVersion": "published-price-v1",
  "valuedAt": "2026-08-25T00:00:00.000Z",
  "expiresAt": "2026-11-25T00:00:00.000Z",
  "sourceUrls": ["https://www.example.com/official-price-page"]
}
```

Rules:

- `kind`: `published_price`, `published_range`, or `market_estimate`;
- `currency`: exactly `USD`;
- `minMinor` and `maxMinor`: safe nonnegative integer cents with minimum no greater than maximum;
- `published_price`: minimum and maximum must be equal;
- valid confidence and non-empty method version;
- strict valuation/expiry timestamps; expiry cannot precede valuation;
- at least one valid public citation;
- private supplier offers are never accepted as public evidence.

## Trend declaration

```json
{
  "rank": 1,
  "searchInterest": 85,
  "newsVelocity": 90,
  "videoViewVelocity": 88,
  "officialActivity": 80,
  "firstPartyTraffic": null,
  "trafficSampleSufficient": false,
  "compositeScore": 86,
  "methodologyVersion": "trend-v1",
  "windowStart": "2025-08-25T00:00:00.000Z",
  "windowEnd": "2026-08-25T00:00:00.000Z",
  "capturedAt": "2026-08-25T00:00:00.000Z"
}
```

Rules:

- contiguous integer rank within 1-300 after scoring;
- component and composite scores finite and bounded from 0 through 100;
- first-party traffic may be null only while the sample is insufficient;
- a sufficient sample requires a bounded first-party score;
- non-empty methodology version;
- strict ordered window and capture timestamps.

Raw signal collection, percentile normalization, tie-breaking, and contiguous-rank construction live in the separate trend-scorer contract.

## Evidence declaration

```json
{
  "title": "Official G1 product page",
  "sourceType": "official_product_page",
  "sourceUrl": "https://www.unitree.com/g1/",
  "retrievedAt": "2026-08-25T00:00:00.000Z",
  "confidence": 0.95
}
```

Every field is mandatory and validated. A profile requires at least one evidence declaration.

## Product-media declaration

```json
{
  "kind": "product_image",
  "sourceUrl": "https://www.example.com/official-image.webp",
  "retrievedAt": "2026-08-25T00:00:00.000Z",
  "title": "Official product image",
  "altText": "Exact robot model shown against a neutral background",
  "attribution": "Manufacturer name"
}
```

A profile requires at least one actual product-image declaration. Category illustrations and placeholders never satisfy this field. Mirroring, rights review, checksums, dimensions, R2 upload, and same-origin file linkage are enforced by the separate reviewed-media pipeline before publication.

## Deterministic IDs

- `commercialCatalogProjectId(candidate)` derives a stable project ID from the validated slug.
- `commercialCatalogProfileId(projectId)` derives a stable profile ID from that project ID.

IDs do not depend on mutable description, price, trend, or media fields.

## Failure policy

Validation returns a list of all detected errors. Assert helpers throw with those errors for command-line import gates. No invalid record is partially published, and missing data is never converted to a plausible default.