import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { AppError } from "../http";
import { parseJson } from "../validation";
import { createPartnerInterest } from "../db/repositories/partner-interest";

export const partnerInterestRoutes = new Hono<AppBindings>();

const interestSchema = z.object({
  inquiryType: z.enum(["advertiser", "supplier", "partner", "project_owner", "service_provider"]),
  organizationName: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  websiteUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  message: z.string().trim().min(40).max(2_000),
  company: z.string().max(0).optional().or(z.literal("")),
});

partnerInterestRoutes.post("/partner-interest", async (c) => {
  const input = await parseJson(c, interestSchema);
  if (looksLikeSpam(input.message)) {
    throw new AppError(422, "VALIDATION_ERROR", "Please describe the relevant organization, robotics category, and partnership request without promotional link stuffing.");
  }

  const address = c.req.header("cf-connecting-ip") ?? (c.env.APP_ENV === "production" ? "missing" : "local-development");
  const ipHash = await keyedHash(c.env.BETTER_AUTH_SECRET, address);
  await createPartnerInterest(c.env.DB, {
    inquiryType: input.inquiryType,
    organizationName: input.organizationName,
    contactName: input.contactName,
    email: input.email,
    websiteUrl: input.websiteUrl || null,
    message: input.message,
    ipHash,
    userAgent: c.req.header("user-agent") ?? null,
    requestId: c.get("requestId"),
  });

  return c.json({
    item: { referenceId: c.get("requestId"), status: "received" as const, receivedAt: new Date().toISOString() },
    message: "Interest received. It will go through manual review before any listing, sponsorship, or supplier change goes live.",
  }, 201);
});

function looksLikeSpam(message: string): boolean {
  const lower = message.toLowerCase();
  const linkCount = (lower.match(/https?:\/\//g) ?? []).length;
  const roboticsTerms = ["robot", "robotics", "bom", "component", "supplier", "advertis", "sponsor", "partner", "manufacturer", "project", "parts"];
  return linkCount > 3 || !roboticsTerms.some((term) => lower.includes(term));
}

async function keyedHash(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
