from datetime import UTC, datetime
from pathlib import Path

import pytest

from robopartpicker_collector.adapters.distributor_pilot import DistributorPilotAdapter
from robopartpicker_collector.core.budget import BudgetExceeded, InMemoryBudgetLedger
from robopartpicker_collector.core.contracts import ContractValidator
from robopartpicker_collector.core.protocol import run_adapter


REPO = Path(__file__).resolve().parents[3]
FIXTURES = REPO / "collector" / "tests" / "fixtures" / "distributor_pilot"
NOW = datetime(2026, 7, 29, 12, tzinfo=UTC)


def _ledger(
    *,
    cloudflare_infra: int = 1_000,
    paid_source_api: int = 1_000,
) -> InMemoryBudgetLedger:
    return InMemoryBudgetLedger(
        limits_microusd={
            "ai_token": 50_000_000,
            "cloudflare_infra": cloudflare_infra,
            "paid_source_api": paid_source_api,
        },
        now=lambda: NOW,
    )


def _adapter(
    fixture_paths: list[Path],
    *,
    ledger: InMemoryBudgetLedger | None = None,
    paid_projection: int = 20,
    infra_projection: int = 5,
) -> DistributorPilotAdapter:
    return DistributorPilotAdapter(
        fixture_paths=fixture_paths,
        pilot_config_path=REPO / "config" / "data-collection" / "pilot-sources.yaml",
        budget_ledger=ledger or _ledger(),
        projected_paid_source_api_microusd=paid_projection,
        projected_cloudflare_infra_microusd=infra_projection,
    )


def test_temporal_fixtures_append_offer_observations_and_withdrawal() -> None:
    result = run_adapter(_adapter([
        FIXTURES / "offer-2026-07-29.json",
        FIXTURES / "offer-2026-07-30-delisted.json",
    ]))

    assert result["networkAccess"] is False
    assert result["policyState"] == "approved_fixture_only"
    assert result["budgetTrace"] == {
        "ai_token": {"projectedMicrousd": 0, "consumedMicrousd": 0},
        "cloudflare_infra": {"projectedMicrousd": 5, "consumedMicrousd": 0},
        "paid_source_api": {"projectedMicrousd": 20, "consumedMicrousd": 0},
    }

    records = result["batch"]["records"]
    observations = [record for record in records if record.get("action", "upsert") == "upsert"]
    withdrawals = [record for record in records if record.get("action") == "withdraw"]
    assert len(observations) == 2
    assert len(withdrawals) == 1
    assert len({record["externalRecordId"] for record in observations}) == 2
    assert [record["parsedData"]["observedAt"] for record in observations] == [
        "2026-07-29T12:00:00Z",
        "2026-07-30T12:00:00Z",
    ]
    assert [record["parsedData"]["price"]["amount"] for record in observations] == [129.99, 124.99]
    assert [record["parsedData"]["stock"]["quantityAvailable"] for record in observations] == [8, 0]

    for record in observations:
        assert record["parsedData"]["currency"] == "USD"
        assert record["parsedData"]["locale"] == "en-US"
        assert record["parsedData"]["region"] == "US"
        assert record["parsedData"]["seller"] == "DigiKey"
        assert record["parsedData"]["authorizationState"] == "authorized_distributor"
        assert record["parsedData"]["condition"] == "new"

    assert withdrawals[0]["withdrawalOfExternalRecordId"] == observations[0]["externalRecordId"]
    assert withdrawals[0]["lifecycleEvents"][0]["eventType"] == "delisted"
    ContractValidator(REPO / "contracts").validate_import_batch(result["batch"])


def test_budget_is_reserved_before_fixture_acquisition_and_failure_releases_other_class() -> None:
    ledger = _ledger(cloudflare_infra=10, paid_source_api=0)
    adapter = _adapter(
        [FIXTURES / "does-not-exist.json"],
        ledger=ledger,
        paid_projection=1,
        infra_projection=5,
    )

    with pytest.raises(BudgetExceeded, match="paid_source_api"):
        run_adapter(adapter)

    assert ledger.status("cloudflare_infra", "digikey", "2026-07").remaining_microusd == 10


def test_duplicate_observation_identity_is_rejected() -> None:
    path = FIXTURES / "offer-2026-07-29.json"
    with pytest.raises(ValueError, match="duplicate temporal observation"):
        run_adapter(_adapter([path, path]))
