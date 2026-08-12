# RoboPartPicker — Product Definition (corrected)

> Status: adopted 2026-08-12. This is the canonical product definition for planning and
> implementation. The Graph Coder Nano implementation graph must be rebuilt around this
> document. Keep this file versioned; changes go through the normal release process.

## 1. Product summary

RoboPartPicker aggregates **buildable robotics projects**, converts them into **verified
parts lists**, finds the best way to **source those parts**, and turns preliminary cost
estimates into **real supplier quotes**.

The component database is essential infrastructure, but it is **not the whole product**.
The main object is the **robotics project**.

Shorthand: **Project discovery and sharing + automatic BOM generation +
PCPartPicker-style sourcing optimization + assisted procurement.**

The long-term AI that designs robots remains **outside the current repair scope**. Existing
AI may help with extraction, normalization and workflow assistance, but the site must not
yet promise autonomous robot design.

## 2. Core workflow (the product spine)

This workflow must be the spine of the product, its navigation, its data model and the
implementation graph:

```
Discover or upload project
        ↓
Identify project revision and source
        ↓
Extract and normalize BOM
        ↓
Resolve uncertain or missing BOM lines
        ↓
Match each line to canonical components
        ↓
Find current supplier offers and alternatives
        ↓
Generate an estimated procurement plan
        ↓
Let user modify sourcing constraints
        ↓
Request real supplier quotes
        ↓
Reconcile quotes against the estimate
        ↓
User selects or approves procurement option
```

## 3. Pillar 1 — Project aggregation

Two entry paths:

**User-submitted projects** — users can:
- upload or import a repository
- paste a repository URL
- upload a BOM
- upload supported robot-description files
- create a project manually
- choose public, unlisted or private visibility
- publish a project when its information is sufficiently complete

**Internet-discovered open-source projects** — discover and aggregate legitimate
open-source robotics projects from repositories, project websites and other permitted
sources.

Each aggregated project needs: canonical project identity, upstream URL, owner or
maintainer, license, current upstream revision or commit, ingestion timestamp, last checked
timestamp, project version, build documentation, images and media references, software and
firmware references, known forks, generated BOM, provenance for every extracted fact,
completeness status, unresolved issues.

The site must not silently copy material its license or source terms do not permit. Where
necessary, store structured metadata and link to the upstream source rather than
reproducing everything.

## 4. Pillar 2 — Automatic BOM generation

The BOM is compiled, not just manually entered. Inspection sources may include: existing
BOM files, repository documentation, assembly instructions, URDF/Xacro/SDF/SRDF/MJCF files,
CAD metadata, configuration files, firmware references, source-code dependencies, linked
manufacturer parts, text and tables in project pages, nested subassemblies.

Every BOM line carries more than a product name: quantity, raw extracted description,
canonical component match, manufacturer and part number, project revision where the part is
used, exact part versus acceptable substitute, technical constraints, evidence locator,
confidence, extraction method, whether human verification is needed, purchased /
fabricated / printed / assembled, optional versus required, unresolved state, user
correction history.

The system must not pretend a BOM is complete because it generated ten plausible rows. It
needs a **visible completeness assessment**: verified lines, probable matches, unresolved
references, missing quantities, custom-fabricated parts, non-procurement dependencies,
possible omitted components.

A project can be shown before its BOM is complete, but its cost estimate must clearly
indicate what has and has not been priced.

## 5. Pillar 3 — Sourcing and price optimization

Do not merely display the lowest observed unit price. Generate an **optimized procurement
basket for the full BOM**. The optimizer accounts for: unit prices, quantity price breaks,
MOQs, stock, lead times, shipping, currency conversion, estimated duties or taxes where
available, supplier region, supplier reliability, offer freshness, exact versus
substituted components, cross-line vendor consolidation, user-selected vendors, excluded
vendors, used/surplus/secondary-market parts, delivery-speed preferences, price-versus-risk
preferences.

