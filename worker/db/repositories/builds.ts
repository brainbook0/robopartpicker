import { AppError } from "../../http";
import type { PortableRppsManifest } from "../../../src/lib/rpps/portable";
import { fileContentUrl } from "../../services/file-urls";

export type BuildRow = {
  id: string; slug: string; name: string; description: string | null; owner_user_id: string | null; organization_id: string | null;
  source_project_id: string | null; source_project_version_id: string | null;
  visibility: "private" | "organization" | "unlisted" | "public";
  status: "planning" | "sourcing" | "building" | "testing" | "complete" | "paused" | "archived";
  progress_percent: number; currency: string; current_version_id: string | null; forked_from_build_id: string | null;
  version: number; created_at: string; updated_at: string;
};

export type BuildDetail = BuildRow & {
  items: Array<Record<string, unknown>>;
  steps: Array<Record<string, unknown>>;
  dependencies: Array<{ buildStepId: string; dependsOnStepId: string }>;
  configurations: Array<Record<string, unknown>>;
  firmware: Array<Record<string, unknown>>;
  calibrations: Array<Record<string, unknown>>;
  tests: Array<Record<string, unknown>>;
  problems: Array<Record<string, unknown>>;
  decisions: Array<Record<string, unknown>>;
  activity: Array<Record<string, unknown>>;
  files: Array<Record<string, unknown>>;
};

export class BuildsRepository {
  constructor(private readonly db: D1Database) {}

  async list(userId: string | null, mine: boolean): Promise<BuildRow[]> {
    const access = mine
      ? `(b.owner_user_id = ?1 OR EXISTS (SELECT 1 FROM build_members bm WHERE bm.build_id = b.id AND bm.user_id = ?1)
         OR EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = b.organization_id AND om.user_id = ?1 AND om.status = 'active'))`
      : `((b.visibility = 'public') OR (b.visibility = 'unlisted') OR b.owner_user_id = ?1
         OR EXISTS (SELECT 1 FROM build_members bm WHERE bm.build_id = b.id AND bm.user_id = ?1)
         OR EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = b.organization_id AND om.user_id = ?1 AND om.status = 'active'))`;
    if (!userId && mine) return [];
    const rows = userId
      ? await this.db.prepare(`SELECT b.* FROM builds b WHERE b.deleted_at IS NULL AND ${access} ORDER BY b.updated_at DESC`).bind(userId).all<BuildRow>()
      : await this.db.prepare(`SELECT b.* FROM builds b WHERE b.deleted_at IS NULL AND b.visibility = 'public' ORDER BY b.updated_at DESC`).all<BuildRow>();
    return rows.results;
  }

  async find(idOrSlug: string): Promise<BuildRow | null> {
    return this.db.prepare("SELECT * FROM builds WHERE deleted_at IS NULL AND (id = ?1 OR slug = ?1)").bind(idOrSlug).first<BuildRow>();
  }

