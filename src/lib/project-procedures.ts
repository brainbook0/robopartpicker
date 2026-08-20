export type ProjectProcedureCandidate = {
  id: string;
  kind: "assembly" | "configuration" | "calibration" | "test" | "operation" | "maintenance";
  title: string;
  steps: string[];
  sourcePath: string;
  confidence: number;
  heuristic: true;
};

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
}

function procedureKind(heading: string): ProjectProcedureCandidate["kind"] | null {
  const lower = heading.toLowerCase();
  if (/assembl|mechanical build|putting .* together/u.test(lower)) return "assembly";
  if (/calibrat|tuning|zeroing/u.test(lower)) return "calibration";
  if (/\btest|verification|validation/u.test(lower)) return "test";
  if (/configur|setup|installation|install/u.test(lower)) return "configuration";
  if (/maintenan|service|repair/u.test(lower)) return "maintenance";
  if (/operation|usage|running|start(?:ing)?/u.test(lower)) return "operation";
  return null;
}

function cleanMarkdownStep(value: string): string {
  return value.replace(/\[([^\u005d]+)\]\([^)]+\)/gu, "$1").replace(/[*_`]/gu, "").trim().slice(0, 20_000);
}

export function extractProcedureCandidates(files: Map<string, string>, slug: string): ProjectProcedureCandidate[] {
  const output: ProjectProcedureCandidate[] = [];
  for (const [path, text] of files) {
    if (!/\.md$/iu.test(path)) continue;
    const lines = text.split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      const heading = lines[index].match(/^#{1,6}\s+(.+?)\s*#*$/u)?.[1]?.trim();
      if (!heading) continue;
      const kind = procedureKind(heading);
      if (!kind) continue;
      const steps: string[] = [];
      for (let cursor = index + 1; cursor < lines.length && !/^#{1,6}\s+/u.test(lines[cursor]); cursor += 1) {
        const step = lines[cursor].match(/^\s*(?:\d+[.)]|[-*+])\s+(.+)$/u)?.[1];
        if (step) steps.push(cleanMarkdownStep(step));
        if (steps.length >= 200) break;
      }
      if (steps.length === 0) continue;
      if (kind === "assembly" && (!/(?:^|\/)[^/]*(?:assembly|build|hardware|manual|guide)[^/]*\.md$/iu.test(path) || /(?:^|\/)readme(?:\.[^/]*)?$/iu.test(path) || steps.length < 3)) continue;
      output.push({ id: `procedure:${slug}:${slugify(`${path}-${heading}`).slice(0, 100)}`, kind, title: heading.slice(0, 500), steps, sourcePath: path, confidence: 0.65, heuristic: true });
      if (output.length >= 100) return output;
    }
  }
  return output;
}
