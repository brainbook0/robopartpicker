# First-wave source implementation queue

Verified on 2026-08-06. This is the **research and implementation-readiness queue** defined in [`prioritization-and-status.md`](prioritization-and-status.md). Its scores are provisional engineering scores. It ranks adapter research, contracts, fixtures, and disabled implementation work. It does not enable live schedules or replace source-specific policy approval.

## Selection result

The first implementation family should be **versioned GitHub repository sources**, beginning with **ROBOTIS-GIT/emanual** and a bounded DYNAMIXEL X-series pilot.

This order gives RoboPartPicker useful component specifications while also building a reusable GitHub adapter for ROS indexes, official SDKs, firmware, robot descriptions, BOMs, and model repositories. It avoids beginning with fragile browser automation or a distributor API that needs credentials and additional reuse review.

## Evidence-backed queue

Scores use the formula in the prioritization document. Inputs are 0 to 5. `Blocked` means evidence is insufficient even for a useful provisional engineering score.

| Rank | Source | Provisional score | Access | Initial scope | Decision and evidence |
|---:|---|---:|---|---|---|
| 1 | ROBOTIS e-Manual source, `ROBOTIS-GIT/emanual` | 59 | GitHub REST API, versioned repository files | DYNAMIXEL X-series product pages and structured specification data | Official ROBOTIS organization. Repository is active, public, and reported as MIT-licensed. It contains 34 top-level X-series specification records and 38 direct X-series Markdown pages. Thirty-six pages are product identities after excluding one family index and one test page. High component-specification value and strong adapter reuse. One malformed YAML alias is a known fixture and must produce a source-record rejection rather than a silent correction. |
| 2 | ROS distribution index, `ros/rosdistro` | 55 | GitHub REST API, versioned YAML files | Active distribution indexes, repositories, package status, release and source locators | Official ROS index repository, active and BSD-3-Clause licensed. Structured `index-v4.yaml` and distribution files provide a clean second proof of the reusable repository adapter. |
| 3 | DYNAMIXEL SDK, `ROBOTIS-GIT/DynamixelSDK` | 55 | GitHub REST API, releases, repository metadata | SDK releases, supported protocols, languages, files, and integration evidence | Official ROBOTIS repository, active, Apache-2.0 licensed, with a current release visible through the API. Reuses manufacturer identity and GitHub adapter work from rank 1. |
| 4 | ODrive firmware and tools, `odriverobotics/ODrive` | 52 | GitHub REST API, repository and releases | Motor-controller firmware, tools, versions, documentation references | Official organization repository, active and MIT licensed. High controller relevance and good revision data. Field mapping requires more source-specific work than ROS metadata. |
| 5 | RealSense SDK, `realsenseai/librealsense` | 52 | GitHub REST API, releases, repository files | Depth-camera SDK releases, supported devices, wrappers, and documentation references | Active official repository, Apache-2.0 licensed. Strong sensor and software coverage. Organization rename and device-family identity require explicit provenance. |
| 6 | MuJoCo Menagerie, `google-deepmind/mujoco_menagerie` | 44 | GitHub REST API, XML and per-model files | Robot model identities, MJCF files, source references, model licenses | Active structured repository with hundreds of XML, README, and license files. Useful for digital twins, but per-model license variation raises policy and normalization effort. |
| Blocked | DigiKey Product Information API | Blocked | Official OAuth-backed API | Manufacturer, component, offer, price, stock, lifecycle, and datasheet metadata | Very high product value, but developer-account credentials, API-specific terms, allowed storage/display scope, regional context, quota, and cost must be approved before adapter implementation. Do not scrape catalog HTML as a substitute. |
| Blocked | Mouser Search API | Blocked | Official API key | Manufacturer, component, offer, price, stock, and datasheet metadata | High product value and likely reusable distributor adapter. Current public entry did not expose sufficient unauthenticated API documentation to settle the contract. Requires developer-account and reuse preflight. |
| Deferred | Browser-heavy retailers and marketplaces | Deferred | Rendered pages or marketplace APIs | Offers, stock, used equipment, and volatile listings | Policy risk, high drift, seller identity, locale, and maintenance burden make these inappropriate for the first adapter family. |
| Deferred | Community and social evidence | Deferred | APIs, RSS, or approved manual collection | Build outcomes, failures, substitutions, and user reports | Useful only after official-source provenance, claim separation, moderation, and repair operations are proven. |

