#!/usr/bin/env tsx
/** Create one portable RPPS release for every project that has none yet. */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { convertLegacyRpps, stringifyPortableRpps, validatePortableRpps } from "../src/lib/rpps/portable";
import type { RppsPackage } from "../src/lib/rpps/schema";

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const env = envIndex >= 0 ? args[envIndex + 1] : "production";
const apply = args.includes("--apply");
const OWNER = "robotics-catalog-import";
const DB_IDS: Record<string, string> = {
  production: "10c57e79-e34f-4643-8c4e-4f0c7968a74d",
  preview: "af9e3aaa-4e74-4083-8317-a642bf0e07a6",
};
const DB = DB_IDS[env];
if (!DB) throw new Error("--env must be production or preview");

function loadCreds(): Record<string, string> {
  const envOut: Record<string, string> = { ...process.env };
  for (const line of readFileSync("/root/.cloudflare/credentials", "utf8").split("\n")) {
    const m = line.match(/^export\s+([A-Z_]+)="(.*)"$/);
    if (m) envOut[m[1]] = m[2];
  }
  return envOut;
}

const creds = loadCreds();
const API = `https://api.cloudflare.com/client/v4/accounts/${creds.CF_ACCOUNT_ID}/d1/database/${DB}/query`;

async function d1(sql: string): Promise<any> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { Authorization: `Bearer ${creds.CF_API_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
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

const sqlString = (v: string | null | undefined) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

type Row = { id: string; slug: string; version_id: string; rpps_json: string };

async function main() {
  const rows = (await d1(`SELECT p.id, p.slug, pv.id AS version_id, pv.rpps_json
    FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
    WHERE p.deleted_at IS NULL AND p.project_kind IN ('physical_design','commercial_showcase')
      AND NOT EXISTS (SELECT 1 FROM rpps_releases rr WHERE rr.project_id = p.id)
    ORDER BY p.slug`)).flatMap((r: any) => r.results ?? []) as Row[];

  console.log(`projects without a release: ${rows.length}`);
  const now = new Date().toISOString();
  let created = 0;

  for (const row of rows) {
    let rpps: RppsPackage;
    try {
      rpps = JSON.parse(row.rpps_json);
    } catch {
      continue;
    }
    // Release IDs are stable identifiers: A-Za-z0-9 with :._/- separators only.
    // Human-readable revisions (e.g. commercial showcase labels) are slugged.
    const safeVersion = rpps.version.replace(/[^A-Za-z0-9.:_/-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "0.1.0";
    rpps = { ...rpps, version: safeVersion };
    // Portable manifest fields are strictly typed; drop explicit nulls so
    // optional strings/numbers do not fail zod validation.
    const stripNulls = (value: any): any => {
      if (Array.isArray(value)) return value.map(stripNulls);
      if (value && typeof value === "object") {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(value)) if (v !== null) out[k] = stripNulls(v);
        return out;
      }
      return value;
    };
    rpps = stripNulls(rpps);
    // The full long-form description lives on the project; the release manifest
    // only needs a bounded excerpt. This keeps each INSERT under D1's limit.
    if (rpps.description && rpps.description.length > 1500) rpps.description = `${rpps.description.slice(0, 1500)}…`;
    if (Array.isArray(rpps.bom) && rpps.bom.length > 120) rpps.bom = rpps.bom.slice(0, 120);
    const manifest = convertLegacyRpps(rpps);
    // The legacy extension embeds the entire RPPS package, which can push a
    // single INSERT over D1's SQL length limit. The package already lives in
    // project_versions.rpps_json, so drop the passthrough from the manifest.
    delete (manifest as any).extensions;
    const manifestYaml = stringifyPortableRpps(manifest);
    const report = validatePortableRpps(manifest);
    const manifestSha = sha256(manifestYaml);
    const packageSha = sha256(`${manifestYaml}\n---rpps-lock---\n`);
    const id = randomUUID();
    const stmt = `INSERT INTO rpps_releases
      (id, project_id, stable_release_id, version_label, schema_version, manifest_yaml, lock_yaml,
       manifest_sha256, package_sha256, conformance_report_json, status, created_by_user_id, created_at, published_at)
      VALUES (${sqlString(id)}, ${sqlString(row.id)}, ${sqlString(manifest.release.id)}, ${sqlString(manifest.release.version)},
        ${sqlString(manifest.rpps)}, ${sqlString(manifestYaml)}, NULL, ${sqlString(manifestSha)}, ${sqlString(packageSha)},
        ${sqlString(JSON.stringify(report))}, 'published', '${OWNER}', ${sqlString(now)}, ${sqlString(now)});`;
    if (apply) await d1(stmt);
    created += 1;
    if (created % 50 === 0) process.stdout.write(`JCODE_PROGRESS ${JSON.stringify({ current: created, total: rows.length, unit: "releases", message: `created ${created} releases` })}\n`);
  }

  console.log(`DONE ${created} releases (apply=${apply})`);
}

main().catch((error) => { console.error(error); process.exit(1); });
