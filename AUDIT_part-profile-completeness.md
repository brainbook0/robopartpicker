# RoboPartPicker Part-Profile Data Completeness & Source-Backed Enrichment Audit

**Generated:** 2026-08-25
**Repo:** `/root/robopartpicker`, branch `feat/bom-first-release`
**Scope:** Quantified schema coverage, production-data gap analysis, enrichment options. Read-only; no code edits.

---

## 1. D1 Schema → CatalogPart DTO Mapping

The 28-migration D1 schema (0001–0025) fully covers every `CatalogPart` field. Nothing in the DTO lacks a storage path, but several paths are never populated by import scripts.

| CatalogPart field | Schema path | Populated by import scripts? |
|---|---|---|
| `id`, `slug`, `name`, `category` | `components` table | ✅ All 6 scrapers |
| `mpn` | `components.manufacturer_part_number` | ⚠️ 4 of 6; Waveshare always NULL |
| `maker` | JOIN `manufacturers.name` via `components.manufacturer_id` | ❌ All NULL (line 153 waveshare.py, line 127 robotis.py, etc.) |
| `makerCountry` | `manufacturers.headquarters_region` | ❌ NULL (no manufacturer rows created) |
| `region` | `components.primary_region` | ❌ All scrapers leave NULL → API defaults to `"Global"` (repo line 481) |
| `blurb` | `components.summary` | ⚠️ Only Pololu + Hiwonder (partial) |
| `tags` | `component_tags` table | ❌ None |
| `openSource` | `component_specs` (spec_key = `openSource`) | ❌ None |
| `datasheetUrl` | `component_specs` (spec_key = `datasheetUrl`) | ❌ None |
| `cadAvailable` | `component_specs` (spec_key = `cadAvailable`) | ❌ None |
| `rosSupport` | `component_specs` (spec_key = `rosSupport`) | ❌ None |
| `warrantyMonths` | `component_specs` (spec_key = `warrantyMonths`) | ❌ None |
| `failures` | `component_specs` (spec_key = `failures`) | ❌ None |
| `priceHistory` | `offer_price_history` table | ✅ Via `upsertOffer` path |
| `offers` | `supplier_offers` table | ✅ All 6 scrapers (priced subset) |
| `compatibility` | `component_compatibility_tags` | ❌ None |
| `provenanceLabel` | `components.provenance_label` | ✅ All set to `"vendor"` |
| `freshnessAt` | `components.freshness_at` | ✅ All set to scrape-time ISO |
| `isDemo` | `components.is_demo` | ✅ All `= 0` |
| `files` | `component_files` → `files` → R2 | ❌ None (no image/datasheet/CAD download) |
| `projectUsage` | `bom_items` → `boms` → `projects` | ✅ Wired via repo query (line 156–163) |
| `evidence` | `evidence_claims` → `evidence` | ❌ None |
| **Category-specific specs** (peakNm, speedRpm, dof, etc.) | `component_specs` via `component_revisions` | ❌ None (no scraper writes these) |

---

## 2. Import Source Coverage

### 2.1 Supplier scraping scripts (write directly to CF D1)

| Script | Supplier | Target | Populates | Fallback MPN | Records |
|---|---|---|---|---|---|
| `scripts/scrape-waveshare.py` | sup-waveshare | 12 category pages | Component + Offer | **NULL** ❌ | ~386 products |
| `scripts/scrape-robotis.py` | robotis-us | 7 Dynamixel series | Component + Offer | Dynamixel model (e.g. "XM540") | ~50+ servos |
| `scripts/scrape-dfrobot.py` | sup-dfrobot | 55 category IDs | Component + Offer | `"DFR" + sku` | ~1000+ products |
| `scripts/scrape-hiwonder.py` | sup-hiwonder | Shopify products.json | Component + Offer | From handle/variant SKU | ~200+ products |
| `scripts/scrape-feetech.py` | sup-feetech | 8 category paths | Component only (unpriced) | From page SKU | ~100+ servos |
| `scripts/scrape-pololu.py` | sup-pololu | 15 category paths | Component + Offer | From JSON-LD SKU | ~200+ products |

