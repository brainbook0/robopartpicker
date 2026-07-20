import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { emptyRpps, validateRpps } from "../src/lib/rpps/schema";
import {
  PORTABLE_RPPS_STATUS,
  PORTABLE_RPPS_VERSION,
  convertLegacyRpps,
  parsePortableRpps,
  parsePortableRppsLock,
  stringifyPortableRpps,
  validatePortableRpps,
} from "../src/lib/rpps/portable";

const cliArgs = process.argv.slice(2);
const command = cliArgs[0];
const manifestArg = cliArgs[1] ?? "rpps.yaml";
const lockArg = cliArgs[2] ?? (command === "init" ? "untitled-robot" : "rpps.lock.yaml");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function read(relativePath: string): string {
  const filePath = resolve(relativePath);
  if (!existsSync(filePath)) fail(`File not found: ${filePath}`);
  return readFileSync(filePath, "utf8");
}

function loadManifest() {
  const parsed = parsePortableRpps(read(manifestArg));
  if (parsed.ok === false) fail(parsed.errors.join("\n"));
  return parsed.data;
}

function loadLock() {
  if (!existsSync(resolve(lockArg))) return undefined;
  const parsed = parsePortableRppsLock(read(lockArg));
  if (parsed.ok === false) fail(parsed.errors.join("\n"));
  return parsed.data;
}

switch (command) {
  case "init": {
    if (existsSync(resolve(manifestArg))) fail(`${manifestArg} already exists.`);
    const slug = lockArg ?? "untitled-robot";
    const manifest = convertLegacyRpps(emptyRpps({ name: slug.replace(/-/gu, " "), slug }));
    delete manifest.extensions;
    writeFileSync(resolve(manifestArg), stringifyPortableRpps(manifest), { encoding: "utf8", flag: "wx" });
    console.log(`Created ${manifestArg} using ${PORTABLE_RPPS_STATUS}.`);
    break;
  }
  case "validate": {
    const manifest = loadManifest();
    const report = validatePortableRpps(manifest, loadLock());
    console.log(JSON.stringify({ valid: true, version: PORTABLE_RPPS_VERSION, profiles: report.profiles, findings: report.findings }, null, 2));
    break;
  }
  case "buildability": {
    const report = validatePortableRpps(loadManifest(), loadLock());
    console.log(JSON.stringify(report, null, 2));
    break;
  }
  case "migrate": {
    const output = lockArg;
    if (existsSync(resolve(output))) fail(`${output} already exists.`);
    let raw: unknown;
    try { raw = JSON.parse(read(manifestArg)); } catch { fail("Legacy input must be JSON."); }
    const legacy = validateRpps(raw);
    if (legacy.ok === false) fail(legacy.errors.join("\n"));
    writeFileSync(resolve(output), stringifyPortableRpps(convertLegacyRpps(legacy.data)), { encoding: "utf8", flag: "wx" });
    console.log(`Migrated ${manifestArg} to ${output}. Review all findings before publishing.`);
    break;
  }
  default:
    fail("Usage: rpps <init|validate|buildability|migrate> [manifest] [lockfile|slug|output]");
}
