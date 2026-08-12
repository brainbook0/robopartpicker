# IU-PRODUCT-RECOVERY — Codebase coverage matrix

> Grounding artifact for the rebuilt implementation graph. Compiled 2026-08-12 from the
> live `master` tree at `2080c6e` (working tree includes `9a6384c`). Every row cites real
> files/tables. Status legend: `[x]` complete, `[~]` partial/foundation, `[ ]` absent.
> No worker may begin improving a major feature until this matrix is incorporated into its
> Nano contract.

## API surface inventory (routes)

17 route files, ~200 endpoint declarations (`worker/router.ts`, `worker/routes/*`):

| File | Endpoints | Notes |
|---|---|---|
| builds.ts | 27 | Build passports, items, steps, problems, files, export |
| projects.ts | 25 | CRUD, import/analyze/archive/files, rpps update, popularity |
| marketplace.ts | 23 | Listings, wanted, inquiries, offers, saves, reports |
| rpps.ts | 22 | Validate, releases, publish, change proposals |
| community.ts | 19 | Threads, posts, reactions, bookmarks, reports |
| ai.ts | 19 | Assistant + tools incl. `draft_rfq` (copyable text only) |
| files.ts | 16 | R2 file uploads/ownership |
| organizations.ts | 13 | Orgs, members, roles |
| boms.ts | 11 | BOM list/detail/export (csv, rpps-bom.json) |
| users.ts, imports.ts, catalog.ts, notifications.ts, search.ts, health.ts, admin.ts, discovery.ts | 8+2+6+5+2+2+2+1 | |

## Schema inventory (tables)

14 migrations (`migrations/0001…0014`), ~190 tables. Notable clusters:

- **Projects**: `projects`, `project_versions`, `project_files`, `project_media`,
  `project_steps`, `project_maintainers`, `project_known_issues`, `project_memory`,
  `project_requirements`.
- **BOM**: `boms`, `bom_versions`, `bom_items`, `bom_item_alternatives`.
- **Catalog**: `components`, `component_revisions`, `component_specs`,
  `component_alternatives`, `component_compatibility_tags`, `component_files`,
  `component_tags`, `manufacturers`, `suppliers`, `supplier_offers`,
  `offer_price_history`, `supplier_metrics`, `supplier_regions`,
  `supplier_capabilities`, `supplier_interfaces`, `saved_components`,
  `canonical_match_candidates`, `data_conflicts`.
- **Import/staging**: `import_sources`, `import_records`, `import_jobs`,
  `import_errors`, `import_audit_events`, `staging_projects`, `staging_boms`,
  `staging_components`, `staging_manufacturers`, `staging_suppliers`,
  `staging_offers`, `staging_integrations`.
- **RPPS**: `rpps_releases`, `rpps_source_mappings`, `rpps_validation_findings`,
  `rpps_change_proposals`, `rpps_release_assemblies`, `rpps_release_interfaces`,
  `rpps_build_outcomes`, `rpps_build_passports*`.
- **Builds**: `builds`, `build_versions`, `build_items`, `build_steps`,
  `build_problems`/`resolutions`/`decisions`, `build_files`, `build_members`,
  `build_firmware`/`configuration`/`calibration`/`tests`, `build_activity`.
- **Community/marketplace**: `forum_*`, `marketplace_*` (listings, items, images,
  inquiries, offers, messages, transactions, moderation, reports, saves).
- **Cross-cutting**: `evidence`, `evidence_claims`, `integrations`, `audit_events`,
  `data_conflicts`, `rate_limit_events`, `search` (FTS5), auth tables.

## Coverage matrix

