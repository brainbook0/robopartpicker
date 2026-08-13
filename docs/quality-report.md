# Quality gate (semantic regression suite)

The semantic regression suite exercises the three golden projects through the full
product spine and fails the run on any completion-floor violation.

## Golden projects

- **Project A (clean)** — a near-complete robot with documented BOM and
  manufacturer part numbers. Compiled BOM lines are `verified`/`probable` and the
  whole-BOM sourcing estimate is fully priced.
- **Project B (messy)** — parts described only in README/config text. Lines are
  retained with explicit `missing-qty`/`unresolved` buckets; unpriced lines are
  listed, never dropped or faked.
- **Project C (user derivative)** — a clone with lineage plus a custom fabricated
  part and a substituted purchasable part. Lineage is preserved, fabricated parts
  are excluded from procurement, and substitutes are flagged.

## Completion floors asserted

The suite (`src/quality/golden.test.ts`) fails with a named assertion when any of
these is violated:

- a BOM line is dropped because matching failed,
- a line lacks quantity, name, evidence locator, extraction method, confidence, or
  completeness bucket,
- a placeholder price is stored as a current offer,
- an unpriced line is hidden instead of listed,
- synthetic/demo data is presented as a live supplier record,
- a quote reaches `option_selected` without explicit approval,
- a project is silently published while required provenance is missing.

## Running

```bash
npm run typecheck
npx vitest run --config vitest.config.ts src/quality/golden.test.ts
```

The same gates run on CI via `.github/workflows/quality.yml` (plus the full
`npm run check` in `.github/workflows/ci.yml`).
