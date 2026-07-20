import { describe, expect, it } from "vitest";
import {
  PORTABLE_RPPS_VERSION,
  convertLegacyRpps,
  parsePortableRpps,
  parsePortableRppsLock,
  stringifyPortableRpps,
  validatePortableRpps,
} from "./portable";
import { emptyRpps } from "./schema";

const coreManifest = `
rpps: "0.1"
project:
  id: project:open-arm
  name: Open Arm
  slug: open-arm
release:
  id: release:open-arm:0.1.0
  version: 0.1.0
authors:
  - id: author:maintainer
    name: Maintainer
licenses:
  hardware: CERN-OHL-S-2.0
  software: Apache-2.0
  documentation: CC-BY-4.0
artifacts:
  - id: artifact:readme
    path: README.md
    kind: documentation
    sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
components:
  - id: component:motor
    name: Motor
    quantity: 2
    manufacturer: Example Robotics
    mpn: MOTOR-1
extensions:
  org.example.notes:
    nested:
      survives: true
`;

describe("portable RPPS", () => {
  it("parses YAML and preserves namespaced extensions through export", () => {
    const parsed = parsePortableRpps(coreManifest);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const exported = stringifyPortableRpps(parsed.data);
    const reparsed = parsePortableRpps(exported);
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) expect(reparsed.data.extensions?.["org.example.notes"]).toEqual({ nested: { survives: true } });
  });

  it("produces stable, explainable deterministic findings", () => {
    const parsed = parsePortableRpps(coreManifest);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const first = validatePortableRpps(parsed.data);
    const second = validatePortableRpps(parsed.data);
    expect(first.findings).toEqual(second.findings);
    expect(first.findings.every((finding) => finding.deterministic)).toBe(true);
    expect(first.profiles.core.score).toBe(100);
    expect(first.profiles.core.conformant).toBe(true);
    expect(first.profiles.buildable.score).toBeLessThan(100);
  });

  it("converts the legacy flat package without losing the source record", () => {
    const legacy = emptyRpps({ name: "Legacy Bot", slug: "legacy-bot", version: "1.2.3" });
    const converted = convertLegacyRpps(legacy);
    expect(converted.rpps).toBe(PORTABLE_RPPS_VERSION);
    expect(converted.project.name).toBe("Legacy Bot");
    expect(converted.extensions?.["org.robopartpicker.legacy.v1"]).toEqual(legacy);
  });

  it("rejects unnamespaced extension keys", () => {
    const invalid = coreManifest.replace("org.example.notes", "notes");
    const parsed = parsePortableRpps(invalid);
    expect(parsed.ok).toBe(false);
    if (parsed.ok === false) expect(parsed.errors.some((error) => error.includes("namespace"))).toBe(true);
  });

  it("does not treat a mismatched lockfile as exact resolution", () => {
    const manifest = parsePortableRpps(coreManifest);
    const lock = parsePortableRppsLock(`
rppsLock: "0.1"
release: { id: "release:open-arm:0.1.0", version: "0.1.0" }
artifacts:
  - { id: "artifact:readme", sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }
components:
  - { id: "component:motor", manufacturer: "Example Robotics", mpn: "MOTOR-1", quantity: 2 }
`);
    expect(manifest.ok).toBe(true); expect(lock.ok).toBe(true);
    if (!manifest.ok || !lock.ok) return;
    expect(validatePortableRpps(manifest.data, lock.data).findings.some((finding) => finding.ruleId === "RPPS-LOCK-002")).toBe(true);
  });
});
