import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { boms } from "../src/data/boms";
import { parts } from "../src/data/parts";
import { suppliers } from "../src/data/suppliers";
import { listings, wanted } from "../src/data/listings";
import { runWrangler } from "./wrangler-cli";

const now = new Date().toISOString();
const statements: string[] = [];

function sql(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Cannot seed a non-finite number.");
    return String(value);
  }
  return `'${value.replaceAll("'", "''")}'`;
}

function idPart(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72);
}

function push(statement: string): void {
  statements.push(`${statement.trim()}\n`);
}

for (const supplier of suppliers) {
  push(`
    INSERT INTO suppliers (id, slug, name, website_url, description, status, freshness_at, is_demo, created_at, updated_at)
    VALUES (${sql(supplier.id)}, ${sql(supplier.slug)}, ${sql(supplier.name)}, ${sql(supplier.website)}, ${sql(supplier.notes)}, ${sql(supplier.verified ? "active" : "unverified")}, ${sql(now)}, 1, ${sql(now)}, ${sql(now)})
    ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, name = excluded.name, website_url = excluded.website_url,
      description = excluded.description, status = excluded.status, freshness_at = excluded.freshness_at, is_demo = 1, updated_at = excluded.updated_at;
  `);
  push(`
    INSERT INTO supplier_regions (supplier_id, region_code, local_currency, ships_from, ships_to)
    VALUES (${sql(supplier.id)}, ${sql(supplier.region)}, NULL, 1, 1)
    ON CONFLICT(supplier_id, region_code) DO UPDATE SET ships_from = 1, ships_to = 1;
  `);
  push(`
    INSERT INTO supplier_metrics (supplier_id, minimum_order_quantity, typical_lead_days, verified, claimed, warranty_label, documentation_score, rating, review_count, notes, updated_at)
    VALUES (${sql(supplier.id)}, ${supplier.moq}, ${supplier.leadDays}, ${supplier.verified ? 1 : 0}, ${supplier.claimed ? 1 : 0}, ${sql(supplier.warranty)}, ${supplier.docScore}, ${supplier.reviews.rating}, ${supplier.reviews.count}, ${sql(supplier.notes)}, ${sql(now)})
    ON CONFLICT(supplier_id) DO UPDATE SET minimum_order_quantity = excluded.minimum_order_quantity,
      typical_lead_days = excluded.typical_lead_days, verified = excluded.verified, claimed = excluded.claimed,
      warranty_label = excluded.warranty_label, documentation_score = excluded.documentation_score,
      rating = excluded.rating, review_count = excluded.review_count, notes = excluded.notes, updated_at = excluded.updated_at;
  `);
  for (const category of supplier.categories) {
    push(`INSERT INTO supplier_capabilities (supplier_id, category) VALUES (${sql(supplier.id)}, ${sql(category)}) ON CONFLICT DO NOTHING;`);
  }
  for (const interfaceName of supplier.interfaces) {
    push(`INSERT INTO supplier_interfaces (supplier_id, interface_name) VALUES (${sql(supplier.id)}, ${sql(interfaceName)}) ON CONFLICT DO NOTHING;`);
  }
}

const gradeMap: Record<string, string> = { A: "A", B: "B", C: "C", Untested: "untested", ForParts: "for_parts" };
for (const listing of listings) {
  const createdAt = new Date(Date.now() - listing.postedDaysAgo * 86_400_000).toISOString();
  push(`
    INSERT INTO marketplace_listings
      (id, slug, seller_user_id, listing_type, title, description, category, condition_grade, currency,
       price_minor, quantity, region_code, status, visibility, version, is_demo,
       created_at, updated_at, published_at)
    VALUES (${sql(listing.id)}, ${sql(`demo-${idPart(listing.title)}-${listing.id}`)}, NULL, 'sell', ${sql(listing.title)},
      ${sql(listing.notes ?? "Demonstration marketplace record imported from the downloaded frontend fixture.")},
      'component', ${sql(gradeMap[listing.grade] ?? "not_applicable")},
      'USD', ${Math.round(listing.price * 100)}, 1, ${sql(listing.region)}, 'published', 'public', 1, 1,
      ${sql(createdAt)}, ${sql(createdAt)}, ${sql(createdAt)})
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description, category = excluded.category,
      condition_grade = excluded.condition_grade, price_minor = excluded.price_minor, region_code = excluded.region_code,
      status = 'published', visibility = 'public', is_demo = 1, updated_at = excluded.updated_at;
  `);
  push(`
    INSERT INTO marketplace_listing_details
      (listing_id, runtime_hours, provenance_text, seller_declares_test_report, seller_declares_video,
       seller_accepts_returns, serial_available, updated_at)
    VALUES (${sql(listing.id)}, ${listing.runtimeHours ?? "NULL"}, ${sql(listing.notes ?? null)}, ${listing.hasTestReport ? 1 : 0},
      ${listing.hasVideo ? 1 : 0}, ${listing.returnsAccepted ? 1 : 0}, ${listing.serialVerified ? 1 : 0}, ${sql(createdAt)})
    ON CONFLICT(listing_id) DO UPDATE SET runtime_hours = excluded.runtime_hours, provenance_text = excluded.provenance_text,
      seller_declares_test_report = excluded.seller_declares_test_report, seller_declares_video = excluded.seller_declares_video,
      seller_accepts_returns = excluded.seller_accepts_returns, serial_available = excluded.serial_available, updated_at = excluded.updated_at;
  `);
}