| Capability | Intended behavior | Existing UI | Existing API | Existing schema | Data completeness | Test coverage | Status |
|---|---|---|---|---|---|---|---|
| Project aggregation (internet discovery) | Discover/aggregate OSS projects; provenance, licensing, dedup, upstream sync | Finder.tsx, discovery | discovery.ts, imports.ts | import_sources, import_records, import_jobs, staging_projects | Partial: bulk catalog seeded; upstream sync/dedup/`last_checked` not wired | none found | [~] |
| Project upload/import (user path) | repo URL, repo upload, BOM upload, robot-description files, manual create, visibility, publish | ProjectNew.tsx, Builder.tsx | projects.ts import/*, imports.ts | projects, project_versions, import_records, file_upload_intents | Import formats: github/rpps/bom/urdf/archive/files; publishability gating partial | src/lib/projectImportRetrieval.test.ts; no worker import tests | [x] core / [~] publishability |
| Project identity & versioning | canonical identity, upstream URL, maintainer, license, revision/commit, timestamps | ProjectDetail (header, exact-release reproduction) | projects.ts, rpps.ts | projects, project_versions, rpps_releases | Revisions recorded; `last_checked`/upstream sync absent | portable.test.ts | [~] |
| BOM extraction & normalization | compile BOM from BOM files/docs/URDF/CAD/config/firmware/source; nested subassemblies | BomDetail.tsx, BomsIndex.tsx | boms.ts, projects import/analyze, ai.ts | boms, bom_versions, bom_items, staging_boms, rpps_release_assemblies | Real-BOM harvest (2026-08-12): 25 projects/401 lines; analyzer handles UTF-16/TSV/xlsx | portable.test.ts, projectImportRetrieval.test.ts | [~] |
| BOM-line confidence & completeness | verified/probable/unresolved/missing qty/custom/non-procurement/omitted; evidence per line; correction history | ProjectDetail parts tab | boms.ts export, projects rpps | bom_items, bom_item_alternatives, evidence, rpps_source_mappings | No completeness assessment surface; unresolved retention partial | none | [ ] |
| Component matching | map lines to canonical components; exact vs substitute; confidence | PartDetail, PartCompare | catalog.ts | canonical_match_candidates, components, component_alternatives, data_conflicts | Match candidates exist; no production matching service | catalogWorkspace.test.ts | [~] |
| Sourcing data (offers) | price/stock/price-breaks/MOQ/lead-time/freshness/region/reliability as revision-aware series | Suppliers.tsx, SupplierDetail.tsx, PartDetail offers | catalog.ts | suppliers, supplier_offers, offer_price_history, supplier_metrics, supplier_regions | Offer history table exists; freshness labeling partial; MOQ/price breaks not modeled | none | [~] |
| Sourcing optimizer (basket) | optimize whole BOM: shipping, MOQ, consolidation, alternatives, user prefs, objectives | none | none | none | none | none | [ ] |
| Cost estimate | parts total + shipping/tax + unpriced lines + freshness + delivery range; never a quote | ProjectDetail cost tab, ProjectInsight | projects.ts detail | builds cost fields; no project procurement-estimate model | Builds carry item costs; no project-level estimate | none | [ ] |
| Quote workflow (RFQ) | estimate → quote_requested → … → option_selected/expired; RFQ packages, send, reconcile, approve | RfqComposer.tsx, marketplace wanted "RFQ" | ai.ts `draft_rfq` (copy text only), marketplace.ts | marketplace_offers, marketplace_inquiries | Draft-only; no state machine, sending, reconciliation, approval | none | [~] draft only |
| User-controlled sourcing | preferred/blocked suppliers, region, delivery, exact-parts mode, substitutes, used/surplus, owned parts, user prices | none | none | none | none | none | [ ] |
| Clone/share/lineage | fork, attribution, revision select, derivative, stable link, upstream/downstream forks, compare, change reasons | none | none | none (no upstream_project_id/clone tables) | none | none | [ ] |
| Project page (BOM & sourcing first-class) | Overview/BOM/Sourcing/Build/Files/Versions/Discussion | ProjectDetail.tsx (overview, parts, cost, time, software, assembly, evidence, URDF), BomDetail | projects.ts, boms.ts | — | BOM tab present; Sourcing tab absent | none | [~] |
| Catalog/component intelligence | canonical parts, specs, alternatives, suppliers, compatibility | PartsCatalog, PartDetail, PartCompare, Suppliers, SupplierDetail | catalog.ts | components*, suppliers* | Strong; 203 garbage components removed (2026-08-11) | catalogWorkspace.test.ts | [x] |
| Builds (reproduction passports) | start-from-project builds, items/offers/status/cost, steps, evidence | Builder.tsx, ProjectInsight | builds.ts | builds* | Strong; narrative-first marketplace linked to builds | none found for worker | [x] |
| Community & marketplace | threads, posts, listings, wanted, moderation; no fake payments | Community.tsx, marketplace/* | community.ts, marketplace.ts | forum_*, marketplace_* | Listings strong; transactions/moderation partial by design | src/lib/forum.test.ts | [x]/[~] |
| Notifications/admin/search | in-app + email prefs, admin, FTS | Notifications.tsx, Admin | notifications.ts, admin.ts, search.ts | notifications, audit_events, FTS5 | Present | none | [x] |
| Quality & data completeness | field floors by category/source; no silently missing required fields; semantic regression | none dedicated | — | data_conflicts, staging_* | scripts/cleanup-crawler-garbage.sql, scripts/bom-honesty.sql (ops-only) | no regression suite | [ ] |

## Partially implemented / intentional / abandoned findings

- **RFQ is draft-only by design**: `draft_rfq` produces copyable text, never sent
  (`worker/routes/ai.ts:382`). RfqComposer + Marketplace "wanted" RFQ exist. No quote state
  machine, sending, reconciliation or approval. Do not delete; extend into IU-RFQ.
- **Builds pivot**: builds are exact-release "reproduction passports" (narrative-first),
  deliberately distinct from canonical projects. Marketplace links builds for cost context.
- **Marketplace no-payment claim**: marketplace explicitly never pretends payment happened
  (`docs/implementation-plan.md` §3; no transaction provider).
- **Staging cluster** (`staging_*`) and `data_conflicts` exist but are not consumed by any
  live service — intentional ingestion staging, currently dormant.
- **canonical_match_candidates** exists but no matching/orchestration service reads it.
- **offer_price_history** exists but nothing writes it today (offers are updated in place).
- **No project fork/clone/upstream tables** exist despite `docs/product-definition.md` §8
  requiring lineage (this is new work, not recovery).
- **Data ops**: `scripts/cleanup-crawler-garbage.sql` (203 components removed) and
  `scripts/bom-honesty.sql` (56 artifact BOMs labeled) are one-shot, not regression tests.

## Gaps required by the corrected product definition (not present anywhere)

1. BOM completeness assessment (verified/probable/unresolved/… per line + project-level).
2. Sourcing optimizer (whole-BOM basket, MOQ/price breaks/shipping/consolidation/objectives).
3. Project-level procurement estimate with assumptions (unpriced lines, freshness, ranges).
4. Firm quote workflow state machine (estimate_ready → … → option_selected/expired).
5. User-controlled sourcing constraints (preferred/blocked suppliers, substitutes, used).
6. Project lineage (clone/fork, upstream_project_id, upstream_revision, change summary).
7. Upstream synchronization (`last_checked`, revision refresh) and deduplication.
8. Semantic quality regression suite + golden end-to-end fixtures (Projects A/B/C).
