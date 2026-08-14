import type { RppsPackage } from "../lib/rpps/schema";

export type ProjectKind = "physical_design" | "robotics_software" | "commercial_showcase" | "unknown";

export function classifyProjectKind(rpps: RppsPackage): ProjectKind {
  const hasBom = Array.isArray(rpps.bom) && rpps.bom.length > 0;
  const hasAssembly = Array.isArray(rpps.assembly) && rpps.assembly.length > 0;
  const hasPhysicalBuildEvidence = hasBom || hasAssembly || Boolean(rpps.build?.estimated_cost_usd || rpps.build?.required_tools?.length || rpps.build?.required_skills?.length);
  const hardware = rpps.hardware as Record<string, unknown> | undefined;
  const hasHardwareEvidence = Boolean(hardware && Object.values(hardware).some((value) => value !== undefined && value !== null && value !== ""));
  if (hasPhysicalBuildEvidence || hasHardwareEvidence) return "physical_design";

  const software = rpps.software;
  const hasSoftwareEvidence = Boolean(software && (software.middleware || (software.ros_support && software.ros_support !== "none")));
  if (hasSoftwareEvidence) return "robotics_software";

  const text = `${rpps.name} ${rpps.summary ?? ""} ${rpps.description ?? ""} ${(rpps.tags ?? []).join(" ")}`.toLowerCase();
  if (!rpps.repo_url && !rpps.license && /\b(commercial|showcase|product|vendor|manufacturer|closed-source|closed source)\b/.test(text)) return "commercial_showcase";

  return "unknown";
}

export function projectKindAfterRppsUpdate(currentKind: ProjectKind, rpps: RppsPackage): ProjectKind {
  // A commercial showcase is an explicit editorial/access classification, not
  // an inference from how many vendor-published specs happen to be recorded.
  // Keep it sticky so adding payload, DoF, or weight metadata cannot silently
  // turn a closed product into a purportedly reproducible physical design.
  if (currentKind === "commercial_showcase") return currentKind;
  return classifyProjectKind(rpps);
}
