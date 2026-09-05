export type YouTubeSearchVideo = { id: string; title: string; viewCount: number; ageDays: number };

export function youtubeSearchUrl(manufacturer: string, model: string): string {
  const url = new URL("https://www.youtube.com/results");
  url.searchParams.set("search_query", `${manufacturer} ${model} robot`.replace(/\s+/gu, " ").trim());
  return url.toString();
}

export function parseYouTubeSearchHtml(html: string, limit = 10): YouTubeSearchVideo[] {
  const marker = "var ytInitialData =";
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return [];
  const start = html.indexOf("{", markerIndex + marker.length);
  if (start < 0) return [];
  const jsonText = balancedJsonObject(html, start);
  if (!jsonText) return [];
  let root: unknown;
  try { root = JSON.parse(jsonText); } catch { return []; }
  const results: YouTubeSearchVideo[] = []; const seen = new Set<string>();
  const visit = (value: unknown): void => {
    if (results.length >= limit) return;
    if (Array.isArray(value)) { for (const item of value) visit(item); return; }
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    if (object.videoRenderer && typeof object.videoRenderer === "object") {
      const video = parseVideoRenderer(object.videoRenderer as Record<string, unknown>);
      if (video && !seen.has(video.id)) { seen.add(video.id); results.push(video); }
    }
    for (const nested of Object.values(object)) visit(nested);
  };
  visit(root);
  return results;
}

export function recentVideoViewVelocity(videos: readonly YouTubeSearchVideo[], recentWindowDays = 365): number {
  return videos.filter((video) => video.ageDays <= recentWindowDays).reduce((sum, video) => sum + video.viewCount / Math.max(1, video.ageDays), 0);
}

function parseVideoRenderer(value: Record<string, unknown>): YouTubeSearchVideo | null {
  const id = typeof value.videoId === "string" ? value.videoId : "";
  const title = runsText(value.title);
  const viewsText = simpleText(value.viewCountText);
  const ageText = simpleText(value.publishedTimeText);
  const ageDays = relativeAgeDays(ageText);
  if (!id || !title || ageDays == null) return null;
  const digits = viewsText.replace(/[^0-9]/gu, "");
  const viewCount = digits ? Number(digits) : /^no views$/iu.test(viewsText) ? 0 : NaN;
  if (!Number.isSafeInteger(viewCount) || viewCount < 0) return null;
  return { id, title, viewCount, ageDays };
}
function simpleText(value: unknown): string { return value && typeof value === "object" && typeof (value as { simpleText?: unknown }).simpleText === "string" ? (value as { simpleText: string }).simpleText : ""; }
function runsText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const runs = (value as { runs?: unknown }).runs;
  if (!Array.isArray(runs)) return simpleText(value);
  return runs.map((run) => run && typeof run === "object" && typeof (run as { text?: unknown }).text === "string" ? (run as { text: string }).text : "").join("").trim();
}
function relativeAgeDays(text: string): number | null {
  const match = /(?:streamed\s+)?(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/iu.exec(text);
  if (!match) return null;
  const count = Number(match[1]);
  const factors: Record<string, number> = { second: 1 / 86_400, minute: 1 / 1_440, hour: 1 / 24, day: 1, week: 7, month: 30, year: 365 };
  return Math.max(1 / 86_400, count * factors[match[2].toLowerCase()]);
}
function balancedJsonObject(text: string, start: number): string | null {
  let depth = 0; let inString = false; let escaped = false;
  for (let index = start; index < text.length; index++) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false; else if (character === "\\") escaped = true; else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth++;
    else if (character === "}" && --depth === 0) return text.slice(start, index + 1);
  }
  return null;
}
