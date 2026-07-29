from __future__ import annotations

import json
from hashlib import sha256
from pathlib import Path
from typing import Any

import yaml


PILOT_ID = "manufacturer_pilot"
SOURCE_EXTERNAL_ID = "robotis-emanual-dynamixel"
FIXTURE_POLICY_STATE = "approved_fixture_only"
SCRAPER_VERSION = "manufacturer-pilot-fixture-v1"


class ManufacturerPilotAdapter:
    """Deterministic offline adapter for the disabled manufacturer pilot."""

    def __init__(
        self,
        *,
        fixture_path: Path,
        pilot_config_path: Path,
        previous_content_sha256: str | None = None,
    ) -> None:
        self._fixture_path = fixture_path
        self._previous_content_sha256 = previous_content_sha256
        config = yaml.safe_load(pilot_config_path.read_text(encoding="utf8"))
        pilot = config["pilots"][PILOT_ID]
        if (
            pilot["candidate_source_family"] != "Robotis e-Manual and Dynamixel documentation"
            or pilot["enabled"] is not False
            or pilot["policy_state"] not in {"unreviewed", FIXTURE_POLICY_STATE}
        ):
            raise ValueError("manufacturer_pilot must remain the disabled Robotis candidate")

    def discover(self) -> list[Path]:
        return [self._fixture_path]

    def acquire(self, discovered: list[Path]) -> list[dict[str, Any]]:
        return [{"path": path, "content": path.read_bytes()} for path in discovered]

    def snapshot(self, acquired: list[dict[str, Any]]) -> list[dict[str, Any]]:
        snapshots = []
        for item in acquired:
            content_hash = sha256(item["content"]).hexdigest()
            snapshots.append({
                **item,
                "contentSha256": content_hash,
                "acquisitionState": (
                    "unchanged"
                    if content_hash == self._previous_content_sha256
                    else "changed"
                ),
            })
        return snapshots

    def extract(self, snapshots: list[dict[str, Any]]) -> list[dict[str, Any]]:
        extracted = []
        for snapshot in snapshots:
            payload = json.loads(snapshot["content"])
            source = payload.get("source", {})
            if (
                source.get("externalSourceId") != SOURCE_EXTERNAL_ID
                or source.get("name") != "Robotis e-Manual and Dynamixel documentation"
            ):
                raise ValueError("fixture source does not match manufacturer_pilot")
            extracted.append({**snapshot, "payload": payload})
        return extracted

    def normalize(self, extracted: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [self._normalize_one(item) for item in extracted]

    def submit(self, normalized: list[dict[str, Any]]) -> dict[str, Any]:
        if len(normalized) != 1:
            raise ValueError("manufacturer fixture run requires exactly one document")
        return normalized[0]

    def _normalize_one(self, item: dict[str, Any]) -> dict[str, Any]:
        content_hash = item["contentSha256"]
        if item["acquisitionState"] == "unchanged":
            return {
                "acquisitionState": "unchanged",
                "contentSha256": content_hash,
                "networkAccess": False,
                "policyState": FIXTURE_POLICY_STATE,
                "batch": None,
            }

        payload = item["payload"]
        source = payload["source"]
        product = payload["product"]
        retrieved_at = payload["retrievedAt"]
        revision = product["revision"]
        claims = [
            {
                **claim,
                "confidence": 1.0,
                "classification": "official",
                "language": source["language"],
                "countryOrRegion": source["countryOrRegion"],
                "applicableRevision": revision,
                "extractionMethod": "fixture-json-pointer",
            }
            for claim in product["claims"]
        ]
        batch = {
            "schemaVersion": "2.0",
            "batchId": f"{PILOT_ID}-{content_hash[:24]}",
            "idempotencyKey": f"{PILOT_ID}-{content_hash}",
            "retrievalTimestamp": retrieved_at,
            "traceId": content_hash[:32],
            "source": {
                **source,
                "policy": {
                    "robotsStatus": "unknown",
                    "termsStatus": "requires_review",
                    "reuseStatus": "metadata_only",
                },
            },
            "records": [
                {
                    "externalRecordId": product["externalRecordId"],
                    "recordType": "component",
                    "sourceUrl": product["sourceUrl"],
                    "rawPayload": product,
                    "parsedData": {
                        "name": product["name"],
                        "category": "actuator",
                        "manufacturer": product["manufacturer"],
                        "manufacturerPartNumber": product["manufacturerPartNumber"],
                        "productFamily": product["family"],
                        "revision": revision,
                        "files": [
                            {
                                "fileType": "datasheet",
                                "url": product["datasheetUrl"],
                            },
                        ],
                        "missingInformation": product["missingInformation"],
                    },
                    "confidence": 1.0,
                    "provenance": {
                        "originalPublishedAt": product["originalPublishedAt"],
                        "lastSuccessfulCheckAt": retrieved_at,
                        "applicableRevision": revision,
                        "extractionMethod": "fixture-json-pointer",
                        "scraperVersion": SCRAPER_VERSION,
                        "copyrightReuseStatus": "metadata_only",
                    },
                    "snapshot": {
                        "sourceClass": "official",
                        "declaredMediaType": "application/json",
                        "detectedMediaType": "application/json",
                        "byteSize": len(item["content"]),
                        "contentSha256": content_hash,
                        "immutableExternalUrl": product["sourceUrl"],
                        "retrievalMetadata": {
                            "fixtureName": item["path"].name,
                            "networkAccess": False,
                            "policyState": FIXTURE_POLICY_STATE,
                        },
                    },
                    "claims": claims,
                    "lifecycleEvents": [
                        {
                            "eventType": "observed_fixture",
                            "occurredAt": retrieved_at,
                            "reason": "offline fixture acquisition",
                            "details": {"networkAccess": False},
                        },
                    ],
                },
            ],
        }
        return {
            "acquisitionState": "changed",
            "contentSha256": content_hash,
            "networkAccess": False,
            "policyState": FIXTURE_POLICY_STATE,
            "batch": batch,
        }
