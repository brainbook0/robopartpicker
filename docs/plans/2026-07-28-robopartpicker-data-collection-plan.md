---
artifact_contract: agent-planning-system/v1
artifact_readiness: requirements-ready
plan_id: P-robopartpicker-data-collection-v1
plan_version: 6
planned_at_commit: b9e7449fcf2b3edff869943007347308ab7eee67
primary_planning_model: jcode-director
planning_model_receipt: unverified
approved: false
status: review-draft
created: '2026-07-28'
director: root-jcode-session
repo: C:/Users/Lenovo/Desktop/AI/robopartpicker
monthly_pilot_budget_usd: 50
requirements:
- requirement_id: R-001
  description: Maintain a versioned source registry with source identity, access method, owner, policy state, robots and terms
    status, copyright or reuse state, locale, cadence, rate budget, cost budget, and enabled or deferred lifecycle.
  unit_ids:
  - U-002
  - U-006
  - U-014
- requirement_id: R-002
  description: Preserve immutable raw source evidence or a policy-compliant immutable snapshot reference with retrieval metadata,
    content hash, MIME type, byte size, and retention state.
  unit_ids:
  - U-002
  - U-004
  - U-006
- requirement_id: R-003
  description: Persist every universal record-level provenance field required by the canonical inventory, including source,
    dates, language, region, applicable revision, schema and scraper versions, extraction method, import batch, conflicts,
    and supersession or withdrawal.
  unit_ids:
  - U-002
  - U-003
- requirement_id: R-004
  description: Represent each extracted field as a claim with value, normalized value and unit, confidence, evidence span
    or locator, and classification as officially stated, user-reported, measured, calculated, estimated, or AI-inferred.
  unit_ids:
  - U-002
  - U-003
  - U-011
- requirement_id: R-005
  description: Make prices, stock, availability, specifications, firmware, releases, project versions, source status, and
    other mutable facts append-only or revision-aware, never silently overwritten.
  unit_ids:
  - U-002
  - U-008
  - U-011
- requirement_id: R-006
  description: Extend canonical and staging models to cover every object family in inventory sections 1 through 38, either
    as a first-class type, a typed claim/evidence object, or an explicitly deferred unsupported state.
  unit_ids:
  - U-002
  - U-014
- requirement_id: R-007
  description: Version the external ingestion contract and preserve bounded batch validation, source-scoped idempotency, deterministic
    fingerprints, per-record errors, and backward compatibility during migration.
  unit_ids:
  - U-003
- requirement_id: R-008
  description: Keep external acquisition separate from canonical writes through raw import, validation, staging, deterministic
    candidates and conflicts, review or policy approval, canonical promotion, and audit.
  unit_ids:
  - U-003
  - U-005
  - U-011
  - U-012
- requirement_id: R-009
  description: Implement external source adapters behind common discovery, acquisition, snapshot, extraction, normalization,
    and submission interfaces rather than embedding broad crawling in the Cloudflare Worker.
  unit_ids:
  - U-006
  - U-007
  - U-008
  - U-009
  - U-010
- requirement_id: R-010
  description: Enforce a USD 50 monthly ceiling for AI model token spend with per-task and per-source attribution. Track Cloudflare
    infrastructure and paid source/API costs in separate bounded ledgers with alerts, explicit approval gates, and no automatic
    paid-tier upgrade.
  unit_ids:
  - U-006
  - U-008
  - U-013
- requirement_id: R-011
  description: Prove structured manufacturer, distributor, offer, price, and stock ingestion with official source attribution
    and time-series observations.
  unit_ids:
  - U-007
  - U-008
- requirement_id: R-012
  description: Ingest repositories and bounded relevant files by reference, including metadata, releases, revisions, BOMs,
    documentation, software, firmware, configuration, and build evidence without mirroring whole public repositories by default.
  unit_ids:
  - U-009
- requirement_id: R-013
  description: Discover and parse safe text-based robotics formats such as URDF, Xacro, SDF, SRDF, and MJCF while recording
    CAD and mesh metadata and failing closed for unsupported native or executable processing.
  unit_ids:
  - U-009
  - U-010
- requirement_id: R-014
  description: Provide bounded document extraction for HTML, Markdown, CSV, TSV, XLSX, JSON, YAML, XML, and policy-approved
    PDFs with evidence locators and resource limits.
  unit_ids:
  - U-004
  - U-009
  - U-010
- requirement_id: R-015
  description: Add deterministic normalization and identity resolution for units, manufacturers, part numbers, revisions,
    interfaces, currencies, component matches, alternatives, substitutions, and compatibility evidence without inventing uncertain
    identities.
  unit_ids:
  - U-011
- requirement_id: R-016
  description: Enforce source access and reuse policy before acquisition, with no bypass of authentication, paywalls, anti-bot
    controls, robots directives, or binding terms, and with metadata-only or deferred states for uncertain sources.
  unit_ids:
  - U-006
  - U-014
- requirement_id: R-017
  description: Treat scraped content, repositories, documents, media, files, uploads, and AI output as untrusted data with
    URL allowlists, size and type limits, archive protections, sanitization, prompt-injection isolation, and fail-closed parsing.
  unit_ids:
  - U-004
  - U-006
  - U-010
- requirement_id: R-018
  description: Add operational scheduling, leases, retries, exponential backoff, dead-letter handling, resumability, source
    circuit breakers, and idempotent recovery without duplicating canonical facts.
  unit_ids:
  - U-005
  - U-006
  - U-013
- requirement_id: R-019
  description: Provide an administrator review workflow that shows raw evidence, field claims, confidence, conflicts, policy
    state, revision context, and the exact canonical mutation before approval or rejection.
  unit_ids:
  - U-012
- requirement_id: R-020
  description: Model source withdrawal, record supersession, takedown, retention expiry, and retraction as auditable state
    transitions without deleting historical provenance silently.
  unit_ids:
  - U-002
  - U-004
  - U-011
  - U-012
- requirement_id: R-021
  description: Preserve original language, locale, region, currency, and units while producing normalized values, initially
    extracting English sources across globally relevant suppliers and projects.
  unit_ids:
  - U-002
  - U-006
  - U-008
  - U-011
- requirement_id: R-022
  description: Constrain AI extraction to proposals labeled AI-inferred with model and prompt version, evidence spans, field
    confidence, cost accounting, deterministic validation, and review or allowlisted promotion.
  unit_ids:
  - U-003
  - U-006
  - U-011
  - U-012
- requirement_id: R-023
  description: Provide fixture-based adapter, contract, database, security, parser, idempotency, time-series, conflict, withdrawal,
    budget, and end-to-end tests that do not depend on live targets or paid credentials.
  unit_ids:
  - U-003
  - U-004
  - U-005
  - U-006
  - U-007
  - U-008
  - U-009
  - U-010
  - U-011
  - U-012
  - U-013
  - U-015
- requirement_id: R-024
  description: Define additive D1 migrations, R2 retention, external worker deployment, secret handling, observability, canary
    rollout, rollback, and production STOP conditions that preserve the deployed v0.6 worktree.
  unit_ids:
  - U-001
  - U-002
  - U-005
  - U-013
  - U-016
- requirement_id: R-025
  description: Map all inventory sections and named source families to rollout waves, shared adapter families, policy requirements,
    and explicit deferments so no scope disappears silently.
  unit_ids:
  - U-014
- requirement_id: R-026
  description: Validate the pilot on five representative allowed sources spanning official manufacturer, structured distributor,
    repository, ROS or BOM file, and volatile offer or stock data.
  unit_ids:
  - U-007
  - U-008
  - U-009
  - U-014
  - U-015
  - U-016
- requirement_id: R-027
  description: Preserve the separate interactive project-import workflow and its existing deterministic safety behavior while
    sharing only deliberate low-level parsing or evidence primitives.
  unit_ids:
  - U-001
  - U-003
  - U-009
  - U-015
- requirement_id: R-028
  description: Require a reliable dirty-worktree manifest, secret preflight, provider-key rotation confirmation, and Jcode
    compatibility check before implementation or deployment begins.
  unit_ids:
  - U-001
  - U-013
  - U-016
- requirement_id: R-029
  description: Record missing information, unresolved identities, absent BOMs, unsupported formats, denied sources, and ambiguous
    claims explicitly instead of fabricating values.
  unit_ids:
  - U-002
  - U-009
  - U-010
  - U-011
  - U-014
- requirement_id: R-030
  description: Expose source, revision, evidence classification, confidence, freshness, conflicts, and withdrawal state through
    internal APIs and downstream catalog consumers without breaking current public behavior.
  unit_ids:
  - U-003
  - U-012
  - U-015
acceptance_examples:
- example_id: AE-001
  description: A source cannot be scheduled until its policy state, access method, rate and cost budget, user agent, cadence,
    and owner are populated; a denied source produces no fetch.
  unit_ids:
  - U-002
  - U-006
  - U-014
- example_id: AE-002
  description: Re-fetching unchanged content records a successful check but does not duplicate the immutable snapshot; changed
    content creates a new hash-addressed snapshot or compliant reference.
  unit_ids:
  - U-002
  - U-004
  - U-006
- example_id: AE-003
  description: A newly accepted import record contains every mandatory universal provenance field and rejects or quarantines
    records missing fields required for that source class.
  unit_ids:
  - U-002
  - U-003
- example_id: AE-004
  description: One actuator torque value is stored with original text, normalized value and unit, confidence, exact datasheet
    locator, and officially-stated classification; an inferred value remains separately AI-inferred.
  unit_ids:
  - U-002
  - U-003
  - U-011
- example_id: AE-005
  description: Two price or stock observations at different times coexist and the latest view is derived without overwriting
    either observation.
  unit_ids:
  - U-002
  - U-008
  - U-011
- example_id: AE-006
  description: Every canonical object family from the inventory has a documented storage path or explicit deferred and unsupported
    state in the coverage matrix.
  unit_ids:
  - U-002
  - U-014
- example_id: AE-007
  description: Replaying the same source-scoped idempotency key returns the existing job with no duplicate records; a newer
    contract version coexists with v1 during a documented compatibility window.
  unit_ids:
  - U-003
- example_id: AE-008
  description: A scraper batch produces staging and review data but no canonical mutation until an administrator or approved
    deterministic policy promotes it.
  unit_ids:
  - U-003
  - U-005
  - U-011
  - U-012
- example_id: AE-009
  description: A fixture source adapter can discover, fetch, snapshot, extract, normalize, and submit records through common
    interfaces without importing Cloudflare application internals.
  unit_ids:
  - U-006
  - U-007
  - U-008
  - U-009
  - U-010
- example_id: AE-010
  description: The scheduler refuses AI work that would exceed the USD 50 monthly AI-token ceiling. Independently, Cloudflare
    or paid-source/API envelope breaches pause only the affected cost class and report deferred freshness debt.
  unit_ids:
  - U-006
  - U-008
  - U-013
- example_id: AE-011
  description: A manufacturer specification and distributor offer for one component link to distinct evidence, while price
    and stock appear as timestamped observations.
  unit_ids:
  - U-007
  - U-008
- example_id: AE-012
  description: A GitHub fixture imports repository metadata, one BOM, one release, and bounded relevant files by path and
    commit hash without storing an entire clone in R2.
  unit_ids:
  - U-009
- example_id: AE-013
  description: A URDF fixture yields links, joints, limits, inertial data, mesh references, missing meshes, and unresolved
    component candidates; an unsupported native CAD file is recorded without execution.
  unit_ids:
  - U-009
  - U-010
- example_id: AE-014
  description: HTML, Markdown table, spreadsheet, JSON, YAML, XML, and PDF fixtures produce bounded claims with source locators;
    oversized or encrypted documents fail closed with typed errors.
  unit_ids:
  - U-004
  - U-009
  - U-010
- example_id: AE-015
  description: Deterministic unit and part-number normalization proposes a canonical match while ambiguous candidates remain
    unresolved with evidence and confidence.
  unit_ids:
  - U-011
- example_id: AE-016
  description: Robots or policy denial prevents acquisition and creates an auditable denied or deferred record without retry
    loops or hidden bypasses.
  unit_ids:
  - U-006
  - U-014
- example_id: AE-017
  description: Prompt-injection text, malicious HTML, archive bombs, traversal paths, oversized files, and unsafe URLs are
    rejected or isolated without reaching privileged prompts, tools, or canonical writes.
  unit_ids:
  - U-004
  - U-006
  - U-010
- example_id: AE-018
  description: A transient source failure retries within budget, enters a circuit breaker after threshold, lands in a dead-letter
    state after exhaustion, and resumes idempotently after operator action.
  unit_ids:
  - U-005
  - U-006
  - U-013
- example_id: AE-019
  description: The review UI displays side-by-side raw evidence, field claims, conflicts, and proposed mutations; rejecting
    a claim leaves canonical data unchanged and records the decision.
  unit_ids:
  - U-012
- example_id: AE-020
  description: A withdrawal event marks the prior record withdrawn, preserves history and conflict links, removes it from
    current recommendations where required, and records the policy reason.
  unit_ids:
  - U-002
  - U-004
  - U-011
  - U-012
- example_id: AE-021
  description: A non-USD offer and non-SI dimension retain original values while normalized currency and SI values include
    conversion source and timestamp.
  unit_ids:
  - U-002
  - U-006
  - U-008
  - U-011
- example_id: AE-022
  description: AI extraction cannot relabel itself as official or measured; model, prompt, extractor, evidence span, confidence,
    validation result, and cost are queryable.
  unit_ids:
  - U-003
  - U-006
  - U-011
  - U-012
- example_id: AE-023
  description: The named repository verification suite and new offline fixture suites pass from a clean test database without
    contacting live source websites.
  unit_ids:
  - U-003
  - U-004
  - U-005
  - U-006
  - U-007
  - U-008
  - U-009
  - U-010
  - U-011
  - U-012
  - U-013
  - U-015
- example_id: AE-024
  description: Additive migrations validate locally, rollback procedures are rehearsed on fixtures or disposable resources,
    canary metrics are defined, and no production deploy occurs without explicit approval.
  unit_ids:
  - U-001
  - U-002
  - U-005
  - U-013
  - U-016
- example_id: AE-025
  description: The coverage matrix accounts for inventory sections 1 through 38 and records adapter family, wave, access policy,
    extraction method, risk, and deferment reason for every named source family.
  unit_ids:
  - U-014
- example_id: AE-026
  description: Five allowed pilot sources complete acquisition through reviewed canonical promotion with complete provenance,
    idempotent replay, conflict handling, withdrawal simulation, and budget reporting.
  unit_ids:
  - U-007
  - U-008
  - U-009
  - U-014
  - U-015
  - U-016
- example_id: AE-027
  description: Existing interactive project-import worker tests continue to pass and external scraping cannot invoke its user-owned
    write path accidentally.
  unit_ids:
  - U-001
  - U-003
  - U-009
  - U-015
- example_id: AE-028
  description: Execution remains blocked until the dirty-file manifest is captured, exposed credentials are rotated, required
    secrets are available through secret managers, and Jcode compatibility is resolved or explicitly waived for planning-only
    work.
  unit_ids:
  - U-001
  - U-013
  - U-016
- example_id: AE-029
  description: A project with no reliable BOM creates a missing-information record and never receives an AI-invented BOM or
    fabricated component identity.
  unit_ids:
  - U-002
  - U-009
  - U-010
  - U-011
  - U-014
- example_id: AE-030
  description: Existing catalog endpoints remain backward compatible while internal or versioned responses can expose provenance,
    confidence, revision, conflicts, and freshness.
  unit_ids:
  - U-003
  - U-012
  - U-015
invariants:
- invariant_id: I-001
  description: External scraper and extractor processes never write canonical catalog rows directly.
  unit_ids:
  - U-003
  - U-005
  - U-006
  - U-007
  - U-008
  - U-009
  - U-010
  - U-011
  - U-012
  - U-015
  - U-016
- invariant_id: I-002
  description: No historical fact, source event, review decision, conflict, supersession, or withdrawal is silently overwritten
    or erased.
  unit_ids:
  - U-002
  - U-011
  - U-012
  - U-015
  - U-016
- invariant_id: I-003
  description: Officially stated, user-reported, measured, calculated, estimated, and AI-inferred evidence classifications
    remain distinct and auditable.
  unit_ids:
  - U-002
  - U-003
  - U-006
  - U-011
  - U-012
  - U-015
- invariant_id: I-004
  description: Repository, web, document, media, upload, and AI content is untrusted data and cannot supply system or developer
    instructions.
  unit_ids:
  - U-003
  - U-004
  - U-006
  - U-009
  - U-010
  - U-012
  - U-015
- invariant_id: I-005
  description: Source access never bypasses authentication, paywalls, anti-bot controls, robots directives, or binding terms.
  unit_ids:
  - U-006
  - U-007
  - U-008
  - U-009
  - U-014
  - U-016
