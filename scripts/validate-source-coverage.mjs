import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_DIR = resolve(ROOT, "config", "data-collection");
const DEFAULT_INVENTORY_PATH = resolve(ROOT, "..", "robopartpicker data collection.txt");
const INVENTORY_SHA256 = "ec9336c4f8ddd32d1cb64868037d2b5b34023185ac637ea9cae1b87d70f1e7e0";
const INVENTORY_LINE_COUNT = 1694;
const CONFIG_VERSION = "1.0.0";

const SECTION_TITLES = [
  "Universal metadata for every scraped record",
  "Actuators, motors, and integrated joints",
  "Hands, grippers, and end effectors",
  "Sensors",
  "Compute modules, embedded computers, and motor controllers",
  "Reducers, gearboxes, and transmissions",
  "Batteries, BMS, and power systems",
  "Structural components and fabrication stock",
  "Bearings, shafts, fasteners, and mechanical hardware",
  "Wheels, tracks, mobile bases, and drivetrain components",
  "Cables, connectors, and wiring",
  "Microcontrollers and embedded boards",
  "Safety systems",
  "Software, SDKs, drivers, and firmware",
  "CAD, robot-description files, and digital twins",
  "Fabrication services",
  "Tools and test equipment",
  "Commercial complete robots",
  "Open-source robot projects",
  "Repository contents",
  "BOM records",
  "Build instructions and recipes",
  "Reproductions, forks, and variants",
  "Integration bundles and reference architectures",
  "Substitutions and alternatives",
  "Normalization and compatibility reference data",
  "Teardowns",
  "Manufacturers",
  "Suppliers and vendors",
  "Supplier offers",
  "Marketplace listings",
  "Build logs",
  "Component reviews and real-world experience",
  "BOM corrections",
  "Supplier experiences",
  "Measured component performance",
  "Community discussions and annotations",
  "Papers, articles, and reports",
];

const FIELD_RANGES = {
  1: [[9, 24], [32, 37]],
  2: [[44, 101]],
  3: [[123, 158]],
  4: [[195, 233]],
  5: [[258, 298], [302, 311]],
  6: [[329, 358]],
  7: [[391, 414]],
  8: [[443, 457]],
  9: [[468, 485]],
  10: [[495, 512]],
  11: [[522, 542]],
  12: [[554, 581]],
  13: [[604, 618]],
  14: [[628, 652]],
  15: [[684, 721]],
  16: [[736, 754]],
  17: [[780, 789]],
  18: [[802, 839]],
  19: [[859, 899]],
  20: [[915, 956]],
  21: [[963, 982], [984, 1006]],
  22: [[1032, 1055]],
  23: [[1069, 1096]],
  24: [[1108, 1135]],
  25: [[1149, 1166]],
  26: [[1182, 1198]],
  27: [[1205, 1228]],
  28: [[1248, 1265]],
  29: [[1277, 1296]],
  30: [[1314, 1340]],
  31: [[1365, 1387]],
  32: [[1407, 1420]],
  33: [[1435, 1451]],
  34: [[1465, 1476]],
  35: [[1486, 1498]],
  36: [[1511, 1527]],
  37: [[1541, 1555]],
  38: [[1587, 1602]],
};

const TERM_RANGES = {
  1: [{ kind: "evidence_classification", range: [26, 31] }],
  4: [{ kind: "sensor_category", range: [178, 193] }],
  7: [{ kind: "product_type", range: [375, 389] }],
  8: [{ kind: "product_type", range: [429, 441] }],
  13: [{ kind: "product_type", range: [593, 602] }],
  15: [{ kind: "file_format", range: [664, 682] }],
  17: [{ kind: "product_type", range: [765, 778] }],
  38: [{ kind: "publication_type", range: [1576, 1585] }],
};

