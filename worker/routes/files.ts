import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { FilesRepository } from "../db/repositories/files";
import { AppError } from "../http";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { assertOrganizationPermission, assertScopedWrite, authenticatedUserId, organizationRole } from "../middleware/authorization";
import { BuildsRepository } from "../db/repositories/builds";
import { ProjectsRepository } from "../db/repositories/projects";
import { parseJson } from "../validation";
import { recordAuditEvent } from "../services/audit";
import { fileContentUrl } from "../services/file-urls";

const kinds = ["image", "cad", "urdf", "mjcf", "bom", "document", "firmware", "configuration", "test_evidence", "attachment", "other"] as const;
const visibility = ["private", "organization", "public"] as const;
const projectRelativePath = z.string().trim().min(1).max(500).refine((value) => {
  if (value.startsWith("/") || value.includes("\\") || /^[a-z]:/iu.test(value) || /[\u0000-\u001f\u007f]/u.test(value)) return false;
  return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}, "Use a portable project-relative path without absolute paths, backslashes, or traversal segments.");
const initSchema = z.object({
  originalName: z.string().trim().min(1).max(255), mediaType: z.string().trim().min(1).max(150),
  sizeBytes: z.number().int().positive(), kind: z.enum(kinds), visibility: z.enum(visibility).default("private"),
  organizationId: z.string().uuid().nullable().optional(), checksumSha256: z.string().regex(/^[a-f0-9]{64}$/u).nullable().optional(),
}).strict();
const attachSchema = z.object({
  entityType: z.enum(["build", "project", "marketplace_listing"]), entityId: z.string().min(1).max(200),
  purpose: z.string().trim().min(1).max(100), buildStepId: z.string().uuid().nullable().optional(),
  relativePath: projectRelativePath.nullable().optional(), altText: z.string().trim().max(500).nullable().optional(),
}).strict();

const KIND_LIMITS: Record<(typeof kinds)[number], number> = {
  image: 10 * 1024 * 1024, cad: 50 * 1024 * 1024, urdf: 10 * 1024 * 1024, mjcf: 10 * 1024 * 1024,
  bom: 10 * 1024 * 1024, document: 25 * 1024 * 1024, firmware: 25 * 1024 * 1024,
  configuration: 5 * 1024 * 1024, test_evidence: 25 * 1024 * 1024, attachment: 25 * 1024 * 1024, other: 10 * 1024 * 1024,
};
const MIME_BY_KIND: Record<(typeof kinds)[number], RegExp> = {
  image: /^image\/(png|jpeg|webp|gif)$/u,
  cad: /^(application\/(octet-stream|step|iges|zip)|model\/(step|iges|stl)|text\/plain)$/u,
  urdf: /^(application\/xml|text\/(xml|plain))$/u,
  mjcf: /^(application\/xml|text\/(xml|plain))$/u,
  bom: /^(text\/(csv|plain)|application\/(json|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|octet-stream))$/u,
  document: /^(application\/(pdf|json)|text\/(plain|markdown|csv))$/u,
  firmware: /^(application\/(octet-stream|zip)|text\/plain)$/u,
  configuration: /^(application\/(json|yaml|xml)|text\/(plain|yaml|xml))$/u,
  test_evidence: /^(image\/(png|jpeg|webp)|application\/(pdf|json)|text\/(plain|csv))$/u,
  attachment: /^(image\/(png|jpeg|webp|gif)|application\/(pdf|json|zip)|text\/(plain|markdown|csv))$/u,
  other: /^(application\/octet-stream|text\/plain)$/u,
};

export const fileRoutes = new Hono<AppBindings>();

fileRoutes.get("/files", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const items = (await new FilesRepository(c.env.DB).listForUser(userId)).map(publicFile);
  return c.json({ items, total: items.length });
});

