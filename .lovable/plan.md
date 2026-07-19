# Robopartpicker — Full Overhaul Plan

## 1. Strategic Repositioning

Reposition from "humanoid robotics hub" to:

> **Compare, source, and resell humanoid robotics components with verified specs, price history, compatibility data, and supplier intelligence.**
>
> Sub: *PCPartPicker for humanoid robots. Newegg for robotics hardware.*

Wedge hierarchy (drives every page decision):

1. Comparison creates trust.
2. Price history creates retention.
3. BOMs create workflow lock-in.
4. Used marketplace creates transactions.
5. Supplier RFQs create B2B revenue.
6. Failure reports + compatibility data create the moat.
7. Community strengthens every object.
8. Investor intelligence is a later layer.

**Initial niche**: actuators + dexterous hands for humanoid arms, legs, upper-body. Everything else (sensors, compute, drivers, reducers, batteries) is present but secondary.

**ICP**: 2–20 person robotics teams spending $5K–$100K/yr on components. Not casual fans, not large industrial buyers, not investors.

## 2. Brand & Visual System

- **Logo**: uploaded yellow robot mascot (`user-uploads://image-3.png`) → `src/assets/logo.png`. Rendered round, 32px in header, 64px on homepage hero, 28px in footer.
- **Palette** (HSL tokens in `index.css`):
  - `--background` near-white `0 0% 99%`, `--foreground` `220 14% 10%`
  - `--primary` signal yellow `48 100% 50%` (matches logo), `--primary-foreground` near-black
  - `--surface` `220 14% 97%`, `--border` `220 13% 90%`
  - `--positive` `142 70% 38%` (good price, in-stock), `--negative` `0 72% 50%` (supply risk, failure), `--warning` `35 92% 50%` (lead time risk)
  - Dark mode mirrors with `220 14% 7%` background, yellow accent preserved.
- **Typography**: body **Inter** (denser than Source Sans), data/spec **IBM Plex Mono**. Tabular numerals (`font-feature-settings: "tnum"`) on all price/spec cells and the `.mono` utility.
- **Density**: 13px base in tables, 14px in body, sticky table headers, zebra rows, no hero illustrations beyond the logo and the existing 3D viewer, no gradients on cards, 1px borders, 6px radii.
- **Tone**: procurement terminal, not consumer marketplace. Numbers first, prose second.

## 3. Information Architecture

```text
Header
  🟡 Robopartpicker   [ global search: parts, suppliers, robots ]   Sign in
  Parts ▾   Robots   BOMs   Marketplace   Suppliers   Teardowns   Community
  └─ Parts dropdown: Actuators · Hands · Sensors · Compute · Motor Drivers · Reducers
```

Routes:

```text
/                         Home
/parts/:category          Catalog (actuators default)
/parts/:category/:slug    Part detail
/finder/actuator          Guided actuator finder
/finder/hand              Guided hand finder
/boms                     BOMs index
/boms/:slug               BOM detail
/builder                  Live BOM builder
/marketplace              Used / refurb listings + wanted
/marketplace/:id          Listing detail
/marketplace/new          Create listing (UI only)
/marketplace/wanted/new   Post wanted request
/suppliers                Supplier directory
/suppliers/:slug          Supplier profile + RFQ
/robots                   Robots index (kept)
/robots/:slug             Robot detail w/ 3D model + teardown evidence
/teardowns                Teardowns index
/teardowns/:slug          Teardown page
/community                Structured community
/community/:type/:id      Post detail
```

## 4. Page Specifications

### 4.1 Home (`Index.tsx`, rewritten)

- Hero: logo, headline "Compare, source, and resell humanoid robotics components.", sub "PCPartPicker for humanoid robots. Newegg for robotics hardware.", primary CTA "Browse actuators", secondary "Build a BOM".
- **Price movers strip**: 6 ticker cells showing parts with biggest 30d % change, color-coded.
- **Trending actuators table** (10 rows): name, torque, voltage, lowest price, 30d Δ, supplier count, "Add to BOM".
- **Trending hands table** (6 rows): DoF, payload, tactile y/n, lowest price, 30d Δ.
- **Latest used listings** (4 cards): grade pill, runtime hours, price vs new, seller trust.
- **Latest wanted requests** (4 cards): part, qty, region, budget.
- **Latest failure reports** (4 rows): part, symptom, runtime at failure, supplier response.
- **Active BOMs** (3 cards): cost, parts count, 90d cost trend.

### 4.2 Parts catalog (`/parts/:category`)

Dense, filterable table — the spine of the product.

