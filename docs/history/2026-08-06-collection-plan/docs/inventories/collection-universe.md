# Collection universe

This inventory defines what RoboPartPicker should collect, normalize, preserve, and review. It reconciles the preserved master scrape inventory with the current D1 schema and the eleven accepted external ingestion record types. It is an ontology and gap map, not source approval or permission to scrape.

## Authority and scope

- Source scope comes from `/home/lenovo/robopartpicker-planning/inventory.txt` and the preserved inventory projections in this directory.
- Current software constraints come from the RoboPartPicker [`database schema`](https://github.com/lucadominguez/robopartpicker/blob/master/docs/database-schema.md) and [`external data ingestion contract`](https://github.com/lucadominguez/robopartpicker/blob/master/docs/data-ingestion-contract.md).
- Product boundaries come from the RoboPartPicker [`README`](https://github.com/lucadominguez/robopartpicker/blob/master/README.md): catalog, collaboration, sourcing, marketplace, AI build support, D1, R2, deterministic project import, and separate scraping ingestion.
- Accepted ingestion record types today are: `manufacturer`, `supplier`, `component`, `offer`, `project`, `bom`, `integration`, `evidence`, `teardown`, `commercial_robot`, and `marketplace_reference`.
- Interactive project import is separate from scraping. It may analyze bounded project artifacts, but it must not write inferred parts, supplier offers, scraped records, or prices into the canonical catalog.

## Universal collection item envelope

Every collected value, record, missing state, and conflict should keep this envelope even when the current schema stores only part of it:

| Field | Purpose | Current alignment |
|---|---|---|
| Stable external identity | Deduplicate source records without forcing canonical merge | `import_records.externalRecordId`, staging fingerprints |
| Source identity and source type | Distinguish manufacturer, supplier, repo, forum, marketplace, publication, etc. | `import_sources`, batch `source` |
| Exact locator | HTTP(S) source URL, repository path, file path, timestamp, anchor, video timestamp, issue comment, or attachment locator | `sourceUrl`, `evidence`, file tables |
| Retrieval timestamp | When RoboPartPicker observed it | batch `retrievalTimestamp`, import jobs |
| Source publication/update time | When the source claims it was published or changed | evidence and parsed payload currently |
| Applicable entity and revision | Prevent cross-revision contamination | component/project/build revision tables, parsed payload |
| Raw payload or immutable snapshot reference | Audit, replay, and withdrawal | `import_records.rawPayload`, R2 `files` |
| Content hash | Detect drift and preserve exact evidence | `files`, import metadata |
| Schema and extractor versions | Replay old imports and debug parser drift | batch schema version, import audit events |
| Raw value and normalized value | Preserve source text and queryable normalized representation | canonical/staging columns plus JSON |
| Unit, currency, locale, market | Prevent false equivalence | money minor units, measured units, supplier regions |
| Epistemic class | Official, user-reported, measured, calculated, estimated, or AI-inferred | should be explicit in evidence claims |
| Confidence per field | Confidence belongs to a value, not just a whole record | batch record confidence exists, field-level confidence is a gap |
| License/reuse/policy review state | Public access is not reuse permission | source registry and review process, not fully normalized |
| Conflict, supersession, withdrawal | Preserve disagreement and history | `data_conflicts`, withdrawal-as-new-import event |
| Review and promotion state | Separate staged facts from canonical claims | staging tables, match candidates, import audit events |

## Canonical object families

| Family | Collect | Current canonical tables | Ingestion record type |
|---|---|---|---|
| Manufacturers | Legal/brand identity, regions, portals, product families, support channels, warranty, documentation/CAD/GitHub portals | `manufacturers` | `manufacturer` |
| Suppliers and vendors | Locations, regions, carried brands, authorization, policies, payment/shipping, support, community experience | `suppliers`, `supplier_regions` | `supplier` |
| Components | Cross-category product identity and stable product family | `components` | `component` |
| Component revisions | Revision-specific specs, files, firmware, compatibility, lifecycle status | `component_revisions`, `component_specs`, `component_files` | `component` |
| Supplier offers | SKU/listing terms, price, stock, lead time, MOQ, market, shipping, condition | `supplier_offers`, `offer_price_history` | `offer` |
| Projects and robots | Project identity, maintainers, releases, files, requirements, steps, issues, media | `projects`, `project_versions`, project child tables | `project`, `commercial_robot` |
| BOMs | Project or build part lists with versions, lines, alternatives, cost, completeness | `boms`, `bom_versions`, `bom_items`, `bom_item_alternatives` | `bom` |
| Builds and reproductions | A specific attempt to build or operate a project/release | `builds` and build child tables | currently mostly `project`, `bom`, `evidence` gap |
| Integrations and compatibility | Component/project/interface compatibility and tested bundles | `integrations`, `integration_entities`, `component_alternatives` | `integration` |
| Evidence and claims | Atomic source-backed assertions, measurements, reviews, failures, corrections | `evidence`, `evidence_claims`, `data_conflicts` | `evidence` |
| Files and software artifacts | R2 metadata, hashes, source, ownership, domain-specific attachment links | `files`, `component_files`, `project_files`, `build_files` | record-specific payload, schema gap for standalone file |
| Marketplace references | Used/surplus/general marketplace listings distinct from supplier offers | `marketplace_listings` and child tables | `marketplace_reference` |
| Teardowns | Component identifications and analysis of robots/devices | reviewed reference records per ingestion contract | `teardown` |

## Entity, revision, observation, claim, and measurement model

Use separate concepts so evidence stays honest:

- **Entity**: a stable real-world thing such as a manufacturer, product family, supplier, project, repository, robot, file, or source.
- **Revision**: an entity state with technical meaning, such as product revision, firmware release, robot generation, BOM version, RPPS release, commit, tag, CAD version, or supplier listing version.
- **Observation**: a time-bounded view of a mutable source, such as price, stock, lead time, repository activity, issue status, marketplace status, or website content.
- **Claim**: an asserted fact from a source, such as rated torque, ROS support, compatibility, known issue, substitution success, or warranty.
- **Measurement**: a result tied to method, setup, instruments, conditions, units, uncertainty, and raw files.
- **Derived metric**: a deterministic or approximate calculation from linked inputs, such as cost rollup, specific torque, price per kg, BOM completeness, or buildability score.
- **Missing-information state**: an explicit record that a desirable field is absent, hidden, unavailable, ambiguous, withheld, paywalled, not applicable, or policy-restricted.

## Component universe

### Actuators, motors, and integrated joints

Collect identity, manufacturer part number, family, revision, rotary/linear type, integrated-versus-bare classification, torque and speed ratings, torque-speed curves, current/voltage/power, gear ratio and type, backlash, efficiency, encoder type/resolution, thermal limits, IP rating, communication protocols, control modes, firmware, SDK, ROS drivers, CAD, datasheets, offers, stock, warranty, project usage, integrations, incidents, and compatibility evidence.

### Hands, grippers, and end effectors

Collect hand/gripper/tool type, DOF, controlled joints, actuator count, fingers, weight, dimensions, opening, grip/fingertip force, payload, speed, repeatability, backdrivability, tactile/force/position sensing, pneumatic or hydraulic requirements, mounting, software support, files, pricing, integrations, and failure reports.

### Sensors

Cover IMUs, force-torque sensors, tactile sensors, cameras, depth/stereo/RGB, encoders, LiDAR, radar, ultrasound, proximity, torque/contact/pressure sensors, GNSS, and motion capture. Collect axes, range, resolution, accuracy, precision, repeatability, noise, drift, sample rate, latency, FOV, min/max/depth range, frame rate, wavelength, environmental limits, calibration, ROS/SDK/firmware, files, offers, integrations, and failures.

### Compute, controllers, and embedded electronics

Collect CPU/GPU/accelerators, TOPS, memory, storage, operating systems, ROS/CUDA/acceleration support, ports, buses, wireless, voltage, power, thermals, form factor, SDKs, drivers, firmware, offers, stock, deployments. For motor controllers also collect motor types/count, current, bus voltage, control frequency, encoder support, control modes, regenerative braking, and safety features.

### Mechanical, structural, power, wiring, and safety components

Collect reducers/transmissions, batteries/BMS/power distribution, fabrication stock, fasteners, bearings, shafts, wheels, tracks, mobile bases, cables, connectors, microcontrollers, safety relays, brakes, e-stops, light curtains, scanners, PLCs, and tooling. Preserve standards, materials, dimensions, ratings, tolerances, interfaces, certifications, CAD/datasheets, price, stock, supplier regions, and known project use.

## Files, software, and digital artifacts

Collect file identity and revision independently from the entity that references it:

- CAD and geometry: STEP/STP, STL, OBJ, GLTF/GLB, DAE, IGES, DXF, USD/USDZ, Onshape/Fusion/SolidWorks exports, assemblies, textures, materials.
- Robot descriptions: URDF, Xacro, SDF, SRDF, MJCF, transmissions, controllers, simulator plugins, mesh references, links, joints, limits, axes, masses, inertias, sensors, unresolved component identities.
- Software: repositories, releases, packages, SDKs, drivers, firmware binaries, configs, launch files, ROS packages, Dockerfiles, calibration scripts, tests, benchmarks, dependency manifests.
- Project documents: README, docs, wiki pages, issues, pull requests, discussions, release notes, BOM files, build instructions, troubleshooting, media.

Required file metadata includes file type, name, source, author, license, commit/release, hash, size, units, coordinate conventions, export tool/version, parsed relationships, required external assets, last-modified time, and permission/reuse review state. Current schema has central `files` and domain file tables, but standalone artifact ingestion is a high-value gap.

## Projects, BOMs, RPPS, and builds

### Projects and project versions

Collect project name, robot name, repository, maintainers, contributors, organization, website, license, releases, commit hash, activity, archived state, robot type, intended use, difficulty, build time, estimated cost, DOF, actuator count, component count, compute, sensors, software stack, ROS/simulation support, artifact availability, instructions, calibration, tests, known issues, forks, reproductions, and media.

### BOMs and BOM items

Collect project/version, BOM version, source, commit, maintainer, currency, total stated cost, calculated current cost, part counts, category breakdown, supplier diversity, lead-time estimate, weight estimate, completeness, verification state, line IDs, subsystem, quantities, unit prices, suppliers, alternatives, required revisions, optional/required state, purchased/fabricated state, materials, file references, substitutions, unresolved identities, confidence, and evidence. If no reliable BOM exists, record a missing BOM state rather than generating one.

### Builds, reproductions, and build recipes

Collect build instructions, required tools/skills, safety warnings, ordered steps, dependencies, images/videos, torque values, wiring, pinouts, soldering, fabrication, firmware/software install, configuration, calibration, tests, expected results, elapsed time, mistakes, problems, resolutions, exact RPPS/project/BOM version, builder, region, supplier choices, substitutions, fabricated parts, modified CAD, firmware/configuration/calibration, measured performance, photos/videos, final outcome, and verification state.

Current schema is strong for private/collaborative builds and RPPS build passports. External scraping has no dedicated `build_reproduction` record type, so reproductions currently need `project`, `bom`, and `evidence` records plus a schema extension.

## Suppliers, offers, pricing, and marketplaces

- **Supplier identity**: name, legal identity, websites, regions, categories, carried manufacturers, authorization, MOQ, support, returns, warranty handling, shipping, payment, freshness.
- **Supplier offers**: canonical component, supplier SKU, manufacturer part number, title, listing URL, price breaks, currency, stock, quantity, lead time, MOQ, shipping cost/regions, delivery estimate, condition, seller/authorization state, first/last seen, last checked, listing status, source confidence.
- **Price observations**: timestamped price, currency, quantity break, taxes/shipping inclusion, market, conversion source if normalized, and relationship to offer.
- **Stock observations**: in-stock/preorder/backorder/discontinued/unknown, quantity, warehouse/region, date, lead time, confidence.
- **Marketplace references**: title, category, canonical match, condition, seller, rating, location, pickup/shipping, posted/checked/sold times, images, accessories, defects, full-robot versus part, comparable listings.

Marketplace buyer/seller offers and supplier commercial offers remain deliberately separate.

## Relationships, compatibility, alternatives, and substitutions

Collect relationships as first-class records with evidence and revisions:

- Manufacturer makes component, supplier sells component, repository describes project, file belongs to component/project/build.
- Component revision is used in project version, BOM line, build, commercial robot, teardown, integration, test, or marketplace listing.
- Mechanical compatibility: mounting pattern, envelope, shaft, bolt circle, adapter, CAD fit, material constraints.
- Electrical compatibility: voltage range, current capacity, connector, pinout, power budget, protection, battery/BMS fit.
- Protocol/software compatibility: bus, protocol version, ROS 1/ROS 2 distribution, OS, SDK, firmware, driver, package versions.
- Integration bundles: tested component sets, reference architectures, configurations, calibration, test procedures, results, limitations.
- Alternatives and substitutions: original, replacement, reason, cost/weight/performance/availability difference, required adaptations, result, failures, success state.

Treat inferred fit as unverified until supported by official compatibility, successful build evidence, or measured/tested integration.

## Community evidence, failures, and corrections

Collect structured facts rather than republishing discussions wholesale:

- Build logs: project, parts, suppliers, progress, problems, failures, solutions, cost, build time, photos, tests, modifications, outcome.
- Reviews and experience: component revision, project context, duration, reliability, heat, noise, accuracy, integration difficulty, documentation/support quality, failures, replacements, measurements.
- Supplier reports: product ordered, region, quoted and actual lead time, quality, packaging, support, refunds, counterfeit concerns, evidence.
- BOM corrections: incorrect line, corrected component/quantity/link, reason, reporter, maintainer response, accepted/rejected state, applicable release.
- Forum/Q&A/discussion annotations: question, best answer where supported, solution, failures, substitutions, linked files, tags, source URL.
- Failure records: symptom, component/project/build revision, conditions, operating time, severity, root cause if known, mitigation, replacement, recurrence, evidence, resolution state.

## Teardowns, research, tests, and technical publications

- **Teardowns**: robot/device, revision, teardown date, source, author, identified/suspected components, confidence, actuators, reducers, sensors, compute, battery, PCBs, connectors, materials, images, timestamps, estimated BOM cost, corrections.
- **Technical tests**: component revision, setup, instruments, methodology, voltage/current/temperature/load, measurements, repeatability, raw files, rated spec, deviation, author, conditions, limitations.
- **Papers and reports**: title, authors, institution, DOI, venue, date, license, robot/component, architecture, BOM, CAD/code links, methodology, results, limitations, claim relationships.
- **Commercial robots**: generation, release year, product status, dimensions, mass, DOF, payload, speeds, battery, charging, actuator/reducer/hand/sensor/compute stack, OS, SDK, ROS support, autonomy, safety, environmental rating, price, datasheet, CAD/simulation, videos, deployments, teardowns.

## Provenance and quality signals

### Provenance dimensions

- Source class: official, distributor, marketplace, repository, forum, social, video, academic, regulatory, archival.
- Publisher identity and authority for the field.
- Retrieval time, publication/update time, first seen, last seen, last successful check.
- Exact revision scope and whether the source is branch/latest/static/release-pinned.
- Extractor method: API, feed, static HTML, rendered page, repository sync, file parser, manual review, AI extraction.
- Raw evidence pointer and content hash.
- License/reuse/robots/terms review state where known. Do not infer permissions from source discovery.
- Review status, reviewer, promotion action, canonical linkage, conflict linkage, withdrawal linkage.

### Quality signals

| Signal | Why it matters |
|---|---|
| Source authority for predicate | Official specs are stronger for ratings, but users/tests may be stronger for real-world reliability |
| Exact revision match | Prevents mixing generations, firmware, regional SKUs, or branch drift |
| Field-level evidence class | Prevents AI-inferred or estimated values from appearing source-stated |
| Independent corroboration | Raises confidence and exposes conflict |
| Measurement method completeness | Makes test results comparable and reproducible |
| Raw payload/hash availability | Enables audit, replay, and withdrawal |
| Freshness and volatility | Prices, stock, issues, releases, and marketplace listings decay quickly |
| Unit/currency normalization | Prevents false comparisons |
| Conflict and missing-state visibility | Avoids silent overwrite and fake completeness |
| Review and promotion trail | Distinguishes staged import from canonical catalog truth |

## Derived metrics to compute only from linked inputs

| Metric | Inputs | Evidence class |
|---|---|---|
| Current BOM cost | reviewed BOM quantities plus selected current supplier offers | calculated |
| Stated versus current cost delta | stated BOM total and current calculated cost | calculated |
| Lead-time estimate | offers, supplier regions, stock observations, shipping assumptions | calculated or estimated |
| BOM completeness | unresolved lines, missing quantities, missing suppliers, optional lines | calculated |
| Specific torque/power/energy | torque/power/energy and mass | calculated |
| Price per performance unit | price observation plus technical spec/measurement | calculated |
| Weight rollup | BOM item quantities and component/fabricated-part weights | calculated or estimated |
| Buildability score | files, BOM, instructions, tests, calibration, known issues, requirements | calculated |
| Reliability signal | failure/review/test evidence with exposure context | estimated |
| Source freshness score | last checked, update cadence, volatility, drift history | calculated |
| Confidence score | authority, corroboration, recency, extraction confidence, conflicts | estimated |

Derived metrics must link to formula, input identities, input revisions, observation time, and uncertainty. Recalculate rather than overwrite when inputs change.

## Missing, unknown, and conflict states

Use explicit states instead of blanks:

- `unknown`: looked for, not found.
- `not_provided`: source does not publish the field.
- `not_applicable`: field does not apply to this entity/revision.
- `ambiguous`: multiple possible values or identities without enough evidence.
- `conflicting`: contradictory values exist and should link to `data_conflicts`.
- `stale`: known value exists but is past refresh threshold.
- `withdrawn`: source removed or retracted the claim/listing.
- `superseded`: newer revision or source update exists.
- `policy_restricted`: source may be linked or reviewed but content cannot be collected as desired.
- `paywalled_or_auth_required`: access exists only behind controlled access.
- `not_yet_parsed`: raw evidence exists, structured extraction is pending.
- `review_required`: parsed value cannot promote automatically.

## Temporal fields

| Concept | Required temporal fields |
|---|---|
| Source record | retrieved at, source published/updated at when known, first/last successful check |
| Entity identity | first seen, last seen, merged/superseded/withdrawn at when applicable |
| Revision | release/effective date, superseded date, applicable project/component version |
| Price/stock/offer | observed at, first seen, last seen, last checked, valid-until if published |
| Marketplace listing | posted at, observed at, sold/ended at, last checked |
| Repository/software | commit timestamp, release date, tag date, last activity, archive time |
| File | source last modified, retrieval time, hash time, parsed time |
| Measurement/test | test date, observation window, conditions timing, parser/import time |
| Build/reproduction | start date, completion date, step times, calibration/test dates |
| Claim/evidence | source assertion date, extraction date, review/promotion date, withdrawal/supersession date |
| Derived metric | as-of time, calculation time, input observation window |

## Epistemic matrix

| Class | Definition | Typical sources | Required metadata | Promotion rule | Display rule |
|---|---|---|---|---|---|
| Official | Published by the responsible manufacturer, supplier, project maintainer, regulator, or standards body for the exact scope | product pages, datasheets, manuals, release notes, official APIs, filings | publisher, URL, revision, publication/update date, retrieval date, raw evidence, license/reuse state | can seed canonical facts only for exact revision and predicate, still can conflict | label publisher and date |
| User-reported | Attributable community or customer experience, assertion, correction, review, or build report | forums, GitHub issues, PR comments, reviews, build logs, videos, social posts | author handle where appropriate, context, project/build/component revision, date, source URL, excerpt policy | require review and preferably corroboration for consequential specs or compatibility | label as report, show context and uncertainty |
| Measured | Test result tied to method, setup, instruments, conditions, units, and raw or summarized observations | benchmarks, teardown labs, build tests, videos with instruments, papers | methodology, instruments, calibration if known, conditions, units, sample count, raw file/hash, author, date | promote as measurement, not manufacturer rating; compare to specs separately | show conditions, uncertainty, and measured-versus-rated distinction |
| Calculated | Deterministic transformation of linked inputs using a named formula | cost rollups, unit conversions, ratios, scorecards, weight totals | formula version, input IDs/revisions, input observation times, calculation time | auto-update when inputs change if formula is reviewed | expose formula and input lineage |
| Estimated | Bounded approximation from assumptions, incomplete data, model, or heuristic | teardown BOM estimates, weight/cost/lead-time estimates, reliability signals | method, assumptions, range, confidence, inputs, estimator version, date | require review and uncertainty; never replace observed value | visibly label estimate and range |
| AI-inferred | Model-extracted or inferred value not directly asserted in source text or a deterministic parser | entity matching, file-part guesses, unstructured claim extraction, image/video interpretation | prompt/model/extractor version, source grounding, candidate alternatives, confidence, reviewer state | staging only until grounded and reviewed; never silently canonical | label as AI-inferred or reviewer-confirmed after validation |

## Reconciliation with the eleven ingestion record types

| Ingestion type | Should carry | Do not overload with | Main schema gaps |
|---|---|---|---|
| `manufacturer` | manufacturer/legal/brand/portal/support/product-family identity | supplier offers or component specs beyond references | manufacturer portal/source policy details |
| `supplier` | vendor identity, regions, carried brands, policies, support | timestamped prices or stock | supplier experience reports as first-class records |
| `component` | component and revision identity, specs, files, software support, category-specific fields | offers, marketplace listings, unrelated project use without evidence links | richer revision taxonomy, field-level epistemics, standalone files |
| `offer` | supplier SKU, listing terms, price/stock/lead time observations | used marketplace classified listings | separate stock history and shipping/tax assumptions |
| `project` | open-source project, repository, versions, requirements, steps, files, known issues | private interactive project drafts, canonical components inferred without review | external build reproduction record |
| `bom` | BOM version, lines, alternatives, costs, unresolved identities, completeness | invented BOMs when none exist | BOM correction record and missing-BOM state |
| `integration` | tested compatibility bundles, interface requirements, substitution/alternative links | vague compatibility guesses | compatibility rule/reference taxonomy |
| `evidence` | atomic claims, reviews, measurements, failures, corrections, provenance | whole source dumps without structured claims | claim-level confidence, missing states, community reports, tests |
| `teardown` | reviewed teardown reference and component identification evidence | canonical component creation without review | normalized teardown findings and confidence per identified item |
| `commercial_robot` | complete robot product/generation specs and references | internal component assumptions unless evidenced | dedicated robot-generation canonical tables |
| `marketplace_reference` | marketplace listing identity, condition, seller/location, item matches, observed status | authorized distributor offers | price/stock history separate from user marketplace negotiation tables |

## High-value schema gaps

1. **Field-level epistemics and confidence**: batch confidence is record-level, but source fields need official/user/measured/calculated/estimated/AI-inferred plus confidence and reviewer state.
2. **Standalone external file/artifact ingestion**: `files` exists, but import types do not directly stage CAD, robot-description, firmware, datasets, media, or parsed file findings as their own records.
3. **External build reproduction record type**: builds are modeled for platform users, but scraped reproductions/forks/build logs need a reviewed reference path.
4. **Measurement/test canonicalization**: technical tests can fit `evidence`, but need method, conditions, instruments, uncertainty, raw files, and rated-spec comparison.
5. **Missing-information records**: current flow needs explicit missing, unknown, not applicable, ambiguous, stale, restricted, and not-yet-parsed states.
6. **Stock and offer observation history**: price history exists, but stock quantity/status, lead time, shipping, market, tax inclusion, and listing lifecycle need equal temporal treatment.
7. **Compatibility/reference taxonomies**: interface, connector, protocol, voltage/current, mechanical fit, ROS, firmware, OS, and adapter rules need normalized reference data.
8. **Community report and failure records**: user-reported experience, supplier reports, failures, BOM corrections, and issue-derived claims should be queryable without becoming official specs.
9. **Teardown finding structure**: teardown ingestion should project suspected/identified components with per-item confidence, evidence snippets, timestamps, and correction links.
10. **Commercial robot generation model**: `commercial_robot` is an ingestion type, but the schema does not expose a first-class canonical robot product/generation table in the domain summary.
11. **Source policy and lifecycle registry**: current docs require robots/terms/reuse review, lifecycle, owners, fixtures, and stop conditions, but this is not yet represented as a durable normalized source registry.
12. **Conflict and supersession workflow coverage**: `data_conflicts` exists, but field-level conflict resolution, withdrawn claims, superseded revisions, and review outcomes need systematic coverage.

## Scannable collection checklist

For any proposed new field or source, answer:

1. What canonical entity or revision is the subject?
2. Is the value an identity, observation, claim, measurement, relationship, file, derived metric, or missing state?
3. Which ingestion record type can carry it today?
4. What exact source locator, retrieval time, publication time, hash, and raw evidence preserve provenance?
5. Which epistemic class applies at field level?
6. What unit, currency, locale, market, method, formula, or assumptions are needed?
7. Can it conflict, be superseded, decay, or be withdrawn?
8. What review/promotion rule prevents silent overwrite?
9. What permission/reuse state is known, unknown, restricted, or denied?
10. Is this a schema gap that should be tracked instead of squeezed into an unsafe field?
