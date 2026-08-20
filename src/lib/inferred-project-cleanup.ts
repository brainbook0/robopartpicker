import { normalizeRppsForWrite, validateRpps } from "./rpps/schema";

type JsonRecord = Record<string, unknown>;

export type InferredProjectCleanupStats = {
  inferenceEntries: number;
  dofClaims: number;
  timeClaims: number;
  costClaims: number;
  aiBomClaims: number;
  removedDof: boolean;
  removedTimeHours: boolean;
  removedCostUsd: number | null;
  removedAiBomLines: number;
  removedGenericAssembly: number;
  removedGenericCompute: boolean;
  removedUnsourcedDifficulty: boolean;
  removedUnsupportedRosNone: boolean;
  removedBasicTools: number;
  removedBasicSkills: number;
};

export type InferredProjectCleanupResult = {
  rpps: JsonRecord;
  rppsJson: string;
  stats: InferredProjectCleanupStats;
};

const GENERIC_ASSEMBLY_BODY = /^Fabricate and assemble (?:the robot|the \d+ structural links) following the source documentation(?: \(https:\/\/github\.com\/[^)]+\))?\.$/u;
const DIFFICULTY_SOURCE = /\b(?:beginner|intermediate|advanced|expert)\b/iu;
const ROS_SOURCE = /\bros\s*2?\b/iu;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function uniqueClaimValue(values: number[], label: string): number | null {
  if (values.length === 0) return null;
  const unique = [...new Set(values)];
  if (unique.length !== 1) throw new Error(`${label} inference claims disagree: ${unique.join(", ")}`);
  return unique[0];
}

function deleteEmptyRecord(parent: JsonRecord, key: string): void {
  const value = record(parent[key]);
  if (value && Object.keys(value).length === 0) delete parent[key];
}

function removeStringValue(value: unknown, target: string): { next: string[] | undefined; removed: number } {
  if (!Array.isArray(value)) return { next: undefined, removed: 0 };
  const strings = value.filter((item): item is string => typeof item === "string");
  const next = strings.filter((item) => item !== target);
  return { next, removed: strings.length - next.length };
}

function sourceText(rpps: JsonRecord): string {
  const tags = Array.isArray(rpps.tags) ? rpps.tags.filter((tag): tag is string => typeof tag === "string").join(" ") : "";
  return [rpps.name, rpps.summary, rpps.description, tags].filter((value): value is string => typeof value === "string").join(" ");
}

