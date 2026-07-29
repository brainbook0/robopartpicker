from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass


class CircuitOpen(RuntimeError):
    pass


@dataclass
class _CircuitState:
    failures: int = 0
    opened_at: float | None = None


class CircuitBreaker:
    def __init__(
        self,
        *,
        failure_threshold: int = 3,
        reset_after_seconds: float = 300,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if failure_threshold < 1 or reset_after_seconds <= 0:
            raise ValueError("circuit breaker thresholds must be positive")
        self._threshold = failure_threshold
        self._reset_after = reset_after_seconds
        self._clock = clock
        self._states: dict[str, _CircuitState] = {}

    def before_request(self, source_id: str) -> None:
        state = self._states.get(source_id)
        if state is None or state.opened_at is None:
            return
        if self._clock() - state.opened_at >= self._reset_after:
            state.opened_at = None
            state.failures = self._threshold - 1
            return
        raise CircuitOpen(f"source circuit is open for {source_id}")

    def record_success(self, source_id: str) -> None:
        self._states.pop(source_id, None)

    def record_failure(self, source_id: str) -> None:
        state = self._states.setdefault(source_id, _CircuitState())
        state.failures += 1
        if state.failures >= self._threshold:
            state.opened_at = self._clock()