- Left rail facets (use case first, specs second):
  - Joint / application (shoulder, elbow, wrist, hip, knee, ankle, neck, gripper) — actuator only
  - Peak torque range
  - Continuous torque range
  - Voltage
  - Weight max
  - Protocol (CAN, EtherCAT, RS485, USB, PWM)
  - ROS support
  - New / Used available
  - Region
  - Lead time max
- Table columns (sortable, sticky header):
  - Part · Maker · Peak Nm · Cont Nm · Speed · V · Weight · Protocol · ROS · Lowest $ · 30d Δ · Lead · Suppliers · `+BOM`
- Compare bar at top: "Compare (3)" button → side-by-side table.
- Result count + active filter chips.

### 4.3 Part detail (`/parts/:category/:slug`)

Sections, top → bottom:

1. Header: name, maker, category, verified badge, "+ Add to BOM", "Create price alert", "Request quote".
2. **Specs panel** — full spec sheet incl. peak/cont torque, speed, voltage, weight, torque density, backlash, encoder, protocol, thermal limits, duty cycle, CAD availability, ROS support, warranty, MTBF if known.
3. **Price history** — reuse `PriceChart`. Chips: current lowest, used median, 30/90/180d range, historical low, "good price / high price" label.
4. **Supplier offers table** — supplier, region, stock, lead time, MOQ, price, RFQ button. Sorted by total landed cost.
5. **Used listings** — grade, runtime hours, seller, price, condition link.
6. **Compatible BOMs** — BOMs using this part with delta if swapped out.
7. **Alternatives** — ranked with sub-score breakdown (Performance / Compatibility / Documentation / Supplier / Price / Availability / Repairability / Community evidence).
8. **Failure reports** — structured rows.
9. **Discussions** — structured posts attached to this part.
10. **Teardown references** — links to robots using this part.

### 4.4 Actuator / Hand finder (`/finder/:type`)

Guided multi-step form (sidebar progress):

- Joint → Peak torque → Continuous torque → Weight cap → Voltage → Protocol → ROS required? → Budget → New/Used → Lead time → Region.
- Output: ranked recommendations with visible sub-scores, "best overall / cheapest acceptable / best used / best high-perf / lowest-risk supplier", warning flags.
- Score formula visible on hover (no black-box magic).

### 4.5 BOM builder (`/builder`, replaces current `Builder.tsx`)

- Left: subsystem template picker (Humanoid arm · Humanoid leg · Dexterous hand · Upper body · Perception stack · Biped leg actuator set).
- Center: BOM table — slot, part, qty, unit $, ext $, lead time, supply risk pill, "swap" button (opens compatible alternatives sorted by cost delta).
- Right rail (sticky summary):
  - Total BOM cost (new) / (used-mix) / (premium config)
  - 90d cost trend mini-chart
  - Total mass
  - Peak power draw
  - Battery runtime estimate
  - Compatibility warnings
  - Supply-risk flags
  - "Cheapest compatible config" / "Premium config" toggle
  - Share / Fork / Export CSV
- Below table: substitutions panel — "Replacing X with Y saves $1,280, lowers cont torque 18%".

### 4.6 BOMs index + detail

- Index: cards with cost, parts count, 90d trend, forks, last updated, author.
- Detail: same as builder in read mode + fork button, version history note, discussions.

### 4.7 Marketplace (`/marketplace`)

- Tabs: **Listings** · **Wanted** · **My listings** (placeholder).
- Listing card: photo placeholder, part, condition grade pill (A / B / C / Untested / For parts), runtime hours, price vs new %, seller trust badges (identity verified, serial verified, test report, video, prior sales, returns accepted), region, shipping note.
- Filters: category, grade, price, region, has-test-report, has-video, returns-accepted.
- "Post wanted" CTA prominent — demand-first liquidity.

### 4.8 Listing detail

- Photo grid + video placeholder.
- **Required test report** rendered as structured fields per category:
  - Actuator: spin, load, backlash, current draw, thermal, encoder, noise video.
  - Hand: open/close cycles, grip test, tactile check, finger inspection, SDK connection proof.
  - Compute: boot proof, stress, port check, thermal.
- Serial number, runtime hours, firmware version, reason for sale, return policy, included accessories.
- Seller card: trust badges, prior sales count, response time, dispute rate.
- Buyer-protection note: escrow available, optional 3rd-party inspection, dispute process.
- Compare-to-new price chip.

### 4.9 Suppliers

- Directory: filter by category, region, verified, MOQ, lead time. Table with categories, region, MOQ, avg lead time, claimed badge, RFQ button.
- Profile: hero w/ verified badge, categories, region, MOQ, lead time, products grid (links to part pages), warranty/repair policy, documentation quality score, supported interfaces, buyer reviews, "Most compared with" list, RFQ form.