const SOURCE_RANGES = {
  2: [[106, 120]], 3: [[163, 175]], 4: [[238, 255]], 5: [[316, 326]],
  6: [[363, 372]], 7: [[416, 423]], 8: [[459, 465]], 9: [[487, 492]],
  10: [[514, 519]], 11: [[544, 551]], 12: [[583, 590]], 13: [[620, 625]],
  14: [[654, 661]], 15: [[723, 730]], 16: [[756, 762]], 17: [[791, 795]],
  18: [[844, 856]], 19: [[901, 910]], 21: [[1011, 1023]], 22: [[1057, 1063]],
  23: [[1098, 1104]], 24: [[1137, 1144]], 25: [[1168, 1174]], 27: [[1233, 1244]],
  28: [[1267, 1271]], 29: [[1301, 1311]], 30: [[1345, 1362]], 31: [[1392, 1401]],
  32: [[1422, 1427]], 33: [[1453, 1457]], 34: [[1478, 1481]], 35: [[1500, 1503]],
  36: [[1529, 1533]], 37: [[1557, 1567]], 38: [[1604, 1612]],
};

const SOURCE_TIERS = [
  { tier: "tier_1_structured", line_range: [1629, 1639], wave: "structured_expansion" },
  { tier: "tier_2_semi_structured", line_range: [1641, 1648], wave: "semi_structured" },
  { tier: "tier_3_unstructured", line_range: [1650, 1658], wave: "unstructured_deferred" },
];

const CAPABILITY_FLAGS = ["discover", "acquire", "snapshot", "extract", "normalize", "submit"];

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function slug(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function readInventory(inventoryPath) {
  if (!existsSync(inventoryPath)) {
    fail(`Canonical inventory not found: ${inventoryPath}`);
  }
  const raw = readFileSync(inventoryPath);
  const hash = sha256(raw);
  if (hash !== INVENTORY_SHA256) {
    fail(`Canonical inventory hash mismatch: expected ${INVENTORY_SHA256}, received ${hash}`);
  }
  const lines = raw.toString("utf8").replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines.length !== INVENTORY_LINE_COUNT) {
    fail(`Canonical inventory line count mismatch: expected ${INVENTORY_LINE_COUNT}, received ${lines.length}`);
  }
  return { lines, hash };
}

function valuesAt(lines, ranges) {
  return (ranges ?? []).flatMap(([start, end]) =>
    lines.slice(start - 1, end).map((label, offset) => ({
      inventory_line: start + offset,
      inventory_label: label,
    })),
  );
}

function inferFieldShape(label) {
  const lower = label.toLowerCase();
  if (/(timestamp|last checked|last successful check|last activity|last modified)/.test(lower)) {
    return { value_type: "date_time", expected_unit: null, normalizer: "iso8601_datetime_v1", temporal_behavior: "time_series" };
  }
  if (/(^date$|publication date|start date|completion date|order date|teardown date|release year|date posted)/.test(lower)) {
    return { value_type: "date_or_year", expected_unit: null, normalizer: "iso8601_date_or_year_v1", temporal_behavior: "revision_aware" };
  }
  if (/(url|website|repository$|product link|purchase or inquiry link|datasheet|cad or code link|fork repository)/.test(lower)) {
    return { value_type: "uri_or_reference", expected_unit: null, normalizer: "https_or_immutable_reference_v1", temporal_behavior: "revision_aware" };
  }
  if (/(count|number of|degrees of freedom|dof|cpu cores|pin count|gpio count|axes$|finger count|actuator count|part count|unique-part count)/.test(lower)) {
    return { value_type: "integer", expected_unit: "count", normalizer: "non_negative_integer_v1", temporal_behavior: "revision_aware" };
  }
  if (/(price|cost|currency|stock|lead time|availability|quantity available|shipping cost|price breaks|moq|minimum order)/.test(lower)) {
    return { value_type: "commercial_observation", expected_unit: "source_declared", normalizer: "commercial_observation_v1", temporal_behavior: "time_series" };
  }
  if (/(torque|speed|weight|dimension|voltage|current|power|force|payload|resolution|accuracy|precision|repeatability|range|latency|field of view|frame rate|wavelength|capacity|energy|load|backlash|efficiency|ratio|stiffness|temperature|frequency|clock|ram|flash|storage|duration|time per step|wall thickness|density|pitch|tolerance)/.test(lower)) {
    return { value_type: "quantity_or_range", expected_unit: "source_declared_si_normalizable", normalizer: "quantity_si_v1", temporal_behavior: "revision_aware" };
  }
  if (/(state|status|type|category|class|mode|chemistry|architecture|condition|license|rating|protocol|interface|standard|revision)/.test(lower)) {
    return { value_type: "controlled_or_source_text", expected_unit: null, normalizer: "taxonomy_alias_v1", temporal_behavior: "revision_aware" };
  }
  if (/(files|offers|links|issues|dependencies|requirements|features|relationships|history|suite|steps|instructions|results|problems|resolutions|changes|measurements|configuration|evidence)/.test(lower)) {
    return { value_type: "structured_value", expected_unit: null, normalizer: "bounded_structured_value_v1", temporal_behavior: "revision_aware" };
  }
  return { value_type: "text", expected_unit: null, normalizer: "trim_nfkc_preserve_original_v1", temporal_behavior: "revision_aware" };
}