  async detail(idOrSlug: string): Promise<BuildDetail | null> {
    const build = await this.find(idOrSlug);
    if (!build) return null;
    const [items, offers, steps, dependencies, configurations, firmware, calibrations, tests, problems, decisions, activity, files] = await this.db.batch([
      this.db.prepare(`SELECT bi.id, bi.component_id AS componentId, c.slug AS componentSlug, c.name AS componentName,
        c.category AS componentCategory, bi.selected_supplier_offer_id AS selectedSupplierOfferId,
        so.supplier_id AS selectedSupplierId, s.name AS selectedSupplierName, bi.description, bi.quantity,
        bi.unit, bi.unit_cost_minor AS unitCostMinor, bi.status, bi.substituted_for_item_id AS substitutedForItemId,
        bi.notes, bi.created_at AS createdAt, bi.updated_at AS updatedAt
        FROM build_items bi LEFT JOIN components c ON c.id = bi.component_id
        LEFT JOIN supplier_offers so ON so.id = bi.selected_supplier_offer_id AND so.is_demo = 0
        LEFT JOIN suppliers s ON s.id = so.supplier_id AND s.is_demo = 0 WHERE bi.build_id = ?1 ORDER BY bi.created_at`).bind(build.id),
      this.db.prepare(`SELECT bi.id AS buildItemId, so.id, so.supplier_id AS supplierId, s.name AS supplierName,
        so.unit_price_minor AS unitPriceMinor, so.currency, so.stock_quantity AS stockQuantity,
        so.lead_time_days AS leadTimeDays, so.minimum_quantity AS minimumOrderQuantity,
        so.observed_at AS observedAt, so.is_demo AS isDemo
        FROM build_items bi JOIN supplier_offers so ON so.component_id = bi.component_id
        JOIN suppliers s ON s.id = so.supplier_id WHERE bi.build_id = ?1 AND so.is_demo = 0 AND s.is_demo = 0
        ORDER BY bi.id, so.unit_price_minor, so.lead_time_days`).bind(build.id),
      this.db.prepare(`SELECT id, source_project_step_id AS sourceProjectStepId, title, body, status, sort_order AS sortOrder,
        completed_by_user_id AS completedByUserId, completed_at AS completedAt, created_at AS createdAt, updated_at AS updatedAt
        FROM build_steps WHERE build_id = ?1 ORDER BY sort_order, created_at`).bind(build.id),
      this.db.prepare(`SELECT build_step_id AS buildStepId, depends_on_step_id AS dependsOnStepId
        FROM build_step_dependencies WHERE build_step_id IN (SELECT id FROM build_steps WHERE build_id = ?1)`).bind(build.id),
      this.db.prepare(`SELECT id, name, format, content_text AS contentText, file_id AS fileId, version, created_at AS createdAt, updated_at AS updatedAt
        FROM build_configurations WHERE build_id = ?1 ORDER BY name`).bind(build.id),
      this.db.prepare(`SELECT id, name, repository_url AS repositoryUrl, revision, file_id AS fileId, license_spdx AS licenseSpdx,
        notes, created_at AS createdAt, updated_at AS updatedAt FROM build_firmware WHERE build_id = ?1 ORDER BY name`).bind(build.id),
      this.db.prepare(`SELECT id, name, procedure_text AS procedureText, result_json AS resultJson, status,
        performed_by_user_id AS performedByUserId, performed_at AS performedAt, created_at AS createdAt
        FROM build_calibrations WHERE build_id = ?1 ORDER BY created_at`).bind(build.id),
      this.db.prepare(`SELECT id, name, method_text AS methodText, expected_text AS expectedText, observed_text AS observedText,
        result, evidence_file_id AS evidenceFileId, performed_by_user_id AS performedByUserId, performed_at AS performedAt,
        created_at AS createdAt FROM build_tests WHERE build_id = ?1 ORDER BY created_at`).bind(build.id),
      this.db.prepare(`SELECT bp.id, bp.title, bp.description, bp.severity, bp.status, bp.reported_by_user_id AS reportedByUserId,
        bp.created_at AS createdAt, bp.updated_at AS updatedAt,
        (SELECT json_group_array(json_object('id', br.id, 'summary', br.summary, 'rootCause', br.root_cause, 'createdAt', br.created_at)) FROM build_resolutions br WHERE br.build_problem_id = bp.id) AS resolutionsJson
        FROM build_problems bp WHERE bp.build_id = ?1 ORDER BY bp.created_at DESC`).bind(build.id),
      this.db.prepare(`SELECT id, title, context, decision, consequences, decided_by_user_id AS decidedByUserId,
        decided_at AS decidedAt, created_at AS createdAt FROM build_decisions WHERE build_id = ?1 ORDER BY decided_at DESC`).bind(build.id),
      this.db.prepare(`SELECT id, actor_user_id AS actorUserId, event_type AS eventType, entity_type AS entityType,
        entity_id AS entityId, summary, metadata_json AS metadataJson, created_at AS createdAt
        FROM build_activity WHERE build_id = ?1 ORDER BY created_at DESC LIMIT 100`).bind(build.id),
      this.db.prepare(`SELECT f.id, f.original_name AS originalName, f.media_type AS mediaType, f.size_bytes AS sizeBytes,
        f.visibility, f.status, f.kind, bf.purpose, bf.build_step_id AS buildStepId, f.created_at AS createdAt
        FROM build_files bf JOIN files f ON f.id = bf.file_id WHERE bf.build_id = ?1 AND f.deleted_at IS NULL
        ORDER BY f.created_at DESC`).bind(build.id),
    ]);
    const offersByItem = new Map<string, Array<Record<string, unknown>>>();
    for (const offer of offers.results as Array<Record<string, unknown>>) {
      const buildItemId = String(offer.buildItemId);
      const grouped = offersByItem.get(buildItemId) ?? [];
      grouped.push(offer);
      offersByItem.set(buildItemId, grouped);
    }
    const hydratedItems = (items.results as Array<Record<string, unknown>>).map((item) => ({
      ...item,
      availableOffers: offersByItem.get(String(item.id)) ?? [],
    }));
    const hydratedCalibrations = (calibrations.results as Array<Record<string, unknown>>).map(({ resultJson, ...calibration }) => ({
      ...calibration,
      resultData: parseJsonObject(resultJson),
    }));
    const filesWithContentUrls = (files.results as Array<Record<string, unknown>>).map((file) => ({
      ...file,
      contentUrl: fileContentUrl(String(file.id)),
    }));
    return { ...build, items: hydratedItems, steps: steps.results as Array<Record<string, unknown>>,
      dependencies: dependencies.results as BuildDetail["dependencies"], configurations: configurations.results as Array<Record<string, unknown>>,
      firmware: firmware.results as Array<Record<string, unknown>>, calibrations: hydratedCalibrations,
      tests: tests.results as Array<Record<string, unknown>>, problems: problems.results as Array<Record<string, unknown>>,
      decisions: decisions.results as Array<Record<string, unknown>>, activity: activity.results as Array<Record<string, unknown>>,
      files: filesWithContentUrls };
  }

