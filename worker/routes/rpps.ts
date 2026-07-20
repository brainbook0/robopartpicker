import { Hono } from "hono";
import { z } from "zod";
import {
  parsePortableRpps,
  parsePortableRppsLock,
  stringifyPortableRpps,
  stringifyPortableRppsLock,
  validatePortableRpps,
} from "../../src/lib/rpps/portable";
import type { PortableRppsManifest } from "../../src/lib/rpps/portable";
import { RppsReleasesRepository } from "../db/repositories/rpps-releases";
import { BuildsRepository } from "../db/repositories/builds";
import type { AppBindings } from "../env";
import { AppError } from "../http";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { assertOrganizationPermission, assertScopedRead, assertScopedWrite, authenticatedUserId, organizationRole } from "../middleware/authorization";
import { recordAuditEvent } from "../services/audit";
import { parseJson } from "../validation";
import { ProjectsRepository } from "../db/repositories/projects";

const packageSchema = z.object({
  manifest: z.string().min(1).max(1_048_576),
  lockfile: z.string().max(1_048_576).optional(),
}).strict();
const releaseSchema = packageSchema.extend({ status: z.enum(["draft", "published"]).default("draft") }).strict();
const stableId = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9:._/-]*$/u);
const buildPassportSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  organizationId: z.string().uuid().nullable().optional(),
  visibility: z.enum(["private", "organization", "unlisted", "public"]).default("private"),
}).strict();
const scalar = z.union([z.string().max(4_000), z.number().finite(), z.boolean(), z.null()]);
const conditions = z.record(z.string().trim().min(1).max(100), scalar).superRefine((value, context) => {
  if (Object.keys(value).length > 50) context.addIssue({ code: "custom", message: "At most 50 build conditions may be recorded." });
  if (JSON.stringify(value).length > 20_000) context.addIssue({ code: "custom", message: "Build conditions exceed 20 KB." });
});
const outcomeSchema = z.object({
  buildId: z.string().uuid(),
  outcome: z.enum(["succeeded", "partially_succeeded", "failed", "abandoned"]),
  summary: z.string().trim().min(20).max(4_000),
  conditions: conditions.default({}),
  evidenceFileIds: z.array(z.string().uuid()).max(20).default([]),
}).strict();
const rationale = z.string().trim().min(10).max(8_000);
const proposalSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("substitute_component"), targetComponentId: stableId,
    replacement: z.object({ name: z.string().trim().min(1).max(500), manufacturer: z.string().trim().max(160).optional(), mpn: z.string().trim().max(160).optional(), revision: z.string().trim().max(160).optional() }).strict(),
    rationale, evidenceRefs: z.array(stableId).max(100).default([]) }).strict(),
  z.object({ type: z.literal("correct_component_identity"), targetComponentId: stableId,
    manufacturer: z.string().trim().min(1).max(160), mpn: z.string().trim().min(1).max(160), revision: z.string().trim().max(160).optional(), rationale }).strict(),
  z.object({ type: z.literal("add_assembly_step"), procedureId: stableId, afterStepId: stableId.optional(),
    step: z.object({ id: stableId, instruction: z.string().trim().min(1).max(20_000) }).strict(), rationale }).strict(),
  z.object({ type: z.literal("change_configuration"), targetObjectId: stableId, parameter: z.string().trim().min(1).max(300), proposedValue: scalar, rationale }).strict(),
  z.object({ type: z.literal("add_compatibility_condition"), interfaceId: stableId, condition: z.string().trim().min(1).max(4_000), evidenceRefs: z.array(stableId).max(100).default([]), rationale }).strict(),
  z.object({ type: z.literal("attach_test_evidence"), testId: stableId.optional(), evidenceId: stableId, result: z.enum(["passed", "failed", "inconclusive"]), notes: z.string().trim().max(4_000).optional() }).strict(),
  z.object({ type: z.literal("introduce_variant"), name: z.string().trim().min(1).max(500), baseAssemblyId: stableId.optional(),
    changes: z.array(z.object({ targetObjectId: stableId, summary: z.string().trim().min(1).max(1_000) }).strict()).min(1).max(100), rationale }).strict(),
  z.object({ type: z.literal("withdraw_claim"), evidenceId: stableId, rationale }).strict(),
  z.object({ type: z.literal("backport_fix"), sourceReleaseId: stableId, targetObjectId: stableId, summary: z.string().trim().min(10).max(4_000) }).strict(),
]).superRefine((value, context) => {
  if (JSON.stringify(value).length > 64_000) context.addIssue({ code: "custom", message: "The structured proposal exceeds 64 KB." });
});
const reviewProposalSchema = z.object({ action: z.enum(["accept", "reject", "withdraw"]), note: z.string().trim().max(4_000).optional() }).strict();

