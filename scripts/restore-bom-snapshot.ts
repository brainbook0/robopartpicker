/**
 * Restore a committed BOM snapshot into D1 project_versions.rpps_json.bom.
 * Usage:
 *   tsx scripts/restore-bom-snapshot.ts data/bom-snapshots/2026-08-12-real-boms.json   (dry-run)
 *   tsx scripts/restore-bom-snapshot.ts data/bom-snapshots/2026-08-12-real-boms.json --apply
 * Defaults to dry-run unless --apply is passed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { RppsBomItem } from "../src/lib/rpps/schema";

const exec = promisify(execFile);

interface SnapshotProject { slug: string; project_id: string; version_id: string; stars?: number; rpps_name?: string | null; bom: unknown[] }
interface Snapshot { schema: string; created_at: string; commit?: string; note?: string; projects: SnapshotProject[] }

async function q(sql: string): Promise<any[]> {
  const { stdout } = await exec("node_modules/.bin/wrangler",
    ["d1", "execute", "DB", "--env", "preview", "--remote", "--json", "--command", sql],
    { env: process.env, maxBuffer: 16 * 1024 * 1024 });
  const parsed = JSON.parse(stdout);
  return parsed.flatMap((st: any) => st.results ?? []);
}

function sq(s: string): string { return s.replace(/'/g, "''"); }

async function main() {
  const file = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!file) { console.error("usage: tsx scripts/restore-bom-snapshot.ts <snapshot.json> [--apply]"); process.exit(1); }
  const snap = JSON.parse(readFileSync(file, "utf8")) as Snapshot;
  const stmts: string[] = [];
  let skipped = 0;
  for (const p of snap.projects) {
    if (!Array.isArray(p.bom)) { console.log(`skip ${p.slug}: bom not an array`); skipped++; continue; }
    const validated: any[] = [];
    for (const item of p.bom) {
      try { validated.push(RppsBomItem.parse(item)); } catch { skipped++; /* keep snapshot-valid items only */ }
    }
    const rows = await q(`SELECT pv.id AS version_id, pv.rpps_json FROM project_versions pv WHERE pv.id = '${p.version_id}'`);
    if (!rows.length) { console.log(`skip ${p.slug}: version ${p.version_id} not found`); skipped++; continue; }
    let rpps: any;
    try { rpps = JSON.parse(rows[0].rpps_json); } catch { rpps = {}; }
    rpps.bom = validated;
    stmts.push(`UPDATE project_versions SET rpps_json = '${sq(JSON.stringify(rpps))}' WHERE id = '${p.version_id}';`);
    console.log(`${apply ? "will apply" : "dry-run"} ${p.slug}: bom -> ${validated.length}`);
  }
  if (!stmts.length) { console.log("nothing to restore"); return; }
  if (!apply) { console.log(`\nDRY RUN: ${stmts.length} updates ready, ${skipped} items skipped. Re-run with --apply to write.`); return; }
  writeFileSync("/tmp/restore-bom.sql", stmts.join("\n"));
  await exec("node_modules/.bin/wrangler", ["d1", "execute", "DB", "--env", "preview", "--remote", "--file", "/tmp/restore-bom.sql"], { env: process.env, maxBuffer: 64 * 1024 * 1024 });
  console.log(`\napplied ${stmts.length} updates (${skipped} items skipped)`);
}

main().catch((e) => { console.error(e); process.exit(1); });