import { describe, expect, it } from "vitest";
import { classifyHarvestedProject } from "../../scripts/project-kind-classifier.mjs";

function record(slug: string, options: {
  components?: Array<{ name: string }>;
  nativeCad?: string[];
  manufacturing?: string[];
  packages?: unknown[];
  summary?: string;
} = {}) {
  return {
    slug,
    repository_url: `https://github.com/example/${slug}`,
    analysis: {
      draft: { name: slug, summary: options.summary ?? "" },
      inventory: { artifacts: [] },
      extracted: {
        repository: {
          nativeCadArtifacts: options.nativeCad ?? [],
          manufacturingArtifacts: options.manufacturing ?? [],
        },
        software: { packages: options.packages ?? [] },
      },
      manifest: { components: options.components ?? [], assemblies: [] },
    },
  };
}

describe("harvested project kind classifier", () => {
  it("classifies credible BOM and native CAD repositories as physical designs", () => {
    expect(classifyHarvestedProject(record("open-arm", { components: [{ name: "XT30 connector" }] })).kind).toBe("physical_design");
    expect(classifyHarvestedProject(record("moveo", { nativeCad: ["parts/base.FCStd"] })).kind).toBe("physical_design");
  });

  it("does not treat ESP partition tables as physical BOMs", () => {
    expect(classifyHarvestedProject(record("firmware", {
      components: [{ name: "nvs" }, { name: "phy_init" }, { name: "factory" }, { name: "storage" }],
    })).kind).not.toBe("physical_design");
  });

  it("does not treat simulation meshes alone as reproducible physical designs", () => {
    expect(classifyHarvestedProject(record("habitat-sim", { nativeCad: ["assets/room.glb"], packages: [{}] })).kind).toBe("robotics_software");
  });

  it("requires artifacts for generic robot-name matches but accepts explicit hardware repositories", () => {
    expect(classifyHarvestedProject(record("deep-learning-drone-control", { summary: "Reinforcement learning controller" })).kind).toBe("robotics_software");
    expect(classifyHarvestedProject(record("openloong-hardware")).kind).toBe("physical_design");
  });
});
