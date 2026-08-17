#!/usr/bin/env node
// Harvest a large catalog of open-source robot hardware repositories from the
// GitHub search API, classify each into a primary robot form factor, and emit
// a reviewable NDJSON candidate list. Does not write to D1.
//
// Phase A (default): run search queries, dedupe, classify, write candidates.
// Phase B (--shas): read candidates, fetch each default-branch HEAD commit SHA.
//
// Usage:
//   node scripts/harvest-open-source-robots.mjs
//   node scripts/harvest-open-source-robots.mjs --shas
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SCRATCH = process.env.JCODE_SCRATCH_DIR ?? "/root/.jcode/scratch";
mkdirSync(SCRATCH, { recursive: true });
const RAW_PATH = join(SCRATCH, "robot-harvest-raw.jsonl");
const CANDIDATES_PATH = join(SCRATCH, "robot-harvest-candidates.jsonl");
const FINAL_PATH = join(SCRATCH, "open-source-robots.ndjson");

const SEARCH_QUERIES = [
  "topic:humanoid-robot",
  "topic:humanoid",
  "humanoid robot open source",
  "topic:robot-arm",
  "robot arm 3d printed",
  "robotic arm open source",
  "6 dof robot arm",
  "topic:quadruped-robot",
  "quadruped robot open source",
  "robot dog open source",
  "topic:hexapod",
  "hexapod robot",
  "topic:gripper",
  "topic:robotic-hand",
  "robotic hand open source",
  "robot gripper 3d print",
  "topic:rover",
  "open source rover",
  "turtlebot hardware",
  "topic:open-source-drone",
  "open source drone frame",
  "quadcopter 3d printed",
  "biped robot open source",
  "self balancing robot",
  "topic:exoskeleton",
  "open source exoskeleton",
  "topic:rov",
  "open source rov",
  "underwater robot open source",
  "quasi direct drive actuator",
  "open source servo",
  "topic:open-source-hardware robot",
  "open source robot 3d printed",
  "topic:ros robot hardware",
  "open source robot arm stl",
  "topic:spotmicroai",
  // Humanoid robots and parts
  "topic:inmoov",
  "topic:robotis-op",
  "humanoid robot arm",
  "humanoid torso open source",
  "dexterous hand open source",
  "robot hand actuator",
  "topic:dynamixel",
  "topic:robot-actuator",
  "robot servo controller open source",
  "topic:torque-motor",
  // More arms and manipulators
  "topic:scara-robot",
  "topic:delta-robot",
  "open source scara",
  "open source delta robot",
  "cobot open source hardware",
  // More mobile and legged
  "topic:mobile-robot",
  "topic:ros2-robot",
  "open source amr",
  "open source agv",
  "topic:unitree",
  "robot dog quadruped",
  // Sensors, compute, electronics for robots
  "open source lidar robot",
  "robot sensor fusion hardware",
  "topic:robotics-sensor",
  "robotics motor driver open source",
  "open source robot controller board",
  // Generic OSHW robotics
  "topic:open-hardware robot",
  "topic:robotics-hardware",
  "open source robotics hardware",
  "open source robot platform",
];

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function ghSearch(query, limit = 100) {
  const args = ["search", "repos", query, "--limit", String(limit), "--json",
    "fullName,url,description,stargazersCount,license,defaultBranch,pushedAt,isFork,isArchived,language"];
  const out = gh(args);
  return JSON.parse(out).map((repo) => ({
    full_name: repo.fullName,
    html_url: repo.url,
    description: repo.description ?? null,
    stargazers_count: repo.stargazersCount ?? 0,
    license: repo.license?.key && !["none", "other", "no-license"].includes(repo.license.key) ? repo.license.key : null,
    topics: [],
    default_branch: repo.defaultBranch ?? "main",
    pushed_at: repo.pushedAt ?? null,
    fork: repo.isFork ?? false,
    archived: repo.isArchived ?? false,
    language: repo.language ?? null,
  }));
}

function stableId(prefix, seed) {
  let hashA = 0x811c9dc5;
  let hashB = 0x01000193;
  for (let i = 0; i < seed.length; i += 1) {
    const code = seed.charCodeAt(i);
    hashA ^= code;
    hashA = Math.imul(hashA, 0x01000193) >>> 0;
    hashB ^= code + i;
    hashB = Math.imul(hashB, 0x85ebca6b) >>> 0;
  }
  const hex = `${hashA.toString(16).padStart(8, "0")}${hashB.toString(16).padStart(8, "0")}`;
  return `${prefix}_${hex}${hex}`.slice(0, prefix.length + 1 + 32);
}