function classifySource(label) {
  const value = label.toLowerCase();
  if (/(github|gitlab|repository|repositories|ros index|ros package|package repositories|pypi|npm|readme|wiki|pull request|project fork|maintainer documentation|release notes|project documentation|poppy project|inmoov|mit biomimetics|stanford student robotics|isaac packages|workbench|sdk examples)/.test(value)) {
    return { source_tier: "repository", adapter_family: "repository_api", extraction_methods: ["api_json", "bounded_repository_files"], formats: ["json", "markdown", "repository_metadata"], cadence: "weekly", risk: "medium", wave: "structured_expansion" };
  }
  if (/(youtube|video)/.test(value)) {
    return { source_tier: "media", adapter_family: "media_metadata", extraction_methods: ["permitted_metadata", "transcript_reference"], formats: ["html", "transcript"], cadence: "monthly", risk: "high", wave: "unstructured_deferred" };
  }
  if (/(reddit|discourse|forum|forums|hackaday|instructables|community|builder|build log|build report|review)/.test(value)) {
    return { source_tier: "community", adapter_family: "community_reference", extraction_methods: ["permitted_excerpt", "structured_claim"], formats: ["html", "json"], cadence: "monthly", risk: "high", wave: "unstructured_deferred" };
  }
  if (/(aliexpress|amazon|ebay|labx|govdeals|alibaba|indiamart|marketplace|surplus|classified)/.test(value)) {
    return { source_tier: "marketplace", adapter_family: "marketplace_listing", extraction_methods: ["structured_listing", "metadata_reference"], formats: ["html", "json"], cadence: "daily", risk: "high", wave: "semi_structured" };
  }
  if (/(digikey|mouser|farnell|robotshop|trossen|mcmaster|misumi|bolt depot|distributor|generation robots|active robots|sparkfun|adafruit|hobbyking|octopart|thomasnet|trade directories)/.test(value)) {
    return { source_tier: "authorized_distributor", adapter_family: "distributor_catalog", extraction_methods: ["api_json", "structured_html"], formats: ["json", "html", "pdf"], cadence: "daily", risk: "medium", wave: "structured_expansion" };
  }
  if (/(arxiv|ieee|research|paper|papers|publication|technical report|wevolver|construction physics|wikipedia|university|fcc|cnet|the robot report|bunnie studios|ifixit|diy robocars)/.test(value)) {
    return { source_tier: "standards_reference", adapter_family: "publication_document", extraction_methods: ["metadata", "bounded_document"], formats: ["html", "pdf", "json"], cadence: "monthly", risk: "medium", wave: "semi_structured" };
  }
  if (/(grabcad|thingiverse|onshape|cad portal|project website)/.test(value)) {
    return { source_tier: "other", adapter_family: "cad_reference", extraction_methods: ["metadata_reference", "bounded_file_manifest"], formats: ["html", "cad_metadata"], cadence: "monthly", risk: "high", wave: "unstructured_deferred" };
  }
  return { source_tier: "official_manufacturer", adapter_family: "official_web", extraction_methods: ["structured_html", "bounded_document"], formats: ["html", "pdf", "json"], cadence: "monthly", risk: "medium", wave: "structured_expansion" };
}

