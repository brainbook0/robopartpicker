import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import { COMPLETENESS_BUCKETS, EXTRACTION_METHODS } from "./bom";
import type { RppsPackage } from "./schema";

export const PORTABLE_RPPS_VERSION = "0.1" as const;
export const PORTABLE_RPPS_STATUS = "RPPS 0.1 Draft" as const;

const Identifier = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9:._/-]*$/u, "must be a stable identifier");
const ShortText = z.string().trim().min(1).max(500);
const Url = z.string().url().max(2_048);
const Sha256 = z.string().regex(/^[a-fA-F0-9]{64}$/u, "must be a SHA-256 hex digest").transform((value) => value.toLowerCase());
const Timestamp = z.string().datetime({ offset: true });
const ExtensionMap = z.record(z.string(), z.unknown()).superRefine((value, context) => {
  for (const key of Object.keys(value)) {
    if (!/^[a-z0-9]+(?:[.-][a-z0-9-]+)+$/u.test(key)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: "extension keys must use a namespaced identifier such as org.example.feature" });
    }
  }
});

export const PortableArtifact = z.object({
  id: Identifier,
  path: z.string().trim().min(1).max(1_024),
  kind: z.enum(["documentation", "cad", "manufacturing", "urdf", "mjcf", "sdf", "firmware", "configuration", "calibration", "test", "bom", "image", "video", "other"]),
  sha256: Sha256.optional(),
  mediaType: z.string().trim().max(200).optional(),
  editable: z.boolean().optional(),
  source: z.object({ url: Url, revision: z.string().trim().max(200).optional(), retrievedAt: Timestamp.optional() }).strict().optional(),
}).strict();

export const PortableComponent = z.object({
  id: Identifier,
  name: ShortText,
  quantity: z.number().positive().max(1_000_000),
  unit: z.string().trim().min(1).max(40).default("each"),
  manufacturer: z.string().trim().max(160).optional(),
  mpn: z.string().trim().max(160).optional(),
  revision: z.string().trim().max(160).optional(),
  fabricated: z.boolean().default(false),
  optional: z.boolean().default(false),
  artifactRefs: z.array(Identifier).max(100).default([]),
  extractionMethod: z.enum(EXTRACTION_METHODS).default("explicit-bom"),
  completeness: z.enum(COMPLETENESS_BUCKETS).default("probable"),
  evidenceLocator: z.string().trim().max(1_024).optional(),
  confidence: z.number().min(0).max(1).optional(),
}).strict();

export type PortableComponent = z.infer<typeof PortableComponent>;

export const PortableInterface = z.object({
  id: Identifier,
  name: ShortText,
  kind: z.enum(["mechanical", "electrical", "communication", "software", "coordinate-frame", "capability", "environmental", "other"]),
  description: z.string().max(4_000).optional(),
  specifications: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  evidenceRefs: z.array(Identifier).max(100).default([]),
}).strict();

export const PortableAssembly = z.object({
  id: Identifier,
  name: ShortText,
  description: z.string().max(4_000).optional(),
  componentRefs: z.array(Identifier).max(2_000).default([]),
  artifactRefs: z.array(Identifier).max(2_000).default([]),
  interfaceRefs: z.array(Identifier).max(500).default([]),
}).strict();

export const PortableProcedure = z.object({
  id: Identifier,
  kind: z.enum(["assembly", "configuration", "calibration", "test", "operation", "maintenance"]),
  title: ShortText,
  artifactRefs: z.array(Identifier).max(100).default([]),
  steps: z.array(z.object({ id: Identifier, instruction: z.string().trim().min(1).max(20_000) }).strict()).max(1_000).default([]),
  expectedResult: z.string().max(4_000).optional(),
}).strict();

