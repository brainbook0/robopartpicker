# RPPS 0.1 Draft

The RoboPartPicker Project Standard (RPPS) is a portable, vendor-neutral coordination format for robotics releases. It connects existing CAD, firmware, configuration, BOM, documentation and test artifacts without replacing their native formats. RoboPartPicker is one implementation; a valid package must remain useful without the website.

This draft is not an industry standard and does not provide engineering certification. Conformance is determined by deterministic rules. AI may suggest corrections, but AI inference cannot grant conformance.

## Files

- `rpps.yaml` contains human-edited intent, portable object IDs, compatible ranges and artifact references.
- `rpps.lock.yaml` records exact component identities, source revisions and SHA-256 artifact hashes for an immutable release.
- Native artifacts remain in ordinary directories such as `artifacts/`, `assemblies/`, `firmware/`, `configuration/`, `calibration/`, `instructions/`, `tests/` and `evidence/`.

Unknown values inside the `extensions` map survive parsing and re-export. Extension keys must be namespaced, for example `org.example.feature`. RoboPartPicker additions use the `org.robopartpicker.*` namespace.

## Progressive profiles

- **Core:** identity, release, author, license declarations, artifact index and basic BOM.
- **Buildable:** resolved parts, assembly instructions, mechanical and electrical interfaces, configuration and calibration.
- **Reproducible:** exact lockfile, content hashes, tests, expected results and release-specific evidence.
- **Collaborative:** reusable assemblies, stable interface IDs, lineage and structured contribution support.

`Reproduced` and `Repeated` are evidence levels based on independent build outcomes, not structural profiles. `Current` is a freshness status and may expire independently of an achievement level.

## Standards composition

RPPS references rather than replaces established formats. Implementations should use SPDX license identifiers, CycloneDX for dependency interchange, Open Know-How mappings where applicable, SI units and ROS REP-103 coordinate conventions. URDF, MJCF, SDF, STEP, KiCad and other engineering files remain referenced native artifacts. An open-hardware claim should include the preferred modifiable source, not only manufacturing output.

SPDX 3.1 hardware-profile support is experimental until that version is a published specification. Adapters must identify their exact upstream version.

## Local reference commands

```text
npm run rpps:init -- my-robot
npm run rpps:validate -- path/to/rpps.yaml path/to/rpps.lock.yaml
npm run rpps:buildability -- path/to/rpps.yaml path/to/rpps.lock.yaml
npm run rpps:migrate -- legacy.rpps.json output/rpps.yaml
```

The checked-in runtime schemas and validation rules are the reference implementation for this draft. A future extraction will move them to a separately versioned, permissively licensed package before RPPS is presented as stable.
