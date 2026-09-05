#!/usr/bin/env tsx
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright";
import { requiredOfficialGalleryScreenshots } from "../src/lib/commercial-media";

const path = resolve("data/commercial-catalog/collected/gallery-candidates.json");
const screenshotDirectory = resolve(".ingest/commercial-gallery-screenshots");
type GalleryResult = {
  slug: string;
  name: string;
  manufacturer: string;
  officialProductUrl: string;
  retrievedAt: string;
  sourceUrls: string[];
  screenshotPath?: string;
  screenshotPaths?: string[];
  renderedFetch?: { ok: boolean; error: string | null };
};
const payload = JSON.parse(readFileSync(path, "utf8")) as { generatedAt: string; profiles: number; results: GalleryResult[] };
const limitArgument = process.argv.indexOf("--limit");
const limit = limitArgument >= 0 ? Number(process.argv[limitArgument + 1]) : Number.POSITIVE_INFINITY;
if (!(limit > 0)) throw new Error("--limit must be a positive number");
const slugsArgument = process.argv.indexOf("--slugs");
const requestedSlugs = slugsArgument >= 0 ? new Set(process.argv[slugsArgument + 1].split(",").filter(Boolean)) : null;
const forceScreenshotsArgument = process.argv.indexOf("--force-screenshots");
const forceScreenshots = forceScreenshotsArgument >= 0 ? Number(process.argv[forceScreenshotsArgument + 1]) : 0;
if (!Number.isInteger(forceScreenshots) || forceScreenshots < 0 || forceScreenshots > 3) throw new Error("--force-screenshots must be an integer from 0 to 3");
const targets = payload.results.filter((result) => (!requestedSlugs || requestedSlugs.has(result.slug)) && (forceScreenshots > 0 || result.sourceUrls.length < 4 || requiredOfficialGalleryScreenshots(result.sourceUrls.length) > (result.screenshotPaths?.length ?? 0))).slice(0, limit);
mkdirSync(screenshotDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const concurrency = 3;
for (let index = 0; index < targets.length; index += concurrency) {
  await Promise.all(targets.slice(index, index + concurrency).map(enrich));
  process.stderr.write(`rendered galleries ${Math.min(index + concurrency, targets.length)}/${targets.length}\n`);
}
await browser.close();
writeFileSync(path, `${JSON.stringify({ ...payload, renderedAt: new Date().toISOString() }, null, 2)}\n`);
const counts = payload.results.map((result) => result.sourceUrls.length + (result.screenshotPaths?.length ?? (result.screenshotPath ? 1 : 0)));
console.log(JSON.stringify({ path, rendered: targets.length, withTwo: counts.filter((count) => count >= 2).length, withThree: counts.filter((count) => count >= 3).length, withFour: counts.filter((count) => count >= 4).length, screenshots: payload.results.reduce((sum, result) => sum + (result.screenshotPaths?.length ?? (result.screenshotPath ? 1 : 0)), 0) }));

async function enrich(result: GalleryResult): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  try {
    await page.goto(result.officialProductUrl, { waitUntil: "domcontentloaded", timeout: 35_000 });
    await page.waitForTimeout(4_000);
    const urls = await renderedCandidates(page, result.name);
    const seen = new Set(result.sourceUrls);
    for (const url of urls) if (!seen.has(url) && result.sourceUrls.length < 10) { seen.add(url); result.sourceUrls.push(url); }
    const screenshotCount = forceScreenshots || requiredOfficialGalleryScreenshots(result.sourceUrls.length);
    if (screenshotCount > 0) {
      await page.evaluate(() => {
        for (const element of document.querySelectorAll<HTMLElement>("header, nav, footer, [role='dialog'], [id*='cookie' i], [class*='cookie' i], [id*='onetrust' i], [class*='onetrust' i]")) element.style.setProperty("display", "none", "important");
      });
      const screenshotPaths: string[] = [];
      for (let index = 0; index < screenshotCount; index++) {
        await page.evaluate((shot) => window.scrollTo(0, shot === 0 ? 0 : Math.min(document.documentElement.scrollHeight - innerHeight, 760 * shot)), index);
        await page.waitForTimeout(300);
        const screenshotPath = resolve(screenshotDirectory, `${result.slug}-page-${index + 1}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        screenshotPaths.push(screenshotPath);
      }
      result.screenshotPaths = screenshotPaths;
      delete result.screenshotPath;
    }
    result.renderedFetch = { ok: true, error: null };
  } catch (cause) {
    result.renderedFetch = { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
  } finally { await page.close(); }
}

async function renderedCandidates(page: Page, modelName: string): Promise<string[]> {
  const model = JSON.stringify(modelName);
  const script = `(() => {
    const rejected = /(logo|icon|favicon|sprite|avatar|pixel|collect|tracking|cookie|flag|language|footer|header)/iu;
    const modelTokens = ${model}.toLowerCase().split(/[^a-z0-9]+/u).filter((token) => token.length >= 2);
    const candidates = [];
    const add = (raw, element, order, descriptor) => {
      if (!raw || raw.startsWith("data:")) return;
      let url; try { url = new URL(raw, location.href); } catch { return; }
      if (!/^https?:$/u.test(url.protocol) || /\\.(?:svg|gif)(?:$|\\?)/iu.test(url.pathname) || rejected.test(url.pathname + " " + descriptor)) return;
      const rect = element.getBoundingClientRect();
      const width = element instanceof HTMLImageElement ? element.naturalWidth : rect.width;
      const height = element instanceof HTMLImageElement ? element.naturalHeight : rect.height;
      if (width * height < 120000 || rect.top + scrollY > 3200) return;
      let score = Math.min(4, (width * height) / 500000);
      if (/(product|robot|hero|gallery|detail|model)/iu.test(url.pathname + " " + descriptor)) score += 3;
      if (modelTokens.some((token) => (url.pathname + " " + descriptor).toLowerCase().includes(token))) score += 3;
      if (url.hostname === location.hostname) score += 1;
      candidates.push({ url: url.toString(), score, order });
    };
    [...document.images].forEach((image, order) => add(image.currentSrc || image.src, image, order, image.alt + " " + image.className));
    [...document.querySelectorAll("*")].forEach((element, order) => {
      const background = getComputedStyle(element).backgroundImage;
      for (const match of background.matchAll(/url\\(["']?([^"')]+)["']?\\)/gu)) add(match[1], element, 10000 + order, String(element.className));
    });
    [...document.querySelectorAll("video")].forEach((video, order) => add(video.poster, video, 20000 + order, "video poster"));
    const seen = new Set();
    return candidates.sort((left, right) => right.score - left.score || left.order - right.order).map((candidate) => candidate.url).filter((url) => !seen.has(url) && Boolean(seen.add(url))).slice(0, 10);
  })()`;
  return page.evaluate(script) as Promise<string[]>;
}
