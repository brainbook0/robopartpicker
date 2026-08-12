#!/usr/bin/env node
/**
 * Structural checker for gcl-plan.md — a local stand-in for `gcl check` (CLI not
 * installed in this environment). Verifies the gcl-plan skill's mechanical contract:
 *   1. YAML frontmatter parses with the expected top-level keys.
 *   2. Every unit carries all 19 contract fields.
 *   3. Every dependency / manager_id / acceptance_ids reference resolves.
 *   4. Every requirement and acceptance criterion is referenced by at least one unit.
 *   5. No two units that can run in parallel (no dependency path between them) write
 *      the same path (nested/case-insensitive overlap rejected).
 * Exits 0 on success, 1 listing violations.
 */
import { readFileSync } from "node:fs";
import YAML from "yaml";

const FILE = process.argv[2] ?? "gcl-plan.md";
const REQUIRED_UNIT_FIELDS = [
  "unit_id", "title", "objective", "kind", "dependencies", "acceptance_ids",
  "read_scope", "write_scope", "forbidden_scope", "procedure", "commands",
  "expected_artifacts", "output_contract", "progress_contract", "manager_id",
  "risk", "route", "attempt_limit", "stop_conditions",
];

const text = readFileSync(FILE, "utf8");
const match = text.match(/^---\n([\s\S]*?)\n---/);
if (!match) { console.error("FAIL: no YAML frontmatter"); process.exit(1); }
const doc = YAML.parse(match[1]);
const errors = [];
const ok = (cond, msg) => { if (!cond) errors.push(msg); };

// 1. top-level keys
for (const k of ["bounds", "requirements", "acceptance", "managers", "units"]) {
  ok(doc[k] !== undefined, `missing top-level key: ${k}`);
}
const reqIds = new Set((doc.requirements ?? []).map((r) => r.id));
const accIds = new Set((doc.acceptance ?? []).map((a) => a.id));
const mgrIds = new Set((doc.managers ?? []).map((m) => m.id));
const units = doc.units ?? [];
const unitIds = new Set(units.map((u) => u.unit_id));

// dependency graph for parallelism check
const depsOf = (id) => (units.find((u) => u.unit_id === id)?.dependencies ?? []);
const transitive = (id) => {
  const seen = new Set();
  const visit = (x) => { for (const d of depsOf(x)) { if (!seen.has(d)) { seen.add(d); visit(d); } } };
  visit(id); return seen;
};
const parallel = (a, b) => a !== b && !transitive(a).has(b) && !transitive(b).has(a);

// normalize path for overlap checks (lowercase, trailing slash)
const norm = (p) => p.replace(/\/+$/, "").toLowerCase();

for (const u of units) {
  ok(u.unit_id && unitIds.has(u.unit_id), `unit without valid unit_id: ${JSON.stringify(u.unit_id)}`);
  for (const f of REQUIRED_UNIT_FIELDS) ok(u[f] !== undefined, `${u.unit_id}: missing field ${f}`);
  for (const d of u.dependencies ?? []) ok(unitIds.has(d), `${u.unit_id}: unknown dependency ${d}`);
  ok(mgrIds.has(u.manager_id), `${u.unit_id}: unknown manager_id ${u.manager_id}`);
  for (const a of u.acceptance_ids ?? []) ok(accIds.has(a), `${u.unit_id}: unknown acceptance_id ${a}`);
  ok(Array.isArray(u.progress_contract) === false && u.progress_contract && typeof u.progress_contract === "object", `${u.unit_id}: progress_contract must be an object`);
  ok(u.commands && Array.isArray(u.commands.red) && Array.isArray(u.commands.green), `${u.unit_id}: commands must have red/green arrays`);
  ok(Array.isArray(u.expected_artifacts) && u.expected_artifacts.length > 0, `${u.unit_id}: expected_artifacts must be a non-empty array`);
  ok(["low", "medium", "high", "critical"].includes(u.risk), `${u.unit_id}: risk must be low|medium|high|critical`);
  ok(Number.isInteger(u.attempt_limit) && u.attempt_limit > 0, `${u.unit_id}: attempt_limit must be a positive integer`);
}

// 4. requirement and acceptance coverage
const allUnitText = units.map((u) => `${u.unit_id} ${u.title} ${u.objective} ${u.procedure?.join(" ")}`).join("\n").toUpperCase();
for (const r of doc.requirements ?? []) ok(allUnitText.includes(r.id), `requirement ${r.id} not referenced by any unit`);
for (const a of doc.acceptance ?? []) ok(accIds.has(a.id) && units.some((u) => (u.acceptance_ids ?? []).includes(a.id)), `acceptance ${a.id} not referenced by any unit`);

// 5. write-scope overlap among parallel units
for (let i = 0; i < units.length; i++) {
  for (let j = i + 1; j < units.length; j++) {
    const a = units[i], b = units[j];
    if (!parallel(a.unit_id, b.unit_id)) continue;
    const aw = (a.write_scope ?? []).map(norm);
    const bw = (b.write_scope ?? []).map(norm);
    const overlap = aw.some((x) => bw.some((y) => x === y || x.startsWith(y + "/") || y.startsWith(x + "/")));
    if (overlap) errors.push(`write-scope overlap between parallel units ${a.unit_id} and ${b.unit_id}`);
  }
}

if (errors.length) {
  console.error(`gcl-plan check FAILED with ${errors.length} issue(s):`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`gcl-plan check OK: ${units.length} units, ${doc.requirements?.length ?? 0} requirements, ${doc.acceptance?.length ?? 0} acceptance criteria, ${doc.managers?.length ?? 0} managers.`);
