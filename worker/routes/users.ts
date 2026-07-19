import { Hono } from "hono";
import type { AppBindings } from "../env";
import { UsersRepository } from "../db/repositories/users";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { authenticatedUserId } from "../middleware/authorization";
import { parseJson } from "../validation";
import { z } from "zod";
import { AppError } from "../http";
import { recordAuditEvent } from "../services/audit";

export const userRoutes = new Hono<AppBindings>();

userRoutes.get("/me", loadAuthSession, requireAuth, async (c) => {
  const session = c.get("authSession")!;
  const profile = await new UsersRepository(c.env.DB).findProfile(session.user.id);
  return c.json({ user: session.user, profile, session: session.session });
});

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const profileSchema = z.object({
  display_name: optionalText(100),
  username: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/u).nullable().optional(),
  avatar_url: z.string().url().max(2_000).refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "Only HTTP(S) URLs are allowed.").nullable().optional(),
  headline: optionalText(160),
  bio: optionalText(5_000),
  region: optionalText(40),
}).strict();

userRoutes.patch("/me", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const repository = new UsersRepository(c.env.DB);
  const before = await repository.findProfile(userId);
  let profile;
  try {
    profile = await repository.updateProfile(userId, await parseJson(c, profileSchema));
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw new AppError(409, "USERNAME_TAKEN", "That username is already in use.");
    throw error;
  }
  await recordAuditEvent(c.env.DB, { actorUserId: userId, action: "profile.update", entityType: "profile", entityId: userId, requestId: c.get("requestId"), before, after: profile });
  return c.json({ item: profile });
});

userRoutes.get("/users/:id", async (c) => {
  const profile = await new UsersRepository(c.env.DB).publicProfile(c.req.param("id"));
  if (!profile) throw new AppError(404, "USER_NOT_FOUND", "User not found.");
  return c.json({ item: profile });
});

userRoutes.get("/me/saved-components", loadAuthSession, requireAuth, async (c) => {
  return c.json({ componentIds: await new UsersRepository(c.env.DB).listSavedComponents(authenticatedUserId(c)) });
});

userRoutes.post("/me/saved-components/:componentId", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const component = await c.env.DB.prepare("SELECT id FROM components WHERE id = ?1 AND deleted_at IS NULL").bind(c.req.param("componentId")).first();
  if (!component) throw new AppError(404, "COMPONENT_NOT_FOUND", "Component not found.");
  await new UsersRepository(c.env.DB).saveComponent(userId, c.req.param("componentId"));
  return c.json({ saved: true }, 201);
});

userRoutes.delete("/me/saved-components/:componentId", loadAuthSession, requireAuth, async (c) => {
  await new UsersRepository(c.env.DB).unsaveComponent(authenticatedUserId(c), c.req.param("componentId"));
  return c.body(null, 204);
});
