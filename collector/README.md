# RoboPartPicker collector

This package is the portable, policy-gated acquisition and extraction boundary for RoboPartPicker. It is deliberately separate from the Cloudflare Worker and imports no Worker application code.

Live network acquisition is fail-closed. A source must have a current enabled `approved_live` policy, separate allowed robots, approved terms, approved reuse status, explicit hosts, a contact-bearing user agent, and class-local budget before its adapter can run. The five pilot sources remain disabled until their individual policy reviews are complete.

## Offline fixture run

```sh
uv run rpp-collector fixture-run \
  --fixture tests/fixtures/example.json \
  --contracts-root ../contracts \
  --output .artifacts/fixture-run
```

`fixture-run` only validates and writes deterministic contract artifacts. It never performs network access or submits data.

## Verification

```sh
uv lock --check
uv run --locked pytest
uv run --locked python -m build
docker build -f Dockerfile .
```

The package pins direct dependencies in `pyproject.toml` and commits the universal `uv.lock`.

## Producer contract pins

The core was implemented against these exact upstream artifacts:

| Artifact | SHA-256 |
| --- | --- |
| `config/data-collection/source-coverage.yaml` | `4d9b3f74a8d2eb470fb6b10708be0a8ea1594a0979514a27a963885fb8ca9509` |
| `config/data-collection/field-coverage.yaml` | `58a1ed1b961cb811a504073ea2c68ea4c4c69d129b11f186d0f6150eff368708` |
| `config/data-collection/pilot-sources.yaml` | `f163529f69d8b8ec9498bcedb22ae25449b191fa35213549a4870cbe2214337e` |
| `config/data-collection/adapter-families.yaml` | `0aa9a70e37a6141e8b3b617ed2e2405d5906d11f2824616d02f1d4f652bb2341` |
| `contracts/import-batch.v2.schema.json` | `8b90b3f37696d783646af0eeb76e744dc46221317fc34348081ecc7c1d2e694d` |
| `contracts/evidence-registration.v1.schema.json` | `e636dd8574abe8d655a1998a5c712e17871baff1e1f890e130dc11c198fe63e3` |

Contract drift is checked by the repository coverage validator and the collector’s offline contract tests before an adapter is run.
