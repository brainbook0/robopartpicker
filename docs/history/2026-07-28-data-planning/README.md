# RoboPartPicker Data Collection -- Planning Documents

Canonical plan v6 and all supporting APS approval artifacts.

## Files

| File | Description |
|------|-------------|
| canonical-plan.md | The full 16-unit implementation plan |
| approval-packet.md | Consolidated approval packet for execution |
| delegation-graph.json | 17-node validated DAG (APS schema v1) |
| model-routing.json | Deterministic per-unit model assignments |
| ai-token-cost-ledger.json | Cumulative AI token spend ($1.58/$50) |
| execution-preflight.json | U-001 STOP gates and 139-file preservation baseline |
| implementation-units.json | Detailed contracts for all 16 units |
| final-simulation.json | Defect classification and verification |
| product-contract.json | 30 requirements, 30 acceptance criteria, 12 invariants |
| inventory.txt | 1,694-line canonical data-collection inventory |
| plan-v6-rehearsal-raw-summary.json | Raw 80-defect rehearsal summary |
| plan-v6-reconciliation-*.json | 4 independent P0/P1 reconciliation reviews |

## Status

- Plan: Complete (v6)
- Graph: Validated (acyclic, write-safe, 17 nodes)
- Routing: Complete (deterministic, OpenRouter OSS, $2.02 est)
- Cost: $1.58 cumulative reference, $47.98 remaining
- Preservation: 139/139 files, 0 mismatches
- Final simulation: PASS
- U-001 STOP gates: Unresolved (requires user action)

## Next Step

Execute U-001 to resolve STOP gates (Git remote, Cloudflare auth, credential rotation).