function buildAdapterFamilies() {
  const family = (description, capabilities, formats) => ({
    description,
    capabilities: Object.fromEntries(CAPABILITY_FLAGS.map((flag) => [flag, capabilities.includes(flag)])),
    formats,
  });
  return {
    schema_version: CONFIG_VERSION,
    protocol: {
      name: "SourceAdapter",
      capability_flags: CAPABILITY_FLAGS,
      lifecycle_order: CAPABILITY_FLAGS,
      rule: "Every adapter declares all six flags; unsupported stages fail closed instead of being omitted.",
    },
    families: {
      official_web: family("Official manufacturer or project web and document sources.", CAPABILITY_FLAGS, ["html", "json", "pdf"]),
      distributor_catalog: family("Authorized distributor catalogs and APIs.", CAPABILITY_FLAGS, ["json", "html", "csv", "pdf"]),
      repository_api: family("Repository, package, and ROS indexes with bounded file acquisition.", CAPABILITY_FLAGS, ["json", "markdown", "csv", "tsv", "yaml", "xml"]),
      marketplace_listing: family("Volatile offer and marketplace metadata; retention is policy-dependent.", CAPABILITY_FLAGS, ["json", "html"]),
      community_reference: family("Community facts and permitted excerpts stored as attributed claims and links.", CAPABILITY_FLAGS, ["json", "html", "markdown"]),
      media_metadata: family("Media metadata and permitted transcript references; no media mirroring.", CAPABILITY_FLAGS, ["json", "html", "transcript"]),
      publication_document: family("Research, standards, reports, and bounded documents.", CAPABILITY_FLAGS, ["json", "html", "pdf"]),
      cad_reference: family("CAD portal metadata and bounded approved file manifests.", CAPABILITY_FLAGS, ["json", "html", "cad_metadata"]),
      metadata_only: family("Reference-only source used when acquisition or reuse is not approved.", ["discover", "normalize", "submit"], ["metadata"]),
    },
  };
}

function buildPilotSources() {
  const policyEvidence = [
    "base_url_and_source_identity",
    "robots_txt_review",
    "terms_of_service_review",
    "copyright_or_reuse_review",
    "rate_and_cost_budget",
    "user_agent_and_contact",
    "owner_approval",
  ];
  const pilot = (candidate, adapter, access, cost, fixture) => ({
    candidate_source_family: candidate,
    enabled: false,
    policy_state: "unreviewed",
    adapter_family: adapter,
    access_method: access,
    cost_class: cost,
    required_policy_preflight_evidence: policyEvidence,
    fixture_directory: fixture,
  });
  return {
    schema_version: CONFIG_VERSION,
    live_access_gate: "A source_policy_revision must be approved_live and enabled separately before any network contact.",
    monthly_incremental_ai_budget_usd: 50,
    pilots: {
      manufacturer_pilot: pilot("Robotis e-Manual and Dynamixel documentation", "official_web", "official_https", "cloudflare_infra", "collector/tests/fixtures/manufacturer_pilot"),
      distributor_pilot: pilot("DigiKey", "distributor_catalog", "official_api_or_catalog", "paid_source_api", "collector/tests/fixtures/distributor_pilot"),
      github_repository_pilot: pilot("GitHub", "repository_api", "official_api", "cloudflare_infra", "collector/tests/fixtures/github_repository_pilot"),
      ros_bom_pilot: pilot("Poppy Project", "repository_api", "public_repository_reference", "cloudflare_infra", "collector/tests/fixtures/ros_bom_pilot"),
      volatile_offer_pilot: pilot("RobotShop", "marketplace_listing", "public_catalog_listing", "cloudflare_infra", "collector/tests/fixtures/volatile_offer_pilot"),
    },
  };
}

