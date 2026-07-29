from __future__ import annotations

import json
from hashlib import sha256
from pathlib import Path, PurePosixPath
from typing import Any

import yaml

from ..parsers.bom import parse_bom


GITHUB_API_VERSION = "2026-03-10"
PILOT_ID = "github_repository_pilot"
SOURCE_ID = "github"
FIXTURE_POLICY_STATE = "approved_fixture_only"
MAX_RELEVANT_FILE_BYTES = 1024 * 1024
ARCHIVE_SUFFIXES = {".zip", ".tar", ".gz", ".tgz", ".7z", ".rar"}
RELEVANT_SUFFIXES = {
    ".csv",
    ".json",
    ".md",
    ".mjcf",
    ".sdf",
    ".srdf",
    ".tsv",
    ".urdf",
    ".xacro",
    ".xlsx",
    ".xml",
    ".yaml",
    ".yml",
}
RELEVANT_NAMES = {"license", "package.xml", "readme"}


def build_github_headers(token: str | None) -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
    }
    if token is not None:
        if not token or "\r" in token or "\n" in token:
            raise ValueError("GitHub token is invalid")
        headers["Authorization"] = f"Bearer {token}"
    return headers


class GitHubRepositoryAdapter:
    """Bounded offline proof for the disabled external repository pilot."""

    def __init__(self, *, fixture_path: Path, pilot_config_path: Path) -> None:
        config = yaml.safe_load(pilot_config_path.read_text(encoding="utf8"))
        pilot = config["pilots"][PILOT_ID]
        if (
            pilot["candidate_source_family"] != "GitHub"
            or pilot["enabled"] is not False
            or pilot["policy_state"] not in {"unreviewed", FIXTURE_POLICY_STATE}
        ):
            raise ValueError("github_repository_pilot must remain disabled")
        self._fixture_path = fixture_path

    def discover(self) -> list[Path]:
        return [self._fixture_path]

    def acquire(self, discovered: list[Path]) -> list[dict[str, Any]]:
        return [{"path": path, "content": path.read_bytes()} for path in discovered]

    def snapshot(self, acquired: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            {**item, "contentSha256": sha256(item["content"]).hexdigest()}
            for item in acquired
        ]

    def extract(self, snapshots: list[dict[str, Any]]) -> list[dict[str, Any]]:
        extracted = []
        for item in snapshots:
            payload = json.loads(item["content"])
            if payload.get("apiVersion") != GITHUB_API_VERSION:
                raise ValueError("GitHub fixture API version drift")
            if payload.get("source", {}).get("externalSourceId") != SOURCE_ID:
                raise ValueError("fixture source does not match github_repository_pilot")
            extracted.append({**item, "payload": payload})
        return extracted

    def normalize(self, extracted: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [self._normalize_one(item) for item in extracted]

    def submit(self, normalized: list[dict[str, Any]]) -> dict[str, Any]:
        if len(normalized) != 1:
            raise ValueError("GitHub fixture run requires exactly one repository")
        return normalized[0]

    def _normalize_one(self, item: dict[str, Any]) -> dict[str, Any]:
        payload = item["payload"]
        repository = payload["repository"]
        tree = payload["tree"]
        relevant_files: list[dict[str, Any]] = []
        explicit_states: list[dict[str, Any]] = []
        bom_entry: dict[str, Any] | None = None

        if tree.get("truncated") is True:
            explicit_states.append({
                "path": "$tree",
                "state": "tree_truncated",
                "sha": repository["commit"]["sha"],
            })

        for entry in tree["entries"]:
            path = entry["path"]
            state = self._entry_state(entry)
            if state is not None:
                explicit_states.append({
                    "path": path,
                    "state": state,
                    "sha": entry["sha"],
                })
                continue
            if not self._is_relevant(path):
                continue
            role = self._role(path)
            relevant_files.append({
                "path": path,
                "sha": entry["sha"],
                "size": entry["size"],
                "role": role,
            })
            if role == "bom" and bom_entry is None:
                bom_entry = entry

        relevant_files.sort(key=lambda file: file["path"])
        records = [
            self._project_record(
                item,
                relevant_files=relevant_files,
                explicit_states=explicit_states,
                has_bom=bom_entry is not None,
            ),
        ]
        if bom_entry is not None:
            records.append(self._bom_record(item, bom_entry))

        content_hash = item["contentSha256"]
        return {
            "networkAccess": False,
            "policyState": FIXTURE_POLICY_STATE,
            "apiVersion": GITHUB_API_VERSION,
            "archiveMirror": False,
            "batch": {
                "schemaVersion": "2.0",
                "batchId": f"{PILOT_ID}-{content_hash[:24]}",
                "idempotencyKey": f"{PILOT_ID}-{content_hash}",
                "retrievalTimestamp": payload["retrievedAt"],
                "traceId": content_hash[:32],
                "source": {
                    **payload["source"],
                    "policy": {
                        "robotsStatus": "not_applicable",
                        "termsStatus": "requires_review",
                        "reuseStatus": "metadata_only",
                    },
                },
                "records": records,
            },
        }

    @staticmethod
    def _entry_state(entry: dict[str, Any]) -> str | None:
        path = entry["path"]
        pure = PurePosixPath(path)
        if (
            path.startswith("/")
            or "\\" in path
            or any(part in {"", ".", ".."} for part in pure.parts)
        ):
            return "unsafe_path_rejected"
        if entry["type"] == "commit" or entry["mode"] == "160000":
            return "submodule_reference"
        if entry["mode"] == "120000":
            return "symlink_rejected"
        if PurePosixPath(path).suffix.lower() in ARCHIVE_SUFFIXES:
            return "archive_excluded"
        if int(entry.get("size", 0)) > MAX_RELEVANT_FILE_BYTES:
            return "oversized_file_deferred"
        return None

    @staticmethod
    def _is_relevant(path: str) -> bool:
        pure = PurePosixPath(path)
        lower_name = pure.name.lower()
        stem = pure.stem.lower()
        return (
            pure.suffix.lower() in RELEVANT_SUFFIXES
            or lower_name in RELEVANT_NAMES
            or stem in RELEVANT_NAMES
            or "bom" in stem
        )

    @staticmethod
    def _role(path: str) -> str:
        pure = PurePosixPath(path)
        name = pure.name.lower()
        stem = pure.stem.lower()
        if "bom" in stem:
            return "bom"
        if stem == "readme":
            return "readme"
        if name == "license" or stem == "license":
            return "license"
        if pure.suffix.lower() in {".urdf", ".xacro", ".sdf", ".srdf", ".mjcf"}:
            return "robot_description"
        return "engineering_file"

    @staticmethod
    def _project_record(
        item: dict[str, Any],
        *,
        relevant_files: list[dict[str, Any]],
        explicit_states: list[dict[str, Any]],
        has_bom: bool,
    ) -> dict[str, Any]:
        payload = item["payload"]
        repository = payload["repository"]
        retrieved_at = payload["retrievedAt"]
        revision = repository["commit"]["sha"]
        missing = [] if has_bom else [{
            "fieldKey": "project.bom",
            "reasonCode": "missing",
            "status": "open",
        }]
        release = repository.get("release")
        claims = [
            ("project.repository", repository["fullName"], "json:/repository/fullName"),
            ("project.commit", revision, "json:/repository/commit/sha"),
            ("project.license", repository["license"]["spdxId"], "json:/repository/license/spdxId"),
            ("project.archived", repository["archived"], "json:/repository/archived"),
            ("project.relevant_file_count", len(relevant_files), "calculated:/tree/relevantFiles"),
        ]
        if release is not None:
            claims.append(("project.latest_release", release["tagName"], "json:/repository/release/tagName"))
        return {
            "externalRecordId": f"github:{repository['id']}:{revision}",
            "recordType": "project",
            "sourceUrl": repository["htmlUrl"],
            "rawPayload": repository,
            "parsedData": {
                "repository": {
                    "id": repository["id"],
                    "fullName": repository["fullName"],
                    "htmlUrl": repository["htmlUrl"],
                    "defaultBranch": repository["defaultBranch"],
                    "description": repository["description"],
                    "archived": repository["archived"],
                },
                "commit": repository["commit"],
                "release": release,
                "license": repository["license"],
                "apiVersion": GITHUB_API_VERSION,
                "relevantFiles": relevant_files,
                "explicitStates": explicit_states,
                "missingInformation": missing,
                "archiveMirror": False,
            },
            "confidence": 1.0,
            "provenance": _provenance(retrieved_at, revision),
            "snapshot": _snapshot(item, repository["htmlUrl"]),
            "claims": [
                _claim(
                    key,
                    value,
                    locator,
                    revision=revision,
                    classification="calculated" if locator.startswith("calculated:") else "official",
                )
                for key, value, locator in claims
            ],
            "lifecycleEvents": [
                {
                    "eventType": "repository_fixture_observed",
                    "occurredAt": retrieved_at,
                    "reason": "offline bounded repository fixture",
                    "details": {
                        "apiVersion": GITHUB_API_VERSION,
                        "treeTruncated": payload["tree"].get("truncated") is True,
                    },
                },
            ],
        }

    @staticmethod
    def _bom_record(item: dict[str, Any], entry: dict[str, Any]) -> dict[str, Any]:
        payload = item["payload"]
        repository = payload["repository"]
        retrieved_at = payload["retrievedAt"]
        revision = repository["commit"]["sha"]
        items = parse_bom(entry["content"].encode("utf8"), file_name=entry["path"])
        source_url = (
            f"{repository['htmlUrl']}/blob/{revision}/{entry['path']}"
        )
        claims = []
        for bom_item in items:
            claims.extend([
                _claim(
                    "bom_item.part_name",
                    bom_item["partName"],
                    bom_item["evidenceLocator"],
                    revision=revision,
                ),
                _claim(
                    "bom_item.quantity",
                    bom_item["quantity"],
                    bom_item["evidenceLocator"],
                    revision=revision,
                ),
            ])
        return {
            "externalRecordId": f"github:{repository['id']}:bom:{revision}:{entry['path']}",
            "recordType": "bom",
            "sourceUrl": source_url,
            "rawPayload": {"path": entry["path"], "sha": entry["sha"]},
            "parsedData": {
                "projectExternalId": f"github:{repository['id']}:{revision}",
                "sourcePath": entry["path"],
                "sourceBlobSha": entry["sha"],
                "version": f"commit:{revision}",
                "completeness": "source_provided",
                "items": items,
            },
            "confidence": 1.0,
            "provenance": _provenance(retrieved_at, revision),
            "snapshot": _snapshot(item, source_url),
            "claims": claims,
            "lifecycleEvents": [
                {
                    "eventType": "bom_fixture_observed",
                    "occurredAt": retrieved_at,
                    "reason": "bounded BOM candidate selected by path and type",
                    "details": {"path": entry["path"], "blobSha": entry["sha"]},
                },
            ],
        }


def _provenance(retrieved_at: str, revision: str) -> dict[str, Any]:
    return {
        "originalPublishedAt": None,
        "lastSuccessfulCheckAt": retrieved_at,
        "applicableRevision": revision,
        "extractionMethod": "github-rest-fixture",
        "scraperVersion": "github-repository-fixture-v1",
        "copyrightReuseStatus": "metadata_only",
    }


def _snapshot(item: dict[str, Any], source_url: str) -> dict[str, Any]:
    return {
        "sourceClass": "official",
        "declaredMediaType": "application/json",
        "detectedMediaType": "application/json",
        "byteSize": len(item["content"]),
        "contentSha256": item["contentSha256"],
        "immutableExternalUrl": source_url,
        "retrievalMetadata": {
            "apiVersion": GITHUB_API_VERSION,
            "fixtureName": item["path"].name,
            "networkAccess": False,
        },
    }


def _claim(
    key: str,
    value: Any,
    locator: str,
    *,
    revision: str,
    classification: str = "official",
) -> dict[str, Any]:
    return {
        "claimKey": key,
        "originalValue": value,
        "normalizedValue": value,
        "unit": None,
        "confidence": 1.0,
        "evidenceLocator": locator,
        "classification": classification,
        "language": "en",
        "countryOrRegion": "global",
        "applicableRevision": revision,
        "extractionMethod": "github-rest-fixture",
    }
