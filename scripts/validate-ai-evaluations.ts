import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

const requiredCategories = new Set([
  "project_extraction", "bom_extraction", "urdf_parsing_assistance", "component_matching", "missing_dependency_detection",
  "substitution_recommendations", "search_refinement", "evidence_citation", "troubleshooting", "structured_report_generation",
  "marketplace_description", "marketplace_pricing_assistance", "friction_classification",
]);
const thresholds = z.object({ accuracy: z.number().min(0).max(1), unsupportedClaims: z.number().int().nonnegative(), citationValidity: z.number().min(0).max(1), structuredOutputValidity: z.number().min(0).max(1), toolSelection: z.number().min(0).max(1), latencyP95Ms: z.number().positive(), costMicrounitsPerCase: z.number().nonnegative(), userAcceptance: z.number().min(0).max(1), userCorrectionRate: z.number().min(0).max(1) }).strict();
const suiteSchema = z.object({ suiteKey: z.string().min(1), version: z.string().regex(/^\d+\.\d+\.\d+$/u), description: z.string().min(1), promotionThresholds: thresholds, cases: z.array(z.object({ caseKey: z.string().min(1), category: z.string().min(1), taskType: z.string().min(1), input: z.unknown(), expected: z.unknown(), rubric: z.record(z.string(), z.unknown()) }).strict()).min(1) }).strict();

const path = resolve("evaluations/ai/v1.json");
const parsed = suiteSchema.parse(JSON.parse(await readFile(path, "utf8")));
const categories = new Set(parsed.cases.map((item) => item.category));
const missing = [...requiredCategories].filter((category) => !categories.has(category));
if (missing.length) throw new Error(`Evaluation suite is missing categories: ${missing.join(", ")}`);
if (new Set(parsed.cases.map((item) => item.caseKey)).size !== parsed.cases.length) throw new Error("Evaluation case keys must be unique.");
console.log(`AI evaluation suite ${parsed.suiteKey}@${parsed.version}: ${parsed.cases.length} cases, ${categories.size} required categories.`);
