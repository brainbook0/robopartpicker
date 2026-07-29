from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Callable, Literal
from uuid import uuid4


CostClass = Literal["ai_token", "cloudflare_infra", "paid_source_api"]
ALLOWED_COST_CLASSES = ("ai_token", "cloudflare_infra", "paid_source_api")


class BudgetExceeded(RuntimeError):
    pass


@dataclass(frozen=True)
class BudgetStatus:
    cost_class: CostClass
    source_id: str | None
    period: str
    limit_microusd: int
    committed_microusd: int
    reserved_microusd: int
    remaining_microusd: int


@dataclass
class _Reservation:
    reservation_id: str
    cost_class: CostClass
    source_id: str | None
    period: str
    projected_microusd: int
    trace_id: str
    state: Literal["reserved", "committed", "released"] = "reserved"
    consumed_microusd: int = 0
    release_reason: str | None = None


class InMemoryBudgetLedger:
    """Append-style fixture ledger with class-local, non-borrowing limits."""

    def __init__(
        self,
        *,
        limits_microusd: dict[CostClass, int],
        now: Callable[[], datetime] | None = None,
    ) -> None:
        if set(limits_microusd) != set(ALLOWED_COST_CLASSES):
            raise ValueError(f"limits must define exactly {ALLOWED_COST_CLASSES}")
        if any(value < 0 for value in limits_microusd.values()):
            raise ValueError("budget limits cannot be negative")
        if limits_microusd["ai_token"] > 50_000_000:
            raise ValueError("ai_token monthly limit cannot exceed the approved USD 50 ceiling")
        self._limits = dict(limits_microusd)
        self._now = now or (lambda: datetime.now(UTC))
        self._reservations: dict[str, _Reservation] = {}

    def reserve(
        self,
        cost_class: CostClass,
        source_id: str | None,
        projected_microusd: int,
        trace_id: str,
    ) -> str:
        self._validate_cost_class(cost_class)
        if projected_microusd < 0:
            raise ValueError("projected_microusd cannot be negative")
        if len(trace_id) != 32 or any(character not in "0123456789abcdef" for character in trace_id):
            raise ValueError("trace_id must be lowercase 32-hex")
        period = self._now().astimezone(UTC).strftime("%Y-%m")
        status = self.status(cost_class, None, period)
        if projected_microusd > status.remaining_microusd:
            raise BudgetExceeded(
                f"{cost_class} budget exceeded: requested {projected_microusd}, "
                f"remaining {status.remaining_microusd}",
            )
        reservation_id = uuid4().hex
        self._reservations[reservation_id] = _Reservation(
            reservation_id=reservation_id,
            cost_class=cost_class,
            source_id=source_id,
            period=period,
            projected_microusd=projected_microusd,
            trace_id=trace_id,
        )
        return reservation_id

    def commit(self, reservation_id: str, consumed_microusd: int) -> None:
        reservation = self._active(reservation_id)
        if consumed_microusd < 0 or consumed_microusd > reservation.projected_microusd:
            raise ValueError("consumed amount cannot exceed the reserved amount")
        reservation.consumed_microusd = consumed_microusd
        reservation.state = "committed"

    def release(self, reservation_id: str, reason: str) -> None:
        reservation = self._active(reservation_id)
        if not reason.strip():
            raise ValueError("release reason is required")
        reservation.release_reason = reason.strip()
        reservation.state = "released"

    def status(self, cost_class: CostClass, source_id: str | None, period: str) -> BudgetStatus:
        self._validate_cost_class(cost_class)
        relevant = [
            item
            for item in self._reservations.values()
            if item.cost_class == cost_class
            and item.period == period
            and (source_id is None or item.source_id == source_id)
        ]
        committed = sum(item.consumed_microusd for item in relevant if item.state == "committed")
        reserved = sum(item.projected_microusd for item in relevant if item.state == "reserved")
        global_items = [
            item
            for item in self._reservations.values()
            if item.cost_class == cost_class and item.period == period
        ]
        global_committed = sum(item.consumed_microusd for item in global_items if item.state == "committed")
        global_reserved = sum(item.projected_microusd for item in global_items if item.state == "reserved")
        limit = self._limits[cost_class]
        return BudgetStatus(
            cost_class=cost_class,
            source_id=source_id,
            period=period,
            limit_microusd=limit,
            committed_microusd=committed,
            reserved_microusd=reserved,
            remaining_microusd=max(0, limit - global_committed - global_reserved),
        )

    def _active(self, reservation_id: str) -> _Reservation:
        try:
            reservation = self._reservations[reservation_id]
        except KeyError as error:
            raise KeyError(f"unknown reservation {reservation_id}") from error
        if reservation.state != "reserved":
            raise ValueError(f"reservation is already {reservation.state}")
        return reservation

    @staticmethod
    def _validate_cost_class(cost_class: str) -> None:
        if cost_class not in ALLOWED_COST_CLASSES:
            raise ValueError(f"unsupported cost class {cost_class}")