fileRoutes.post("/files/uploads", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, initSchema);
  if (body.sizeBytes > KIND_LIMITS[body.kind]) throw new AppError(413, "FILE_TOO_LARGE", `${body.kind} uploads are limited to ${Math.floor(KIND_LIMITS[body.kind] / 1024 / 1024)} MiB.`);
  if (!MIME_BY_KIND[body.kind].test(body.mediaType.toLowerCase())) throw new AppError(422, "FILE_TYPE_NOT_ALLOWED", "That media type is not allowed for the selected file kind.");
  if (body.organizationId) await assertOrganizationPermission(c.env.DB, userId, body.organizationId, "engineer");
  if (body.visibility === "organization" && !body.organizationId) throw new AppError(422, "ORGANIZATION_REQUIRED", "Organization visibility requires an organization.");
  const id = crypto.randomUUID();
  const intentId = crypto.randomUUID();
  const uploadToken = randomToken();
  const now = new Date();
  const expires = new Date(now.getTime() + 15 * 60_000).toISOString();
  const safeName = sanitizeName(body.originalName);
  const objectKey = `users/${userId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}-${safeName}`;
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO files
      (id, object_key, original_name, media_type, size_bytes, checksum_sha256, owner_user_id, organization_id,
       visibility, status, kind, metadata_json, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'pending', ?10, ?11, ?12, ?12)`)
      .bind(id, objectKey, body.originalName, body.mediaType.toLowerCase(), body.sizeBytes, body.checksumSha256 ?? null,
        userId, body.organizationId ?? null, body.visibility, body.kind, JSON.stringify({ scanStatus: "pending", originalNameSanitized: safeName }), now.toISOString()),
    c.env.DB.prepare(`INSERT INTO file_upload_intents
      (id, file_id, owner_user_id, upload_token_hash, expected_size_bytes, expected_media_type, expires_at, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`)
      .bind(intentId, id, userId, await sha256(uploadToken), body.sizeBytes, body.mediaType.toLowerCase(), expires, now.toISOString()),
  ]);
  return c.json({ file: { id, originalName: body.originalName, mediaType: body.mediaType, sizeBytes: body.sizeBytes, kind: body.kind, status: "pending" }, upload: { method: "PUT", url: `/api/v1/files/uploads/${intentId}`, token: uploadToken, expiresAt: expires, requiredHeaders: { "Content-Type": body.mediaType, "X-Upload-Token": uploadToken } } }, 201);
});

fileRoutes.put("/files/uploads/:intentId", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const token = c.req.header("x-upload-token");
  if (!token) throw new AppError(401, "UPLOAD_TOKEN_REQUIRED", "The upload token is required.");
  const intent = await c.env.DB.prepare(`SELECT fui.*, f.object_key, f.original_name, f.kind, f.visibility
    FROM file_upload_intents fui JOIN files f ON f.id = fui.file_id WHERE fui.id = ?1`).bind(c.req.param("intentId")).first<{
      id: string; file_id: string; owner_user_id: string; upload_token_hash: string; expected_size_bytes: number;
      expected_media_type: string; expires_at: string; consumed_at: string | null; object_key: string; original_name: string; kind: string; visibility: string;
    }>();
  if (!intent || intent.owner_user_id !== userId || !timingSafeEqual(intent.upload_token_hash, await sha256(token))) throw new AppError(404, "UPLOAD_INTENT_NOT_FOUND", "Upload intent not found.");
  if (intent.consumed_at) throw new AppError(409, "UPLOAD_ALREADY_CONSUMED", "This upload intent has already been used.");
  if (Date.parse(intent.expires_at) <= Date.now()) throw new AppError(410, "UPLOAD_EXPIRED", "This upload intent has expired.");
  const contentType = (c.req.header("content-type") ?? "").toLowerCase();
  const contentLength = Number(c.req.header("content-length") ?? -1);
  if (contentType !== intent.expected_media_type || contentLength !== intent.expected_size_bytes) throw new AppError(422, "UPLOAD_METADATA_MISMATCH", "Upload size and media type must match the initialization request.");
  if (!c.req.raw.body) throw new AppError(422, "UPLOAD_BODY_REQUIRED", "The file body is required.");
  let uploadBody: ReadableStream<Uint8Array> | Uint8Array = c.req.raw.body;
  let imageMetadata: { width: number; height: number } | null = null;
  if (contentType.startsWith("image/")) {
    const bytes = new Uint8Array(await c.req.raw.arrayBuffer());
    try {
      imageMetadata = validateImageMetadata(bytes, contentType);
    } catch (error) {
      const now = new Date().toISOString();
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE file_upload_intents SET consumed_at = ?1 WHERE id = ?2 AND consumed_at IS NULL").bind(now, intent.id),
        c.env.DB.prepare("UPDATE files SET status = 'rejected', metadata_json = ?1, updated_at = ?2 WHERE id = ?3")
          .bind(JSON.stringify({ rejection: "invalid_image_metadata" }), now, intent.file_id),
      ]);
      throw error;
    }
    uploadBody = bytes;
  }
  const object = await c.env.FILES.put(intent.object_key, uploadBody, {
    httpMetadata: { contentType, contentDisposition: disposition(intent.original_name, contentType), cacheControl: intent.visibility === "public" ? "public, max-age=3600" : "private, no-store" },
    customMetadata: { fileId: intent.file_id, ownerUserId: userId, kind: intent.kind },
  });
  if (!object || object.size !== intent.expected_size_bytes) {
    await c.env.FILES.delete(intent.object_key);
    await c.env.DB.prepare("UPDATE files SET status = 'rejected', metadata_json = ?1, updated_at = ?2 WHERE id = ?3")
      .bind(JSON.stringify({ rejection: "size_mismatch" }), new Date().toISOString(), intent.file_id).run();
    throw new AppError(422, "UPLOAD_SIZE_MISMATCH", "The stored file size did not match the declared size.");
  }
  const scan = await scanBoundary(c.env, intent.file_id, intent.object_key);
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE file_upload_intents SET consumed_at = ?1 WHERE id = ?2 AND consumed_at IS NULL").bind(now, intent.id),
    c.env.DB.prepare("UPDATE files SET status = ?1, metadata_json = ?2, updated_at = ?3 WHERE id = ?4")
      .bind(scan.status, JSON.stringify({ scanStatus: scan.scanStatus, r2Etag: object.etag, uploadedAt: object.uploaded.toISOString(), ...(imageMetadata ? { image: imageMetadata } : {}) }), now, intent.file_id),
  ]);
  await recordAuditEvent(c.env.DB, { actorUserId: userId, action: "file.upload", entityType: "file", entityId: intent.file_id, requestId: c.get("requestId"), after: { status: scan.status, scanStatus: scan.scanStatus, sizeBytes: object.size } });
  return c.json({ fileId: intent.file_id, status: scan.status, scanStatus: scan.scanStatus, accessUrl: fileContentUrl(intent.file_id) }, 201);
});

fileRoutes.get("/files/content", loadAuthSession, async (c) => {
  const id = c.req.query("id");
  if (!id) throw new AppError(422, "FILE_ID_REQUIRED", "The file id query parameter is required.");
  return serveFileContent(c, id);
});

fileRoutes.get("/files/:id", loadAuthSession, async (c) => {
  const file = await authorizedFile(c.env.DB, c.get("authSession")?.user?.id ?? null, c.req.param("id"));
  return c.json({ item: publicFile(file) });
});

fileRoutes.post("/files/:id/attachments", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); const body = await parseJson(c, attachSchema);
  const file = await new FilesRepository(c.env.DB).find(c.req.param("id"));
  if (!file || file.deleted_at || file.status !== "ready") throw new AppError(422, "FILE_NOT_READY", "Only ready files can be attached.");
  if (file.owner_user_id !== userId) {
    if (!file.organization_id) throw new AppError(403, "FILE_ACCESS_DENIED", "You cannot attach this file.");
    await assertOrganizationPermission(c.env.DB, userId, file.organization_id, "engineer");
  }
  const now = new Date().toISOString();
  if (body.entityType === "build") {
    const build = await new BuildsRepository(c.env.DB).find(body.entityId); if (!build) throw new AppError(404, "BUILD_NOT_FOUND", "Build not found.");
    await assertScopedWrite(c.env.DB, userId, build, "build");
    if (body.buildStepId) {
      const step = await c.env.DB.prepare("SELECT id FROM build_steps WHERE id = ?1 AND build_id = ?2").bind(body.buildStepId, build.id).first();
      if (!step) throw new AppError(422, "BUILD_STEP_NOT_FOUND", "The build step does not belong to this build.");
    }
    await c.env.DB.prepare(`INSERT INTO build_files (build_id, file_id, purpose, build_step_id, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(build_id, file_id) DO UPDATE SET purpose = excluded.purpose, build_step_id = excluded.build_step_id`)
      .bind(build.id, file.id, body.purpose, body.buildStepId ?? null, now).run();
  } else if (body.entityType === "project") {
    const project = await new ProjectsRepository(c.env.DB).find(body.entityId); if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
    await assertScopedWrite(c.env.DB, userId, project.row, "engineer");
    if (project.row.organization_id !== file.organization_id) {
      throw new AppError(422, "FILE_SCOPE_MISMATCH", "Project files must use the same organization scope as the project.");
    }
    const statements: D1PreparedStatement[] = [
      c.env.DB.prepare(`INSERT INTO project_files (project_id, project_version_id, file_id, purpose, relative_path, created_at)
        VALUES (?1, (SELECT current_version_id FROM projects WHERE id = ?1), ?2, ?3, ?4, ?5)
        ON CONFLICT(project_id, file_id) DO UPDATE SET project_version_id = excluded.project_version_id,
          purpose = excluded.purpose, relative_path = excluded.relative_path`)
        .bind(project.row.id, file.id, body.purpose, body.relativePath ?? null, now),
      c.env.DB.prepare("DELETE FROM project_media WHERE project_id = ?1 AND file_id = ?2").bind(project.row.id, file.id),
    ];
    if (body.purpose === "media") {
      if (!file.media_type.startsWith("image/")) throw new AppError(422, "PROJECT_MEDIA_IMAGE_REQUIRED", "Project media must be a validated image.");
      const max = await c.env.DB.prepare("SELECT COALESCE(MAX(sort_order), -1) AS value FROM project_media WHERE project_id = ?1")
        .bind(project.row.id).first<{ value: number }>();
      statements.push(c.env.DB.prepare(`INSERT INTO project_media
        (id, project_id, file_id, alt_text, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
        .bind(crypto.randomUUID(), project.row.id, file.id, body.altText ?? null, Number(max?.value ?? -1) + 1, now));
    }
    await c.env.DB.batch(statements);
  } else {
    const listing = await c.env.DB.prepare("SELECT id, seller_user_id, organization_id FROM marketplace_listings WHERE id = ?1 AND deleted_at IS NULL").bind(body.entityId).first<{ id: string; seller_user_id: string | null; organization_id: string | null }>();
    if (!listing) throw new AppError(404, "LISTING_NOT_FOUND", "Marketplace listing not found.");
    if (listing.seller_user_id !== userId) {
      if (!listing.organization_id) throw new AppError(403, "LISTING_ACCESS_DENIED", "You cannot modify this listing.");
      await assertOrganizationPermission(c.env.DB, userId, listing.organization_id, "procure");
    }
    if (body.purpose !== "media" || file.kind !== "image" || !file.media_type.startsWith("image/")) {
      throw new AppError(422, "MARKETPLACE_IMAGE_REQUIRED", "Marketplace listing media must be a validated image upload.");
    }
    const count = await c.env.DB.prepare("SELECT COUNT(*) AS value FROM marketplace_listing_images WHERE listing_id = ?1")
      .bind(listing.id).first<{ value: number }>();
    if (Number(count?.value ?? 0) >= 12) throw new AppError(422, "MARKETPLACE_IMAGE_LIMIT", "A listing can contain at most 12 images.");
    const max = await c.env.DB.prepare("SELECT COALESCE(MAX(sort_order), -1) AS value FROM marketplace_listing_images WHERE listing_id = ?1").bind(listing.id).first<{ value: number }>();
    await c.env.DB.prepare(`INSERT INTO marketplace_listing_images (listing_id, file_id, alt_text, sort_order)
      VALUES (?1, ?2, ?3, ?4) ON CONFLICT(listing_id, file_id) DO UPDATE SET alt_text = excluded.alt_text`)
      .bind(listing.id, file.id, body.altText ?? null, Number(max?.value ?? -1) + 1).run();
  }
  await recordAuditEvent(c.env.DB, { actorUserId: userId, action: "file.attach", entityType: body.entityType, entityId: body.entityId, requestId: c.get("requestId"), after: { fileId: file.id, purpose: body.purpose } });
  return c.json({ attached: true }, 201);
});