export const rppsRoutes = new Hono<AppBindings>();

rppsRoutes.post("/rpps/validate", async (c) => {
  const body = await parseJson(c, packageSchema);
  const parsed = parseManifest(body.manifest);
  const lock = body.lockfile ? parseLock(body.lockfile) : undefined;
  if (lock && (lock.release.id !== parsed.release.id || lock.release.version !== parsed.release.version)) {
    throw new AppError(422, "RPPS_LOCK_MISMATCH", "The lockfile must identify the same release ID and version as the manifest.");
  }
  return c.json({ manifest: parsed, normalizedManifest: stringifyPortableRpps(parsed), lockfile: lock, report: validatePortableRpps(parsed, lock) });
});

rppsRoutes.get("/projects/:id/releases", loadAuthSession, async (c) => {
  const userId = c.get("authSession")?.user?.id ?? null;
  const project = await projectForRead(c.env.DB, c.req.param("id"), userId);
  const items = await new RppsReleasesRepository(c.env.DB).list(project.row.id, !(await canManageProject(c.env.DB, project.row, userId)));
  return c.json({ items, total: items.length });
});

rppsRoutes.get("/projects/:id/releases/:releaseId", loadAuthSession, async (c) => {
  const userId = c.get("authSession")?.user?.id ?? null;
  const project = await projectForRead(c.env.DB, c.req.param("id"), userId);
  const item = await new RppsReleasesRepository(c.env.DB).find(project.row.id, c.req.param("releaseId"), !(await canManageProject(c.env.DB, project.row, userId)));
  if (!item) throw new AppError(404, "RPPS_RELEASE_NOT_FOUND", "RPPS release not found.");
  return c.json({ item });
});

rppsRoutes.post("/projects/:id/releases", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const projects = new ProjectsRepository(c.env.DB);
  const project = await projects.find(c.req.param("id"));
  if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  await assertScopedWrite(c.env.DB, userId, project.row, "engineer");
  const body = await parseJson(c, releaseSchema);
  const manifest = parseManifest(body.manifest);
  const lock = body.lockfile ? parseLock(body.lockfile) : undefined;
  if (lock && (lock.release.id !== manifest.release.id || lock.release.version !== manifest.release.version)) {
    throw new AppError(422, "RPPS_LOCK_MISMATCH", "The lockfile must identify the same release ID and version as the manifest.");
  }
  const report = validatePortableRpps(manifest, lock);
  const normalizedManifest = stringifyPortableRpps(manifest);
  const normalizedLock = lock ? stringifyPortableRppsLock(lock) : undefined;
  const manifestSha256 = await sha256(normalizedManifest);
  const packageSha256 = await sha256(`${normalizedManifest}\n---rpps-lock---\n${normalizedLock ?? ""}`);
  let item;
  try {
    item = await new RppsReleasesRepository(c.env.DB).create({
      projectId: project.row.id,
      actorUserId: userId,
      manifest,
      manifestYaml: normalizedManifest,
      lock,
      lockYaml: normalizedLock,
      manifestSha256,
      packageSha256,
      report,
      status: body.status,
    });
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw new AppError(409, "RPPS_RELEASE_EXISTS", "That stable release ID or version already exists for this project.");
    throw error;
  }
  await recordAuditEvent(c.env.DB, {
    actorUserId: userId,
    organizationId: project.row.organization_id,
    action: "project.rpps_release.create",
    entityType: "rpps_release",
    entityId: item.id,
    requestId: c.get("requestId"),
    after: { projectId: project.row.id, stableReleaseId: item.stableReleaseId, version: item.version, packageSha256, status: item.status },
  });
  return c.json({ item }, 201);
});