for (const request of wanted) {
  const createdAt = new Date(Date.now() - request.postedDaysAgo * 86_400_000).toISOString();
  push(`
    INSERT INTO marketplace_listings
      (id, slug, seller_user_id, listing_type, title, description, category, condition_grade, currency,
       price_minor, quantity, region_code, status, visibility, version, is_demo, created_at, updated_at, published_at)
    VALUES (${sql(request.id)}, ${sql(`demo-wanted-${idPart(request.partName)}-${request.id}`)}, NULL, 'wanted',
      ${sql(`Wanted: ${request.partName}`)}, ${sql(request.notes ?? "Demonstration wanted request imported from the downloaded frontend fixture.")},
      ${sql(request.partCategory)}, 'not_applicable', 'USD', ${Math.round(request.maxBudget * 100)}, ${request.qty},
      ${sql(request.region === "Any" ? "Global" : request.region)}, 'published', 'public', 1, 1,
      ${sql(createdAt)}, ${sql(createdAt)}, ${sql(createdAt)})
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description, category = excluded.category,
      price_minor = excluded.price_minor, quantity = excluded.quantity, region_code = excluded.region_code,
      status = 'published', visibility = 'public', is_demo = 1, updated_at = excluded.updated_at;
  `);
  push(`
    INSERT INTO marketplace_listing_details
      (listing_id, provenance_text, seller_declares_test_report, seller_declares_video, seller_accepts_returns, serial_available, updated_at)
    VALUES (${sql(request.id)}, ${sql(request.notes ?? null)}, 0, 0, 0, 0, ${sql(createdAt)})
    ON CONFLICT(listing_id) DO UPDATE SET provenance_text = excluded.provenance_text, updated_at = excluded.updated_at;
  `);
}

const manufacturerIdByName = new Map<string, string>();
for (const part of parts) {
  if (manufacturerIdByName.has(part.maker)) continue;
  const manufacturerId = `m-${idPart(part.maker)}`;
  manufacturerIdByName.set(part.maker, manufacturerId);
  push(`
    INSERT INTO manufacturers (id, slug, name, headquarters_region, status, is_demo, created_at, updated_at)
    VALUES (${sql(manufacturerId)}, ${sql(idPart(part.maker))}, ${sql(part.maker)}, ${sql(part.makerCountry)}, 'active', 1, ${sql(now)}, ${sql(now)})
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, headquarters_region = excluded.headquarters_region, is_demo = 1, updated_at = excluded.updated_at;
  `);
}

const baseKeys = new Set([
  "id", "slug", "category", "name", "maker", "makerCountry", "region", "blurb", "tags",
  "priceHistory", "offers", "compatibility",
]);

