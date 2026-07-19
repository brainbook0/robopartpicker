import { Hono } from "hono";
import { z } from "zod";
import { RppsPackage } from "../../src/lib/rpps/schema";
import type { AppBindings } from "../env";
import { ProjectsRepository } from "../db/repositories/projects";
import { AppError, parsePositiveInt } from "../http";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { assertOrganizationPermission, assertScopedRead, assertScopedWrite, authenticatedUserId } from "../middleware/authorization";
import { parseJson } from "../validation";
import { recordAuditEvent } from "../services/audit";

const createSchema = z.object({
  visibility: z.enum(["private", "organization", "unlisted", "public"]).default("public"),
  organizationId: z.string().uuid().nullable().optional(),
  rpps: RppsPackage,
}).strict();
const rppsUpdateSchema = z.object({ version: z.number().int().positive(), rpps: RppsPackage }).strict();
const scopeUpdateSchema = z.object({
  version: z.number().int().positive(),
  organizationId: z.string().uuid().nullable().optional(),
  visibility: z.enum(["private", "organization", "unlisted", "public"]).optional(),
}).strict().refine((value) => value.organizationId !== undefined || value.visibility !== undefined, {
  message: "An organization or visibility change is required.",
});
const repositoryImportSchema = z.object({ repositoryUrl: z.string().url().max(2_048) }).strict();

export const projectRoutes = new Hono<AppBindings>();

projectRoutes.get("/projects", loadAuthSession, async (c) => {
  const userId = c.get("authSession")?.user?.id ?? null;
  const limit = parsePositiveInt(c.req.query("limit"), 50, 100);
  const page = parsePositiveInt(c.req.query("page"), 1, 10_000);
  const result = await new ProjectsRepository(c.env.DB).listVisible(userId, {
    q: c.req.query("q")?.trim().slice(0, 100) || undefined,
    mine: c.req.query("mine") === "true",
    limit,
    offset: (page - 1) * limit,
  });
  return c.json({ ...result, page, limit, pages: Math.max(1, Math.ceil(result.total / limit)) });
});

