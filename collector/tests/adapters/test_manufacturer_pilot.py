import json
from pathlib import Path

from robopartpicker_collector.adapters.manufacturer_pilot import ManufacturerPilotAdapter
from robopartpicker_collector.core.contracts import ContractValidator
from robopartpicker_collector.core.protocol import run_adapter


REPO = Path(__file__).resolve().parents[3]
FIXTURES = REPO / "collector" / "tests" / "fixtures" / "manufacturer_pilot"


def _adapter(fixture_name: str, previous_hash: str | None = None) -> ManufacturerPilotAdapter:
    return ManufacturerPilotAdapter(
        fixture_path=FIXTURES / fixture_name,
        pilot_config_path=REPO / "config" / "data-collection" / "pilot-sources.yaml",
        previous_content_sha256=previous_hash,
    )


def test_fixture_emits_revision_aware_component_with_official_claims() -> None:
    result = run_adapter(_adapter("actuator-rev-a.json"))

    assert result["acquisitionState"] == "changed"
    assert result["networkAccess"] is False
    assert result["policyState"] == "approved_fixture_only"
    assert len(result["batch"]["records"]) == 1

    record = result["batch"]["records"][0]
    assert record["recordType"] == "component"
    assert record["parsedData"]["manufacturerPartNumber"] == "RPP-FIXTURE-X1"
    assert record["parsedData"]["revision"] == "rev-a"
    assert len(record["claims"]) >= 10
    assert {claim["classification"] for claim in record["claims"]} == {"official"}
    assert all(claim["evidenceLocator"].startswith("json:") for claim in record["claims"])
    assert record["parsedData"]["files"] == [
        {
            "fileType": "datasheet",
            "url": "https://emanual.robotis.com/docs/en/dxl/x/rpp-fixture-x1/",
        },
    ]
    assert record["parsedData"]["missingInformation"] == [
        {
            "fieldKey": "actuator.ip_rating",
            "reasonCode": "missing",
            "status": "open",
        },
    ]

    ContractValidator(REPO / "contracts").validate_import_batch(result["batch"])


def test_identical_content_is_unchanged_and_emits_no_duplicate_batch() -> None:
    first = run_adapter(_adapter("actuator-rev-a.json"))
    unchanged = run_adapter(
        _adapter(
            "actuator-rev-a-copy.json",
            previous_hash=first["contentSha256"],
        ),
    )

    assert unchanged == {
        "acquisitionState": "unchanged",
        "contentSha256": first["contentSha256"],
        "networkAccess": False,
        "policyState": "approved_fixture_only",
        "batch": None,
    }


def test_changed_content_has_new_hash_and_revision() -> None:
    first = run_adapter(_adapter("actuator-rev-a.json"))
    changed = run_adapter(
        _adapter(
            "actuator-rev-b.json",
            previous_hash=first["contentSha256"],
        ),
    )

    assert changed["acquisitionState"] == "changed"
    assert changed["contentSha256"] != first["contentSha256"]
    assert changed["batch"]["records"][0]["parsedData"]["revision"] == "rev-b"


def test_fixture_rejects_identity_drift(tmp_path: Path) -> None:
    fixture = json.loads((FIXTURES / "actuator-rev-a.json").read_text(encoding="utf8"))
    fixture["source"]["externalSourceId"] = "substituted-source"
    drifted = tmp_path / "drifted.json"
    drifted.write_text(json.dumps(fixture), encoding="utf8")

    adapter = ManufacturerPilotAdapter(
        fixture_path=drifted,
        pilot_config_path=REPO / "config" / "data-collection" / "pilot-sources.yaml",
    )

    try:
        run_adapter(adapter)
    except ValueError as error:
        assert str(error) == "fixture source does not match manufacturer_pilot"
    else:
        raise AssertionError("source identity drift was accepted")
