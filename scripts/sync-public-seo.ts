import { canonicalBase, replaceBase } from "../src/lib/public-seo";

async function syncPublicSeo(): Promise<string> {
  const base = canonicalBase(process.env);
  const files = ["index.html", "public/robots.txt", "public/sitemap.xml"];
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
