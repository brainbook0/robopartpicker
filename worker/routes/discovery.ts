import { Hono } from "hono";
import type { AppBindings } from "../env";

export const discoveryRoutes = new Hono<AppBindings>();

discoveryRoutes.get("/teardowns", async (c) => {
  const result = await c.env.DB.prepare(`SELECT id, source_url AS sourceUrl, confidence, parsed_data_json AS parsedData,
    created_at AS createdAt, updated_at AS updatedAt FROM import_records
    WHERE record_type = 'teardown' AND status = 'approved' ORDER BY updated_at DESC LIMIT 100`).all<{ id: string; sourceUrl: string | null; confidence: number; parsedData: string; createdAt: string; updatedAt: string }>();
  return c.json({ items: result.results.map((row) => ({ ...row, parsedData: JSON.parse(row.parsedData) })) });
});
