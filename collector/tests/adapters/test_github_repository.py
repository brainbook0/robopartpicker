from pathlib import Path

from robopartpicker_collector.adapters.github_repository import (
    GITHUB_API_VERSION,
    GitHubRepositoryAdapter,
    build_github_headers,
)
from robopartpicker_collector.core.contracts import ContractValidator
from robopartpicker_collector.core.protocol import run_adapter
from robopartpicker_collector.parsers.bom import BomParseError, parse_bom


REPO = Path(__file__).resolve().parents[3]
FIXTURES = REPO / "collector" / "tests" / "fixtures" / "github_repository"


def _adapter(fixture_name: str) -> GitHubRepositoryAdapter:
    return GitHubRepositoryAdapter(
        fixture_path=FIXTURES / fixture_name,
        pilot_config_path=REPO / "config" / "data-collection" / "pilot-sources.yaml",
    )


def test_repository_fixture_emits_project_bom_and_bounded_file_manifest() -> None:
    result = run_adapter(_adapter("repository-with-bom.json"))

    assert result["networkAccess"] is False
    assert result["policyState"] == "approved_fixture_only"
    assert result["apiVersion"] == "2026-03-10"
    assert result["archiveMirror"] is False
    assert [record["recordType"] for record in result["batch"]["records"]] == ["project", "bom"]

    project = result["batch"]["records"][0]["parsedData"]
    assert project["repository"]["fullName"] == "robopartpicker/fixture-humanoid"
    assert project["commit"]["sha"] == "1111111111111111111111111111111111111111"
    assert project["release"]["tagName"] == "v1.0.0"
    assert project["license"]["spdxId"] == "Apache-2.0"
    assert [file["path"] for file in project["relevantFiles"]] == [
        "BOM.csv",
        "LICENSE",
        "README.md",
        "robot_description/fixture.urdf",
    ]
    assert {state["state"] for state in project["explicitStates"]} == {
        "archive_excluded",
        "submodule_reference",
        "symlink_rejected",
        "tree_truncated",
        "unsafe_path_rejected",
        "oversized_file_deferred",
    }
    assert all("content" not in file for file in project["relevantFiles"])

    bom = result["batch"]["records"][1]["parsedData"]
    assert bom["version"] == "commit:1111111111111111111111111111111111111111"
    assert bom["completeness"] == "source_provided"
    assert bom["items"] == [
        {
            "lineId": "2",
            "partName": "Fixture actuator",
            "manufacturerPartNumber": "RPP-X1",
            "quantity": 2,
            "unitPrice": 129.99,
            "currency": "USD",
            "evidenceLocator": "csv:row=2",
        },
        {
            "lineId": "3",
            "partName": "M3 socket screw",
            "manufacturerPartNumber": "M3X8",
            "quantity": 12,
            "unitPrice": 0.08,
            "currency": "USD",
            "evidenceLocator": "csv:row=3",
        },
    ]
    ContractValidator(REPO / "contracts").validate_import_batch(result["batch"])


def test_missing_bom_and_nonregular_entries_are_explicit() -> None:
    result = run_adapter(_adapter("repository-missing-bom.json"))
    project = result["batch"]["records"][0]["parsedData"]

    assert len(result["batch"]["records"]) == 1
    assert project["missingInformation"] == [
        {
            "fieldKey": "project.bom",
            "reasonCode": "missing",
            "status": "open",
        },
    ]
    assert project["explicitStates"] == [
        {
            "path": "vendor/controller",
            "state": "submodule_reference",
            "sha": "3333333333333333333333333333333333333333",
        },
    ]


def test_github_headers_pin_current_version_without_exposing_absent_credentials() -> None:
    assert GITHUB_API_VERSION == "2026-03-10"
    assert build_github_headers(None) == {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
    }
    assert build_github_headers("fixture-token") == {
        "Accept": "application/vnd.github+json",
        "Authorization": "Bearer fixture-token",
        "X-GitHub-Api-Version": "2026-03-10",
    }


def test_bom_parser_rejects_spreadsheet_formulas() -> None:
    try:
        parse_bom(
            b"part_name,manufacturer_part_number,quantity,unit_price,currency\n"
            b'=HYPERLINK("https://example.invalid"),RPP-X1,1,1.00,USD\n',
            file_name="BOM.csv",
        )
    except BomParseError as error:
        assert str(error) == "BOM cell formulas are not allowed"
    else:
        raise AssertionError("formula-bearing BOM was accepted")