export const PortableEvidence = z.object({
  id: Identifier,
  claim: ShortText,
  level: z.enum(["structured", "tested", "reproduced", "repeated"]),
  compatibilitySource: z.enum(["manufacturer-declared", "maintainer-declared", "community-observed", "independently-reproduced", "disputed", "outdated"]).optional(),
  artifactRefs: z.array(Identifier).max(100).default([]),
  observedAt: Timestamp.optional(),
  currentAt: Timestamp.optional(),
}).strict();

export const PortableRppsManifest = z.object({
  rpps: z.literal(PORTABLE_RPPS_VERSION),
  project: z.object({ id: Identifier, name: ShortText, slug: z.string().regex(/^[a-z0-9-]{2,80}$/u).optional(), summary: z.string().max(500).optional(), description: z.string().max(40_000).optional() }).strict(),
  release: z.object({ id: Identifier, version: ShortText, createdAt: Timestamp.optional() }).strict(),
  authors: z.array(z.object({ id: Identifier, name: ShortText, role: z.string().max(120).optional(), url: Url.optional() }).strict()).max(100).default([]),
  licenses: z.object({ hardware: z.string().max(160).optional(), software: z.string().max(160).optional(), documentation: z.string().max(160).optional(), media: z.string().max(160).optional() }).strict().default({}),
  artifacts: z.array(PortableArtifact).max(5_000).default([]),
  assemblies: z.array(PortableAssembly).max(2_000).default([]),
  components: z.array(PortableComponent).max(10_000).default([]),
  interfaces: z.array(PortableInterface).max(5_000).default([]),
  procedures: z.array(PortableProcedure).max(5_000).default([]),
  tests: z.array(z.object({ id: Identifier, title: ShortText, procedureRef: Identifier.optional(), expectedResult: z.string().max(4_000).optional() }).strict()).max(2_000).default([]),
  evidence: z.array(PortableEvidence).max(5_000).default([]),
  lineage: z.object({ parentRelease: Identifier.optional(), forkedFrom: Url.optional() }).strict().optional(),
  contribution: z.object({ url: Url.optional(), instructionsArtifactRef: Identifier.optional(), acceptsStructuredProposals: z.boolean().default(false) }).strict().optional(),
  standards: z.object({ openKnowHow: z.string().max(80).optional(), cyclonedx: z.string().max(80).optional(), spdx: z.string().max(80).optional(), coordinateConvention: z.literal("ROS-REP-103").optional() }).strict().optional(),
  extensions: ExtensionMap.optional(),
}).strict();

export const PortableRppsLock = z.object({
  rppsLock: z.literal(PORTABLE_RPPS_VERSION),
  release: z.object({ id: Identifier, version: ShortText }).strict(),
  manifestSha256: Sha256.optional(),
  artifacts: z.array(z.object({ id: Identifier, sha256: Sha256, sourceRevision: z.string().max(200).optional() }).strict()).max(5_000).default([]),
  components: z.array(z.object({ id: Identifier, manufacturer: z.string().max(160), mpn: z.string().max(160), revision: z.string().max(160).optional(), quantity: z.number().positive() }).strict()).max(10_000).default([]),
  extensions: ExtensionMap.optional(),
}).strict();

export type PortableRppsManifest = z.infer<typeof PortableRppsManifest>;
export type PortableRppsLock = z.infer<typeof PortableRppsLock>;
export type FindingSeverity = "blocker" | "warning" | "suggestion";
export type ScoreDimension = "artifact-completeness" | "bom-resolution" | "mechanical-interfaces" | "electrical-interfaces" | "firmware-reproducibility" | "configuration-calibration" | "assembly-instructions" | "test-coverage" | "licensing-clarity" | "evidence-quality" | "collaboration-readiness";
export type ConformanceProfile = "core" | "buildable" | "reproducible" | "collaborative";
export type RppsFinding = {
  ruleId: string;
  severity: FindingSeverity;
  profile: ConformanceProfile;
  dimension: ScoreDimension;
  affectedObject?: string;
  message: string;
  suggestion: string;
  deterministic: true;
  effect: number;
};
export type RppsValidationReport = {
  schema: typeof PORTABLE_RPPS_STATUS;
  valid: true;
  profiles: Record<ConformanceProfile, { score: number; conformant: boolean }>;
  dimensions: Record<ScoreDimension, number>;
  findings: RppsFinding[];
};

