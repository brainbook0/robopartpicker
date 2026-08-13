---
bounds:
  scope: "RoboPartPicker product repair per docs/product-definition.md
    (2026-08-12): project aggregation, upload/import, BOM compilation and
    correction, component matching, cost estimation, sourcing optimization,
    quote-request workflow, project cloning/sharing/lineage, supporting
    component intelligence, quality and data completeness."
  non_goals:
    - Autonomous robot-design AI (out of scope).
    - Live supplier payment/checkout handoffs beyond explicit user-approved
      quote handoff.
    - Production deployment of unfinished IU work.
  budget: One planning/grounding slice first (IU-PRODUCT-RECOVERY), then one unit
    per IU in the graph order; no unit starts before its dependencies pass.
requirements:
  - id: REQ-WORKFLOW-SPINE
    text: The end-to-end workflow (discover/upload → revision → BOM
      extract/normalize → resolve → match → offers → estimate → user constraints
      → quote request → reconcile → approve) is the spine of navigation, data
      model and implementation graph.
  - id: REQ-AGGREGATION
    text: Projects enter via user submission (repo
      URL/upload/BOM/robot-description/manual, visibility, publishability) and
      internet discovery (canonical identity, upstream URL, maintainer, license,
      revision, timestamps, forks, generated BOM, provenance, completeness,
      unresolved issues).
  - id: REQ-BOM-COMPILER
    text: BOMs are compiled from BOM files, docs, assembly instructions,
      URDF/Xacro/SDF/SRDF/MJCF, CAD metadata, config, firmware, dependencies,
      linked parts, page text, subassemblies. Each line carries qty, raw
      description, canonical match, mpn, revision, exact-vs-substitute,
      constraints, evidence, confidence, extraction method, verification-needed,
      purchased/fabricated/printed/assembled, optional, unresolved, correction
      history.
  - id: REQ-BOM-HONESTY
    text: Visible completeness assessment (verified, probable, unresolved, missing
      qty, custom-fabricated, non-procurement, possible omissions). Cost
      estimate always shows what is and is not priced; never looks like a
      binding quote.
  - id: REQ-SOURCING
    text: Whole-BOM optimized procurement basket accounting for price breaks, MOQ,
      stock, lead time, shipping, currency, duties, region, reliability,
      freshness, exact-vs-substitute, consolidation, user/excluded vendors,
      used/surplus, delivery and price-vs-risk preferences, with selectable
      objectives and assumptions breakdown.
  - id: REQ-RFQ
    text: Distinct firm-quote workflow (estimate_ready → quote_requested →
      supplier_requests_prepared → requests_sent → partial_quotes_received →
      quotes_reconciled → user_review_required → option_selected →
      expired|cancelled) with normalized RFQ packages, response recording,
      line-item reconciliation, substitution flags, estimate comparison,
      expiration/lead time, explicit user approval.
  - id: REQ-USER-SOURCING-CONTROLS
    text: "User-controlled sourcing: preferred/blocked suppliers, region, max
      delivery, exact-parts-only, substitutes, used/refurbished/surplus
      allowances, owned parts, user prices, manual sourcing queue. Lawful
      grey-market with provenance and risk labels; no black-market
      facilitation."
  - id: REQ-LINEAGE
    text: "Projects form a graph: clone/fork, attribution, revision selection,
      derivative publishing, private clones, stable links, upstream/downstream
      forks, revision comparison, change reasons; minimum lineage fields
      stored."
  - id: REQ-QUALITY-FLOORS
    text: "Completion floors and protections: no silently missing required fields,
      no synthetic data as real supplier data, no AI value without
      classification/evidence, no placeholder price as current offer, no dropped
      BOM lines, no schema reduction, no screenshot-only approval, no UI
      completion without workflow completion, no deletion of unfamiliar
      functionality without intent reconstruction, golden fixtures for every
      altered workflow."
  - id: REQ-GOLDEN-PROJECTS
    text: Projects A (clean), B (messy), C (user derivative) all flow ingestion →
      project page → BOM → sourcing plan → estimate → quote request.
