import { Hono } from "hono";
import { z } from "zod";
import {
  parsePortableRpps,
  parsePortableRppsLock,
  stringifyPortableRpps,
  stringifyPortableRppsLock,
  validatePortableRpps,
} from "../../src/lib/rpps/portable";
import { RppsReleasesRepository } from "../db/repositories/rpps-releases";
import type { AppBindings } from "../env";
import { AppError } from "../http";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { assertScopedRead, assertScopedWrite, authenticatedUserId, organizationRole } from "../middleware/authorization";
import { recordAuditEvent } from "../services/audit";
import { parseJson } from "../validation";
import { ProjectsRepository } from "../db/repositories/projects";

const packageSchema = z.object({
  manifest: z.string().min(1).max(1_048_576),
  lockfile: z.string().max(1_048_576).optional(),
}).strict();
const releaseSchema = packageSchema.extend({ status: z.enum(["draft", "published"]).default("draft") }).strict();

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

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