fileRoutes.get("/files/:id/content", loadAuthSession, async (c) => {
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) throw new AppError(404, "FILE_NOT_FOUND", "File not found.");
  return serveFileContent(c, id);
});

fileRoutes.delete("/files/:id", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const file = await new FilesRepository(c.env.DB).find(c.req.param("id"));
  if (!file || file.deleted_at) throw new AppError(404, "FILE_NOT_FOUND", "File not found.");
  if (file.owner_user_id !== userId) {
    if (!file.organization_id) throw new AppError(403, "FILE_ACCESS_DENIED", "You cannot delete this file.");
    await assertOrganizationPermission(c.env.DB, userId, file.organization_id, "engineer");
  }
  await c.env.FILES.delete(file.object_key);
  const now = new Date().toISOString();
  await c.env.DB.prepare("UPDATE files SET status = 'deleted', deleted_at = ?1, updated_at = ?1 WHERE id = ?2").bind(now, file.id).run();
  await recordAuditEvent(c.env.DB, { actorUserId: userId, organizationId: file.organization_id, action: "file.delete", entityType: "file", entityId: file.id, requestId: c.get("requestId") });
  return c.body(null, 204);
});

async function serveFileContent(c: Context<AppBindings>, id: string) {
  const file = await authorizedFile(c.env.DB, c.get("authSession")?.user?.id ?? null, id);
  if (file.status !== "ready") throw new AppError(423, "FILE_NOT_READY", "The file is not available while safety review is pending.");
  const object = await c.env.FILES.get(file.object_key, { onlyIf: c.req.raw.headers, range: c.req.raw.headers });
  if (!object) throw new AppError(404, "FILE_OBJECT_NOT_FOUND", "The file object is missing from storage.");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-security-policy", "default-src 'none'; sandbox");
  headers.set("cache-control", file.visibility === "public" ? "public, max-age=3600" : "private, no-store");
  return new Response("body" in object ? object.body : undefined, { status: "body" in object ? 200 : 412, headers });
}