  async create(userId: string, input: {
    name: string;
    description?: string | null;
    organizationId?: string | null;
    sourceProjectId?: string | null;
    visibility: BuildRow["visibility"];
    rppsRelease?: {
      id: string;
      stableReleaseId: string;
      version: string;
      packageSha256: string;
      manifest: PortableRppsManifest;
    };
  }): Promise<BuildDetail> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const slug = `${slugify(input.name)}-${id.slice(0, 8)}`;
    const versionId = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`INSERT INTO builds
        (id, slug, name, description, owner_user_id, organization_id, source_project_id, source_project_version_id,
         visibility, status, progress_percent, currency, current_version_id, version, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7,
          (SELECT current_version_id FROM projects WHERE id = ?7), ?8, 'planning', 0, 'USD', ?9, 1, ?10, ?10)`)
        .bind(id, slug, input.name, input.description ?? null, userId, input.organizationId ?? null, input.sourceProjectId ?? null, input.visibility, versionId, now),
      this.db.prepare(`INSERT INTO build_members (build_id, user_id, role, created_at) VALUES (?1, ?2, 'owner', ?3)`).bind(id, userId, now),
      this.db.prepare(`INSERT INTO build_versions (id, build_id, version_number, summary, snapshot_json, created_by_user_id, created_at)
        VALUES (?1, ?2, 1, 'Build created', '{}', ?3, ?4)`).bind(versionId, id, userId, now),
      activityStatement(this.db, id, userId, "build.created", "build", id, `Created build ${input.name}`, {}, now),
    ];
    if (input.rppsRelease) {
      const passportId = crypto.randomUUID();
      statements.push(this.db.prepare(`INSERT INTO rpps_build_passports
        (id, release_id, build_id, stable_release_id, release_version, package_sha256, created_by_user_id, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`)
        .bind(passportId, input.rppsRelease.id, id, input.rppsRelease.stableReleaseId, input.rppsRelease.version,
          input.rppsRelease.packageSha256, userId, now));

      const passportItems = input.rppsRelease.manifest.components.map((component) => ({
        rowId: crypto.randomUUID(), stableId: component.id, name: component.name, quantity: component.quantity,
        unit: component.unit, manufacturer: component.manufacturer ?? null, mpn: component.mpn ?? null,
        notes: `Exact RPPS component ${component.id}${component.optional ? "; optional" : ""}${component.fabricated ? "; fabricated" : ""}`,
      }));
      if (passportItems.length > 0) {
        const itemJson = JSON.stringify(passportItems);
        statements.push(this.db.prepare(`INSERT INTO build_items
          (id, build_id, component_id, description, quantity, unit, status, notes, created_at, updated_at)
          SELECT json_extract(value, '$.rowId'), ?1,
            (SELECT c.id FROM components c LEFT JOIN manufacturers m ON m.id = c.manufacturer_id
              WHERE json_extract(value, '$.mpn') IS NOT NULL
                AND c.manufacturer_part_number = json_extract(value, '$.mpn')
                AND (json_extract(value, '$.manufacturer') IS NULL OR m.name = json_extract(value, '$.manufacturer') COLLATE NOCASE)
                AND c.deleted_at IS NULL AND c.is_demo = 0 LIMIT 1),
            json_extract(value, '$.name'), json_extract(value, '$.quantity'), json_extract(value, '$.unit'),
            'needed', json_extract(value, '$.notes'), ?2, ?2 FROM json_each(?3)`)
          .bind(id, now, itemJson));
        statements.push(this.db.prepare(`INSERT INTO rpps_build_passport_items (build_item_id, passport_id, component_stable_id)
          SELECT json_extract(value, '$.rowId'), ?1, json_extract(value, '$.stableId') FROM json_each(?2)`)
          .bind(passportId, itemJson));
      }

      const passportSteps: Array<{ rowId: string; procedureStableId: string; stepStableId: string; title: string; body: string; sortOrder: number; previousId: string | null }> = [];
      for (const procedure of input.rppsRelease.manifest.procedures) {
        let previousId: string | null = null;
        for (const [stepIndex, step] of procedure.steps.entries()) {
          const rowId = crypto.randomUUID();
          passportSteps.push({ rowId, procedureStableId: procedure.id, stepStableId: step.id,
            title: `${procedure.title} · ${stepIndex + 1}`, body: step.instruction,
            sortOrder: passportSteps.length, previousId });
          previousId = rowId;
        }
      }
      if (passportSteps.length > 0) {
        const stepJson = JSON.stringify(passportSteps);
        statements.push(this.db.prepare(`INSERT INTO build_steps
          (id, build_id, title, body, status, sort_order, created_at, updated_at)
          SELECT json_extract(value, '$.rowId'), ?1, json_extract(value, '$.title'), json_extract(value, '$.body'),
            'pending', json_extract(value, '$.sortOrder'), ?2, ?2 FROM json_each(?3)`)
          .bind(id, now, stepJson));
        statements.push(this.db.prepare(`INSERT INTO rpps_build_passport_steps
          (build_step_id, passport_id, procedure_stable_id, step_stable_id)
          SELECT json_extract(value, '$.rowId'), ?1, json_extract(value, '$.procedureStableId'),
            json_extract(value, '$.stepStableId') FROM json_each(?2)`)
          .bind(passportId, stepJson));
        statements.push(this.db.prepare(`INSERT INTO build_step_dependencies (build_step_id, depends_on_step_id)
          SELECT json_extract(value, '$.rowId'), json_extract(value, '$.previousId') FROM json_each(?1)
          WHERE json_extract(value, '$.previousId') IS NOT NULL`).bind(stepJson));
      }
      statements.push(activityStatement(this.db, id, userId, "build.rpps_passport.created", "rpps_release",
        input.rppsRelease.id, `Started exact RPPS release ${input.rppsRelease.version}`,
        { stableReleaseId: input.rppsRelease.stableReleaseId, packageSha256: input.rppsRelease.packageSha256 }, now));
    } else if (input.sourceProjectId) {
      const bomItems = await this.db.prepare(`SELECT bi.component_id, bi.description, bi.quantity, bi.unit,
        bi.selected_supplier_offer_id, bi.target_unit_price_minor, bi.notes
        FROM boms b
        JOIN bom_versions bv ON bv.id = b.current_version_id AND bv.publication_state IN ('verified', 'partial')
        JOIN bom_items bi ON bi.bom_version_id = b.current_version_id
        WHERE b.project_id = ?1`).bind(input.sourceProjectId).all<{ component_id: string | null; description: string; quantity: number; unit: string; selected_supplier_offer_id: string | null; target_unit_price_minor: number | null; notes: string | null }>();
      bomItems.results.forEach((item) => statements.push(this.db.prepare(`INSERT INTO build_items
        (id, build_id, component_id, selected_supplier_offer_id, description, quantity, unit, unit_cost_minor, status, notes, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'needed', ?9, ?10, ?10)`)
        .bind(crypto.randomUUID(), id, item.component_id, item.selected_supplier_offer_id, item.description, item.quantity, item.unit, item.target_unit_price_minor, item.notes, now)));
      const projectSteps = await this.db.prepare(`SELECT ps.id, ps.title, ps.body, ps.sort_order
        FROM projects p JOIN project_steps ps ON ps.project_version_id = p.current_version_id WHERE p.id = ?1 ORDER BY ps.sort_order`)
        .bind(input.sourceProjectId).all<{ id: string; title: string; body: string; sort_order: number }>();
      projectSteps.results.forEach((step) => statements.push(this.db.prepare(`INSERT INTO build_steps
        (id, build_id, source_project_step_id, title, body, status, sort_order, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6, ?7, ?7)`)
        .bind(crypto.randomUUID(), id, step.id, step.title, step.body, step.sort_order, now)));
    }
    await this.db.batch(statements);
    return (await this.detail(id))!;
  }

  async updateBuild(id: string, expectedVersion: number, input: { name?: string; description?: string | null; organizationId?: string | null; visibility?: BuildRow["visibility"]; status?: BuildRow["status"]; progressPercent?: number }): Promise<BuildDetail> {
    const current = await this.find(id);
    if (!current) throw new AppError(404, "BUILD_NOT_FOUND", "Build not found.");
    const result = await this.db.prepare(`UPDATE builds SET name = ?1, description = ?2, organization_id = ?3, visibility = ?4, status = ?5,
      progress_percent = ?6, version = version + 1, updated_at = ?7 WHERE id = ?8 AND version = ?9`)
      .bind(input.name ?? current.name, input.description === undefined ? current.description : input.description,
        input.organizationId === undefined ? current.organization_id : input.organizationId,
        input.visibility ?? current.visibility, input.status ?? current.status,
        input.progressPercent ?? current.progress_percent, new Date().toISOString(), id, expectedVersion).run();
    if (Number(result.meta.changes) < 1) throw new AppError(409, "BUILD_VERSION_CONFLICT", "The build changed; refresh and retry.");
    return (await this.detail(id))!;
  }

  async addItem(buildId: string, userId: string, input: { componentId?: string | null; description: string; quantity: number; unit?: string; selectedSupplierOfferId?: string | null; unitCostMinor?: number | null; notes?: string | null; substitutedForItemId?: string | null }): Promise<Record<string, unknown>> {
    if (input.componentId) {
      const component = await this.db.prepare("SELECT name FROM components WHERE id = ?1 AND deleted_at IS NULL AND is_demo = 0").bind(input.componentId).first();
      if (!component) throw new AppError(422, "COMPONENT_NOT_FOUND", "Component not found.");
    }
    if (input.selectedSupplierOfferId) {
      const offer = await this.db.prepare("SELECT id FROM supplier_offers WHERE id = ?1 AND is_demo = 0").bind(input.selectedSupplierOfferId).first();
      if (!offer) throw new AppError(422, "OFFER_NOT_FOUND", "Supplier offer not found.");
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.batch([
      this.db.prepare(`INSERT INTO build_items
        (id, build_id, component_id, selected_supplier_offer_id, description, quantity, unit, unit_cost_minor,
         status, substituted_for_item_id, notes, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'needed', ?9, ?10, ?11, ?11)`)
        .bind(id, buildId, input.componentId ?? null, input.selectedSupplierOfferId ?? null, input.description, input.quantity,
          input.unit ?? "each", input.unitCostMinor ?? null, input.substitutedForItemId ?? null, input.notes ?? null, now),
      activityStatement(this.db, buildId, userId, "build.item.added", "build_item", id, `Added ${input.description}`, input, now),
    ]);
    return (await this.detail(buildId))!.items.find((item) => item.id === id)!;
  }

  async updateItem(buildId: string, itemId: string, userId: string, input: { quantity?: number; selectedSupplierOfferId?: string | null; unitCostMinor?: number | null; status?: string; notes?: string | null }): Promise<Record<string, unknown>> {
    const current = await this.db.prepare("SELECT * FROM build_items WHERE id = ?1 AND build_id = ?2").bind(itemId, buildId).first<Record<string, unknown>>();
    if (!current) throw new AppError(404, "BUILD_ITEM_NOT_FOUND", "Build item not found.");
    const now = new Date().toISOString();
    await this.db.batch([
      this.db.prepare(`UPDATE build_items SET quantity = ?1, selected_supplier_offer_id = ?2, unit_cost_minor = ?3,
        status = ?4, notes = ?5, updated_at = ?6 WHERE id = ?7 AND build_id = ?8`)
        .bind(input.quantity ?? current.quantity, input.selectedSupplierOfferId === undefined ? current.selected_supplier_offer_id : input.selectedSupplierOfferId,
          input.unitCostMinor === undefined ? current.unit_cost_minor : input.unitCostMinor, input.status ?? current.status,
          input.notes === undefined ? current.notes : input.notes, now, itemId, buildId),
      activityStatement(this.db, buildId, userId, "build.item.updated", "build_item", itemId, "Updated build item", input, now),
    ]);
    return (await this.detail(buildId))!.items.find((item) => item.id === itemId)!;
  }

  async addStep(buildId: string, userId: string, input: { title: string; body?: string | null; dependsOn?: string[] }): Promise<Record<string, unknown>> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const max = await this.db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS value FROM build_steps WHERE build_id = ?1").bind(buildId).first<{ value: number }>();
    const statements = [this.db.prepare(`INSERT INTO build_steps
      (id, build_id, title, body, status, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'pending', ?5, ?6, ?6)`)
      .bind(id, buildId, input.title, input.body ?? null, Number(max?.value ?? -1) + 1, now)];
    for (const dependencyId of input.dependsOn ?? []) statements.push(this.db.prepare(`INSERT INTO build_step_dependencies
      (build_step_id, depends_on_step_id) SELECT ?1, id FROM build_steps WHERE id = ?2 AND build_id = ?3`).bind(id, dependencyId, buildId));
    statements.push(activityStatement(this.db, buildId, userId, "build.step.added", "build_step", id, `Added step ${input.title}`, {}, now));
    await this.db.batch(statements);
    return (await this.detail(buildId))!.steps.find((step) => step.id === id)!;
  }

  async updateStep(buildId: string, stepId: string, userId: string, input: { title?: string; body?: string | null; status?: string }): Promise<Record<string, unknown>> {
    const current = await this.db.prepare("SELECT * FROM build_steps WHERE id = ?1 AND build_id = ?2").bind(stepId, buildId).first<Record<string, unknown>>();
    if (!current) throw new AppError(404, "BUILD_STEP_NOT_FOUND", "Build step not found.");
    const now = new Date().toISOString();
    const nextStatus = input.status ?? String(current.status);
    const completedByUserId = nextStatus === "complete"
      ? (current.status === "complete" ? current.completed_by_user_id ?? userId : userId)
      : null;
    const completedAt = nextStatus === "complete"
      ? (current.status === "complete" ? current.completed_at ?? now : now)
      : null;
    await this.db.batch([
      this.db.prepare(`UPDATE build_steps SET title = ?1, body = ?2, status = ?3,
        completed_by_user_id = ?4, completed_at = ?5, updated_at = ?6 WHERE id = ?7 AND build_id = ?8`)
        .bind(input.title ?? current.title, input.body === undefined ? current.body : input.body, nextStatus, completedByUserId, completedAt, now, stepId, buildId),
      activityStatement(this.db, buildId, userId, "build.step.updated", "build_step", stepId, "Updated build step", input, now),
    ]);
    return (await this.detail(buildId))!.steps.find((step) => step.id === stepId)!;
  }

  async addConfiguration(buildId: string, userId: string, input: { name: string; format: string; contentText?: string | null; fileId?: string | null }): Promise<Record<string, unknown>> {
    if (input.fileId) await this.assertAttachedFile(buildId, input.fileId);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.batch([
      this.db.prepare(`INSERT INTO build_configurations
        (id, build_id, name, format, content_text, file_id, version, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?7)`)
        .bind(id, buildId, input.name, input.format, input.contentText ?? null, input.fileId ?? null, now),
      activityStatement(this.db, buildId, userId, "build.configuration.added", "build_configuration", id, `Added configuration ${input.name}`, { format: input.format, fileId: input.fileId ?? null }, now),
    ]);
    return (await this.detail(buildId))!.configurations.find((item) => item.id === id)!;
  }

  async addFirmware(buildId: string, userId: string, input: { name: string; repositoryUrl?: string | null; revision?: string | null; fileId?: string | null; licenseSpdx?: string | null; notes?: string | null }): Promise<Record<string, unknown>> {
    if (input.fileId) await this.assertAttachedFile(buildId, input.fileId);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.batch([
      this.db.prepare(`INSERT INTO build_firmware
        (id, build_id, name, repository_url, revision, file_id, license_spdx, notes, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`)
        .bind(id, buildId, input.name, input.repositoryUrl ?? null, input.revision ?? null, input.fileId ?? null, input.licenseSpdx ?? null, input.notes ?? null, now),
      activityStatement(this.db, buildId, userId, "build.firmware.added", "build_firmware", id, `Added firmware ${input.name}`, { revision: input.revision ?? null, fileId: input.fileId ?? null }, now),
    ]);
    return (await this.detail(buildId))!.firmware.find((item) => item.id === id)!;
  }

  async addCalibration(buildId: string, userId: string, input: { name: string; procedureText?: string | null; resultData: Record<string, unknown>; status: string }): Promise<Record<string, unknown>> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const performedAt = input.status === "pending" ? null : now;
    await this.db.batch([
      this.db.prepare(`INSERT INTO build_calibrations
        (id, build_id, name, procedure_text, result_json, status, performed_by_user_id, performed_at, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`)
        .bind(id, buildId, input.name, input.procedureText ?? null, JSON.stringify(input.resultData), input.status, performedAt ? userId : null, performedAt, now),
      activityStatement(this.db, buildId, userId, "build.calibration.added", "build_calibration", id, `Recorded calibration ${input.name}`, { status: input.status }, now),
    ]);
    return (await this.detail(buildId))!.calibrations.find((item) => item.id === id)!;
  }

  async addTest(buildId: string, userId: string, input: { name: string; methodText: string; expectedText?: string | null; observedText?: string | null; result: string; evidenceFileId?: string | null }): Promise<Record<string, unknown>> {
    if (input.evidenceFileId) await this.assertAttachedFile(buildId, input.evidenceFileId);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const performedAt = input.result === "pending" ? null : now;
    await this.db.batch([
      this.db.prepare(`INSERT INTO build_tests
        (id, build_id, name, method_text, expected_text, observed_text, result, evidence_file_id,
         performed_by_user_id, performed_at, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`)
        .bind(id, buildId, input.name, input.methodText, input.expectedText ?? null, input.observedText ?? null,
          input.result, input.evidenceFileId ?? null, performedAt ? userId : null, performedAt, now),
      activityStatement(this.db, buildId, userId, "build.test.added", "build_test", id, `Recorded test ${input.name}`, { result: input.result, evidenceFileId: input.evidenceFileId ?? null }, now),
    ]);
    return (await this.detail(buildId))!.tests.find((item) => item.id === id)!;
  }

  async deleteTechnicalRecord(buildId: string, userId: string, type: "configuration" | "firmware" | "calibration" | "test", id: string): Promise<void> {
    const tables = { configuration: "build_configurations", firmware: "build_firmware", calibration: "build_calibrations", test: "build_tests" } as const;
    const table = tables[type];
    const existing = await this.db.prepare(`SELECT name FROM ${table} WHERE id = ?1 AND build_id = ?2`).bind(id, buildId).first<{ name: string }>();
    if (!existing) throw new AppError(404, "BUILD_RECORD_NOT_FOUND", "Build technical record not found.");
    const now = new Date().toISOString();
    await this.db.batch([
      this.db.prepare(`DELETE FROM ${table} WHERE id = ?1 AND build_id = ?2`).bind(id, buildId),
      activityStatement(this.db, buildId, userId, `build.${type}.deleted`, `build_${type}`, id, `Deleted ${type} ${existing.name}`, {}, now),
    ]);
  }

  private async assertAttachedFile(buildId: string, fileId: string): Promise<void> {
    const file = await this.db.prepare(`SELECT 1 FROM build_files bf JOIN files f ON f.id = bf.file_id
      WHERE bf.build_id = ?1 AND bf.file_id = ?2 AND f.status = 'ready' AND f.deleted_at IS NULL`).bind(buildId, fileId).first();
    if (!file) throw new AppError(422, "BUILD_FILE_REQUIRED", "The file must be ready and attached to this build first.");
  }

  async createSnapshot(buildId: string, userId: string, summary: string): Promise<void> {
    const detail = await this.detail(buildId);
    if (!detail) throw new AppError(404, "BUILD_NOT_FOUND", "Build not found.");
    const count = await this.db.prepare("SELECT COALESCE(MAX(version_number), 0) AS value FROM build_versions WHERE build_id = ?1").bind(buildId).first<{ value: number }>();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.batch([
      this.db.prepare(`INSERT INTO build_versions (id, build_id, version_number, summary, snapshot_json, created_by_user_id, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`).bind(id, buildId, Number(count?.value ?? 0) + 1, summary, JSON.stringify(detail), userId, now),
      this.db.prepare("UPDATE builds SET current_version_id = ?1, updated_at = ?2, version = version + 1 WHERE id = ?3").bind(id, now, buildId),
    ]);
  }
}

function activityStatement(db: D1Database, buildId: string, userId: string, eventType: string, entityType: string, entityId: string, summary: string, metadata: unknown, now: string) {
  return db.prepare(`INSERT INTO build_activity
    (id, build_id, actor_user_id, event_type, entity_type, entity_id, summary, metadata_json, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`)
    .bind(crypto.randomUUID(), buildId, userId, eventType, entityType, entityId, summary, JSON.stringify(metadata), now);
}

function slugify(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s-]/gu, "").trim().replace(/\s+/gu, "-").replace(/-+/gu, "-").slice(0, 70) || "build";
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
