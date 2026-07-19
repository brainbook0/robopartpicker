import { AppError } from "../../http";
import type { OrganizationRole } from "../../middleware/authorization";

export type OrganizationRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  created_by_user_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type OrganizationMemberRow = {
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  status: "active" | "suspended";
  joined_at: string;
  updated_at: string;
  display_name: string | null;
  username: string | null;
  email: string;
};

export class OrganizationsRepository {
  constructor(private readonly db: D1Database) {}

  async listForUser(userId: string): Promise<Array<OrganizationRow & { member_role: OrganizationRole }>> {
    const rows = await this.db.prepare(`SELECT o.id, o.slug, o.name, o.description, o.avatar_url,
      o.created_by_user_id, o.version, o.created_at, o.updated_at, om.role AS member_role
      FROM organizations o JOIN organization_members om ON om.organization_id = o.id
      WHERE om.user_id = ?1 AND om.status = 'active' AND o.deleted_at IS NULL
      ORDER BY o.name COLLATE NOCASE`).bind(userId).all<OrganizationRow & { member_role: OrganizationRole }>();
    return rows.results;
  }

  async find(idOrSlug: string): Promise<OrganizationRow | null> {
    return this.db.prepare(`SELECT id, slug, name, description, avatar_url, created_by_user_id,
      version, created_at, updated_at FROM organizations
      WHERE deleted_at IS NULL AND (id = ?1 OR slug = ?1)`).bind(idOrSlug).first<OrganizationRow>();
  }

  async create(userId: string, input: { name: string; slug: string; description?: string | null }): Promise<OrganizationRow> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      await this.db.batch([
        this.db.prepare(`INSERT INTO organizations
          (id, slug, name, description, created_by_user_id, created_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`)
          .bind(id, input.slug, input.name, input.description ?? null, userId, now),
        this.db.prepare(`INSERT INTO organization_members
          (organization_id, user_id, role, status, joined_at, updated_at)
          VALUES (?1, ?2, 'owner', 'active', ?3, ?3)`).bind(id, userId, now),
      ]);
    } catch (error) {
      if (String(error).includes("UNIQUE")) throw new AppError(409, "ORGANIZATION_SLUG_TAKEN", "That organization slug is already in use.");
      throw error;
    }
    return (await this.find(id))!;
  }

  async update(id: string, expectedVersion: number, input: { name?: string; slug?: string; description?: string | null }): Promise<OrganizationRow> {
    const current = await this.find(id);
    if (!current) throw new AppError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
    const result = await this.db.prepare(`UPDATE organizations SET
      name = ?1, slug = ?2, description = ?3, version = version + 1, updated_at = ?4
      WHERE id = ?5 AND version = ?6 AND deleted_at IS NULL`)
      .bind(input.name ?? current.name, input.slug ?? current.slug, input.description === undefined ? current.description : input.description, new Date().toISOString(), id, expectedVersion).run();
    if (result.meta.changes !== 1) throw new AppError(409, "VERSION_CONFLICT", "The organization changed; refresh and try again.");
    return (await this.find(id))!;
  }

  async listMembers(organizationId: string): Promise<OrganizationMemberRow[]> {
    const rows = await this.db.prepare(`SELECT om.organization_id, om.user_id, om.role, om.status,
      om.joined_at, om.updated_at, p.display_name, p.username, u.email
      FROM organization_members om JOIN "user" u ON u.id = om.user_id
      LEFT JOIN profiles p ON p.id = om.user_id
      WHERE om.organization_id = ?1 ORDER BY om.role, COALESCE(p.display_name, u.name) COLLATE NOCASE`)
      .bind(organizationId).all<OrganizationMemberRow>();
    return rows.results;
  }

  async addMemberByEmail(organizationId: string, email: string, role: Exclude<OrganizationRole, "owner">): Promise<OrganizationMemberRow> {
    const user = await this.db.prepare(`SELECT id FROM "user" WHERE lower(email) = lower(?1)`).bind(email).first<{ id: string }>();
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "No account has that email address.");
    const now = new Date().toISOString();
    await this.db.prepare(`INSERT INTO organization_members
      (organization_id, user_id, role, status, joined_at, updated_at)
      VALUES (?1, ?2, ?3, 'active', ?4, ?4)
      ON CONFLICT(organization_id, user_id) DO UPDATE SET role = excluded.role, status = 'active', updated_at = excluded.updated_at`)
      .bind(organizationId, user.id, role, now).run();
    return (await this.listMembers(organizationId)).find((member) => member.user_id === user.id)!;
  }

  async updateMember(organizationId: string, userId: string, role: OrganizationRole, status: "active" | "suspended"): Promise<OrganizationMemberRow> {
    const result = await this.db.prepare(`UPDATE organization_members SET role = ?1, status = ?2, updated_at = ?3
      WHERE organization_id = ?4 AND user_id = ?5`).bind(role, status, new Date().toISOString(), organizationId, userId).run();
    if (result.meta.changes !== 1) throw new AppError(404, "MEMBERSHIP_NOT_FOUND", "Organization membership not found.");
    return (await this.listMembers(organizationId)).find((member) => member.user_id === userId)!;
  }

  async ownerCount(organizationId: string): Promise<number> {
    const row = await this.db.prepare(`SELECT COUNT(*) AS count FROM organization_members
      WHERE organization_id = ?1 AND role = 'owner' AND status = 'active'`).bind(organizationId).first<{ count: number }>();
    return Number(row?.count ?? 0);
  }

  async removeMember(organizationId: string, userId: string): Promise<void> {
    await this.db.prepare("DELETE FROM organization_members WHERE organization_id = ?1 AND user_id = ?2").bind(organizationId, userId).run();
  }
}