rppsRoutes.post("/projects/:id/releases/:releaseId/publish", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const projects = new ProjectsRepository(c.env.DB);
  const project = await projects.find(c.req.param("id"));
  if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  await assertScopedWrite(c.env.DB, userId, project.row, "engineer");
  const result = await c.env.DB.prepare(`UPDATE rpps_releases SET status = 'published', published_at = ?1
    WHERE id = ?2 AND project_id = ?3 AND status = 'draft'`)
    .bind(new Date().toISOString(), c.req.param("releaseId"), project.row.id).run();
  if (Number(result.meta.changes) !== 1) throw new AppError(409, "RPPS_RELEASE_NOT_DRAFT", "Only an existing draft release can be published.");
  const item = await new RppsReleasesRepository(c.env.DB).find(project.row.id, c.req.param("releaseId"));
  await recordAuditEvent(c.env.DB, { actorUserId: userId, organizationId: project.row.organization_id,
    action: "project.rpps_release.publish", entityType: "rpps_release", entityId: c.req.param("releaseId"), requestId: c.get("requestId") });
  return c.json({ item });
});

rppsRoutes.post("/projects/:id/releases/:releaseId/build-passports", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, buildPassportSchema);
  const project = await projectForRead(c.env.DB, c.req.param("id"), userId);
  const release = await new RppsReleasesRepository(c.env.DB).find(project.row.id, c.req.param("releaseId"), true);
  if (!release) throw new AppError(404, "PUBLISHED_RPPS_RELEASE_NOT_FOUND", "A published RPPS release was not found.");
  if (body.organizationId) await assertOrganizationPermission(c.env.DB, userId, body.organizationId, "build");
  if (body.visibility === "organization" && !body.organizationId) throw new AppError(422, "ORGANIZATION_REQUIRED", "Organization visibility requires an organization.");
  const manifest = parseManifest(release.manifest);
  const totalSteps = manifest.procedures.reduce((sum, procedure) => sum + procedure.steps.length, 0);
  if (manifest.components.length > 2_000 || totalSteps > 2_000) throw new AppError(422, "RPPS_BUILD_EXPANSION_TOO_LARGE", "This release exceeds the 2,000-item or 2,000-step build-passport limit.");
  const item = await new BuildsRepository(c.env.DB).create(userId, {
    name: body.name ?? `${manifest.project.name} ${release.version} build`,
    organizationId: body.organizationId ?? null,
    sourceProjectId: project.row.id,
    visibility: body.visibility,
    rppsRelease: { id: release.id, stableReleaseId: release.stableReleaseId, version: release.version,
      packageSha256: release.packageSha256, manifest },
  });
  await recordAuditEvent(c.env.DB, { actorUserId: userId, organizationId: body.organizationId ?? null,
    action: "rpps.build_passport.create", entityType: "build", entityId: item.id, requestId: c.get("requestId"),
    after: { releaseId: release.id, stableReleaseId: release.stableReleaseId, packageSha256: release.packageSha256 } });
  return c.json({ item, passport: { releaseId: release.id, stableReleaseId: release.stableReleaseId,
    version: release.version, packageSha256: release.packageSha256 } }, 201);
});

rppsRoutes.get("/projects/:id/releases/:releaseId/collaboration", loadAuthSession, async (c) => {
  const userId = c.get("authSession")?.user?.id ?? null;
  const { project, release, manager } = await collaborationRelease(c.env.DB, c.req.param("id"), c.req.param("releaseId"), userId);
  const rows = await c.env.DB.prepare(`SELECT o.id, o.outcome, o.independence, o.conditions_json, o.summary,
      o.submitted_at, CASE WHEN b.visibility IN ('public', 'unlisted') OR b.owner_user_id = ?1
        OR EXISTS (SELECT 1 FROM build_members bm WHERE bm.build_id = b.id AND bm.user_id = ?1)
        OR EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = b.organization_id AND om.user_id = ?1 AND om.status = 'active')
        THEN o.build_id ELSE NULL END AS visible_build_id,
      (SELECT COUNT(*) FROM rpps_build_outcome_evidence roe WHERE roe.outcome_id = o.id) AS evidence_count
    FROM rpps_build_outcomes o LEFT JOIN builds b ON b.id = o.build_id
    WHERE o.release_id = ?2 ORDER BY o.submitted_at DESC`).bind(userId, release.id).all<{
      id: string; outcome: string; independence: string; conditions_json: string; summary: string | null;
      submitted_at: string; visible_build_id: string | null; evidence_count: number;
    }>();
  const proposals = await listProposals(c.env.DB, release.id, userId, manager);
  const succeededMaintainer = rows.results.filter((row) => row.outcome === "succeeded" && row.independence === "maintainer").length;
  const succeededIndependent = rows.results.filter((row) => row.outcome === "succeeded" && row.independence === "independent").length;
  const achieved = [
    ...(release.report.profiles.core.conformant ? ["structured"] : []),
    ...(succeededMaintainer > 0 ? ["tested"] : []),
    ...(succeededIndependent > 0 ? ["reproduced"] : []),
    ...(succeededIndependent > 1 ? ["repeated"] : []),
  ];
  let eligibleBuilds: Array<{ id: string; slug: string; name: string; status: string }> = [];
  if (userId) {
    const eligible = await c.env.DB.prepare(`SELECT b.id, b.slug, b.name, b.status FROM rpps_build_passports bp
      JOIN builds b ON b.id = bp.build_id
      WHERE bp.release_id = ?1 AND b.deleted_at IS NULL
        AND (b.owner_user_id = ?2 OR EXISTS (SELECT 1 FROM build_members bm WHERE bm.build_id = b.id AND bm.user_id = ?2 AND bm.role IN ('owner', 'editor')))
        AND NOT EXISTS (SELECT 1 FROM rpps_build_outcomes o WHERE o.release_id = bp.release_id AND o.build_id = b.id)
      ORDER BY b.updated_at DESC`).bind(release.id, userId).all<{ id: string; slug: string; name: string; status: string }>();
    eligibleBuilds = eligible.results;
  }
  return c.json({ release: { id: release.id, version: release.version, packageSha256: release.packageSha256 },
    evidence: { achieved, current: false, succeededMaintainer, succeededIndependent },
    outcomes: rows.results.map((row) => ({ id: row.id, outcome: row.outcome, independence: row.independence,
      conditions: JSON.parse(row.conditions_json), summary: row.summary, submittedAt: row.submitted_at,
      buildId: row.visible_build_id, evidenceCount: Number(row.evidence_count) })),
    proposals, eligibleBuilds, canManage: manager, projectId: project.row.id });
});

