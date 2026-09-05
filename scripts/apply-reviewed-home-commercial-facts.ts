#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { captureWranglerJson, runWrangler } from "./wrangler-cli";
import { sqlString, stableId } from "../src/lib/physical-design-wave-import";

type Environment = "production" | "preview";
type WranglerStatement<T> = { results?: T[] };
type ProjectRow = { id: string; slug: string; name: string; robot_category: string | null; current_version_id: string; rpps_json: string };
type Spec = { key: string; label: string; valueText?: string; valueNumber?: number; unit?: string };
type Price = { amountMinor: number; sourceUrl: string; summary: string };
type Facts = { slug: string; name?: string; category?: string; description: string; sourceUrl: string; price?: Price; specs: Spec[] };

const observedAt = "2026-08-26T00:00:00.000Z";
const facts: Facts[] = [
  {
    slug: "boston-dynamics-atlas", sourceUrl: "https://bostondynamics.com/products/atlas/",
    description: "Atlas is Boston Dynamics' industrial humanoid for autonomous material handling. The manufacturer lists a 1.9 m height, 90 kg weight, 56 degrees of freedom, 4-hour battery life, 2.3 m reach, IP67 rating, and payload limits of 50 kg instantaneous and 30 kg sustained. No public manufacturer price or model-specific BOM is listed.",
    specs: [
      { key: "height_m", label: "Height", valueNumber: 1.9, unit: "m" }, { key: "weight_kg", label: "Weight", valueNumber: 90, unit: "kg" },
      { key: "degrees_of_freedom", label: "Degrees of freedom", valueNumber: 56 }, { key: "battery_life_h", label: "Battery life", valueNumber: 4, unit: "h" },
      { key: "reach_m", label: "Reach", valueNumber: 2.3, unit: "m" }, { key: "payload_instant_kg", label: "Instantaneous payload", valueNumber: 50, unit: "kg" },
      { key: "payload_sustained_kg", label: "Sustained payload", valueNumber: 30, unit: "kg" }, { key: "ip_rating", label: "Ingress protection", valueText: "IP67" },
      { key: "operating_temperature_c", label: "Operating temperature", valueText: "-20 to 40", unit: "°C" },
    ],
  },
  {
    slug: "1x-technologies-neo", sourceUrl: "https://www.1x.tech/neo",
    description: "NEO is 1X Technologies' home humanoid for scheduled household chores, voice interaction, remote control, self-charging, and supervised Expert Mode for unfamiliar tasks. The manufacturer page currently presents a $200 reservation deposit, not the robot's purchase price. No model-specific BOM is published.",
    specs: [
      { key: "reservation_deposit_usd", label: "Reservation deposit (not purchase price)", valueNumber: 200, unit: "USD" },
      { key: "task_modes", label: "Task modes", valueText: "Autonomous routines and scheduled Expert Mode" },
      { key: "charging", label: "Charging", valueText: "Self-charging" },
    ],
  },
  {
    slug: "unitree-robotics-h1", sourceUrl: "https://www.unitree.com/h1/",
    description: "Unitree H1 is a full-size humanoid listed by Unitree Robotics at about 1.8 m tall and 47 kg, with a stated 3.3 m/s moving speed, 864 Wh quick-release battery, 360 N·m maximum joint torque, 3D LiDAR, and a depth camera. Unitree's shop displays $90,000 while instructing buyers to contact sales for the real price, so RoboPartPicker does not treat that display as a firm manufacturer price.",
    specs: [
      { key: "height_m", label: "Height", valueNumber: 1.8, unit: "m" }, { key: "weight_kg", label: "Weight", valueNumber: 47, unit: "kg" },
      { key: "moving_speed_m_s", label: "Moving speed", valueNumber: 3.3, unit: "m/s" }, { key: "battery_capacity_wh", label: "Battery capacity", valueNumber: 864, unit: "Wh" },
      { key: "maximum_joint_torque_nm", label: "Maximum joint torque", valueNumber: 360, unit: "N·m" }, { key: "sensing", label: "Sensing", valueText: "3D LiDAR and depth camera" },
      { key: "manufacturer_shop_price_context", label: "Manufacturer shop price context", valueText: "$90,000 display; contact sales for real price; customs excluded" },
    ],
  },
  {
    slug: "unitree-robotics-h2", sourceUrl: "https://www.unitree.com/mobile/H2", price: { amountMinor: 2_990_000, sourceUrl: "https://www.unitree.com/mobile/H2", summary: "Manufacturer-listed H2 price; tax and shipping excluded. H2 EDU remains contact-sales." },
    description: "Unitree H2 is a 1.82 m, approximately 70 kg humanoid with 31 degrees of freedom, 360 N·m maximum leg-joint torque, a 0.972 kWh battery, and about 3 hours of stated battery life. Unitree lists H2 at $29,900 before tax and shipping; H2 EDU is contact-sales.",
    specs: [
      { key: "height_m", label: "Height", valueNumber: 1.82, unit: "m" }, { key: "weight_kg", label: "Weight", valueNumber: 70, unit: "kg" },
      { key: "degrees_of_freedom", label: "Degrees of freedom", valueNumber: 31 }, { key: "maximum_leg_joint_torque_nm", label: "Maximum leg-joint torque", valueNumber: 360, unit: "N·m" },
      { key: "arm_payload_peak_kg", label: "Peak arm payload", valueNumber: 15, unit: "kg" }, { key: "arm_payload_rated_kg", label: "Rated arm payload", valueNumber: 7, unit: "kg" },
      { key: "battery_capacity_kwh", label: "Battery capacity", valueNumber: 0.972, unit: "kWh" }, { key: "battery_life_h", label: "Battery life", valueNumber: 3, unit: "h" },
    ],
  },
  {
    slug: "sanctuary-ai-phoenix", sourceUrl: "https://sanctuary.ai/news/sanctuary-ai-releases-new-generation-of-ai-robots-for-high-quality-data-capture/",
    description: "Sanctuary AI's Phoenix Generation 8 is a wheeled general-purpose humanoid optimized for high-quality training-data capture. The manufacturer describes improved depth and vision cameras, telemetry, sensor, audio, and video systems, plus changes intended to simplify manufacturing and commissioning. No public manufacturer price or model-specific BOM is listed.",
    specs: [{ key: "generation", label: "Generation", valueNumber: 8 }, { key: "mobility", label: "Mobility", valueText: "Wheeled base" }, { key: "primary_use", label: "Primary published use", valueText: "High-quality AI training-data capture" }],
  },
  {
    slug: "dobot-x-trainer-html", name: "DOBOT X-Trainer", category: "manipulator", sourceUrl: "https://www.dobot-robots.com/products/humanoid-robots/x-trainer.html",
    description: "DOBOT X-Trainer is a dual-arm AI data collection, imitation-learning, and teleoperation system, not a humanoid robot. DOBOT lists ±0.05 mm repeat positioning accuracy, 625 mm reach per arm, up to 1,200 mm in dual-arm mode, 2 kg single-arm and 3 kg dual-arm payload, and a 25 Hz motion interface. Pricing is contact-sales.",
    specs: [
      { key: "repeatability_mm", label: "Repeat positioning accuracy", valueNumber: 0.05, unit: "mm" }, { key: "reach_per_arm_mm", label: "Reach per arm", valueNumber: 625, unit: "mm" },
      { key: "dual_arm_reach_mm", label: "Dual-arm reach", valueNumber: 1200, unit: "mm" }, { key: "single_arm_payload_kg", label: "Single-arm payload", valueNumber: 2, unit: "kg" },
      { key: "dual_arm_payload_kg", label: "Dual-arm payload", valueNumber: 3, unit: "kg" }, { key: "motion_interface_hz", label: "Motion interface", valueNumber: 25, unit: "Hz" },
    ],
  },
  {
    slug: "apptronik-apollo-2", sourceUrl: "https://apptronik.com/apollo/apollo-2",
    description: "Apptronik Apollo 2 is a modular humanoid platform offered with bipedal or wheeled mobility. The manufacturer describes dexterous manipulation, swappable batteries, opportunity charging, speech and listening, a chest status display, and integration with Apptronik's Artemis intelligence and Fleet Connect operations layers. No public manufacturer price or model-specific BOM is listed.",
    specs: [{ key: "mobility_options", label: "Mobility options", valueText: "Bipedal or wheeled" }, { key: "battery", label: "Battery", valueText: "Swappable with opportunity-charging support" }, { key: "operations_layer", label: "Operations layer", valueText: "Fleet Connect" }],
  },
  {
    slug: "unitree-g1", sourceUrl: "https://www.unitree.com/g1", price: { amountMinor: 1_350_000, sourceUrl: "https://www.unitree.com/g1", summary: "Manufacturer starting price; tax and shipping excluded. G1 EDU remains contact-sales." },
    description: "Unitree G1 is a compact humanoid platform listed from $13,500 before tax and shipping, while G1 EDU is contact-sales. Unitree lists a 1.32 m standing height, about 35 kg weight, 23 joints for G1 and up to 43 for G1 EDU, approximately 2 hours of battery life, a depth camera, 3D LiDAR, and optional dexterous hands on EDU configurations.",
    specs: [
      { key: "height_m", label: "Height", valueNumber: 1.32, unit: "m" }, { key: "weight_kg", label: "Weight", valueNumber: 35, unit: "kg" },
      { key: "joint_count_g1", label: "G1 joint count", valueNumber: 23 }, { key: "joint_count_g1_edu_max", label: "G1 EDU maximum joint count", valueNumber: 43 },
      { key: "battery_life_h", label: "Battery life", valueNumber: 2, unit: "h" }, { key: "sensing", label: "Sensing", valueText: "Depth camera and 3D LiDAR" },
    ],
  },
];