Objectives the user can choose among: lowest estimated landed cost, fastest available
build, fewest suppliers, highest-confidence sourcing, balanced recommendation.

The result includes a total **and its assumptions**: estimated parts total, estimated
shipping, estimated tax/duties, unpriced BOM lines, uncertain substitutions, offer
freshness, expected delivery range, estimated total range. The estimate must never look
like a binding quote.

Sourcing data is modeled as time-series or revision-aware observations, never values that
are silently overwritten.

## 6. Pillar 4 — Actual quote gathering

Explicit distinction between:

- **Estimated procurement plan** — calculated from currently observed catalog prices and
  supplier offers.
- **Firm quote workflow** — initiated after the user decides to proceed.

Quote state machine: `estimate_ready → quote_requested → supplier_requests_prepared →
requests_sent → partial_quotes_received → quotes_reconciled → user_review_required →
option_selected → expired | cancelled`.

First version uses a hybrid workflow: generate normalized RFQ packages; send RFQs through
available APIs or email automation; route unsupported suppliers to an internal procurement
queue; record responses manually or automatically; map supplier line items back to BOM
lines; flag substitutions, exclusions and changed quantities; compare the firm quote with
the original estimate; show quote expiration and lead time; obtain explicit user approval
before any purchasing handoff.

## 7. Pillar 5 — User-controlled sourcing

Users can specify: preferred suppliers, blocked suppliers, preferred region, maximum
delivery time, exact-parts-only mode, whether substitutes are permitted, whether used or
refurbished items are permitted, whether surplus and secondary-market vendors are
permitted, parts the user already owns, user-supplied prices or quotes, parts they want
RoboPartPicker to source manually.

The platform may support lawful grey-market, surplus, used, local and user-nominated
suppliers with clear provenance and risk labels. It must not facilitate stolen,
counterfeit, sanctioned, restricted or otherwise unlawful black-market procurement.

## 8. Pillar 6 — Clone, share and project lineage

Projects form a **graph**, not a pile of unrelated pages. Users can: clone or fork a public
project, preserve attribution, select which revision to clone, modify the cloned BOM,
replace components, publish their derivative, keep a clone private, share a stable link,
identify the upstream project, see downstream forks, compare revisions, explain why parts
changed.

A clone is not a shallow copy. At minimum store: `project_id`, `upstream_project_id`,
`upstream_revision`, `clone_created_at`, `owner`, `visibility`, `license`, `change summary`,
`current revision`. This enables future contribution workflows, compatibility propagation
and AI-assisted redesign without requiring those features now.

## 9. Revised product hierarchy

- **Projects** — discover, import, upload, clone and share robots.
- **BOM and sourcing** — inspect generated BOMs, resolve uncertainty, optimize sourcing,
  request quotes.
- **Components** — explore canonical parts, specifications, alternatives, suppliers,
  compatibility.
- **Build workspace** — modify a project and its BOM.
- **Community and marketplace** — share builds, forks, discussions and legitimate listings.

The **main project page is the most important screen** and should expose: Overview, BOM,
Sourcing, Build information, Files and upstream source, Versions and forks, Discussion.
BOM and Sourcing tabs are first-class, not buried utilities.

## 10. Implementation graph (rebuilt)

```
                ┌─ Project discovery and aggregation ─┐
                │                                     v
Project identity/versioning ────────────────> BOM compiler and verification
                │                                     │
                └─ Clone/share/fork lineage            v
                                                Component matching
                                                        │
                    Supplier offers and catalog ────────┤
                                                        v
                                                Sourcing optimizer
                                                        │
                                                        v
                                                Cost estimate
                                                        │
                                                        v
                                                Quote workflow
```

Revised major units:

| Unit | Ownership |
|---|---|
| IU-PRODUCT-RECOVERY | Director planning/grounding before approval and dispatch |
| IU-PROJECT-CORPUS | Project discovery, import, provenance, licensing, deduplication, upstream sync, publishability |
| IU-BOM-COMPILER | Extraction, normalization, BOM-line confidence, unresolved records, subassemblies, custom parts, user corrections |
| IU-PROJECT-PAGE | Central project experience: BOM, sourcing, provenance, clone/share workflows |
| IU-SOURCING-DATA | Supplier offers, stock, price breaks, lead times, freshness, regional info, source quality |
| IU-SOURCING-OPTIMIZER | Basket optimization across the whole BOM: shipping, MOQ, consolidation, alternatives, user preferences |
| IU-RFQ | Estimated-versus-firm pricing, quote requests, supplier responses, reconciliation, expiration, approval |
| IU-PROJECT-GRAPH | Cloning, sharing, project versions, attribution, upstream/downstream lineage |
| IU-CATALOG | Supporting component intelligence (not the central workflow) |
| IU-QUALITY-RECOVERY | Data completeness and semantic regression checks (separate from visual polish) |

### IU-PRODUCT-RECOVERY

Purpose: reconstruct what was originally built and what later agents misunderstood. The
Director must inventory: routes, UI controls, API endpoints, database tables, migrations,
schemas, project-import formats, existing tests, fixture data, existing
project/BOM/sourcing concepts, partially implemented workflows, unused but intentional
components, abandoned placeholder implementations, prior planning artifacts, deployed
behavior.

Output: one internal coverage matrix:

| Capability | Intended behavior | Existing UI | Existing API | Existing schema | Data completeness | Test coverage | Status |
|---|---|---|---|---|---|---|---|

No worker may begin "improving" a major feature until this reconstruction is complete and
incorporated into its Nano contract.

## 11. Completion floors (preventing a low-quality swarm pass)

The problem was not simply that later agents were cheaper; they received underspecified
tasks and were allowed to call incomplete output done. Every Nano unit needs objective
completion floors.

Example — a project-ingestion worker cannot pass because it inserted project records. Its
contract must verify: required project fields present; upstream provenance loads correctly;
project revision recorded; license state explicit; generated BOM linked to that revision;
BOM lines include quantities and evidence; unresolved lines retained, not discarded; the
actual project page can load the result; the sourcing engine can consume the BOM; no
placeholder or invented values inserted.

Example — a component-data worker cannot pass because cards render. It must verify field
coverage by component category and source: **floor** (required fields populated or
explicitly unknown), **shape** (exact schema required by comparison and sourcing), **load**
(production catalog, comparison and optimizer consume the records).

Mandatory protections:

- No public record whose required fields are silently missing.
- No synthetic data presented as real supplier data.
- No AI-inferred value without its classification and evidence.
- No placeholder price treated as a current offer.
- No BOM line dropped because matching failed.
- No worker allowed to reduce an existing schema to make its test pass.
- No manager approval based only on screenshots.
- No UI completion without underlying workflow completion.
- No deletion of unfamiliar Codex-built functionality until its intent is reconstructed.
- Every altered workflow gets a golden end-to-end fixture.

## 12. Golden acceptance projects

- **Project A — Clean open-source repository**: documented BOM and identifiable
  manufacturer parts. Expected: near-complete automatic BOM and sourcing estimate.
- **Project B — Messy open-source project**: parts distributed across README files,
  configuration and robot-description files. Expected: partial BOM with explicit
  uncertainty and a usable resolution workflow.
- **Project C — User-uploaded derivative**: cloned from Project A, substitutes several
  parts, includes a custom fabricated component. Expected: lineage preserved, changed BOM
  generated, custom component excluded or separately estimated, sourcing plan recalculated.

The system is not complete until all three flow through: ingestion → project page → BOM →
sourcing plan → estimate → quote request.

## 13. Current scope boundary

The current repair completes: project aggregation, upload/import, BOM generation and
correction, component matching, cost estimation, sourcing optimization, quote-request
workflow, project cloning, sharing and lineage, supporting component intelligence, quality
and data completeness.

It does **not** build the long-term autonomous robot-design AI yet.