for (const part of parts) {
  const manufacturerId = manufacturerIdByName.get(part.maker)!;
  push(`
    INSERT INTO components (id, slug, manufacturer_id, name, category, summary, lifecycle_status, primary_region, provenance_label, freshness_at, is_demo, version, created_at, updated_at)
    VALUES (${sql(part.id)}, ${sql(part.slug)}, ${sql(manufacturerId)}, ${sql(part.name)}, ${sql(part.category)}, ${sql(part.blurb)}, 'active', ${sql(part.region)}, 'demo-fixture', ${sql(now)}, 1, 1, ${sql(now)}, ${sql(now)})
    ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, manufacturer_id = excluded.manufacturer_id, name = excluded.name,
      category = excluded.category, summary = excluded.summary, primary_region = excluded.primary_region,
      provenance_label = excluded.provenance_label, freshness_at = excluded.freshness_at, is_demo = 1, updated_at = excluded.updated_at;
  `);

  const revisionId = `${part.id}-rev-1`;
  push(`
    INSERT INTO component_revisions (id, component_id, revision_label, status, notes, effective_at, created_at)
    VALUES (${sql(revisionId)}, ${sql(part.id)}, 'fixture-1', 'published', 'Imported from downloaded TypeScript demo fixture.', ${sql(now)}, ${sql(now)})
    ON CONFLICT(id) DO UPDATE SET notes = excluded.notes, effective_at = excluded.effective_at;
  `);

  const entries = Object.entries(part as unknown as Record<string, unknown>);
  for (const [key, value] of entries) {
    if (baseKeys.has(key) || value === undefined || value === null) continue;
    const specId = `${part.id}-spec-${idPart(key)}`;
    const numeric = typeof value === "number" ? value : typeof value === "boolean" ? (value ? 1 : 0) : null;
    const text = typeof value === "string" ? value : Array.isArray(value) ? JSON.stringify(value) : null;
    if (numeric === null && text === null) continue;
    push(`
      INSERT INTO component_specs (id, component_revision_id, spec_key, label, value_text, value_number, normalized_value, sort_order, created_at)
      VALUES (${sql(specId)}, ${sql(revisionId)}, ${sql(key)}, ${sql(key)}, ${sql(text)}, ${sql(numeric)}, ${sql(numeric)}, 0, ${sql(now)})
      ON CONFLICT(id) DO UPDATE SET value_text = excluded.value_text, value_number = excluded.value_number, normalized_value = excluded.normalized_value;
    `);
  }

  for (const tag of part.tags) {
    push(`INSERT INTO component_tags (component_id, tag) VALUES (${sql(part.id)}, ${sql(tag)}) ON CONFLICT DO NOTHING;`);
  }
  for (const tag of part.compatibility) {
    push(`INSERT INTO component_compatibility_tags (component_id, tag) VALUES (${sql(part.id)}, ${sql(tag)}) ON CONFLICT DO NOTHING;`);
  }

  part.offers.forEach((offer, offerIndex) => {
    const supplier = suppliers.find((candidate) =>
      candidate.id === offer.supplierId
      || candidate.slug === offer.supplierId
      || `s-${candidate.slug}` === offer.supplierId,
    );
    if (!supplier) throw new Error(`Fixture offer references unknown supplier ${offer.supplierId}.`);
    const offerId = `${part.id}-offer-${offerIndex + 1}`;
    push(`
      INSERT INTO supplier_offers (id, supplier_id, component_id, supplier_sku, region_code, currency, unit_price_minor, minimum_quantity, stock_quantity, lead_time_days, availability, observed_at, is_demo, created_at, updated_at)
      VALUES (${sql(offerId)}, ${sql(supplier.id)}, ${sql(part.id)}, NULL, ${sql(supplier.region)}, 'USD', ${Math.round(offer.price * 100)}, ${offer.moq}, ${offer.stock}, ${offer.leadDays}, ${sql(offer.stock > 0 ? "in_stock" : "out_of_stock")}, ${sql(now)}, 1, ${sql(now)}, ${sql(now)})
      ON CONFLICT(id) DO UPDATE SET unit_price_minor = excluded.unit_price_minor, minimum_quantity = excluded.minimum_quantity,
        stock_quantity = excluded.stock_quantity, lead_time_days = excluded.lead_time_days, availability = excluded.availability,
        observed_at = excluded.observed_at, is_demo = 1, updated_at = excluded.updated_at;
    `);
  });

  const historyOfferId = part.offers.length > 0 ? `${part.id}-offer-1` : null;
  if (historyOfferId) {
    part.priceHistory.forEach((point, historyIndex) => {
      push(`
        INSERT INTO offer_price_history (id, supplier_offer_id, currency, unit_price_minor, observed_at)
        VALUES (${sql(`${part.id}-history-${historyIndex + 1}`)}, ${sql(historyOfferId)}, 'USD', ${Math.round(point.price * 100)}, ${sql(point.date)})
        ON CONFLICT(id) DO UPDATE SET unit_price_minor = excluded.unit_price_minor, observed_at = excluded.observed_at;
      `);
    });
  }

  push(`DELETE FROM search_index WHERE entity_type = 'component' AND entity_id = ${sql(part.id)};`);
  push(`INSERT INTO search_index (entity_type, entity_id, title, body, tags) VALUES ('component', ${sql(part.id)}, ${sql(`${part.maker} ${part.name}`)}, ${sql(part.blurb)}, ${sql(part.tags.join(" "))});`);
}

