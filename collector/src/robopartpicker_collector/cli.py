from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Sequence

from .core.contracts import ContractValidator


def _canonical_json(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf8")


def fixture_run(fixture: Path, contracts_root: Path, output: Path) -> int:
    payload = json.loads(fixture.read_text(encoding="utf8"))
    validator = ContractValidator(contracts_root)
    batch = payload["batch"]
    evidence = payload.get("evidenceRegistrations", [])
    validator.validate_import_batch(batch)
    for registration in evidence:
        validator.validate_evidence_registration(registration)
    output.mkdir(parents=True, exist_ok=True)
    (output / "import-batch.v2.json").write_bytes(_canonical_json(batch))
    (output / "evidence-registrations.v1.json").write_bytes(_canonical_json(evidence))
    print(json.dumps({
        "evidenceRegistrations": len(evidence),
        "networkAccess": False,
        "records": len(batch["records"]),
        "status": "validated",
    }, sort_keys=True))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="rpp-collector")
    commands = parser.add_subparsers(dest="command", required=True)
    fixture = commands.add_parser("fixture-run", help="validate deterministic fixture artifacts without network access")
    fixture.add_argument("--fixture", type=Path, required=True)
    fixture.add_argument("--contracts-root", type=Path, required=True)
    fixture.add_argument("--output", type=Path, required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "fixture-run":
        return fixture_run(args.fixture, args.contracts_root, args.output)
    raise AssertionError("unreachable command")


if __name__ == "__main__":
    raise SystemExit(main())
