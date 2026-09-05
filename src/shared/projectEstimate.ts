import type { ProjectKind } from "@/lib/projects";
import type { RobotCategory } from "@/shared/robotCategory";

export type EstimateSource = "published" | "calculated" | "market" | "inferred";
export type EstimateConfidence = "high" | "medium" | "low";

export type ProjectPointEstimate = {
  amountMinor: number;
  source: EstimateSource;
  confidence: EstimateConfidence;
  method: string;
};

export type ProjectTimeEstimate = {
  minutes: number;
  source: EstimateSource;
  confidence: EstimateConfidence;
  method: string;
};

export type ProjectEstimateInput = {
  projectKind: ProjectKind;
  category: RobotCategory | null;
  publishedCostUsd: number | null;
  marketCostMinor?: number | null;
  marketCostMethod?: string | null;
  publishedTimeHours: number | null;
  knownCostMinor: number;
  pricedLines: number;
  totalLines: number;
  units: number;
  assemblyDurationMinutes: number;
  assemblySteps: number;
  difficulty: "beginner" | "intermediate" | "advanced" | "expert" | null;
  valuedAt: string;
};

export type ProjectProfileEstimate = {
  cost: ProjectPointEstimate | null;
  time: ProjectTimeEstimate | null;
  methodVersion: "project-point-estimate-v1";
  valuedAt: string;
};

const OPEN_COST_USD: Record<RobotCategory, number> = {
  humanoid: 7_000,
  manipulator: 1_800,
  gripper: 750,
  quadruped: 3_000,
  hexapod: 1_200,
  mobile: 900,
  aerial: 1_200,
  biped: 2_500,
  exoskeleton: 4_500,
  head: 1_000,
  actuator: 450,
  underwater: 3_500,
  other: 1_500,
};

const COMMERCIAL_COST_USD: Record<RobotCategory, number> = {
  humanoid: 90_000,
  manipulator: 25_000,
  gripper: 5_500,
  quadruped: 12_000,
  hexapod: 8_000,
  mobile: 6_000,
  aerial: 4_500,
  biped: 45_000,
  exoskeleton: 55_000,
  head: 18_000,
  actuator: 3_500,
  underwater: 18_000,
  other: 15_000,
};

const BASE_TIME_MINUTES: Record<RobotCategory, number> = {
  humanoid: 4_800,
  manipulator: 1_920,
  gripper: 960,
  quadruped: 2_880,
  hexapod: 2_160,
  mobile: 1_440,
  aerial: 1_200,
  biped: 2_880,
  exoskeleton: 3_600,
  head: 1_200,
  actuator: 720,
  underwater: 2_400,
  other: 1_800,
};

const DIFFICULTY_FACTOR = {
  beginner: 0.8,
  intermediate: 1,
  advanced: 1.25,
  expert: 1.5,
} as const;

export function estimateProjectProfile(input: ProjectEstimateInput): ProjectProfileEstimate {
  const methodVersion = "project-point-estimate-v1" as const;
  const category = input.category ?? "other";

  const commercial = input.projectKind === "commercial_showcase";
  const cost = publishedCost(input) ?? calculatedCost(input) ?? marketCost(input)
    ?? (commercial ? null : inferredCost(input, category));
  const time = commercial ? null : publishedTime(input) ?? calculatedTime(input) ?? inferredTime(input, category);

  return { cost, time, methodVersion, valuedAt: input.valuedAt };
}

function publishedCost(input: ProjectEstimateInput): ProjectPointEstimate | null {
  if (!(input.publishedCostUsd != null && Number.isFinite(input.publishedCostUsd) && input.publishedCostUsd > 0)) return null;
  return {
    amountMinor: Math.round(input.publishedCostUsd * 100),
    source: "published",
    confidence: "high",
    method: "Published project cost supplied by the project profile.",
  };
}

function calculatedCost(input: ProjectEstimateInput): ProjectPointEstimate | null {
  if (!(input.knownCostMinor > 0 && input.totalLines > 0 && input.pricedLines > 0)) return null;
  const coverage = Math.min(1, input.pricedLines / input.totalLines);
  if (coverage === 1) {
    return {
      amountMinor: Math.round(input.knownCostMinor),
      source: "calculated",
      confidence: "medium",
      method: "Calculated from all currently priced BOM lines; shipping and tax excluded.",
    };
  }
  return {
    amountMinor: Math.round((input.knownCostMinor / coverage) * 1.08),
    source: "calculated",
    confidence: coverage >= 0.75 ? "medium" : "low",
    method: `Extrapolated from ${input.pricedLines}/${input.totalLines} priced BOM coverage with an 8% uncertainty allowance; shipping and tax excluded.`,
  };
}

function marketCost(input: ProjectEstimateInput): ProjectPointEstimate | null {
  if (!(input.marketCostMinor != null && Number.isFinite(input.marketCostMinor) && input.marketCostMinor > 0)) return null;
  if (input.marketCostMethod?.trim() === "category-baseline-v1") return null;
  return {
    amountMinor: Math.round(input.marketCostMinor),
    source: "market",
    confidence: "low",
    method: `Normalized market estimate using ${input.marketCostMethod?.trim() || "an identified estimation method"}; not a manufacturer price or supplier offer.`,
  };
}

function inferredCost(input: ProjectEstimateInput, category: RobotCategory): ProjectPointEstimate {
  const table = input.projectKind === "commercial_showcase" ? COMMERCIAL_COST_USD : OPEN_COST_USD;
  const lineFactor = input.totalLines > 0 ? Math.max(1, Math.sqrt(input.totalLines / 12)) : 1;
  return {
    amountMinor: Math.round(table[category] * lineFactor * 100),
    source: "inferred",
    confidence: "low",
    method: `Category baseline for a ${input.projectKind.replaceAll("_", " ")} ${category} project, adjusted by available BOM complexity.`,
  };
}

function publishedTime(input: ProjectEstimateInput): ProjectTimeEstimate | null {
  if (!(input.publishedTimeHours != null && Number.isFinite(input.publishedTimeHours) && input.publishedTimeHours > 0)) return null;
  return {
    minutes: Math.round(input.publishedTimeHours * 60),
    source: "published",
    confidence: "high",
    method: "Published build-time estimate supplied by the project profile.",
  };
}

function calculatedTime(input: ProjectEstimateInput): ProjectTimeEstimate | null {
  if (!(input.assemblyDurationMinutes > 0)) return null;
  return {
    minutes: Math.round(input.assemblyDurationMinutes),
    source: "calculated",
    confidence: "medium",
    method: "Calculated from the durations on the current assembly steps.",
  };
}

function inferredTime(input: ProjectEstimateInput, category: RobotCategory): ProjectTimeEstimate {
  const difficultyFactor = input.difficulty ? DIFFICULTY_FACTOR[input.difficulty] : 1;
  const documentedWork = input.totalLines * 12 + input.assemblySteps * 30;
  return {
    minutes: Math.max(60, Math.round((BASE_TIME_MINUTES[category] + documentedWork) * difficultyFactor)),
    source: "inferred",
    confidence: "low",
    method: `Category and difficulty baseline adjusted by ${input.totalLines} BOM lines and ${input.assemblySteps} documented assembly steps.`,
  };
}
