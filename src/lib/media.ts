// Deterministic placeholder images keyed by an id seed.
// Uses picsum.photos which returns stable images for a given seed.
// Swap to real product photography later — call sites stay the same.

export type Gallery = { hero: string; thumbs: string[]; caption?: string };

const seedFor = (kind: string, id: string) => `${kind}-${id}`.replace(/[^a-z0-9-]/gi, "-");

export function img(kind: string, id: string, w = 800, h = 600, variant = 0): string {
  const s = `${seedFor(kind, id)}${variant ? `-${variant}` : ""}`;
  return `https://picsum.photos/seed/${s}/${w}/${h}`;
}

export function gallery(kind: string, id: string, count = 4): Gallery {
  return {
    hero: img(kind, id, 1200, 800, 0),
    thumbs: Array.from({ length: count }, (_, i) => img(kind, id, 600, 400, i + 1)),
  };
}

export function thumb(kind: string, id: string, w = 96, h = 72): string {
  return img(kind, id, w, h, 0);
}