function slugify(fullName) {
  const slug = fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return slug || "robot";
}

// ---- classification (mirrors src/shared/robotCategory.ts) ----
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

function classify(text) {
  for (const [category, pattern] of RULES) if (pattern.test(text)) return category;
  return "other";
}

const HARDWARE_EVIDENCE = /\b(?:humanoid|quadruped|hexapod|biped|underwater|\brov\b|auv|uuv|manipulator|gripper|exoskeleton|rover|drone|uav|actuator|servo|robot(?:ic)? (?:arm|hand|dog|head)|walking robot|legged robot|3d[- ]print|printable|stl|\.stl|\.step|step file|cad|fusion ?360|solidworks|freecad|onshape|bill of materials|\bbom\b|open[- ]source hardware|oshw|hardware|mechanical|chassis|frame|gearbox|arduino|esp32|raspberry pi|stm32|dynamixel|pcb|kicad|gerber|machined|fabricat|assembl|printed parts|diy|turtlebot|rosbot|open[- ]source (?:humanoid|quadruped|hexapod|robot|robotic arm|drone|rover))\b/i;
const SOFTWARE_WEAK = [
  /\bsdk\b/i, /\bapi\b/i, /\blibrary\b/i, /\bframework\b/i, /\bmiddleware\b/i, /\bsimulator\b/i, /\bsimulation\b/i,
  /\bdataset\b/i, /\bbenchmark\b/i, /\bpaper\b/i, /\bcode for\b/i, /\bimplementation\b/i, /\bwrappers?\b/i,
  /ros[-_ ]?(?:package|driver|msg|srv|interface|wrapper|plugin|node)/i,
  /\bgazebo\b/i, /\bpybullet\b/i, /\bmujoco\b/i, /\bisaac\b/i, /\bgym\b/i, /\bpytorch\b/i, /\btorch\b/i, /\btensorflow\b/i,
  /kinematic/i, /\bmatlab\b/i, /\bunity\b/i, /\bunreal\b/i, /\bev3\b/i, /\bmindstorms\b/i, /\bwebodm\b/i, /\bexpresslrs\b/i,
  /\bfirmware\b/i, /\bradio\b/i, /\btransmitter\b/i, /\breceiver\b/i, /\bprotocol\b/i,
  /\bcontroller stack\b/i, /\bnavigation\b/i, /\bslam\b/i, /\bperception\b/i, /\bplanner\b/i, /\bplanning\b/i, /\bvision\b/i,
  /\bground ?station\b/i, /\bflight ?controller\b/i, /\bautopilot\b/i, /\bcalibration\b/i, /\bmotion generation\b/i,
  /\bawesome\b/i, /\bcurated\b/i, /\blist of\b/i, /\bICRA\b/i, /\bIROS\b/i, /\barXiv\b/i, /\bconference\b/i,
  /\bfoundation model\b/i, /\breinforcement\b/i, /\bq[- ]?learning\b/i, /\bexperiments\b/i,
  /\bwalking pattern\b/i, /\bpattern generator\b/i, /\bwalking controller\b/i, /\bprogramming\b/i,
  /\bdocumentation\b/i, /\bofficial (?:code|repository|implementation)\b/i, /\btutorials?\b/i, /\bworkshop\b/i,
  /\bpython\b/i, /\bcontroller\b/i, /\bsoftware for\b/i, /\blocalization\b/i, /\boptimization\b/i,
  /\bcontrol for\b/i, /\bplatform for\b/i, /\boperation\b/i,
];

function isPhysicalCandidate(repo, category, text) {
  if (repo.archived) return false;
  if (repo.fork) return false;
  if ((repo.stargazers_count ?? 0) < 2) return false;
  if (SOFTWARE_WEAK.some((re) => re.test(text))) return false;
  if (category === "other") return false;
  return HARDWARE_EVIDENCE.test(text);
}