export type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: string[] };

export function parsePortableRpps(text: string): ParseResult<PortableRppsManifest> {
  if (new TextEncoder().encode(text).byteLength > 1_048_576) return { ok: false, errors: ["Package exceeds the 1 MiB validation limit."] };
  try {
    const raw = parseYaml(text, { maxAliasCount: 0, uniqueKeys: true });
    const result = PortableRppsManifest.safeParse(raw);
    if (result.success) return { ok: true, data: result.data };
    return { ok: false, errors: result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`) };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : "Invalid YAML or JSON."] };
  }
}

export function parsePortableRppsLock(text: string): ParseResult<PortableRppsLock> {
  try {
    const result = PortableRppsLock.safeParse(parseYaml(text, { maxAliasCount: 0, uniqueKeys: true }));
    if (result.success) return { ok: true, data: result.data };
    return { ok: false, errors: result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`) };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : "Invalid lockfile YAML or JSON."] };
  }
}

export function stringifyPortableRpps(manifest: PortableRppsManifest): string {
  return stringifyYaml(manifest, { lineWidth: 0, sortMapEntries: false });
}

export function stringifyPortableRppsLock(lock: PortableRppsLock): string {
  return stringifyYaml(lock, { lineWidth: 0, sortMapEntries: false });
}

type Rule = Omit<RppsFinding, "deterministic"> & { passes: (manifest: PortableRppsManifest, lock?: PortableRppsLock) => boolean };

