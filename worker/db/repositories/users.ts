export type ProfileRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  headline: string | null;
  bio: string | null;
  region: string | null;
  created_at: string;
  updated_at: string;
};

export class UsersRepository {
  constructor(private readonly db: D1Database) {}

  async ensureProfile(user: { id: string; name: string; image?: string | null }): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO profiles (id, display_name, avatar_url, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)
         ON CONFLICT(id) DO NOTHING`,
      )
      .bind(user.id, user.name, user.image ?? null, now)
      .run();
  }

  async findProfile(userId: string): Promise<ProfileRow | null> {
    return this.db
      .prepare(
        `SELECT id, display_name, username, avatar_url, headline, bio, region, created_at, updated_at
         FROM profiles
         WHERE id = ?1`,
      )
      .bind(userId)
      .first<ProfileRow>();
  }

  async updateProfile(userId: string, input: Partial<Pick<ProfileRow, "display_name" | "username" | "avatar_url" | "headline" | "bio" | "region">>): Promise<ProfileRow> {
    const current = await this.findProfile(userId);
    if (!current) throw new Error("Profile is missing for an authenticated user.");
    await this.db.prepare(`UPDATE profiles SET display_name = ?1, username = ?2, avatar_url = ?3,
      headline = ?4, bio = ?5, region = ?6, updated_at = ?7 WHERE id = ?8`)
      .bind(
        input.display_name === undefined ? current.display_name : input.display_name,
        input.username === undefined ? current.username : input.username,
        input.avatar_url === undefined ? current.avatar_url : input.avatar_url,
        input.headline === undefined ? current.headline : input.headline,
        input.bio === undefined ? current.bio : input.bio,
        input.region === undefined ? current.region : input.region,
        new Date().toISOString(),
        userId,
      ).run();
    return (await this.findProfile(userId))!;
  }

  async publicProfile(userId: string): Promise<Omit<ProfileRow, "created_at" | "updated_at"> | null> {
    return this.db.prepare(`SELECT id, display_name, username, avatar_url, headline, bio, region
      FROM profiles WHERE id = ?1`).bind(userId).first<Omit<ProfileRow, "created_at" | "updated_at">>();
  }

  async listSavedComponents(userId: string): Promise<string[]> {
    const rows = await this.db.prepare("SELECT component_id FROM saved_components WHERE user_id = ?1 ORDER BY created_at DESC")
      .bind(userId).all<{ component_id: string }>();
    return rows.results.map((row) => row.component_id);
  }

  async saveComponent(userId: string, componentId: string): Promise<void> {
    await this.db.prepare("INSERT INTO saved_components (user_id, component_id, created_at) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING")
      .bind(userId, componentId, new Date().toISOString()).run();
  }

  async unsaveComponent(userId: string, componentId: string): Promise<void> {
    await this.db.prepare("DELETE FROM saved_components WHERE user_id = ?1 AND component_id = ?2").bind(userId, componentId).run();
  }
}
