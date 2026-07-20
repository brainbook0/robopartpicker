import type { PortableRppsLock, PortableRppsManifest, RppsValidationReport } from "../../../src/lib/rpps/portable";

type ReleaseRow = {
  id: string;
  project_id: string;
  stable_release_id: string;
  version_label: string;
  schema_version: string;
  manifest_yaml: string;
  lock_yaml: string | null;
  manifest_sha256: string;
  package_sha256: string;
  conformance_report_json: string;
  status: "draft" | "published" | "superseded" | "withdrawn";
  created_by_user_id: string | null;
  created_at: string;
  published_at: string | null;
};

export type RppsReleaseDto = {
  id: string;
  projectId: string;
  stableReleaseId: string;
  version: string;
  schemaVersion: string;
  manifest: string;
  lockfile: string | null;
  manifestSha256: string;
  packageSha256: string;
  report: RppsValidationReport;
  status: ReleaseRow["status"];
  createdByUserId: string | null;
  createdAt: string;
  publishedAt: string | null;
};
export type RppsReleaseSummaryDto = Omit<RppsReleaseDto, "manifest" | "lockfile"> & { hasLockfile: boolean };

const selectRelease = `SELECT id, project_id, stable_release_id, version_label, schema_version, manifest_yaml,
  lock_yaml, manifest_sha256, package_sha256, conformance_report_json, status, created_by_user_id,
  created_at, published_at FROM rpps_releases`;
const selectReleaseSummary = `SELECT id, project_id, stable_release_id, version_label, schema_version,
  manifest_sha256, package_sha256, conformance_report_json, status, created_by_user_id, created_at,
  published_at, CASE WHEN lock_yaml IS NULL THEN 0 ELSE 1 END AS has_lockfile FROM rpps_releases`;

export class RppsReleasesRepository {
  constructor(private readonly db: D1Database) {}

  async list(projectId: string, publishedOnly = false): Promise<RppsReleaseSummaryDto[]> {
    const rows = await this.db.prepare(`${selectReleaseSummary} WHERE project_id = ?1 AND (?2 = 0 OR status = 'published') ORDER BY created_at DESC`).bind(projectId, publishedOnly ? 1 : 0).all<Omit<ReleaseRow, "manifest_yaml" | "lock_yaml"> & { has_lockfile: number }>();
    return rows.results.map((row) => ({
      id: row.id, projectId: row.project_id, stableReleaseId: row.stable_release_id, version: row.version_label,
      schemaVersion: row.schema_version, manifestSha256: row.manifest_sha256, packageSha256: row.package_sha256,
      report: JSON.parse(row.conformance_report_json) as RppsValidationReport, status: row.status,
      createdByUserId: row.created_by_user_id, createdAt: row.created_at, publishedAt: row.published_at,
      hasLockfile: row.has_lockfile === 1,
    }));
  }

  async find(projectId: string, idOrStableId: string, publishedOnly = false): Promise<RppsReleaseDto | null> {
    const row = await this.db.prepare(`${selectRelease} WHERE project_id = ?1 AND (id = ?2 OR stable_release_id = ?2) AND (?3 = 0 OR status = 'published')`).bind(projectId, idOrStableId, publishedOnly ? 1 : 0).first<ReleaseRow>();
    return row ? toDto(row) : null;
  }