const rules: Rule[] = [
  { ruleId: "RPPS-CORE-001", severity: "blocker", profile: "core", dimension: "licensing-clarity", message: "The release does not identify an author.", suggestion: "Add at least one author with a stable ID.", effect: 17, passes: (m) => m.authors.length > 0 },
  { ruleId: "RPPS-LIC-001", severity: "blocker", profile: "core", dimension: "licensing-clarity", message: "Hardware, software, and documentation licenses are not all declared.", suggestion: "Declare separate license identifiers for hardware, software, and documentation.", effect: 17, passes: (m) => Boolean(m.licenses.hardware && m.licenses.software && m.licenses.documentation) },
  { ruleId: "RPPS-ART-001", severity: "blocker", profile: "core", dimension: "artifact-completeness", message: "No hashed artifact is indexed.", suggestion: "Index at least one release artifact and include its SHA-256 digest.", effect: 17, passes: (m) => m.artifacts.some((a) => Boolean(a.sha256)) },
  { ruleId: "RPPS-BOM-001", severity: "blocker", profile: "core", dimension: "bom-resolution", message: "The release has no basic bill of materials.", suggestion: "Add at least one component or fabricated item with a stable ID and quantity.", effect: 17, passes: (m) => m.components.length > 0 },
  { ruleId: "RPPS-REF-001", severity: "blocker", profile: "core", dimension: "artifact-completeness", message: "One or more object references do not resolve inside the manifest.", suggestion: "Use stable IDs that resolve to declared artifacts, components, interfaces, procedures, or evidence.", effect: 16, passes: referencesResolve },
  { ruleId: "RPPS-ID-001", severity: "blocker", profile: "core", dimension: "collaboration-readiness", message: "Stable object IDs are not unique across the release.", suggestion: "Give every project, release, author, artifact, component, assembly, interface, procedure, test, evidence, and procedure step a unique ID.", effect: 16, passes: stableIdsAreUnique },
  { ruleId: "RPPS-BOM-014", severity: "blocker", profile: "buildable", dimension: "bom-resolution", message: "One or more purchased components lack a manufacturer part number.", suggestion: "Identify each non-fabricated component by manufacturer and part number.", effect: 17, passes: (m) => m.components.length > 0 && m.components.every((c) => c.fabricated || Boolean(c.manufacturer && c.mpn)) },
  { ruleId: "RPPS-BUILD-001", severity: "blocker", profile: "buildable", dimension: "assembly-instructions", message: "No assembly procedure with executable steps is present.", suggestion: "Add an assembly procedure with ordered instructions.", effect: 17, passes: (m) => m.procedures.some((p) => p.kind === "assembly" && p.steps.length > 0) },
  { ruleId: "RPPS-IFACE-001", severity: "warning", profile: "buildable", dimension: "mechanical-interfaces", message: "Mechanical interfaces are not declared.", suggestion: "Describe mounting geometry, dimensions, tolerances, and mating interfaces.", effect: 17, passes: (m) => m.interfaces.some((i) => i.kind === "mechanical") },
  { ruleId: "RPPS-IFACE-002", severity: "warning", profile: "buildable", dimension: "electrical-interfaces", message: "Electrical or communication interfaces are not declared.", suggestion: "Describe voltage, current, connectors, pinout, and communication protocol.", effect: 17, passes: (m) => m.interfaces.some((i) => i.kind === "electrical" || i.kind === "communication") },
  { ruleId: "RPPS-BUILD-002", severity: "warning", profile: "buildable", dimension: "configuration-calibration", message: "No configuration or calibration procedure is present.", suggestion: "Add configuration and calibration procedures or explain why they are unnecessary.", effect: 16, passes: (m) => m.procedures.some((p) => p.kind === "configuration" || p.kind === "calibration") },
  { ruleId: "RPPS-FW-001", severity: "warning", profile: "buildable", dimension: "firmware-reproducibility", message: "No firmware artifact is indexed.", suggestion: "Reference firmware source or a pinned firmware artifact when the robot uses programmable control.", effect: 16, passes: (m) => m.artifacts.some((a) => a.kind === "firmware") },
  { ruleId: "RPPS-LOCK-001", severity: "blocker", profile: "reproducible", dimension: "artifact-completeness", message: "An RPPS lockfile was not supplied.", suggestion: "Generate rpps.lock.yaml with exact component identities and artifact hashes.", effect: 20, passes: (_m, lock) => Boolean(lock) },
  { ruleId: "RPPS-LOCK-002", severity: "blocker", profile: "reproducible", dimension: "bom-resolution", message: "The lockfile does not exactly resolve every release artifact and purchased component.", suggestion: "Regenerate the lockfile so IDs, hashes, manufacturer part numbers, revisions, and quantities match the manifest.", effect: 20, passes: lockResolvesManifest },
  { ruleId: "RPPS-ART-002", severity: "blocker", profile: "reproducible", dimension: "artifact-completeness", message: "Every artifact is not content-addressed.", suggestion: "Add a SHA-256 digest for every artifact in the immutable release.", effect: 20, passes: (m) => m.artifacts.length > 0 && m.artifacts.every((a) => Boolean(a.sha256)) },
  { ruleId: "RPPS-TEST-001", severity: "blocker", profile: "reproducible", dimension: "test-coverage", message: "No test with an expected result is declared.", suggestion: "Add at least one deterministic acceptance test and its expected result.", effect: 20, passes: (m) => m.tests.some((t) => Boolean(t.expectedResult)) },
  { ruleId: "RPPS-EVID-001", severity: "warning", profile: "reproducible", dimension: "evidence-quality", message: "No completed maintainer test evidence is attached.", suggestion: "Attach tested evidence tied to the exact release and its artifacts.", effect: 20, passes: (m) => m.evidence.some((e) => ["tested", "reproduced", "repeated"].includes(e.level)) },
  { ruleId: "RPPS-COLLAB-001", severity: "blocker", profile: "collaborative", dimension: "collaboration-readiness", message: "Structured change proposals are not enabled.", suggestion: "Declare contribution instructions and enable structured proposals.", effect: 34, passes: (m) => m.contribution?.acceptsStructuredProposals === true },
  { ruleId: "RPPS-COLLAB-002", severity: "warning", profile: "collaborative", dimension: "collaboration-readiness", message: "No reusable assembly with an interface is declared.", suggestion: "Model at least one assembly and connect it to a declared interface.", effect: 33, passes: (m) => m.assemblies.some((a) => a.interfaceRefs.length > 0) },
  { ruleId: "RPPS-COLLAB-003", severity: "warning", profile: "collaborative", dimension: "collaboration-readiness", message: "Release lineage is not declared.", suggestion: "Declare parent or fork lineage when applicable, or use a root lineage marker extension.", effect: 33, passes: (m) => Boolean(m.lineage || m.extensions?.["org.rpps.root-lineage"]) },
];

