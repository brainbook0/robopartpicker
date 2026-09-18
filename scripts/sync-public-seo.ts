import { canonicalBase, replaceBase } from "../src/lib/public-seo";

async function syncPublicSeo(): Promise<string> {
  const base = canonicalBase(process.env);
  // Only the SPA shell is rewritten here. `robots.txt` and `sitemap.xml` are
  // served dynamically by the Worker (worker/router.ts -> serveRobots /
  // serveSitemap), so a static copy in public/ would be uploaded as a shadowing
  // asset and could silently serve stale crawl directives if a route changes.
  const files = ["index.html"];
  const { readFile, writeFile } = await import("node:fs/promises");

  for (const file of files) {
    const path = new URL(`../${file}`, import.meta.url);
    const current = await readFile(path, "utf8");
    const next = replaceBase(current, base);
    if (next !== current) await writeFile(path, next);
  }

  return base;
}

const base = await syncPublicSeo();
console.log(`SEO canonical base set to ${base}`);
