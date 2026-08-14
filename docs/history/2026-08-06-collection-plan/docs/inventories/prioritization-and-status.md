# Prioritization, lifecycle, and backlog views

This document makes source and work-item selection explicit. It is a comparison framework, not an approval list. No candidate becomes an executable scrape target until policy and technical gates are complete.

## Eligibility gates before scoring

A source is not eligible for an automated pilot score unless all are true:

- canonical identity and exact target scope are known
- current access interfaces are documented
- robots, terms, license, and reuse review have a named owner and evidence
- authentication, payment, personal-data, and geographic constraints are known
- likely objects and fields map to the collection universe
- expected volume, cadence, cost, and maintenance burden have bounded estimates
- raw evidence, provenance, cancellation, and withdrawal can be implemented

Ineligible sources remain visible as research, manual-only, link-only, denied, or deferred items.

## Two distinct priority queues

Do not conflate adapter engineering with permission to run live collection.

### Research and implementation-readiness queue

A source may receive a **provisional engineering score** before every live gate is complete when:

- the score is explicitly labeled provisional
- missing policy or access evidence is represented as risk and low confidence
- the source remains disabled
- work is limited to research, contracts, synthetic or policy-approved fixtures, and implementation that makes no live request
- the queue records the exact blocker required before live execution

This queue answers which adapter or source packet should be prepared first. It does not approve scraping.

### Live automation queue

A source receives an executable live priority only after every eligibility gate is complete and current. Policy score zero, a hard stop, expired evidence, or missing approval excludes it regardless of its provisional engineering score.

Every table must label which queue it represents.

## Ten scoring inputs

Score each dimension from 0 to 5. Record evidence and uncertainty beside every score.

| Dimension | 0 | 3 | 5 | Direction |
|---|---|---|---|---|
| Product value | little relevant coverage | useful category coverage | uniquely unlocks core comparison or build decisions | higher is better |
| Authority and evidence quality | anonymous or unverifiable | attributable secondary evidence | authoritative primary, measured, or reproducible evidence | higher is better |
| Current coverage gap | equivalent facts are already complete | improves weak or partial coverage | fills a critical missing object or field family | higher is better |
| Access stability | blocked or highly volatile | bounded static pages or files | documented API, feed, export, or stable repository | higher is better |
| Adapter reuse value | source-specific dead end | some reusable transport or parsing | unlocks a broad source family | higher is better |
| Freshness need | little value from refresh | periodic changes matter | frequent changes materially affect user decisions | higher is better |
| Policy risk | clearly approved bounded use | unresolved constraints needing review | likely prohibited, sensitive, or incompatible scope | higher is worse |
| Implementation effort | trivial reuse | moderate adapter and normalization | browser-heavy, ambiguous, or specialist extraction | higher is worse |
| Expected maintenance | stable contract and easy drift detection | manageable periodic maintenance | frequent breakage or specialist upkeep | higher is worse |
| Recurring cost | zero marginal source cost | acceptable bounded pilot cost | unbounded or excessive recurring cost | higher is worse |

### Confidence modifier

Every score also gets confidence:

- `verified`: supported by current primary evidence
- `validated`: supported by multiple direct observations or tests
- `plausible`: reasonable but incomplete
- `speculative`: mostly unknown

Do not hide uncertainty in a precise total. Present the dimension vector and confidence distribution alongside any aggregate.

### Implementation priority score

For provisional engineering comparison or an eligible live queue, score each input from 0 to 5 and compute. Eligibility still controls whether the result is executable:

```text
priority =
  4 * product_value
+ 3 * authority_and_evidence_quality
+ 3 * current_coverage_gap
+ 2 * access_stability
+ 2 * adapter_reuse_value
+ 1 * freshness_need
- 3 * policy_risk
- 2 * implementation_effort
- 2 * expected_maintenance
- 1 * recurring_cost
```

The weighted score intentionally favors useful primary evidence, important product-data gaps, stable access, and adapter-family reuse. It penalizes policy uncertainty, fragile extraction, continuing maintenance, and recurring cost. A hard stop or ineligible gate overrides the total. Record every input, confidence level, and supporting evidence beside the score.

## Secondary portfolio factors

Use these after basic scoring to construct a balanced pilot set:

- object-category coverage
- evidence-class diversity
- access-method diversity
- static versus volatile data
- manufacturer versus supplier versus community authority
- parser and file-format reuse across future sources
- geographic and language coverage
- unique identifier quality
- compatibility and revision resolution value
- expected conflict and reviewer workload
- ability to exercise withdrawal and supersession
- ability to provide a reusable adapter template

## Lifecycle transition table

| Current | Next | Required evidence | Forbidden shortcut |
|---|---|---|---|
| discovered | researching | identity candidate, owner, open questions | active |
| researching | candidate | verified locator, coverage, access profile, preliminary policy evidence | pilot |
| researching | manual-only or link-only | documented constraint and reviewer decision | automated collection |
| researching | denied | documented prohibitive condition or reviewer decision | silent deletion |
| candidate | approved | completed policy and technical preflight, bounded scope, budget, tests, stop and withdrawal plan | active |
| approved | pilot | recorded start, monitoring, kill switch, immutable pilot limits | scope expansion |
| pilot | active | acceptance evidence over approved duration and explicit promotion | automatic promotion |
| pilot or active | paused | incident, drift, stale review, cost, ownership, or operator decision | background retries continuing |
| paused | pilot or active | cause resolved, regression evidence, current approvals, explicit resume | automatic resume |
| any nonretired | denied, manual-only, or link-only | reviewer decision and effective scope | erasing history |
| paused or denied | retired | schedules and credentials removed, retention and withdrawal complete | deleting audit trail |

