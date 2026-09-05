export function googleNewsQueryUrl(manufacturer: string, model: string): string {
  const url = new URL("https://news.google.com/rss/search");
  const identity = `${manufacturer} ${model}`.replaceAll('"', "").replace(/\s+/gu, " ").trim();
  url.searchParams.set("q", `"${identity}" robot when:90d`);
  url.searchParams.set("hl", "en-US");
  url.searchParams.set("gl", "US");
  url.searchParams.set("ceid", "US:en");
  return url.toString();
}

export function googleNewsMentionCount(xml: string): number | null {
  if (!/<rss\b/iu.test(xml) || !/<channel\b/iu.test(xml)) return null;
  const unique = new Set<string>();
  let index = 0;
  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/giu)) {
    const item = match[1];
    const guid = elementText(item, "guid");
    const link = elementText(item, "link");
    const title = elementText(item, "title");
    unique.add(guid || link || title || `item-${index}`);
    index++;
  }
  return unique.size;
}

function elementText(xml: string, name: string): string {
  const match = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "iu").exec(xml);
  if (!match) return "";
  return match[1].replace(/^<!\[CDATA\[|\]\]>$/gu, "").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#39;|&apos;/giu, "'").replace(/&lt;/giu, "<").replace(/&gt;/giu, ">").trim();
}
