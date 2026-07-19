// RoboPartPicker Project Standard (RPPS) v1.0.0
// Portable, machine-readable schema for DIY robotics projects.
// This is RoboPartPicker's open project format — not an industry standard.
import { z } from "zod";

export const RPPS_VERSION = "1.0.0";

const Url = z.string().url().max(2048);
const NonEmpty = z.string().trim().min(1).max(500);

export const RppsAuthor = z.object({
  name: NonEmpty,
  role: z.string().max(80).optional(),
  url: Url.optional(),
});

export const RppsFile = z.object({
  path: z.string().min(1).max(512),
  kind: z.enum(["readme", "cad", "urdf", "mjcf", "firmware", "config", "image", "video", "doc", "other"]),
  url: Url.optional(),
  description: z.string().max(500).optional(),
});

export const RppsBomItem = z.object({
  ref: z.string().max(64).optional(),                 // slot ref, e.g. "ACT-KNEE-L"
  name: NonEmpty,
  manufacturer: z.string().max(120).optional(),
  mpn: z.string().max(120).optional(),                // manufacturer part number
  category: z.string().max(60).optional(),            // e.g. "actuator"
  qty: z.number().int().positive().max(100000),
  unit_cost_usd: z.number().nonnegative().optional(),
  supplier_url: Url.optional(),
  fabricated: z.boolean().optional(),
  optional: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
});

export const RppsAssemblyStep = z.object({
  id: z.string().max(40),
  title: NonEmpty,
  body: z.string().max(8000).optional(),
  depends_on: z.array(z.string().max(40)).max(50).optional(),
  tools: z.array(z.string().max(80)).max(50).optional(),
  duration_min: z.number().int().nonnegative().optional(),
});

export const RppsIntegration = z.object({
  a: NonEmpty,                                        // component ref A
  b: NonEmpty,                                        // component ref B
  status: z.enum(["verified", "documented", "compatible", "adaptation-required", "unverified", "incompatible"]),
  notes: z.string().max(2000).optional(),
  evidence_url: Url.optional(),
});

export const RppsEvidence = z.object({
  claim: NonEmpty,
  source_type: z.enum(["datasheet", "repo", "docs", "paper", "user-build", "test", "teardown", "supplier", "listing", "inference"]),
  source_url: Url.optional(),
  retrieved_at: z.string().datetime().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const RppsPackage = z.object({
  rpps_version: z.literal(RPPS_VERSION),
  name: NonEmpty,
  slug: z.string().regex(/^[a-z0-9-]{2,80}$/, "lowercase, hyphens, 2–80 chars"),
  version: z.string().max(40),
  summary: z.string().max(280).optional(),
  description: z.string().max(20000).optional(),
  license: z.string().max(80).optional(),
  authors: z.array(RppsAuthor).max(50).optional(),
  repo_url: Url.optional(),
  docs_url: Url.optional(),
  cover_image_url: Url.optional(),
  tags: z.array(z.string().max(40)).max(30).optional(),
  hardware: z.object({
    dof: z.number().int().nonnegative().optional(),
    payload_kg: z.number().nonnegative().optional(),
    weight_kg: z.number().nonnegative().optional(),
    height_cm: z.number().nonnegative().optional(),
    compute: z.string().max(120).optional(),
  }).partial().optional(),
  software: z.object({
    os: z.string().max(80).optional(),
    middleware: z.string().max(80).optional(),
    languages: z.array(z.string().max(40)).max(20).optional(),
    ros_support: z.enum(["native", "community", "none"]).optional(),
    simulators: z.array(z.string().max(60)).max(20).optional(),
  }).partial().optional(),
  build: z.object({
    difficulty: z.enum(["beginner", "intermediate", "advanced", "expert"]).optional(),
    estimated_time_hours: z.number().nonnegative().optional(),
    estimated_cost_usd: z.number().nonnegative().optional(),
    required_tools: z.array(z.string().max(80)).max(50).optional(),
    required_skills: z.array(z.string().max(80)).max(50).optional(),
    fabrication: z.array(z.enum(["3d-print", "cnc", "laser", "waterjet", "manual", "pcb"])).max(10).optional(),
  }).partial().optional(),
  bom: z.array(RppsBomItem).max(1000).default([]),
  assembly: z.array(RppsAssemblyStep).max(500).optional(),
  files: z.array(RppsFile).max(500).optional(),
  integrations: z.array(RppsIntegration).max(500).optional(),
  known_issues: z.array(z.object({ title: NonEmpty, body: z.string().max(4000).optional() })).max(200).optional(),
  evidence: z.array(RppsEvidence).max(500).optional(),
});

export type RppsPackage = z.infer<typeof RppsPackage>;
export type RppsBomItem = z.infer<typeof RppsBomItem>;

export const emptyRpps = (init: Partial<RppsPackage> = {}): RppsPackage => ({
  rpps_version: RPPS_VERSION,
  name: init.name ?? "Untitled project",
  slug: init.slug ?? "untitled-project",
  version: init.version ?? "0.1.0",
  summary: init.summary,
  description: init.description,
  license: init.license,
  authors: init.authors,
  repo_url: init.repo_url,
  docs_url: init.docs_url,
  cover_image_url: init.cover_image_url,
  tags: init.tags,
  hardware: init.hardware,
  software: init.software,
  build: init.build,
  bom: init.bom ?? [],
  assembly: init.assembly,
  files: init.files,
  integrations: init.integrations,
  known_issues: init.known_issues,
  evidence: init.evidence,
});

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "project";
}

export function validateRpps(input: unknown):
  | { ok: true; data: RppsPackage }
  | { ok: false; errors: string[] } {
  const parsed = RppsPackage.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map(i => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}