// ---- Phase A: search ----
function runSearches() {
  const seen = new Map();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  return (async () => {
    for (let qIndex = 0; qIndex < SEARCH_QUERIES.length; qIndex += 1) {
      const query = SEARCH_QUERIES[qIndex];
      let repos;
      try {
        repos = ghSearch(query);
      } catch (error) {
        const msg = String(error?.message ?? error);
        if (/rate limit|secondary rate/i.test(msg)) {
          console.log(`rate limited on ${query}; waiting 60s`);
          await sleep(60_000);
          qIndex -= 1;
          continue;
        }
        console.error(`search failed for ${query}: ${msg.split("\n")[0]}`);
        continue;
      }
      for (const repo of repos) {
        if (!repo.full_name) continue;
        if (!seen.has(repo.full_name)) seen.set(repo.full_name, repo);
      }
      process.stdout.write(`JCODE_PROGRESS ${JSON.stringify({ current: qIndex + 1, total: SEARCH_QUERIES.length, unit: "queries", message: `harvested ${seen.size} unique repos` })}\n`);
      await sleep(1200);
    }
    const repos = Array.from(seen.values());
    writeFileSync(RAW_PATH, repos.map((repo) => JSON.stringify(repo)).join("\n"));
    console.log(`RAW ${repos.length} unique repos -> ${RAW_PATH}`);
  })();
}

function classifyCandidates() {
  const repos = readFileSync(RAW_PATH, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const candidates = [];
  const categoryCounts = {};
  for (const repo of repos) {
    const text = `${repo.full_name} ${repo.description ?? ""}`;
    const category = classify(text);
    if (!isPhysicalCandidate(repo, category, text)) continue;
    const candidate = {
      id: stableId("proj", `github:${repo.full_name.toLowerCase()}`),
      slug: slugify(repo.full_name),
      name: repo.full_name,
      repository_url: repo.html_url,
      revision: "",
      default_branch: repo.default_branch ?? "main",
      stars: repo.stargazers_count ?? 0,
      license: repo.license ?? null,
      maintainer: repo.full_name.split("/")[0],
      publishability: "review",
      summary: (repo.description ?? "Open-source robot hardware repository.").slice(0, 500),
      language: repo.language ?? null,
      pushed_at: repo.pushed_at ?? null,
      topics: repo.topics ?? [],
      category,
    };
    candidates.push(candidate);
    categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
  }
  writeFileSync(CANDIDATES_PATH, candidates.map((c) => JSON.stringify(c)).join("\n"));
  console.log("CATEGORY_COUNTS", JSON.stringify(categoryCounts));
  console.log(`CANDIDATES ${candidates.length} -> ${CANDIDATES_PATH}`);
}

// ---- Phase B: fetch HEAD SHAs ----
async function fetchShas() {
  const candidates = readFileSync(CANDIDATES_PATH, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const done = new Map();
  if (existsSync(FINAL_PATH)) {
    for (const line of readFileSync(FINAL_PATH, "utf8").split("\n").filter(Boolean)) {
      const c = JSON.parse(line);
      if (c.revision) done.set(c.slug, c.revision);
    }
  }

  const pending = candidates.filter((c) => !done.has(c.slug));
  console.log(`fetching ${pending.length} HEAD shas (${done.size} already resolved)`);
  let completed = 0;
  let failures = 0;
  const CONCURRENCY = 6;
  let cursor = 0;

  const worker = async () => {
    while (cursor < pending.length) {
      const candidate = pending[cursor];
      cursor += 1;
      const [owner, name] = candidate.repository_url.replace(/^https:\/\/github\.com\//i, "").replace(/\.git$/i, "").split("/");
      try {
        const sha = await new Promise((resolve, reject) => {
          const child = spawn("gh", ["api", `repos/${owner}/${name}/commits/${candidate.default_branch}`, "--jq", ".sha"], { stdio: ["ignore", "pipe", "ignore"] });
          let out = "";
          child.stdout.on("data", (chunk) => { out += chunk; });
          child.on("error", reject);
          child.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(`gh exit ${code}`))));
        });
        candidate.revision = /^[0-9a-f]{40}$/i.test(sha) ? sha : (candidate.pushed_at ?? "");
      } catch {
        failures += 1;
        candidate.revision = candidate.pushed_at ?? "";
      }
      completed += 1;
      if (completed % 50 === 0) {
        process.stdout.write(`JCODE_PROGRESS ${JSON.stringify({ current: completed, total: pending.length, unit: "shas", message: `fetched ${completed} shas` })}\n`);
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  candidates.sort((a, b) => b.stars - a.stars);
  writeFileSync(FINAL_PATH, candidates.map((c) => JSON.stringify(c)).join("\n"));
  console.log(`FINAL ${candidates.length} candidates -> ${FINAL_PATH} (failures: ${failures})`);
}

(async () => {
  if (process.argv.includes("--shas")) { await fetchShas(); return; }
  if (process.argv.includes("--classify-only")) { classifyCandidates(); return; }
  await runSearches();
  classifyCandidates();
})();
