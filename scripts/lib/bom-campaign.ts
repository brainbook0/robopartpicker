import type { CompiledProjectBom } from "../../src/lib/bom-compiler";

export type CampaignProject = {
  id: string;
  slug: string;
  name: string;
  ownerUserId: string | null;
  organizationId: string | null;
  visibility: "private" | "organization" | "unlisted" | "public";
  existingBomId: string | null;
  existingVersionCount: number;
};

export function selectBomSourcePaths(entries: Array<{ path: string; size?: number | null }>): string[] {
  return entries
    .filter((entry) => {
      const lower = entry.path.toLocaleLowerCase("en-US");
      if ((entry.size ?? 0) > 16 * 1024 * 1024) return false;
      if (/(^|\/)(?:partition|partitions|partition-table|memory-map)(?:[._-]|$)/u.test(lower)) return false;
      if (/(^|\/)(?:config|configuration|firmware)\//u.test(lower) && !/(^|\/)(?:bom|bill[-_ ]?of[-_ ]?materials)(?:[._-]|$)/u.test(lower)) return false;
      if (/(^|\/)rpps\.(?:json|ya?ml)$/u.test(lower)) return true;
      if (/(^|\/)(?:bom|bill[-_ ]?of[-_ ]?materials|parts[-_ ]?list|parts)(?:[._-]|$)/u.test(lower)
        && /\.(?:csv|tsv|xlsx|json|ya?ml|md|markdown|html?|xml)$/u.test(lower)) return true;
      return /(^|\/)readme(?:\.[^/]*)?$/u.test(lower);
    })
    .sort((left, right) => sourcePriority(left.path) - sourcePriority(right.path) || left.path.localeCompare(right.path, "en-US"))
    .map((entry) => entry.path);
}

export function buildExactComponentMatcher(rows: Array<{ id: string; manufacturer: string | null; mpn: string | null }>) {
  const exact = new Map<string, string | null>();
  const byMpn = new Map<string, string | null>();
  for (const row of rows) {
    const mpn = normalizeIdentity(row.mpn);
    if (!mpn) continue;
    const existingMpn = byMpn.get(mpn);
    byMpn.set(mpn, existingMpn === undefined ? row.id : existingMpn === row.id ? row.id : null);
    const manufacturer = normalizeIdentity(row.manufacturer);
    if (!manufacturer) continue;
    const key = `${manufacturer}\u0000${mpn}`;
    const existingExact = exact.get(key);
    exact.set(key, existingExact === undefined ? row.id : existingExact === row.id ? row.id : null);
  }
  return (manufacturer: string | undefined, mpn: string | undefined): string | null => {
    const normalizedMpn = normalizeIdentity(mpn);
    if (!normalizedMpn) return null;
    const normalizedManufacturer = normalizeIdentity(manufacturer);
    return normalizedManufacturer ? exact.get(`${normalizedManufacturer}\u0000${normalizedMpn}`) ?? null : byMpn.get(normalizedMpn) ?? null;
  };
}

export function buildCampaignPublicationSql(input: {
  project: CampaignProject;
  compiled: CompiledProjectBom;
  now: string;
  matchComponent: (manufacturer: string | undefined, mpn: string | undefined) => string | null;
  ids: { runId: string; bomId: string; versionId: string };
}): string[] {
  const { project, compiled, now, matchComponent, ids } = input;
  const statements: string[] = [];
  const bomId = project.existingBomId ?? ids.bomId;
  if (!project.existingBomId) {
    statements.push(`INSERT INTO boms (id, project_id, owner_user_id, organization_id, slug, name, current_version_id, visibility, is_demo, created_at, updated_at) VALUES (${q(bomId)}, ${q(project.id)}, ${q(project.ownerUserId)}, ${q(project.organizationId)}, ${q(`${project.slug}-bom-${bomId.slice(0, 8)}`)}, ${q(`${project.name} BOM`)}, NULL, ${q(project.visibility)}, 0, ${q(now)}, ${q(now)});`);
  }

  const report = {
    schemaVersion: compiled.schemaVersion,
    publicationState: compiled.publicationState,
    accounting: compiled.accounting,
    omissions: compiled.omissions,
    lineCount: compiled.lines.length,
  };
  statements.push(`INSERT INTO bom_generation_runs (id, project_id, bom_id, source_revision, source_fingerprint, adapter_versions_json, status, file_count, objects_seen, candidate_count, warning_count, error_count, report_json, created_by_user_id, created_at, updated_at, compiler_version, policy_version, publication_state, source_inventory_complete, row_accounting_complete) VALUES (${q(ids.runId)}, ${q(project.id)}, ${q(bomId)}, ${q(compiled.sourceRevision)}, ${q(compiled.sourceFingerprint)}, ${q(JSON.stringify(Object.fromEntries(compiled.artifacts.map((artifact) => [artifact.path, artifact.parse.adapterId]))))}, 'confirmed', ${compiled.artifacts.length}, ${compiled.accounting.objectsSeen}, ${compiled.lines.length}, ${compiled.omissions.length}, ${compiled.accounting.errors.length}, ${q(JSON.stringify(report))}, ${q(project.ownerUserId)}, ${q(now)}, ${q(now)}, ${q(compiled.compilerVersion)}, ${q(compiled.policyVersion)}, ${q(compiled.publicationState)}, ${compiled.accounting.ok ? 1 : 0}, ${compiled.accounting.ok ? 1 : 0});`);

  const artifactIds = new Map<string, string>();
  compiled.artifacts.forEach((artifact, index) => {
    const artifactId = `${ids.runId}-artifact-${index + 1}`;
    artifactIds.set(artifact.path, artifactId);
    statements.push(`INSERT INTO bom_source_artifacts (id, generation_run_id, source_path, media_type, size_bytes, checksum_sha256, source_url, source_revision, retrieval_status, adapter_id, adapter_version, parser_status, object_count, created_at, updated_at) VALUES (${q(artifactId)}, ${q(ids.runId)}, ${q(artifact.path)}, ${q(mediaTypeFor(artifact.path))}, NULL, ${q(artifact.checksumSha256 ?? null)}, ${q(artifact.sourceUrl ?? null)}, ${q(artifact.sourceRevision ?? compiled.sourceRevision)}, 'fetched', ${q(artifact.parse.adapterId)}, ${q(artifact.parse.adapterId)}, ${q(artifact.parse.publishCapable ? "parsed" : "unsupported")}, ${artifact.parse.sourceObjectIds.length}, ${q(now)}, ${q(now)});`);
  });

  const candidateIdBySource = new Map<string, string>();
  compiled.lines.forEach((line, index) => {
    const candidateId = `${ids.runId}-candidate-${index + 1}`;
    line.aggregatedLocators.forEach((locator) => candidateIdBySource.set(locator, candidateId));
    statements.push(`INSERT INTO bom_candidate_lines (id, generation_run_id, source_locator, extraction_method, raw_fields_json, raw_name, raw_quantity, raw_unit, raw_manufacturer, raw_mpn, normalized_name, normalized_quantity, normalized_unit, normalized_manufacturer, normalized_mpn, classification, inclusion_state, aggregation_key, aggregated_locators_json, validation_errors_json, sort_order, created_at, updated_at) VALUES (${q(candidateId)}, ${q(ids.runId)}, ${q(line.evidenceLocator)}, 'explicit-bom', ${q(JSON.stringify({ sourceRows: line.rawFields }))}, ${q(line.description)}, ${q(String(line.quantity))}, ${q(line.unit)}, ${q(line.manufacturer ?? null)}, ${q(line.mpn ?? null)}, ${q(line.description)}, ${line.quantity}, ${q(line.unit)}, ${q(line.manufacturer ?? null)}, ${q(line.mpn ?? null)}, ${q(line.lineClassification)}, 'included', ${q(line.manufacturer && line.mpn ? `${normalizeIdentity(line.manufacturer)}:${normalizeIdentity(line.mpn)}` : null)}, ${q(JSON.stringify(line.aggregatedLocators))}, '[]', ${index}, ${q(now)}, ${q(now)});`);
  });

  compiled.outcomes.forEach((outcome, index) => {
    const artifactPath = findArtifactPath(outcome.sourceObjectId, [...artifactIds.keys()]);
    const artifactId = artifactPath ? artifactIds.get(artifactPath) : null;
    if (!artifactId) return;
    statements.push(`INSERT INTO bom_source_object_outcomes (id, generation_run_id, artifact_id, source_object_id, source_locator, outcome, candidate_line_id, aggregate_target_id, reason, raw_fields_json, created_at) VALUES (${q(`${ids.runId}-outcome-${index + 1}`)}, ${q(ids.runId)}, ${q(artifactId)}, ${q(outcome.sourceObjectId)}, ${q(outcome.sourceObjectId)}, ${q(outcome.outcome)}, ${q(candidateIdBySource.get(outcome.sourceObjectId) ?? null)}, ${q(outcome.aggregateTargetId ?? null)}, ${q(outcome.reason ?? null)}, '{}', ${q(now)});`);
  });

  const blockers = compiled.lines.flatMap((line) => {
    const result: Array<{ lineId: string; description: string }> = [];
    const componentId = matchComponent(line.manufacturer, line.mpn);
    if (!componentId) result.push({ lineId: line.id, description: `${line.description}: exact catalog identity is unresolved.` });
    result.push({ lineId: line.id, description: `${line.description}: a fresh verified price is unavailable.` });
    return result;
  });
  if (compiled.lines.length === 0) blockers.push({ lineId: "bom", description: coverageNote(compiled) });
  const validation = { schemaVersion: "bom-validation/2", validatedAt: now, quoteReady: false, publicationState: compiled.publicationState, blockers: boundValidationBlockers(blockers) };
  statements.push(`INSERT INTO bom_versions (id, bom_id, version_label, notes, currency, created_by_user_id, created_at, generation_run_id, source_fingerprint, validation_report_json, quote_ready, confirmed_at, publication_state, coverage_note, omission_report_json, compiler_version, policy_version) VALUES (${q(ids.versionId)}, ${q(bomId)}, ${q(String(project.existingVersionCount + 1))}, ${q("Generated from explicit source artifacts under the source-traceable BOM policy.")}, 'USD', ${q(project.ownerUserId)}, ${q(now)}, ${q(ids.runId)}, ${q(compiled.sourceFingerprint)}, ${q(JSON.stringify(validation))}, 0, ${q(now)}, ${q(compiled.publicationState)}, ${q(coverageNote(compiled))}, ${q(JSON.stringify(compiled.omissions))}, ${q(compiled.compilerVersion)}, ${q(compiled.policyVersion)});`);

  compiled.lines.forEach((line, index) => {
    const componentId = matchComponent(line.manufacturer, line.mpn);
    statements.push(`INSERT INTO bom_items (id, bom_version_id, component_id, slot_key, description, quantity, unit, selected_supplier_offer_id, target_unit_price_minor, notes, extraction_method, completeness, evidence_locator, confidence, line_classification, included, optional, raw_fields_json, aggregated_locators_json, sort_order) VALUES (${q(`${ids.versionId}-item-${index + 1}`)}, ${q(ids.versionId)}, ${q(componentId)}, ${q(`source-line-${index + 1}`)}, ${q(line.description)}, ${line.quantity}, ${q(line.unit)}, NULL, NULL, NULL, 'explicit-bom', ${q(line.completeness)}, ${q(line.evidenceLocator)}, 1, ${q(line.lineClassification)}, 1, ${line.optional ? 1 : 0}, ${q(JSON.stringify({ sourceRows: line.rawFields }))}, ${q(JSON.stringify(line.aggregatedLocators))}, ${index});`);
  });
  statements.push(`UPDATE boms SET current_version_id = ${q(ids.versionId)}, owner_user_id = ${q(project.ownerUserId)}, organization_id = ${q(project.organizationId)}, visibility = ${q(project.visibility)}, updated_at = ${q(now)} WHERE id = ${q(bomId)};`);
  return statements;
}

export function boundValidationBlockers(
  blockers: Array<{ lineId: string; description: string }>,
  limit = 40,
): Array<{ lineId: string; description: string }> {
  if (blockers.length <= limit) return blockers;
  return [
    ...blockers.slice(0, limit),
    { lineId: "bom", description: `${blockers.length - limit} additional quote blockers are stored in line-level validation data.` },
  ];
}

function coverageNote(compiled: CompiledProjectBom): string {
  switch (compiled.publicationState) {
    case "verified": return "Every explicit source row was accounted for. Purchased lines come only from the published source BOM.";
    case "partial": return `The explicit source BOM is partial. ${compiled.omissions.length} source object${compiled.omissions.length === 1 ? "" : "s"} could not be published.`;
    case "manufacturer_unavailable": return "The manufacturer has not published a model-specific BOM.";
    case "not_applicable": return "This is a software project, so a hardware BOM does not apply.";
    case "classification_required": return "The project must be classified before hardware BOM generation.";
    case "rejected": return "An explicit source artifact was found but failed deterministic validation.";
    case "draft": return "Source artifacts are still being validated.";
    case "unavailable": return "This physical project does not publish an explicit source BOM.";
  }
}

function sourcePriority(path: string): number {
  const lower = path.toLocaleLowerCase("en-US");
  if (/(^|\/)rpps\./u.test(lower)) return 0;
  if (/(^|\/)hardware\/bom(?:[._-]|$)/u.test(lower)) return 1;
  if (/(^|\/)hardware\/bill[-_ ]?of[-_ ]?materials/u.test(lower)) return 2;
  if (/(^|\/)bom(?:[._-]|$)/u.test(lower)) return 3;
  if (/(^|\/)bill[-_ ]?of[-_ ]?materials/u.test(lower)) return 4;
  if (/(^|\/)(?:parts[-_ ]?list|parts)(?:[._-]|$)/u.test(lower)) return 5;
  if (/(^|\/)readme/u.test(lower)) return 9;
  return 6;
}

function normalizeIdentity(value: string | null | undefined): string {
  return value?.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/[\s_-]+/gu, "") ?? "";
}

function findArtifactPath(sourceObjectId: string, paths: string[]): string | null {
  return paths.sort((left, right) => right.length - left.length).find((path) => sourceObjectId === path || sourceObjectId.startsWith(`${path}#`)) ?? null;
}

function mediaTypeFor(path: string): string {
  const extension = path.split(".").at(-1)?.toLocaleLowerCase("en-US");
  return ({ csv: "text/csv", tsv: "text/tab-separated-values", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", json: "application/json", yaml: "application/yaml", yml: "application/yaml", md: "text/markdown", markdown: "text/markdown", html: "text/html", htm: "text/html", xml: "application/xml" } as Record<string, string>)[extension ?? ""] ?? "application/octet-stream";
}

function q(value: string | null | undefined): string {
  return value == null ? "NULL" : `'${value.replace(/'/gu, "''")}'`;
}
