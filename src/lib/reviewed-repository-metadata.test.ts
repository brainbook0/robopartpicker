import { describe, expect, it } from "vitest";
import checkedInWaveJson from "../../data/project-waves/2026-08-20-reviewed-repository-metadata.json";
import {
  buildReviewedRepositoryMetadataForwardSql,
  buildReviewedRepositoryMetadataRollbackSql,
  extractRepositoryDescription,
  githubLicenseVerificationState,
  githubRevisionTreeUrl,
  immutableGithubBlobUrl,
  normalizeGithubRepositoryDescription,
  normalizeVerifiedDocumentText,
  prepareRepositoryMetadataEvidence,
  repositoryDescriptionNeedsCleanup,
  repositoryDescriptionQualityIssues,
  reviewedMetadataOriginalStateAllowed,
  reviewedRepositoryMetadataSourceVerificationKey,
  reviewedRepositoryMetadataSourceVerificationKeys,
  serializeReviewedRepositoryMetadataRpps,
  serializeReviewedRepositoryMetadataRppsPreservingLegacy,
  summarizeRepositoryText,
  validateReviewedRepositoryMetadataSourceVerificationCheckpoint,
  validateReviewedRepositoryMetadataQuality,
  validateReviewedRepositoryMetadataWave,
  verifiedDocumentDescriptionMatches,
  type PreparedReviewedRepositoryMetadata,
  type ReviewedMetadataField,
  type ReviewedRepositoryMetadataDefinition,
  type ReviewedRepositoryMetadataRow,
  type ReviewedRepositoryMetadataWave,
} from "./reviewed-repository-metadata";

const revision = "a".repeat(40);
const readmeSha = "b".repeat(64);
const repositoryUrl = "https://github.com/example/robot";
const readmePath = "README.md";

const definition: ReviewedRepositoryMetadataDefinition = {
  slug: "example-robot",
  name: "Example Robot",
  project_kind: "physical_design",
  repository_url: repositoryUrl,
  revision,
  updates: {
    summary: "Example Robot is an open hardware mobile robot.",
    description: "Example Robot is an open hardware mobile robot for education and research.",
    license_spdx: "NOASSERTION",
  },
  sources: {
    summary: {
      derivation: "readme-summary",
      source_url: immutableGithubBlobUrl(repositoryUrl, revision, readmePath),
      path: readmePath,
      sha256: readmeSha,
      size_bytes: 1234,
    },
    description: {
      derivation: "readme-description",
      source_url: immutableGithubBlobUrl(repositoryUrl, revision, readmePath),
      path: readmePath,
      sha256: readmeSha,
      size_bytes: 1234,
    },
    license_spdx: {
      derivation: "github-license-absence",
      source_url: githubRevisionTreeUrl(repositoryUrl, revision),
    },
  },
};

const wave: ReviewedRepositoryMetadataWave = {
  wave: "reviewed-repository-metadata-test",
  schema_version: 1,
  reviewed_at: "2026-08-20T17:00:00.000Z",
  projects: [definition],
};

const row: ReviewedRepositoryMetadataRow = {
  id: "project-id",
  slug: definition.slug,
  name: definition.name,
  project_kind: definition.project_kind,
  repository_url: definition.repository_url,
  revision: definition.revision,
  summary: null,
  description: null,
  license_spdx: null,
  visibility: "public",
  status: "published",
  updated_at: "2026-08-20T16:00:00.000Z",
  current_version_id: "version-id",
  rpps_json: JSON.stringify({
    rpps_version: "1.0.0",
    name: definition.name,
    slug: definition.slug,
    version: "1.0.0",
    bom: [],
    project_kind: "physical_design",
    reproducibility: { status: "source-backed" },
  }),
};

function prepared(): PreparedReviewedRepositoryMetadata {
  const current = JSON.parse(row.rpps_json) as Record<string, unknown>;
  const evidence = prepareRepositoryMetadataEvidence(wave.wave, definition);
  const nextRppsJson = serializeReviewedRepositoryMetadataRpps({
    ...current,
    summary: definition.updates.summary,
    description: definition.updates.description,
    license: definition.updates.license_spdx,
    evidence: evidence.map((item) => ({
      claim: item.excerpt,
      source_type: item.sourceType,
      source_url: item.source.source_url,
      retrieved_at: wave.reviewed_at,
      confidence: item.confidence,
    })),
  });
  return {
    definition,
    row,
    nextSummary: definition.updates.summary!,
    nextDescription: definition.updates.description!,
    nextLicenseSpdx: definition.updates.license_spdx!,
    nextRppsJson,
    evidence,
  };
}

