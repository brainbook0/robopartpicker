#!/usr/bin/env tsx
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { captureWranglerJson, runWrangler } from "./wrangler-cli";
import { sqlString, stableId } from "../src/lib/physical-design-wave-import";

type EnvName = "production" | "preview";
type SpecDraft = { key: string; label: string; valueText?: string; valueNumber?: number; unit?: string; evidenceQuote: string };
type SystemDraft = { name: string; description: string; evidenceQuote: string };
type Draft = { summary: string; specs: SpecDraft[]; systems: SystemDraft[] };
type Extraction = { slug: string; projectId: string; sourceUrl: string; sourceHash: string; modelId: string; status: "validated" | "rejected"; draft?: Draft; generatedAt: string };
type Project = { id: string; slug: string; current_version_id: string; rpps_json: string };
type WranglerStatement<T> = { results?: T[] };

const args = process.argv.slice(2);
const env = valueAfter("--env") as EnvName | undefined;
const apply = args.includes("--apply");
if (env !== "production" && env !== "preview") throw new Error("Use --env production or --env preview.");
const inputPath = resolve(`.ingest/commercial-product-enrichment/${env}/extractions.jsonl`);
const root = resolve(`.ingest/commercial-product-enrichment/${env}/publication`);
const now = new Date().toISOString();

function main(): void {
  const extractions = [...latestExtractions().values()].filter((row): row is Extraction & { draft: Draft } => row.status === "validated" && Boolean(row.draft)).sort((a, b) => a.slug.localeCompare(b.slug));
  const slugs = extractions.map((row) => row.slug);
  const projects = slugs.length ? query<Project>(`SELECT p.id,p.slug,p.current_version_id,pv.rpps_json FROM projects p JOIN project_versions pv ON pv.id=p.current_version_id WHERE p.project_kind='commercial_showcase' AND p.deleted_at IS NULL AND p.slug IN (${slugs.map(sqlString).join(",")}) ORDER BY p.slug`) : [];
  const bySlug = new Map(projects.map((row) => [row.slug, row]));
  const missing = slugs.filter((slug) => !bySlug.has(slug));
  if (missing.length) throw new Error(`Missing commercial projects: ${missing.join(", ")}`);
  const planned = extractions.filter((extraction) => needsPublication(bySlug.get(extraction.slug)!, extraction));
  rmSync(root, { recursive: true, force: true }); mkdirSync(root, { recursive: true });
  const batches = chunk(planned, 20);
  const waves = batches.map((batch, index) => {
    const path = resolve(root, `wave-${String(index + 1).padStart(3, "0")}.sql`);
    const statements = batch.flatMap((extraction) => statementsFor(bySlug.get(extraction.slug)!, extraction));
    writeFileSync(path, `${statements.map((statement) => `${statement.trim().replace(/;$/u, "")};`).join("\n")}\n`);
    return path;
  });
  const report = { schemaVersion: "commercial-product-enrichment-publication/1", environment: env, generatedAt: now, records: extractions.length, planned: planned.length, unchanged: extractions.length - planned.length, plannedSlugs: planned.map((row) => row.slug), specs: planned.reduce((sum, row) => sum + publishedSpecs(row.draft).length, 0), systems: planned.reduce((sum, row) => sum + row.draft.systems.length, 0), waves };
  const reportPath = resolve(root, "report.json"); writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, reportPath, mode: apply ? "apply" : "dry-run" }));
  if (!apply) return;
  waves.forEach((path, index) => { console.log(`Applying commercial enrichment ${index + 1}/${waves.length}`); runWrangler(["d1", "execute", "DB", "--env", env, "--remote", "--file", path]); });
  const audit = query<{ metric: string; count: number }>(`SELECT 'commercial_with_3_specs' metric,COUNT(*) count FROM (SELECT p.id,COUNT(ps.id) count FROM projects p LEFT JOIN project_specs ps ON ps.project_id=p.id AND ps.is_current=1 WHERE p.project_kind='commercial_showcase' AND p.deleted_at IS NULL GROUP BY p.id HAVING count>=3); SELECT 'commercial_with_systems' metric,COUNT(*) count FROM projects p JOIN project_versions pv ON pv.id=p.current_version_id WHERE p.project_kind='commercial_showcase' AND p.deleted_at IS NULL AND json_array_length(coalesce(json_extract(pv.rpps_json,'$.commercial_profile.systems'),'[]'))>0; SELECT 'commercial_with_hash_copy' metric,COUNT(*) count FROM projects p WHERE p.project_kind='commercial_showcase' AND p.deleted_at IS NULL AND (lower(p.summary) LIKE '%sha-256%' OR lower(p.description) LIKE '%sha-256%');`);
  console.log(JSON.stringify({ applied: true, audit }));
  if (audit.find((row) => row.metric === "commercial_with_hash_copy")?.count !== 0) throw new Error("Commercial checksum copy remains after publication.");
}

