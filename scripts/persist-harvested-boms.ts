/**
 * Persist harvested real BOMs into projects' current RPPS in D1.
 *   - maps analyzer components -> RppsBomItem (validated with the app's zod schema)
 *   - merges with any existing bom entries (dedupe by name+mpn)
 *   - emits one SQL file with an UPDATE per project, then executes it via wrangler.
 */
import { readFileSync, writeFileSync, mkdirSync, globSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { RppsBomItem } from "../src/lib/rpps/schema";

const exec = promisify(execFile);
const HARVEST = "/root/robopartpicker/.ingest/bom-harvest-2026-08-12";
const LISTS = ["/tmp/top300.ndjson", "/tmp/top300-1500.ndjson"];
const SQL = "/tmp/persist-boms.sql";
const ENV = { ...process.env };
const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const targetEnv = envIndex >= 0 ? args[envIndex + 1] : undefined;
const apply = args.includes("--apply");
if (targetEnv !== "production" && targetEnv !== "preview") {
  console.error("Usage: tsx scripts/persist-harvested-boms.ts --env production|preview [--apply]");
  process.exit(2);
}

async function q(sql: string): Promise<any[]> {
  const { stdout } = await exec("node_modules/.bin/wrangler",
    ["d1", "execute", "DB", "--env", targetEnv!, "--remote", "--json", "--command", sql], { env: ENV, maxBuffer: 16 * 1024 * 1024 });
  const parsed = JSON.parse(stdout);
  return parsed.flatMap((st: any) => st.results ?? []);
}

function mapComponents(components: any[]): any[] {
  const out: any[] = [];
  for (const c of components) {
    const item: any = {
      name: String(c.name ?? "").slice(0, 500),
      qty: Math.max(1, Math.min(100000, Math.round(Number(c.quantity ?? 1) || 1))),
    };
    if (c.manufacturer) item.manufacturer = String(c.manufacturer).slice(0, 120);
    if (c.mpn) item.mpn = String(c.mpn).slice(0, 120);
    if (c.fabricated) item.fabricated = true;
    if (c.optional) item.optional = true;
    if (!item.name) continue;
    try { out.push(RppsBomItem.parse(item)); } catch { /* skip invalid */ }
  }
  return out;
}

function sq(s: string): string { return s.replace(/'/g, "''"); }

async function main() {
  const slugToRow = new Map<string, { id: string; repository_url: string }>();
  for (const list of LISTS) {
    for (const line of readFileSync(list, "utf8").split("\n").filter(Boolean)) {
      const r = JSON.parse(line);
      slugToRow.set(r.slug, { id: r.id, repository_url: r.repository_url });
    }
  }
  const manifests = globSync(join(HARVEST, "manifest-*.json"));
  const projects: { slug: string; components: any[] }[] = [];
  for (const f of manifests) {
    const d = JSON.parse(readFileSync(f, "utf8"));
    if (!d.ok) continue;
    const comps = (d.analysis?.manifest?.components ?? []).filter((c: any) => c && c.name);
    if (comps.length && slugToRow.has(d.slug)) projects.push({ slug: d.slug, components: comps });
  }
  console.log(`projects with harvested components: ${projects.length}`);

  const stmts: string[] = [];
  for (const p of projects) {
    const rows = await q(`SELECT pv.id AS version_id, pv.rpps_json FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id WHERE p.slug = '${p.slug}' AND p.deleted_at IS NULL`);
    if (!rows.length) { console.log(`skip ${p.slug}: no current version`); continue; }
    let rpps: any;
    try { rpps = JSON.parse(rows[0].rpps_json); } catch { console.log(`skip ${p.slug}: unparseable rpps`); continue; }
    if (!rpps || typeof rpps !== "object") { console.log(`skip ${p.slug}: rpps not an object`); continue; }
    const harvested = mapComponents(p.components);
    const existing = Array.isArray(rpps.bom) ? rpps.bom : [];
    const seen = new Set(existing.map((b: any) => `${b.name}|${b.mpn ?? ""}`));
    const merged = [...existing];
    for (const h of harvested) {
      const key = `${h.name}|${h.mpn ?? ""}`;
      if (!seen.has(key)) { merged.push(h); seen.add(key); }
    }
    if (!merged.length) { console.log(`skip ${p.slug}: no bom entries`); continue; }
    const updated = { ...rpps, bom: merged };
    stmts.push(`UPDATE project_versions SET rpps_json = '${sq(JSON.stringify(updated))}' WHERE id = '${rows[0].version_id}';`);
    console.log(`${p.slug}: existing=${existing.length} harvested=${harvested.length} -> total=${merged.length}`);
  }
  if (!stmts.length) { console.log("nothing to write"); return; }
  writeFileSync(SQL, stmts.join("\n"));
  console.log(`wrote ${stmts.length} statements to ${SQL}`);
  if (!apply) { console.log("DRY RUN ONLY. Add --apply to execute against", targetEnv); return; }
  const { stdout, stderr } = await exec("node_modules/.bin/wrangler",
    ["d1", "execute", "DB", "--env", targetEnv!, "--remote", "--file", SQL], { env: ENV, maxBuffer: 64 * 1024 * 1024 });
  console.log(stdout.slice(0, 400));
  if (stderr) console.log("stderr:", stderr.slice(0, 400));
  console.log("done");
}

main().catch((e) => { console.error(e); process.exit(1); });
