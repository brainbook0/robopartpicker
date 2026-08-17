#!/usr/bin/env node
// Backfill `robot_category` for every live project and re-classify obviously
// physical `unknown` projects. Reads name/summary/description/tags already in
// D1, so it needs no external API calls.
//
// Usage: node scripts/backfill-robot-category.mjs [--apply] [--env production]
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const ENV_INDEX = process.argv.indexOf("--env");
const ENV = ENV_INDEX >= 0 ? process.argv[ENV_INDEX + 1] : "production";
const OWNER = "robotics-catalog-import";
const CHUNK = 100;

if (APPLY && ENV !== "production") throw new Error("production writes require --apply --env production");

const sql = (value) => `'${String(value ?? "").replace(/'/g, "''")}'`;

function credentialsEnvironment() {
  const env = { ...process.env };
  for (const line of readFileSync("/root/.cloudflare/credentials", "utf8").split("\n")) {
    const match = line.match(/^export\s+([A-Z_]+)="(.*)"$/);
    if (match) env[match[1]] = match[2];
  }
  env.CLOUDFLARE_API_TOKEN = env.CF_API_TOKEN;
  env.CLOUDFLARE_ACCOUNT_ID = env.CF_ACCOUNT_ID;
  return env;
}

function wranglerJson(args) {
  const out = execFileSync("node_modules/.bin/wrangler", ["d1", "execute", "DB", "--env", ENV, "--remote", "--json", ...args], {
    env: credentialsEnvironment(),
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  return JSON.parse(out);
}

// Inline mirrors of src/shared/robotCategory.ts so the script has no TS build step.
const RULES = [
  ["underwater", /\b(?:rov|auv|uuv|underwater|subsea|submarine|blue ?rov)\b/i],
  ["exoskeleton", /\b(?:exoskeleton|exosuit|wearable robot|wearable robotics)\b/i],
  ["aerial", /\b(?:drone|uav|u ?a ?v|quadcopter|quad[- ]?rotor|multirotor|multi[- ]?rotor|aerial robot|vtol|hexacopter|octocopter|pixhawk|ardupilot|px4|fpv)\b/i],
  ["hexapod", /\b(?:hexapod|six[- ]legged|6[- ]legged|spider[- ]?bot|spider robot)\b/i],
  ["humanoid", /\b(?:humanoid|nao|pepper|inmoov|robotis[- ]?op|poppy|reem|icub|talos|walk[- ]?man|optimus|atlas|digit|figure|apollo|unitree h1|unitree g1|g1 edu|humanplus|plen2)\b/i],
  ["quadruped", /\b(?:quadruped|quadrupedal|four[- ]legged|4[- ]legged|robot ?dog|robodog|spot ?micro|spot ?mini|mini[- ]?cheetah|cheetah|laikago|go1|go2|b1|a1)\b/i],
  ["biped", /\b(?:biped(?:al)?|two[- ]legged|2[- ]legged|walking robot|self[- ]balanc|balance bot|balancing robot|zmp walking|dynamixel biped|b[- ]robot)\b/i],
  ["head", /\b(?:robot(?:ic)? head|robot(?:ic)? face|animatronic head|social robot head|robot head|robot neck|facial robot)\b/i],
  ["manipulator", /\b(?:manipulator|robot(?:ic)? arm|robotic limb|six[- ]?axis|6[- ]?axis|7[- ]?axis|6[- ]?dof arm|7[- ]?dof arm|scara|delta robot|parallel[- ]?link robot|desktop arm|robot arm kit|arm robot|brachiograph|cobot)\b/i],
  ["gripper", /\b(?:gripper|robot(?:ic)? hand|dexterous hand|end[- ]?effector|prosthetic hand|robot(?:ic)? finger|soft hand|underactuated hand|adaptive gripper|soft gripper)\b/i],
  ["actuator", /\b(?:actuator|servo|robot(?:ic)? joint|motor module|dynamixel|quasi[- ]direct drive|qdd motor|linear actuator|series elastic actuator|robotic muscle)\b/i],
  ["mobile", /\b(?:rover|wheeled robot|mobile robot|differential drive|diff drive|omniwheel|omni[- ]wheel|mecanum|tracked robot|rc car|toy car|self[- ]driving car|robot car|wheelbot|segway|turtlebot|rosbot|line[- ]follow|delivery robot|agv|amr)\b/i],
];

// Only form-factor-specific categories are eligible to flip an `unknown`
// project into physical_design. Broad "mobile"/"aerial"/"actuator"/"other"
// labels are too easy for software repos to hit.
const STRONG_FORM = /^(humanoid|manipulator|quadruped|hexapod|gripper|exoskeleton|biped|head|underwater)$/;
const FABRICATION = /(?:3d[- ]print|printable|stl|step file|\.step|\.stl|cad|fusion ?360|solidworks|freecad|onshape|bill of materials|\bbom\b|open[- ]source hardware|oshw|hardware|mechanical|chassis|frame|actuator|servo|diy|build|printed parts|fabricat|dynamixel|motor|gearbox)/i;
const SOFTWARE_WEAK = [
  /\bsdk\b/i, /\bapi\b/i, /\blibrary\b/i, /\bframework\b/i, /\bmiddleware\b/i, /\bsimulator\b/i, /\bsimulation\b/i,
  /\bdataset\b/i, /\bbenchmark\b/i, /\bpaper\b/i, /\bcode for\b/i, /\bimplementation\b/i,
  /ros[-_ ]?(?:package|driver|msg|srv|interface|wrapper|plugin|node)/i,
  /\bgazebo\b/i, /\bpybullet\b/i, /\bmujoco\b/i, /\bisaac\b/i, /\bgym\b/i, /\bpytorch\b/i, /\btorch\b/i, /\btensorflow\b/i,
  /kinematic/i, /\bmatlab\b/i, /\bunity\b/i, /\bunreal\b/i, /\bev3\b/i, /\bmindstorms\b/i, /\bwebodm\b/i, /\bexpresslrs\b/i,
  /\bfirmware\b/i, /\bradio\b/i, /\btransmitter\b/i, /\breceiver\b/i, /\bprotocol\b/i,
  /\bcontroller stack\b/i, /\bnavigation\b/i, /\bslam\b/i, /\bperception\b/i, /\bplanner\b/i, /\bplanning\b/i, /\bvision\b/i,
];

function classify(text) {
  for (const [category, pattern] of RULES) if (pattern.test(text)) return category;
  return "other";
}

function looksPhysical(name, summary, description, tags, category) {
  const text = `${name} ${summary} ${description} ${tags.join(" ")}`;
  if (SOFTWARE_WEAK.some((re) => re.test(text))) return false;
  if (STRONG_FORM.test(category) && FABRICATION.test(text)) return true;
  return /(^|[-_ ])(hardware|mechanical|cad)([-_ ]|$)/i.test(name);
}

const rows = wranglerJson(["--command", "SELECT p.id, p.slug, p.name, p.summary, p.description, p.project_kind, p.robot_category, pv.rpps_json FROM projects p LEFT JOIN project_versions pv ON pv.id = p.current_version_id WHERE p.deleted_at IS NULL;"])
  .flatMap((statement) => statement.results ?? []);

const updates = [];
const flips = [];
const counts = {};
for (const row of rows) {
  let tags = [];
  let description = row.description ?? "";
  try {
    const rpps = row.rpps_json ? JSON.parse(row.rpps_json) : {};
    tags = Array.isArray(rpps.tags) ? rpps.tags : [];
    if (!description && rpps.description) description = rpps.description;
  } catch {
    // ignore malformed rpps_json; use DB columns only
  }
  const category = classify(`${row.name} ${row.summary ?? ""} ${description} ${tags.join(" ")}`);
  counts[category] = (counts[category] ?? 0) + 1;

  let projectKind = row.project_kind;
  if (projectKind === "unknown" && looksPhysical(row.name, row.summary ?? "", description, tags, category)) {
    projectKind = "physical_design";
    flips.push({ slug: row.slug, category });
  }

  if (category !== (row.robot_category ?? null) || projectKind !== row.project_kind) {
    updates.push({ id: row.id, category, projectKind });
  }
}

const kindCounts = {};
for (const row of rows) kindCounts[row.project_kind] = (kindCounts[row.project_kind] ?? 0) + 1;

console.log("CATEGORY_COUNTS", JSON.stringify(counts));
console.log("KIND_COUNTS_BEFORE", JSON.stringify(kindCounts));
console.log("FLIPS_TO_PHYSICAL", flips.length);
for (const flip of flips.slice(0, 120)) console.log("FLIP", flip.slug, "->", flip.category);

const CHUNK_ROWS = 400;
const categoryUpdates = updates.filter((u) => u.category !== undefined);
const kindUpdates = updates.filter((u) => u.projectKind !== undefined);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const sqlPath = `/tmp/backfill-robot-category-${stamp}.sql`;
const statements = [];
for (let start = 0; start < updates.length; start += CHUNK_ROWS) {
  const group = updates.slice(start, start + CHUNK_ROWS);
  const ids = group.map((u) => u.id);
  const whenCategory = group.map((u) => `WHEN ${sql(u.id)} THEN ${sql(u.category)}`).join(" ");
  const whenKind = group.map((u) => `WHEN ${sql(u.id)} THEN ${sql(u.projectKind)}`).join(" ");
  statements.push(`UPDATE projects SET robot_category = CASE id ${whenCategory} ELSE robot_category END, project_kind = CASE id ${whenKind} ELSE project_kind END WHERE id IN (${ids.map(sql).join(",")});`);
}
writeFileSync(sqlPath, `${statements.join("\n")}\n`);
console.log("WROTE", sqlPath, "updates:", updates.length, "category:", categoryUpdates.length, "kind:", kindUpdates.length, "statements:", statements.length);

if (!APPLY) {
  console.log("DRY RUN ONLY. Review the SQL artifact, then rerun with --apply --env production.");
  process.exit(0);
}

const DB_IDS = { production: "10c57e79-e34f-4643-8c4e-4f0c7968a74d", preview: "af9e3aaa-4e74-4083-8317-a642bf0e07a6" };
const REST_API = `https://api.cloudflare.com/client/v4/accounts/${credentialsEnvironment().CF_ACCOUNT_ID}/d1/database/${DB_IDS[ENV]}/query`;
async function d1Rest(sqlText) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const res = await fetch(REST_API, {
        method: "POST",
        headers: { Authorization: `Bearer ${credentialsEnvironment().CF_API_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sql: sqlText }),
      });
      if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 3000)); continue; }
      const json = await res.json();
      if (!json.success) throw new Error(JSON.stringify(json.errors).slice(0, 400));
      return json.result;
    } catch (error) {
      if (attempt === 7) throw error;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

(async () => {
  for (let i = 0; i < statements.length; i += 1) {
    await d1Rest(statements[i]);
    console.log(`applied statement ${i + 1}/${statements.length}`);
  }
  console.log("DONE", JSON.stringify({ updates: updates.length, flips: flips.length }));
})();
