import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { OrganizationsRepository } from "../db/repositories/organizations";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { assertOrganizationPermission, authenticatedUserId, organizationRole } from "../middleware/authorization";
import { AppError } from "../http";
import { parseJson } from "../validation";
import { recordAuditEvent } from "../services/audit";

const slug = z.string().trim().min(3).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const createSchema = z.object({ name: z.string().trim().min(2).max(100), slug, description: z.string().trim().max(2_000).nullable().optional() }).strict();
const updateSchema = createSchema.partial().extend({ version: z.number().int().positive() }).strict();
const addMemberSchema = z.object({ email: z.string().email().max(320), role: z.enum(["admin", "engineer", "builder", "procurement", "viewer"]) }).strict();
const updateMemberSchema = z.object({ role: z.enum(["owner", "admin", "engineer", "builder", "procurement", "viewer"]), status: z.enum(["active", "suspended"]) }).strict();

export const organizationRoutes = new Hono<AppBindings>();
organizationRoutes.use("/organizations/*", loadAuthSession, requireAuth);
organizationRoutes.use("/organizations", loadAuthSession, requireAuth);

organizationRoutes.get("/organizations", async (c) => {
  return c.json({ items: await new OrganizationsRepository(c.env.DB).listForUser(authenticatedUserId(c)) });
});

organizationRoutes.post("/organizations", async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, createSchema);
  const organization = await new OrganizationsRepository(c.env.DB).create(userId, body);
  await recordAuditEvent(c.env.DB, { actorUserId: userId, organizationId: organization.id, action: "organization.create", entityType: "organization", entityId: organization.id, requestId: c.get("requestId"), after: organization });
  return c.json({ item: organization }, 201);
});

organizationRoutes.get("/organizations/:id", async (c) => {
  const userId = authenticatedUserId(c);
  const repository = new OrganizationsRepository(c.env.DB);
  const organization = await repository.find(c.req.param("id"));
  if (!organization) throw new AppError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
  const role = await organizationRole(c.env.DB, userId, organization.id);
  if (!role) throw new AppError(403, "ORGANIZATION_ACCESS_DENIED", "You are not a member of this organization.");
  return c.json({ item: { ...organization, member_role: role } });
});

organizationRoutes.patch("/organizations/:id", async (c) => {
  const userId = authenticatedUserId(c);
  const repository = new OrganizationsRepository(c.env.DB);
  const organization = await repository.find(c.req.param("id"));
  if (!organization) throw new AppError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
  await assertOrganizationPermission(c.env.DB, userId, organization.id, "admin");
  const body = await parseJson(c, updateSchema);
  const updated = await repository.update(organization.id, body.version, body);
  await recordAuditEvent(c.env.DB, { actorUserId: userId, organizationId: organization.id, action: "organization.update", entityType: "organization", entityId: organization.id, requestId: c.get("requestId"), before: organization, after: updated });
  return c.json({ item: updated });
});

organizationRoutes.get("/organizations/:id/members", async (c) => {
  const userId = authenticatedUserId(c);
  const repository = new OrganizationsRepository(c.env.DB);
  const organization = await repository.find(c.req.param("id"));
  if (!organization) throw new AppError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
  await assertOrganizationPermission(c.env.DB, userId, organization.id, "read");
  return c.json({ items: await repository.listMembers(organization.id) });
});

organizationRoutes.post("/organizations/:id/members", async (c) => {
  const actorId = authenticatedUserId(c);
  const repository = new OrganizationsRepository(c.env.DB);
  const organization = await repository.find(c.req.param("id"));
  if (!organization) throw new AppError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
  await assertOrganizationPermission(c.env.DB, actorId, organization.id, "admin");
  const body = await parseJson(c, addMemberSchema);
  const member = await repository.addMemberByEmail(organization.id, body.email, body.role);
  await recordAuditEvent(c.env.DB, { actorUserId: actorId, organizationId: organization.id, action: "organization.member.add", entityType: "user", entityId: member.user_id, requestId: c.get("requestId"), after: member });
  return c.json({ item: member }, 201);
});

organizationRoutes.patch("/organizations/:id/members/:userId", async (c) => {
  const actorId = authenticatedUserId(c);
  const repository = new OrganizationsRepository(c.env.DB);
  const organization = await repository.find(c.req.param("id"));
  if (!organization) throw new AppError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
  const actorRole = await assertOrganizationPermission(c.env.DB, actorId, organization.id, "admin");
  const body = await parseJson(c, updateMemberSchema);
  if (body.role === "owner" && actorRole !== "owner") throw new AppError(403, "OWNER_ROLE_REQUIRED", "Only an owner can grant ownership.");
  const members = await repository.listMembers(organization.id);
  const current = members.find((member) => member.user_id === c.req.param("userId"));
  if (!current) throw new AppError(404, "MEMBERSHIP_NOT_FOUND", "Organization membership not found.");
  if (current.role === "owner" && (body.role !== "owner" || body.status !== "active") && await repository.ownerCount(organization.id) <= 1) {
    throw new AppError(409, "LAST_OWNER_REQUIRED", "An organization must retain at least one active owner.");
  }
  const member = await repository.updateMember(organization.id, current.user_id, body.role, body.status);
  await recordAuditEvent(c.env.DB, { actorUserId: actorId, organizationId: organization.id, action: "organization.member.update", entityType: "user", entityId: member.user_id, requestId: c.get("requestId"), before: current, after: member });
  return c.json({ item: member });
});

organizationRoutes.delete("/organizations/:id/members/:userId", async (c) => {
  const actorId = authenticatedUserId(c);
  const repository = new OrganizationsRepository(c.env.DB);
  const organization = await repository.find(c.req.param("id"));
  if (!organization) throw new AppError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
  await assertOrganizationPermission(c.env.DB, actorId, organization.id, "admin");
  const members = await repository.listMembers(organization.id);
  const current = members.find((member) => member.user_id === c.req.param("userId"));
  if (!current) throw new AppError(404, "MEMBERSHIP_NOT_FOUND", "Organization membership not found.");
  if (current.role === "owner" && await repository.ownerCount(organization.id) <= 1) throw new AppError(409, "LAST_OWNER_REQUIRED", "An organization must retain at least one active owner.");
  await repository.removeMember(organization.id, current.user_id);
  await recordAuditEvent(c.env.DB, { actorUserId: actorId, organizationId: organization.id, action: "organization.member.remove", entityType: "user", entityId: current.user_id, requestId: c.get("requestId"), before: current });
  return c.body(null, 204);
});