async function authorizedFile(db: D1Database, userId: string | null, id: string) {
  const file = await new FilesRepository(db).find(id);
  if (!file || file.deleted_at || file.status === "deleted") throw new AppError(404, "FILE_NOT_FOUND", "File not found.");
  if (file.visibility === "public" && file.status === "ready") return file;
  if (!userId) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Sign in to access this file.");
  if (file.owner_user_id === userId) return file;
  if (file.organization_id && await organizationRole(db, userId, file.organization_id)) return file;
  throw new AppError(403, "FILE_ACCESS_DENIED", "You cannot access this file.");
}

function publicFile(file: Awaited<ReturnType<FilesRepository["find"]>> & {} | Record<string, unknown>) {
  const row = file as Record<string, unknown>;
  return { id: row.id, originalName: row.original_name, mediaType: row.media_type, sizeBytes: row.size_bytes, visibility: row.visibility, status: row.status, kind: row.kind, createdAt: row.created_at, updatedAt: row.updated_at, contentUrl: fileContentUrl(String(row.id)) };
}

async function scanBoundary(env: AppBindings["Bindings"], fileId: string, objectKey: string): Promise<{ status: "ready" | "quarantined" | "rejected"; scanStatus: string }> {
  if (!env.MALWARE_SCAN_URL || !env.MALWARE_SCAN_TOKEN) return env.APP_ENV === "production" ? { status: "quarantined", scanStatus: "provider_not_configured" } : { status: "ready", scanStatus: "development_bypass" };
  try {
    const response = await fetch(env.MALWARE_SCAN_URL, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.MALWARE_SCAN_TOKEN}` }, body: JSON.stringify({ fileId, objectKey, bucketBinding: "FILES" }) });
    if (!response.ok) return { status: "quarantined", scanStatus: "provider_error" };
    const result = await response.json<{ verdict?: string }>();
    if (result.verdict === "clean") return { status: "ready", scanStatus: "clean" };
    if (result.verdict === "malicious") return { status: "rejected", scanStatus: "malicious" };
    return { status: "quarantined", scanStatus: "unknown" };
  } catch { return { status: "quarantined", scanStatus: "provider_unreachable" }; }
}

function sanitizeName(value: string): string {
  const base = value.split(/[\\/]/u).at(-1) ?? "file";
  const cleaned = base.normalize("NFKC").replace(/[^a-zA-Z0-9._-]/gu, "-").replace(/-+/gu, "-").replace(/^\.+/u, "").slice(0, 120);
  return cleaned || "file";
}
function disposition(name: string, mediaType: string): string { return `${mediaType.startsWith("image/") ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`; }
function randomToken(): string { const bytes = crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...bytes)).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, ""); }
async function sha256(value: string): Promise<string> { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function timingSafeEqual(left: string, right: string): boolean { if (left.length !== right.length) return false; let result = 0; for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index); return result === 0; }

function validateImageMetadata(bytes: Uint8Array, mediaType: string): { width: number; height: number } {
  let dimensions: { width: number; height: number } | null = null;
  if (mediaType === "image/png") dimensions = pngDimensions(bytes);
  else if (mediaType === "image/gif") dimensions = gifDimensions(bytes);
  else if (mediaType === "image/jpeg") dimensions = jpegDimensions(bytes);
  else if (mediaType === "image/webp") dimensions = webpDimensions(bytes);
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > 50_000 || dimensions.height > 50_000) {
    throw new AppError(422, "INVALID_IMAGE_METADATA", "The uploaded image header or dimensions are invalid.");
  }
  return dimensions;
}

function pngDimensions(bytes: Uint8Array) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)
    || String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function gifDimensions(bytes: Uint8Array) {
  if (bytes.length < 10 || !["GIF87a", "GIF89a"].includes(String.fromCharCode(...bytes.slice(0, 6)))) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

function jpegDimensions(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) return null;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return null;
    if (sof.has(marker) && length >= 7) {
      return { height: (bytes[offset + 3] << 8) | bytes[offset + 4], width: (bytes[offset + 5] << 8) | bytes[offset + 6] };
    }
    offset += length;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array) {
  if (bytes.length < 30 || String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" || String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP") return null;
  const format = String.fromCharCode(...bytes.slice(12, 16));
  if (format === "VP8X") return {
    width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
    height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
  };
  if (format === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return {
    width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
    height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
  };
  if (format === "VP8L" && bytes[20] === 0x2f) {
    return { width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8), height: 1 + (bytes[23] >> 2) + ((bytes[24] & 0x0f) << 6) };
  }
  return null;
}
