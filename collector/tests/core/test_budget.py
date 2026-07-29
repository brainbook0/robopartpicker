from datetime import UTC, datetime

import pytest

from robopartpicker_collector.core.budget import BudgetExceeded, InMemoryBudgetLedger


NOW = datetime(2026, 7, 29, 12, tzinfo=UTC)


def test_budget_classes_are_independent_and_never_borrow() -> None:
    ledger = InMemoryBudgetLedger(
        limits_microusd={
            "ai_token": 50_000_000,
            "cloudflare_infra": 1_000,
            "paid_source_api": 2_000,
        },
        now=lambda: NOW,
    )

    reservation = ledger.reserve("cloudflare_infra", "source-a", 900, "a" * 32)
    ledger.commit(reservation, 800)

    with pytest.raises(BudgetExceeded, match="cloudflare_infra"):
        ledger.reserve("cloudflare_infra", "source-a", 201, "b" * 32)

    paid = ledger.reserve("paid_source_api", "source-a", 2_000, "c" * 32)
    ledger.release(paid, "fixture rollback")
    assert ledger.status("paid_source_api", "source-a", "2026-07").remaining_microusd == 2_000
    assert ledger.status("ai_token", "source-a", "2026-07").remaining_microusd == 50_000_000


def test_commit_cannot_exceed_reserved_amount() -> None:
    ledger = InMemoryBudgetLedger(
        limits_microusd={"ai_token": 10, "cloudflare_infra": 10, "paid_source_api": 10},
        now=lambda: NOW,
    )
    reservation = ledger.reserve("ai_token", None, 5, "a" * 32)
    with pytest.raises(ValueError, match="reserved"):
        ledger.commit(reservation, 6)