export function cleanInferredProjectContent(input: unknown, origin: string): InferredProjectCleanupResult {
  const normalized = record(normalizeRppsForWrite(input, origin));
  if (!normalized) throw new Error("RPPS must be an object");
  const rpps = structuredClone(normalized);
  const evidence = Array.isArray(rpps.evidence) ? rpps.evidence : [];
  const retainedEvidence: unknown[] = [];
  const dofValues: number[] = [];
  const timeValues: number[] = [];
  const costValues: number[] = [];
  const aiBomCounts: number[] = [];
  let inferenceEntries = 0;

  for (const item of evidence) {
    const entry = record(item);
    if (entry?.source_type !== "inference") {
      retainedEvidence.push(item);
      continue;
    }
    inferenceEntries += 1;
    const claim = typeof entry.claim === "string" ? entry.claim : "";
    const dof = claim.match(/^DoF defaults to(?: a category-typical)? (\d+)/u);
    const time = claim.match(/^Build time defaults to a category-typical (\d+) hours/u);
    const cost = claim.match(/^Estimated build cost defaults to a category-typical \$([0-9]+(?:\.[0-9]+)?)/u);
    const aiBom = claim.match(/^Bill of materials derived from repository text by [^;]+; (\d+) parts\. Verify before sourcing\.$/u);
    if (dof) dofValues.push(Number(dof[1]));
    else if (time) timeValues.push(Number(time[1]));
    else if (cost) costValues.push(Number(cost[1]));
    else if (aiBom) aiBomCounts.push(Number(aiBom[1]));
    else throw new Error(`Unsupported inference claim: ${claim || "(missing claim)"}`);
  }

  if (retainedEvidence.length) rpps.evidence = retainedEvidence;
  else delete rpps.evidence;

  const dofValue = uniqueClaimValue(dofValues, "DoF");
  const timeValue = uniqueClaimValue(timeValues, "build time");
  const costValue = uniqueClaimValue(costValues, "build cost");
  const aiBomCount = uniqueClaimValue(aiBomCounts, "AI BOM");
  const hardware = record(rpps.hardware);
  const build = record(rpps.build);
  const software = record(rpps.software);
  let removedDof = false;
  let removedTimeHours = false;
  let removedCostUsd: number | null = null;
  let removedAiBomLines = 0;

  if (hardware && dofValue !== null && finiteNumber(hardware.dof) === dofValue) {
    delete hardware.dof;
    removedDof = true;
  }
  if (build && timeValue !== null && finiteNumber(build.estimated_time_hours) === timeValue) {
    delete build.estimated_time_hours;
    removedTimeHours = true;
  }
  if (build && costValue !== null && finiteNumber(build.estimated_cost_usd) === costValue) {
    delete build.estimated_cost_usd;
    removedCostUsd = costValue;
  }
  if (aiBomCount !== null) {
    const bom = Array.isArray(rpps.bom) ? rpps.bom : [];
    if (bom.length < aiBomCount) throw new Error(`AI BOM claim says ${aiBomCount} lines but RPPS contains only ${bom.length}`);
    removedAiBomLines = aiBomCount;
    rpps.bom = bom.slice(aiBomCount);
  }

  const assembly = Array.isArray(rpps.assembly) ? rpps.assembly : [];
  const retainedAssembly: unknown[] = [];
  let removedGenericAssembly = 0;
  for (const item of assembly) {
    const step = record(item);
    if (step?.title !== "Fabricate and assemble the structure") {
      retainedAssembly.push(item);
      continue;
    }
    const body = typeof step.body === "string" ? step.body : "";
    if (!GENERIC_ASSEMBLY_BODY.test(body)) throw new Error(`Generic assembly title has an unexpected body: ${body}`);
    removedGenericAssembly += 1;
  }
  if (retainedAssembly.length) rpps.assembly = retainedAssembly;
  else delete rpps.assembly;

  let removedGenericCompute = false;
  let removedUnsourcedDifficulty = false;
  let removedUnsupportedRosNone = false;
  let removedBasicTools = 0;
  let removedBasicSkills = 0;
  if (removedGenericAssembly > 0) {
    if (hardware?.compute === "Embedded microcontroller") {
      delete hardware.compute;
      removedGenericCompute = true;
    }
    const text = sourceText(rpps);
    if (build?.difficulty === "intermediate" && !DIFFICULTY_SOURCE.test(text)) {
      delete build.difficulty;
      removedUnsourcedDifficulty = true;
    }
    if (software?.ros_support === "none" && !ROS_SOURCE.test(text)) {
      delete software.ros_support;
      removedUnsupportedRosNone = true;
    }
    if (build) {
      const tools = removeStringValue(build.required_tools, "Basic hand tools");
      const skills = removeStringValue(build.required_skills, "Basic mechanical assembly");
      removedBasicTools = tools.removed;
      removedBasicSkills = skills.removed;
      if (tools.next?.length) build.required_tools = tools.next;
      else if (tools.next) delete build.required_tools;
      if (skills.next?.length) build.required_skills = skills.next;
      else if (skills.next) delete build.required_skills;
    }
  }

  const reproducibility = record(rpps.reproducibility);
  if (reproducibility) {
    const nextBom = Array.isArray(rpps.bom) ? rpps.bom : [];
    const nextAssembly = Array.isArray(rpps.assembly) ? rpps.assembly : [];
    reproducibility.bom = nextBom.length > 0;
    reproducibility.assembly = nextAssembly.length > 0;
    reproducibility.pricing = nextBom.some((item) => finiteNumber(record(item)?.unit_cost_usd) !== null);
  }

  deleteEmptyRecord(rpps, "hardware");
  deleteEmptyRecord(rpps, "software");
  deleteEmptyRecord(rpps, "build");
  const validation = validateRpps(rpps);
  if ("errors" in validation) throw new Error(`Cleaned RPPS failed validation: ${validation.errors.join("; ")}`);
  const rppsJson = JSON.stringify(rpps);
  return {
    rpps,
    rppsJson,
    stats: {
      inferenceEntries,
      dofClaims: dofValues.length,
      timeClaims: timeValues.length,
      costClaims: costValues.length,
      aiBomClaims: aiBomCounts.length,
      removedDof,
      removedTimeHours,
      removedCostUsd,
      removedAiBomLines,
      removedGenericAssembly,
      removedGenericCompute,
      removedUnsourcedDifficulty,
      removedUnsupportedRosNone,
      removedBasicTools,
      removedBasicSkills,
    },
  };
}