acceptance:
  - id: AC-COVERAGE-MATRIX
    text: docs/product-recovery-coverage.md exists, cites real files/tables per row,
      and every major capability is scored [x]/[~]/[ ] with the gaps list
      matching the product definition.
  - id: AC-AGGREGATION-IMPORT
    text: A repository URL import and a manual project creation both produce a
      project whose page loads; provenance fields (upstream URL, license,
      revision, timestamps) are populated and verifiable via API.
  - id: AC-BOM-COMPILED-HONEST
    text: Running the compiler on golden Project A yields a BOM where every line has
      qty, name, evidence locator, extraction method, confidence, and
      completeness bucket; unresolved lines are retained, not dropped.
  - id: AC-ESTIMATE-ASSUMPTIONS
    text: The sourcing estimate endpoint returns parts total, shipping, tax/duties,
      unpriced lines, substitution notes, offer freshness, delivery range, total
      range, and a non-quote disclaimer.
  - id: AC-RFQ-FLOW
    text: A quote can be requested from an estimate and reach user_review_required
      with supplier line items reconciled to BOM lines; approval is explicit
      before any handoff; expired/cancelled states exist.
  - id: AC-LINEAGE
    text: Cloning Project A and modifying its BOM produces a derivative with
      upstream_project_id/upstream_revision recorded; upstream and downstream
      fork lists resolve via API.
  - id: AC-GOLDEN-A
    text: "Golden Project A (clean repo with documented BOM and manufacturer parts):
      near-complete automatic BOM and sourcing estimate; every completion floor
      passes."
  - id: AC-GOLDEN-B
    text: "Golden Project B (messy: parts in README/config/robot-description):
      partial BOM with explicit uncertainty buckets and a usable resolution
      workflow."
  - id: AC-GOLDEN-C
    text: "Golden Project C (user derivative with substitutions + custom fabricated
      part): lineage preserved, changed BOM generated, custom part excluded or
      separately estimated, sourcing plan recalculated."
  - id: AC-QUALITY-SUITE
    text: A semantic regression suite runs on CI with the three golden projects and
      fails on any silently missing required field, synthetic data, placeholder
      price, or dropped BOM line.
managers:
  - id: M-DIRECTOR
    title: Director (planning/grounding and quality)
    owns:
      - IU-PRODUCT-RECOVERY
      - IU-QUALITY-RECOVERY
  - id: M-CORPUS
    title: Project corpus manager
    owns:
      - IU-PROJECT-CORPUS
  - id: M-BOM
    title: BOM compiler manager
    owns:
      - IU-BOM-COMPILER
  - id: M-PAGE
    title: Project page manager
    owns:
      - IU-PROJECT-PAGE
  - id: M-SOURCING
    title: Sourcing data and optimizer manager
    owns:
      - IU-SOURCING-DATA
      - IU-SOURCING-OPTIMIZER
      - IU-CATALOG
  - id: M-RFQ
    title: Quote workflow manager
    owns:
      - IU-RFQ
  - id: M-GRAPH
    title: Project graph (clone/share/lineage) manager
    owns:
      - IU-PROJECT-GRAPH