**All 6 scripts share the same gaps:**
- `manufacturer_id = NULL` (no manufacturer row created/linked) — `scripts/scrape-waveshare.py:153`
- No `component_specs` writes (zero structured specs)  
- No `component_tags` writes
- No `component_files` writes (no image, datasheet, or CAD capture)
- No `evidence` writes
- `provenance_label` hardcoded to `"vendor"` with no tiering
- `primary_region = NULL` (scrapers know region but don't set it)

### 2.2 Offer-source enrichment pipeline (dry-run only)

| File | Role | State |
|---|---|---|
| `src/lib/offer-source/types.ts` | `OfferSourceAdapter` interface, `ComponentIdentity`, `OfferObservation` | Prod-ready |
| `src/lib/offer-source/waveshare.ts` | JSON-LD parser for Waveshare product pages | Prod-ready |
| `scripts/offer-source-report.ts` | Dry-run batch: reads candidates.json, fetches+verifies offers, emits report+SQL | Dry-run only |

**Waveshare first batch results** (`data/offer-source/2026-08-21-waveshare-first-batch.json`):
- Candidates: **386** (all with MPN + source_url)
- Matched: **53** (13.7%) — exact SKU match + positive price
- Rejected: **333** (86.3%) — all `unreachable` (HTTP fetch failure, likely rate limiting)
- Every accepted offer carries: supplier SKU, manufacturer MPN (from page), product URL, currency, unit price, availability, source SHA-256
- Stock quantity and lead time: left NULL (never invented)

**No adapters exist for:** Robotis, DFRobot, Hiwonder, Feetech, Pololu. Each would need 80–240 lines of supplier-specific JSON-LD/HTML parsing.

---

## 3. Catalog Honesty Architecture

The codebase enforces source-backed integrity at multiple layers:

| Layer | File:Line | Mechanism |
|---|---|---|
| Demo/live partition | `src/shared/catalog.ts` `isDemo: boolean` | Every table carries `is_demo` CHECK constraint |
| CatalogDataNotice | `src/components/parts/CatalogDataNotice.tsx` | Banner on every PartDetail page: "Only production catalog records and source-observed offers are shown" |
| Honest rendering | `src/lib/partsFormat.ts` | `MISSING = "—"` rendered instead of `undefined`/`NaN`/`0` for missing values |
| Deterministic matching | `src/lib/component-match.ts` | Never fuzzy-matches; only exact MPN/SKU/manufacturer evidence |
| Offer validation | `src/shared/offer.ts` | Rejects placeholder prices (NaN, negative, null); requires ISO currency |
| History append | `src/shared/offer.ts:157-160` | Only appends history when price or stock actually changed |

---

## 4. Quantified Gap Report (field-level)

For a hypothetical production part page, here's what will render vs. what could be populated:

| Field group | Current state | Root cause | Enrichment path |
|---|---|---|---|
| **Manufacturer info** (maker, makerCountry) | `"Unknown manufacturer"` / `"Unknown"` | Scrapers set `manufacturer_id = NULL` | Parse brand/manufacturer from source page JSON-LD (already done in `offer-source/waveshare.ts:168-169`); create manufacturers table rows |
| **MPN** | Missing for Waveshare (all NULL); present for others | `scrape-waveshare.py:153` hardcodes NULL | Extract MPN from JSON-LD `product.mpn` (parser already exists at `waveshare.ts:168`) |
| **Region** | Always `"Global"` | `primary_region = NULL` in all scrapers | Each scraper knows its target region (e.g. Waveshare = US, Robotis = US/KR) |
| **Blurb/summary** | Mostly empty | Only Pololu + Hiwonder extract descriptions | Extract from page metadata, JSON-LD `product.description`, or `<meta name="description">` |
| **Tags** | Empty array | No scraper writes `component_tags` | Derive from category keywords (already mapped in each script); normalize to controlled vocabulary |
| **Structured specs** (torque, speed, voltage, etc.) | All "No structured source specifications" | Zero `component_specs` writes | Extract from product page tables (Dynamixel spec table, Waveshare parameter table, Pololu spec section); map known spec keys per category |
| **Images** | "No source-backed product image" | No image download/attachment | Product pages have `<img>` tags with stable CDN URLs; can reference directly or mirror to R2 |
| **Datasheets** | Missing | No extraction | Many product pages link datasheets (`.pdf` links); can capture URL or mirror file |
| **CAD files** | Missing | No extraction | Some pages offer STEP/STL downloads; can extract URLs |
| **Compatibility** | Empty array | No scraper writes `component_compatibility_tags` | Extract from BOM usage data (already wired in repo); cross-reference component-integration tables |
| **Evidence** | Empty array | No scraper writes `evidence` | Each product page fetch can record: source URL, fetch date, content hash → one `evidence` row per component |
| **Provenance** | All `"vendor"` | Hardcoded | Tier: `"vendor-verified"` (JSON-LD match), `"vendor-unverified"` (scraped only), `"community"` (BOM-derived) |
| **Lifecycle** | All `"active"` | Default | Parse "discontinued"/"obsolete"/"new" from page metadata |
| **Freshness** | Set once at import | No refresh pipeline | Scheduled re-fetch; track `freshness_at` age; flag stale (>30 days) |

---

## 5. What CAN Be Derived Without Fabrication

### 5.1 From existing `components.source_url` (available for all scraper-imported components)

For each component with a `source_url` pointing to its supplier product page:

| Derivable field | Method | Already coded? |
|---|---|---|
| Manufacturer MPN | Parse JSON-LD `product.mpn` | ✅ `waveshare.ts:168` |
| Manufacturer brand/name | Parse JSON-LD `product.brand.name` | ✅ `waveshare.ts:169` |
| Verified offer (SKU + price + currency + availability) | JSON-LD `product.offers` | ✅ `offer-source/waveshare.ts` |
| Product summary | JSON-LD `product.description` or `<meta description>` | Partial (waveshare.ts extracts product name) |
| Datasheet URL | Find `<a href="...pdf">` on product page | Not yet |
| Image URL | Find `<img>` with product photo | Not yet |
| Spec table (per-category) | Parse product page HTML tables | Not yet |

### 5.2 From existing BOM data

| Derivable | How |
|---|---|
| `projectUsage` | Already wired in `CatalogRepository.findComponent()` (lines 156–164) |
| `compatibility` | Cross-reference `component_alternatives` and `bom_item_alternatives` |
| Popular tags | Aggregate tags from BOMs that use the component |

### 5.3 From cross-referencing

| Derivable | How |
|---|---|
| Manufacturer region | Look up supplier's known region, associate with component |
| Category normalization | Already done by keyword matching in scrapers |
| Price history | `offer_price_history` populated by `upsertOffer` if offers are refreshed periodically |

---

## 6. Source-Traceable Enrichment Plan

### Phase 1: Structured data extraction (lowest effort, highest impact)

1. **Unify MPN extraction** — All 6 scrapers already have the product page; extract MPN from JSON-LD or page metadata, not hardcoded NULL
2. **Create manufacturer rows + link them** — Each scraper knows its manufacturer; create the `manufacturers` row and set `components.manufacturer_id`
3. **Write one `evidence` row per component** — Record the source URL, fetch date, content hash as provenance
4. **Extract datasheet and image URLs from product pages** — Don't download files, just capture the URLs as `component_specs` entries (`datasheetUrl`, `imageUrl`)

### Phase 2: Offer verification (medium effort)

5. **Build OfferSourceAdapters for remaining 5 suppliers** — Follow `waveshare.ts` pattern; each is 80–240 lines
6. **Run offer verification pipeline in production** — Replace dry-run with actual D1 writes; track freshness per-offer
7. **Periodic offer refresh** — Re-fetch offers on a schedule; append to `offer_price_history`

### Phase 3: Spec extraction (highest effort per component)

8. **Per-category spec table parsers** — Each supplier/product page formats specs differently; need per-supplier HTML table parsers
9. **Normalize to `component_specs` schema** — Map extracted values to canonical spec keys (peakNm, speedRpm, etc.)

### Phase 4: Rich media

10. **Mirror product images to R2** — Download and attach as `component_files` with purpose `"image"`
11. **Mirror datasheets to R2** — Download PDFs and attach as `component_files` with purpose `"datasheet"`

---

## 7. File:Line Reference Index

### D1 Schema
- Components core: `migrations/0002_catalog_projects_and_boms.sql:37–56`
- Component specs: `migrations/0002...sql:70–83`
- Component files: `migrations/0002...sql:85–93`
- Supplier offers: `migrations/0002...sql:95–114`
- Offer history: `migrations/0002...sql:116–124`
- Evidence: `migrations/0002...sql:126–140`
- Evidence claims: `migrations/0002...sql:142–152`
- Component tags: `migrations/0005...sql:2–6`
- Component compatibility: `migrations/0005...sql:8–12`
- Manufacturer table: `migrations/0002...sql:1–12`
- Supplier regions: `migrations/0002...sql:28–35`
- Supplier metrics: `migrations/0005...sql:26–38`
- Offer condition/risk/freshness: `migrations/0017_offer_history.sql:5–9`
- BOM line completeness: `migrations/0016_bom_completeness.sql:5–8`

### API & DTO
- CatalogPart DTO: `src/shared/catalog.ts:62–93`
- Category-specific types: `src/shared/catalog.ts:95–160` (Actuator, Hand, Sensor, Compute, Driver, Reducer)
- CatalogOffer DTO: `src/shared/catalog.ts:36–60`
- Offer types: `src/shared/offer.ts:1–76`
- Offer validation: `src/shared/offer.ts:179–226`

### Repository (hydration)
- `listComponents`: `worker/db/repositories/catalog.ts:74–137`
- `findComponent`: `worker/db/repositories/catalog.ts:139–178`
- `hydrateComponents`: `worker/db/repositories/catalog.ts:397–498` — key: merges specs, tags, compatibility, offers, price history
- `upsertOffer`: `worker/db/repositories/catalog.ts:294–376`

### UI
- PartDetail page: `src/pages/PartDetail.tsx:1–435`
- Field rendering: `src/lib/partsFormat.ts` (MISSING = "—" pattern)
- CatalogDataNotice: `src/components/parts/CatalogDataNotice.tsx`
- ExpandableField: `src/components/common/ExpandableField.tsx`

### Import scripts
- Waveshare: `scripts/scrape-waveshare.py:153` (MPN = NULL root cause)
- Robotis: `scripts/scrape-robotis.py:127`
- DFRobot: `scripts/scrape-dfrobot.py:149`
- Hiwonder: `scripts/scrape-hiwonder.py:125`
- Feetech: `scripts/scrape-feetech.py:130`
- Pololu: `scripts/scrape-pololu.py:171`

### Offer source enrichment
- Types: `src/lib/offer-source/types.ts:1–85`
- Waveshare adapter: `src/lib/offer-source/waveshare.ts:1–241`
- Batch report runner: `scripts/offer-source-report.ts:1–210`
- First batch data: `data/offer-source/2026-08-21-waveshare-first-batch.json`
- Candidates: `data/offer-source/2026-08-21-waveshare-candidates.json`

### Matching
- Deterministic matcher: `src/lib/component-match.ts:1–268`
- Build index: `component-match.ts:113–134`
- Match function: `component-match.ts:137–212`

### Catalog honesty
- Demo/real partition: `src/lib/catalogHonesty.ts:1–23`
- File purge check: `scripts/cleanup-crawler-garbage.sql`

---

## 8. Summary Statistics

| Metric | Value |
|---|---|
| D1 tables covering part profiles | 18 (components, manufacturers, suppliers, supplier_offers, offer_price_history, component_tags, component_compatibility_tags, component_specs, component_revisions, component_files, files, evidence, evidence_claims, data_conflicts, component_alternatives, saved_components, bom_items, integrations) |
| Migrations | 26 (0001–0025 + cleanup SQL) |
| Import/scrape scripts | 6 (Waveshare, Robotis, DFRobot, Hiwonder, Feetech, Pololu) |
| OfferSourceAdapters | 1 of 6 (Waveshare only) |
| Fields populated (of ~60 in CatalogPart+specs) | ~10 (name, category, slug, source_url, provenance_label, freshness_at, offers.price, offers.currency, offers.availability, priceHistory) |
| Fields always empty | ~50 (maker, makerCountry, region, blurb, tags, openSource, datasheetUrl, cadAvailable, rosSupport, warrantyMonths, failures, compatibility, files, evidence, all category-specific specs) |
| Waveshare offer verification rate | 13.7% (53/386); 86.3% unreachable |
| Current provenance granularity | 1 value: `"vendor"` |
| Missing manufacturer links | 100% (all `manufacturer_id = NULL`) |
| Components with structured specs | 0 |