### 4.10 Robots (`/robots`, `/robots/:slug`)

Kept and reframed as **teardown + procurement evidence** pages, not marketing pages.

- Index: dense table — robot, maker, status, height/weight, DoF, est BOM cost range, deployment evidence label, last update.
- Detail (3D model preserved at top):
  - **3D viewer** (`Robot3D.tsx`) — unchanged.
  - Hardware architecture diagram (silhouette w/ joint callouts — keep `RobotSilhouette.tsx`).
  - Likely component categories + linked parts where known.
  - Supplier dependency list w/ risk flags.
  - Estimated BOM range (low / mid / premium).
  - Evidence labels per claim: verified-by-manufacturer · customer-reported · public-demo · third-party-test · teardown-confirmed · unverified.
  - Deployment claims tracker.
  - Open questions list.
  - Comparable parts.
  - Linked teardown notes + discussions.

### 4.11 Teardowns (`/teardowns`)

Index of teardown evidence packs per robot. Cards: robot, evidence quality score, # of confirmed components, last update.

### 4.12 Community

No general feed. Every post attaches to a part / supplier / robot / BOM / listing / teardown / benchmark / failure-report / build-log.

Post types (each with required structured fields):

- **Question** — object link required.
- **Review** — rating, usage context, runtime hours.
- **Failure report** — part, usage context, runtime hours, load, voltage, ambient temp, symptom, photos, resolution, supplier response.
- **Test result** — test type, methodology, raw numbers, attachments.
- **Teardown note** — robot, component identified, evidence label.
- **Supplier experience** — supplier, RFQ-to-quote time, accuracy, fulfillment.
- **Compatibility note** — part A, part B, result.
- **Build log** — BOM link, milestones, issues.
- **Wanted listing** — part, qty, budget, region.
- **Alternative recommendation** — original part → alternative + reasoning.

UI: tab-based feed by post type, each rendered with type-specific structured layout (not a wall of prose).

## 5. Data Model (`src/data/`)

New / replaced files:

- `parts.ts` — `Part` discriminated union per category:
  - common: id, slug, category, name, maker, makerCountry, region, image, blurb, tags, openSource, datasheetUrl, cadAvailable, rosSupport, warrantyMonths, pricePoints[], suppliers[] (refs), failures[] (refs), compatibility tags.
  - actuator: peakNm, contNm, speedRpm, voltageV, weightKg, torqueDensity, backlashArcmin, encoderType, protocol, thermalLimitC, dutyCycle.
  - hand: dof, actuatedDof, payloadKg, gripForceN, tactile, weightKg, interface, sdk, fingerReplaceCost.
  - sensor: type (depth/lidar/imu/tactile), range, fov, hz, resolution, weight, interface.
  - compute: tops, ram, storage, ports, powerW, weight.
  - driver: maxCurrentA, voltageV, protocols, weight.
  - Seed ~40 actuators, ~15 hands, ~10 sensors, ~8 compute, ~6 drivers, ~6 reducers.
- `suppliers.ts` — ~20 suppliers: name, slug, region, categories, MOQ, leadDays, verified, claimed, products[], warranty, docScore, interfaces[], reviews[].
- `boms.ts` — ~8 subsystem BOMs: slot list referencing parts + qty, computed totals, forks, author.
- `listings.ts` — ~20 used/refurb listings: partRef, grade, runtimeHours, price, sellerRef, testReport (typed per category), photos[], video?, returnPolicy, serial.
- `wanted.ts` — ~10 wanted requests.
- `failures.ts` — ~15 structured failure reports.
- `teardowns.ts` — per-robot teardown packs with evidence labels.
- `posts.ts` — structured community posts with type discriminator and required-field union.
- Keep `robots.ts` (trim presentational fields, add bomEstimate range + evidence labels). Demote `software.ts` (link from Compute category page). Retire `forums.ts`, current `marketplace.ts`.

All data is static TS — no backend this pass.

## 6. Components

New:

- `parts/PartsTable.tsx` — sortable, sticky header, tabular nums, compare checkboxes.
- `parts/PartHeader.tsx`, `parts/SpecsPanel.tsx`, `parts/PriceHistoryCard.tsx` (wraps `PriceChart` + chips), `parts/SupplierOffers.tsx`, `parts/AlternativesTable.tsx`, `parts/CompareBar.tsx`.
- `bom/BomTable.tsx`, `bom/BomSummary.tsx`, `bom/SwapDrawer.tsx`, `bom/TemplatePicker.tsx`.
- `marketplace/ListingCard.tsx`, `marketplace/ConditionGrade.tsx`, `marketplace/TrustBadges.tsx`, `marketplace/TestReport.tsx`, `marketplace/WantedCard.tsx`.
- `suppliers/SupplierCard.tsx`, `suppliers/RfqForm.tsx`.
- `finder/StepForm.tsx`, `finder/ScoreBreakdown.tsx`.
- `community/StructuredPost.tsx` (renders per type), `community/PostComposer.tsx` (required-field per type).
- `robots/TeardownEvidence.tsx`, `robots/EvidenceLabel.tsx`.
- `common/PriceDeltaPill.tsx`, `common/SupplyRiskPill.tsx`, `common/Sparkline.tsx`, `common/AlertButton.tsx`.

