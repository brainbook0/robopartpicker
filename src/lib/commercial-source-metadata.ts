export type OfficialPageMetadata = { description: string | null; imageUrl: string | null; activityDate: string | null };

export function officialActivityValue(activityDate: string | null, capturedAt: string, currentOfficialListingVerified = false): number | null {
  if (!activityDate) return currentOfficialListingVerified ? 1 : null;
  const activity = Date.parse(activityDate); const captured = Date.parse(capturedAt);
  if (!Number.isFinite(activity) || !Number.isFinite(captured) || activity > captured) return null;
  const days = Math.floor((captured - activity) / 86_400_000);
  return Math.max(0, 365 - Math.min(365, days));
}

export function parseOfficialPageMetadata(html: string, pageUrl: string, lastModified: string | null): OfficialPageMetadata {
  const metas = new Map<string, string>();
  for (const match of html.matchAll(/<meta\b([^>]+)>/giu)) {
    const attributes = new Map<string, string>();
    for (const attribute of match[1].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/gu)) attributes.set(attribute[1].toLowerCase(), attribute[2].trim());
    const key = (attributes.get("property") ?? attributes.get("name") ?? "").toLowerCase();
    const content = attributes.get("content");
    if (key && content && !metas.has(key)) metas.set(key, decodeEntities(content));
  }
  const description = cleanText(metas.get("og:description") ?? metas.get("description") ?? metas.get("twitter:description") ?? null);
  let imageUrl = extractOfficialImageCandidates(html, pageUrl, 1)[0] ?? null;
  const structuredDates: string[] = [];
  const structuredImages: string[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
    try { collectStructuredMetadata(JSON.parse(match[1]), structuredDates, structuredImages); } catch { /* malformed publisher JSON-LD is ignored */ }
  }
  if (!imageUrl) imageUrl = firstValidStructuredImage(structuredImages, pageUrl);
  if (!imageUrl) imageUrl = fallbackPageImage(html, pageUrl);
  const validDates = structuredDates.map(toIsoOrNull).filter((value): value is string => value !== null).sort((left, right) => Date.parse(right) - Date.parse(left));
  return { description, imageUrl, activityDate: validDates[0] ?? toIsoOrNull(lastModified) };
}

export function parseOfficialReaderMetadata(markdown: string, pageUrl: string): OfficialPageMetadata {
  const modelTokens = new URL(pageUrl).pathname
    .toLocaleLowerCase("en-US")
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length >= 2 && !["en", "product", "products", "robot", "robots", "humanoid", "index", "html"].includes(token));
  const imageCandidates: Array<{ url: string; score: number }> = [];
  for (const match of markdown.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+["'][^"']*["'])?\)/giu)) {
    const alt = match[1].replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US");
    let resolved: URL;
    try { resolved = new URL(match[2], pageUrl); } catch { continue; }
    const descriptor = `${resolved.pathname} ${alt}`.toLocaleLowerCase("en-US");
    if (isRejectedImage(resolved.pathname) || /(logo|icon|favicon|sprite|avatar|pixel|tracking|cookie|qr|wechat|facebook|instagram|linkedin|youtube)/iu.test(descriptor)) continue;
    let score = /(product|robot|humanoid|hero|banner|gallery|detail)/iu.test(descriptor) ? 2 : 0;
    if (modelTokens.some((token) => descriptor.includes(token))) score += 3;
    if (alt.length >= 5 && !/^image\s*\d*$/iu.test(alt)) score += 1;
    imageCandidates.push({ url: resolved.toString(), score });
  }
  const paragraphs = markdown
    .replace(/!\[[^\]]*\]\([^)]+\)/gu, " ")
    .split(/\n\s*\n/gu)
    .map((paragraph) => paragraph.replace(/^#{1,6}\s+/gmu, "").replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1").replace(/[*_`>|]/gu, " ").replace(/\s+/gu, " ").trim())
    .filter((paragraph) => paragraph.length >= 40 && paragraph.length <= 2_000)
    .filter((paragraph) => !/(cookie|privacy policy|subscribe|follow us|all rights reserved|contact us|navigation|menu)/iu.test(paragraph));
  const description = paragraphs.find((paragraph) => modelTokens.length === 0 || modelTokens.some((token) => paragraph.toLocaleLowerCase("en-US").includes(token)))
    ?? paragraphs[0]
    ?? null;
  const imageUrl = imageCandidates.sort((left, right) => right.score - left.score)[0]?.url ?? null;
  return { description: cleanText(description), imageUrl, activityDate: null };
}

export function extractOfficialImageCandidates(html: string, pageUrl: string, limit = 5): string[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > 12) throw new Error("Official image candidate limit must be an integer from 1 to 12.");
  const output: string[] = [];
  const seen = new Set<string>();
  const add = (value: string): void => {
    try {
      const resolved = new URL(decodeEntities(value), pageUrl);
      if (!["http:", "https:"].includes(resolved.protocol) || isRejectedImage(resolved.pathname)) return;
      const key = resolved.toString();
      if (!seen.has(key)) { seen.add(key); output.push(key); }
    } catch { /* malformed publisher URL is ignored */ }
  };
  for (const match of html.matchAll(/<meta\b([^>]+)>/giu)) {
    const attributes = new Map<string, string>();
    for (const attribute of match[1].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/gu)) attributes.set(attribute[1].toLowerCase(), attribute[2].trim());
    const key = (attributes.get("property") ?? attributes.get("name") ?? "").toLowerCase();
    if (["og:image:secure_url", "og:image", "twitter:image"].includes(key) && attributes.get("content")) add(attributes.get("content")!);
  }
  const structuredImages: string[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
    try { collectStructuredMetadata(JSON.parse(match[1]), [], structuredImages); } catch { /* malformed publisher JSON-LD is ignored */ }
  }
  structuredImages.forEach(add);
  for (const candidate of rankedPageImages(html, pageUrl).filter((candidate) => candidate.score >= 4)) add(candidate.url);
  return output.slice(0, limit);
}

