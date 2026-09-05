export function gdeltQueryUrl(manufacturer: string, model: string, startDatetime: string, endDatetime: string): string {
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", `"${`${manufacturer} ${model}`.replaceAll('"', "").trim()}" robot`);
  url.searchParams.set("mode", "timelinevolraw");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", "250");
  url.searchParams.set("startdatetime", startDatetime);
  url.searchParams.set("enddatetime", endDatetime);
  return url.toString();
}

export function gdeltArticleCount(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const timeline = (value as { timeline?: unknown }).timeline;
  if (!Array.isArray(timeline)) return null;
  const series = timeline.find((item) => item && typeof item === "object" && (item as { series?: unknown }).series === "Article Count") as { data?: unknown } | undefined;
  if (!series || !Array.isArray(series.data)) return null;
  let total = 0;
  for (const point of series.data) {
    const raw = point && typeof point === "object" ? (point as { value?: unknown }).value : undefined;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return null;
    total += raw;
  }
  return total;
}
