#!/usr/bin/env tsx
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

type Mapping = { candidateSlug: string; projectId: string; fileId: string };
type Manifest = { slug: string; fileId: string; sizeBytes: number; checksumSha256: string };
type ProjectItem = { id: string; media: Array<{ id: string; contentUrl: string }> };
const base = process.argv[2] ?? "https://robopartpicker.com";
const plan = JSON.parse(readFileSync(".ingest/commercial-publication/production/publication-plan.json", "utf8")) as { mappings: Mapping[] };
const mediaPayload = JSON.parse(readFileSync("data/commercial-catalog/media/top-300-manifest.json", "utf8")) as { items: Manifest[] };
const expectedProjects = new Map(plan.mappings.map((mapping) => [mapping.projectId, mapping]));
const mediaBySlug = new Map(mediaPayload.items.map((item) => [item.slug, item]));
const items: ProjectItem[] = [];
for (const page of [1, 2, 3]) {
  const response = await fetch(`${base}/api/v1/projects?sort=trend&page=${page}&limit=100`, { headers: { "User-Agent": "RoboPartPickerReleaseVerifier/1.0" } });
  if (!response.ok) throw new Error(`Catalog page ${page} returned HTTP ${response.status}`);
  const payload = await response.json() as { items: ProjectItem[] };
  items.push(...payload.items);
}
const observed = new Set(items.map((item) => item.id));
const missingProjects = [...expectedProjects.keys()].filter((id) => !observed.has(id));
const extraProjects = [...observed].filter((id) => !expectedProjects.has(id));
const checks: Array<{ slug: string; url: string; expected: Manifest }> = [];
const attachmentMissing: string[] = [];
for (const item of items) {
  const mapping = expectedProjects.get(item.id); if (!mapping) continue;
  const expected = mediaBySlug.get(mapping.candidateSlug); if (!expected) throw new Error(`Manifest missing ${mapping.candidateSlug}`);
  const attached = item.media.find((entry) => entry.id === expected.fileId);
  if (!attached) attachmentMissing.push(mapping.candidateSlug);
  else checks.push({ slug: mapping.candidateSlug, url: new URL(attached.contentUrl, base).toString(), expected });
}
const failures: Array<{ slug: string; reason: string }> = [];
const concurrency = 24;
for (let index = 0; index < checks.length; index += concurrency) {
  await Promise.all(checks.slice(index, index + concurrency).map(async (check) => {
    const response = await fetch(check.url, { headers: { "User-Agent": "RoboPartPickerReleaseVerifier/1.0" } });
    const body = Buffer.from(await response.arrayBuffer());
    const checksum = createHash("sha256").update(body).digest("hex");
    if (response.status !== 200) failures.push({ slug: check.slug, reason: `HTTP ${response.status}` });
    else if (!(response.headers.get("content-type") ?? "").startsWith("image/webp")) failures.push({ slug: check.slug, reason: `content-type ${response.headers.get("content-type")}` });
    else if (body.length !== check.expected.sizeBytes) failures.push({ slug: check.slug, reason: `size ${body.length} != ${check.expected.sizeBytes}` });
    else if (checksum !== check.expected.checksumSha256) failures.push({ slug: check.slug, reason: `checksum ${checksum} != ${check.expected.checksumSha256}` });
  }));
}
const summary = { catalogItems: items.length, expectedProjects: expectedProjects.size, missingProjects, extraProjects, attachmentMissing, mediaChecked: checks.length, mediaFailures: failures };
console.log(JSON.stringify(summary));
if (items.length !== 300 || missingProjects.length || extraProjects.length || attachmentMissing.length || failures.length) process.exitCode = 1;
