# Production acceptance report: 2026-08-14

## Scope and verdict

This report validates the deployed RoboPartPicker product against the clarified product intent: aggregate robotics projects, preserve reproducibility evidence, expose BOMs and sourcing gaps, support forks and quote workflows, distinguish closed-source showcases, publish an honest demand-test explainer, accept commercial interest, and expose public MCP access.

**Production:** <https://robopartpicker-production.ludomi2502.workers.dev>  
**Active Worker version during final acceptance:** `c26e6a84-d229-407f-af2e-6fad143a6918`
**Production D1 migrations:** no pending migrations

**Verdict:** the deployed product is materially functional and the tested integration paths pass. It is not the complete commercial end state. In particular, broad per-BOM-line pricing, automated outbound supplier contact, carrier-aware delivery planning, AI workspace execution, marketplace liquidity, and payment processing remain incomplete or deliberately labeled as coming soon. The UI now states those boundaries instead of presenting placeholders as finished capabilities.

## Requirement-to-check traceability

| Requirement or changed public output | Acceptance check | Observed production behavior | Status |
|---|---|---|---|
| Demand-test About page | Headless Chromium loaded `/about` on 1440×1000 and 390×844; asserted product promise, useful-now section, roadmap, and three FAQ disclosures | HTTP 200, no console/page errors, zero mobile horizontal overflow; open/closed-source distinction, supplier-outreach limitation, and MCP availability were visible | Pass |
| Broad project aggregation | `GET /api/v1/projects` plus kind filters; direct D1 count | 1,816 public published projects: 60 physical designs, 1,403 robotics software projects, 12 commercial showcases, and 341 still classified unknown | Pass with classification backlog |
| Original full 300/1500 corpus population | Production catalog count and prior import evidence | The full 1,800-repository harvest was persisted; additive physical-design and showcase waves bring the live total to 1,816 | Pass |
| Open-source project provenance | `GET /api/v1/projects/open-source-rover` | Public/published physical design; Apache-2.0; immutable revision `0c4a0d97ba09d028a9ca380ae8e6729ac4b8bef7`; normalized RPPS 1.0.0; source and docs links | Pass |
| Public design files | `GET /api/v1/projects/open-source-rover/files`, then fetched a returned content URL containing a slash-bearing file ID | 24 files listed; `.github/CONTRIBUTING.md` fetched through `/api/v1/files/content?id=…`, HTTP 200, 1,144 bytes and a content type | Pass |
| Verified artifact corpus | Direct production D1 count of ready, public files | 1,209 ready files linked to 59 projects | Pass for imported wave; not universal |
| Normalized BOM and export | `GET /api/v1/boms/project-bom-cd507bd6-295a-43ca-a50e-77705723baea` and CSV export | Four valid lines; CSV returned `text/csv` with one header plus four data rows | Pass |
| Broader BOM coverage | Direct production D1 count | 16 public projects have materialized BOMs, totaling 350 lines; 14 lines are linked to normalized components | Partial, major enrichment backlog remains |
| Per-line source-backed pricing | Exact-parts sourcing estimate for Open Source Rover | Basket covered all four lines; one exact DigiKey line priced at USD 1.23, three lines explicitly unpriced with reasons | Pass for honesty and tested line; incomplete coverage |
| Offer catalog | Direct production D1 count | 923 current offers across 915 components; 14 newly resolved BOM-linked offers are classified `exact`; 909 legacy offers remain `unknown` match confidence | Partial |
| Quantity price tiers | Repaired imported tiers and ran shared offer/sourcing tests | All 14 repaired exact offers use canonical `{quantity, unitPriceMinor}` tiers; zero malformed tiers among them | Pass for repaired imports |
| Whole-BOM sourcing | `POST /api/v1/sourcing/estimate` with `fewest-suppliers`, no substitutes, exact parts only | Four basket lines, one priced line, three explicit unpriced lines, one supplier delivery group; shipping/tax/duties false; non-binding disclaimer visible | Pass for current data |
| Sourcing failure modes | Invalid body, nonexistent project, and unauthenticated RFQ requests | HTTP 422, 404, and 401 respectively | Pass |
| Firm quote workflow | Authenticated production lifecycle | RFQ create 201; invalid transition 400; premature response/reconcile 409; prepare/send transitions 200; unknown line 400; valid response, reconcile, and approve all 200 | Pass for in-app state machine |
| Automated supplier outreach | About and project UI disclosure; health capability | UI says automated outbound delivery is coming soon; no claim that email/API dispatch is live | Honest roadmap, not delivered |
| Delivery scheduling | Sourcing response and UI | Supplier grouping exists; unknown lead time remains unknown; shipping, tax, duties, carrier commitments, and arrival promises are not invented | Partial |
| Fork, edit, and lineage | Authenticated production lifecycle | Private clone 201; upstream lineage 200; RPPS update and readback 200; archive 204 | Pass |
| Closed-source commercial products | Imported 12 official-source records; API checks for every record; desktop/mobile Chromium detail check | Exactly 12 showcase cards. Every record is `commercial_showcase`, has no repository/license/public BOM/public files, and exposes no Fork, Reproduce, or RFQ control. Atlas shows official-page link, no-cover state, and explicit non-reproducible warning | Pass |
| Showcase import safety | Dry run, apply, verification, then second dry run | Zero conflicts before apply; all 12 inserted with valid RPPS and search rows; second dry run prepared zero candidates; guarded rollback retained in scratch | Pass |
| Marketplace | Public list and wanted list plus authenticated wanted lifecycle | Read APIs return valid empty lists; private wanted creation/publish/withdraw worked in acceptance; public UI says zero listings and that money processing is not enabled | Functional workflow, zero live liquidity |
| Advertiser/supplier/partner contact | Chromium form inspection; authenticated valid submission; edge requests | Form exists. Valid interest created 201 in acceptance. Cross-origin rejected 403; honeypot and link spam rejected 422; success state says manual review | Pass |
| MCP/API access | `/.well-known/mcp.json`, official MCP SDK production smoke, `/developers` browser check | Streamable HTTP advertised; six tools listed; `search_projects` and `validate_rpps` executed; developer page documents public/private MCP and OAuth | Pass |
| AI-native workspace | `/assistant` browser check and capability disclosure | Anonymous access redirects to auth; AI capability remains disabled without provider configuration and is presented as upcoming rather than complete | Not delivered, honestly gated |
| Responsive/public UX | Chromium on About, Projects, Marketplace, Partners, Developers, and showcase pages | No console/page errors; zero horizontal overflow at 390×844 on all tested pages | Pass |
| Synthetic acceptance cleanup | Direct D1 query using the acceptance run identifiers | Acceptance user, clone, listing, RFQ, and partner-interest counts all returned zero | Pass |