for (const listing of listings) {
  push(`UPDATE marketplace_listings SET source_component_id = ${sql(listing.partId)},
    category = (SELECT category FROM components WHERE id = ${sql(listing.partId)}) WHERE id = ${sql(listing.id)};`);
  push(`
    INSERT INTO marketplace_listing_items (id, listing_id, component_id, description, quantity)
    VALUES (${sql(`${listing.id}-item`)}, ${sql(listing.id)}, ${sql(listing.partId)}, ${sql(listing.title)}, 1)
    ON CONFLICT(id) DO UPDATE SET component_id = excluded.component_id, description = excluded.description;
  `);
}

for (const bom of boms) {
  const versionId = `${bom.id}-version-1`;
  push(`
    INSERT INTO boms (id, slug, name, visibility, is_demo, created_at, updated_at)
    VALUES (${sql(bom.id)}, ${sql(bom.slug)}, ${sql(bom.name)}, 'public', 1, ${sql(now)}, ${sql(now)})
    ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, name = excluded.name, visibility = 'public', is_demo = 1, updated_at = excluded.updated_at;
  `);
  push(`
    INSERT INTO bom_versions (id, bom_id, version_label, notes, currency, created_at)
    VALUES (${sql(versionId)}, ${sql(bom.id)}, 'fixture-1', ${sql(`${bom.description} Author label: ${bom.author}.`)}, 'USD', ${sql(now)})
    ON CONFLICT(id) DO UPDATE SET notes = excluded.notes;
  `);
  push(`UPDATE boms SET current_version_id = ${sql(versionId)} WHERE id = ${sql(bom.id)};`);
  bom.slots.forEach((slot, index) => {
    push(`
      INSERT INTO bom_items (id, bom_version_id, component_id, slot_key, description, quantity, unit, notes, sort_order)
      VALUES (${sql(`${bom.id}-item-${index + 1}`)}, ${sql(versionId)}, ${sql(slot.partId)}, ${sql(idPart(slot.slot) || `slot-${index + 1}`)}, ${sql(slot.slot)}, ${slot.qty}, 'each', ${sql(slot.note)}, ${index})
      ON CONFLICT(id) DO UPDATE SET component_id = excluded.component_id, description = excluded.description, quantity = excluded.quantity, notes = excluded.notes, sort_order = excluded.sort_order;
    `);
  });
}

const categories = [
  ["cat-general", "general", "General", "Open robotics discussion and project coordination."],
  ["cat-build-help", "build-help", "Build help", "Structured questions about assembly, calibration, and troubleshooting."],
  ["cat-components", "components", "Components", "Measurements, substitutions, integrations, and component evidence."],
  ["cat-projects", "projects", "Projects", "Project releases, BOM corrections, and RPPS discussions."],
  ["cat-marketplace", "marketplace", "Marketplace", "Technical questions linked to marketplace listings."],
] as const;

categories.forEach(([id, slug, name, description], sortOrder) => {
  push(`
    INSERT INTO forum_categories (id, slug, name, description, color, sort_order, created_at)
    VALUES (${sql(id)}, ${sql(slug)}, ${sql(name)}, ${sql(description)}, '#eab308', ${sortOrder}, ${sql(now)})
    ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, name = excluded.name, description = excluded.description, sort_order = excluded.sort_order;
  `);
});

const outputDirectory = path.resolve(".wrangler");
const outputFile = path.join(outputDirectory, "seed.generated.sql");
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, statements.join("\n"), "utf8");
console.log(`Generated ${statements.length} idempotent fixture statements from ${parts.length} components, ${suppliers.length} suppliers, and ${boms.length} BOMs.`);
const cliArguments = process.argv.slice(2);
const remote = cliArguments.includes("--remote");
const environmentIndex = cliArguments.indexOf("--env");
const environment = environmentIndex >= 0 ? cliArguments[environmentIndex + 1] : undefined;
if (remote && environment !== "preview") {
  throw new Error("Remote fixture seeding is restricted to the isolated preview environment.");
}
runWrangler([
  "d1", "execute", remote ? "DB" : "robopartpicker",
  remote ? "--remote" : "--local",
  ...(environment ? ["--env", environment] : []),
  "--file", outputFile,
]);