function buildCoverage(lines) {
  const sections = SECTION_TITLES.map((title, index) => ({
    section_id: index + 1,
    title,
    field_count: valuesAt(lines, FIELD_RANGES[index + 1]).length,
    term_count: (TERM_RANGES[index + 1] ?? []).reduce((count, item) => count + valuesAt(lines, [item.range]).length, 0),
    source_occurrence_count: valuesAt(lines, SOURCE_RANGES[index + 1]).length,
    wave: index + 1 === 1 ? "foundation" : "inventory_backlog",
    owner: "data_collection",
  }));

  const sourceMap = new Map();
  for (const section of sections) {
    for (const item of valuesAt(lines, SOURCE_RANGES[section.section_id])) {
      const key = item.inventory_label;
      if (!sourceMap.has(key)) {
        sourceMap.set(key, {
          source_id: slug(key),
          source_name: key,
          policy_state: "unreviewed",
          owner: "data_collection",
          ...classifySource(key),
          inventory_occurrences: [],
        });
      }
      sourceMap.get(key).inventory_occurrences.push({
        section_id: section.section_id,
        inventory_line: item.inventory_line,
      });
    }
  }

  const sources = [...sourceMap.values()].sort((a, b) => a.source_id.localeCompare(b.source_id));
  for (const source of sources) {
    source.deferment_reason = source.wave === "unstructured_deferred"
      ? "Deferred pending source-specific policy approval and bounded unstructured extraction."
      : null;
  }

  const sourceTiers = SOURCE_TIERS.map(({ tier, line_range, wave }) => ({
    tier,
    wave,
    entries: valuesAt(lines, [line_range]),
  }));

  const canonicalObjectTypes = valuesAt(lines, [[1666, 1692]]).map((item) => ({
    ...item,
    object_type: slug(item.inventory_label),
    coverage_state: "supported",
    storage_path: item.inventory_label === "Data conflict"
      ? "claim_conflict_sets"
      : item.inventory_label === "Missing-information record"
        ? "collection_missing_information"
        : "existing_canonical_or_typed_claim",
  }));

  return {
    schema_version: CONFIG_VERSION,
    inventory: {
      sha256: INVENTORY_SHA256,
      line_count: INVENTORY_LINE_COUNT,
      scope: "complete_lines_1_through_1693_and_known_line_1694_prefix",
    },
    sections,
    sources,
    source_tiers: sourceTiers,
    initial_scale: valuesAt(lines, [[1617, 1626]]),
    canonical_object_types: canonicalObjectTypes,
    deferred_unknown_tail: {
      inventory_line: 1694,
      known_prefix: lines[1693],
      state: "deferred",
      reason: "The canonical inventory ends mid-sentence; no suffix is invented.",
    },
  };
}

function buildFieldCoverage(lines) {
  const fields = [];
  const terms = [];
  for (let sectionId = 1; sectionId <= SECTION_TITLES.length; sectionId += 1) {
    const namespace = `section_${String(sectionId).padStart(2, "0")}_${slug(SECTION_TITLES[sectionId - 1])}`;
    const seenSlugs = new Map();
    for (const item of valuesAt(lines, FIELD_RANGES[sectionId])) {
      const base = slug(item.inventory_label);
      const occurrence = (seenSlugs.get(base) ?? 0) + 1;
      seenSlugs.set(base, occurrence);
      fields.push({
        section_id: sectionId,
        inventory_line: item.inventory_line,
        inventory_label: item.inventory_label,
        claim_key: `${namespace}.${base}${occurrence > 1 ? `_${occurrence}` : ""}`,
        ...inferFieldShape(item.inventory_label),
        evidence_locator_classes: [
          "html_selector",
          "json_pointer",
          "table_cell",
          "pdf_page_span",
          "repository_path_line",
          "media_timestamp",
          "user_annotation",
        ],
        coverage_state: "supported",
      });
    }
    for (const block of TERM_RANGES[sectionId] ?? []) {
      for (const item of valuesAt(lines, [block.range])) {
        terms.push({
          section_id: sectionId,
          inventory_line: item.inventory_line,
          inventory_label: item.inventory_label,
          term_key: `section_${String(sectionId).padStart(2, "0")}.${block.kind}.${slug(item.inventory_label)}`,
          term_type: block.kind,
          coverage_state: "supported",
        });
      }
    }
  }
  return {
    schema_version: CONFIG_VERSION,
    inventory_sha256: INVENTORY_SHA256,
    claim_key_rule: "section_<two-digit-id>_<section-slug>.<field-slug>[_<duplicate-occurrence>]",
    fields,
    inventory_terms: terms,
  };
}

