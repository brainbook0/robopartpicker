const PHYSICAL_REPOSITORY_PATTERN = /(?:^|[-_\s/])(hardware|mechanical|cad|bom|bill[-_\s]?of[-_\s]?materials|3d[-_\s]?print|robot[-_\s]?(?:arm|hand|dog|car|platform|kit|actuator)|quadruped|hexapod|humanoid|rover|drone|gripper|exoskeleton|prosthetic|manipulator|mobile[-_\s]?robot)(?:$|[-_\s/])/i;
const HARDWARE_REPOSITORY_PATTERN = /(?:^|[-_\s/])(hardware|mechanical|bill[-_\s]?of[-_\s]?materials)(?:$|[-_\s/])/i;
const SOFTWARE_PATTERN = /\b(sdk|api|library|framework|middleware|simulator|simulation|navigation|slam|localization|mapping|perception|vision|planner|planning|controller|control stack|driver|ros ?1|ros ?2|dataset|benchmark|training|inference|reinforcement learning|machine learning|deep learning|autonomous driving software|continuous integration|ci\/cd|docker|kubernetes|plugin)\b/i;
const PHYSICAL_DESCRIPTION_PATTERN = /\b(open[- ]source|diy|build|printable|fabricat(?:e|ed|ion)|bill of materials|bom|cad files?|hardware design|mechanical design)\b[\s\S]{0,100}\b(robot|arm|hand|rover|drone|quadruped|humanoid|gripper|actuator|vehicle)\b|\b(robot|arm|hand|rover|drone|quadruped|humanoid|gripper|actuator|vehicle)\b[\s\S]{0,100}\b(open[- ]source hardware|diy|build|printable|fabricat(?:e|ed|ion)|bill of materials|bom|cad files?|hardware design|mechanical design)\b/i;

function nonEmpty(value) {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

const PARTITION_NAMES = new Set(["nvs", "otadata", "phyinit", "phy_init", "factory", "storage", "static", "www", "spiffs", "coredump", "ota0", "ota1", "ota_0", "ota_1", "app0", "app1"]);

function hasCredibleComponents(components) {
  if (!components.length) return false;
  const names = components.map((component) => String(component?.name ?? "").trim()).filter((name) => name && !name.startsWith("#"));
  if (!names.length) return false;
  const partitionCount = names.filter((name) => PARTITION_NAMES.has(name.toLowerCase().replace(/[^a-z0-9_]+/g, ""))).length;
  return partitionCount < 3 || partitionCount / names.length < 0.75;
}

export function classifyHarvestedProject(record, githubMetadata = null) {
  const analysis = record?.analysis ?? {};
  const extracted = analysis.extracted ?? {};
  const repository = extracted.repository ?? {};
  const manifest = analysis.manifest ?? {};
  const inventory = analysis.inventory ?? {};
  const artifacts = inventory.artifacts ?? [];
  const components = manifest.components ?? [];
  const assemblies = manifest.assemblies ?? [];
  const name = `${record?.slug ?? ""} ${analysis?.draft?.name ?? ""} ${record?.repository_url ?? ""}`;
  const description = `${githubMetadata?.description ?? ""} ${analysis?.draft?.summary ?? ""}`;
  const topics = (githubMetadata?.repositoryTopics?.nodes ?? []).map((node) => node?.topic?.name).filter(Boolean).join(" ");
  const text = `${name} ${description} ${topics}`;
  const explicitPhysicalIdentity = PHYSICAL_REPOSITORY_PATTERN.test(name) || PHYSICAL_DESCRIPTION_PATTERN.test(text);
  const nativeCadPaths = [...(repository.nativeCadArtifacts ?? []), ...artifacts.map((artifact) => artifact?.path)];
  const manufacturingPaths = [...(repository.manufacturingArtifacts ?? []), ...artifacts.map((artifact) => artifact?.path)];
  const hasNativeCad = nativeCadPaths.some((path) => /\.(?:step|stp|fcstd|f3d|sldprt|sldasm|ipt|iam|scad|dxf)$/i.test(String(path ?? "")));
  const hasManufacturing = manufacturingPaths.some((path) => /\.(?:stl|3mf|kicad_(?:pcb|sch)|brd|gerber|gbr)$/i.test(String(path ?? "")));
  if (hasCredibleComponents(components) || nonEmpty(assemblies) || hasNativeCad) {
    return { kind: "physical_design", evidence: "credible BOM, assembly, or native CAD evidence" };
  }
  if (explicitPhysicalIdentity && hasManufacturing && !SOFTWARE_PATTERN.test(text)) {
    return { kind: "physical_design", evidence: "physical robot identity plus manufacturing artifacts" };
  }
  if (HARDWARE_REPOSITORY_PATTERN.test(name) && !SOFTWARE_PATTERN.test(text)) {
    return { kind: "physical_design", evidence: "explicit hardware repository identity" };
  }

  const softwarePackages = extracted.software?.packages ?? [];
  const softwareEvidence = nonEmpty(softwarePackages) || SOFTWARE_PATTERN.test(text) || /(?:^|[-_])(ros|sdk|sim|slam|nav|vision|driver)(?:$|[-_])/i.test(String(record?.slug ?? ""));
  if (softwareEvidence) {
    return { kind: "robotics_software", evidence: "software/package/robotics-stack evidence" };
  }
  return { kind: "unknown", evidence: "insufficient evidence" };
}
