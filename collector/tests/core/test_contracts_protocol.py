import json
import shutil
from pathlib import Path

import pytest

from robopartpicker_collector.core.contracts import (
    ContractViolation,
    ContractValidator,
    validate_producer_contract_hashes,
)
from robopartpicker_collector.core.protocol import CAPABILITY_FLAGS, run_adapter, validate_adapter_family_contract
from robopartpicker_collector.core.snapshot import build_retained_registration


REPO = Path(__file__).resolve().parents[3]


def test_adapter_capabilities_match_standalone_registry() -> None:
    config = REPO / "config" / "data-collection" / "adapter-families.yaml"
    assert CAPABILITY_FLAGS == ("discover", "acquire", "snapshot", "extract", "normalize", "submit")
    validate_adapter_family_contract(config)


def test_exact_repository_contract_examples_validate() -> None:
    validate_producer_contract_hashes(REPO)
    validator = ContractValidator(REPO / "contracts")
    batch = json.loads((REPO / "contracts" / "examples" / "import-batch.v2.json").read_text())
    evidence = json.loads((REPO / "contracts" / "examples" / "evidence-registration.v1.json").read_text())
    validator.validate_import_batch(batch)
    validator.validate_evidence_registration(evidence)

    batch["traceId"] = "NOT-A-TRACE"
    with pytest.raises(ContractViolation, match="traceId"):
        validator.validate_import_batch(batch)


def test_contract_hash_drift_fails_closed(tmp_path: Path) -> None:
    contracts = tmp_path / "contracts"
    shutil.copytree(REPO / "contracts", contracts)
    schema = contracts / "import-batch.v2.schema.json"
    schema.write_text(schema.read_text(encoding="utf8") + "\n", encoding="utf8")
    with pytest.raises(ContractViolation, match="hash mismatch"):
        ContractValidator(contracts)


def test_snapshot_registration_hashes_exact_bytes() -> None:
    validator = ContractValidator(REPO / "contracts")
    registration = build_retained_registration(
        external_registration_id="fixture-registration",
        source_id="manufacturer-pilot",
        source_policy_revision_id="policy-rev-1",
        source_class="official",
        evidence_class="structured_text",
        source_url="https://manufacturer.example/part",
        retrieved_at="2026-07-29T12:00:00.000Z",
        applicable_revision="rev-a",
        media_type="application/json",
        content=b'{"part":"A"}',
        copyright_reuse_status="retention_approved",
        retrieval_metadata={"httpStatus": 200},
        trace_id="a" * 32,
    )
    validator.validate_evidence_registration(registration)
    assert registration["byteSize"] == 12
    assert registration["contentSha256"] == "2a5659365a6873a3c9ea14e1a4779d03eee6ddb137711541109b6c930f4fa08c"

    redacted = build_retained_registration(
        external_registration_id="redaction-fixture",
        source_id="manufacturer-pilot",
        source_policy_revision_id="policy-rev-1",
        source_class="official",
        evidence_class="structured_text",
        source_url="https://manufacturer.example/part",
        retrieved_at="2026-07-29T12:00:00.000Z",
        applicable_revision="rev-a",
        media_type="application/json",
        content=b"{}",
        copyright_reuse_status="retention_approved",
        retrieval_metadata={"authorization": "Bearer must-not-persist"},
        trace_id="a" * 32,
    )
    assert redacted["retrievalMetadata"]["authorization"] == "[REDACTED]"


def test_fixture_adapter_runs_the_exact_six_stage_lifecycle() -> None:
    calls: list[str] = []

    class FixtureAdapter:
        def discover(self):
            calls.append("discover")
            return ["resource"]

        def acquire(self, discovered):
            calls.append("acquire")
            return list(discovered)

        def snapshot(self, acquired):
            calls.append("snapshot")
            return list(acquired)

        def extract(self, snapshots):
            calls.append("extract")
            return list(snapshots)

        def normalize(self, extracted):
            calls.append("normalize")
            return list(extracted)

        def submit(self, normalized):
            calls.append("submit")
            return list(normalized)

    assert run_adapter(FixtureAdapter()) == ["resource"]
    assert calls == list(CAPABILITY_FLAGS)