const dimensions: ScoreDimension[] = ["artifact-completeness", "bom-resolution", "mechanical-interfaces", "electrical-interfaces", "firmware-reproducibility", "configuration-calibration", "assembly-instructions", "test-coverage", "licensing-clarity", "evidence-quality", "collaboration-readiness"];
const profiles: ConformanceProfile[] = ["core", "buildable", "reproducible", "collaborative"];

export function validatePortableRpps(manifest: PortableRppsManifest, lock?: PortableRppsLock): RppsValidationReport {
  const findings: RppsFinding[] = rules.filter((rule) => !rule.passes(manifest, lock)).map(({ passes: _passes, ...finding }) => ({ ...finding, deterministic: true as const }));
  const stageScores = Object.fromEntries(profiles.map((profile) => {
    const deductions = findings.filter((finding) => finding.profile === profile).reduce((sum, finding) => sum + finding.effect, 0);
    return [profile, Math.max(0, 100 - deductions)];
  })) as Record<ConformanceProfile, number>;
  const profileScores = Object.fromEntries(profiles.map((profile, index) => {
    const cumulative = profiles.slice(0, index + 1).map((entry) => stageScores[entry]);
    const score = Math.round(cumulative.reduce((sum, value) => sum + value, 0) / cumulative.length);
    return [profile, { score, conformant: cumulative.every((value) => value === 100) }];
  })) as RppsValidationReport["profiles"];
  const dimensionScores = Object.fromEntries(dimensions.map((dimension) => {
    const relevantRules = rules.filter((rule) => rule.dimension === dimension);
    if (relevantRules.length === 0) return [dimension, 100];
    const failed = findings.filter((finding) => finding.dimension === dimension).length;
    return [dimension, Math.round(((relevantRules.length - failed) / relevantRules.length) * 100)];
  })) as RppsValidationReport["dimensions"];
  return { schema: PORTABLE_RPPS_STATUS, valid: true, profiles: profileScores, dimensions: dimensionScores, findings };
}

function referencesResolve(manifest: PortableRppsManifest): boolean {
  const artifacts = new Set(manifest.artifacts.map((item) => item.id));
  const components = new Set(manifest.components.map((item) => item.id));
  const interfaces = new Set(manifest.interfaces.map((item) => item.id));
  const procedures = new Set(manifest.procedures.map((item) => item.id));
  const evidence = new Set(manifest.evidence.map((item) => item.id));
  return manifest.components.every((item) => item.artifactRefs.every((ref) => artifacts.has(ref)))
    && manifest.assemblies.every((item) => item.artifactRefs.every((ref) => artifacts.has(ref)) && item.componentRefs.every((ref) => components.has(ref)) && item.interfaceRefs.every((ref) => interfaces.has(ref)))
    && manifest.interfaces.every((item) => item.evidenceRefs.every((ref) => evidence.has(ref)))
    && manifest.procedures.every((item) => item.artifactRefs.every((ref) => artifacts.has(ref)))
    && manifest.tests.every((item) => !item.procedureRef || procedures.has(item.procedureRef))
    && (!manifest.contribution?.instructionsArtifactRef || artifacts.has(manifest.contribution.instructionsArtifactRef));
}

