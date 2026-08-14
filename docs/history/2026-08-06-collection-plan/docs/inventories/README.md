# RoboPartPicker master list index

This directory is the navigation layer for RoboPartPicker data collection. It turns the preserved canonical inventory into focused, cross-linked working lists without treating discovery as permission to scrape.

## Authority order

1. [`../plans/2026-08-06-002-cloudflare-first-scraping-operations-plan.md`](../plans/2026-08-06-002-cloudflare-first-scraping-operations-plan.md) governs collection hosting, scheduling, adapter health, source prioritization, maintenance automation, and infrastructure simplicity.
2. [`../robopartpicker-data-collection-plan.md`](../robopartpicker-data-collection-plan.md) continues to govern provenance, policy, canonical ingestion, review, withdrawal, and live-source approval except where its external-runner architecture conflicts with the Cloudflare-first plan.
3. [`legacy-canonical-inventory.txt`](legacy-canonical-inventory.txt) is the verbatim 1,694-line historical scope inventory, preserved at SHA-256 `8626d7ea96f6ee901f31e808129762322fde3f31a1b400007155a57b144da42a`.
4. The lists below are normalized projections and researched expansions. They make the scope usable but do not silently supersede these authorities.
5. Application ingestion contracts and schemas remain authoritative for what software currently accepts.

## Coverage snapshot

- 608 named focused list views across sources, data, evidence, tools, workflows, risks, planning, and metrics
- 223 candidate URL mentions representing 214 unique URLs across 16 source-universe sections
- 227 normalized legacy source labels from 309 cleaned mentions and 35 source-list sections
- 38 preserved legacy collection sections
- 11 currently accepted external ingestion record types reconciled against a broader collection ontology
- More than 5,100 lines across the preserved inventory and eleven human-readable inventory documents

Counts describe planning coverage, not approved scraping targets or canonical catalog records.

## The list of lists

| List | Question it answers | Authority | Primary owner | Update trigger |
|---|---|---|---|---|
| [Catalog of 608 lists](list-catalog.md) | Which focused source, data, quality, workflow, risk, and management views could exist? | Exhaustive view catalog | Planning owner | New decision or operating question |
| [Legacy source index](legacy-source-index.md) | Which source labels were already named, and in which collection sections? | Derived from preserved inventory | Source researcher | Legacy inventory changes |
| [Source universe](source-universe.md) | Which sites, APIs, repositories, datasets, forums, feeds, and source families might supply evidence? | Researched candidate inventory | Source researcher | Discovery, verification, or access change |
| [Collection universe](collection-universe.md) | What entities, revisions, claims, measurements, files, relationships, and states should be collected? | Schema-aligned ontology | Data strategist | New useful evidence or schema gap |
| [Tools and skills](tools-and-skills.md) | Which acquisition, parsing, storage, orchestration, QA, and agent capabilities fit each workload? | Capability inventory, not adoption approval | Collection engineer | Tool, version, or workload change |
| [Workflow checklists](workflow-checklists.md) | What steps and evidence are required from discovery through retirement? | Operational projection of the canonical plan | Collection engineer and reviewer | Process or gate change |
| [Coverage matrices](coverage-matrices.md) | How do source families, object types, methods, tools, skills, and evidence classes connect? | Derived planning views | Data strategist | Any linked list changes |
| [Prioritization and status](prioritization-and-status.md) | How are candidates ranked, promoted, paused, denied, and refreshed? | Planning framework | Review operator | Scoring or lifecycle decision |
| [First-wave source queue](first-wave-source-queue.md) | Which verified sources and adapter families should be implemented first? | Evidence-backed implementation order, not live approval | Collection engineer | Source verification, score, blocker, or implementation result |
| [Risks and stop conditions](risks-and-stop-conditions.md) | What can go wrong, how is it detected, and when must collection stop? | Safety and operations index | Review operator | Incident, new risk, or mitigation change |
| [List system architecture](list-system-architecture.md) | How should identities, metadata, generated views, ownership, refresh, and migration work? | Information architecture | Planning owner | Registry design or maintenance change |
| [Cloudflare collection runtime contract](../architecture/collection-runtime-contract.md) | What exact bindings, tables, messages, leases, evidence keys, and handoff rules must the runtime implement? | Shared implementation contract | Collection engineer | Runtime interface or state-model change |
| [Component-spec promotion contract](../architecture/component-spec-promotion-contract.md) | How do reviewed staged specifications become lossless canonical revisions and comparison facts? | Application integration contract | Application engineer | Promotion schema or review behavior change |
| [Cloudflare-first scraping operations plan](../plans/2026-08-06-002-cloudflare-first-scraping-operations-plan.md) | How will collection run remotely, prioritize sources, detect broken adapters, recover safely, and avoid redundant infrastructure? | Runtime architecture and requirements contract | Collection engineer | Hosting, scheduling, monitoring, or prioritization decision |
| [Master list system plan](../plans/2026-08-06-001-docs-robopartpicker-master-list-system-plan.md) | What requirements and boundaries govern this list system? | Requirements contract | Planning owner | Scope decision |