units:
  - unit_id: IU-PRODUCT-RECOVERY
    title: Grounding reconstruction of what exists
    objective: Produce the single coverage matrix and unit contracts
      (REQ-QUALITY-FLOORS grounding) so no worker starts a major feature without
      reconstruction; the matrix must cite real files/tables and status per
      capability.
    kind: explore
    dependencies: []
    acceptance_ids:
      - AC-COVERAGE-MATRIX
    read_scope:
      - worker
      - src
      - migrations
      - docs
      - scripts
      - tests
      - data/bom-snapshots
    write_scope:
      - docs/product-recovery-coverage.md
      - docs/product-definition.md
      - gcl-plan.md
    forbidden_scope: []
    procedure:
      - Inventory routes (worker/routes, worker/router.ts), UI pages
        (src/pages), migrations (migrations/0001..0014), repositories
        (worker/db/repositories), schemas (src/lib/rpps), import formats
        (worker/services/project-import.ts), tests, fixture data.
      - For each capability in the product definition, record existing
        UI/API/schema/data/test evidence and a status; list gaps explicitly.
      - Record partially implemented / intentional / abandoned findings
        (draft_rfq, builds-as-passports, marketplace no-payment, staging
        cluster, canonical_match_candidates, offer_price_history, data ops
        scripts).
      - Update docs/product-recovery-coverage.md; keep it the single source for
        the matrix.
    commands:
      red:
        - grep -L 'Capability' docs/product-recovery-coverage.md
      green:
        - grep -c '^| ' docs/product-recovery-coverage.md
    expected_artifacts:
      - docs/product-recovery-coverage.md
    output_contract:
      - Matrix has the columns Capability | Intended behavior | Existing UI |
        Existing API | Existing schema | Data completeness | Test coverage |
        Status.
      - Every row references at least one real path or table name.
      - "Gaps list includes: BOM completeness assessment, sourcing optimizer,
        project procurement estimate, firm quote state machine, user sourcing
        controls, project lineage, upstream sync/dedup, semantic regression
        suite."
    progress_contract:
      checkpoint_every: single pass
      writes_incrementally: false
      command_timeout_seconds: 120
    manager_id: M-DIRECTOR
    risk: low
    route:
      primary: claude-api:claude-fable-5
      fallback: gpt-5.5
    attempt_limit: 3
    stop_conditions:
      - Coverage matrix cites only real evidence
      - Gaps match product definition
  - unit_id: IU-PROJECT-CORPUS
    title: Project aggregation, import, provenance, publishability
    objective: Both entry paths (user submission and internet discovery) produce
      publishable projects with canonical identity, upstream provenance,
      license, revision, timestamps, completeness status and retained unresolved
      issues (REQ-AGGREGATION).
    kind: implement
    dependencies:
      - IU-PRODUCT-RECOVERY
    acceptance_ids:
      - AC-AGGREGATION-IMPORT
    read_scope:
      - worker/routes/projects.ts
      - worker/routes/imports.ts
      - worker/db/repositories/projects.ts
      - worker/services/project-import.ts
      - migrations
      - src/pages/ProjectNew.tsx
      - src/lib/projectImportRetrieval.ts
      - docs/product-recovery-coverage.md
    write_scope:
      - worker/routes/projects.ts
      - worker/routes/imports.ts
      - worker/db/repositories/projects.ts
      - migrations/0015_project_corpus.sql
      - src/lib/projects.ts
      - src/pages/ProjectNew.tsx
      - tests/worker/api.test.ts
    forbidden_scope:
      - worker/routes/ai.ts
      - worker/services/project-import.ts:analyzeFileSet internals (read-only)
    procedure:
      - Extend project import/creation so provenance fields (upstream URL,
        maintainer, license, revision, ingestion/last-checked timestamps) are
        required or explicitly unknown, and publishability gating is enforced.
      - Add upstream synchronization state (last_checked, revision refresh) and
        deduplication keyed on canonical upstream identity.
      - Ensure unresolved import issues are retained on the project record,
        never dropped.
      - Add worker integration tests for import → project page load.
    commands:
      red:
        - npm run test:worker -- --run tests/worker/api.test.ts
      green:
        - npm run typecheck && npm run test:worker
    expected_artifacts:
      - worker/routes/projects.ts
      - worker/routes/imports.ts
      - worker/db/repositories/projects.ts
      - tests/worker/api.test.ts
    output_contract:
      - Import endpoint records upstream_url, license, revision,
        ingestion_timestamp, last_checked_timestamp.
      - Creating/importing a project with incomplete required fields returns
        publishability status, not silent publication.
      - Duplicate upstream identity resolves to the existing canonical project.
      - No record inserted with a silently missing required field.
    progress_contract:
      checkpoint_every: per endpoint change
      writes_incrementally: true
      command_timeout_seconds: 300
    manager_id: M-CORPUS
    risk: medium
    route:
      primary: gpt-5.5
      fallback: claude-api:claude-fable-5
    attempt_limit: 4
    stop_conditions:
      - Provenance fields present on API response
      - Publishability enforced
      - Integration test green
  - unit_id: IU-BOM-COMPILER
    title: BOM extraction, normalization, confidence, completeness
    objective: Compile procurement-ready BOMs from all listed sources with per-line
      evidence, confidence, extraction method, revision link, and a visible
      completeness assessment; unresolved lines retained (REQ-BOM-COMPILER,
      REQ-BOM-HONESTY).
    kind: implement
    dependencies:
      - IU-PRODUCT-RECOVERY
    acceptance_ids:
      - AC-BOM-COMPILED-HONEST
    read_scope:
      - worker/services/project-import.ts
      - worker/db/repositories/boms.ts
      - src/lib/rpps/schema.ts
      - src/lib/rpps/portable.ts
      - migrations/0002_catalog_projects_and_boms.sql
      - docs/product-recovery-coverage.md
      - data/bom-snapshots
    write_scope:
      - worker/services/project-import.ts
      - worker/db/repositories/boms.ts
      - worker/routes/boms.ts
      - migrations/0016_bom_completeness.sql
      - src/lib/rpps/portable.ts
      - tests/bom-compiler.test.ts
    forbidden_scope:
      - worker/routes/marketplace.ts
    procedure:
      - Extend the existing extractor (already handles BOM files, URDF, docs,
        UTF-16/TSV/xlsx) to also read assembly instructions, CAD metadata,
        config files, firmware references, source dependencies, page text and
        nested subassemblies.
      - Add completeness bucketing (verified/probable/unresolved/missing
        qty/custom/non-procurement/possible omission) per line and
        project-level.
      - Store evidence locators and extraction method per line; keep unresolved
        lines with an explicit unresolved state.
      - Link each BOM line to the project revision it was extracted from.
      - Add golden fixture tests for Projects A and B extraction.
    commands:
      red:
        - npm run test:unit -- --run src/lib/rpps/portable.test.ts
      green:
        - npm run typecheck && npm run test:unit && npm run test:worker
    expected_artifacts:
      - worker/services/project-import.ts
      - worker/db/repositories/boms.ts
      - migrations
      - src/lib/rpps/portable.ts
    output_contract:
      - Every compiled line has quantity, name, evidence locator, extraction
        method, confidence, completeness bucket.
      - BOM for golden Project A is near-complete; golden Project B is partial
        with explicit uncertainty.
      - No line is dropped because matching failed; unresolved lines persist
        with state.
      - Revision link is recorded on each line.
    progress_contract:
      checkpoint_every: per source type added
      writes_incrementally: true
      command_timeout_seconds: 300
    manager_id: M-BOM
    risk: medium
    route:
      primary: gpt-5.5
      fallback: claude-api:claude-fable-5
    attempt_limit: 4
    stop_conditions:
      - Completeness buckets visible in API
      - Unresolved lines retained
      - Golden A/B fixtures pass
  - unit_id: IU-PROJECT-PAGE
    title: Central project experience with first-class BOM and sourcing
    objective: The project page exposes Overview, BOM, Sourcing, Build,
      Files/upstream, Versions/forks, Discussion, with BOM and Sourcing
      first-class; the end-to-end workflow is the spine of navigation
      (REQ-WORKFLOW-SPINE).
    kind: implement
    dependencies:
      - IU-PROJECT-CORPUS
      - IU-BOM-COMPILER
    acceptance_ids:
      - AC-BOM-COMPILED-HONEST
    read_scope:
      - src/pages/ProjectDetail.tsx
      - src/pages/BomDetail.tsx
      - src/pages/ProjectInsight.tsx
      - src/lib/projects.ts
      - worker/routes/projects.ts
      - worker/routes/boms.ts
    write_scope:
      - src/pages/ProjectDetail.tsx
      - src/pages/BomDetail.tsx
      - src/pages/ProjectInsight.tsx
      - src/lib/projects.ts
    forbidden_scope:
      - worker/routes/marketplace.ts
      - worker/services/project-import.ts
    procedure:
      - Make BOM a first-class project tab rendering completeness buckets,
        unresolved lines and evidence, using the BOM API.
      - Add a Sourcing tab rendering the estimate with assumptions and unpriced
        lines (empty state until IU-SOURCING-OPTIMIZER lands).
      - Wire Versions/forks section to the lineage API when IU-PROJECT-GRAPH
        lands; keep an honest empty state otherwise.
      - Keep overview, build, files/upstream and discussion tabs intact.
    commands:
      red:
        - grep -L 'Sourcing' src/pages/ProjectDetail.tsx
      green:
        - npm run typecheck && npm run build
    expected_artifacts:
      - src/pages/ProjectDetail.tsx
      - src/pages/BomDetail.tsx
      - src/pages/ProjectInsight.tsx
    output_contract:
      - ProjectDetail renders a BOM tab whose content comes from the BOM API,
        not fixtures.
      - ProjectDetail renders a Sourcing tab (with honest empty/loading state
        before the optimizer ships).
      - "No UI completion without underlying workflow completion: tabs that have
        no backing API render an explicit 'not available' state."
    progress_contract:
      checkpoint_every: per tab
      writes_incrementally: true
      command_timeout_seconds: 300
    manager_id: M-PAGE
    risk: low
    route:
      primary: gpt-5.5
      fallback: claude-api:claude-fable-5
    attempt_limit: 3
    stop_conditions:
      - BOM tab renders from API
      - Sourcing tab honest empty state
      - Build passes
  - unit_id: IU-SOURCING-DATA
    title: Supplier offers, stock, price breaks, freshness, quality
    objective: "Supplier offer data is revision-aware time-series (not overwritten):
      price, stock, price breaks, MOQ, lead time, region, reliability,
      freshness; consumed by the optimizer and displayed with provenance and
      risk labels (REQ-SOURCING)."
    kind: implement
    dependencies:
      - IU-PRODUCT-RECOVERY
    acceptance_ids:
      - AC-ESTIMATE-ASSUMPTIONS
    read_scope:
      - worker/db/repositories/catalog.ts
      - worker/routes/catalog.ts
      - migrations/0002_catalog_projects_and_boms.sql
      - migrations/0005_catalog_taxonomy_and_supplier_metrics.sql
      - src/pages/Suppliers.tsx
      - src/pages/SupplierDetail.tsx
    write_scope:
      - worker/db/repositories/catalog.ts
      - worker/routes/catalog.ts
      - migrations/0017_offer_history.sql
      - src/lib/catalogWorkspace.ts
      - tests/sourcing-data.test.ts
    forbidden_scope:
      - worker/routes/marketplace.ts
    procedure:
      - Wire offer_price_history writes on every offer update; never silently
        overwrite a prior observation.
      - Model price breaks, MOQ, lead time, stock, region, reliability and
        freshness on supplier_offers; expose them via the catalog API.
      - Add provenance and risk labels (exact/substitute, used/surplus,
        freshness) to offer records.
      - Add golden-fixture offer data and tests that the optimizer input shape
        is satisfied.
    commands:
      red:
        - grep -L 'offer_price_history' worker/db/repositories/catalog.ts
      green:
        - npm run typecheck && npm run test:unit && npm run test:worker
    expected_artifacts:
      - worker/db/repositories/catalog.ts
      - worker/routes/catalog.ts
      - migrations
    output_contract:
      - Every offer update appends a price-history observation.
      - Offers carry price, stock, MOQ, lead time, region, reliability,
        freshness, risk label fields (or explicit unknown).
      - No placeholder price is stored as a current offer.
    progress_contract:
      checkpoint_every: per model field added
      writes_incrementally: true
      command_timeout_seconds: 300
    manager_id: M-SOURCING
    risk: medium
    route:
      primary: gpt-5.5
      fallback: claude-api:claude-fable-5
    attempt_limit: 4
    stop_conditions:
      - Price history appends on update
      - Offer fields present in API
      - Tests green
  - unit_id: IU-SOURCING-OPTIMIZER
    title: Whole-BOM procurement basket optimization
    objective: Given a BOM and user constraints, produce an optimized basket with
      full assumptions under selectable objectives; honor user sourcing controls
      (preferred/blocked suppliers, region, delivery, exact-parts, substitutes,
      used/surplus, owned parts, user prices) (REQ-SOURCING,
      REQ-USER-SOURCING-CONTROLS).
    kind: implement
    dependencies:
      - IU-BOM-COMPILER
      - IU-SOURCING-DATA
    acceptance_ids:
      - AC-ESTIMATE-ASSUMPTIONS
    read_scope:
      - worker/db/repositories/catalog.ts
      - worker/db/repositories/boms.ts
      - src/lib/rpps/schema.ts
      - migrations
      - docs/product-recovery-coverage.md
    write_scope:
      - worker/services/sourcing-optimizer.ts
      - worker/routes/sourcing.ts
      - migrations/0019_sourcing_constraints.sql
      - tests/sourcing-optimizer.test.ts
    forbidden_scope:
      - worker/routes/marketplace.ts
    procedure:
      - Implement the optimizer over the whole BOM with unit prices, price
        breaks, MOQ, stock, lead time, shipping, currency, duties where
        available, consolidation, alternatives, user/excluded vendors,
        used/surplus allowances, delivery and price-vs-risk preferences.
      - Emit the assumptions block and a clear non-quote disclaimer; unpriced
        lines are listed, not hidden.
      - Accept user constraints (preferred/blocked suppliers, region, max
        delivery, exact-parts-only, substitutes, owned parts, user prices).
      - Add deterministic tests over fixture BOMs incl. golden Project A.
    commands:
      red:
        - grep -L 'non-quote' worker/services/sourcing-optimizer.ts
      green:
        - npm run typecheck && npm run test:unit && npm run test:worker
    expected_artifacts:
      - worker/services/sourcing-optimizer.ts
      - worker/routes/projects.ts
      - tests
    output_contract:
      - Estimate includes parts total, shipping, tax/duties, unpriced lines,
        substitution notes, freshness, delivery range, total range, disclaimer.
      - Objective selection changes the basket (deterministic test).
      - No placeholder price is treated as a current offer.
    progress_contract:
      checkpoint_every: per constraint type added
      writes_incrementally: true
      command_timeout_seconds: 300
    manager_id: M-SOURCING
    risk: high
    route:
      primary: claude-api:claude-fable-5
      fallback: gpt-5.5
    attempt_limit: 5
    stop_conditions:
      - Assumptions block complete
      - Unpriced lines listed
      - Objective tests pass
  - unit_id: IU-RFQ
    title: Firm quote workflow with reconciliation and approval
    objective: Turn an estimate into the firm quote workflow state machine with
      normalized RFQ packages, response recording, line reconciliation,
      substitution flags, estimate comparison, expiration/lead time, and
      explicit user approval (REQ-RFQ).
    kind: implement
    dependencies:
      - IU-SOURCING-OPTIMIZER
    acceptance_ids:
      - AC-RFQ-FLOW
    read_scope:
      - worker/routes/ai.ts
      - src/components/parts/RfqComposer.tsx
      - worker/db/repositories/marketplace.ts
      - migrations/0003_builds_community_and_marketplace.sql
      - migrations/0008_marketplace_details_and_integrity.sql
      - worker/services/sourcing-optimizer.ts
    write_scope:
      - worker/routes/rfq.ts
      - worker/db/repositories/rfq.ts
      - migrations/0020_rfq.sql
      - src/components/parts/RfqComposer.tsx
      - src/pages/Quotes.tsx
      - tests/rfq.test.ts
    forbidden_scope:
      - worker/routes/marketplace.ts
    procedure:
      - Define the quote state machine and persistence (estimates, requests,
        responses, line mappings, expiration, approval).
      - "Extend the existing draft_rfq/ RfqComposer into the state machine:
        package generation, send via API/email where available, internal queue
        for unsupported suppliers, manual/automatic response recording."
      - Reconcile supplier line items back to BOM lines; flag substitutions,
        exclusions and changed quantities; compare firm quote vs estimate.
      - Require explicit user approval before any purchasing handoff; support
        expired/cancelled.
    commands:
      red:
        - grep -L 'quote_requested' worker/routes/rfq.ts
      green:
        - npm run typecheck && npm run test:unit && npm run test:worker
    expected_artifacts:
      - worker/routes/rfq.ts
      - worker/db/repositories/rfq.ts
      - migrations
      - src/components/parts/RfqComposer.tsx
    output_contract:
      - A quote can reach user_review_required with supplier line items mapped
        to BOM lines and substitution flags set.
      - Estimate comparison and expiration/lead time are shown.
      - Handoff requires explicit user approval (state option_selected) and
        cannot be triggered by the system.
    progress_contract:
      checkpoint_every: per state added
      writes_incrementally: true
      command_timeout_seconds: 300
    manager_id: M-RFQ
    risk: high
    route:
      primary: claude-api:claude-fable-5
      fallback: gpt-5.5
    attempt_limit: 5
    stop_conditions:
      - State machine persists transitions
      - Approval gate enforced
      - Tests green
  - unit_id: IU-PROJECT-GRAPH
    title: Clone, share, lineage and version graph
    objective: "Projects form a graph: clone/fork with attribution and revision
      selection, private/public derivatives, stable links, upstream/downstream
      fork resolution, revision comparison, change summaries; lineage fields
      persisted (REQ-LINEAGE)."
    kind: implement
    dependencies:
      - IU-PRODUCT-RECOVERY
    acceptance_ids:
      - AC-LINEAGE
    read_scope:
      - worker/db/repositories/projects.ts
      - worker/routes/projects.ts
      - migrations/0002_catalog_projects_and_boms.sql
      - src/pages/ProjectDetail.tsx
      - src/lib/projects.ts
      - docs/product-recovery-coverage.md
    write_scope:
      - worker/routes/lineage.ts
      - worker/db/repositories/project-graph.ts
      - migrations/0018_project_lineage.sql
      - src/pages/ProjectLineage.tsx
      - tests/worker/lineage.test.ts
    forbidden_scope:
      - worker/routes/marketplace.ts
    procedure:
      - Add lineage columns (upstream_project_id, upstream_revision,
        clone_created_at, owner, visibility, license, change summary, current
        revision) via a migration.
      - Implement clone/fork endpoint with revision selection, attribution
        preservation and private visibility.
      - Implement upstream/downstream fork queries and revision comparison with
        change reasons.
      - Add worker integration tests for clone → modify → publish → fork-list
        resolution.
    commands:
      red:
        - grep -L 'upstream_project_id' migrations/*.sql
      green:
        - npm run typecheck && npm run test:worker
    expected_artifacts:
      - migrations
      - worker/db/repositories/projects.ts
      - worker/routes/projects.ts
      - tests/worker/api.test.ts
    output_contract:
      - Cloning produces a project with upstream_project_id, upstream_revision,
        clone_created_at, owner, visibility, license, change summary, current
        revision.
      - Upstream and downstream fork lists resolve via API.
      - Golden Project C lineage passes AC-GOLDEN-C.
    progress_contract:
      checkpoint_every: per endpoint added
      writes_incrementally: true
      command_timeout_seconds: 300
    manager_id: M-GRAPH
    risk: medium
    route:
      primary: gpt-5.5
      fallback: claude-api:claude-fable-5
    attempt_limit: 4
    stop_conditions:
      - Lineage fields persist
      - Fork lists resolve
      - Integration tests green
  - unit_id: IU-CATALOG
    title: Supporting component intelligence (floors, shape, load)
    objective: Component/supplier catalog data meets field floors by category and
      source, matches the exact schema comparison/sourcing consume, and loads in
      production catalog, comparison and optimizer (REQ-QUALITY-FLOORS).
    kind: implement
    dependencies:
      - IU-PRODUCT-RECOVERY
      - IU-SOURCING-DATA
    acceptance_ids:
      - AC-QUALITY-SUITE
    read_scope:
      - worker/db/repositories/catalog.ts
      - worker/routes/catalog.ts
      - src/lib/catalogWorkspace.ts
      - src/pages/PartsCatalog.tsx
      - src/pages/PartDetail.tsx
      - src/pages/PartCompare.tsx
      - migrations/0002_catalog_projects_and_boms.sql
      - migrations/0005_catalog_taxonomy_and_supplier_metrics.sql
    write_scope:
      - src/lib/catalogWorkspace.ts
      - src/pages/PartDetail.tsx
      - tests/catalog-floors.test.ts
    forbidden_scope:
      - worker/routes/marketplace.ts
      - worker/services/sourcing-optimizer.ts
    procedure:
      - Define required fields per component category/source; populate or mark
        explicitly unknown (no silently missing required fields).
      - Remove or quarantine any synthetic data presented as real supplier data.
      - Ensure comparison and optimizer consume the same schema (shape + load).
      - Add tests asserting field floors by category and that optimizer input
        validates.
    commands:
      red:
        - npm run test:unit -- --run src/lib/catalogWorkspace.test.ts
      green:
        - npm run typecheck && npm run test:unit && npm run test:worker
    expected_artifacts:
      - worker/db/repositories/catalog.ts
      - src/lib/catalogWorkspace.ts
      - tests
    output_contract:
      - Every public component/supplier record has required fields populated or
        explicitly unknown.
      - No synthetic data flagged as real supplier data.
      - Comparison and optimizer validate against the same schema.
    progress_contract:
      checkpoint_every: per category
      writes_incrementally: true
      command_timeout_seconds: 300
    manager_id: M-SOURCING
    risk: medium
    route:
      primary: gpt-5.5
      fallback: claude-api:claude-fable-5
    attempt_limit: 4
    stop_conditions:
      - Field floors enforced by tests
      - Schema shared with comparison/sourcing
  - unit_id: IU-QUALITY-RECOVERY
    title: Data completeness and semantic regression suite
    objective: A CI semantic regression suite runs golden Projects A/B/C end-to-end
      and fails on silently missing required fields, synthetic data, placeholder
      prices, or dropped BOM lines; no screenshot-only approval remains possible
      (REQ-QUALITY-FLOORS, REQ-GOLDEN-PROJECTS).
    kind: verify
    dependencies:
      - IU-PRODUCT-RECOVERY
    acceptance_ids:
      - AC-QUALITY-SUITE
      - AC-GOLDEN-A
      - AC-GOLDEN-B
      - AC-GOLDEN-C
    read_scope:
      - tests
      - worker
      - src
      - migrations
      - data/bom-snapshots
      - docs/product-recovery-coverage.md
    write_scope:
      - tests/quality/golden.test.ts
      - .github/workflows/quality.yml
      - docs
    forbidden_scope: []
    procedure:
      - Add golden fixtures for Projects A, B, C (clean, messy, derivative)
        covering ingestion → project page → BOM → sourcing plan → estimate →
        quote request.
      - "Assert completion floors per fixture: required fields, provenance,
        revision, license, BOM linked to revision, quantities + evidence,
        unresolved retained, page loads, sourcing consumes BOM, no
        placeholders."
      - Wire the suite into CI so a regression fails the run.
      - Produce a quality report artifact per run.
    commands:
      red:
        - grep -L 'golden' tests/quality/golden.test.ts
      green:
        - npm run typecheck && npm run test:unit && npm run test:worker
    expected_artifacts:
      - tests/quality/golden.test.ts
      - .github/workflows/quality.yml
    output_contract:
      - Suite exercises all three golden projects through the full spine.
      - Any completion-floor violation fails the run with a named assertion.
      - Report lists per-project status.
    progress_contract:
      checkpoint_every: per golden project added
      writes_incrementally: true
      command_timeout_seconds: 600
    manager_id: M-DIRECTOR
    risk: medium
    route:
      primary: claude-api:claude-fable-5
      fallback: gpt-5.5
    attempt_limit: 3
    stop_conditions:
      - All three golden projects pass
      - CI gate active
---

# 1. Goal and Requirements

Rebuild RoboPartPicker around the corrected product definition (docs/product-definition.md):
the robotics project is the main object; BOM compilation, sourcing optimization and firm
quote workflows are the spine. This plan rebuilds the implementation graph around the ten
revised units, starting with reconstruction (IU-PRODUCT-RECOVERY) so no worker improves a
feature it does not understand.

Non-goals: autonomous robot-design AI; live payment/checkout beyond explicit user-approved
quote handoff; production deployment of unfinished IU work.

Requirements REQ-WORKFLOW-SPINE … REQ-GOLDEN-PROJECTS are encoded in the frontmatter and
mapped to units: REQ-AGGREGATION→IU-PROJECT-CORPUS, REQ-BOM-COMPILER/REQ-BOM-HONESTY→
IU-BOM-COMPILER, REQ-SOURCING→IU-SOURCING-DATA+IU-SOURCING-OPTIMIZER, REQ-RFQ→IU-RFQ,
REQ-USER-SOURCING-CONTROLS→IU-SOURCING-OPTIMIZER(+IU-RFQ), REQ-LINEAGE→IU-PROJECT-GRAPH,
REQ-QUALITY-FLOORS/REQ-GOLDEN-PROJECTS→IU-QUALITY-RECOVERY, and the workflow spine spans
IU-PROJECT-PAGE and IU-PROJECT-CORPUS.

# 2. Grounding

> Platform gate (verified 2026-08-13): `npm run typecheck` and `npm run test:unit` pass
> here (5 files / 35 tests OK; typecheck exit 0). `npm run test:worker` cannot start in
> this sandbox: the @cloudflare/vitest-pool-workers miniflare pool fails with `write EPIPE`
> in `Runtime.updateConfig` before any test runs (the `workerd` subprocess cannot spawn
> here). The worker test (`tests/worker/api.test.ts`), `tests/worker/setup.ts`, and
> `vitest.worker.config.ts` (include `tests/worker/**`) all exist and are valid. Therefore
> any unit `command` listing `npm run test:worker` is an effective gate only where the
> Cloudflare pool starts (repo/CI); the locally runnable gates on this platform are
> `npm run typecheck` and `npm run test:unit`.

Repository facts (from docs/product-recovery-coverage.md, compiled 2026-08-12):

- 17 route files, ~200 endpoints; 14 migrations, ~190 tables.
- Projects/BOM/RPPS: projects, project_versions, boms, bom_versions, bom_items,
  bom_item_alternatives, rpps_releases, rpps_source_mappings, evidence.
- Catalog/sourcing: components*, manufacturers, suppliers, supplier_offers,
  offer_price_history (unused), supplier_metrics, canonical_match_candidates (unused),
  staging_* (dormant), data_conflicts.
- Import: import_sources/records/jobs/errors, github|rpps|bom|urdf|archive|files kinds.
- Builds/community/marketplace strong; RFQ draft-only (`draft_rfq` copies text, never
  sends); marketplace explicitly no-payment.
- Real-BOM harvest 2026-08-12: 25 projects / 401 components persisted; snapshot + restore
  script committed (data/bom-snapshots, scripts/restore-bom-snapshot.ts).

Baseline failure set (what is missing, per product definition): BOM completeness
assessment; sourcing optimizer; project procurement estimate; firm quote state machine;
user sourcing controls; project lineage; upstream sync/dedup; semantic regression suite.
Anything beyond this list that fails during execution is a NEW failure and must be reported.

# 3. Decisions and Evidence

- D1: Rebuild the graph from the coverage matrix first. Evidence: the matrix shows
  canonical_match_candidates and offer_price_history exist but are unconsumed — features
  cannot be "improved" without knowing what exists.
- D2: Keep the existing extractor as the BOM compiler foundation. Evidence:
  project-import.ts already parses github/rpps/bom/urdf/archive/files incl. UTF-16/TSV/xlsx
  (committed 2080c6e), so IU-BOM-COMPILER extends rather than replaces.
- D3: RFQ extends the existing draft_rfq/RfqComposer instead of a new surface. Evidence:
  worker/routes/ai.ts:382 and src/components/parts/RfqComposer.tsx are draft-only by
  design; deleting them would violate the no-deletion rule.
- D4: Offer price history is wired on update, never overwritten. Evidence: offer_price_history
  table exists (migrations/0002) but nothing writes it.
- D5: IU-CATALOG stays supporting, owned by the sourcing manager, and depends on IU-SOURCING-DATA so field floors/shape/load run after offer modeling; it never writes catalog route/repo files in parallel. Evidence: product
  definition §10 and the coverage matrix catalog row (strong, but floors/shape/load
  unverified).
- D6: Quality is a verify unit, not a review pass. Evidence: the skill forbids review
  units; golden fixtures are concrete artifacts.
- D7: Golden projects A/B/C are the acceptance spine. Evidence: product definition §12.

# 4. Units

Ten units, one per revised IU. Dependencies encode the graph: recovery grounds everything;
corpus/bom-compiler/graph/catalog/sourcing-data branch from it; project-page depends on
corpus+bom-compiler; optimizer on bom-compiler+sourcing-data; rfq on optimizer; quality
verifies with the golden projects. Managers: M-DIRECTOR (recovery+quality), M-CORPUS,
M-BOM, M-PAGE, M-SOURCING (data+optimizer+catalog), M-RFQ, M-GRAPH. Each unit names
read/write/forbidden scopes from the coverage matrix; parallel units never write the same
file.

# 5. Verification and Done

Done when: AC-COVERAGE-MATRIX through AC-QUALITY-SUITE all pass; all three golden projects
(A clean, B messy, C derivative) flow ingestion → project page → BOM → sourcing plan →
estimate → quote request; every completion floor in REQ-QUALITY-FLOORS is enforced by the
CI suite; and no acceptance criterion is weakened without a recorded reason (which voids
approval).

# 6. Risks and Recovery

- Optimizer/RFQ complexity (risk: high): bounded by deterministic fixture tests and
  objective-selectable implementation order; no live supplier integration required for the
  first version (hybrid RFQ queue path).
- D1 schema changes (risk: medium): every IU adds migrations, never edits existing ones;
  snapshots (data/bom-snapshots) + restore script allow rollback; worker tests run before
  and after.
- Unknown existing behavior (risk: medium): IU-PRODUCT-RECOVERY runs first and its matrix
  is incorporated into every later contract; any unfamiliar feature is reconstructed before
  modification (no-deletion rule).
- Stalls (risk: low-medium): every unit writes incrementally with checkpoint cadence and
  bounded commands so a wedged worker is distinguishable from steady progress.
- Production deploy (risk: accepted): not part of any unit; deploy only after approval.