ROS and DYNAMIXEL tie numerically. ROS ranks first in that tie to prove the reusable GitHub adapter on an independent publisher and structured index before adding another ROBOTIS source. ODrive and RealSense also tie; implement only one after S1 through S3 reveal the larger remaining catalog gap.

## Score vectors

Each cell combines score and confidence: `V` verified from current primary evidence, `D` validated by direct inspection or multiple observations, `P` plausible, and `S` speculative.

| Source | Value | Authority | Gap | Access | Reuse | Freshness | Policy risk | Effort | Maintenance | Cost | Score |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| ROBOTIS e-Manual source | 5/D | 5/V | 5/D | 5/V | 5/D | 2/P | 1/P | 3/D | 2/P | 0/V | 59 |
| ROS distribution index | 4/D | 5/V | 3/P | 5/V | 5/D | 4/V | 1/P | 2/D | 1/P | 0/V | 55 |
| DYNAMIXEL SDK | 4/D | 5/V | 4/D | 5/V | 4/D | 3/V | 1/P | 2/D | 1/P | 0/V | 55 |
| ODrive | 4/D | 5/V | 4/D | 5/V | 4/D | 4/V | 1/P | 3/P | 2/P | 0/V | 52 |
| RealSense SDK | 4/D | 5/V | 4/D | 5/V | 4/D | 4/V | 1/P | 3/P | 2/P | 0/V | 52 |
| MuJoCo Menagerie | 3/D | 5/V | 4/D | 5/V | 4/D | 3/V | 2/D | 3/D | 2/P | 0/V | 44 |

Evidence basis:

- Authority, repository state, default branch, current revision, and detected license use official GitHub repository metadata.
- Access scores use direct GitHub REST operations exercised during this review.
- Product value and coverage gaps are validated against the collection universe and current RoboPartPicker ingestion and catalog schema.
- Reuse values reflect how much of the GitHub acquisition and parsing family applies to later listed sources.
- Freshness uses observed repository update and release activity.
- Policy risk uses detected repository licensing and known unresolved source-specific display or per-model license questions.
- Effort and maintenance remain provisional until the first fixtures and Cloudflare shadow runs measure them.
- Recurring source cost is zero for these public repository candidates, excluding normal bounded Cloudflare infrastructure usage.

## Live automation eligibility

None of the scored sources is approved for a live recurring schedule yet.

| Source | Live status | Required gate before live priority |
|---|---|---|
| ROBOTIS e-Manual | Disabled, implementation candidate | Record policy owner, reviewed metadata/display/storage scope, license interpretation, GitHub App scope, retention, alert route, pilot expiry, and explicit `approved_live` decision. |
| ROS distribution index | Disabled, research candidate | Record source-specific policy and retention review, exact active distributions, field scope, cadence, owner, and pilot approval. |
| DYNAMIXEL SDK | Disabled, research candidate | Record release/file scope, license and retention decision, cadence, owner, and pilot approval. |
| ODrive | Disabled, research candidate | Confirm official identity, exact repository paths and fields, license scope, cadence, and pilot approval. |
| RealSense SDK | Disabled, research candidate | Resolve organization rename provenance, supported-device field scope, license/retention, cadence, and pilot approval. |
| MuJoCo Menagerie | Disabled, policy research | Complete per-model license handling, retention rules, model identity, field scope, and pilot approval. |

Live ranking occurs only after the relevant row reaches `approved_live` under the shared runtime contract.

## Work sequence

### Foundation F0

Build one Cloudflare-native GitHub repository adapter under the shared [`collection runtime contract`](../architecture/collection-runtime-contract.md) with:

- authenticated GitHub App access through a Worker secret
- repository, commit, tree, blob, contents, and release operations
- ETag and commit-SHA change detection
- explicit per-run request and byte budgets
- path allowlists and file-count ceilings
- pointer-only Queue messages
- private raw-evidence R2 manifests
- adapter fixtures and replay
- source-local leases, health state, and incident generation
- no clone, shell execution, or repository code execution