describe("reviewed repository metadata", () => {
  it("normalizes GitHub description whitespace identically for generation and verification", () => {
    expect(normalizeGithubRepositoryDescription("  Robot  platform\nfor\tresearch.  ")).toBe("Robot platform for research.");
    expect(normalizeGithubRepositoryDescription("A wrapper for [Robot](https://example.test/robot) motion planning.")).toBe(
      "A wrapper for Robot motion planning.",
    );
    expect(normalizeGithubRepositoryDescription(null)).toBe("");
  });

  it("detects raw imported descriptions while preserving concise source prose", () => {
    expect(repositoryDescriptionNeedsCleanup("Flix is an open-source ESP32-based quadcopter made from scratch.")).toBe(false);
    expect(repositoryDescriptionQualityIssues("# Install\n\n[Docs](https://example.test)\n\n- one\n- two\n- three\n- four"))
      .toEqual(expect.arrayContaining(["markup", "list-or-table"]));
    expect(repositoryDescriptionQualityIssues("x".repeat(1_201))).toContain("too-long");
  });

  it("allows guarded replacement only for matching noisy descriptions", () => {
    const noisy = "# Install\n\n- one\n- two\n- three\n- four";
    expect(reviewedMetadataOriginalStateAllowed("description", noisy, noisy)).toBe(true);
    expect(reviewedMetadataOriginalStateAllowed("description", noisy, "different")).toBe(false);
    expect(reviewedMetadataOriginalStateAllowed("description", "Concise source prose for a robot.", "Concise source prose for a robot.")).toBe(false);
    expect(reviewedMetadataOriginalStateAllowed("summary", "Existing summary", "Existing summary")).toBe(false);
    expect(reviewedMetadataOriginalStateAllowed("license_spdx", null, undefined)).toBe(true);
  });

  it("preserves existing unrelated legacy validation issues without allowing new ones", () => {
    const legacy = { ...JSON.parse(row.rpps_json), tags: ["x".repeat(41)] } as Record<string, unknown>;
    const next = { ...legacy, description: "Concise source-backed robot description." };
    expect(JSON.parse(serializeReviewedRepositoryMetadataRppsPreservingLegacy(legacy, next))).toMatchObject({
      description: "Concise source-backed robot description.",
      tags: ["x".repeat(41)],
    });
    expect(() => serializeReviewedRepositoryMetadataRppsPreservingLegacy(
      JSON.parse(row.rpps_json) as Record<string, unknown>,
      { ...JSON.parse(row.rpps_json), tags: ["x".repeat(41)] },
    )).toThrow("failed validation");
  });

  it("verifies exact prose and deterministic README descriptions from immutable documents", () => {
    const html = "<html><style>hidden</style><p>TurtleBot 4 is the world&#8217;s open source robotics platform.</p></html>";
    expect(normalizeVerifiedDocumentText(html, "html")).toBe("TurtleBot 4 is the world’s open source robotics platform.");
    expect(verifiedDocumentDescriptionMatches(
      html,
      "html",
      "exact-excerpt",
      "TurtleBot 4 is the world’s open source robotics platform.",
    )).toBe(true);
    expect(verifiedDocumentDescriptionMatches(
      "# Robot\n\nRobot is an open source mobile robot for research.",
      "markdown",
      "repository-description",
      "Robot is an open source mobile robot for research.",
    )).toBe(true);
  });

  it("accepts only immutable verified document description sources", () => {
    const sourceDefinition: ReviewedRepositoryMetadataDefinition = {
      ...definition,
      updates: { description: "Robot is an open source mobile robot for research." },
      sources: {
        description: {
          derivation: "verified-document-description",
          source_url: `https://github.com/example/robot-archive/blob/${revision}/README.md`,
          content_url: `https://raw.githubusercontent.com/example/robot-archive/${revision}/README.md`,
          document_format: "markdown",
          description_extraction: "repository-description",
          sha256: readmeSha,
          size_bytes: 1234,
        },
      },
    };
    expect(validateReviewedRepositoryMetadataWave({ ...wave, projects: [sourceDefinition] })).toEqual([]);
    const mutable = structuredClone(sourceDefinition);
    mutable.sources.description!.source_url = "https://example.test/README.md";
    expect(validateReviewedRepositoryMetadataWave({ ...wave, projects: [mutable] })).toContain(
      "example-robot: verified document source_url must be an immutable Wayback capture or GitHub blob URL",
    );
  });

  it("does not misclassify GitHub quota failures as newly detected licenses", () => {
    expect(githubLicenseVerificationState(404, false)).toBe("absent");
    expect(githubLicenseVerificationState(200, true)).toBe("detected");
    expect(githubLicenseVerificationState(403, false)).toBe("unavailable");
    expect(githubLicenseVerificationState(429, false)).toBe("unavailable");
  });

  it("uses stable source keys and rejects checkpoint evidence outside the current wave", () => {
    const reorderedSource = {
      size_bytes: 1234,
      sha256: readmeSha,
      path: readmePath,
      source_url: immutableGithubBlobUrl(repositoryUrl, revision, readmePath),
      derivation: "readme-description" as const,
    };
    const sourceKey = reviewedRepositoryMetadataSourceVerificationKey(definition, definition.sources.description!);
    expect(reviewedRepositoryMetadataSourceVerificationKey(definition, reorderedSource)).toBe(sourceKey);
    const expectedKeys = reviewedRepositoryMetadataSourceVerificationKeys(wave);
    const checkpoint = {
      schema_version: 1 as const,
      env: "production",
      wave: wave.wave,
      reviewed_at: wave.reviewed_at,
      wave_projects: wave.projects.length,
      source_total: expectedKeys.length,
      verified_keys: expectedKeys,
      started_at: "2026-08-20T21:00:00.000Z",
      updated_at: "2026-08-20T21:01:00.000Z",
    };
    expect(validateReviewedRepositoryMetadataSourceVerificationCheckpoint(checkpoint, wave, "production")).toEqual([]);
    expect(validateReviewedRepositoryMetadataSourceVerificationCheckpoint({
      ...checkpoint,
      verified_keys: [...expectedKeys, "not-in-this-wave"],
    }, wave, "production")).toContain("checkpoint contains a source key outside the current wave");
  });

  it("extracts concise project prose while skipping badges, navigation, and setup sections", () => {
    const markdown = [
      "# Robot Project",
      "[![Build status](https://img.shields.io/badge/build-passing.svg)](https://example.test)",
      "",
      "> [!IMPORTANT]",
      "> The repository moved recently.",
      "",
      "Robot Project is an open-source mobile manipulator platform for education and research. It provides CAD, firmware, and ROS integration.",
      "",
      "## Installation",
      "Run `pip install robot-project` and configure the workspace.",
    ].join("\n");

    const description = extractRepositoryDescription(markdown);
    expect(description).toBe("Robot Project is an open-source mobile manipulator platform for education and research. It provides CAD, firmware, and ROS integration.");
    expect(description).not.toContain("shields.io");
    expect(description).not.toContain("pip install");
  });

  it("skips RST license and badge preambles in favor of the descriptive paragraph", () => {
    const readme = [
      ".. Copyright 2024 The Authors",
      ".. Licensed under the Apache License, Version 2.0",
      ".. image:: https://img.shields.io/badge/tests-passing.svg",
      "   :target: https://example.test",
      "",
      "Cartographer is a system that provides real-time simultaneous localization and mapping in 2D and 3D across multiple platforms.",
      "",
      "Installation",
      "============",
      "Install the dependencies.",
    ].join("\n");

    expect(extractRepositoryDescription(readme)).toBe(
      "Cartographer is a system that provides real-time simultaneous localization and mapping in 2D and 3D across multiple platforms.",
    );
  });

  it("summarizes informative source prose and skips promotional begging text", () => {
    expect(summarizeRepositoryText("来颗Star求求了。完成了核心步态实时生成算法的设计，运算量小，可装载在嵌入式系统中。"))
      .toBe("完成了核心步态实时生成算法的设计，运算量小，可装载在嵌入式系统中。");
  });

  it("prefers a project introduction over clone and installation instructions", () => {
    const readme = [
      "#Hexapod-robot",
      "",
      "This repository contains the components to control the Phantom-X robot.",
      "",
      "First, you should clone the RoboComp repository and install it on your PC.",
      "",
      "git clone https://github.com/example/hexapod.git",
    ].join("\n");
    expect(extractRepositoryDescription(readme)).toBe(
      "This repository contains the components to control the Phantom-X robot.",
    );
  });

  it("prefers concise CJK project prose over source-code URL lists", () => {
    const readme = [
      "# 来颗Star求求了",
      "",
      "基于实时反馈和遗传算法的六足机器人全面步态优化系统设计。",
      "",
      "https://github.com/example/robot/blob/main/src/balance_task.c",
      "https://github.com/example/robot/blob/main/src/action_task.c",
    ].join("\n");
    expect(extractRepositoryDescription(readme)).toBe("基于实时反馈和遗传算法的六足机器人全面步态优化系统设计。");
  });

  it("validates immutable source evidence and rejects invented license values", () => {
    expect(validateReviewedRepositoryMetadataWave(wave)).toEqual([]);
    const invalid: ReviewedRepositoryMetadataWave = {
      ...wave,
      projects: [{
        ...definition,
        updates: { license_spdx: "MIT" },
        sources: {
          license_spdx: {
            derivation: "github-license-absence",
            source_url: githubRevisionTreeUrl(repositoryUrl, revision),
          },
        },
      }],
    };
    expect(validateReviewedRepositoryMetadataWave(invalid)).toContain("example-robot: absent license must use NOASSERTION");
  });

  it("rejects setup instructions masquerading as reviewed README descriptions", () => {
    const noisy: ReviewedRepositoryMetadataWave = {
      ...wave,
      projects: [{
        ...definition,
        updates: { description: "Please install the dependencies and git clone this repository." },
        sources: { description: definition.sources.description },
      }],
    };
    expect(validateReviewedRepositoryMetadataQuality(noisy)).toContain(
      "example-robot: README description contains setup instructions",
    );
  });

  it("accepts a detected empty license file when its zero-byte hash is pinned", () => {
    const emptyLicenseDefinition: ReviewedRepositoryMetadataDefinition = {
      ...definition,
      updates: { license_spdx: "NOASSERTION" },
      sources: {
        license_spdx: {
          derivation: "github-license-file",
          source_url: immutableGithubBlobUrl(repositoryUrl, revision, "LICENSE.md"),
          path: "LICENSE.md",
          sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          size_bytes: 0,
          spdx_id: "NOASSERTION",
        },
      },
    };
    expect(validateReviewedRepositoryMetadataWave({ ...wave, projects: [emptyLicenseDefinition] })).toEqual([]);
  });

  it("allows a commercial product version without treating it as a Git revision", () => {
    const commercial: ReviewedRepositoryMetadataDefinition = {
      slug: "example-commercial-robot",
      name: "Example Commercial Robot",
      project_kind: "commercial_showcase",
      repository_url: null,
      revision: "generation-2",
      updates: { license_spdx: "NOASSERTION" },
      sources: {
        license_spdx: {
          derivation: "commercial-catalog-status",
          source_url: "https://example.com/robots/generation-2",
        },
      },
    };
    expect(validateReviewedRepositoryMetadataWave({ ...wave, projects: [commercial] })).toEqual([]);
  });

  it("preserves RPPS extension fields and generates guarded reversible SQL", () => {
    const project = prepared();
    const parsed = JSON.parse(project.nextRppsJson) as Record<string, unknown>;
    expect(parsed.project_kind).toBe("physical_design");
    expect(parsed.reproducibility).toEqual({ status: "source-backed" });

    const now = "2026-08-20T18:00:00.000Z";
    const forward = buildReviewedRepositoryMetadataForwardSql([project], wave, now);
    expect(forward).toContain("p.summary IS NULL");
    expect(forward).toContain("p.description IS NULL");
    expect(forward).toContain("p.license_spdx IS NULL");
    expect(forward).toContain("INSERT INTO evidence_claims");
    expect(forward).toContain("UPDATE project_versions SET rpps_json");
    expect(forward).toContain("license_spdx = 'NOASSERTION'");
    expect(forward).toContain("json_extract(rpps_json, '$.license') IS NULL");
    expect(forward).toContain("AND summary IS NULL AND description IS NULL AND license_spdx IS NULL AND visibility");

    const rollback = buildReviewedRepositoryMetadataRollbackSql([project], wave, now);
    expect(rollback).toContain("DELETE FROM evidence_claims");
    expect(rollback).toContain("UPDATE project_versions SET rpps_json");
    expect(rollback).toContain("summary = NULL");
    expect(rollback).toContain("license_spdx = NULL");
    expect(rollback).toContain("json_extract(rpps_json, '$.license') IS 'NOASSERTION'");
    expect(rollback).toContain("AND summary IS 'Example Robot is an open hardware mobile robot.'");
  });

  it("keeps statements below D1 limits when an untouched description is large", () => {
    const largeDescription = "Source-backed project documentation for a mature robotics package.";
    const largeLegacyPayload = "legacy-extension-data".repeat(3_200);
    const licenseDefinition: ReviewedRepositoryMetadataDefinition = {
      ...definition,
      updates: { license_spdx: "NOASSERTION" },
      sources: { license_spdx: definition.sources.license_spdx },
    };
    const largeRow: ReviewedRepositoryMetadataRow = {
      ...row,
      summary: "Existing summary",
      description: largeDescription,
      rpps_json: JSON.stringify({
        rpps_version: "1.0.0",
        name: definition.name,
        slug: definition.slug,
        version: "1.0.0",
        bom: [],
        summary: "Existing summary",
        description: largeDescription,
        legacy_payload: largeLegacyPayload,
      }),
    };
    const evidence = prepareRepositoryMetadataEvidence(wave.wave, licenseDefinition);
    const nextRppsJson = serializeReviewedRepositoryMetadataRpps({
      ...JSON.parse(largeRow.rpps_json),
      license: "NOASSERTION",
      evidence: evidence.map((item) => ({
        claim: item.excerpt,
        source_type: item.sourceType,
        source_url: item.source.source_url,
        retrieved_at: wave.reviewed_at,
        confidence: item.confidence,
      })),
    });
    const project: PreparedReviewedRepositoryMetadata = {
      definition: licenseDefinition,
      row: largeRow,
      nextSummary: largeRow.summary,
      nextDescription: largeRow.description,
      nextLicenseSpdx: "NOASSERTION",
      nextRppsJson,
      evidence,
    };
    const statementSizes = (sql: string) => sql.split(";").map((statement) => new TextEncoder().encode(statement).byteLength).filter(Boolean);
    const forward = buildReviewedRepositoryMetadataForwardSql([project], wave, "2026-08-20T19:00:00.000Z");
    const rollback = buildReviewedRepositoryMetadataRollbackSql([project], wave, "2026-08-20T19:00:00.000Z");
    expect(Math.max(...statementSizes(forward))).toBeLessThan(100_000);
    expect(Math.max(...statementSizes(rollback))).toBeLessThan(100_000);
    expect(forward.split(largeLegacyPayload)).toHaveLength(2);
    expect(rollback.split(largeLegacyPayload)).toHaveLength(2);
  });

  it("locks the checked-in 843-project wave to a zero-empty, reviewed prose checklist", () => {
    const checkedInWave = checkedInWaveJson as unknown as ReviewedRepositoryMetadataWave;
    expect(validateReviewedRepositoryMetadataWave(checkedInWave)).toEqual([]);
    expect(validateReviewedRepositoryMetadataQuality(checkedInWave)).toEqual([]);
    expect(checkedInWave.projects).toHaveLength(843);

    const updates = checkedInWave.projects.flatMap((project) => Object.entries(project.updates)
      .map(([field, value]) => ({ slug: project.slug, field, value: value ?? "", source: project.sources[field as ReviewedMetadataField] })));
    expect(updates.filter((item) => item.field === "summary")).toHaveLength(2);
    expect(updates.filter((item) => item.field === "description")).toHaveLength(240);
    expect(updates.filter((item) => item.field === "license_spdx")).toHaveLength(689);
    expect(updates.every((item) => item.value.trim().length > 0 && item.source)).toBe(true);

    const descriptions = updates.filter((item) => item.field === "description");
    const summaries = updates.filter((item) => item.field === "summary");
    const reviewedProse = [...descriptions, ...summaries];
    expect(reviewedProse.filter((item) => /(?:shields\.io|build status|table of contents|^#{1,6}\s|\b(?:git clone|pip install|npm install|navigate to|please install|run the following)\b)/iu.test(item.value))).toEqual([]);
    expect(summaries.map((item) => [item.slug, item.value])).toEqual([
      ["ibarbech-hexapod-robot", "This repository contains the components, to control the robot phantom-x."],
      ["pikastech-hexapod-robot-stm32", "基于实时反馈和遗传算法的六足机器人全面步态优化系统设计。"],
    ]);
    expect(descriptions.filter((item) => item.source?.derivation === "github-repository-description")).toHaveLength(240);
    expect(descriptions.filter((item) => item.source?.derivation === "readme-description")).toHaveLength(0);

    const licenses = updates.filter((item) => item.field === "license_spdx");
    expect(licenses.filter((item) => item.value === "NOASSERTION")).toHaveLength(687);
    expect(licenses.filter((item) => item.value !== "NOASSERTION").map((item) => [item.slug, item.value])).toEqual([
      ["easy-handeye", "LGPL-3.0"],
      ["rtklib-ros-bridge", "BSD-3-Clause"],
    ]);
  });
});
