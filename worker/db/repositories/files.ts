export type FileRow = {
  id: string;
  object_key: string;
  original_name: string;
  media_type: string;
  size_bytes: number;
  checksum_sha256: string | null;
  owner_user_id: string | null;
  organization_id: string | null;
  visibility: "private" | "organization" | "public";
  status: "pending" | "quarantined" | "ready" | "rejected" | "deleted";
  kind: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export class FilesRepository {
  constructor(private readonly db: D1Database) {}

  find(id: string): Promise<FileRow | null> {
    return this.db.prepare("SELECT * FROM files WHERE id = ?1").bind(id).first<FileRow>();
  }

  async listForUser(userId: string): Promise<FileRow[]> {
    const result = await this.db.prepare(`SELECT f.* FROM files f WHERE f.deleted_at IS NULL AND (
      f.owner_user_id = ?1 OR EXISTS (SELECT 1 FROM organization_members om
        WHERE om.organization_id = f.organization_id AND om.user_id = ?1 AND om.status = 'active'))
      ORDER BY f.created_at DESC LIMIT 200`).bind(userId).all<FileRow>();
    return result.results;
  }
}