projectRoutes.post("/projects/import/repository", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const { repositoryUrl } = await parseJson(c, repositoryImportSchema);
  const match = new URL(repositoryUrl).pathname.match(/^\/([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})(?:\.git)?\/?$/u);
  const parsed = new URL(repositoryUrl);
  if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== "github.com" || !match) {
    throw new AppError(422, "UNSUPPORTED_REPOSITORY_URL", "Only canonical HTTPS GitHub repository URLs are supported.");
  }
  const owner = match[1];
  const repository = match[2].replace(/\.git$/u, "");
  const apiHeaders = new Headers({ Accept: "application/vnd.github+json", "User-Agent": "RoboPartPicker-Worker" });
  if (c.env.GITHUB_TOKEN) apiHeaders.set("Authorization", `Bearer ${c.env.GITHUB_TOKEN}`);
  const metadataResponse = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`, { headers: apiHeaders, redirect: "error" });
  if (!metadataResponse.ok) throw new AppError(502, "REPOSITORY_PROVIDER_ERROR", `GitHub returned ${metadataResponse.status}.`);
  const metadata = await metadataResponse.json() as Record<string, unknown>;
  let readme = "";
  const readmeHeaders = new Headers(apiHeaders);
  readmeHeaders.set("Accept", "application/vnd.github.raw+json");
  const readmeResponse = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/readme`, { headers: readmeHeaders, redirect: "error" });
  if (readmeResponse.ok) readme = (await readmeResponse.text()).slice(0, 50_000);

  const now = new Date().toISOString();
  const sourceId = "source-github-repository";
  const jobId = crypto.randomUUID();
  const recordId = crypto.randomUUID();
  const externalId = `${owner}/${repository}`;
  const raw = JSON.stringify({ metadata, readme });
  const title = typeof metadata.name === "string" ? metadata.name : repository;
  const summary = typeof metadata.description === "string" ? metadata.description.slice(0, 280) : firstMeaningfulReadmeLine(readme).slice(0, 280);
  const draft = {
    name: title,
    slug: slugify(`${owner}-${repository}`),
    summary,
    description: readme.slice(0, 8_000) || summary,
    repo_url: typeof metadata.html_url === "string" ? metadata.html_url : repositoryUrl,
    license: isRecord(metadata.license) && typeof metadata.license.spdx_id === "string" ? metadata.license.spdx_id : undefined,
    tags: Array.isArray(metadata.topics) ? metadata.topics.filter((topic): topic is string => typeof topic === "string").slice(0, 20) : [],
    cover_image_url: isRecord(metadata.owner) && typeof metadata.owner.avatar_url === "string" ? metadata.owner.avatar_url : undefined,
  };
  const fingerprint = await sha256(`${externalId}\n${raw}`);
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO import_sources (id, slug, name, source_type, base_url, priority, trust_weight, status, created_at, updated_at)
      VALUES (?1, 'github-repository', 'GitHub repository import', 'repository', 'https://github.com', 100, 0.65, 'active', ?2, ?2)
      ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`).bind(sourceId, now),
    c.env.DB.prepare(`INSERT INTO import_jobs
      (id, source_id, batch_id, idempotency_key, schema_version, status, retrieval_timestamp, payload_hash,
       accepted_count, rejected_count, duplicate_count, attempt_count, requested_by_user_id, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?3, 'repository-draft/1', 'review', ?4, ?5, 1, 0, 0, 1, ?6, ?4, ?4)`)
      .bind(jobId, sourceId, crypto.randomUUID(), now, fingerprint, userId),
    c.env.DB.prepare(`INSERT INTO import_records
      (id, import_job_id, source_id, external_record_id, record_type, source_url, confidence,
       raw_payload_json, parsed_data_json, normalized_fingerprint, status, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, 'project', ?5, 0.65, ?6, ?7, ?8, 'review', ?9, ?9)`)
      .bind(recordId, jobId, sourceId, externalId, repositoryUrl, raw, JSON.stringify(draft), fingerprint, now),
    c.env.DB.prepare(`INSERT INTO staging_projects
      (id, import_record_id, name, repository_url, license_spdx, extracted_json, review_status, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7)`)
      .bind(crypto.randomUUID(), recordId, draft.name, draft.repo_url, draft.license ?? null, JSON.stringify(draft), now),
  ]);
  await recordAuditEvent(c.env.DB, { actorUserId: userId, action: "project.repository_import.draft", entityType: "import_job", entityId: jobId, requestId: c.get("requestId"), after: { sourceUrl: repositoryUrl, recordId } });
  return c.json({ draft, importJobId: jobId, reviewRequired: true });
});

projectRoutes.get("/projects/:id", loadAuthSession, async (c) => {
  const repository = new ProjectsRepository(c.env.DB);
  const project = await repository.find(c.req.param("id"));
  if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  await assertScopedRead(c.env.DB, c.get("authSession")?.user?.id ?? null, project.row);
  return c.json({ item: project.item });
});

projectRoutes.post("/projects", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, createSchema);
  if (body.organizationId) await assertOrganizationPermission(c.env.DB, userId, body.organizationId, "engineer");
  if (body.visibility === "organization" && !body.organizationId) throw new AppError(422, "ORGANIZATION_REQUIRED", "Organization visibility requires an organization.");
  const item = await new ProjectsRepository(c.env.DB).create({ ownerUserId: userId, organizationId: body.organizationId, visibility: body.visibility, rpps: body.rpps });
  await recordAuditEvent(c.env.DB, { actorUserId: userId, organizationId: body.organizationId, action: "project.create", entityType: "project", entityId: item.id, requestId: c.get("requestId"), after: item });
  return c.json({ item }, 201);
});

projectRoutes.patch("/projects/:id", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const repository = new ProjectsRepository(c.env.DB);
  const project = await repository.find(c.req.param("id"));
  if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  const body = await parseJson(c, scopeUpdateSchema);
  const organizationId = body.organizationId === undefined ? project.row.organization_id : body.organizationId;
  const visibility = body.visibility ?? project.row.visibility;

  if (project.row.organization_id) {
    await assertOrganizationPermission(c.env.DB, userId, project.row.organization_id, "admin");
  } else {
    await assertScopedWrite(c.env.DB, userId, project.row);
  }
  if (organizationId && organizationId !== project.row.organization_id) {
    await assertOrganizationPermission(c.env.DB, userId, organizationId, "admin");
  }
  if (visibility === "organization" && !organizationId) {
    throw new AppError(422, "ORGANIZATION_REQUIRED", "Organization visibility requires an organization.");
  }

  const item = await repository.updateScope(project.row.id, body.version, organizationId, visibility);
  await recordAuditEvent(c.env.DB, {
    actorUserId: userId,
    organizationId: organizationId ?? project.row.organization_id,
    action: "project.scope.update",
    entityType: "project",
    entityId: item.id,
    requestId: c.get("requestId"),
    before: { organizationId: project.row.organization_id, visibility: project.row.visibility },
    after: { organizationId, visibility },
  });
  return c.json({ item });
});

projectRoutes.put("/projects/:id/rpps", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const repository = new ProjectsRepository(c.env.DB);
  const project = await repository.find(c.req.param("id"));
  if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  await assertScopedWrite(c.env.DB, userId, project.row, "engineer");
  const body = await parseJson(c, rppsUpdateSchema);
  const item = await repository.updateRpps(project.row.id, body.version, userId, body.rpps);
  await recordAuditEvent(c.env.DB, { actorUserId: userId, organizationId: project.row.organization_id, action: "project.rpps.update", entityType: "project", entityId: item.id, requestId: c.get("requestId"), before: project.item, after: item });
  return c.json({ item });
});

projectRoutes.delete("/projects/:id", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const repository = new ProjectsRepository(c.env.DB);
  const project = await repository.find(c.req.param("id"));
  if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  if (project.row.organization_id) await assertOrganizationPermission(c.env.DB, userId, project.row.organization_id, "admin");
  else await assertScopedWrite(c.env.DB, userId, project.row, "admin");
  await repository.softDelete(project.row.id);
  await recordAuditEvent(c.env.DB, { actorUserId: userId, organizationId: project.row.organization_id, action: "project.archive", entityType: "project", entityId: project.row.id, requestId: c.get("requestId"), before: project.item });
  return c.body(null, 204);
});

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9\s-]/gu, "").replace(/\s+/gu, "-").replace(/-+/gu, "-").slice(0, 80) || "project";
}

function firstMeaningfulReadmeLine(readme: string): string {
  return readme.split(/\r?\n/u).map((line) => line.replace(/^#+\s*/u, "").trim()).find(Boolean) ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