### Source S1: ROBOTIS e-Manual X-series

Implement the packet in [`../adapter-specs/robotis-emanual-x-series.md`](../adapter-specs/robotis-emanual-x-series.md). Keep the live schedule disabled until its final policy and pilot review.

### Source S2: ROS distribution index

Reuse F0. Add YAML extraction for `index-v4.yaml` and active distribution files. Produce project, software, repository, release, and evidence records. Do not fetch every referenced repository during the index run.

### Source S3: DYNAMIXEL SDK

Reuse F0 and the ROBOTIS manufacturer identity. Collect releases, supported protocol and language metadata, repository paths, and documentation references. Link to components only when model support is explicit.

### Source S4: one independent official hardware repository

Choose ODrive or RealSense after comparing the schema gaps left by S1 through S3. This confirms the adapter is not overfit to ROBOTIS or ROS.

### Source S5: first distributor API

Proceed with DigiKey only after credentials, API terms, storage/display permissions, locale, quotas, and cost are approved. If DigiKey remains blocked, evaluate Mouser under the same distributor-adapter contract rather than falling back to HTML scraping.

## Concurrency rule

Only F0 and S1 should be active initially. S2 may begin after F0 repository fixtures pass. No more than three adapters may be in active development. A degraded higher-priority active source takes precedence over starting a lower-ranked source.

## Verified source facts

- `ROBOTIS-GIT/emanual` default branch: `master`.
- e-Manual repository revision observed: `95e2dfa4b64cd282180f9350c467fa06861b1458`, dated 2026-06-01.
- e-Manual X-series data file: `_data/dxl_x_info.yml`.
- e-Manual X-series page pattern: `docs/en/dxl/x/<product>.md`.
- X-series data contains 34 top-level product keys.
- The direct X-series documentation path contains 38 Markdown files. Thirty-six are product pages after excluding `x.md`, a family index, and `xl430-w250_test.md`, a test page.
- The 36 product pages join to all 34 data keys. `XC430-T150BB` shares specification ref `xc430-w150`, and `XC430-T240BB` shares specification ref `xc430-w240`. Page permalink identity remains distinct from specification ref identity.
- Product-level safe parsing of the 34 data blocks was exercised: 33 parse successfully and `2xl430-w250` is the only rejected block at the observed revision. Because two parsed data blocks are intentionally shared by two product pages each, the expected output is 35 accepted component records and one rejected component record.
- `_data/dxl_x_info.yml` contains one observed undefined alias, `*ttl_connection_5v_5v`, in the `2xl430-w250` record. The valid common anchor is named differently. The adapter must preserve and report this defect.
- GitHub REST public unauthenticated access is limited to 60 requests per hour. Authenticated user or GitHub App access normally starts at 5,000 requests per hour, subject to GitHub's current rate-limit rules.
- `ros/rosdistro` is active, BSD-3-Clause licensed, and exposes `index-v4.yaml` plus versioned distribution YAML.
- `ROBOTIS-GIT/DynamixelSDK` is active, Apache-2.0 licensed, and exposed release `4.0.5`, published 2026-05-06, when verified.

## Primary evidence

- ROBOTIS e-Manual repository: <https://github.com/ROBOTIS-GIT/emanual>
- Representative rendered product documentation: <https://emanual.robotis.com/docs/en/dxl/x/xm430-w350/>
- ROS distribution repository: <https://github.com/ros/rosdistro>
- DYNAMIXEL SDK: <https://github.com/ROBOTIS-GIT/DynamixelSDK>
- ODrive repository: <https://github.com/odriverobotics/ODrive>
- RealSense SDK repository: <https://github.com/realsenseai/librealsense>
- MuJoCo Menagerie: <https://github.com/google-deepmind/mujoco_menagerie>
- DigiKey developer portal: <https://developer.digikey.com/>
- GitHub REST rate limits: <https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api>
- GitHub Terms of Service and API Terms: <https://docs.github.com/en/site-policy/github-terms/github-terms-of-service>