- invariant_id: I-006
  description: Secrets are never stored in chat, plans, events, snapshots, fixtures, tracked files, D1 evidence, R2 evidence,
    or application logs.
  unit_ids:
  - U-001
  - U-003
  - U-006
  - U-013
  - U-016
- invariant_id: I-007
  description: Public repositories are referenced and fetched selectively; whole-repository mirroring is not the default storage
    model.
  unit_ids:
  - U-009
  - U-014
- invariant_id: I-008
  description: Unsupported native files fail closed and are never executed in the production Worker.
  unit_ids:
  - U-006
  - U-009
  - U-010
  - U-016
- invariant_id: I-009
  description: The pilot cannot schedule incremental paid work beyond USD 50 per calendar month without a new user decision.
  unit_ids:
  - U-006
  - U-008
  - U-013
  - U-016
- invariant_id: I-010
  description: Missing or ambiguous data remains missing or ambiguous until evidence supports resolution.
  unit_ids:
  - U-002
  - U-007
  - U-009
  - U-010
  - U-011
  - U-014
  - U-015
- invariant_id: I-011
  description: Existing interactive project import remains a separate user workflow with preserved authorization and deterministic
    safeguards.
  unit_ids:
  - U-001
  - U-003
  - U-009
  - U-015
- invariant_id: I-012
  description: No implementation, scraping, deployment, catalog population, destructive migration, or credential mutation
    occurs before consolidated approval.
  unit_ids:
  - U-001
  - U-016
units:
- unit_id: U-001
  title: Preserve the deployed baseline and clear execution preflights
  objective: Capture a reliable dirty-worktree and deployment preservation checkpoint, verify repository ownership and remote
    prerequisites, classify pre-existing failures, and keep execution blocked until secrets and Jcode compatibility are safe.
  acceptance:
  - A machine-readable changed-file manifest and preservation checkpoint identify deployed v0.6 work without resetting or
    overwriting it.
  - Git remote, repository visibility, Actions billing authority, Cloudflare plan, and secret owners are recorded as verified
    or explicit STOP conditions.
  - No secret value is printed or persisted.
  requirement_ids:
  - R-024
  - R-027
  - R-028
  acceptance_example_ids:
  - AE-024
  - AE-027
  - AE-028
  rationale: Every later writer depends on a trustworthy baseline and external scheduler authority.
  dependencies: []
  input_artifacts:
  - .agent-planning/artifacts/repository-grounding.json
  - docs/deployment.md
  - CHANGELOG.md
  inspect_targets:
  - AGENTS.md
  - package.json
  - wrangler.jsonc
  - docs/deployment.md
  - CHANGELOG.md
  - .git/config
  read_scope:
  - entire repository metadata and planning artifacts
  write_scope:
  - docs/operations/data-collection-preflight.md
  - .agent-planning/artifacts/execution-preflight.json
  forbidden_scope:
  - application source
  - migrations
  - secrets
  - production resources
  - git reset/clean/checkout of user work
  interfaces:
  - preflight artifact consumed by all implementation units
  - GitHub Actions and Cloudflare authority gates
  procedure:
  - Verify RTK availability and use only non-interactive commands.
  - Capture branch, HEAD, remotes, changed paths, untracked paths, deployed version, and planning-only changes.
  - Classify existing failures with fresh proportional checks without fixing unrelated work.
  - Verify secret names and owners without reading values.
  - Record GO or STOP for remote, billing, provider-key rotation, Cloudflare resources, and Jcode compatibility.
  - Verify the documented remote 0003 bootstrap compatibility path and record the preview and production migration-history
    state without modifying either database.
  - Verify authority and current Cloudflare support for D1 Time Travel or an equivalent recovery checkpoint before any production
    migration.
  forward_proof:
  - Preflight artifact contains all required gates and hashes.
  - A dry-run comparison proves no deployed v0.6 file was lost.
  - Preflight explicitly records the remote migration-compatibility result and GO/STOP state for production D1 recovery checkpoints.
  regression_proof:
  - Existing deployment documentation and current app files are byte-identical except approved planning or documentation additions.
  commands:
  - rtk git status
  - rtk git diff --name-only
  - rtk git remote -v
  - rtk npm run typecheck
  - rtk npm run contracts:validate
  output_artifacts:
  - docs/operations/data-collection-preflight.md
  - .agent-planning/artifacts/execution-preflight.json
  risk: high
  complexity: medium
  capability_profile:
    skills:
    - repository forensics
    - Cloudflare operations
    - secret hygiene
    context: large
    tools:
    - git
    - npm
    - wrangler
  primary_route: null
  fallback_route: null
  attempt_limit: 1
  escalation_conditions:
  - dirty manifest cannot be obtained
  - deployed source cannot be preserved
  - secret exposure is suspected
  - remote or billing authority is absent
  reviewer: independent release-safety reviewer
  stop_conditions:
  - Any destructive git operation would be required.
  - The exposed AI credential is not rotated before AI work.
  - Jcode compatibility remains unsafe for execution.
  completion_evidence:
  - preflight artifact hash
  - changed-path manifest
  - fresh command results
  - reviewer approval
  - remote migration-history report
  - D1 recovery-authority check
- unit_id: U-002
  title: Add the provenance, source-policy, claim, observation, and lifecycle schema
  objective: Create one additive D1 migration and domain documentation for source policy revisions, snapshots, field claims,
    mutable observations, conflicts, withdrawals, source-scoped missing information, budgets, and durable collection jobs
    while preserving existing canonical table ownership.
  acceptance:
  - Migration 0015 applies to a fresh and upgraded local database, advances schema validation and migration-count assertions
    from 14 to 15, and preserves all existing foreign keys.
  - Universal provenance and the six field classifications are represented in source/import-scoped field_claims without source-specific
    tables and without altering canonical evidence_claims.
  - Time-series, lifecycle, delisting, supersession, and withdrawal history are append-only and cannot be silently overwritten
    by schema design.
  - A documented D1 capacity model proves representative due-work, lineage, claim, current-observation, conflict, review,
    lease-expiry, and budget queries fit row, database, index, query-count, batch, and write budgets.
  - The schema covers every complete canonical-inventory requirement through line 1693 plus the known line-1694 fields for
    exact source, date, applicable version, and extraction metadata; the unknown truncated suffix remains explicitly deferred
    and is never invented.
  - Existing record_versions, technical_records, missing_information_*, evidence_claims, import_sources, import_jobs, and
    import_records retain their documented ownership and are linked only through additive source/import-scoped tables or optional
    promotion references.
  - Migration 0015 publishes exact source scheduling, lease, circuit-breaker, and three-class budget contracts consumed by
    U-006, U-008, U-013, and U-014.
  requirement_ids:
  - R-001
  - R-002
  - R-003
  - R-004
  - R-005
  - R-006
  - R-020
  - R-021
  - R-024
  - R-029
  acceptance_example_ids:
  - AE-001
  - AE-002
  - AE-003
  - AE-004
  - AE-005
  - AE-006
  - AE-020
  - AE-021
  - AE-024
  - AE-029
  rationale: All adapters and review flows need a common provenance substrate before source-specific work.
  dependencies:
  - U-001
  input_artifacts:
  - C:\Users\Lenovo\Desktop\AI\robopartpicker data collection.txt
  - docs/database-schema.md
  - migrations/0002_catalog_projects_and_boms.sql
  - migrations/0004_imports_ai_notifications_admin_and_search.sql
  - migrations/0006_import_ownership_and_file_uploads.sql
  - migrations/0014_cross_product_systems.sql
  - .agent-planning/artifacts/execution-readiness-recheck.json
  - .agent-planning/artifacts/U-002-corrected-rehearsal-reconciliation.json
  inspect_targets:
  - migrations/0001_auth_identity_and_files.sql through migrations/0014_cross_product_systems.sql
  - worker/services/ingestion.ts
  - worker/services/import-jobs.ts
  - worker/services/project-import.ts
  - scripts/reset-local-db.ts
  - scripts/validate-schema.ts
  - vitest.worker.config.ts
  - tests/worker/api.test.ts
  - docs/database-schema.md
  read_scope:
  - the exact named inventory and readiness/reconciliation artifacts
  - migrations 0001 through 0014
  - named database-facing Worker services and scripts
  - Worker D1 test configuration and existing API test
  - schema documentation
  write_scope:
  - migrations/0015_data_collection_provenance.sql
  - docs/database-schema.md
  - tests/worker/data-collection-provenance.test.ts
  - docs/database/data-collection-capacity.md
  - tests/worker/data-collection-capacity.test.ts
  - scripts/validate-schema.ts
  - tests/worker/api.test.ts
  forbidden_scope:
  - editing migrations 0001 through 0014
  - production or preview database mutation
  - source adapters
  - UI
  - changing existing Worker API behavior beyond the migration-count assertion
  - inventing the truncated inventory suffix
  interfaces:
  - Migration 0015 creates exactly source_collection_profiles, source_policy_revisions, source_snapshots, field_claims, temporal_observations,
    collection_missing_information, claim_conflict_sets, claim_conflict_members, collection_jobs, collection_budget_ledger,
    and collection_lifecycle_events.
  - source_collection_profiles references import_sources and stores source_tier official_manufacturer|authorized_distributor|repository|standards_reference|community|marketplace|media|other,
    policy_state unreviewed|approved_fixture_only|approved_live|denied|withdrawn, enabled, cadence_class manual|daily|weekly|monthly,
    next_due_at, freshness_target_seconds, freshness_debt_seconds, and circuit_state closed|open|half_open; import_sources
    remains the sole source-identity owner.
  - source_policy_revisions is append-only and records robots status, terms/reuse decision, approval authority reference,
    effective_at, and superseded_at without storing secret values.
  - source_snapshots hold bounded acquisition metadata, import_record_id when available, source_class, declared and detected
    MIME, byte_size, content_sha256, retained_object_key, immutable_external_url, retrieval metadata, retention_state active|retained|takedown_pending|takedown_complete|external_reference|metadata_only|rejected,
    and supersession links; multiple rows may share one content-addressed object key without duplicating bytes.
  - field_claims hold original and normalized values, unit, confidence, exact locator, and classification official|reported|measured|calculated|estimated|ai_inferred
    with an optional promoted_evidence_claim_id.
  - temporal_observations and collection_lifecycle_events are append-only and expose indexed current views without deleting
    history.
  - collection_missing_information is source/import scoped and may link through nullable promoted_request_id to user-facing
    missing_information_requests.
  - claim_conflict_sets and claim_conflict_members remain source/import scoped and may link through nullable promoted_data_conflict_id
    to canonical data_conflicts.
  - collection_jobs owns discovery/acquisition/parsing/submission state, uses table-qualified status values, stores lease_token,
    lease_owner, leased_at, lease_expires_at, attempt_count, backoff_until, and trace_id, and may set nullable import_job_id
    only after submission.
  - collection_budget_ledger is append-only with cost_class ai_token|cloudflare_infra|paid_source_api, nullable source_id,
    period_start, period_end, limit_microusd, consumed_microusd, projected_microusd, approval_state not_required|pending|approved|denied,
    paused_at, pause_reason, and trace_id; one cost class cannot borrow from another.
  - record_versions remains canonical application-entity versioning and technical_records remains canonical project/build/component
    outcome evidence; neither is altered by U-002.
  - Migration 0015 additively adds nullable trace_id columns to import_jobs, import_records, import_errors, and import_audit_events;
    staging tables resolve the trace through import_record_id. Existing ownership and behavior remain unchanged for v1 rows
    where trace_id is null.
  procedure:
  - Inventory every existing owner named in the readiness overlay, including record_versions, technical_records, missing_information_requests/responses/subscriptions,
    evidence_claims, data_conflicts, import_sources, import_jobs, and import_records; document why each new table is additive
    rather than duplicate ownership.
  - Treat complete inventory lines 1 through 1693 and the known line-1694 provenance prefix as normative. Record the unknown
    truncated suffix as a deferred inventory-tail item and do not infer it.
  - Create the eleven exactly named migration 0015 tables and their documented columns, checks, foreign keys, uniqueness constraints,
    and indexes. Do not invent alternate table names in consumers.
  - Keep collection_jobs as the complete acquisition lifecycle owner with states queued, leased, fetching, parsing, submitting,
    complete, failed, deferred, denied, and cancelled; qualify status columns by table in every join and set nullable import_job_id
    only after an ingestion handoff exists.
  - Use append-only rows for budgets, observations, source-policy revisions, lifecycle transitions, delisting, supersession,
    and withdrawal; derive current views by indexed ordering and never update historical fact values in place.
  - Create docs/database/ if absent, then write the capacity report and schema ownership map.
  - Create deterministic Worker-D1 fixtures rooted in one import_sources row, one import_jobs row, and at least two import_records.
    Insert all six claim classifications, two temporal observations, one withdrawal, all three budget cost classes, one expired
    lease, and revisions for price, stock, availability, specification, firmware, release, project version, source-policy
    status, and delisting; assert pre-revision rows remain queryable.
  - Run EXPLAIN QUERY PLAN for due work, lease expiry, budget projection, snapshot lineage, field claims, latest observations,
    open conflicts, and pending review. High-cardinality tables must report SEARCH USING an intended index and no unbounded
    SCAN at the expansion fixture.
  - Measure local D1 page_count multiplied by page_size before fixtures, after pilot fixtures, and after bounded-expansion
    fixtures. Record per-table row-width samples using length() for bounded text/JSON fields, index overhead, append-only
    write amplification, worst-case batch writes, and headroom against the 400 MiB design cap.
  - Update scripts/validate-schema.ts only to require migration 0015 and the eleven exact tables while retaining PRAGMA foreign_key_check
    and prior required tables. Update tests/worker/api.test.ts only to advance the migration-count assertion from 14 to 15.
  - Rehearse migration 0015 against fresh and ordinary upgraded local databases. Treat fresh remote migration lists, current
    recovery bookmarks, and remote-0003 freshness as U-001 completion evidence required before actual U-002 execution or any
    remote apply.
  - Add the four nullable trace_id columns in migration 0015 with lowercase-32-hex checks when non-null and indexes for job/audit
    lookup; do not rewrite historical rows or edit migrations 0001 through 0014.
  forward_proof:
  - Fresh and upgraded local migrations create the eleven exact new tables and indexes, schema validation reports 15 migrations,
    and PRAGMA foreign_key_check returns zero rows.
  - Fixtures prove official, reported, measured, calculated, estimated, and AI-inferred claims remain distinct and can optionally
    link to canonical evidence_claims only after promotion.
  - Fixtures prove two observations and every named mutable revision class coexist with their prior rows after current-state
    queries advance.
  - Fixtures prove collection jobs retain acquisition history, acquire one expiring lease atomically, recover the expired
    lease, and link to import_jobs only after submission, while denied or deferred jobs create no import job.
  - Fixtures independently cross ai_token, cloudflare_infra, and paid_source_api limits and prove only the matching class
    pauses with an append-only reason and freshness debt.
  - Capacity measurements and all eight representative query plans remain within the declared pilot and bounded-expansion
    budgets.
  - A coverage assertion in tests/worker/data-collection-provenance.test.ts records the truncated inventory tail as deferred
    instead of silently treating it as known or complete.
  - A migration fixture stores one lowercase 32-hex trace_id across import_jobs, import_records, import_errors, and import_audit_events,
    resolves it from staging through import_record_id, and leaves legacy null-trace rows valid.
  regression_proof:
  - Migrations 0001 through 0014 remain byte-identical and apply unchanged before 0015.
  - Foreign-key validation reports zero failures and every pre-existing required table remains present.
  - Existing Worker catalog/import behavior tests remain unchanged and passing; only the explicit migration-count assertion
    advances from 14 to 15.
  - The documented guarded remote-0003 path remains unchanged; no remote resource is contacted until U-001 authority and freshness
    gates pass.
  commands:
  - rtk npm run db:reset
  - rtk npm run db:validate
  - rtk npm run test:worker -- tests/worker/data-collection-provenance.test.ts tests/worker/data-collection-capacity.test.ts
    tests/worker/api.test.ts
  - rtk npm run typecheck
  output_artifacts:
  - migrations/0015_data_collection_provenance.sql
  - docs/database-schema.md exact ownership and consumer contract
  - Worker-D1 provenance, lease, and three-class budget fixture report
  - D1 capacity and query-plan report
  - schema validation and migration-count update
  - remote compatibility gate reference
  risk: high
  complexity: high
  capability_profile:
    skills:
    - SQLite/D1 modeling
    - temporal data
    - provenance systems
    context: large
    tools:
    - wrangler D1
    - Vitest
  primary_route: null
  fallback_route: null
  attempt_limit: 2
  escalation_conditions:
  - schema duplicates an existing owner
  - migration requires destructive rewrite
  - D1 limits make the model infeasible
  reviewer: independent database and provenance reviewer
  stop_conditions:
  - A prior migration must be edited.
  - Historical facts or revisions would be overwritten.
  - Raw large documents would be stored in D1.
  - A new table duplicates an existing canonical owner without a documented source/import boundary and promotion link.
  - Any required query full-scans a high-cardinality expansion table.
  - The truncated inventory suffix would need to be invented.
  - Any U-001 STOP gate remains unresolved at execution time.
  completion_evidence:
  - migration hash and byte-identity proof for migrations 0001 through 0014
  - fresh and upgrade migration logs showing 15 migrations
  - zero-row foreign-key report
  - reviewed schema ownership diagram
  - six-classification and append-only fixture report
  - capacity measurements and eight EXPLAIN plans
  - schema-validator and API migration-count diff
  - U-001 gate resolution references
