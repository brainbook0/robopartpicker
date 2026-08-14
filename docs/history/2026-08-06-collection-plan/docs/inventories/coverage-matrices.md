# Coverage matrices

These matrices are navigation and gap-analysis views. A check means that a source family or method can plausibly supply the item. It does not mean every source does so or that collection is permitted.

Legend: `P` primary or commonly authoritative, `S` secondary or contextual, `M` measured or observed, `I` inferred or derived, `-` uncommon.

## Source family to collection domain

| Source family | Components | Robots | Projects | BOMs | Builds | Offers | Compatibility | Failures | Software/files | Research |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Manufacturer product catalog | P | P | S | S | S | - | P | S | P | S |
| Manufacturer documentation portal | P | P | S | S | P | - | P | S | P | S |
| Manufacturer repository | P | S | P | P | P | - | P | S | P | S |
| Distributor API or catalog | P | S | - | - | - | P | S | - | S | - |
| Specialist robotics retailer | P | P | S | S | S | P | S | S | S | - |
| General marketplace | S | S | - | - | - | P | S | S | S | - |
| Open-source project repository | S | P | P | P | P | - | P | M | P | S |
| Package or dependency registry | - | - | P | - | S | - | P | S | P | - |
| CAD or fabrication repository | P | P | P | P | P | - | P | S | P | - |
| Build-log platform or personal site | S | S | P | P | P | S | M | M | S | S |
| Robotics forum | S | S | S | S | M | S | M | M | S | S |
| Q&A site | S | - | S | S | M | S | M | M | S | S |
| Social community | S | S | S | S | M | S | M | M | S | - |
| Video platform | S | S | S | S | M | S | M | M | S | S |
| Review publication | S | S | - | - | M | M | M | M | - | S |
| Teardown database or lab | M | M | - | M | M | - | M | M | M | S |
| Academic index or publisher | S | S | P | P | M | - | M | M | P | P |
| Open dataset repository | S | S | P | P | M | S | M | M | P | P |
| Standards or certification database | P | P | - | - | - | - | P | S | P | P |
| Regulatory filing database | P | P | - | P | M | - | P | M | P | S |
| Archive or web snapshot | S | S | S | S | S | S | S | S | S | S |

## Source family to acquisition method

Preference order is structured interface, versioned file or repository, static HTTP, and only then browser automation.

| Source family | API | Feed | Sitemap | Static HTTP | Rendered browser | Repository sync | File download | Manual review |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Manufacturer catalog | sometimes | rare | common | common | sometimes | rare | common | fallback |
| Documentation portal | sometimes | rare | common | common | sometimes | sometimes | common | fallback |
| Distributor | common | sometimes | common | common | sometimes | rare | common | fallback |
| Marketplace | sometimes | rare | common | variable | common | rare | rare | often constrained |
| Open-source project | common | common | - | common | rarely needed | primary | primary | fallback |
| CAD repository | sometimes | sometimes | sometimes | common | sometimes | common | primary | fallback |
| Forum or Q&A | sometimes | common | common | common | sometimes | - | attachments | often required for claims |
| Social community | sometimes | sometimes | - | variable | common | - | attachments | frequently constrained |
| Video platform | common | feeds | - | metadata | common | - | captions/files | required for interpretation |
| Academic publisher | common | feeds | common | common | sometimes | - | papers/data | required for paywalled scope |
| Dataset repository | common | feeds | - | common | rare | sometimes | primary | fallback |
| Standards/certification/regulatory | sometimes | sometimes | common | common | sometimes | - | primary | fallback |
| Archive | API sometimes | - | - | common | sometimes | - | snapshots | fallback |

## Collection concept to likely evidence sources

| Concept | Best primary evidence | Useful corroboration | Common traps |
|---|---|---|---|
| Manufacturer and brand identity | official site, filings, repository organization | distributors, standards records | copied storefronts and old brand names |
| Product family, model, SKU, revision | official catalog and datasheet | distributor manufacturer-part numbers | merging revisions or regional variants |
| Dimensions, mass, ratings, interfaces | revision-specific datasheet or CAD | distributor tables, teardown measurements | unit conversion and nominal versus maximum values |
| Price and availability | timestamped supplier offer or official API | marketplace listing | tax, currency, quantity breaks, preorder and stale stock |
| Compatibility | official matrix, mechanical/electrical/software interfaces | successful build evidence | treating inferred fit as verified |
| BOM contents | versioned project BOM or release | build logs and purchase records | branch drift and alternates treated as required |
| Build steps | versioned official instructions | reproducible build log or video | missing revision, tool, calibration, and safety context |
| Measured performance | test setup and raw result | multiple independent reproductions | claimed specifications presented as measurement |
| Failures and limitations | reproducible incident or issue with version | forums, reviews, build logs | anecdote, brigading, and missing operating conditions |
| Software support | release, package registry, repository, compatibility docs | community installation reports | branch versus release and unsupported forks |
| License and reuse rights | license file, terms, publisher statement | repository metadata | assuming public access means reusable |
| Project activity | commits, releases, issue and maintainer activity | package releases and community discussion | raw stars or views as quality proof |
| Commercial robot configuration | official specifications, manuals, filings | teardown and benchmark sources | prototype and production versions mixed |
| Safety and certification | standards/certification or official declaration | regulator records, manuals | marketing badges without exact scope |

