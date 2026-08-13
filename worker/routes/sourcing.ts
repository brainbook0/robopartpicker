import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { SourcingOptimizerService } from "../services/sourcing-optimizer";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { authenticatedUserId } from "../middleware/authorization";
import { parseJson } from "../validation";

const constraintsSchema = z.object({
  preferredSupplierIds: z.array(z.string().max(200)).max(100).optional(),
  excludedSupplierIds: z.array(z.string().max(200)).max(100).optional(),
  region: z.string().max(40).optional(),
  maxDeliveryDays: z.number().int().nonnegative().optional(),
  exactPartsOnly: z.boolean().optional(),
  allowSubstitutes: z.boolean().optional(),
  allowUsed: z.boolean().optional(),
  allowSurplus: z.boolean().optional(),
  ownedComponentIds: z.array(z.string().max(200)).max(500).optional(),
  userPriceOverrides: z.record(z.string(), z.object({ unitPriceMinor: z.number().int().nonnegative() })).optional(),
  objective: z.enum(["lowest-cost", "fastest-delivery", "fewest-suppliers", "balanced"]).optional(),
}).strict();

const estimateSchema = z.object({
  bomId: z.string().min(1).max(200).optional(),
  projectId: z.string().min(1).max(200).optional(),
  constraints: constraintsSchema.optional(),
}).strict().refine((value) => value.bomId || value.projectId, { message: "bomId or projectId is required." });

export const sourcingRoutes = new Hono<AppBindings>();

sourcingRoutes.post("/sourcing/estimate", loadAuthSession, async (c) => {
  const body = await parseJson(c, estimateSchema);
  const service = new SourcingOptimizerService(c.env.DB);
  const estimate = body.bomId
    ? await service.estimateForBom(body.bomId, body.constraints ?? {})
    : await service.estimateForProject(body.projectId!, body.constraints ?? {});
  return c.json({ estimate });
});

sourcingRoutes.get("/sourcing/preferences", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const row = await c.env.DB.prepare(`SELECT preferred_supplier_ids, blocked_supplier_ids, region_code,
      max_delivery_days, exact_parts_only, allow_substitutes, allow_used, allow_surplus, default_objective
    FROM sourcing_preferences WHERE user_id = ?1`).bind(userId).first<Record<string, unknown>>();
  return c.json({ item: row ? rowToPreferences(row) : null });
});

sourcingRoutes.put("/sourcing/preferences", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, preferencesSchema);
  const now = new Date().toISOString();
  await c.env.DB.prepare(`INSERT INTO sourcing_preferences
      (id, user_id, preferred_supplier_ids, blocked_supplier_ids, region_code, max_delivery_days,
       exact_parts_only, allow_substitutes, allow_used, allow_surplus, default_objective, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)
    ON CONFLICT(user_id) DO UPDATE SET
      preferred_supplier_ids = excluded.preferred_supplier_ids,
      blocked_supplier_ids = excluded.blocked_supplier_ids,
      region_code = excluded.region_code,
      max_delivery_days = excluded.max_delivery_days,
      exact_parts_only = excluded.exact_parts_only,
      allow_substitutes = excluded.allow_substitutes,
      allow_used = excluded.allow_used,
      allow_surplus = excluded.allow_surplus,
      default_objective = excluded.default_objective,
      updated_at = excluded.updated_at`)
    .bind(crypto.randomUUID(), userId, JSON.stringify(body.preferredSupplierIds ?? []), JSON.stringify(body.excludedSupplierIds ?? []),
      body.region ?? null, body.maxDeliveryDays ?? null, body.exactPartsOnly ? 1 : 0, body.allowSubstitutes === false ? 0 : 1,
      body.allowUsed ? 1 : 0, body.allowSurplus ? 1 : 0, body.objective ?? "lowest-cost", now)
    .run();
  return c.json({ item: body });
});

const preferencesSchema = constraintsSchema.extend({ objective: z.enum(["lowest-cost", "fastest-delivery", "fewest-suppliers", "balanced"]).default("lowest-cost") }).partial();

function rowToPreferences(row: Record<string, unknown>) {
  const parseIds = (value: unknown): string[] => {
    try {
      const parsed = JSON.parse(String(value ?? "[]"));
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  };
  return {
    preferredSupplierIds: parseIds(row.preferred_supplier_ids),
    excludedSupplierIds: parseIds(row.blocked_supplier_ids),
    region: typeof row.region_code === "string" ? row.region_code : undefined,
    maxDeliveryDays: typeof row.max_delivery_days === "number" ? row.max_delivery_days : undefined,
    exactPartsOnly: row.exact_parts_only === 1,
    allowSubstitutes: row.allow_substitutes !== 0,
    allowUsed: row.allow_used === 1,
    allowSurplus: row.allow_surplus === 1,
    objective: row.default_objective,
  };
}
