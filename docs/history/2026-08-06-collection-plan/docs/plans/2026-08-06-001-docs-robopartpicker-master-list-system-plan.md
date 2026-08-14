---
title: RoboPartPicker Master List System - Plan
type: docs
date: 2026-08-06
topic: robopartpicker-master-list-system
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
---

# RoboPartPicker Master List System - Plan

## Goal Capsule

- **Objective:** Turn RoboPartPicker's large but monolithic collection inventory into an exhaustive, indexed, ranked, maintainable list system that accelerates source discovery, extraction design, tooling selection, review, and rollout planning.
- **Product authority:** The list system organizes planning knowledge. It does not authorize scraping, enable sources, install tools, spend money, mutate canonical catalog records, or weaken the existing provenance and source-policy gates.
- **Existing authority:** The preserved 1,694-line inventory and `docs/robopartpicker-data-collection-plan.md` remain authoritative evidence of prior scope. New lists are normalized projections and researched expansions, not silent replacements.
- **Open blockers:** Exact source permissions, scoring weights, machine-readable storage format, and pilot activation remain separate planning or approval decisions.

---

## Product Contract

### Summary

Create a master index that links focused inventories for sources, collectable objects and fields, tools, skills, agent roles, workflows, risks, matrices, and prioritized pilot candidates. Every item must be easy to find, classify, compare, update, and trace back to evidence.

### Problem Frame

RoboPartPicker already has substantial scope coverage, but it is concentrated in a 1,694-line inventory and a 3,002-line implementation plan. Those documents preserve valuable detail while making quick retrieval, deduplication, prioritization, gap analysis, and recurring updates expensive.

A list only accelerates work when readers can tell what an item is, where it came from, whether it is approved, what it connects to, and what decision it supports. A flat list of hundreds of sites or fields without lifecycle, evidence, and ranking would increase volume without increasing control.

### Key Decisions

- **Preserve, then project.** The legacy inventory stays immutable while normalized indexes expose its contents in reusable views. Governs R1, R2, R11.
- **Separate possibility from permission.** Candidate, approved, denied, manual-only, link-only, and retired sources must never share an ambiguous status. Governs R4, R8, R9.
- **Store each fact once and derive views.** Cross-category membership is represented through tags and matrices rather than divergent copies. Governs R3, R6, R10.
- **Rank with evidence, not enthusiasm.** Priorities must expose value, provenance strength, access quality, extraction effort, volatility, policy risk, and expected maintenance cost. Governs R7.
- **Lists cover the whole operating system.** The scope includes data sources, data objects, tools, skills, roles, workflows, safeguards, failure states, and maintenance. Governs R5.

### Actors

- A1. **Data strategist:** Expands the universe of possible sources, objects, fields, and relationships.
- A2. **Source researcher:** Resolves domains, access methods, licensing, robots, terms, and evidence strength.
- A3. **Collection engineer:** Selects adapters, parsers, queues, storage boundaries, and verification methods.
- A4. **Review operator:** Approves, denies, defers, or constrains sources and proposed canonical mutations.
- A5. **Agent coordinator:** Routes research, planning, implementation, review, debugging, and verification through appropriate skills and agents.
- A6. **Future planner:** Converts selected inventory items into bounded implementation or onboarding units without inventing missing scope.

### Requirements

#### List architecture

- R1. The system must provide one master index that names every list family, its purpose, authority, owner, and relationship to other lists.
- R2. The system must preserve the legacy canonical inventory verbatim or by immutable reference and identify every normalized projection derived from it.
- R3. Every normalized item must have a stable identity and enough structured metadata to support deduplication, filtering, ranking, and cross-list relationships.
- R4. Every source must carry an explicit lifecycle and access disposition that distinguishes discovery from permission to collect.
- R5. The system must cover sources, collectable data, tools, skills, agent roles, workflows, checklists, matrices, risks, stop conditions, gaps, and pilot backlogs.
- R6. The system must provide matrices connecting sources to object types, source families to acquisition methods, object types to fields, tools to workloads, and skills or roles to workflow stages.

#### Prioritization and control

- R7. Candidate sources and work items must be rankable by product value, evidence strength, structured access, extraction effort, volatility, policy risk, cost, and maintenance burden.
- R8. Lifecycle states must support at least discovered, researching, candidate, approved, pilot, active, paused, denied, manual-only, link-only, and retired.
- R9. A denied, manual-only, link-only, paywalled, authenticated, or policy-unclear source must remain visible without being treated as an executable scrape target.
- R10. Cross-cutting items must use tags and relationships instead of being copied into conflicting independent records.

#### Traceability and maintenance

- R11. Every researched addition must record evidence, verification date, and whether it expands, confirms, corrects, or supersedes legacy scope.
- R12. Every collectable value must map to an evidence class such as official, user-reported, measured, calculated, estimated, or AI-inferred.
- R13. Every list family must define an update cadence, stale threshold, owner, and completion or coverage signal.
- R14. The system must expose missing information, unresolved identity, unsupported formats, conflicting claims, policy uncertainty, and unverified URLs as first-class backlog states.
- R15. The documentation must remain human-scannable while retaining a clear path to future machine-readable registries and generated views.