## Fresh verification evidence

- Full unit suite: **24 files, 134 tests passed**.
- Focused offer/import/sourcing regression suite: **17 tests passed**.
- TypeScript project build: passed.
- ESLint: **0 errors, 67 pre-existing warnings**.
- Contract validation: passed for ingestion 1.0, legacy RPPS 1.0.0, and portable RPPS 0.1.
- Production build: passed, 1,151 modules transformed.
- Production D1 migration list: **No migrations to apply**.
- Production smoke: SPA routes, health, physical projects, marketplace read, anonymous write rejection, and MCP SDK checks passed.
- Strict public API acceptance: passed catalog, provenance, file delivery, BOM, CSV, exact sourcing, edge cases, marketplace, and MCP discovery.
- General browser acceptance: passed desktop/mobile paths with zero console errors.
- Commercial-showcase browser/API acceptance: all 12 records passed honesty checks, prohibited controls were absent, and mobile overflow was zero.

## Defects found and corrected during acceptance

1. Slash-bearing harvested file IDs generated content URLs that 404ed. A query-based content endpoint now resolves those IDs while preserving authorization, visibility, range, and cache behavior.
2. DigiKey BOM imports persisted an invalid `low` match label, causing exact-part estimates to discard genuine exact MPN matches. The importer now writes `exact`, and the 14 affected production rows were repaired from a saved backup with a guarded rollback.
3. DigiKey quantity tiers used `minimumQuantity`, while the optimizer expects `quantity`. The importer and the same 14 production offers now use the canonical tier shape.
4. Commercial showcase records could be reclassified as physical designs after an RPPS edit. Showcase kind is now sticky and regression-tested.
5. Commercial records previously risked implying reproducibility. The detail UI now removes build/fork/quote controls and explicitly states absent rights, files, BOM, and instructions.

## Known constraints and remaining product work

- Only **16 of 1,816** public projects currently have materialized BOMs. BOM discovery, normalization, and evidence linking remain the largest data-quality backlog.
- Only **14 BOM-linked lines** are normalized to components in the current public BOM set. Pricing cannot honestly cover lines without reliable part identity.
- The offer catalog is broad, but most offer-to-part match confidence is still `unknown`; exact-match constraints intentionally exclude those observations.
- Automated outbound supplier messaging is not implemented. The RFQ package and reconciliation workflow are live, but actual dispatch remains coming soon.
- Delivery grouping is available, but carrier quotes, shipping cost, tax/duties, consolidation commitments, and promised dates are not.
- Marketplace workflows exist but there are currently zero published listings and no payment processing.
- The AI workspace is gated and not operational without a configured provider.
- Local Worker integration tests could not start because the installed `workerd` binary requires GLIBC 2.29–2.35 while this host provides GLIBC 2.28. Real production interfaces, official MCP SDK checks, and authenticated production workflows were exercised instead. CI on a compatible runner remains the required Worker-suite gate.
- ESLint has 67 warnings but zero errors. Most warnings predate this acceptance slice and concern `any`, React hook dependencies, and Fast Refresh export shape.

## Reversibility artifacts

The following local scratch artifacts were retained during production data changes:

- Commercial showcase pre-apply count snapshot and guarded rollback SQL.
- Offer repair original-row JSON backup: `offer-repair-2026-08-14-backup.json`.
- Offer repair guarded rollback: `offer-repair-2026-08-14-rollback.sql`.
- Commercial showcase guarded rollback generated by the production importer.

These artifacts contain no Cloudflare credentials.