const nameOverrides: Record<string, string> = {
  "dobot-atom-html": "DOBOT Atom", "dobot-cr-30h-collaborative-robots-html": "DOBOT CR30H", "dobot-cr20a-html": "DOBOT CR20A",
  "dobot-cr3as-html": "DOBOT CR3AS", "dobot-magician-e6-html": "DOBOT Magician E6", "dobot-mg400-html": "DOBOT MG400",
  "dobot-nova2-html": "DOBOT Nova 2", "dobot-nova5-html": "DOBOT Nova 5", "dobot-vx500-html": "DOBOT VX500",
};

const args = process.argv.slice(2); const env = valueAfter("--env") as Environment | undefined; const apply = args.includes("--apply");
if (env !== "production" && env !== "preview") throw new Error("Use --env production or --env preview.");
const slugs = [...facts.map((item) => item.slug), ...Object.keys(nameOverrides)];
const rows = query<ProjectRow>(`SELECT p.id,p.slug,p.name,p.robot_category,p.current_version_id,pv.rpps_json FROM projects p JOIN project_versions pv ON pv.id=p.current_version_id WHERE p.slug IN (${slugs.map(sqlString).join(",")}) AND p.project_kind='commercial_showcase' AND p.deleted_at IS NULL ORDER BY p.slug`);
if (rows.length !== slugs.length) throw new Error(`Expected ${slugs.length} projects, found ${rows.length}.`);
const bySlug = new Map(rows.map((row) => [row.slug, row]));
const statements: string[] = [];
for (const item of facts) statements.push(...factStatements(bySlug.get(item.slug)!, item));
for (const [slug, name] of Object.entries(nameOverrides)) statements.push(...nameStatements(bySlug.get(slug)!, name));
const root = resolve(".ingest", "home-commercial-facts", env); mkdirSync(root, { recursive: true }); const sqlPath = resolve(root, "wave-001.sql"); writeFileSync(sqlPath, renderSql(statements));
console.log(JSON.stringify({ environment: env, reviewedFacts: facts.length, nameOverrides: Object.keys(nameOverrides).length, statements: statements.length, sqlPath, mode: apply ? "apply" : "dry-run" }));
if (apply) {
  runWrangler(["d1", "execute", "DB", "--env", env, "--remote", "--file", sqlPath]);
  const audit = query<{ slug: string; name: string; robot_category: string; price_method: string | null; current_specs: number }>(`SELECT p.slug,p.name,p.robot_category,json_extract(pv.rpps_json,'$.commercial_profile.price.methodVersion') price_method,(SELECT COUNT(*) FROM project_specs ps WHERE ps.project_id=p.id AND ps.is_current=1) current_specs FROM projects p JOIN project_versions pv ON pv.id=p.current_version_id WHERE p.slug IN (${slugs.map(sqlString).join(",")}) ORDER BY p.slug`);
  console.log(JSON.stringify({ applied: true, audit }));
  if (audit.length !== slugs.length || audit.some((row) => row.slug === "dobot-x-trainer-html" && (row.name !== "DOBOT X-Trainer" || row.robot_category !== "manipulator")) || audit.some((row) => ["unitree-g1", "unitree-robotics-h2"].includes(row.slug) && row.price_method !== "official-product-price-v1")) throw new Error("Reviewed commercial fact audit failed.");
}

