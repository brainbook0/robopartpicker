import { z } from "zod";

export const recordTypes = ["manufacturer", "supplier", "component", "offer", "project", "bom", "integration", "evidence", "teardown", "commercial_robot", "marketplace_reference"] as const;
export type RecordType = (typeof recordTypes)[number];

const commonName = z.string().trim().min(1).max(300);
const optionalUrl = z.string().url().max(2_048).refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "Only HTTP(S) URLs are allowed.").nullable().optional();
const parsedSchemas: Record<RecordType, z.ZodType<Record<string, unknown>>> = {
  manufacturer: z.object({ name: commonName, websiteUrl: optionalUrl, headquartersRegion: z.string().trim().max(50).nullable().optional() }).passthrough(),
  supplier: z.object({ name: commonName, websiteUrl: optionalUrl, regions: z.array(z.string().trim().min(1).max(30)).max(100).default([]) }).passthrough(),
  component: z.object({ name: commonName, category: z.string().trim().min(1).max(80), manufacturerName: z.string().trim().max(300).nullable().optional(), manufacturerPartNumber: z.string().trim().max(200).nullable().optional(), specs: z.record(z.string(), z.unknown()).default({}) }).passthrough(),
  offer: z.object({ supplierExternalId: z.string().trim().min(1).max(300), componentExternalId: z.string().trim().min(1).max(300), supplierSku: z.string().trim().max(200).nullable().optional(), currency: z.string().regex(/^[A-Z]{3}$/u), unitPriceMinor: z.number().int().nonnegative(), regionCode: z.string().trim().max(30).nullable().optional(), observedAt: z.string().datetime() }).passthrough(),
  project: z.object({ name: commonName, repositoryUrl: optionalUrl, licenseSpdx: z.string().trim().max(100).nullable().optional(), extracted: z.record(z.string(), z.unknown()).default({}) }).passthrough(),
  bom: z.object({ name: commonName, items: z.array(z.record(z.string(), z.unknown())).max(2_000) }).passthrough(),
  integration: z.object({ name: commonName, integrationType: z.string().trim().min(1).max(100), entities: z.array(z.record(z.string(), z.unknown())).max(1_000).default([]) }).passthrough(),
  evidence: z.object({ title: commonName, sourceType: z.string().trim().min(1).max(100), sourceUrl: optionalUrl }).passthrough(),
  teardown: z.object({ title: commonName }).passthrough(),
  commercial_robot: z.object({ name: commonName }).passthrough(),
  marketplace_reference: z.object({ title: commonName, sourceUrl: optionalUrl }).passthrough(),
};

export function validateParsedData(recordType: RecordType, value: unknown) {
  return parsedSchemas[recordType].safeParse(value);
}

export function normalizedName(value: string): string {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim().replace(/\s+/gu, " ");
}

export function stagingStatements(db: D1Database, recordType: RecordType, recordId: string, parsed: Record<string, unknown>, now: string): D1PreparedStatement[] {
  const id = crypto.randomUUID();
  switch (recordType) {
    case "manufacturer": return [db.prepare(`INSERT INTO staging_manufacturers
      (id, import_record_id, name, website_url, headquarters_region, normalized_name, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`).bind(id, recordId, parsed.name, parsed.websiteUrl ?? null, parsed.headquartersRegion ?? null, normalizedName(String(parsed.name)), now)];
    case "supplier": return [db.prepare(`INSERT INTO staging_suppliers
      (id, import_record_id, name, website_url, normalized_name, regions_json, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`).bind(id, recordId, parsed.name, parsed.websiteUrl ?? null, normalizedName(String(parsed.name)), JSON.stringify(parsed.regions ?? []), now)];
    case "component": return [db.prepare(`INSERT INTO staging_components
      (id, import_record_id, manufacturer_name, manufacturer_part_number, name, category, normalized_name, specs_json, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`).bind(id, recordId, parsed.manufacturerName ?? null, parsed.manufacturerPartNumber ?? null, parsed.name, parsed.category, normalizedName(String(parsed.name)), JSON.stringify(parsed.specs ?? {}), now)];
    case "offer": return [db.prepare(`INSERT INTO staging_offers
      (id, import_record_id, supplier_external_id, component_external_id, supplier_sku, currency, unit_price_minor, region_code, observed_at, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`).bind(id, recordId, parsed.supplierExternalId, parsed.componentExternalId, parsed.supplierSku ?? null, parsed.currency, parsed.unitPriceMinor, parsed.regionCode ?? null, parsed.observedAt, now)];
    case "project": return [db.prepare(`INSERT INTO staging_projects
      (id, import_record_id, name, repository_url, license_spdx, extracted_json, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`).bind(id, recordId, parsed.name, parsed.repositoryUrl ?? null, parsed.licenseSpdx ?? null, JSON.stringify(parsed.extracted ?? parsed), now)];
    case "bom": return [db.prepare(`INSERT INTO staging_boms
      (id, import_record_id, name, items_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`)
      .bind(id, recordId, parsed.name, JSON.stringify(parsed.items), now)];
    case "integration": return [db.prepare(`INSERT INTO staging_integrations
      (id, import_record_id, name, integration_type, entities_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
      .bind(id, recordId, parsed.name, parsed.integrationType, JSON.stringify(parsed.entities ?? []), now)];
    default: return [];
  }
}

export async function matchStatements(db: D1Database, recordType: RecordType, recordId: string, parsed: Record<string, unknown>, now: string): Promise<D1PreparedStatement[]> {
  let entity: { id: string } | null = null;
  if (recordType === "manufacturer") entity = await db.prepare("SELECT id FROM manufacturers WHERE lower(name) = lower(?1) LIMIT 1").bind(parsed.name).first<{ id: string }>();
  if (recordType === "supplier") entity = await db.prepare("SELECT id FROM suppliers WHERE lower(name) = lower(?1) LIMIT 1").bind(parsed.name).first<{ id: string }>();
  if (recordType === "component" && parsed.manufacturerPartNumber) entity = await db.prepare("SELECT id FROM components WHERE manufacturer_part_number = ?1 LIMIT 1").bind(parsed.manufacturerPartNumber).first<{ id: string }>();
  if (!entity) return [];
  return [db.prepare(`INSERT INTO canonical_match_candidates
    (id, import_record_id, canonical_entity_type, canonical_entity_id, match_method, score, explanation_json, created_at)
    VALUES (?1, ?2, ?3, ?4, 'deterministic_exact', 1, ?5, ?6)`)
    .bind(crypto.randomUUID(), recordId, recordType, entity.id, JSON.stringify({ fields: recordType === "component" ? ["manufacturerPartNumber"] : ["normalizedName"] }), now)];
}

export async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