rppsRoutes.post("/projects/:id/releases/:releaseId/outcomes", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, outcomeSchema);
  const { project, release } = await collaborationRelease(c.env.DB, c.req.param("id"), c.req.param("releaseId"), userId);
  const builds = new BuildsRepository(c.env.DB);
  const build = await builds.find(body.buildId);
  if (!build) throw new AppError(404, "BUILD_NOT_FOUND", "Build not found.");
  await assertScopedWrite(c.env.DB, userId, build, "build");
  const passport = await c.env.DB.prepare("SELECT id FROM rpps_build_passports WHERE release_id = ?1 AND build_id = ?2")
    .bind(release.id, build.id).first<{ id: string }>();
  if (!passport) throw new AppError(422, "BUILD_RELEASE_MISMATCH", "The build passport is not tied to this exact release.");
  if (body.outcome !== "abandoned") {
    const evidence = await c.env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM build_tests WHERE build_id = ?1) +
      (SELECT COUNT(*) FROM build_problems WHERE build_id = ?1) +
      (SELECT COUNT(*) FROM build_files WHERE build_id = ?1) AS value`).bind(build.id).first<{ value: number }>();
    if (Number(evidence?.value ?? 0) < 1) throw new AppError(422, "BUILD_EVIDENCE_REQUIRED", "Record at least one test, problem, or attached file before submitting this outcome.");
  }
  if (body.evidenceFileIds.length > 0) {
    const placeholders = body.evidenceFileIds.map((_, index) => `?${index + 2}`).join(", ");
    const attached = await c.env.DB.prepare(`SELECT COUNT(*) AS value FROM build_files
      WHERE build_id = ?1 AND file_id IN (${placeholders})`).bind(build.id, ...body.evidenceFileIds).first<{ value: number }>();
    if (Number(attached?.value) !== body.evidenceFileIds.length) throw new AppError(422, "OUTCOME_EVIDENCE_NOT_ATTACHED", "Every outcome evidence file must already be attached to the build.");
  }
  const maintainer = await c.env.DB.prepare("SELECT 1 AS value FROM project_maintainers WHERE project_id = ?1 AND user_id = ?2")
    .bind(project.row.id, userId).first();
  const independence = maintainer ? "maintainer" : "independent";
  const outcomeId = crypto.randomUUID();
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [c.env.DB.prepare(`INSERT INTO rpps_build_outcomes
    (id, release_id, build_id, outcome, independence, conditions_json, summary, submitted_by_user_id, submitted_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`)
    .bind(outcomeId, release.id, build.id, body.outcome, independence, JSON.stringify(body.conditions), body.summary, userId, now)];
  if (body.evidenceFileIds.length > 0) statements.push(c.env.DB.prepare(`INSERT INTO rpps_build_outcome_evidence (outcome_id, file_id, created_at)
    SELECT ?1, value, ?2 FROM json_each(?3)`).bind(outcomeId, now, JSON.stringify(body.evidenceFileIds)));
  try { await c.env.DB.batch(statements); }
  catch (error) { if (String(error).includes("UNIQUE")) throw new AppError(409, "BUILD_OUTCOME_EXISTS", "This build already has an outcome for the release."); throw error; }
  await recordAuditEvent(c.env.DB, { actorUserId: userId, organizationId: build.organization_id,
    action: "rpps.build_outcome.submit", entityType: "rpps_build_outcome", entityId: outcomeId, requestId: c.get("requestId"),
    after: { releaseId: release.id, buildId: build.id, outcome: body.outcome, independence } });
  return c.json({ item: { id: outcomeId, releaseId: release.id, buildId: build.id, outcome: body.outcome,
    independence, conditions: body.conditions, summary: body.summary, submittedAt: now, evidenceCount: body.evidenceFileIds.length } }, 201);
});

rppsRoutes.post("/projects/:id/releases/:releaseId/proposals", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const payload = await parseJson(c, proposalSchema);
  const { project, release } = await collaborationRelease(c.env.DB, c.req.param("id"), c.req.param("releaseId"), userId);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(`INSERT INTO rpps_change_proposals
    (id, project_id, target_release_id, proposal_type, status, payload_json, created_by_user_id, created_at)
    VALUES (?1, ?2, ?3, ?4, 'open', ?5, ?6, ?7)`)
    .bind(id, project.row.id, release.id, payload.type, JSON.stringify(payload), userId, now).run();
  await recordAuditEvent(c.env.DB, { actorUserId: userId, action: "rpps.change_proposal.create",
    entityType: "rpps_change_proposal", entityId: id, requestId: c.get("requestId"), after: { releaseId: release.id, type: payload.type } });
  return c.json({ item: { id, releaseId: release.id, type: payload.type, status: "open", payload, createdByUserId: userId, createdAt: now } }, 201);
});

rppsRoutes.patch("/projects/:id/releases/:releaseId/proposals/:proposalId", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, reviewProposalSchema);
  const { project, release, manager } = await collaborationRelease(c.env.DB, c.req.param("id"), c.req.param("releaseId"), userId);
  const proposal = await c.env.DB.prepare("SELECT id, created_by_user_id FROM rpps_change_proposals WHERE id = ?1 AND project_id = ?2 AND target_release_id = ?3 AND status = 'open'")
    .bind(c.req.param("proposalId"), project.row.id, release.id).first<{ id: string; created_by_user_id: string }>();
  if (!proposal) throw new AppError(404, "OPEN_RPPS_PROPOSAL_NOT_FOUND", "Open change proposal not found.");
  if (body.action === "withdraw" ? proposal.created_by_user_id !== userId : !manager) {
    throw new AppError(403, "RPPS_PROPOSAL_REVIEW_DENIED", body.action === "withdraw" ? "Only the proposal author can withdraw it." : "Only a project maintainer can review proposals.");
  }
  const status = body.action === "accept" ? "accepted" : body.action === "reject" ? "rejected" : "withdrawn";
  const now = new Date().toISOString();
  const result = await c.env.DB.prepare(`UPDATE rpps_change_proposals SET status = ?1, reviewed_by_user_id = ?2,
    reviewed_at = ?3, review_note = ?4 WHERE id = ?5 AND status = 'open'`)
    .bind(status, body.action === "withdraw" ? null : userId, now, body.note ?? null, proposal.id).run();
  if (Number(result.meta.changes) !== 1) throw new AppError(409, "RPPS_PROPOSAL_CHANGED", "The proposal was already reviewed.");
  await recordAuditEvent(c.env.DB, { actorUserId: userId, action: `rpps.change_proposal.${status}`,
    entityType: "rpps_change_proposal", entityId: proposal.id, requestId: c.get("requestId"), after: { status, note: body.note ?? null } });
  return c.json({ item: { id: proposal.id, status, reviewNote: body.note ?? null, reviewedAt: now } });
});

rppsRoutes.get("/projects/:id/releases/:releaseId/diff", loadAuthSession, async (c) => {
  const againstId = c.req.query("against")?.trim();
  if (!againstId) throw new AppError(422, "RPPS_DIFF_BASE_REQUIRED", "Provide the base release in the against query parameter.");
  const userId = c.get("authSession")?.user?.id ?? null;
  const project = await projectForRead(c.env.DB, c.req.param("id"), userId);
  const manager = await canManageProject(c.env.DB, project.row, userId);
  const repository = new RppsReleasesRepository(c.env.DB);
  const [from, to] = await Promise.all([
    repository.find(project.row.id, againstId, !manager),
    repository.find(project.row.id, c.req.param("releaseId"), !manager),
  ]);
  if (!from || !to) throw new AppError(404, "RPPS_DIFF_RELEASE_NOT_FOUND", "Both readable releases are required for a semantic diff.");
  return c.json({ from: { id: from.id, version: from.version, packageSha256: from.packageSha256 },
    to: { id: to.id, version: to.version, packageSha256: to.packageSha256 },
    collections: semanticDiff(parseManifest(from.manifest), parseManifest(to.manifest)) });
});

function parseManifest(value: string) {
  const result = parsePortableRpps(value);
  if (result.ok === false) throw new AppError(422, "INVALID_RPPS_MANIFEST", "The RPPS manifest is invalid.", result.errors.map((message) => ({ message })));
  return result.data;
}

function parseLock(value: string) {
  const result = parsePortableRppsLock(value);
  if (result.ok === false) throw new AppError(422, "INVALID_RPPS_LOCKFILE", "The RPPS lockfile is invalid.", result.errors.map((message) => ({ message })));
  return result.data;
}

async function projectForRead(db: D1Database, id: string, userId: string | null) {
  const project = await new ProjectsRepository(db).find(id);
  if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  await assertScopedRead(db, userId, project.row);
  return project;
}

async function canManageProject(db: D1Database, row: { owner_user_id: string | null; organization_id: string | null }, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  if (row.owner_user_id === userId) return true;
  return Boolean(row.organization_id && await organizationRole(db, userId, row.organization_id));
}

async function collaborationRelease(db: D1Database, projectId: string, releaseId: string, userId: string | null) {
  const project = await projectForRead(db, projectId, userId);
  const manager = await canManageProject(db, project.row, userId);
  const release = await new RppsReleasesRepository(db).find(project.row.id, releaseId, !manager);
  if (!release) throw new AppError(404, "RPPS_RELEASE_NOT_FOUND", "A readable RPPS release was not found.");
  return { project, release, manager };
}

async function listProposals(db: D1Database, releaseId: string, userId: string | null, manager: boolean) {
  const rows = await db.prepare(`SELECT id, proposal_type, status, payload_json, created_by_user_id,
      reviewed_by_user_id, review_note, created_at, reviewed_at
    FROM rpps_change_proposals WHERE target_release_id = ?1
      AND (?2 = 1 OR status IN ('open', 'accepted') OR created_by_user_id = ?3)
    ORDER BY created_at DESC LIMIT 200`).bind(releaseId, manager ? 1 : 0, userId).all<{
      id: string; proposal_type: string; status: string; payload_json: string; created_by_user_id: string;
      reviewed_by_user_id: string | null; review_note: string | null; created_at: string; reviewed_at: string | null;
    }>();
  return rows.results.map((row) => ({ id: row.id, type: row.proposal_type, status: row.status,
    payload: JSON.parse(row.payload_json), createdByUserId: row.created_by_user_id,
    reviewedByUserId: row.reviewed_by_user_id, reviewNote: row.review_note,
    createdAt: row.created_at, reviewedAt: row.reviewed_at }));
}

type DiffableCollection = "artifacts" | "components" | "assemblies" | "interfaces" | "procedures" | "tests" | "evidence";

function semanticDiff(from: PortableRppsManifest, to: PortableRppsManifest) {
  const collections: DiffableCollection[] = ["artifacts", "components", "assemblies", "interfaces", "procedures", "tests", "evidence"];
  return Object.fromEntries(collections.map((collection) => {
    const previous = new Map(from[collection].map((item) => [item.id, item as Record<string, unknown>]));
    const next = new Map(to[collection].map((item) => [item.id, item as Record<string, unknown>]));
    const added = [...next.keys()].filter((id) => !previous.has(id)).sort();
    const removed = [...previous.keys()].filter((id) => !next.has(id)).sort();
    const changed = [...next.entries()].flatMap(([id, value]) => {
      const before = previous.get(id);
      if (!before) return [];
      const fields = Array.from(new Set([...Object.keys(before), ...Object.keys(value)]))
        .filter((field) => canonicalJson(before[field]) !== canonicalJson(value[field])).sort();
      return fields.length > 0 ? [{ id, fields }] : [];
    });
    return [collection, { added, removed, changed }];
  }));
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
