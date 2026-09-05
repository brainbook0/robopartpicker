import { describe, expect, it } from "vitest";

// Raw source imports for contract assertions — Vite's ?raw returns the file as a string.
import projectDetailRaw from "../pages/ProjectDetail.tsx?raw";
import partDetailRaw from "../pages/PartDetail.tsx?raw";
import sourcesVerificationRaw from "../components/projects/SourcesVerification.tsx?raw";

// ---------------------------------------------------------------------------
// ProjectDetail – mobile overflow contract
// ---------------------------------------------------------------------------
describe("ProjectDetail responsive layout contract", () => {
  it("caps detail media at a stable 4:3 frame instead of stretching to a portrait asset", () => {
    expect(projectDetailRaw).toContain('data-project-hero-evidence className="mt-3 grid gap-3 lg:grid-cols-[minmax(280px,36%)_minmax(0,1fr)]"');
    expect(projectDetailRaw).toContain('<div className="min-h-[240px] lg:self-start">');
    expect(projectDetailRaw).toContain('className="aspect-[4/3] min-h-[240px] w-full"');
    expect(projectDetailRaw).not.toContain('className="min-h-[240px] h-full w-full md:min-h-full"');
  });

  it("header row stacks vertically on mobile (flex-col) and only goes side-by-side at lg (lg:flex-row)", () => {
    // The inner header bar after the cover image + title area must be a
    // column on small screens so the title/summary and action buttons each
    // get the full width, and only become a horizontal row at the lg
    // breakpoint.
    expect(projectDetailRaw).toContain(
      '<div data-project-identity-actions className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">',
    );
  });

  it("action wrapper is full-width on mobile (w-full) and auto-width at lg (lg:w-auto)", () => {
    // The container wrapping the action buttons must span the full width on
    // mobile so buttons can wrap naturally, and shrink to content width at
    // the lg breakpoint.
    expect(projectDetailRaw).toContain(
      '<div className="flex w-full shrink-0 flex-col items-start gap-1.5 lg:w-auto lg:items-end">',
    );
  });

  it("action row preserves wrapping (flex-wrap) on all breakpoints", () => {
    // The button row inside the action container must wrap so buttons don't
    // overflow horizontally when there isn't enough room.
    expect(projectDetailRaw).toContain(
      '<div className="flex flex-wrap items-center justify-start gap-1.5 lg:justify-end">',
    );
  });

  it("evidence claims may break long checksums without widening the document", () => {
    expect(sourcesVerificationRaw).toContain(
      '<p className="mt-3 break-words text-[12px] leading-5 [overflow-wrap:anywhere]">{humanizeEvidenceClaim(item.claim)}</p>',
    );
  });
});

// ---------------------------------------------------------------------------
// PartDetail – mobile overflow contract
// ---------------------------------------------------------------------------
describe("PartDetail responsive layout contract", () => {
  it("title container has min-w-0 so it can shrink below its content size", () => {
    // Without min-w-0 a flex child's implicit min-width is its longest
    // unbreakable word, which forces overflow on small viewports.
    expect(partDetailRaw).toContain(
      '<div className="min-w-0 flex-1 basis-full sm:basis-auto">',
    );
  });

  it("title container is full-width on mobile (basis-full or w-full) and auto at sm (sm:basis-auto or sm:w-auto)", () => {
    // On mobile the title block must occupy the full row; at sm it should
    // sit naturally alongside the action buttons.
    expect(partDetailRaw).toContain(
      '<div className="min-w-0 flex-1 basis-full sm:basis-auto">',
    );
  });

  it("action row is full-width on mobile and auto-width in the three-column desktop grid", () => {
    // The action button container must take the full width on mobile and
    // shrink-wrap on wider screens.
    expect(partDetailRaw).toContain(
      '<div className="flex w-full min-w-0 flex-wrap gap-2 sm:col-span-2 lg:col-span-1 lg:w-auto lg:justify-end">',
    );
  });

  it("uses zero-minimum grid tracks and shrinkable content columns", () => {
    expect(partDetailRaw).toContain(
      '<div className="mt-4 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">',
    );
    expect(partDetailRaw).toContain('<section className="min-w-0 space-y-4">');
    expect(partDetailRaw).toContain('<aside className="min-w-0 space-y-4">');
  });

  it("lets long file records shrink inside the part content track", () => {
    expect(partDetailRaw).toContain(
      'className="flex min-w-0 items-center gap-3 rounded border border-border p-3 hover:border-primary/60 hover:bg-muted/30"',
    );
  });
});