function stableIdsAreUnique(manifest: PortableRppsManifest): boolean {
  const ids = [manifest.project.id, manifest.release.id, ...manifest.authors.map((item) => item.id), ...manifest.artifacts.map((item) => item.id),
    ...manifest.components.map((item) => item.id), ...manifest.assemblies.map((item) => item.id), ...manifest.interfaces.map((item) => item.id),
    ...manifest.procedures.flatMap((item) => [item.id, ...item.steps.map((step) => step.id)]), ...manifest.tests.map((item) => item.id), ...manifest.evidence.map((item) => item.id)];
  return new Set(ids).size === ids.length;
}

function lockResolvesManifest(manifest: PortableRppsManifest, lock?: PortableRppsLock): boolean {
  if (!lock || lock.release.id !== manifest.release.id || lock.release.version !== manifest.release.version) return false;
  const lockedArtifacts = new Map(lock.artifacts.map((item) => [item.id, item]));
  const lockedComponents = new Map(lock.components.map((item) => [item.id, item]));
  return manifest.artifacts.every((item) => Boolean(item.sha256 && lockedArtifacts.get(item.id)?.sha256 === item.sha256))
    && manifest.components.filter((item) => !item.fabricated).every((item) => {
      const resolved = lockedComponents.get(item.id);
      return Boolean(resolved && resolved.manufacturer === item.manufacturer && resolved.mpn === item.mpn
        && (!item.revision || resolved.revision === item.revision) && resolved.quantity === item.quantity);
    });
}

export function convertLegacyRpps(legacy: RppsPackage): PortableRppsManifest {
  const artifactKind = (kind: NonNullable<RppsPackage["files"]>[number]["kind"]): z.infer<typeof PortableArtifact>["kind"] => {
    switch (kind) {
      case "cad": case "urdf": case "mjcf": case "firmware": case "image": case "video": case "other": return kind;
      case "config": return "configuration";
      default: return "documentation";
    }
  };
  return PortableRppsManifest.parse({
    rpps: PORTABLE_RPPS_VERSION,
    project: { id: `project:${legacy.slug}`, name: legacy.name, slug: legacy.slug, summary: legacy.summary, description: legacy.description },
    release: { id: `release:${legacy.slug}:${legacy.version}`, version: legacy.version },
    authors: (legacy.authors ?? []).map((author, index) => ({ id: `author:${legacy.slug}:${index + 1}`, ...author })),
    licenses: { hardware: legacy.license, documentation: legacy.license },
    artifacts: (legacy.files ?? []).map((file, index) => ({ id: `artifact:${legacy.slug}:${index + 1}`, path: file.path, kind: artifactKind(file.kind), source: file.url ? { url: file.url } : undefined })),
    components: legacy.bom.map((item, index) => ({ id: item.ref ? `component:${item.ref}` : `component:${legacy.slug}:${index + 1}`, name: item.name, quantity: item.qty, manufacturer: item.manufacturer, mpn: item.mpn, fabricated: item.fabricated ?? false, optional: item.optional ?? false })),
    procedures: (legacy.assembly ?? []).length ? [{ id: `procedure:${legacy.slug}:assembly`, kind: "assembly", title: "Assembly", steps: legacy.assembly!.map((step) => ({ id: `step:${step.id}`, instruction: [step.title, step.body].filter(Boolean).join("\n\n") })) }] : [],
    evidence: (legacy.evidence ?? []).map((evidence, index) => ({ id: `evidence:${legacy.slug}:${index + 1}`, claim: evidence.claim, level: evidence.source_type === "user-build" ? "reproduced" : evidence.source_type === "test" ? "tested" : "structured", observedAt: evidence.retrieved_at })),
    standards: { coordinateConvention: legacy.software?.middleware?.toLowerCase().includes("ros") ? "ROS-REP-103" : undefined },
    extensions: { "org.robopartpicker.legacy.v1": legacy },
  });
}
