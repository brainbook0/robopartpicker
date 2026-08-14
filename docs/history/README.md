# Historical RoboPartPicker planning artifacts

This directory consolidates useful, non-secret artifacts from older RoboPartPicker repositories so the canonical repository can preserve its design history without depending on fragmented GitHub projects.

## Canonical status

Only the current repository root, [`docs/product-definition.md`](../product-definition.md), the current migrations, contracts, tests, and deployed behavior define the active product. Files here are historical evidence. They can explain why a feature exists, but they do not override current requirements.

## Preserved sources

| Directory or file | Original repository | Original checkpoint | Meaning |
| --- | --- | --- | --- |
| `2026-07-19-component-wedge-plan.md` | `lucadominguez/robot-assembly-hub` | `32e03f2` | Superseded plan that centered humanoid component comparison. Preserved because it explains much of the inherited catalog UI. |
| `2026-07-28-data-planning/` | `lucadominguez/robopartpicker-planning` | `ca6e560` | Full data-collection planning packet, implementation units, inventory, routing, rehearsals, and approval artifacts. |
| `2026-08-06-collection-plan/` | `lucadominguez/robopartpicker-data-collection-plan` | `5d297cf` | Cloudflare-first collection architecture, source universe, adapter contracts, workflow checklists, and rollout plans. |

The legacy application code is separately preserved by the sanitized baseline described in [`archive/README.md`](../../archive/README.md). The old `robot-assembly-hub` `.env` file was intentionally not copied.

## Prior session trail

Historical Jcode sessions referenced the following major planning and implementation files:

- `PLAN-site-v1.md`
- `PLAN-site-v2.md`
- `PLAN-complete-v3.md`
- the 1,694-line canonical collection inventory
- the Cloudflare-first collection architecture and source universe
- project, BOM, supplier-offer, identity/deduplication, and production-readiness audits

Where a durable repository artifact existed, it is preserved above. Session transcripts themselves are not treated as product specifications. The current product clarification is recorded in the canonical product definition.

## Legacy repository disposition

Recommended reversible cleanup:

1. Verify this consolidated copy in the canonical Git history.
2. Add a short deprecation notice to each old repository that links here.
3. Archive `robopartpicker-planning`, `robopartpicker-data-collection-plan`, and `robot-assembly-hub` on GitHub.
4. Do not delete the repositories. Archiving is reversible and keeps links and commit history intact.

Repository deletion is intentionally outside automated maintenance because it is irreversible.