function factStatements(row: ProjectRow, item: Facts): string[] {
  const rpps = JSON.parse(row.rpps_json) as Record<string, unknown>; const commercial = object(rpps.commercial_profile) ?? {};
  const nextName = item.name ?? row.name; const nextCategory = item.category ?? row.robot_category ?? "other";
  rpps.name = nextName; rpps.robot_category = nextCategory; rpps.summary = item.description.slice(0, 280); rpps.description = item.description;
  rpps.specs = item.specs.map((spec) => ({ key: spec.key, label: spec.label, value: spec.valueText ?? spec.valueNumber, unit: spec.unit, source_url: item.sourceUrl, observed_at: observedAt, confidence: 0.95 }));
  commercial.official_description = item.description;
  if (item.price) commercial.price = { kind: "published_price", currency: "USD", minMinor: item.price.amountMinor, maxMinor: item.price.amountMinor, confidence: 0.95, methodVersion: "official-product-price-v1", valuedAt: observedAt, sourceUrls: [item.price.sourceUrl], summary: item.price.summary };
  rpps.commercial_profile = commercial;
  const evidenceId = stableId("evidence", `reviewed-commercial-facts:${item.slug}:${observedAt}`); const claimId = stableId("claim", `${evidenceId}:${row.id}`);
  const lines = [
    `UPDATE project_versions SET rpps_json=${sqlString(JSON.stringify(rpps))},changelog='Reviewed manufacturer facts, identity, specifications and price status' WHERE id=${sqlString(row.current_version_id)} AND project_id=${sqlString(row.id)}`,
    `UPDATE projects SET name=${sqlString(nextName)},summary=${sqlString(item.description.slice(0,280))},description=${sqlString(item.description)},robot_category=${sqlString(nextCategory)},estimated_cost_minor=${item.price ? item.price.amountMinor : "NULL"},estimated_cost_currency=${item.price ? "'USD'" : "NULL"},current_description_generation_id=NULL,version=version+1,updated_at=${sqlString(observedAt)} WHERE id=${sqlString(row.id)} AND current_version_id=${sqlString(row.current_version_id)} AND project_kind='commercial_showcase'`,
    `UPDATE project_specs SET is_current=0,updated_at=${sqlString(observedAt)} WHERE project_id=${sqlString(row.id)} AND is_current=1`,
    `INSERT INTO evidence (id,source_type,source_url,title,publisher,retrieved_at,confidence,excerpt,is_demo,created_at) VALUES (${sqlString(evidenceId)},'official_product_page',${sqlString(item.sourceUrl)},${sqlString(`Reviewed manufacturer facts for ${nextName}`)},${sqlString(nextName)},${sqlString(observedAt)},0.95,${sqlString(item.description)},0,${sqlString(observedAt)}) ON CONFLICT(id) DO UPDATE SET source_url=excluded.source_url,title=excluded.title,retrieved_at=excluded.retrieved_at,confidence=excluded.confidence,excerpt=excluded.excerpt`,
    `INSERT INTO evidence_claims (id,evidence_id,entity_type,entity_id,claim_key,claim_value,confidence,created_at) VALUES (${sqlString(claimId)},${sqlString(evidenceId)},'project',${sqlString(row.id)},'reviewed_commercial_profile',${sqlString(item.description)},0.95,${sqlString(observedAt)}) ON CONFLICT(id) DO UPDATE SET claim_value=excluded.claim_value,confidence=excluded.confidence`,
  ];
  item.specs.forEach((spec, index) => {
    const id = stableId("spec", `reviewed-commercial-facts:${row.id}:${spec.key}:${observedAt}`);
    lines.push(`INSERT INTO project_specs (id,project_id,spec_key,label,value_text,value_number,unit,confidence,observed_at,evidence_id,is_current,sort_order,created_at,updated_at) VALUES (${sqlString(id)},${sqlString(row.id)},${sqlString(spec.key)},${sqlString(spec.label)},${spec.valueText ? sqlString(spec.valueText) : "NULL"},${spec.valueNumber ?? "NULL"},${spec.unit ? sqlString(spec.unit) : "NULL"},0.95,${sqlString(observedAt)},${sqlString(evidenceId)},1,${index},${sqlString(observedAt)},${sqlString(observedAt)}) ON CONFLICT(id) DO UPDATE SET label=excluded.label,value_text=excluded.value_text,value_number=excluded.value_number,unit=excluded.unit,confidence=excluded.confidence,observed_at=excluded.observed_at,evidence_id=excluded.evidence_id,is_current=1,sort_order=excluded.sort_order,updated_at=excluded.updated_at`);
  });
  if (item.price) {
    const id = stableId("price", `reviewed-commercial-facts:${row.id}:official-product-price-v1:${observedAt}`);
    lines.push(`UPDATE project_price_estimates SET status='superseded',updated_at=${sqlString(observedAt)} WHERE project_id=${sqlString(row.id)} AND status='active' AND id<>${sqlString(id)}`);
    lines.push(`INSERT INTO project_price_estimates (id,project_id,estimate_type,currency,min_minor,max_minor,representative_minor,confidence,method_version,summary,valued_at,expires_at,status,created_at,updated_at) VALUES (${sqlString(id)},${sqlString(row.id)},'published_price','USD',${item.price.amountMinor},${item.price.amountMinor},${item.price.amountMinor},'high','official-product-price-v1',${sqlString(item.price.summary)},${sqlString(observedAt)},NULL,'active',${sqlString(observedAt)},${sqlString(observedAt)}) ON CONFLICT(id) DO UPDATE SET min_minor=excluded.min_minor,max_minor=excluded.max_minor,representative_minor=excluded.representative_minor,confidence='high',summary=excluded.summary,status='active',updated_at=excluded.updated_at`);
  }
  lines.push(`DELETE FROM search_index WHERE entity_type='project' AND entity_id=${sqlString(row.id)}`);
  lines.push(`INSERT INTO search_index (entity_type,entity_id,title,body,tags) VALUES ('project',${sqlString(row.id)},${sqlString(nextName)},${sqlString(item.description)},${sqlString(`commercial-showcase closed-source ${nextCategory}`)})`);
  return lines;
}
function nameStatements(row: ProjectRow, name: string): string[] {
  const rpps=JSON.parse(row.rpps_json) as Record<string,unknown>;rpps.name=name;
  return [`UPDATE project_versions SET rpps_json=${sqlString(JSON.stringify(rpps))} WHERE id=${sqlString(row.current_version_id)} AND project_id=${sqlString(row.id)}`,`UPDATE projects SET name=${sqlString(name)},current_description_generation_id=NULL,version=version+1,updated_at=${sqlString(observedAt)} WHERE id=${sqlString(row.id)} AND current_version_id=${sqlString(row.current_version_id)} AND project_kind='commercial_showcase'`,`UPDATE search_index SET title=${sqlString(name)} WHERE entity_type='project' AND entity_id=${sqlString(row.id)}`];
}
function query<T>(sql:string):T[]{return captureWranglerJson<Array<WranglerStatement<T>>>(["d1","execute","DB","--env",env!,"--remote","--command",sql]).flatMap((statement)=>statement.results??[]);}
function renderSql(statements:string[]):string{return `${statements.map((statement)=>`${statement.trim().replace(/;$/u,"")};`).join("\n")}\n`;}
function valueAfter(name:string):string|undefined{const index=args.indexOf(name);return index>=0?args[index+1]:undefined;}
function object(value:unknown):Record<string,unknown>|null{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;}