Kept untouched:

- `components/robots/Robot3D.tsx` — 3D viewer stays exactly as is.
- `components/robots/RobotSilhouette.tsx` — used for hardware-architecture callouts.
- `components/robots/PriceChart.tsx` — restyled via tokens only.

Rewritten:

- `components/layout/SiteHeader.tsx` — new logo, Parts dropdown, dense nav, global search.
- `components/layout/SiteFooter.tsx` — slim, links only.
- `pages/Index.tsx`, `pages/Robots.tsx`, `pages/RobotDetail.tsx` (preserve 3D), `pages/Builder.tsx`, `pages/Marketplace.tsx`, `pages/Forums.tsx` → replaced by `pages/Community.tsx`.

## 7. Engagement & Trust Mechanics (UI-only this pass)

- "Create price alert" button on every part + BOM.
- "Watch listing" on marketplace.
- Condition grading: A / B / C / Untested / For parts.
- Trust badges: identity verified, serial verified, test report attached, video attached, prior sales count, returns accepted, escrow eligible.
- Buyer protection callouts: escrow until delivery, dispute process, optional 3rd-party inspection.
- Evidence labels on every teardown claim.
- "Most compared with" on supplier + part pages.

## 8. SEO Page Templates (database-first, not blog-first)

Set up templates so these URLs are populated by the data layer once it exists:

- `/parts/actuators?joint=knee&sort=price` → "Best actuators for humanoid robot knees"
- `/parts/actuators?joint=arm` → "Best actuators for humanoid arms"
- `/parts/hands` → "Robotic hand comparison"
- `/boms?subsystem=arm&budget=low` → "Low-cost humanoid arm BOM"
- `/marketplace?category=actuator&condition=used` → "Used robot actuators for sale"
- `/parts/reducers?compare=harmonic,cycloidal` → "Harmonic vs cycloidal reducer"
- `/parts/sensors?type=depth` → "Best depth cameras for humanoid manipulation"
- `/parts/actuators?ros=true` → "ROS-compatible actuators"
- `/teardowns/unitree-h1`, `/teardowns/figure-02`, `/teardowns/optimus-gen-2`
- `/suppliers` → "Humanoid robot supplier directory"

Each page emits a `<title>` <60 chars w/ keyword, meta description <160, single H1, JSON-LD `Product` / `ItemList` where applicable, canonical, lazy-loaded images. Single `index.html` viewport stays responsive.

## 9. Out of Scope (this pass)

- Auth, accounts, real RFQ delivery, real transactions, escrow, payments wiring, investor dashboard, supplier SaaS dashboard, real-time inventory sync, batteries marketplace (safety/compliance gating), email alerts, mobile app. All buttons render but are inert with a small "preview" tooltip where they would otherwise mislead.

## 10. Technical Notes

- HSL tokens only in `index.css` + `tailwind.config.ts`; no raw hex in components.
- Add `.tnum { font-feature-settings: "tnum"; }` utility; apply on all data tables and the mono class.
- Routes added in `src/App.tsx`; keep React Router setup.
- Keep `react-three-fiber` setup for `Robot3D.tsx`. No new 3D dependencies.
- No new heavy deps. Recharts already present.
- File deletions: `src/data/forums.ts`, `src/data/marketplace.ts` (replaced), `src/pages/Forums.tsx` (replaced by `Community.tsx`). `src/pages/Guides.tsx` retired (folded into Teardowns + Community build-logs). `src/pages/Software.tsx` kept but linked from Compute category instead of top nav.
- Logo asset: `code--copy user-uploads://image-3.png src/assets/logo.png`, imported as ES6 module.

## 11. Build Order (single pass, no checkpoints)

1. Tokens + logo + header/footer.
2. Data layer (parts, suppliers, listings, wanted, failures, boms, teardowns, posts).
3. Parts catalog + part detail + finder.
4. BOM builder + BOMs index/detail.
5. Marketplace + listing detail + wanted form.
6. Suppliers directory + profile.
7. Robots + teardowns (preserve 3D).
8. Community (structured posts).
9. Home rebuild (depends on all above).
10. Route wiring + retired-page cleanup.