## Status fields

Every source status entry should include:

- source ID and name
- lifecycle state
- collection disposition
- policy state and reviewed scope
- technical readiness state
- current owner and reviewer
- last verified and next review dates
- score vector and confidence
- blockers and next action
- linked evidence, adapter, fixtures, runbook, incidents, and approvals

## Backlog views

### Identity resolution backlog

- legacy labels without canonical domains
- aliases that may represent the same organization
- manufacturer versus distributor ambiguity
- regional or acquired-brand relationships
- mirrors, archives, and unofficial copies
- product family, model, SKU, and revision collisions

### Policy research backlog

- missing or stale robots evidence
- missing or stale terms and API terms
- unknown data or file license
- unclear user-generated-content reuse
- authentication or subscription requirements
- personal data and account profile exposure
- unclear image, CAD, manual, and dataset copying rights

### Access characterization backlog

- undocumented APIs or feeds requiring confirmation
- unknown pagination, quotas, or rate guidance
- rendered-only pages
- localization and currency variants
- anti-automation or challenge behavior
- source volume and volatility estimates
- archive and historical access

### Extraction design backlog

- stable key discovery
- entity and revision resolution
- unit and currency normalization
- compatibility relationship extraction
- table, PDF, CAD, archive, and repository parsers
- structured-data and embedded-JSON evaluation
- error, missing, conflict, and not-applicable semantics

### Quality backlog

- representative fixtures
- golden records
- conflict adjudication rules
- drift signatures
- cross-source reconciliation
- measured versus claimed performance separation
- stale observation behavior
- withdrawal and replay tests

### Operations backlog

- owner assignment
- source and global budgets
- dashboards and alert routing
- kill switches and circuit breakers
- run manifests and audit views
- incident runbooks
- policy refresh scheduling
- retirement and credential cleanup

## Pilot archetype shortlist

These are archetypes to fill with reviewed sources, not preapproved targets.

1. **Official static product catalog**
   - Tests manufacturer identity, revisions, specifications, manuals, and files.
   - Prefer stable HTML, structured data, or downloadable catalog data.
2. **Documented distributor API or export**
   - Tests offers, currencies, availability, lead time, and supplier part mapping.
   - Requires strict quota, regional, licensing, and price-context handling.
3. **Open-source robotics repository**
   - Tests repository metadata, releases, files, BOMs, dependencies, licenses, and commit pinning.
   - Prefer explicit open licenses and stable release tags.
4. **Structured open dataset or publication API**
   - Tests identifiers, citations, versions, measurements, and dataset provenance.
   - Requires license and retraction or supersession handling.
5. **Policy-compatible community evidence source**
   - Tests user-reported failures, substitutions, build outcomes, and confidence.
   - Requires moderation, privacy minimization, claim separation, and manual review.

## Suggested first portfolio properties

The first five-source portfolio should collectively include:

- at least one primary manufacturer source
- at least one offer or availability source
- at least one versioned repository or file source
- at least one measured or research evidence source
- at least one source that exercises conflict or human review
- at least three acquisition methods, with browser automation used only if unavoidable and approved
- both slow-changing identity/specification data and volatile observation data
- at least one source with a complete withdrawal rehearsal
- no source with unresolved policy or unbounded cost

The portfolio properties do not force a low-scoring source into the first five. A volatile marketplace or community source should be postponed when a higher-value official source provides better evidence with lower policy and maintenance risk.

## Implementation work-order rules

1. Complete the shared Cloudflare adapter runtime, fixture contract, health metrics, Queue path, and ingestion handoff before building many adapters.
2. Build one source until the first adapter family has passed its pilot health thresholds.
3. After that, parallelize only sources using proven adapter families or independent infrastructure.
4. Keep no more than three new source adapters in active development at once.
5. Repair a degraded high-priority active adapter before starting a lower-priority source unless the incident is explicitly deferred.
6. Recompute rankings monthly and after any major policy, interface, product requirement, or coverage change.

## Default source-family order

1. Official manufacturer APIs, exports, stable catalogs, and documentation.
2. Authorized distributor APIs or structured exports with price and stock observations.
3. Official open-source repositories, releases, BOMs, robot descriptions, and documentation.
4. Public standards, structured research datasets, certification records, and fabrication-service catalogs.
5. Additional official manufacturers and distributors that reuse proven adapter families.
6. Policy-compatible community build evidence with strong provenance and moderation controls.
7. Volatile marketplaces, browser-heavy sources, and weakly structured community content.

This order is a default. The recorded eligibility and weighted score choose the actual next source.

## Coverage and freshness signals

Track by list and source family:

- discovered, researched, candidate, approved, pilot, active, constrained, and retired counts
- percentage with verified canonical locator
- percentage with current policy evidence
- percentage with object and field mapping
- percentage with score vector and confidence
- percentage with owner, cadence, and stale threshold
- fixture and adapter coverage
- accepted, rejected, conflict, and manual-review yield
- stale sources and overdue reviews
- unresolved duplicates, identities, licenses, and schema gaps

## Decision record template

```text
Decision ID:
Source or work item:
Decision: candidate | approved | pilot | active | paused | denied | manual-only | link-only | retired
Exact scope:
Evidence reviewed:
Score vector and confidence:
Budget and limits:
Acceptance criteria:
Stop conditions:
Withdrawal behavior:
Owner and reviewer:
Effective date and expiry:
Reasoning:
Follow-up:
```