- unit_id: U-003
  title: Introduce external ingestion contract v2 with backward compatibility
  objective: Add a bounded v2 batch contract for universal provenance, snapshot manifests, field claims, record lifecycle,
    and per-record errors while preserving the v1 endpoint and idempotency behavior.
  acceptance:
  - Contract v1 examples and tests remain valid.
  - Contract v2 rejects missing universal metadata, invalid evidence classes, oversized fields, and idempotency mismatches.
  - A v2 record stages without canonical mutation and retains complete lineage.
  - Every accepted v1 and v2 record type maps to typed staging, claim/evidence review storage, or an explicit unsupported/deferred
    state.
  - Nonexistent or entity-type-mismatched canonical references are rejected before review or promotion in both contract versions.
  - Version-1 requests are protected by explicit endpoint body, string, object-depth, and retained-payload limits with documented
    compatibility behavior.
  - Every v2 batch carries a lowercase 32-hex trace_id and may carry a validated W3C traceparent; the same trace_id reaches
    staging and audit rows.
  - Version-1 compatibility is bounded to a 1 MiB request body, 100 records, object depth 10, 256 properties per object, and
    64 KiB retained rawPayload per record; excess data receives a stable typed rejection or explicit metadata-only quarantine
    with no D1 evidence spill.
  requirement_ids:
  - R-003
  - R-004
  - R-007
  - R-008
  - R-022
  - R-023
  - R-027
  - R-030
  acceptance_example_ids:
  - AE-003
  - AE-004
  - AE-007
  - AE-008
  - AE-022
  - AE-023
  - AE-027
  - AE-030
  rationale: The external collector needs an explicit stable boundary before adapters are implemented.
  dependencies:
  - U-002
  input_artifacts:
  - contracts/import-batch.v1.schema.json
  - docs/data-ingestion-contract.md
  - worker/routes/imports.ts
  - worker/services/ingestion.ts
  inspect_targets:
  - contracts/import-batch.v1.schema.json
  - scripts/validate-contracts.ts
  - worker/routes/imports.ts
  - worker/services/ingestion.ts
  - tests/worker/api.test.ts
  read_scope:
  - contracts
  - import routes and services
  - contract tests
  write_scope:
  - contracts/import-batch.v2.schema.json
  - contracts/examples/import-batch.v2.json
  - scripts/validate-contracts.ts
  - worker/routes/imports.ts
  - worker/services/ingestion.ts
  - docs/data-ingestion-contract.md
  - tests/worker/import-contract-v2.test.ts
  forbidden_scope:
  - interactive project-import routes
  - canonical catalog tables outside reviewed promotion
  - secrets
  interfaces:
  - POST /api/v1/imports/batches version negotiation
  - source-scoped idempotency
  - v2 claim and snapshot schemas
  - v2 trace_id as lowercase 32 hexadecimal characters plus optional W3C traceparent propagation
  - Stable v2 error codes include UNSUPPORTED_SCHEMA_VERSION, INVALID_TRACE_ID, INVALID_TRACEPARENT, PAYLOAD_TOO_LARGE, RAW_PAYLOAD_TOO_LARGE,
    OBJECT_TOO_DEEP, TOO_MANY_PROPERTIES, CANONICAL_REFERENCE_NOT_FOUND, CANONICAL_REFERENCE_TYPE_MISMATCH, UNSUPPORTED_RECORD_TYPE,
    and IDEMPOTENCY_CONFLICT.
  procedure:
  - Define v2 JSON Schema with bounded arrays and strings and intentional additionalProperties behavior.
  - Add schema-version dispatch while retaining v1.
  - Validate record and claim semantics, normalized fingerprints, lifecycle events, and snapshot references.
  - Return stable per-record error codes and duplicate details.
  - Document compatibility and withdrawal-as-event semantics.
  - Inventory all legacy accepted record types and assign each a reviewed staging, typed-claim/evidence, or explicit unsupported/deferred
    path.
  - Validate claimed canonical dependencies by existence and entity type before staging and again before promotion.
  - Enforce a 1 MiB v1 request-body cap, 100-record cap, depth-10 and 256-properties-per-object caps, and 64 KiB retained
    rawPayload cap per record. Use stable typed rejection or metadata-only quarantine, document the compatibility/deprecation
    policy, and never spill oversized evidence into D1.
  - Validate or generate one trace_id per v2 batch, validate optional W3C traceparent, and persist the trace_id through import
    job, record, error, and audit events without logging service credentials.
  - Persist trace_id only through the nullable migration-0015 columns on import_jobs, import_records, import_errors, and import_audit_events;
    staging rows inherit trace context through import_record_id rather than adding unowned columns.
  forward_proof:
  - Valid v2 fixture stages source, record, claims, and snapshot manifest.
  - Invalid and malicious fixtures fail with typed errors and no partial canonical write.
  - Fixtures cover every legacy record type, including evidence, teardown, commercial_robot, and marketplace_reference, and
    prove none can become an unreviewable raw-only success.
  - Fixtures reject nonexistent and type-mismatched component, supplier, project, and BOM canonical references.
  - Oversized v1 rawPayload and excessive passthrough properties fail or quarantine with stable typed errors and no D1 evidence
    spill.
  - A fixture proves one trace_id is returned by the ingestion response and remains identical in staged records, import errors,
    and audit events; malformed trace identifiers fail with a typed error.
  - Boundary fixtures exercise exactly 1 MiB versus one byte over, depth 10 versus 11, 256 versus 257 properties, and 64 KiB
    rawPayload versus one byte over, with stable error codes and no partial writes.
  regression_proof:
  - Current v1 idempotency and approval tests pass.
  - Interactive project import tests remain passing.
  - All bounded valid v1 examples remain accepted under the documented compatibility policy.
  commands:
  - rtk npm run contracts:validate
  - rtk npm run test:worker -- tests/worker/import-contract-v2.test.ts
  - rtk npm run test:worker -- tests/worker/api.test.ts
  - rtk npm run typecheck
  - rtk npm run lint
  output_artifacts:
  - v2 schema and example
  - compatibility documentation
  - contract test report
  risk: high
  complexity: high
  capability_profile:
    skills:
    - JSON Schema
    - Hono/Zod
    - API compatibility
    - idempotency
    context: large
    tools:
    - TypeScript
    - Vitest
  primary_route: null
  fallback_route: null
  attempt_limit: 2
  escalation_conditions:
  - v1 compatibility cannot be maintained
  - field provenance cannot be represented without unbounded payloads
  reviewer: independent API contract reviewer
  stop_conditions:
  - The endpoint would fetch source URLs.
  - Unknown schema versions are accepted.
  - Raw content can reach privileged prompts.
  - An accepted record type has no reviewable storage or explicit unsupported state.
  - Version-1 compatibility requires unbounded retained payloads.
  completion_evidence:
  - schema validation output
  - v1 and v2 test logs
  - contract diff review
  - record-type disposition matrix
  - canonical-reference validation tests
  - v1 bounds decision
- unit_id: U-004
  title: Implement immutable evidence registration and R2 snapshot storage
  objective: Add content-addressed, policy-gated evidence registration and bounded R2 upload/reference flows with deduplication,
    retention metadata, and authorization.
  acceptance:
  - Identical evidence bytes deduplicate by SHA-256 and link to multiple records without duplicate objects.
  - Policy-denied or oversized evidence is recorded as external-reference, metadata-only, or rejected without hidden upload.
  - Evidence retrieval is authorized and never exposes arbitrary R2 keys.
  requirement_ids:
  - R-002
  - R-014
  - R-017
  - R-020
  - R-023
  acceptance_example_ids:
  - AE-002
  - AE-014
  - AE-017
  - AE-020
  - AE-023
  rationale: D1 cannot safely or economically retain large immutable raw documents.
  dependencies:
  - U-002
  - U-003
  input_artifacts:
  - worker/routes/files.ts
  - worker/db/repositories/files.ts
  - R2 binding configuration
  - docs/research/technical-findings.md Worker, R2, SSRF, and file-upload constraints plus cited primary sources
  inspect_targets:
  - worker/routes/files.ts
  - worker/db/repositories/files.ts
  - worker/middleware/authorization.ts
  - wrangler.jsonc
  - tests/worker/api.test.ts file and R2 cases
  - worker/services/project-import.ts archive and path protections
  read_scope:
  - file and R2 services
  - authorization
  - R2 tests
  - docs/research/technical-findings.md and its cited Worker/R2/file-upload primary sources
  write_scope:
  - worker/routes/source-evidence.ts
  - worker/services/source-evidence.ts
  - worker/router.ts
  - tests/worker/source-evidence.test.ts
  - contracts/evidence-registration.v1.schema.json
  - contracts/examples/evidence-registration.v1.json
  - docs/data-ingestion-contract.md
  forbidden_scope:
  - public R2 bucket exposure
  - whole-repository mirrors
  - native file execution
  - prior migrations
  interfaces:
  - contracts/evidence-registration.v1.schema.json defines snapshot manifest, retained-bytes registration, immutable external
    reference, SHA-256 content identity, retention state, and typed rejection
  - contracts/examples/evidence-registration.v1.json is the canonical collector fixture
  - Evidence source classes are structured_text (8 MiB), document (25 MiB), image (10 MiB), archive_or_cad (50 MiB), and media_or_other
    (external-reference or metadata-only; no retained upload). Each class has an explicit MIME allowlist and declared-versus-detected
    MIME check in the contract.
  - Retained bytes reuse the existing authorized FILES R2 binding under content-addressed key source-evidence/sha256/{first-two-hex}/{sha256};
    no new public bucket or arbitrary-key API is introduced.
  - Retention states are active, retained, takedown_pending, takedown_complete, external_reference, metadata_only, and rejected.
    Transitions are append-only collection_lifecycle_events; takedown removes or restricts bytes without deleting provenance
    rows.
  - authorized evidence metadata API
  - versioned collector evidence-registration handoff contract consumed by U-006
  procedure:
  - Encode the five exact source classes, byte caps, MIME allowlists, detected-MIME mismatch rejection, and external-reference-only
    classes in the machine-readable evidence contract.
  - 'Use a Worker-compatible bounded upload flow: reject from Content-Length when available, stream directly to the existing
    FILES binding without full-response buffering, compute or verify SHA-256 within the selected implementation''s documented
    CPU/memory envelope, and STOP for independent source verification if incremental hashing cannot be proven within Worker
    limits.'
  - Deduplicate by SHA-256 using migration 0015 source_snapshots metadata; multiple snapshot rows may reference one content-addressed
    object key without duplicate R2 bytes.
  - Support immutable external references with normalized HTTPS URL, source policy revision, retrieval metadata, and no claim
    that remote bytes are retained.
  - Apply only the exact append-only retention states and transitions; takedown never silently deletes provenance metadata.
  - Publish contracts/evidence-registration.v1.schema.json and its canonical example, validate both in tests/worker/source-evidence.test.ts,
    and record their hashes before U-006 begins.
  forward_proof:
  - Fixture upload, duplicate upload, denied MIME, oversized stream, external reference, and withdrawal all produce expected
    state.
  - Boundary fixtures cover each source class at its cap and one byte over, MIME mismatch, shared-object deduplication, every
    allowed retention transition, and forbidden transition rejection.
  regression_proof:
  - Existing user/project upload behavior and authorization tests remain passing.
  - Existing project-import archive, path, ownership, file-route, and R2 repository protections remain passing.
  commands:
  - rtk npm run test:worker -- tests/worker/source-evidence.test.ts tests/worker/api.test.ts
  - rtk npm run contracts:validate
  - rtk npm run typecheck
  - rtk npm run lint
  output_artifacts:
  - evidence service and route
  - R2 fixture report
  - contracts/evidence-registration.v1.schema.json
  - contracts/examples/evidence-registration.v1.json
  - retention contract update
  - producer artifact hashes
  risk: high
  complexity: high
  capability_profile:
    skills:
    - R2
    - streaming
    - content addressing
    - authorization
    context: medium
    tools:
    - Workers
    - Vitest
  primary_route: null
  fallback_route: null
  attempt_limit: 2
  escalation_conditions:
  - copyright policy cannot authorize retention
  - streaming hash cannot stay within Worker limits
  reviewer: independent storage and security reviewer
  stop_conditions:
  - Unbounded response buffering is introduced.
  - Evidence becomes publicly enumerable.
  - A downloaded file would execute.
  - The existing FILES binding cannot provide authorized non-enumerable access for the source-evidence prefix without a new
    approved storage design.
  completion_evidence:
  - R2 object/hash assertions
  - authorization tests
  - storage policy review
  - collector handoff contract hash
- unit_id: U-005
  title: Add dedicated asynchronous scrape-ingestion processing
  objective: Create dedicated Queue and D1 checkpoint processing for v2 normalization, matching, conflict generation, and
    review preparation using pointer messages and idempotent recovery.
  acceptance:
  - Queue messages obey a deliberate 64 KB internal cap, below Cloudflare's researched 128 KB platform maximum, and contain
    identifiers, hashes, attempts, trace IDs, and no evidence bytes.
  - Retries and dead-letter behavior preserve durable D1 job state and do not duplicate claims or canonical facts.
  - Existing project-import and AI queues remain behaviorally isolated.
  requirement_ids:
  - R-008
  - R-018
  - R-023
  - R-024
  acceptance_example_ids:
  - AE-008
  - AE-018
  - AE-023
  - AE-024
  rationale: Synchronous v2 processing would be constrained by Worker and D1 per-invocation limits.
  dependencies:
  - U-002
  - U-003
  input_artifacts:
  - worker/services/import-jobs.ts
  - worker/index.ts
  - worker/env.ts
  - wrangler.jsonc
  - docs/research/technical-findings.md Cloudflare Queue limits, pricing, and pointer-message decision plus cited primary
    sources
  inspect_targets:
  - worker/index.ts
  - worker/env.ts
  - worker/services/import-jobs.ts
  - worker/services/import-jobs.ts processQueueBatch ai-evaluation branch
  - wrangler.jsonc
  read_scope:
  - queue handlers
  - job services
  - Worker configuration
  write_scope:
  - worker/services/scrape-ingestion-jobs.ts
  - worker/index.ts
  - worker/env.ts
  - wrangler.jsonc
  - tests/worker/scrape-ingestion-queue.test.ts
  - docs/deployment.md
  forbidden_scope:
  - project-import queue semantics
  - AI evaluation retry policy
  - raw evidence in messages
  - production queue creation without approval
  interfaces:
  - SCRAPE_INGEST_QUEUE
  - SCRAPE_INGEST_DLQ
  - migration-0015 collection_jobs rows plus append-only collection_lifecycle_events are the only D1 scrape checkpoint owners;
    no second checkpoint table is created
  - queue consumer handler
  - discriminated ScrapeIngestionQueueMessage type
  - queue-name-aware dispatch and retry policy
  - lowercase 32-hex trace_id and optional W3C traceparent fields on every ScrapeIngestionQueueMessage
  - manual resume is an administrator-only operation that requires a terminal deferred|failed|denied job, records a resume
    lifecycle event, increments attempt_count, preserves trace_id and payload hash, and enqueues one pointer message idempotently
  procedure:
  - Define pointer message schema, exact byte measurement after JSON UTF-8 encoding, and attempt semantics; reject messages
    above the deliberate 65,536-byte internal cap even though the cited Cloudflare platform maximum is 131,072 bytes.
  - Add dedicated producer and consumer bindings by environment without creating any production queue before approval.
  - Checkpoint every phase by updating collection_jobs current state and appending collection_lifecycle_events before acknowledgement;
    never create a duplicate checkpoint table.
  - Implement bounded batches, backoff, dead-letter transitions, and the exact administrator-only idempotent manual-resume
    contract.
  - Add structured trace IDs and metrics.
  - Document the 65,536-byte internal design cap, 131,072-byte platform maximum, pointer-only rule, retry/DLQ policy, and
    manual-resume operation in docs/deployment.md with the Cloudflare Queues limits source.
  - Add discriminated queue-aware dispatch around the existing project-import and inline ai-evaluation branches in worker/services/import-jobs.ts
    so each message kind retains its schema and retry policy.
  - Carry the U-003 trace_id unchanged through producer, retries, dead-letter rows, resume, and queue audit events; validate
    optional W3C traceparent and never derive trace identifiers from secrets.
  forward_proof:
  - Queue fixture processes a batch, retries a transient failure, dead-letters a permanent failure, and resumes idempotently.
  - Boundary fixtures reject a message above 64 KB even though it is below the platform maximum and prove no raw evidence
    enters Queue bodies.
  - Retry, dead-letter, and resume fixtures preserve one identical trace_id from the accepted v2 batch through every queue
    checkpoint.
  - A fixture proves manual resume is denied for nonterminal jobs and non-admin actors, and repeated resume requests enqueue
    at most one pointer for the same job generation.
  regression_proof:
  - Existing queue tests and project-import behavior remain passing.
  - Wrangler dry-run validates all environments.
  - Dispatch tests prove project-import and AI-evaluation messages cannot enter the scrape handler and vice versa.
  commands:
  - rtk vitest run tests/worker/scrape-ingestion-queue.test.ts
  - rtk npm run test:worker
  - rtk npm run typecheck
  - rtk npx wrangler deploy --dry-run
  output_artifacts:
  - queue service
  - wrangler binding diff
  - retry/DLQ test report
  risk: high
  complexity: high
  capability_profile:
    skills:
    - Cloudflare Queues
    - idempotent workflows
    - D1 checkpoints
    context: large
    tools:
    - Wrangler
    - Vitest
  primary_route: null
  fallback_route: null
  attempt_limit: 2
  escalation_conditions:
  - queue operation budget is insufficient
  - retry ownership conflicts with existing queues
  reviewer: independent Cloudflare operations reviewer
  stop_conditions:
  - Message bodies carry evidence.
  - Consumer can acknowledge before durable checkpoint.
  - No DLQ or recovery path exists.
  completion_evidence:
  - queue fixture logs
  - Wrangler dry-run
  - idempotent recovery proof
  - reviewer approval
  - message-size boundary report
  - queue dispatch isolation matrix
