from __future__ import annotations

import json
from hashlib import sha256
from pathlib import Path
from typing import Any

import yaml

from ..core.budget import InMemoryBudgetLedger


PILOT_ID = "distributor_pilot"
SOURCE_ID = "digikey"
FIXTURE_POLICY_STATE = "approved_fixture_only"
SCRAPER_VERSION = "distributor-pilot-fixture-v1"


class DistributorPilotAdapter:
    """Offline temporal-offer adapter for the disabled DigiKey pilot."""

    def __init__(
        self,
        *,
        fixture_paths: list[Path],
        pilot_config_path: Path,
        budget_ledger: InMemoryBudgetLedger,
        projected_paid_source_api_microusd: int,
        projected_cloudflare_infra_microusd: int,
    ) -> None:
        config = yaml.safe_load(pilot_config_path.read_text(encoding="utf8"))
        pilot = config["pilots"][PILOT_ID]
        if (
            pilot["candidate_source_family"] != "DigiKey"
            or pilot["cost_class"] != "paid_source_api"
            or pilot["enabled"] is not False
            or pilot["policy_state"] not in {"unreviewed", FIXTURE_POLICY_STATE}
        ):
            raise ValueError("distributor_pilot must remain the disabled DigiKey candidate")
        self._fixture_paths = fixture_paths
        self._budget = budget_ledger
        self._paid_projection = projected_paid_source_api_microusd
        self._infra_projection = projected_cloudflare_infra_microusd
        self._trace_id = sha256(
            "|".join(str(path) for path in fixture_paths).encode("utf8"),
        ).hexdigest()[:32]

    def discover(self) -> list[Path]:
        return list(self._fixture_paths)

    def acquire(self, discovered: list[Path]) -> list[dict[str, Any]]:
        reservations: list[str] = []
        try:
            reservations.append(self._budget.reserve(
                "cloudflare_infra",
                SOURCE_ID,
                self._infra_projection,
                self._trace_id,
            ))
            reservations.append(self._budget.reserve(
                "paid_source_api",
                SOURCE_ID,
                self._paid_projection,
                self._trace_id,
            ))
            acquired = [{"path": path, "content": path.read_bytes()} for path in discovered]
        except Exception:
            for reservation_id in reservations:
                self._budget.release(reservation_id, "fixture acquisition did not start")
            raise

        for reservation_id in reservations:
            self._budget.commit(reservation_id, 0)
        return acquired

    def snapshot(self, acquired: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            {
                **item,
                "contentSha256": sha256(item["content"]).hexdigest(),
            }
            for item in acquired
        ]

    def extract(self, snapshots: list[dict[str, Any]]) -> list[dict[str, Any]]:
        extracted = []
        for snapshot in snapshots:
            payload = json.loads(snapshot["content"])
            source = payload.get("source", {})
            if (
                source.get("externalSourceId") != SOURCE_ID
                or source.get("name") != "DigiKey"
            ):
                raise ValueError("fixture source does not match distributor_pilot")
            extracted.append({**snapshot, "payload": payload})
        return extracted

    def normalize(self, extracted: list[dict[str, Any]]) -> dict[str, Any]:
        records: list[dict[str, Any]] = []
        seen_observation_ids: set[str] = set()
        first_observation_id: str | None = None

        for item in extracted:
            payload = item["payload"]
            offer = payload["offer"]
            observed_at = payload["retrievedAt"]
            observation_id = (
                f"{SOURCE_ID}:{offer['supplierSku']}:observation:{observed_at}"
            )
            if observation_id in seen_observation_ids:
                raise ValueError(f"duplicate temporal observation {observation_id}")
            seen_observation_ids.add(observation_id)
            first_observation_id = first_observation_id or observation_id
            records.append(self._observation_record(item, observation_id))
            if offer["listingStatus"] == "delisted":
                records.append(self._withdrawal_record(
                    item,
                    first_observation_id,
                    observed_at,
                ))

        if not extracted:
            raise ValueError("distributor fixture run requires at least one document")

        aggregate = sha256()
        for item in extracted:
            aggregate.update(len(item["content"]).to_bytes(8, "big"))
            aggregate.update(item["content"])
        batch_hash = aggregate.hexdigest()
        first_source = extracted[0]["payload"]["source"]
        latest_retrieval = max(item["payload"]["retrievedAt"] for item in extracted)
        return {
            "networkAccess": False,
            "policyState": FIXTURE_POLICY_STATE,
            "budgetTrace": {
                "ai_token": {"projectedMicrousd": 0, "consumedMicrousd": 0},
                "cloudflare_infra": {
                    "projectedMicrousd": self._infra_projection,
                    "consumedMicrousd": 0,
                },
                "paid_source_api": {
                    "projectedMicrousd": self._paid_projection,
                    "consumedMicrousd": 0,
                },
            },
            "batch": {
                "schemaVersion": "2.0",
                "batchId": f"{PILOT_ID}-{batch_hash[:24]}",
                "idempotencyKey": f"{PILOT_ID}-{batch_hash}",
                "retrievalTimestamp": latest_retrieval,
                "traceId": batch_hash[:32],
                "source": {
                    **first_source,
                    "policy": {
                        "robotsStatus": "unknown",
                        "termsStatus": "requires_review",
                        "reuseStatus": "metadata_only",
                    },
                },
                "records": records,
            },
        }

    def submit(self, normalized: dict[str, Any]) -> dict[str, Any]:
        return normalized

    @staticmethod
    def _observation_record(
        item: dict[str, Any],
        observation_id: str,
    ) -> dict[str, Any]:
        payload = item["payload"]
        source = payload["source"]
        offer = payload["offer"]
        observed_at = payload["retrievedAt"]
        revision = f"{offer['manufacturerPartNumber']}:{offer['supplierSku']}"
        claims = [
            ("offer.price", offer["price"]["originalLabel"], offer["price"]["amount"], offer["price"]["currency"], "json:/offer/price"),
            ("offer.stock", offer["stock"]["originalLabel"], offer["stock"]["quantityAvailable"], "count", "json:/offer/stock"),
            ("offer.availability", offer["stock"]["status"], offer["stock"]["status"], None, "json:/offer/stock/status"),
            ("offer.lead_time", offer["leadTime"]["originalLabel"], offer["leadTime"]["days"], "day", "json:/offer/leadTime"),
            ("offer.seller", offer["seller"], offer["seller"], None, "json:/offer/seller"),
            ("offer.authorization_state", offer["authorizationState"], offer["authorizationState"], None, "json:/offer/authorizationState"),
            ("offer.condition", offer["condition"], offer["condition"], None, "json:/offer/condition"),
            ("offer.listing_status", offer["listingStatus"], offer["listingStatus"], None, "json:/offer/listingStatus"),
        ]
        return {
            "externalRecordId": observation_id,
            "recordType": "offer",
            "sourceUrl": offer["listingUrl"],
            "rawPayload": offer,
            "parsedData": {
                "canonicalOfferExternalId": f"{SOURCE_ID}:{offer['supplierSku']}",
                "sourceSupplierId": offer["sourceSupplierId"],
                "sourceManufacturerId": offer["sourceManufacturerId"],
                "supplierSku": offer["supplierSku"],
                "manufacturerPartNumber": offer["manufacturerPartNumber"],
                "productTitle": offer["productTitle"],
                "price": offer["price"],
                "stock": offer["stock"],
                "leadTime": offer["leadTime"],
                "currency": offer["price"]["currency"],
                "locale": offer["locale"],
                "region": offer["region"],
                "seller": offer["seller"],
                "authorizationState": offer["authorizationState"],
                "condition": offer["condition"],
                "listingStatus": offer["listingStatus"],
                "observedAt": observed_at,
            },
            "confidence": 1.0,
            "provenance": {
                "originalPublishedAt": None,
                "lastSuccessfulCheckAt": observed_at,
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
                "contentSha256": item["contentSha256"],
                "immutableExternalUrl": offer["listingUrl"],
                "retrievalMetadata": {
                    "fixtureName": item["path"].name,
                    "locale": offer["locale"],
                    "networkAccess": False,
                    "region": offer["region"],
                },
            },
            "claims": [
                {
                    "claimKey": key,
                    "originalValue": original,
                    "normalizedValue": normalized,
                    "unit": unit,
                    "confidence": 1.0,
                    "evidenceLocator": locator,
                    "classification": "official",
                    "language": source["language"],
                    "countryOrRegion": offer["region"],
                    "applicableRevision": revision,
                    "extractionMethod": "fixture-json-pointer",
                }
                for key, original, normalized, unit, locator in claims
            ],
            "lifecycleEvents": [
                {
                    "eventType": "offer_observed",
                    "occurredAt": observed_at,
                    "reason": "offline fixture acquisition",
                    "details": {
                        "listingStatus": offer["listingStatus"],
                        "networkAccess": False,
                    },
                },
            ],
        }

    @staticmethod
    def _withdrawal_record(
        item: dict[str, Any],
        withdrawal_of: str,
        observed_at: str,
    ) -> dict[str, Any]:
        offer = item["payload"]["offer"]
        revision = f"{offer['manufacturerPartNumber']}:{offer['supplierSku']}"
        return {
            "externalRecordId": f"{SOURCE_ID}:{offer['supplierSku']}:withdrawal:{observed_at}",
            "recordType": "offer",
            "sourceUrl": offer["listingUrl"],
            "rawPayload": {"listingStatus": "delisted"},
            "parsedData": {
                "canonicalOfferExternalId": f"{SOURCE_ID}:{offer['supplierSku']}",
                "listingStatus": "delisted",
                "observedAt": observed_at,
            },
            "confidence": 1.0,
            "action": "withdraw",
            "withdrawalOfExternalRecordId": withdrawal_of,
            "provenance": {
                "originalPublishedAt": None,
                "lastSuccessfulCheckAt": observed_at,
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
                "contentSha256": item["contentSha256"],
                "immutableExternalUrl": offer["listingUrl"],
                "retrievalMetadata": {
                    "fixtureName": item["path"].name,
                    "networkAccess": False,
                },
            },
            "claims": [],
            "lifecycleEvents": [
                {
                    "eventType": "delisted",
                    "occurredAt": observed_at,
                    "reason": "source fixture reports listing delisted",
                    "details": {"previousExternalRecordId": withdrawal_of},
                },
            ],
        }