  async create(input: {
    projectId: string;
    actorUserId: string;
    manifest: PortableRppsManifest;
    manifestYaml: string;
    lock?: PortableRppsLock;
    lockYaml?: string;
    manifestSha256: string;
    packageSha256: string;
    report: RppsValidationReport;
    status: "draft" | "published";
  }): Promise<RppsReleaseDto> {
    const releaseId = crypto.randomUUID();
    const now = new Date().toISOString();
    const publishedAt = input.status === "published" ? now : null;
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`INSERT INTO rpps_releases
        (id, project_id, stable_release_id, version_label, schema_version, manifest_yaml, lock_yaml,
         manifest_sha256, package_sha256, conformance_report_json, status, created_by_user_id, created_at, published_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`)
        .bind(releaseId, input.projectId, input.manifest.release.id, input.manifest.release.version, input.manifest.rpps,
          input.manifestYaml, input.lockYaml ?? null, input.manifestSha256, input.packageSha256,
          JSON.stringify(input.report), input.status, input.actorUserId, now, publishedAt),
    ];
    if (input.manifest.assemblies.length > 0) {
      statements.push(this.db.prepare(`INSERT INTO rpps_release_assemblies
        (id, release_id, stable_id, name, description, data_json)
        SELECT json_extract(value, '$.rowId'), ?1, json_extract(value, '$.stableId'), json_extract(value, '$.name'),
          json_extract(value, '$.description'), json_extract(value, '$.data') FROM json_each(?2)`)
        .bind(releaseId, JSON.stringify(input.manifest.assemblies.map((item) => ({ rowId: crypto.randomUUID(), stableId: item.id, name: item.name, description: item.description ?? null, data: item })))));
    }
    if (input.manifest.interfaces.length > 0) {
      statements.push(this.db.prepare(`INSERT INTO rpps_release_interfaces
        (id, release_id, stable_id, interface_kind, name, specifications_json)
        SELECT json_extract(value, '$.rowId'), ?1, json_extract(value, '$.stableId'), json_extract(value, '$.kind'),
          json_extract(value, '$.name'), json_extract(value, '$.specifications') FROM json_each(?2)`)
        .bind(releaseId, JSON.stringify(input.manifest.interfaces.map((item) => ({ rowId: crypto.randomUUID(), stableId: item.id, kind: item.kind, name: item.name, specifications: item.specifications })))));
    }
    const sources = input.manifest.artifacts.filter((artifact) => artifact.source).map((artifact) => ({
      rowId: crypto.randomUUID(), stableId: artifact.id, url: artifact.source!.url, path: artifact.path,
      revision: artifact.source!.revision ?? null, retrievedAt: artifact.source!.retrievedAt ?? null,
    }));
    if (sources.length > 0) {
      statements.push(this.db.prepare(`INSERT INTO rpps_source_mappings
        (id, release_id, object_type, object_stable_id, source_url, source_path, source_revision, retrieved_at, created_at)
        SELECT json_extract(value, '$.rowId'), ?1, 'artifact', json_extract(value, '$.stableId'),
          json_extract(value, '$.url'), json_extract(value, '$.path'), json_extract(value, '$.revision'),
          json_extract(value, '$.retrievedAt'), ?2 FROM json_each(?3)`)
        .bind(releaseId, now, JSON.stringify(sources)));
    }
    if (input.report.findings.length > 0) {
      statements.push(this.db.prepare(`INSERT INTO rpps_validation_findings
        (id, release_id, rule_id, severity, profile, dimension, affected_object_stable_id, message, suggestion, deterministic, effect)
        SELECT json_extract(value, '$.rowId'), ?1, json_extract(value, '$.ruleId'), json_extract(value, '$.severity'),
          json_extract(value, '$.profile'), json_extract(value, '$.dimension'), json_extract(value, '$.affectedObject'),
          json_extract(value, '$.message'), json_extract(value, '$.suggestion'), 1, json_extract(value, '$.effect') FROM json_each(?2)`)
        .bind(releaseId, JSON.stringify(input.report.findings.map((item) => ({ rowId: crypto.randomUUID(), ...item })))));
    }
    await this.db.batch(statements);
    return (await this.find(input.projectId, releaseId))!;
  }
}

function toDto(row: ReleaseRow): RppsReleaseDto {
  return {
    id: row.id,
    projectId: row.project_id,
    stableReleaseId: row.stable_release_id,
    version: row.version_label,
    schemaVersion: row.schema_version,
    manifest: row.manifest_yaml,
    lockfile: row.lock_yaml,
    manifestSha256: row.manifest_sha256,
    packageSha256: row.package_sha256,
    report: JSON.parse(row.conformance_report_json) as RppsValidationReport,
    status: row.status,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    publishedAt: row.published_at,
  };
}