function statementsFor(project: Project, extraction: Extraction & { draft: Draft }): string[] {
  if (project.id !== extraction.projectId) throw new Error(`${extraction.slug}: project ID mismatch`);
  const rpps = JSON.parse(project.rpps_json) as Record<string, unknown>;
  const commercial = object(rpps.commercial_profile) ?? {};
  commercial.official_description = extraction.draft.summary;
  commercial.specifications = publishedSpecs(extraction.draft).map(({ evidenceQuote: _quote, ...specification }) => ({ ...specification, sourceUrl: extraction.sourceUrl, observedAt: extraction.generatedAt }));
  commercial.systems = extraction.draft.systems.map(({ evidenceQuote: _quote, ...system }) => ({ ...system, sourceUrl: extraction.sourceUrl, observedAt: extraction.generatedAt }));
  rpps.commercial_profile = commercial;
  rpps.summary = extraction.draft.summary.slice(0, 400);
  rpps.description = extraction.draft.summary;
  const evidenceId = stableId("evidence", `commercial-product-enrichment:${project.id}:${extraction.sourceHash}`);
  const lines = [
    `INSERT INTO evidence (id,source_type,source_url,title,publisher,retrieved_at,confidence,excerpt,is_demo,created_at) VALUES (${sqlString(evidenceId)},'official_product_page',${sqlString(extraction.sourceUrl)},${sqlString(`Manufacturer product details for ${extraction.slug}`)},'Manufacturer',${sqlString(extraction.generatedAt)},0.9,${sqlString(extraction.draft.summary)},0,${sqlString(extraction.generatedAt)}) ON CONFLICT(id) DO UPDATE SET source_url=excluded.source_url,title=excluded.title,retrieved_at=excluded.retrieved_at,confidence=excluded.confidence,excerpt=excluded.excerpt`,
    `UPDATE project_specs SET is_current=0,updated_at=${sqlString(now)} WHERE project_id=${sqlString(project.id)} AND is_current=1 AND (spec_key LIKE 'manufacturer:%' OR spec_key='core-technical-specifications')`,
    `UPDATE project_versions SET rpps_json=${sqlString(JSON.stringify(rpps))},changelog='Published source-backed manufacturer specifications and systems' WHERE id=${sqlString(project.current_version_id)} AND project_id=${sqlString(project.id)}`,
    `UPDATE projects SET upstream_url=${sqlString(extraction.sourceUrl)},summary=${sqlString(extraction.draft.summary.slice(0,400))},description=${sqlString(extraction.draft.summary)},current_description_generation_id=NULL,version=version+1,updated_at=${sqlString(now)} WHERE id=${sqlString(project.id)} AND current_version_id=${sqlString(project.current_version_id)} AND project_kind='commercial_showcase'`,
    `DELETE FROM search_index WHERE entity_type='project' AND entity_id=${sqlString(project.id)}`,
    `INSERT INTO search_index (entity_type,entity_id,title,body,tags) SELECT 'project',id,name,${sqlString(extraction.draft.summary)},${sqlString('commercial-showcase source-backed product details')} FROM projects WHERE id=${sqlString(project.id)}`,
  ];
  publishedSpecs(extraction.draft).forEach((specification, index) => {
    const specKey = `manufacturer:${specification.key}`;
    const specId = stableId("spec", `${project.id}:${specKey}`);
    lines.push(`INSERT INTO project_specs (id,project_id,spec_key,label,value_text,value_number,unit,confidence,observed_at,evidence_id,is_current,sort_order,created_at,updated_at) SELECT ${sqlString(specId)},${sqlString(project.id)},${sqlString(specKey)},${sqlString(specification.label)},${specification.valueText ? sqlString(specification.valueText) : "NULL"},${specification.valueNumber ?? "NULL"},${specification.unit ? sqlString(specification.unit) : "NULL"},0.9,${sqlString(extraction.generatedAt)},${sqlString(evidenceId)},1,${index},${sqlString(now)},${sqlString(now)} WHERE NOT EXISTS (SELECT 1 FROM project_specs existing WHERE existing.project_id=${sqlString(project.id)} AND existing.is_current=1 AND lower(existing.label)=lower(${sqlString(specification.label)}) AND existing.spec_key<>${sqlString(specKey)}) ON CONFLICT(id) DO UPDATE SET label=excluded.label,value_text=excluded.value_text,value_number=excluded.value_number,unit=excluded.unit,confidence=excluded.confidence,observed_at=excluded.observed_at,evidence_id=excluded.evidence_id,is_current=1,sort_order=excluded.sort_order,updated_at=excluded.updated_at`);
  });
  return lines;
}

function needsPublication(project: Project, extraction: Extraction & { draft: Draft }): boolean {
  const rpps = JSON.parse(project.rpps_json) as Record<string, unknown>;
  const commercial = object(rpps.commercial_profile) ?? {};
  const specifications = publishedSpecs(extraction.draft).map(({ evidenceQuote: _quote, ...specification }) => ({ ...specification, sourceUrl: extraction.sourceUrl, observedAt: extraction.generatedAt }));
  const systems = extraction.draft.systems.map(({ evidenceQuote: _quote, ...system }) => ({ ...system, sourceUrl: extraction.sourceUrl, observedAt: extraction.generatedAt }));
  return commercial.official_description !== extraction.draft.summary
    || JSON.stringify(commercial.specifications ?? []) !== JSON.stringify(specifications)
    || JSON.stringify(commercial.systems ?? []) !== JSON.stringify(systems);
}

function publishedSpecs(draft: Draft): SpecDraft[] {
  return draft.specs.filter((specification) => specification.valueNumber == null || specification.valueNumber > 0);
}

function latestExtractions(): Map<string, Extraction> { const rows = new Map<string, Extraction>(); if (!existsSync(inputPath)) return rows; for (const line of readFileSync(inputPath,"utf8").split("\n")) { if (!line.trim()) continue; try { const row=JSON.parse(line) as Extraction; rows.set(row.slug,row); } catch { /* preserve valid checkpoint */ } } return rows; }
function query<T>(sql: string): T[] { return captureWranglerJson<Array<WranglerStatement<T>>>(["d1","execute","DB","--env",env!,"--remote","--command",sql]).flatMap((statement)=>statement.results??[]); }
function object(value: unknown): Record<string, unknown> | null { return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null; }
function chunk<T>(items:T[],size:number):T[][]{const output:T[][]=[];for(let i=0;i<items.length;i+=size)output.push(items.slice(i,i+size));return output;}
function valueAfter(flag:string):string|undefined{const index=args.indexOf(flag);return index>=0?args[index+1]:undefined;}
main();
