from __future__ import annotations

import json
from hashlib import sha256
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker


class ContractViolation(ValueError):
    pass


EXPECTED_PRODUCER_HASHES = {
    "config/data-collection/source-coverage.yaml": "4d9b3f74a8d2eb470fb6b10708be0a8ea1594a0979514a27a963885fb8ca9509",
    "config/data-collection/field-coverage.yaml": "58a1ed1b961cb811a504073ea2c68ea4c4c69d129b11f186d0f6150eff368708",
    "config/data-collection/pilot-sources.yaml": "f163529f69d8b8ec9498bcedb22ae25449b191fa35213549a4870cbe2214337e",
    "config/data-collection/adapter-families.yaml": "0aa9a70e37a6141e8b3b617ed2e2405d5906d11f2824616d02f1d4f652bb2341",
    "contracts/import-batch.v2.schema.json": "8b90b3f37696d783646af0eeb76e744dc46221317fc34348081ecc7c1d2e694d",
    "contracts/evidence-registration.v1.schema.json": "e636dd8574abe8d655a1998a5c712e17871baff1e1f890e130dc11c198fe63e3",
}


class ContractValidator:
    def __init__(self, contracts_root: Path) -> None:
        _verify_hash(
            contracts_root / "import-batch.v2.schema.json",
            EXPECTED_PRODUCER_HASHES["contracts/import-batch.v2.schema.json"],
        )
        _verify_hash(
            contracts_root / "evidence-registration.v1.schema.json",
            EXPECTED_PRODUCER_HASHES["contracts/evidence-registration.v1.schema.json"],
        )
        self._import = self._load(contracts_root / "import-batch.v2.schema.json")
        self._evidence = self._load(contracts_root / "evidence-registration.v1.schema.json")

    @staticmethod
    def _load(path: Path) -> Draft202012Validator:
        schema = json.loads(path.read_text(encoding="utf8"))
        Draft202012Validator.check_schema(schema)
        return Draft202012Validator(schema, format_checker=FormatChecker())

    def validate_import_batch(self, value: dict[str, Any]) -> None:
        self._validate(self._import, value, "import batch")

    def validate_evidence_registration(self, value: dict[str, Any]) -> None:
        self._validate(self._evidence, value, "evidence registration")

    @staticmethod
    def _validate(validator: Draft202012Validator, value: dict[str, Any], label: str) -> None:
        errors = sorted(
            validator.iter_errors(value),
            key=lambda error: tuple(str(part) for part in error.absolute_path),
        )
        if not errors:
            return
        error = errors[0]
        path = ".".join(str(part) for part in error.absolute_path) or "$"
        raise ContractViolation(f"{label} {path}: {error.message}")


def validate_producer_contract_hashes(repository_root: Path) -> None:
    for relative_path, expected in EXPECTED_PRODUCER_HASHES.items():
        _verify_hash(repository_root / relative_path, expected)


def _verify_hash(path: Path, expected: str) -> None:
    # Producer artifacts are text; normalize checkout line endings so the
    # content pin is stable across Windows and Linux runners.
    actual = sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()
    if actual != expected:
        raise ContractViolation(
            f"producer contract hash mismatch for {path.name}: expected {expected}, received {actual}",
        )