## Fast paths

### I found a new source

1. Search the legacy index and source universe for duplicates and aliases.
2. Add one stable source identity, not one record per category.
3. Record source family, coverage, evidence URL, verification date, access methods, authentication, expected cost, and policy state.
4. Set lifecycle to `discovered` or `researching`. Never jump directly to `active`.
5. Link object types in the coverage matrices.
6. Run the source onboarding checklist before requesting pilot approval.

### I found a new field or fact type

1. Locate its entity, revision, observation, claim, measurement, relationship, or missing-information category in the collection universe.
2. Identify value type, unit, temporal behavior, applicable revision, and evidence class.
3. Map it to an accepted ingestion record or record it as a schema gap.
4. Keep conflicting claims separate. Do not overwrite one source with another.
5. Add source-family and object-field matrix links.

### I need to choose what to build next

1. Decide whether the question is provisional implementation readiness or live automation priority.
2. For implementation readiness, keep sources disabled and score uncertainty explicitly. For live work, filter to sources with complete current policy and technical gates.
3. Check the [first-wave source queue](first-wave-source-queue.md) before rescoring from scratch.
4. Apply the weighted priority formula using product value, authority, coverage gap, access stability, adapter reuse, freshness, policy risk, implementation effort, expected maintenance, and recurring cost.
5. Prefer official sources and adapters that can be reused across many later sources.
6. Keep no more than three new adapters in development and repair degraded high-priority adapters before lower-priority expansion.
7. Define acceptance evidence, budget limits, stop conditions, withdrawal behavior, and review ownership before implementation.

## Shared source record fields

Every normalized source should eventually have these fields, whether represented in Markdown, YAML, JSON, or a database:

- stable ID
- canonical name
- aliases and legacy labels
- canonical domain or repository locator
- source family and subtype
- publisher or operator
- geographic and language coverage
- object and field coverage
- available interfaces: API, feed, sitemap, static HTML, rendered HTML, files, repository, manual export
- authentication and account requirements
- robots, terms, license, and reuse review state
- collection disposition
- lifecycle state
- evidence URLs and verification timestamps
- expected update frequency and volatility
- expected volume, pagination, and rate limits
- extraction complexity and required tools
- estimated cost and maintenance burden
- owner, refresh cadence, stale threshold, and next action
- linked adapter, parser, fixtures, canary, incidents, and withdrawal records

## Shared collection-item fields

Every collected or proposed value should preserve:

- subject identity and applicable revision
- predicate or field identity
- raw value and normalized value
- unit and conversion method
- evidence class: official, user-reported, measured, calculated, estimated, or AI-inferred
- source identity, exact locator, retrieval time, and source publication time when known
- extractor and normalization version
- confidence, conflict state, and missing-information state
- license or reuse context
- review and promotion state
- supersession and withdrawal links

## Lifecycle vocabulary

- `discovered`: named but not yet investigated
- `researching`: identity, access, policy, or coverage is being verified
- `candidate`: sufficiently understood to compare, not yet approved
- `approved`: policy and technical preflight complete for a bounded use
- `pilot`: approved adapter running only within pilot controls
- `active`: recurring collection explicitly enabled
- `paused`: temporarily disabled pending investigation or change
- `denied`: automated collection rejected
- `manual-only`: evidence may be reviewed or entered by a person, but not automated
- `link-only`: locator may be stored, but content should not be copied
- `retired`: no longer used, with history preserved

## Cross-cutting tags

Use tags for views, never duplicate source identities:

- domains: component, robot, project, BOM, build, supplier, marketplace, community, research
- evidence: official, user-reported, measured, calculated, estimated, AI-inferred
- access: API, feed, static-web, rendered-web, repository, file, browser, manual
- volatility: static, slow, periodic, fast, real-time
- policy: clear, review-needed, restricted, denied
- effort: low, medium, high, unknown
- value: identity, compatibility, price, availability, performance, instructions, failure, provenance

## Definition of useful coverage

A list family is useful when it has:

- a named purpose and owner
- stable item identities or an explicit path to them
- traceable evidence and a verification date
- lifecycle or status where applicable
- links to adjacent lists
- a coverage denominator or visible backlog
- a refresh cadence and stale threshold
- explicit unknown, conflict, and policy-unclear states

Volume alone is not coverage. A thousand unverified URLs are less actionable than ten policy-reviewed sources with known objects, interfaces, fixtures, owners, and stop conditions.