function collectStructuredMetadata(value: unknown, dates: string[], images: string[], insideProduct = false): void {
  if (Array.isArray(value)) { value.forEach((item) => collectStructuredMetadata(item, dates, images, insideProduct)); return; }
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  const type = object["@type"];
  const isProduct = insideProduct || type === "Product" || (Array.isArray(type) && type.includes("Product"));
  for (const [key, nested] of Object.entries(object)) {
    const normalized = key.toLowerCase();
    if (["datemodified", "datepublished", "uploaddate"].includes(normalized) && typeof nested === "string") dates.push(nested);
    if (isProduct && ["image", "imageurl", "thumbnailurl"].includes(normalized)) collectImageStrings(nested, images);
    collectStructuredMetadata(nested, dates, images, isProduct);
  }
}
function toIsoOrNull(value: string | null): string | null { if (!value) return null; const time = Date.parse(value); return Number.isFinite(time) ? new Date(time).toISOString() : null; }
function cleanText(value: string | null): string | null { if (!value) return null; const cleaned = value.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim(); return cleaned.length >= 20 ? cleaned.slice(0, 2000) : null; }
function decodeEntities(value: string): string { return value.replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#39;|&apos;/giu, "'").replace(/&lt;/giu, "<").replace(/&gt;/giu, ">"); }

function fallbackPageImage(html: string, pageUrl: string): string | null {
  return rankedPageImages(html, pageUrl)[0]?.url ?? null;
}

function rankedPageImages(html: string, pageUrl: string): Array<{ url: string; score: number }> {
  const page = new URL(pageUrl);
  const pageTokens = page.pathname.toLowerCase().split(/[^a-z0-9]+/u).filter((token) => token.length >= 2);
  const candidates: Array<{ url: string; score: number }> = [];
  for (const match of html.matchAll(/<(?:img|source)\b([^>]+)>/giu)) {
    const attributes = new Map<string, string>();
    for (const attribute of match[1].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/gu)) attributes.set(attribute[1].toLowerCase(), decodeEntities(attribute[2].trim()));
    const srcset = attributes.get("srcset") ?? attributes.get("data-srcset");
    const source = (srcset ? highestWidthSrcsetValue(srcset) : null) ?? attributes.get("src") ?? attributes.get("data-src") ?? attributes.get("data-original") ?? attributes.get("data-lazy-src");
    if (!source || source.startsWith("data:")) continue;
    let resolved: URL;
    try { resolved = new URL(source, page); } catch { continue; }
    if (!["http:", "https:"].includes(resolved.protocol)) continue;
    const descriptor = `${resolved.pathname} ${attributes.get("alt") ?? ""}`.toLowerCase();
    if (isRejectedImage(resolved.pathname) || /(logo|icon|favicon|sprite|avatar|cancel|close|spinner|loading|pixel|collect|analytics|tracking|badge|flag|team|person|people|portrait|office)/iu.test(descriptor)) continue;
    const width = Number(attributes.get("width") ?? 0); const height = Number(attributes.get("height") ?? 0);
    if ((width > 0 && width < 120) || (height > 0 && height < 120)) continue;
    const dimensions = /(?:^|[_/-])(\d{3,5})x(\d{3,5})(?:\D|$)/u.exec(resolved.pathname);
    const inferredWidth = dimensions ? Number(dimensions[1]) : width; const inferredHeight = dimensions ? Number(dimensions[2]) : height;
    let score = inferredWidth >= 400 && inferredHeight >= 300 ? 2 : 0;
    if (/(product|robot|hero|banner|gallery|detail)/iu.test(descriptor)) score += 2;
    if (pageTokens.some((token) => descriptor.includes(token))) score += 1;
    if (resolved.hostname === page.hostname) score += 1;
    if (score >= 2) candidates.push({ url: resolved.toString(), score });
  }
  return candidates.sort((left, right) => right.score - left.score);
}

function isRejectedImage(pathname: string): boolean { return /\.(?:svg|gif)(?:$|\?)/iu.test(pathname) || /(logo|icon|favicon|sprite|avatar|pixel|collect|tracking)/iu.test(pathname); }

function collectImageStrings(value: unknown, output: string[]): void {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectImageStrings(item, output));
  else if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    collectImageStrings(object.url ?? object.contentUrl, output);
  }
}

function firstValidStructuredImage(values: readonly string[], pageUrl: string): string | null {
  for (const value of values) {
    try {
      const resolved = new URL(value, pageUrl);
      if (!["http:", "https:"].includes(resolved.protocol)) continue;
      if (/(logo|icon|favicon|sprite|avatar|pixel|collect|tracking)/iu.test(resolved.pathname)) continue;
      return resolved.toString();
    } catch { /* continue */ }
  }
  return null;
}

function highestWidthSrcsetValue(value: string): string | null {
  const candidates = value.split(",").map((item) => {
    const match = /^\s*(\S+)\s+(\d+)w\s*$/u.exec(item);
    return match ? { url: match[1], width: Number(match[2]) } : null;
  }).filter((item): item is { url: string; width: number } => item !== null);
  return candidates.sort((left, right) => right.width - left.width)[0]?.url ?? null;
}