### Key Flows

- F1. **Add a newly discovered source**
  - **Trigger:** A researcher finds a manufacturer, repository, forum, feed, dataset, or marketplace not in the index.
  - **Actors:** A1, A2.
  - **Steps:** Search for duplicates, assign identity, classify source family and coverage, record evidence and access path, set lifecycle to discovered or researching, and link relevant object types.
  - **Outcome:** The source becomes findable without being implicitly authorized.
  - **Covers:** R3, R4, R9, R11.

- F2. **Select a pilot candidate**
  - **Trigger:** Planning needs a bounded source for one rollout wave.
  - **Actors:** A2, A3, A4, A6.
  - **Steps:** Filter by required object coverage, compare ranking dimensions, inspect policy and cost, verify access, and record approval or rejection evidence.
  - **Outcome:** A candidate is promoted to an approved pilot or receives a visible constrained disposition.
  - **Covers:** R4, R7, R8, R9.

- F3. **Expand the collection ontology**
  - **Trigger:** A source exposes a valuable field, relationship, observation, or failure state not represented by existing objects.
  - **Actors:** A1, A3, A4.
  - **Steps:** Classify the value, evidence class, unit and temporal behavior, connect it to canonical objects, check schema overlap, and record the gap without inventing canonical data.
  - **Outcome:** The ontology and backlog expand with traceable scope.
  - **Covers:** R6, R10, R12, R14.

- F4. **Replace or retire a tool or workflow**
  - **Trigger:** A tool becomes obsolete, incompatible, unsafe, too costly, or superseded.
  - **Actors:** A3, A5.
  - **Steps:** Record the reason and evidence, link replacement candidates, update workload and skill mappings, preserve historical rationale, and change lifecycle without deleting the record.
  - **Outcome:** Current recommendations stay accurate without erasing history.
  - **Covers:** R5, R8, R11, R13.

### Acceptance Examples

- AE1. **Covers R4, R8, R9.** Given a useful marketplace with unclear automated-access terms, when it is added, then it appears as policy-unclear or manual-only and cannot be selected as an active scraper target.
- AE2. **Covers R3, R6, R10.** Given one distributor that covers motors, sensors, compute, connectors, and tools, when it is indexed, then one source identity links to all five coverage categories without five independent source records.
- AE3. **Covers R7.** Given two sources with similar component coverage, when one has a stable documented API and the other requires brittle browser automation, then the ranking exposes the access and maintenance difference rather than hiding it in prose.
- AE4. **Covers R11, R14.** Given a legacy source label without a verified current domain, when it is normalized, then the unresolved URL remains visible as a research gap and is not silently guessed.
- AE5. **Covers R12.** Given a manufacturer torque rating and a community bench test, when both are collected, then they remain separate official and measured claims linked to the same component revision.
- AE6. **Covers R13.** Given a volatile offer source, when its verification date exceeds its stale threshold, then the list exposes freshness debt even if the source remains approved.

### Success Criteria

- A cold reader can locate any major source, data object, tool, skill, workflow, risk, or pilot question from the master index in under two navigation steps.
- The 38 legacy collection sections and all preserved legacy source labels are represented or explicitly deferred.
- Candidate and executable source states are never conflated.
- Repeated source names and cross-category sources resolve to one normalized identity.
- Every ranked pilot candidate exposes both expected value and the reason it may be unsafe, costly, or brittle.
- The list system can grow without requiring another single monolithic document.

### Scope Boundaries

- This work does not run scrapers, enable recurring collection, populate the catalog, install paid tools, create accounts, bypass access controls, or approve source policies.
- This work does not replace the canonical provenance, ingestion, review, audit, budget, and withdrawal requirements in `docs/robopartpicker-data-collection-plan.md`.
- This work does not choose final database schemas, registry serialization, adapter libraries, or orchestration infrastructure.
- This work may identify potential tools and approaches, but version-sensitive adoption decisions require authoritative technical research during planning.

### Dependencies and Assumptions

- The current RoboPartPicker ingestion and review boundaries remain the destination for approved external records.
- The 1,694-line inventory is historically authoritative but contains generic labels, possible duplicates, unresolved URLs, and a truncated final line.
- Source access and reuse conditions can change and must be reverified near pilot onboarding.
- Human review remains required before uncertain or conflicting external data becomes canonical.

### Outstanding Questions

#### Deferred to planning

- Choose the machine-readable registry format and generated-view approach.
- Choose exact ranking weights and tie-break rules.
- Assign durable owners and refresh cadences per list family.
- Decide whether normalized registries live in this planning repository, the application repository, or both through generated artifacts.
- Select the first five source candidates only after current policy and access verification.

### Sources and Research

- `docs/robopartpicker-data-collection-plan.md` defines the provenance-first architecture, rollout waves, policy boundaries, and five-source pilot.
- `docs/inventories/legacy-source-index.md` normalizes source labels from the preserved 1,694-line inventory without asserting permission or current validity.
- The current application contracts and schema are documented in the main RoboPartPicker repository under `docs/data-ingestion-contract.md`, `docs/database-schema.md`, and `docs/backend-architecture.md`.