- unit_id: U-006
  title: Build the portable external collector core and policy engine
  objective: Create a containerized Python collector with common adapter lifecycle, source policy, RFC 9309 robots handling,
    secure conditional HTTP, SSRF defenses, byte budgets, extraction manifests, cost accounting, and v2 submission.
  acceptance:
  - The collector runs from fixtures without network or paid credentials and emits deterministic batches validated by import-batch
    v2 and evidence-registration v1.
  - Denied robots, terms, private-network URLs, unsafe redirects, oversized responses, and exhausted class-local budgets fail
    closed with typed states.
  - One locked non-root container and stable CLI run locally and on any OCI runner; U-013 separately proves the GitHub Actions
    invocation.
  requirement_ids:
  - R-001
  - R-002
  - R-009
  - R-010
  - R-016
  - R-017
  - R-018
  - R-021
  - R-022
  - R-023
  acceptance_example_ids:
  - AE-001
  - AE-002
  - AE-009
  - AE-010
  - AE-016
  - AE-017
  - AE-018
  - AE-021
  - AE-022
  - AE-023
  rationale: Shared policy and acquisition controls must exist before individual source adapters.
  dependencies:
  - U-002
  - U-003
  - U-004
  - U-014
  input_artifacts:
  - docs/research/technical-findings.md
  - migrations/0015_data_collection_provenance.sql
  - docs/database-schema.md
  - contracts/import-batch.v2.schema.json
  - docs/data-ingestion-contract.md
  - contracts/evidence-registration.v1.schema.json
  - contracts/examples/evidence-registration.v1.json
  - config/data-collection/source-coverage.yaml
  - config/data-collection/field-coverage.yaml
  - config/data-collection/pilot-sources.yaml
  - config/data-collection/adapter-families.yaml
  inspect_targets:
  - package.json
  - .dev.vars.example variable names only
  - docs/data-ingestion-contract.md POST /api/v1/imports/batches, Authorization Bearer, and Idempotency-Key semantics
  - worker/services/project-import.ts for non-shared reference only
  read_scope:
  - exact producer contracts from U-002, U-003, U-004, and U-014
  - ingestion contract
  - technical findings
  - repository secret variable names without values
  write_scope:
  - collector/pyproject.toml
  - collector/uv.lock
  - collector/Dockerfile
  - collector/src/robopartpicker_collector/core/**
  - collector/src/robopartpicker_collector/cli.py
  - collector/tests/core/**
  - collector/tests/test_cli.py
  - collector/README.md
  - .dockerignore
  forbidden_scope:
  - Worker application internals as collector dependencies
  - live targets in tests
  - committed credentials
  - unbounded browser or file execution
  interfaces:
  - SourceAdapter protocol derived from config/data-collection/adapter-families.yaml
  - SourcePolicy result using migration 0015 source_tier and policy_state enums
  - SnapshotManifest conforming exactly to contracts/evidence-registration.v1.schema.json
  - ExtractedRecord v2 conforming exactly to contracts/import-batch.v2.schema.json
  - BudgetLedger with reserve(cost_class, source_id, projected_microusd, trace_id), commit(reservation_id, consumed_microusd),
    release(reservation_id, reason), and status(cost_class, source_id, period) semantics matching collection_budget_ledger
  - ingestion HTTP client for POST /api/v1/imports/batches with Authorization Bearer, mandatory matching Idempotency-Key,
    bounded retry, and no credential logging
  - stable collector CLI fixture-run contract consumed and extended by U-013
  procedure:
  - Before implementation, require every exact U-002/U-003/U-004/U-014 producer artifact to exist, parse, validate, and have
    a recorded hash; stop rather than inventing a missing dependency.
  - Verify and lock Python and parser dependency versions from primary sources.
  - Implement adapter discovery/fetch/snapshot/extract/normalize/submit stages against the exact adapter-family, v2, evidence,
    and source-policy contracts.
  - Implement RFC 9309 cache and separate terms/reuse approval state.
  - Implement conditional requests, Retry-After, jittered backoff, redirect and DNS/IP revalidation, streamed byte caps, and
    circuit breakers.
  - Implement BudgetLedger reservation, commit, release, and status for ai_token, cloudflare_infra, and paid_source_api without
    cross-class borrowing; the USD 50 monthly ceiling applies only to ai_token.
  - Build a non-root OCI image, stable fixture-run CLI, and offline fixture suite.
  - Generate snapshot manifests and submission fixtures from the exact U-004 evidence contract and fail contract drift in
    tests.
  - Validate v2 through the U-003-updated contracts:validate command and prove the HTTP client uses the documented endpoint,
    bearer credential, and idempotency contract without exposing credential values.
  forward_proof:
  - Offline fake source completes all stages and submits a validated v2 fixture plus a matching evidence-registration fixture.
  - Security and budget fixtures cover denial, 304, 429, redirect, private IP, oversized response, and independent class-local
    cost ceilings.
  - Collector evidence references register successfully against the U-004 fixture API with identical hashes, retention states,
    and deduplication semantics.
  - CLI and OCI fixtures produce the same deterministic output and no Worker source import is present.
  regression_proof:
  - Collector has no import dependency on Worker source.
  - Repository application checks remain unaffected.
  commands:
  - rtk test python -m pytest collector/tests/core
  - rtk test python -m build collector
  - rtk docker build -f collector/Dockerfile collector
  - rtk npm run contracts:validate
  output_artifacts:
  - locked collector package
  - OCI image digest
  - offline security test report
  - adapter SDK documentation
  risk: high
  complexity: high
  capability_profile:
    skills:
    - Python
    - HTTP
    - robots
    - SSRF prevention
    - containers
    - budget systems
    context: large
    tools:
    - pytest
    - Docker
  primary_route: null
  fallback_route: null
  attempt_limit: 2
  escalation_conditions:
  - exact dependency sources cannot be verified
  - secure DNS/redirect validation is unavailable
  - runner cost cannot be bounded
  reviewer: independent acquisition security reviewer
  stop_conditions:
  - Any exact producer artifact is absent, invalid, unhashed, or has unresolved contract drift.
  - Tests require live targets.
  - The collector can reach private networks.
  - Budget enforcement is advisory only or allows cross-class borrowing.
  - Secrets enter artifacts or logs.
  - The Worker evidence handoff contract is absent or has unresolved drift.
  completion_evidence:
  - lockfile and image digest
  - offline pytest results
  - security fixture matrix
  - contract submission trace
  - evidence handoff conformance trace
- unit_id: U-007
  title: Implement the official manufacturer pilot adapter
  objective: Add one policy-approved official manufacturer adapter that extracts component revisions, specifications, datasheet
    locators, files, and official claims through the common collector SDK.
  acceptance:
  - Adapter fixtures produce revision-aware component and official-claim records with exact evidence locators.
  - Changed and unchanged source fixtures demonstrate content hashing and conditional acquisition.
  - Missing values remain absent or explicit missing-information records.
  requirement_ids:
  - R-009
  - R-011
  - R-023
  - R-026
  acceptance_example_ids:
  - AE-009
  - AE-011
  - AE-023
  - AE-026
  rationale: An official source proves high-confidence specification extraction before broader manufacturer fan-out.
  dependencies:
  - U-006
  input_artifacts:
  - manufacturer fixture selected during source preflight
  - canonical component fields
  - collector SDK
  inspect_targets:
  - collector adapter interfaces
  - component schema and current canonical component model
  read_scope:
  - collector core
  - component contracts
  - fixture source evidence
  write_scope:
  - collector/src/robopartpicker_collector/adapters/manufacturer_pilot.py
  - collector/tests/adapters/test_manufacturer_pilot.py
  - collector/tests/fixtures/manufacturer_pilot/**
  - docs/sources/manufacturer-pilot.md
  forbidden_scope:
  - live crawling in tests
  - AI-inferred official labels
  - source-specific canonical writes
  interfaces:
  - SourceAdapter
  - component and component-revision v2 records
  - field claims
  procedure:
  - Complete source-specific policy preflight and fixture capture with approved reuse.
  - Map official identifiers and revisions deterministically.
  - Extract bounded fields and evidence locators.
  - Emit missing information and file references explicitly.
  - Test change detection and parser drift.
  forward_proof:
  - Fixture emits component, revision, at least ten typed claims, and one datasheet reference with complete provenance.
  regression_proof:
  - Collector core security tests remain passing.
  - No canonical application file is modified.
  commands:
  - rtk test python -m pytest collector/tests/adapters/test_manufacturer_pilot.py
  - rtk npm run contracts:validate
  output_artifacts:
  - manufacturer adapter
  - approved fixtures
  - field mapping
  - adapter report
  risk: medium
  complexity: medium
  capability_profile:
    skills:
    - HTML/API extraction
    - robotics specifications
    - fixture design
    context: medium
    tools:
    - pytest
  primary_route: null
  fallback_route: null
  attempt_limit: 2
  escalation_conditions:
  - source policy is not approved
  - source layout cannot yield stable evidence locators
  reviewer: independent source-adapter reviewer
  stop_conditions:
  - Robots or terms disallow acquisition.
  - The adapter guesses a revision or measurement.
  completion_evidence:
  - policy preflight
  - fixture hashes
  - adapter tests
  - sample v2 batch
- unit_id: U-008
  title: Implement the structured distributor and volatile offer pilot adapter
  objective: Add one approved distributor or catalog adapter that links products to suppliers and appends price, currency,
    stock, availability, lead-time, region, and offer observations.
  acceptance:
  - Two temporal fixtures append distinct price and stock observations without overwriting history.
  - Currency, region, seller, authorization, condition, and retrieval context remain explicit.
  - Rate and cost limits defer work before overage.
  requirement_ids:
  - R-005
  - R-009
  - R-010
  - R-011
  - R-021
  - R-023
  - R-026
  acceptance_example_ids:
  - AE-005
  - AE-009
  - AE-010
  - AE-011
  - AE-021
  - AE-023
  - AE-026
  rationale: Volatile supplier data validates time-series and budget semantics.
  dependencies:
  - U-002
  - U-006
  - U-014
  input_artifacts:
  - config/data-collection/pilot-sources.yaml#distributor_pilot
  - config/data-collection/field-coverage.yaml
  - migrations/0015_data_collection_provenance.sql
  - contracts/import-batch.v2.schema.json
  - collector/src/robopartpicker_collector/core/**
  - collector/src/robopartpicker_collector/cli.py
  inspect_targets:
  - migration 0015 temporal_observations and collection_budget_ledger
  - import-batch v2 supplier, offer, price-observation, stock-observation, and lifecycle record definitions
  - collector SourceAdapter and BudgetLedger interfaces
  - pilot-sources.yaml distributor_pilot policy and fixture fields
  read_scope:
  - exact U-002, U-006, and U-014 producer artifacts
  - offer and supplier schema definitions
  - named disabled distributor pilot entry
  write_scope:
  - collector/src/robopartpicker_collector/adapters/distributor_pilot.py
  - collector/tests/adapters/test_distributor_pilot.py
  - collector/tests/fixtures/distributor_pilot/**
  - docs/sources/distributor-pilot.md
  forbidden_scope:
  - checkout or purchase actions
  - unapproved marketplace scraping
  - silent currency conversion
  interfaces:
  - SourceAdapter
  - BudgetLedger
  - supplier, offer, price-observation, and stock-observation v2 records
  - ISO-8601 UTC observed_at, BCP-47 locale, ISO-4217 currency, source_supplier_id, source_manufacturer_id, and preserved
    original labels
  procedure:
  - Read the exact disabled distributor_pilot entry. If candidate identity, fixture directory, cost class, or policy-preflight
    requirement is missing, stop. Do not substitute another source.
  - Perform and persist the source-specific access, robots/terms/reuse, quota, and cost preflight only after the separate
    live-source approval gate. If approval is denied or unavailable, mark the pilot deferred and write no adapter acquisition
    logic.
  - Normalize supplier and manufacturer identifiers deterministically while preserving source IDs and original labels.
  - Emit each volatile observation with ISO-8601 UTC timestamp, BCP-47 locale, ISO-4217 currency, region, seller, authorization,
    condition, and retrieval context.
  - Reserve paid_source_api and cloudflare_infra budget before any approved call; record ai_token as zero unless an explicitly
    approved model step is invoked. Never borrow between cost classes.
  - Test unavailable, delisted, out-of-stock, changed-price, changed-stock, and withdrawal states with two temporal fixtures
    that append rather than overwrite.
  - Record the field map, policy decision, exact fixture hashes, budget trace, and independent reviewer checklist in docs/sources/distributor-pilot.md.
  forward_proof:
  - Fixture replay produces stable entities plus multiple temporal observations and a withdrawal/delisting event with exact
    v2 validation.
  - Budget fixtures pause only the breached paid_source_api or cloudflare_infra class and record ai_token=0 for deterministic
    parsing.
  - The named pilot remains disabled until the separate live-source approval and source-policy evidence are present.
  regression_proof:
  - No existing price history is overwritten.
  - Core policy and all three budget-class tests remain passing.
  - No purchase, checkout, seller messaging, or unapproved source substitution is reachable.
  commands:
  - rtk test python -m pytest collector/tests/adapters/test_distributor_pilot.py
  - rtk npm run contracts:validate
  output_artifacts:
  - distributor adapter
  - temporal fixtures
  - budget trace
  - sample v2 batch
  risk: medium
  complexity: medium
  capability_profile:
    skills:
    - catalog APIs
    - time-series offers
    - currency/region data
    context: medium
    tools:
    - pytest
  primary_route: null
  fallback_route: null
  attempt_limit: 2
  escalation_conditions:
  - approved interface is unavailable
  - quota or cost exceeds pilot budget
  reviewer: independent offer-data reviewer
  stop_conditions:
  - Adapter can purchase or message sellers.
  - Price observations overwrite earlier rows.
  - Currency conversion lacks source and timestamp.
  completion_evidence:
  - policy and quota preflight
  - temporal test results
  - cost ledger
  - reviewed field map
- unit_id: U-009
  title: Implement bounded GitHub, ROS, BOM, and repository-file ingestion
  objective: Build the repository pilot adapter using versioned GitHub APIs, conditional requests, truncation-aware tree traversal,
    bounded relevant-file discovery, BOM extraction, and project/release/software evidence while preserving interactive project
    import separation.
  acceptance:
  - A repository fixture imports metadata, commit, release, license, one BOM, and bounded relevant files by path and hash
    without an archive mirror.
  - Truncated trees, large files, missing BOMs, submodules, symlinks, and unsafe paths produce explicit states.
  - The external adapter pins the current API version while existing project import remains unchanged.
  requirement_ids:
  - R-009
  - R-012
  - R-013
  - R-014
  - R-023
  - R-026
  - R-027
  - R-029
  acceptance_example_ids:
  - AE-009
  - AE-012
  - AE-013
  - AE-014
  - AE-023
  - AE-026
  - AE-027
  - AE-029
  rationale: Repository ingestion unlocks projects, BOMs, software, firmware, build evidence, and robot descriptions with
    one shared adapter.
  dependencies:
  - U-006
  input_artifacts:
  - GitHub API 2026-03-10 docs
  - worker/services/project-import.ts as compatibility evidence
  - repository and BOM fixtures
  inspect_targets:
  - worker/services/project-import.ts
  - worker/services/import-jobs.ts
  - standards/rpps
  - current project/BOM schemas
  read_scope:
  - interactive project import for boundaries
  - project and BOM models
  - collector core
  write_scope:
  - collector/src/robopartpicker_collector/adapters/github_repository.py
  - collector/src/robopartpicker_collector/parsers/bom.py
  - collector/tests/adapters/test_github_repository.py
  - collector/tests/fixtures/github_repository/**
  - docs/sources/github-repository.md
  forbidden_scope:
  - worker/services/project-import.ts
  - repository archive mirroring
  - unsafe symlink traversal
  - live GitHub tests
  interfaces:
  - GitHub REST 2026-03-10 client
  - repository/file/project/BOM/software v2 records
  - bounded relevant-path rules
  procedure:
  - Implement authenticated conditional API client with pagination, serialized concurrency, retry headers, and version provenance.
  - Use contents and tree APIs and detect truncation.
  - Select relevant engineering files by allowlisted path, type, size, and project context.
  - Parse CSV, TSV, XLSX, Markdown, JSON, and YAML BOM candidates deterministically.
  - Emit missing BOM and unresolved part identities explicitly.
  - Prove no dependency on interactive project-import writes.
  forward_proof:
  - Fixture imports repository, release, BOM, files, and missing-information records with commit and path lineage.
  regression_proof:
  - Existing interactive project-import safety tests pass unchanged.
  - No archive or whole-repository object appears in R2 fixtures.
  commands:
  - rtk test python -m pytest collector/tests/adapters/test_github_repository.py
  - rtk vitest run tests/worker/api.test.ts
  - rtk npm run contracts:validate
  output_artifacts:
  - repository adapter
  - BOM parser
  - truncation fixtures
  - compatibility proof
  risk: high
  complexity: high
  capability_profile:
    skills:
    - GitHub REST
    - repository graphs
    - BOM parsing
    - path security
    context: large
    tools:
    - pytest
    - Vitest
  primary_route: null
  fallback_route: null
  attempt_limit: 2
  escalation_conditions:
  - GitHub API version support conflicts with current docs
  - tree truncation cannot be bounded
  - repository license or terms block file retention
  reviewer: independent repository-ingestion reviewer
  stop_conditions:
  - Whole archives are mirrored by default.
  - Interactive project-import code must change.
  - Unsafe paths or symlinks can escape the extraction root.
  completion_evidence:
  - API fixture traces
  - bounded file manifest
  - BOM parser tests
  - interactive import regression tests
- unit_id: U-010
  title: Implement safe document and robotics-description parser pack
  objective: Add bounded parsers for HTML, Markdown, CSV, TSV, XLSX, JSON, YAML, XML, policy-approved PDF text, URDF, Xacro,
    SDF, SRDF, and MJCF, with metadata-only handling for native CAD and meshes.
  acceptance:
  - Each supported fixture emits evidence-located claims or robot-structure records under size and complexity limits.
  - XXE, unsafe YAML, CSV formulas, traversal references, archive bombs, encrypted PDFs, and unsupported native files fail
    closed.
  - Robot descriptions retain units, links, joints, limits, inertial data, mesh references, and missing assets.
  requirement_ids:
  - R-009
  - R-013
  - R-014
  - R-017
  - R-023
  - R-029
  acceptance_example_ids:
  - AE-009
  - AE-013
  - AE-014
  - AE-017
  - AE-023
  - AE-029
  rationale: Shared safe parsers prevent each adapter from reimplementing risky file handling.
  dependencies:
  - U-004
  - U-006
  input_artifacts:
  - canonical file-format inventory
  - OWASP file guidance
  - existing fflate/yaml/urdf-loader usage
  inspect_targets:
  - sandbox/import_processor.py
  - worker/services/project-import.ts
  - package.json parser dependencies
  - standards/rpps
  read_scope:
  - existing safe parser patterns
  - collector core
  - format fixtures
  write_scope:
  - collector/src/robopartpicker_collector/parsers/**
  - collector/tests/parsers/**
  - collector/tests/fixtures/parsers/**
  - docs/data-collection/parser-matrix.md
  forbidden_scope:
  - native CAD execution
  - arbitrary shell commands
  - network access from parsers
  - unsafe deserialization
  interfaces:
  - Parser protocol
  - EvidenceSpan
  - RobotDescription
  - UnsupportedFormat record
  procedure:
  - Source-verify and lock parser libraries and licenses.
  - Define per-format size, node, depth, sheet, row, cell, page, and expansion limits.
  - Disable external entities and unsafe constructors.
  - Normalize evidence locators by path, sheet/cell, JSON pointer, XML path, page, line, or joint/link identifier.
  - Parse robot hierarchy and missing external assets without fetching them implicitly.
  - Add malicious and boundary fixtures.
  forward_proof:
  - Supported fixture matrix passes and produces deterministic records.
  - Malicious fixture matrix fails with typed errors and no side effects.
  regression_proof:
  - Collector security suite remains passing.
  - Existing project-import parser behavior remains unchanged.
  commands:
  - rtk test python -m pytest collector/tests/parsers
  - rtk npm run test:unit
  - rtk npm run typecheck
  output_artifacts:
  - parser pack
  - locked dependencies
  - parser support matrix
  - malicious fixture report
  risk: high
  complexity: high
  capability_profile:
    skills:
    - secure parsing
    - robotics formats
    - PDF/spreadsheet/XML security
    context: large
    tools:
    - pytest
  primary_route: null
  fallback_route: null
  attempt_limit: 2
  escalation_conditions:
  - parser library license is incompatible
  - safe resource limits cannot be enforced
  - native format requires execution
  reviewer: independent parser security reviewer
  stop_conditions:
  - Parser performs network I/O.
  - External entities or unsafe YAML are enabled.
  - Unsupported native files execute.
  completion_evidence:
  - dependency source record
  - fixture matrix
  - resource-limit tests
  - security review
- unit_id: U-011
  title: Implement normalization, identity candidates, conflicts, and lifecycle services
  objective: Create deterministic services for units, currencies, names, part numbers, revisions, component candidates, alternatives,
    substitutions, claim conflicts, supersession, withdrawal, and missing information.
  acceptance:
  - Normalization preserves original values and records conversion source and time.
  - Ambiguous identities create ranked candidates and unresolved states, never forced matches.
  - Conflicts and withdrawals preserve all prior evidence and current-view semantics.
  requirement_ids:
  - R-004
  - R-005
  - R-008
  - R-015
  - R-020
  - R-021
  - R-022
  - R-023
  - R-029
  acceptance_example_ids:
  - AE-004
  - AE-005
  - AE-008
  - AE-015
  - AE-020
  - AE-021
  - AE-022
  - AE-023
  - AE-029
  rationale: Canonical promotion needs deterministic, evidence-preserving decisions separate from source extraction.
  dependencies:
  - U-002
  - U-003
  input_artifacts:
  - worker/services/ingestion.ts
  - canonical_match_candidates
  - data_conflicts
  - technical decisions
  inspect_targets:
  - worker/services/ingestion.ts
  - worker/routes/imports.ts approval flow
  - migrations/0004 and 0005
  - current unit/currency helpers
  read_scope:
  - ingestion and matching services
  - catalog entities
  - database schema
  write_scope:
  - worker/services/data-normalization.ts
  - worker/services/identity-resolution.ts
  - worker/services/claim-conflicts.ts
  - worker/services/record-lifecycle.ts
  - tests/worker/data-normalization.test.ts
  - tests/worker/identity-resolution.test.ts
  forbidden_scope:
  - source fetching
  - review UI
  - automatic promotion policy
  - prior migrations
  interfaces:
  - NormalizedClaim
  - MatchCandidate
  - ConflictSet
  - LifecycleTransition
  procedure:
  - Define stable normalization registries and provenance for conversions.
  - Generate deterministic fingerprints and ranked candidates.
  - Keep AI candidate signals separate from deterministic scores.
  - Model conflict detection and resolution without deleting claims.
  - Implement supersession, withdrawal, and missing-information transitions.
  - Add state-space tests for repeated, conflicting, and out-of-order events.
  - Exercise append-only state transitions for firmware, releases, project versions, availability, source status, and delisting
    in addition to offer observations.
  - Preserve validated canonical dependency type and existence evidence through candidate generation and lifecycle transitions.
  forward_proof:
  - Fixtures cover exact match, ambiguous match, conflicting claims, replacement, withdrawal, and missing data.
  - State-space fixtures cover every mutable class named by R-005 and out-of-order delisting or source-policy changes.
  - Identity fixtures prove nonexistent and wrong-type canonical references never become candidates or canonical links.
  regression_proof:
  - Existing normalizedName and import candidate behavior remains compatible or is migrated with tests.
  commands:
  - rtk vitest run tests/worker/data-normalization.test.ts tests/worker/identity-resolution.test.ts
  - rtk npm run test:worker
  - rtk npm run typecheck
  output_artifacts:
  - normalization services
  - state-space test matrix
  - conversion registry documentation
  risk: high
  complexity: high
  capability_profile:
    skills:
    - entity resolution
    - temporal conflicts
    - units/currency
    - property testing
    context: large
    tools:
    - TypeScript
    - Vitest
  primary_route: null
  fallback_route: null
  attempt_limit: 2
  escalation_conditions:
  - canonical identity rules are underspecified
  - normalization would discard original evidence
  reviewer: independent data-quality reviewer
  stop_conditions:
  - Ambiguous matches auto-promote.
  - Original values are discarded.
  - Withdrawals delete history.
  completion_evidence:
  - state-space test report
  - determinism proof
  - conflict lifecycle examples
  - reviewer approval
  - mutable-class coverage matrix
  - canonical dependency type-check report
- unit_id: U-012
  title: Extend administrator review and provenance APIs/UI
  objective: Expose field claims, raw evidence, policy state, revisions, conflicts, lifecycle, AI provenance, and exact proposed
    canonical mutations in review APIs and administrator UI with authorized approve, reject, defer, and conflict actions.
  acceptance:
  - Reviewer can inspect evidence and proposed mutations before any canonical write.
  - Reject and defer leave canonical data unchanged and create audit events.
  - Current public APIs remain compatible while versioned/internal responses expose provenance and freshness.
  requirement_ids:
  - R-008
  - R-019
  - R-020
  - R-022
  - R-023
  - R-030
  acceptance_example_ids:
  - AE-008
  - AE-019
  - AE-020
  - AE-022
  - AE-023
  - AE-030
  rationale: Human review is the pilot trust gate and needs claim-level context rather than record-level JSON alone.
  dependencies:
  - U-003
  - U-004
  - U-011
  input_artifacts:
  - worker/routes/imports.ts
  - src/pages/ImportJobs.tsx and src/App.tsx import routes
  - src/lib/api/systems.ts current importJobsApi
  - worker/middleware/authorization.ts
  - U-003 v2 contract, U-004 evidence contract, and U-011 claim-service interfaces
  inspect_targets:
  - worker/routes/imports.ts
  - worker/middleware/authorization.ts
  - src/App.tsx /imports and /imports/:jobId routes
  - src/pages/ImportJobs.tsx
  - src/lib/api/systems.ts importJobsApi
  - tests/worker/api.test.ts
  read_scope:
  - admin routes and UI
  - authorization
  - catalog API contracts
  write_scope:
  - worker/routes/imports.ts
  - worker/routes/catalog.ts
  - src/lib/api/imports.ts
  - src/components/admin/data-review/**
  - src/pages/ImportJobs.tsx
  - tests/worker/import-review-v2.test.ts
  - tests/ui/data-review.test.tsx
  forbidden_scope:
  - anonymous evidence access
  - automatic policy enablement
  - secret display
  - unreviewed canonical writes
  interfaces:
  - administrator review detail endpoint returns record, ordered field claims, evidence metadata references, conflict sets,
    lifecycle events, AI provenance labels, exact proposed mutation diff, and originating lowercase 32-hex trace_id; previews
    are UTF-8 text only, at most 16 KiB per item and 64 KiB total, with binary/oversized evidence represented by authorized
    metadata links
  - approve command accepts create|merge plus expected_diff_hash, revalidates canonical references, applies exactly the displayed
    mutation, and records decision/audit rows
  - reject command requires a bounded reason, records a decision, and never mutates canonical data
  - defer command requires reason and optional review_after, moves only review state to deferred, appends lifecycle/audit
    rows, and never mutates canonical data
  - conflict command requires claim IDs and conflict_type, creates or attaches a U-011 claim_conflict_set, leaves the record
    in review, and never mutates canonical data
  - versioned/internal catalog provenance response preserves existing public response shapes
  procedure:
  - Extend the existing /imports/:jobId ImportJobs surface and add focused data-review components; do not create or reference
    a nonexistent Admin.tsx page.
  - Implement the exact bounded review DTO and authorized evidence metadata links.
  - Compute a deterministic mutation diff and hash server-side, display it before approval, and require expected_diff_hash
    on approve to prevent stale review writes.
  - Implement the exact approve, reject, defer, and conflict state transitions and audit semantics without canonical mutation
    from reject/defer/conflict.
  - Add conflict grouping, lifecycle context, AI-inferred labels, and trace propagation.
  - Enforce moderator read access and administrator mutation access using existing authorization middleware; preserve constant-time
    service credential behavior and never display secrets.
  - Preserve existing public shapes or add versioned/internal fields only.
  - Add accessible mobile-safe loading, denial, conflict, stale-diff, and oversized-evidence states.
  forward_proof:
  - UI and API fixtures exercise approve, reject, defer, conflict, withdrawal, missing data, and AI-inferred claims.
  - A staged v2 fixture retains one identical trace_id through review detail, approve/reject/defer/conflict actions, and audit
    history.
  - Fixtures prove stale expected_diff_hash is rejected, previews obey 16 KiB item and 64 KiB response caps, and reject/defer/conflict
    create no canonical writes.
  regression_proof:
  - Existing admin authorization and public API tests pass.
  - Anonymous and ordinary users cannot access review evidence.
  commands:
  - rtk vitest run tests/worker/import-review-v2.test.ts
  - rtk vitest run tests/ui/data-review.test.tsx
  - rtk npm run test:worker
  - rtk npm run typecheck
  - rtk npm run lint
  output_artifacts:
  - review API and UI
  - authorization test report
  - API compatibility report
  risk: high
  complexity: high
  capability_profile:
    skills:
    - Hono auth
    - React admin UI
    - audit workflows
    - API compatibility
    context: large
    tools:
    - Vitest
    - Testing Library
  primary_route: null
  fallback_route: null
  attempt_limit: 2
  escalation_conditions:
  - current admin page ownership conflicts
  - mutation diff cannot be made deterministic
  reviewer: independent authorization and review-UX reviewer
  stop_conditions:
  - Evidence is exposed publicly.
  - Approval can occur without showing mutation diff.
  - Reject/defer mutates canonical data.
  completion_evidence:
  - role matrix tests
  - review state screenshots
  - API compatibility assertions
  - audit rows
- unit_id: U-013
  title: Add scheduling, budget enforcement, observability, and GitHub Actions workflow
  objective: Implement due-source calculation, freshness debt, source leases and circuit breakers, monthly cost ceiling, structured
    metrics, lightweight Worker maintenance cron, and the containerized GitHub Actions collector schedule.
  acceptance:
  - Projected spend at or above USD 50 blocks new paid work and surfaces freshness debt.
  - Overlapping schedules cannot acquire the same source concurrently.
  - Actions workflow supports manual dry-run and scheduled execution without secrets in logs, and Worker cron performs only
    lightweight maintenance.
  - The USD 50 monthly hard stop applies only to AI model token spend; Cloudflare usage and paid source/API charges have separate
    ledgers, alerts, and explicit approval gates with no automatic paid-tier upgrade.
  requirement_ids:
  - R-010
  - R-018
  - R-023
  - R-024
  - R-028
  acceptance_example_ids:
  - AE-010
  - AE-018
  - AE-023
  - AE-024
  - AE-028
  rationale: Cadence, cost, and recovery are product correctness requirements, not post-launch operations.
  dependencies:
  - U-001
  - U-002
  - U-005
  - U-006
  - U-012
  - U-014
  input_artifacts:
  - .agent-planning/artifacts/execution-readiness-recheck.json
  - migrations/0015_data_collection_provenance.sql
  - docs/database-schema.md
  - config/data-collection/pilot-sources.yaml
  - collector/Dockerfile
  - collector/src/robopartpicker_collector/cli.py
  - collector/src/robopartpicker_collector/core/**
  - worker/services/scrape-ingestion-jobs.ts
  - docs/data-ingestion-contract.md
  - current wrangler observability
  inspect_targets:
  - wrangler.jsonc
  - worker/index.ts
  - worker/env.ts
  - docs/deployment.md
  - .github/workflows/ci.yml
  - docs/operations/data-collection-preflight.md
  - docs/operations/data-collection-unblock.md
  - collector CLI and BudgetLedger
  - U-003 ingestion trace, U-005 queue trace, and U-012 review trace contracts
  read_scope:
  - U-001 authority evidence
  - migration 0015 scheduling and three-class budget schema
  - disabled pilot source registry
  - Cloudflare config and current CI
  - collector CLI/BudgetLedger
  - ingestion, queue, and review trace interfaces
  write_scope:
  - worker/services/data-collection-scheduler.ts
  - worker/index.ts
  - wrangler.jsonc
  - .github/workflows/data-collection.yml
  - collector/src/robopartpicker_collector/cli.py
  - tests/worker/data-collection-scheduler.test.ts
  - collector/tests/test_cli.py
  - docs/operations/data-collection.md
  - docs/operations/data-collection-metrics.json
  forbidden_scope:
  - enabling live schedule before approval
  - secret values
  - unbounded paid usage
  - heavy crawling in Worker cron
  interfaces:
  - scheduled() maintenance handler added without broadening the existing queue message generic
  - collector CLI extends the U-006 stable fixture-run contract
  - GitHub Actions workflow_dispatch plus schedule job gated by vars.DATA_COLLECTION_SCHEDULE_ENABLED == 'true'
  - BudgetLedger exact reserve/commit/release/status contract over collection_budget_ledger
  - lowercase 32-hex trace_id plus optional validated W3C traceparent propagated across collector, ingestion, queue, review,
    and scheduler metrics
  - versioned metrics catalog in docs/operations/data-collection-metrics.json
  procedure:
  - Verify every U-001 authority gate from execution-readiness-recheck.json and stop if any remains unresolved. Require exact
    U-002/U-005/U-006/U-012/U-014 producer artifacts before implementation.
  - Implement atomic source lease acquisition, expiry, due calculation, freshness debt, and circuit-breaker transitions against
    the exact migration 0015 columns.
  - 'Implement hard class-local gates through BudgetLedger: USD 50 per calendar month for ai_token, separately configured
    cloudflare_infra and paid_source_api limits, explicit approval state, no borrowing, and source-local freshness debt.'
  - Verify the lowercase 32-hex trace_id remains identical across collector, ingestion, queue, review, scheduler, and audit
    fixtures; validate optional W3C traceparent and publish the metrics catalog.
  - Add workflow_dispatch with dry_run=true by default. Keep the schedule trigger present but gate the scheduled job on vars.DATA_COLLECTION_SCHEDULE_ENABLED
    == 'true'; the absent or false repository variable is the disabled default and enabling it requires canary approval plus
    repository authority.
  - Add a lightweight Worker Cron handler that performs zero network subrequests and processes at most 100 D1 rows per invocation
    for expired-lease recovery and freshness-debt updates only. It never starts collection or heavy parsing.
  - Validate the exact Wrangler cron syntax against authoritative documentation for the installed Wrangler version, add YAML
    syntax validation, and keep secret values out of CLI arguments and logs.
  - Make docs/operations/data-collection.md the canonical runtime runbook. Link to data-collection-preflight.md and data-collection-unblock.md
    without duplicating or superseding their authority checks.
  forward_proof:
  - Fake clock tests exercise daily/weekly/monthly due work, overlap prevention, lease expiry, budget stop, debt, breaker,
    and resume against migration 0015.
  - Workflow syntax validation and dry-run use fixtures, default to dry_run=true, remain disabled when DATA_COLLECTION_SCHEDULE_ENABLED
    is absent/false, and prove collector logging redacts credential values.
  - Fixtures independently cross ai_token, cloudflare_infra, and paid_source_api limits and prove each pauses only the affected
    class while recording reason and freshness debt.
  - Worker Cron tests process at most 100 rows, perform zero subrequests, recover only expired leases, update freshness debt,
    and never invoke collector acquisition.
  - One trace fixture preserves the same trace_id across collector, ingestion, Queue retry/DLQ, review action, scheduler metric,
    and audit row.
  regression_proof:
  - Current CI remains unchanged except additive job validation.
  - Worker dry-run and existing queue tests pass.
  commands:
  - rtk vitest run tests/worker/data-collection-scheduler.test.ts
  - rtk test python -m pytest collector/tests/test_cli.py
  - rtk npx prettier --check .github/workflows/data-collection.yml
  - rtk npx wrangler deploy --dry-run
  - rtk npm run typecheck
  - rtk npm run lint
  output_artifacts:
  - scheduler service
  - disabled-by-default Actions workflow
  - budget tests
  - operations runbook
  - metrics catalog
  risk: high
  complexity: high
  capability_profile:
    skills:
    - GitHub Actions
    - Cloudflare Cron
    - cost control
    - observability
    - distributed leases
    context: large
    tools:
    - Wrangler
    - Actions
    - Vitest
    - pytest
  primary_route: null
  fallback_route: null
  attempt_limit: 2
  escalation_conditions:
  - no Git remote or Actions authority
  - budget cannot be hard-stopped
  - source leases are not reliable
  reviewer: independent infrastructure and cost reviewer
  stop_conditions:
  - Any U-001 authority or dependency-artifact gate is unresolved.
  - Schedule would activate when DATA_COLLECTION_SCHEDULE_ENABLED is absent or false.
  - Any cost class can exceed its own limit or borrow from another class.
  - Secrets can appear in workflow or collector logs.
  - Worker Cron performs external fetches, starts collection, parses source payloads, or exceeds 100 D1 rows per invocation.
  - Trace identifiers diverge across collector, ingestion, queue, review, scheduler, or audit.
  completion_evidence:
  - workflow dry-run
  - budget state-space tests
  - Wrangler dry-run
  - metrics sample
  - reviewer approval
- unit_id: U-014
  title: Create the complete source coverage matrix and pilot registry
  objective: Translate every inventory section and named source family into a versioned coverage matrix with adapter family,
    wave, policy state, extraction methods, formats, cadence, risk, ownership, and deferment, then define the five pilot source
    registry entries without running them.
  acceptance:
  - Sections 1 through 38, source tiers, canonical object types, every named source family, and every named inventory field
    are accounted for.
  - Every entry has a wave or explicit deferment and no truncated inventory content is invented.
  - Five pilot entries remain disabled until source-specific policy preflight is approved.
  - Every inventory field has a stable claim key, value type, expected unit or normalizer, evidence-locator class, revision/time-series
    behavior, and supported, deferred, or unsupported state.
  requirement_ids:
  - R-001
  - R-006
  - R-016
  - R-025
  - R-026
  - R-029
  acceptance_example_ids:
  - AE-001
  - AE-006
  - AE-016
  - AE-025
  - AE-026
  - AE-029
  rationale: The broad inventory must remain visible even though the pilot is intentionally narrow.
  dependencies:
  - U-002
  input_artifacts:
  - C:\Users\Lenovo\Desktop\AI\robopartpicker data collection.txt
  - .agent-planning/artifacts/product-contract.json
  - .agent-planning/artifacts/technical-research.json
  - migrations/0015_data_collection_provenance.sql
  - docs/database-schema.md
  inspect_targets:
  - canonical inventory lines 1 through 1694
  - migration 0015 source_collection_profiles and source_policy_revisions contract
  - canonical inventory source families and product-contract source tiers used to author the adapter-family taxonomy output
  read_scope:
  - all inventory sections and appendices
  - source-policy and budget schema
  - product and technical planning artifacts
  write_scope:
  - config/data-collection/source-coverage.yaml
  - config/data-collection/pilot-sources.yaml
  - docs/data-collection/source-coverage.md
  - scripts/validate-source-coverage.mjs
  - tests/contracts/source-coverage.test.ts
  - config/data-collection/field-coverage.yaml
  - config/data-collection/adapter-families.yaml
  forbidden_scope:
  - live source access
  - enabling schedules
  - credentials
  - invented ending for line 1694
  interfaces:
  - source registry configuration
  - coverage validator
  - adapter family identifiers
  - field coverage registry consumed by schemas, extractors, normalizers, and verification
  procedure:
  - Map all complete inventory lines 1 through 1693 plus the known line-1694 prefix; preserve the unknown suffix as deferred_unknown_tail.
  - Publish config/data-collection/adapter-families.yaml with the common adapter families and exact SourceAdapter capability
    flags without depending on collector implementation files.
  - Publish source-coverage.yaml and field-coverage.yaml with stable source tier, policy state, claim key, value type, unit
    or normalizer, evidence locator class, temporal behavior, and supported/deferred/unsupported state.
  - 'Publish exactly five disabled pilot IDs: manufacturer_pilot, distributor_pilot, github_repository_pilot, ros_bom_pilot,
    and volatile_offer_pilot. For each, select candidate identity only from the canonical inventory or a persisted product
    decision, and record access method, required policy-preflight evidence, cost class, and fixture directory. Candidate identity
    is not approval: enabled=false and policy_state remains unreviewed or approved_fixture_only until separate live-source
    approval.'
  - Validate every inventory section, source family, and field maps exactly once and no entry is enabled.
  - Document deferment reasons, ownership, and the separate approval gate for any live source contact or paid API.
  forward_proof:
  - Validation reports complete section, source-family, and field coverage with no duplicates or unmapped complete inventory
    lines.
  - The unknown line-1694 suffix remains one explicit deferred_unknown_tail item and no invented field appears.
  - Exactly manufacturer_pilot, distributor_pilot, github_repository_pilot, ros_bom_pilot, and volatile_offer_pilot have fixture
    paths, enabled=false, and no approved_live state.
  - Adapter-family and pilot-source schemas validate without importing or requiring collector implementation files.
  regression_proof:
  - The original inventory file remains unchanged and its truncation is documented.
  commands:
  - rtk node scripts/validate-source-coverage.mjs
  - rtk vitest run tests/contracts/source-coverage.test.ts
  - rtk npm run lint
  output_artifacts:
  - config/data-collection/source-coverage.yaml
  - config/data-collection/field-coverage.yaml
  - config/data-collection/pilot-sources.yaml
  - config/data-collection/adapter-families.yaml
  - docs/data-collection/source-coverage.md
  - coverage validation report
  risk: medium
  complexity: high
  capability_profile:
    skills:
    - taxonomy
    - source governance
    - schema validation
    context: large
    tools:
    - Node
    - Vitest
  primary_route: null
  fallback_route: null
  attempt_limit: 2
  escalation_conditions:
  - inventory source family cannot be classified
  - pilot source requires unresolved legal authority
  reviewer: independent scope and policy reviewer
  stop_conditions:
  - Any complete inventory line or named field is unmapped.
  - The truncated suffix would need to be invented.
  - Any pilot is enabled or marked approved_live without persisted policy authority.
  - Creating the registry would require live source contact during planning or implementation before the live-source approval
    gate.
  completion_evidence:
  - coverage validator output
  - 38-section traceability report
  - pilot entries
  - reviewer signoff
  - complete field registry validation
- unit_id: U-015
  title: Build the complete offline verification and compatibility suite
  objective: Integrate database, contract, queue, evidence, collector, adapters, parsers, normalization, review, scheduler,
    budget, security, and existing project-import tests into deterministic offline release gates.
  acceptance:
  - All new behavior is enforced by named tests using fixtures and fake clocks without live targets or paid credentials.
  - Existing typecheck, lint, contracts, unit, Worker, database, mobile, and build checks pass or pre-existing failures are
    classified.
  - The suite demonstrates conflict, withdrawal, missing data, denied source, unsupported file, budget stop, and idempotent
    replay.
  - Stable package scripts run focused data-collection Worker tests and the complete collector suite before CI references
    them.
  - A versioned canary evidence schema rejects reports missing per-source lineage, policy, review, cost, drill, alert, rollback,
    or provenance-completeness evidence.
  requirement_ids:
  - R-023
  - R-026
  - R-027
  - R-030
  acceptance_example_ids:
  - AE-023
  - AE-026
  - AE-027
  - AE-030
  rationale: A broad ingestion system needs observable release evidence rather than manual confidence.
  dependencies:
  - U-004
  - U-005
  - U-007
  - U-008
  - U-009
  - U-010
  - U-011
  - U-012
  - U-013
  - U-014
  input_artifacts:
  - all prior unit outputs
  - package.json checks
  - .github/workflows/ci.yml
  inspect_targets:
  - tests/**
  - collector/tests/**
  - package.json
  - .github/workflows/ci.yml
  - docs/local-development.md
  read_scope:
  - all tests and fixtures
  - CI workflow
  - verification docs
  write_scope:
  - tests/e2e/data-collection-pilot.test.ts
  - tests/security/data-collection-threats.test.ts
  - scripts/verify-data-collection.mjs
  - package.json
  - .github/workflows/ci.yml
  - docs/local-development.md
  - contracts/data-collection-canary.schema.json
  - scripts/validate-data-collection-canary.ts
  forbidden_scope:
  - live production targets
  - paid inference
  - test-only production bypasses
  - weakening existing assertions
  interfaces:
  - npm verification scripts
  - pytest suite
  - CI artifacts
  - fixture data
  - test:data-collection and test:collector package scripts
  - data-collection canary evidence schema
  procedure:
  - Inventory each AE and map it to an executable check or explicit operator evidence.
  - Create end-to-end fixture harness from collector output through review and canonical views.
  - Add security threats and state-space cases.
  - Add CI jobs with bounded timeouts and artifact retention.
  - Run baseline and classify only genuine pre-existing failures.
  - Document exact expected outputs and troubleshooting.
  - Add stable package scripts for focused Worker data-collection tests and collector pytest so local and CI commands share
    one supported surface.
  - Define the versioned canary evidence schema and validate complete and intentionally incomplete fixtures.
  forward_proof:
  - One command runs the offline data-collection verification matrix and emits a machine-readable report.
  - CI and local verification invoke the same package scripts with bounded timeouts.
  - Canary schema fixtures require source-policy and content hashes, import and canonical lineage IDs, counts, review decisions,
    mandatory provenance completeness, costs, failures, drills, alerts, rollback references, and approval identities.
  regression_proof:
  - Full repository check and mobile e2e pass after the last material change, or only documented pre-existing failures remain.
  commands:
  - rtk npm run check
  - rtk npm run test:data-collection
  - rtk npm run test:collector
  - rtk npm run test:e2e:mobile
  - rtk npm run build
  - rtk npx tsx scripts/validate-data-collection-canary.ts --fixtures
  - rtk node scripts/verify-data-collection.mjs
  output_artifacts:
  - verification script
  - CI jobs
  - machine-readable AE report
  - fresh full-suite logs
  - canary evidence schema and fixture validation
  risk: high
  complexity: high
  capability_profile:
    skills:
    - test architecture
    - Cloudflare integration tests
    - security fixtures
    - CI
    context: large
    tools:
    - Vitest
    - Playwright
    - pytest
    - GitHub Actions
  primary_route: null
  fallback_route: null
  attempt_limit: 2
  escalation_conditions:
  - acceptance cannot be observed
  - fixtures require restricted copyrighted content
  - baseline failures obscure regression
  reviewer: independent verification reviewer
  stop_conditions:
  - Tests contact live targets by default.
  - Assertions are weakened to pass.
  - A requirement lacks an observable check.
  completion_evidence:
  - AE-to-test matrix
  - full-suite output
  - CI dry run
  - pre-existing failure classification
  - package-script parity report
  - canary schema validation report
- unit_id: U-016
  title: Run the five-source canary and complete rollout, rollback, and operations
  objective: After explicit execution authority and source approvals, deploy additive infrastructure safely, run the disabled-by-default
    five-source canary, review every result, verify budget and observability, and publish expansion and rollback gates without
    broad rollout.
  acceptance:
  - Canary sources complete raw-to-reviewed-canonical flow with complete provenance and no direct canonical writes.
  - Conflict, withdrawal, missing information, denied source, and unsupported format drills preserve history and current views.
  - Rollback, pause, takedown, budget, alert, and expansion procedures are proven and broad schedules remain disabled until
    separately approved.
  - A fresh production D1 Time Travel bookmark or Cloudflare-supported equivalent is captured and verified immediately before
    migration 0015; absence is a production STOP.
  - A disposable or preview rehearsal produces machine-readable evidence for prior-Worker restore, migration pause, preserved
    additive tables, and forward-corrective recovery.
  - The five-source canary JSON validates against the U-015 schema with complete per-source policy, lineage, review, cost,
    drill, alert, rollback, and approval evidence.
  requirement_ids:
  - R-024
  - R-026
  - R-028
  acceptance_example_ids:
  - AE-024
  - AE-026
  - AE-028
  rationale: The pilot succeeds only when operations and rollback work on real approved sources under the budget ceiling.
  dependencies:
  - U-015
  input_artifacts:
  - execution preflight
  - five approved source policies
  - verification report
  - deployment runbook
  inspect_targets:
  - docs/deployment.md
  - docs/operations/data-collection.md
  - wrangler environments
  - GitHub Actions workflow
  - Cloudflare dashboards
  read_scope:
  - release artifacts
  - resource metrics
  - review backlog
  - budget ledger
  write_scope:
  - docs/deployment.md
  - docs/operations/data-collection.md
  - docs/data-collection/pilot-report.md
  - CHANGELOG.md
  - .agent-planning/artifacts/data-collection-canary.json
  - scripts/rehearse-data-collection-rollback.ts
  forbidden_scope:
  - unapproved source activation
  - broad catalog population
  - budget overage
  - destructive rollback
  - credential values
  interfaces:
  - preview then production deployment
  - GitHub Actions manual dispatch
  - source pause/withdrawal
  - Cloudflare rollback
  - D1 recovery checkpoint
  - machine-readable rollback rehearsal
  - validated canary evidence contract
  procedure:
  - Re-run U-001 preflight and fresh full verification.
  - Apply migrations and queue resources to preview, then validate.
  - Run each source manually with strict record and byte caps and review every claim.
  - Exercise conflict, withdrawal, denied, unsupported, and retry drills.
  - Verify spend projection, freshness, logs, metrics, and alerts.
  - Deploy production bindings and code only with explicit authorization, then run the same bounded canary.
  - Document rollback and leave recurring broad schedules disabled pending post-canary approval.
  - Before production migration, capture and verify a fresh D1 Time Travel bookmark or supported equivalent and record its
    opaque identifier only in the authorized operations artifact.
  - On disposable or preview resources, rehearse restoring the prior Worker, pausing producers, preserving additive tables,
    and applying a forward-corrective migration without data loss.
  - Simulate the documented remote 0003 migration-history state before applying migration 0015.
  - Populate and validate the canary JSON per source with policy and content hashes, batch/job/import/canonical IDs, accepted/rejected/deferred
    counts, reviewer decisions, provenance completeness, costs, failures, drills, alerts, rollback references, and approval
    identities.
  forward_proof:
  - Five-source pilot report contains provenance completeness, acceptance checks, costs, failures, reviews, and canonical
    links.
  - Rollback rehearsal artifact proves every recovery step and post-recovery query with timestamps, resource identifiers,
    version IDs, and zero lost history.
  - Canary evidence validation fails when any required per-source field or mandatory provenance claim is omitted.
  regression_proof:
  - Current application smoke tests, database validation, and rollback path pass after production canary.
  - Production migration is not attempted without a verified current D1 recovery checkpoint and successful preview recovery
    rehearsal.
  commands:
  - rtk npm run check
  - rtk npm run db:validate:preview
  - rtk npx wrangler deploy --dry-run --env preview
  - rtk npx tsx scripts/rehearse-data-collection-rollback.ts --env preview
  - rtk npx tsx scripts/validate-data-collection-canary.ts .agent-planning/artifacts/data-collection-canary.json
  - rtk npm run test:e2e:mobile
  - rtk npm run build
  output_artifacts:
  - pilot report
  - canary evidence JSON
  - deployment and rollback records
  - changelog entry
  risk: high
  complexity: high
  capability_profile:
    skills:
    - release management
    - Cloudflare operations
    - data review
    - incident recovery
    context: large
    tools:
    - Wrangler
    - GitHub Actions
    - browser smoke tests
  primary_route: null
  fallback_route: null
  attempt_limit: 1
  escalation_conditions:
  - any source policy changes
  - budget projection exceeds USD 50
  - unexplained warning or regression
  - rollback cannot be proven
  reviewer: independent release and operations reviewer
  stop_conditions:
  - User has not explicitly approved execution or deployment.
  - Any P0/P1 defect remains.
  - Secrets or source authority are missing.
  - Broad schedule would activate automatically.
  - A fresh production D1 recovery checkpoint cannot be captured or verified.
  - The preview/disposable rollback rehearsal or canary schema validation fails.
  completion_evidence:
  - fresh verification logs
  - preview and production version IDs
  - five-source pilot report
  - budget report
  - rollback evidence
  - independent review
  - D1 recovery checkpoint receipt
  - machine-readable rollback rehearsal
  - validated per-source canary schema report
release_gate:
  all_leaf_rehearsals_passed: false
  high_risk_double_rehearsed: false
  artifact_handoffs_complete: false
  existing_failures_classified: false
  operations_complete_when_applicable: false
  manager_failure_classes_complete: false
  open_p0_defects: 0
  open_p1_defects: 0
  unsafe_write_overlaps: 0
  launch_blocking_questions: 3
  max_active_workers: 4
  max_total_nodes: 16
  max_graph_depth: 7
  attempt_limit: 2
  execution_cost_ceiling: 50
  execution_cost_ceiling_scope: AI model token spend only; Cloudflare and paid source/API costs use separate explicit envelopes
source_events:
- lifecycle.INTAKE
- lifecycle.CONTEXT_RECONSTRUCTION
- lifecycle.REPOSITORY_GROUNDING
- lifecycle.CONCEPT_GRILL
- lifecycle.PRODUCT_CONTRACT
- lifecycle.TECHNICAL_RESEARCH
- lifecycle.REVIEW_GRAPH
monthly_pilot_budget_scope: AI model token spend only
cloudflare_cost_policy: separate monitored envelope; no automatic paid-tier upgrade
paid_source_api_cost_policy: separate explicit approval and per-source limit
---

# RoboPartPicker Provenance-First Data Collection Plan

## Goal Capsule

Design an implementation-ready, evidence-backed system that can collect raw source material and structured robotics records across the complete 1,694-line RoboPartPicker inventory while preserving provenance, field confidence, claim classification, revisions, conflicts, withdrawals, and source-policy state. The pilot must use the existing Cloudflare Worker, D1, R2, Queue, review, and audit boundaries, with external crawlers and heavy parsers submitting bounded batches. It must prove five representative allowed sources within a hard USD 50 monthly incremental budget before broader rollout.

The trust promise is: every value can be traced to the exact source, retrieval, applicable revision, extraction method, and evidence classification, and uncertain or missing data is never disguised as fact.

## Product Contract

### Actors and end-to-end flows

1. **Data operator** registers a source, selects an approved access method, records policy and reuse status, assigns cadence and budgets, and enables it only after preflight.
2. **External acquisition worker** discovers permitted resources, honors budgets and conditional requests, stores or references immutable raw evidence, and emits content-addressed work.
3. **Extractor** produces typed records and per-field claims with evidence locators, confidence, normalized values, and explicit provenance classification.
4. **Cloudflare ingestion boundary** authenticates the service, validates the versioned contract, deduplicates records, stores raw evidence metadata, stages normalized data, and generates match or conflict candidates.
5. **Administrator or allowlisted policy** reviews the exact evidence and proposed mutation, then approves, rejects, defers, or records a conflict without losing history.
6. **Catalog consumers** receive current canonical views while internal or versioned APIs expose provenance, revisions, freshness, conflicts, and withdrawal state.
7. **Operator** monitors freshness debt, source failures, cost, retries, dead letters, extraction quality, review backlog, and policy violations, and can pause one source without stopping independent sources.

### In scope

- Universal provenance, claim-level confidence and evidence classification, immutable raw snapshots or references, content hashes, and revision-aware history.
- A source registry and policy engine covering access method, robots and terms state, copyright or reuse, cadence, rate, cost, locale, and lifecycle.
- Versioned external ingestion contracts and additive D1 schema evolution that preserve current ingestion and project-import behavior.
- External adapter framework for APIs, feeds, permitted HTTP pages, repositories, bounded files, documents, and volatile offers.
- Worker-side validation, staging, deterministic matching, conflict detection, review, promotion, audit, withdrawal, and observability.
- Five-source pilot covering manufacturer, distributor, repository, ROS or BOM file, and volatile offer or stock data.
- Roadmap coverage for every inventory section and source family, including explicit deferments for policy, cost, unsupported formats, or low confidence.

### Initial rollout waves

1. **Wave 0, safety and provenance substrate:** source registry, policy gates, immutable snapshots, universal provenance, field claims, time series, conflicts, withdrawals, budgets, and contract v2.
2. **Wave 1, structured pilot:** one official manufacturer and one structured distributor or catalog source, including component, offer, price, and stock observations.
3. **Wave 2, repository and BOM pilot:** one GitHub or GitLab project plus ROS, BOM, documentation, release, software, firmware, and bounded relevant file ingestion.
4. **Wave 3, safe robotics formats:** URDF, Xacro, SDF, SRDF, MJCF, CAD and mesh metadata, and fail-closed unsupported native files.
5. **Wave 4, volatile marketplaces and supplier observations:** only sources with approved interfaces and policy, using aggressive time-series, seller, condition, and confidence controls.
6. **Wave 5, community and build evidence:** forums, ROS Discourse, Hackaday, Instructables, reproductions, substitutions, build logs, corrections, and supplier reports after reuse policy and moderation are proven.
7. **Wave 6, media, teardown, and publications:** transcripts, images, FCC evidence, papers, reports, benchmarks, OCR or vision extraction, and stricter copyright and inference review.
8. **Wave 7, compatibility and normalization expansion:** interface taxonomies, unit and currency normalization, compatibility rules, alternatives, and evidence-backed substitution outcomes across accumulated data.

### Success thresholds

- Five allowed pilot sources complete the full raw-to-reviewed-canonical lifecycle.
- Every accepted pilot record has all required universal provenance fields.
- Every extracted pilot field has evidence classification and confidence; AI-derived values are explicitly AI-inferred.
- Idempotent replay creates no duplicate import, observation, canonical, or audit facts.
- Prices, stock, and at least one mutable specification are demonstrated as time-series or revision-aware values.
- One conflict, one withdrawal, one missing-information state, one denied-source state, and one unsupported-file state are exercised with preserved history.
- No external process writes canonical rows directly.
- Incremental monthly pilot spend cannot exceed USD 50 and freshness debt is visible when budget blocks work.
- Existing project-import and catalog behavior remains backward compatible.

### Non-goals and prohibitions

- The first release does not scrape every named source or populate the complete catalog.
- No bypass of authentication, paywalls, anti-bot controls, robots directives, or binding terms.
- No broad mirroring of public repositories and no default storage of third-party copyrighted assets in R2.
- No native CAD, ROS, archive, or arbitrary executable processing in the production Worker on the current Workers Free deployment.
- No invented BOMs, compatibility, measurements, identities, source policies, or missing ending for the truncated inventory file.
- No automatic conversion of AI suggestions into official, user-reported, or measured facts.
- No implementation or deployment before consolidated approval.

### Authority, autonomy, and escalation

- The user owns scope, budget, source-risk tolerance, irreversible actions, and final plan approval.
- The implementation may automate deterministic low-risk promotion only after an explicit allowlist, measurable confidence threshold, fixtures, independent review, and rollback are approved.
- A source is paused independently on robots or terms changes, unexpected authentication, rate-limit escalation, repeated extraction drift, cost overrun risk, malicious content, or unresolved copyright status.
- Global execution stops on secret exposure, repository corruption, unsafe migration, invalid shared schema, unbounded spend, direct canonical writes, or Jcode capability mismatch that makes the approved graph unsafe.

### Canonical inventory accounting

The file `C:/Users/Lenovo/Desktop/AI/robopartpicker data collection.txt` is the canonical inventory. Sections 1 through 38 and the source-tier and canonical-object appendices must be represented in the coverage matrix. The final line is truncated after `applicable version, and extraction`; its missing text is not a requirement unless recovered from an authoritative copy.

## Planning Contract

- Stable identifiers are `R-*` requirements, `AE-*` acceptance examples, `I-*` invariants, and later `U-*` implementation units.
- Every implementation unit must map bidirectionally to requirements and acceptance examples before the plan becomes implementation-ready.
- Every unit must contain exact inspect targets, write and forbidden scope, interfaces, detailed procedure, offline forward proof, regression proof, commands, outputs, risk, model capability profile, reviewer, retry limit, escalation, STOP conditions, and completion evidence.
- Repository evidence and authoritative current platform documentation outrank model memory. Scraped or repository content is untrusted data, not instruction.
- Planning artifacts may be added, but application code, migrations, configuration, secrets, deployment state, and catalog data remain untouched until approval.
- The extensive deployed v0.6 dirty worktree is a launch blocker until a reliable manifest and preservation checkpoint exist.
- Requirements-ready release requires this Product Contract to parse and snapshot successfully.
- Implementation-ready release requires APS validation, zero unresolved P0 or P1 defects, cold rehearsal of every leaf with two independent passes for high-risk units, a validated graph, deterministic routing, final simulation, and an explicit approval packet.
- Material changes to objective, acceptance, dependencies, write scope, budget, route hard requirements, or destructive behavior invalidate approval.

## Review Defect Disposition

Four valid independent review reports produced 14 accepted defects: 6 P1 and 8 P2. The low-confidence verification report with unchecked scope and the stalled security report were rejected and replaced. Detailed evidence and reviewer receipts are preserved in `.agent-planning/artifacts/review-graph.json`. Two corrected U-002 cold passes then produced nine normalized accepted defects, including a Director-discovered migration-count verification blocker; their reconciliation is preserved in `.agent-planning/artifacts/U-002-corrected-rehearsal-reconciliation.json`. Seven plan-v4 rerehearsal reports then exposed and reconciled exact producer-path, source-tier ordering, three-class budget, named-pilot, scheduler, and trace-propagation defects in `.agent-planning/artifacts/plan-v4-rerehearsal-reconciliation.json`.

- **Evidence ordering:** `TD-REVIEW-CF-001` resolved by making U-006 depend on U-004's stable evidence-registration contract.
- **Migration recovery:** `TD-REVIEW-CF-002`, `D-007`, and `TD-REVIEW-002` resolved with remote-0003 simulation, a fresh production D1 recovery checkpoint STOP gate, and a machine-readable preview/disposable rollback rehearsal.
- **Queue isolation:** `TD-REVIEW-CF-003` resolved by distinguishing the deliberate 64 KB internal cap from the 128 KB platform maximum and requiring discriminated dispatch and retry isolation.
- **Complete staging and field coverage:** `D-001` and `D-002` resolved through accepted-record-type disposition and a field-level coverage registry for every named inventory field.
- **Identity and temporal correctness:** `D-003` and `D-005` resolved through canonical-reference existence/type checks and append-only fixtures for every mutable class named by R-005.
- **D1 feasibility and legacy bounds:** `D-004` and `D-006` resolved through capacity/query-plan proof and explicit bounded v1 compatibility behavior.
- **Repository executability:** `RG-DATA-COLLECTION-P2-001` resolved by replacing the nonexistent upload-service path with current file route/repository and archive-protection paths.
- **Verification and canary observability:** `TD-REVIEW-001` and `TD-REVIEW-003` resolved through stable package scripts plus a versioned, validated per-source canary evidence schema.

- **U-002 cold executability:** source/canonical ownership, inventory-tail deferral, Worker-D1 test placement, migration-count validation, exact fixture graph, representative EXPLAIN criteria, empirical capacity measurement, and collection-to-import lifecycle are now explicit. The changed high-risk unit requires two fresh independent passes.
- **Plan-v4 rerehearsal:** U-014 now produces exact disabled pilot and adapter-family registries before U-006; U-004 publishes a machine-readable evidence contract; U-002 pins lease and three-class budget schemas; U-008 consumes a named disabled pilot; U-003/U-005/U-012/U-013 share one trace contract; and U-013 has an exact disabled schedule and bounded Worker maintenance scope.
- **Budget scope clarification:** the USD 50 monthly hard stop applies only to AI model token spend. Cloudflare infrastructure and paid source/API charges use separate monitored envelopes, explicit approval gates, and no automatic paid-tier upgrade.
- **Plan-v5 cold rehearsal:** all 16 required reports are valid. Accepted gaps now pin additive trace storage, exact evidence classes/caps/retention and existing R2 binding use, actual queue dispatch/checkpoint/manual-resume ownership, the real ImportJobs review surface and action DTOs, and all five stable pilot IDs. Full disposition is in `.agent-planning/artifacts/plan-v5-rerehearsal-reconciliation.json`.

All accepted defects are integrated into the same canonical plan. REVIEW_GRAPH has zero remaining undispositioned P0/P1 findings, but the plan remains requirements-ready until rehearsal, graph, routing, and final-simulation gates pass.

## System Impact

### Architecture and ownership

- Add a new portable `collector/` boundary. It owns discovery, permitted acquisition, conditional HTTP, robots and source-policy preflight, heavy parsing, AI-assisted extraction, three-class cost accounting, stable CLI/container execution, and v2 batch submission. It imports no Worker internals and cannot begin until U-002, U-003, U-004, and U-014 publish their exact hashed producer contracts.
- Keep the Cloudflare Worker as the only trust and canonicalization boundary. It owns service authentication, v1/v2 validation, D1 source and claim state, content-addressed R2 evidence registration, dedicated Queue processing, deterministic normalization, conflict generation, administrator review, canonical promotion, audit, withdrawal, and catalog provenance APIs.
- Keep interactive project import separate. Existing user-owned repository import and its `2022-11-28` GitHub version remain unchanged unless a separate compatibility change is approved.
- Add one immutable migration, `migrations/0015_data_collection_provenance.sql`. Prior migrations are forbidden from modification.
- Add a dedicated scrape-ingestion Queue and DLQ. Queue messages contain pointers only; D1 stores durable job checkpoints and R2 stores approved immutable bytes.
- Add a disabled-by-default GitHub Actions workflow for the external collector plus a lightweight Worker Cron handler for maintenance. No recurring live source schedule is enabled before canary approval.

### Public and internal contracts

- Preserve import contract v1 and current public catalog behavior.
- Add import contract v2 for universal provenance, field claims, snapshot manifests, lifecycle events, and per-record errors.
- Add administrator-only evidence and mutation-diff APIs and versioned/internal catalog provenance fields.
- Add source registry, parser registry, and coverage configuration with validation.

### Data and migration strategy

- D1 keeps source policy revisions, snapshot metadata, normalized claims, observations, conflicts, lifecycle events, review decisions, budgets, and jobs. Large evidence bytes do not belong in D1. A capacity model, representative EXPLAIN plans, narrow-row/index budget, and worst-case write sizing are required before schema approval.
- A versioned field-coverage registry maps every named inventory field to its claim key, value type, unit/normalizer, evidence locator, temporal semantics, and supported/deferred state.
- R2 keys approved bytes by SHA-256 and supports deduplication, retention class, takedown state, and authorized access.
- Mutable facts append observations or revisions. Current views are derived and indexed.
- Rollback is forward-only for schema: disable new producers and readers, restore the prior Worker version, preserve new tables and data, and use a corrective migration if needed.

### Budget and operational bounds

- AI model token spend has a USD 50 per-calendar-month hard ceiling.
- Cloudflare infrastructure usage and paid source/API charges are tracked separately with explicit configured envelopes, alerts, and no automatic paid-tier upgrade. They are not charged against the AI-token ceiling.
- Plan graph is bounded to 16 units, 4 active workers, depth 7, and 2 attempts per normal unit. U-001 and U-016 permit one attempt because their failures require operator authority.
- Initial source count is five and all recurring schedules remain disabled until the canary passes.

## Implementation Units

The complete executable unit contracts live in frontmatter and are summarized here:

- **U-001 Preserve the deployed baseline and clear execution preflights**. Depends on: none. Risk: high. Primary write scope: `docs/operations/data-collection-preflight.md, .agent-planning/artifacts/execution-preflight.json`.
- **U-002 Add the provenance, source-policy, claim, observation, and lifecycle schema**. Depends on: U-001. Risk: high. Primary write scope: `migrations/0015_data_collection_provenance.sql, docs/database-schema.md, tests/worker/data-collection-provenance.test.ts, ...`.
- **U-003 Introduce external ingestion contract v2 with backward compatibility**. Depends on: U-002. Risk: high. Primary write scope: `contracts/import-batch.v2.schema.json, contracts/examples/import-batch.v2.json, scripts/validate-contracts.ts, ...`.
- **U-004 Implement immutable evidence registration and R2 snapshot storage**. Depends on: U-002, U-003. Risk: high. Primary write scope: `worker/routes/source-evidence.ts, worker/services/source-evidence.ts, worker/router.ts, ...`.
- **U-005 Add dedicated asynchronous scrape-ingestion processing**. Depends on: U-002, U-003. Risk: high. Primary write scope: `worker/services/scrape-ingestion-jobs.ts, worker/index.ts, worker/env.ts, ...`.
- **U-006 Build the portable external collector core and policy engine**. Depends on: U-002, U-003, U-004, U-014. Risk: high. Primary write scope: `collector/pyproject.toml, collector/uv.lock, collector/Dockerfile, ...`.
- **U-007 Implement the official manufacturer pilot adapter**. Depends on: U-006. Risk: medium. Primary write scope: `collector/src/robopartpicker_collector/adapters/manufacturer_pilot.py, collector/tests/adapters/test_manufacturer_pilot.py, collector/tests/fixtures/manufacturer_pilot/**, ...`.
- **U-008 Implement the structured distributor and volatile offer pilot adapter**. Depends on: U-002, U-006, U-014. Risk: medium. Primary write scope: `collector/src/robopartpicker_collector/adapters/distributor_pilot.py, collector/tests/adapters/test_distributor_pilot.py, collector/tests/fixtures/distributor_pilot/**, ...`.
- **U-009 Implement bounded GitHub, ROS, BOM, and repository-file ingestion**. Depends on: U-006. Risk: high. Primary write scope: `collector/src/robopartpicker_collector/adapters/github_repository.py, collector/src/robopartpicker_collector/parsers/bom.py, collector/tests/adapters/test_github_repository.py, ...`.
- **U-010 Implement safe document and robotics-description parser pack**. Depends on: U-004, U-006. Risk: high. Primary write scope: `collector/src/robopartpicker_collector/parsers/**, collector/tests/parsers/**, collector/tests/fixtures/parsers/**, ...`.
- **U-011 Implement normalization, identity candidates, conflicts, and lifecycle services**. Depends on: U-002, U-003. Risk: high. Primary write scope: `worker/services/data-normalization.ts, worker/services/identity-resolution.ts, worker/services/claim-conflicts.ts, ...`.
- **U-012 Extend administrator review and provenance APIs/UI**. Depends on: U-003, U-004, U-011. Risk: high. Primary write scope: `worker/routes/imports.ts, worker/routes/catalog.ts, src/lib/api/imports.ts, ...`.
- **U-013 Add scheduling, budget enforcement, observability, and GitHub Actions workflow**. Depends on: U-001, U-002, U-005, U-006, U-012, U-014. Risk: high. Primary write scope: `worker/services/data-collection-scheduler.ts, worker/index.ts, wrangler.jsonc, ...`.
- **U-014 Create the complete source coverage matrix and pilot registry**. Depends on: U-002. Risk: medium. Primary write scope: `config/data-collection/source-coverage.yaml, config/data-collection/pilot-sources.yaml, docs/data-collection/source-coverage.md, ...`.
- **U-015 Build the complete offline verification and compatibility suite**. Depends on: U-004, U-005, U-007, U-008, U-009, U-010, U-011, U-012, U-013, U-014. Risk: high. Primary write scope: `tests/e2e/data-collection-pilot.test.ts, tests/security/data-collection-threats.test.ts, scripts/verify-data-collection.mjs, ...`.
- **U-016 Run the five-source canary and complete rollout, rollback, and operations**. Depends on: U-015. Risk: high. Primary write scope: `docs/deployment.md, docs/operations/data-collection.md, docs/data-collection/pilot-report.md, ...`.

## Execution Graph

```mermaid
graph TD
  U001[U-001 Preflight] --> U002[U-002 Provenance schema]
  U002 --> U003[U-003 Contract v2]
  U002 --> U004[U-004 R2 evidence]
  U002 --> U011[U-011 Normalize and lifecycle]
  U002 --> U014[U-014 Coverage and pilot registry]
  U002 --> U013[U-013 Scheduling and cost]
  U003 --> U004
  U003 --> U005[U-005 Scrape Queue]
  U003 --> U011
  U003 --> U012[U-012 Review API and UI]
  U004 --> U006[U-006 Collector core]
  U014 --> U006
  U004 --> U010[U-010 Parser pack]
  U004 --> U012
  U006 --> U007[U-007 Manufacturer adapter]
  U006 --> U008[U-008 Distributor adapter]
  U006 --> U009[U-009 GitHub ROS BOM]
  U006 --> U010
  U006 --> U013
  U005 --> U013
  U011 --> U012
  U012 --> U013
  U014 --> U013
  U004 --> U015[U-015 Verification suite]
  U005 --> U015
  U007 --> U015
  U008 --> U015
  U009 --> U015
  U010 --> U015
  U011 --> U015
  U012 --> U015
  U013 --> U015
  U014 --> U015
  U015 --> U016[U-016 Five-source canary]
```

Safe parallel groups after dependency gates:

1. `U-003`, `U-011`, and `U-014` after `U-002`; U-004 follows U-003, and U-006 begins only after U-002/U-003/U-004/U-014 publish their exact hashed contracts.
2. `U-007`, `U-008`, `U-009`, and `U-010` after collector, evidence, and pilot-registry prerequisites.
3. `U-012` follows its service prerequisites; `U-013` follows U-005, U-006, U-012, and U-014 so it can verify end-to-end trace, budget, and schedule behavior.
4. `U-015` is the integration gate; `U-016` is strictly serial and requires explicit execution and deployment authority.

Potential write overlaps are ordered by dependencies: U-014 owns source/pilot registry files before U-006 consumes them; U-004 owns the exact evidence contract before U-006 consumes it; `worker/routes/imports.ts` is U-003 then U-012; `worker/index.ts` and `wrangler.jsonc` are U-005 then U-013; the collector CLI is U-006 then U-013; deployment documentation is U-005/U-013 then U-016.

## Routing Assignments

Routes are intentionally unassigned during PLAN_AUTHORING and PLAN_MUTATION. MODEL_ROUTING will profile each unit, verify `LLM_STATS_API_KEY` availability without exposing it, refresh live benchmark data, and deterministically assign primary and fallback routes. No LLM may choose its own final implementation route. Current user policy excludes Claude while its allowance is exhausted, prefers strong open-source OpenRouter routes that are not duplicates of directly subscribed models, and reserves direct OpenAI for the hardest synthesis or final gate. Every metered selection must record model/provider diversity and cumulative AI-token cost against the USD 50 monthly ceiling.

## Verification Contract

- Every `R-*` and `AE-*` maps bidirectionally to one or more `U-*` units in frontmatter.
- Unit-local proof uses offline fixtures, fake clocks, disposable local D1/R2/Queue state, and no paid credentials or live target dependency. Stable `test:data-collection` and `test:collector` package scripts become the shared local/CI surface before CI references them.
- D1 proof includes remote-0003 migration-history simulation, capacity and write-amplification modeling, representative EXPLAIN plans, and append-only fixtures for every mutable class named by R-005.
- Required repository regression baseline after the final material change: `rtk npm run typecheck`, `rtk npm run lint`, `rtk npm run contracts:validate`, `rtk npm run ai:evaluations:validate`, `rtk npm run test:unit`, `rtk npm run test:worker`, `rtk npm run db:validate`, `rtk npm run test:e2e:mobile`, and `rtk npm run build`.
- Collector baseline: locked dependency verification, `rtk test python -m pytest collector/tests`, package build, and OCI image build with a recorded digest.
- Security matrix includes SSRF, redirects, DNS/IP changes, 304, 429/Retry-After, oversized and compressed payloads, unsafe paths, symlinks, XXE, unsafe YAML, CSV formulas, prompt injection, malicious HTML, encrypted PDFs, unsupported native files, secret redaction, and authorization.
- Data-state matrix includes idempotent replay, out-of-order events, repeated observations, conflicting claims, unresolved identity, missing BOM, withdrawal, supersession, denied source, policy change, dead letter, resume, and budget stop.
- Deployment proof is preview-first and dry-run-first. U-016 must capture a fresh production D1 Time Travel bookmark or supported recovery checkpoint, complete a machine-readable preview/disposable rollback rehearsal, and validate the five-source canary JSON against the U-015 schema. No production command is authorized by plan approval alone if U-016 still lacks explicit deployment authority.

## Failure and Recovery Contract

- Source-local failures pause only that source. Independent sources and implementation units continue when dependencies permit.
- Transient HTTP or API failures honor headers, use bounded exponential backoff with jitter, and open a source circuit breaker. Exhausted jobs become durable dead-letter records.
- Queue recovery replays pointer messages from D1 checkpoints and deduplicates every claim and observation.
- Parser or policy failures produce typed unsupported, denied, deferred, or quarantined records, never partial canonical facts.
- Migration failure stops all dependent units. Prior migrations are never edited; recovery uses the fresh pre-migration D1 recovery checkpoint, preserved database, prior Worker version, and a corrective additive migration proven first on disposable or preview resources.
- AI-token projection at or above USD 50 stops new model calls and records freshness debt. Cloudflare or paid source/API envelope breaches independently pause only that affected cost class. No budget class may silently borrow from another or trigger an automatic paid-tier upgrade.
- Secret exposure, direct canonical writes, destructive git behavior, invalid shared architecture, unsafe write overlap, unbounded spend, or lost provenance triggers a global pause.
- Manager recovery classes: retry same unit within attempt limit; add a bounded repair node after independent diagnosis; reassign to fallback route; or escalate to the user for authority, secrets, source permission, budget, destructive action, or contract change.

## Definition of Done

The plan is ready for consolidated approval only when:

- the canonical plan parses, snapshots, and validates as implementation-ready;
- technical decisions cite primary current sources and all UNVERIFIED items are launch blockers or bounded unit checks;
- all 16 units pass cold rehearsal, with two independent passes for every high-risk unit;
- specialist review leaves zero open P0 or P1 defects and every accepted defect is integrated into this same plan;
- the compiled graph has zero unsafe write overlaps and respects max workers, nodes, depth, attempts, the USD 50 AI-token ceiling, and separate Cloudflare/source cost gates;
- deterministic primary and fallback routes, benchmark freshness, expected passing cost, and escalation policy are recorded;
- existing failures are classified, operations and manager failure classes are complete, and no launch-blocking question remains;
- plan, graph, event-chain, and repository hashes match the approval packet;
- the user explicitly approves the consolidated packet;
- no implementation, scraping, deployment, catalog population, credential mutation, or destructive operation has occurred during planning.

Implementation completion later additionally requires fresh independent verification after the last material change, five approved canary sources, complete provenance, zero direct canonical writes, conflict/withdrawal/missing/denied/unsupported drills, budget proof, rollback proof, changelog and operations follow-through, and independent reviewer reports.

## Sources and Evidence

### User decisions

- Actual concept grill completed 2026-07-28. The user accepted all recommended product decisions and changed the pilot cap to USD 50 per month.
- `.agent-planning/artifacts/concept-grill-final.json` is authoritative for D-001 through D-009.

### Canonical scope and repository grounding

- `C:/Users/Lenovo/Desktop/AI/robopartpicker data collection.txt`, all 1,694 lines read; final line truncation recorded.
- `.agent-planning/artifacts/repository-grounding.json` records architecture, gaps, safety invariants, verification baseline, and pre-existing conditions.
- `AGENTS.md` defines same-origin API, D1 and R2 boundaries, immutable migrations, proportional validation, and dirty-worktree preservation.
- `docs/data-ingestion-contract.md` and `contracts/import-batch.v1.schema.json` define the existing external batch boundary and idempotency semantics.
- `worker/routes/imports.ts` owns ingestion, review, approval, rejection, and current canonical promotion.
- `worker/services/ingestion.ts` owns staging validation, normalized names, fingerprints, and staging statements.
- `worker/routes/project-import-jobs.ts`, `worker/services/import-jobs.ts`, and `worker/services/project-import.ts` define the separate interactive project-import pipeline.
- `migrations/0004_imports_ai_notifications_admin_and_search.sql` and `migrations/0006_import_ownership_and_file_uploads.sql` provide current import, staging, audit, evidence, and file primitives.
- `wrangler.jsonc`, `worker/env.ts`, `worker/index.ts`, `docs/backend-architecture.md`, and `docs/deployment.md` define Worker, D1, R2, Queue, observability, and Workers Free constraints.
- `tests/worker/api.test.ts` contains current ingestion idempotency, no-canonical-write-before-approval, dependency, unsafe path, and project-import safety coverage.

### Pre-existing conditions and unknowns

- Baseline commit is `b9e7449fcf2b3edff869943007347308ab7eee67`, but the deployed v0.6 worktree is extensively dirty and a complete fresh git manifest has not been obtained.
- Production AI remains disabled until the previously exposed provider credential is rotated.
- Production and preview omit Containers and native Sandbox processing on the current Workers Free account.
- Jcode 0.54.16-dev is below APS target 0.55.0, so planning can continue but execution is gated.
- Current external platform quotas, API versions, scheduling constraints, GitHub terms and rate behavior, robots interpretation, and a compliant external worker platform must be verified in TECHNICAL_RESEARCH before technical decisions are locked.

### Authoritative technical research

- `docs/research/technical-findings.md` records TD-001 through TD-010, retrieved 2026-07-29 from current Cloudflare, GitHub, RFC Editor, and OWASP primary sources.
- Primary external runtime: containerized Python collector scheduled through GitHub Actions after remote and billing preflight, with self-hosted OCI fallback.
- Cloudflare Queue, D1, and R2 limits and pricing are explicit design inputs. Queue messages are pointers, D1 rows remain narrow, and R2 evidence is content-addressed and policy-gated.
- New external GitHub collection uses the current documented API version; existing interactive project import remains unchanged.
