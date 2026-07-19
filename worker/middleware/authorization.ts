import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import type { AppBindings } from "../env";
import { AppError } from "../http";

export type OrganizationRole = "owner" | "admin" | "engineer" | "builder" | "procurement" | "viewer";
export type OrganizationPermission = "read" | "build" | "engineer" | "procure" | "admin" | "own";
export type PlatformRole = "moderator" | "administrator";

const ORGANIZATION_PERMISSIONS: Record<OrganizationRole, ReadonlySet<OrganizationPermission>> = {
  owner: new Set(["read", "build", "engineer", "procure", "admin", "own"]),
  admin: new Set(["read", "build", "engineer", "procure", "admin"]),
  engineer: new Set(["read", "build", "engineer"]),
  builder: new Set(["read", "build"]),
  procurement: new Set(["read", "procure"]),
  viewer: new Set(["read"]),
};

export function authenticatedUserId(c: Context<AppBindings>): string {
  const userId = c.get("authSession")?.user?.id;
  if (!userId) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.");
  return userId;
}

export async function organizationRole(db: D1Database, userId: string, organizationId: string): Promise<OrganizationRole | null> {
  const row = await db.prepare(
    "SELECT role FROM organization_members WHERE organization_id = ?1 AND user_id = ?2 AND status = 'active'",
  ).bind(organizationId, userId).first<{ role: OrganizationRole }>();
  return row?.role ?? null;
}

export async function assertOrganizationPermission(
  db: D1Database,
  userId: string,
  organizationId: string,
  permission: OrganizationPermission,
): Promise<OrganizationRole> {
  const role = await organizationRole(db, userId, organizationId);
  if (!role || !ORGANIZATION_PERMISSIONS[role].has(permission)) {
    throw new AppError(403, "ORGANIZATION_ACCESS_DENIED", "Your organization role does not allow this action.");
  }
  return role;
}

export async function hasPlatformRole(db: D1Database, userId: string, allowed: PlatformRole[]): Promise<boolean> {
  if (allowed.length === 0) return false;
  const placeholders = allowed.map((_, index) => `?${index + 2}`).join(", ");
  const row = await db.prepare(
    `SELECT 1 AS allowed FROM platform_user_roles
     WHERE user_id = ?1 AND revoked_at IS NULL AND role IN (${placeholders}) LIMIT 1`,
  ).bind(userId, ...allowed).first<{ allowed: number }>();
  return row?.allowed === 1;
}

export function requirePlatformRole(...allowed: PlatformRole[]) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const userId = authenticatedUserId(c);
    if (!(await hasPlatformRole(c.env.DB, userId, allowed))) {
      throw new AppError(403, "PLATFORM_ACCESS_DENIED", "This action requires a platform moderation role.");
    }
    await next();
  });
}

export type ScopedResource = {
  owner_user_id: string | null;
  organization_id: string | null;
  visibility: "private" | "organization" | "unlisted" | "public";
};

export async function assertScopedRead(db: D1Database, userId: string | null, resource: ScopedResource): Promise<void> {
  if (resource.visibility === "public" || resource.visibility === "unlisted") return;
  if (userId && resource.owner_user_id === userId) return;
  if (userId && resource.organization_id) {
    const role = await organizationRole(db, userId, resource.organization_id);
    if (role && (resource.visibility === "organization" || resource.visibility === "private")) return;
  }
  throw new AppError(userId ? 403 : 401, userId ? "RESOURCE_ACCESS_DENIED" : "AUTHENTICATION_REQUIRED", "This resource is private.");
}

export async function assertScopedWrite(
  db: D1Database,
  userId: string,
  resource: Pick<ScopedResource, "owner_user_id" | "organization_id">,
  permission: OrganizationPermission = "engineer",
): Promise<void> {
  if (resource.owner_user_id === userId) return;
  if (resource.organization_id) {
    await assertOrganizationPermission(db, userId, resource.organization_id, permission);
    return;
  }
  throw new AppError(403, "RESOURCE_ACCESS_DENIED", "You cannot modify this resource.");
}