function writeYaml(path, value) {
  writeFileSync(path, YAML.stringify(value, { lineWidth: 0 }), "utf8");
}

function loadYaml(name) {
  const path = resolve(CONFIG_DIR, name);
  if (!existsSync(path)) fail(`Missing coverage config: ${path}`);
  return YAML.parse(readFileSync(path, "utf8"));
}

function sameJson(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} does not match the hash-pinned canonical inventory. Run with --write to regenerate.`);
  }
}

export function validateCoverage({ inventoryPath = process.env.RPP_INVENTORY_PATH ?? DEFAULT_INVENTORY_PATH } = {}) {
  const { lines } = readInventory(resolve(inventoryPath));
  const expectedCoverage = buildCoverage(lines);
  const expectedFields = buildFieldCoverage(lines);
  const expectedPilots = buildPilotSources();
  const expectedAdapters = buildAdapterFamilies();

  const coverage = loadYaml("source-coverage.yaml");
  const fields = loadYaml("field-coverage.yaml");
  const pilots = loadYaml("pilot-sources.yaml");
  const adapters = loadYaml("adapter-families.yaml");

  sameJson(coverage, expectedCoverage, "source-coverage.yaml");
  sameJson(fields, expectedFields, "field-coverage.yaml");
  sameJson(pilots, expectedPilots, "pilot-sources.yaml");
  sameJson(adapters, expectedAdapters, "adapter-families.yaml");

  if (coverage.sections.length !== 38 || new Set(coverage.sections.map((item) => item.section_id)).size !== 38) {
    fail("Coverage must contain each section ID from 1 through 38 exactly once.");
  }
  if (new Set(coverage.sources.map((source) => source.source_id)).size !== coverage.sources.length) {
    fail("Every named source family must have one unique source ID.");
  }
  const allowedSourceTiers = new Set([
    "official_manufacturer",
    "authorized_distributor",
    "repository",
    "standards_reference",
    "community",
    "marketplace",
    "media",
    "other",
  ]);
  for (const source of coverage.sources) {
    if (!allowedSourceTiers.has(source.source_tier)) fail(`${source.source_id} has an invalid source tier.`);
    if (!adapters.families[source.adapter_family]) fail(`${source.source_id} has an unknown adapter family.`);
    if (!source.wave) fail(`${source.source_id} has no rollout wave.`);
    if (source.wave === "unstructured_deferred" && !source.deferment_reason) {
      fail(`${source.source_id} is deferred without a reason.`);
    }
  }
  const sourceLines = coverage.sources.flatMap((source) => source.inventory_occurrences.map((item) => item.inventory_line));
  const expectedSourceLines = Object.values(SOURCE_RANGES).flatMap((ranges) => valuesAt(lines, ranges).map((item) => item.inventory_line));
  sameJson([...sourceLines].sort((a, b) => a - b), [...expectedSourceLines].sort((a, b) => a - b), "Source occurrence coverage");

  const expectedFieldLines = Object.values(FIELD_RANGES).flatMap((ranges) => valuesAt(lines, ranges).map((item) => item.inventory_line));
  sameJson(fields.fields.map((item) => item.inventory_line), expectedFieldLines, "Field coverage");
  if (new Set(fields.fields.map((item) => item.claim_key)).size !== fields.fields.length) {
    fail("Every inventory field must have one unique stable claim key.");
  }
  for (const field of fields.fields) {
    for (const property of ["value_type", "normalizer", "evidence_locator_classes", "temporal_behavior", "coverage_state"]) {
      if (field[property] === undefined || field[property] === null || field[property].length === 0) {
        fail(`Field ${field.claim_key} is missing ${property}.`);
      }
    }
    if (!["supported", "deferred", "unsupported"].includes(field.coverage_state)) {
      fail(`Field ${field.claim_key} has invalid coverage state ${field.coverage_state}.`);
    }
  }

  const expectedTermLines = Object.values(TERM_RANGES).flatMap((blocks) =>
    blocks.flatMap((block) => valuesAt(lines, [block.range]).map((item) => item.inventory_line)),
  );
  sameJson(fields.inventory_terms.map((item) => item.inventory_line), expectedTermLines, "Inventory term coverage");
  if (new Set(fields.inventory_terms.map((item) => item.term_key)).size !== fields.inventory_terms.length) {
    fail("Every inventory term must have one unique stable term key.");
  }

  const pilotIds = Object.keys(pilots.pilots).sort();
  const expectedPilotIds = [
    "distributor_pilot",
    "github_repository_pilot",
    "manufacturer_pilot",
    "ros_bom_pilot",
    "volatile_offer_pilot",
  ];
  sameJson(pilotIds, expectedPilotIds, "Pilot IDs");
  const sourceNames = new Set(coverage.sources.map((source) => source.source_name));
  for (const [pilotId, pilot] of Object.entries(pilots.pilots)) {
    if (pilot.enabled !== false) fail(`${pilotId} must remain disabled.`);
    if (!["unreviewed", "approved_fixture_only"].includes(pilot.policy_state)) {
      fail(`${pilotId} cannot be marked ${pilot.policy_state} before live-source approval.`);
    }
    if (!sourceNames.has(pilot.candidate_source_family)) {
      fail(`${pilotId} candidate is not present in the canonical source inventory.`);
    }
    if (!adapters.families[pilot.adapter_family]) fail(`${pilotId} has an unknown adapter family.`);
    if (!pilot.fixture_directory) fail(`${pilotId} must declare a fixture directory.`);
  }

  sameJson(adapters.protocol.capability_flags, CAPABILITY_FLAGS, "SourceAdapter capability flags");
  sameJson(adapters.protocol.lifecycle_order, CAPABILITY_FLAGS, "SourceAdapter lifecycle");
  for (const [familyId, family] of Object.entries(adapters.families)) {
    sameJson(Object.keys(family.capabilities), CAPABILITY_FLAGS, `${familyId} capability keys`);
  }

  if (coverage.deferred_unknown_tail.known_prefix !== lines[1693] || coverage.deferred_unknown_tail.state !== "deferred") {
    fail("The known line-1694 prefix must remain deferred without an invented suffix.");
  }

  return {
    sections: coverage.sections.length,
    source_families: coverage.sources.length,
    source_occurrences: sourceLines.length,
    fields: fields.fields.length,
    inventory_terms: fields.inventory_terms.length,
    source_tier_entries: coverage.source_tiers.reduce((count, tier) => count + tier.entries.length, 0),
    canonical_object_types: coverage.canonical_object_types.length,
    pilots: pilotIds.length,
  };
}

function generate(inventoryPath) {
  const { lines } = readInventory(inventoryPath);
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeYaml(resolve(CONFIG_DIR, "source-coverage.yaml"), buildCoverage(lines));
  writeYaml(resolve(CONFIG_DIR, "field-coverage.yaml"), buildFieldCoverage(lines));
  writeYaml(resolve(CONFIG_DIR, "pilot-sources.yaml"), buildPilotSources());
  writeYaml(resolve(CONFIG_DIR, "adapter-families.yaml"), buildAdapterFamilies());
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inventoryArgIndex = process.argv.indexOf("--inventory");
  const inventoryPath = inventoryArgIndex >= 0
    ? resolve(process.argv[inventoryArgIndex + 1])
    : resolve(process.env.RPP_INVENTORY_PATH ?? DEFAULT_INVENTORY_PATH);
  if (process.argv.includes("--write")) generate(inventoryPath);
  const result = validateCoverage({ inventoryPath });
  console.log(
    `Source coverage valid: ${result.sections} sections, ${result.source_families} source families ` +
    `(${result.source_occurrences} occurrences), ${result.fields} fields, ${result.inventory_terms} inventory terms, ` +
    `${result.source_tier_entries} tier entries, ${result.canonical_object_types} canonical object types, ${result.pilots} disabled pilots.`,
  );
}
