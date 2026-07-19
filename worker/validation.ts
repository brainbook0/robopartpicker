import type { Context } from "hono";
import type { z } from "zod";
import type { AppBindings } from "./env";
import { AppError } from "./http";

export async function parseJson<T extends z.ZodTypeAny>(c: Context<AppBindings>, schema: T): Promise<z.output<T>> {
  let value: unknown;
  try {
    value = await c.req.json();
  } catch {
    throw new AppError(400, "INVALID_JSON", "The request body must be valid JSON.");
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(
      422,
      "VALIDATION_ERROR",
      "The request body is invalid.",
      result.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message })),
    );
  }
  return result.data;
}