## Object class to required provenance dimensions

| Object class | Revision | Observation time | Market/locale | Unit/currency | Evidence class | Extractor version | Raw evidence |
|---|---:|---:|---:|---:|---:|---:|---:|
| Stable entity identity | recommended | required | sometimes | no | required | required | required |
| Product specification | required | required | sometimes | required | required | required | required |
| Offer/availability | required | required | required | required | required | required | required |
| Compatibility claim | required | required | sometimes | sometimes | required | required | required |
| Measurement | required | required | sometimes | required | required | required | required |
| BOM line | required | required | sometimes | required for quantity/cost | required | required | required |
| File or artifact | required | required | sometimes | size/hash | required | required | required |
| Community report | required when known | required | sometimes | context-dependent | required | required | required |
| Derived metric | required | as-of time | context-dependent | required | calculated or estimated | required | linked inputs |

## Epistemic class matrix

| Evidence class | Meaning | Can conflict? | Promotion expectation | Display expectation |
|---|---|---:|---|---|
| Official | published by responsible manufacturer, project, supplier, regulator, or standards body | yes | direct only for exact scope and revision | identify publisher and date |
| User-reported | attributable experience or assertion from a user or community | yes | review and corroboration for consequential fields | label as report, preserve context |
| Measured | result tied to a test method, setup, conditions, and observation | yes | verify method and units | show conditions and uncertainty |
| Calculated | deterministic transformation of linked inputs | yes, if inputs or formula differ | formula and input lineage required | expose formula and as-of inputs |
| Estimated | bounded approximation using stated method or assumptions | yes | review and uncertainty required | visibly label estimate and range |
| AI-inferred | model-extracted or inferred value not directly asserted | yes | requires source-grounding and validation | never present as source-stated fact |

## Acquisition method to tool capability

| Method | Core capabilities | Validation needs | Avoid when |
|---|---|---|---|
| Documented API | HTTP client, auth binding, pagination, quota and schema handling | contract fixtures, quota and retry tests | API terms or fields do not fit intended use |
| Feed or sitemap | XML parser, incremental cursor, canonical URL handling | duplicate, freshness, and missing-entry tests | feed omits required provenance or full data |
| Static HTTP | respectful fetcher, cache validators, HTML parser | template fixtures and drift signatures | rendering is essential or paths are disallowed |
| Rendered browser | browser isolation, deterministic waits, network and DOM capture | route, selector, screenshot, and challenge tests | API, feed, file, or static page is sufficient |
| Repository sync | provider API or git, commit pinning, archive and license handling | history, tag, submodule, LFS, and rewrite tests | repository access or license is incompatible |
| File download | streaming, type detection, checksum, size and archive limits | malicious, malformed, oversized, and version fixtures | file reuse is disallowed or parser is unsafe |
| Manual review | review UI, citation capture, structured entry, second check | inter-reviewer consistency and audit trail | recurring high-volume automation is required |

## Skill or role to workflow stage

| Stage | Primary role | Supporting capability |
|---|---|---|
| Scope and product decisions | data strategist, product reviewer | brainstorming and planning |
| Source discovery | source researcher | internet and repository research |
| Policy preflight | source researcher, review operator | primary-document research and decision records |
| Technical characterization | collection engineer | HTTP, browser, file, API, and repository inspection |
| Adapter implementation | collection engineer | version-sensitive development and code execution |
| Ontology and mapping | data strategist, domain reviewer | schema analysis and entity resolution |
| QA and drift | QA engineer | fixtures, golden tests, differential checks |
| Pilot operation | operator | scheduling, budgets, observability, kill switches |
| Incident handling | operator, reviewer, engineer | debugging, lineage, withdrawal, replay |
| Promotion or retirement | review operator | verification evidence and audit decisions |

## Immediate gap matrix

| Gap | Why it blocks scale | First closure artifact |
|---|---|---|
| Legacy source labels are not stable source identities | duplicates and aliases cannot be ranked reliably | machine-readable source registry |
| Many labels lack verified URLs and current policy evidence | discovery can be mistaken for permission | source preflight records |
| Object ontology exceeds the current eleven ingestion record types | useful evidence may be dropped or overloaded | schema gap map and extension plan |
| No approved scoring weights | rankings can look precise but encode hidden preference | reviewed scoring decision |
| No adapter-to-source registry | ownership, fixtures, and drift cannot be traced | adapter inventory |
| No fixture manifest | parser coverage and source changes are opaque | fixture registry with hashes |
| No active-source status ledger | pilot, pause, and approval state can drift from code | operational source registry |
| No generated matrix pipeline | Markdown views can diverge as lists grow | canonical structured records plus generated docs |
| Final legacy inventory sentence is truncated | intended universal extraction metadata is incomplete | source correction with provenance |
