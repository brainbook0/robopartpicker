import type { Context } from "hono";
import type { AppBindings } from "./env";

export type ErrorDetail = {
  path?: string;
  code?: string;
  message: string;
};

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: ErrorDetail[];

  constructor(status: number, code: string, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function jsonError(c: Context<AppBindings>, error: AppError) {
  return c.json(
    {
      error: {
        code: error.code,
        message: error.message,
        requestId: c.get("requestId"),
        ...(error.details ? { details: error.details } : {}),
      },
    },
    error.status as 400,
  );
}

export function parsePositiveInt(value: string | undefined, fallback: number, max: number): number {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value)) {
    throw new AppError(400, "VALIDATION_ERROR", "Pagination values must be positive integers.");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new AppError(400, "VALIDATION_ERROR", "Pagination values must be positive integers.");
  }
  return Math.min(parsed, max);
}
