from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any
from urllib.parse import urlsplit

import httpx

from .contracts import ContractValidator


class SubmissionError(RuntimeError):
    pass


class IngestionClient:
    def __init__(
        self,
        *,
        endpoint: str,
        credential: str,
        validator: ContractValidator,
        http: httpx.Client | None = None,
        sleep: Callable[[float], None] = time.sleep,
        max_attempts: int = 3,
    ) -> None:
        parsed = urlsplit(endpoint)
        if parsed.scheme != "https" or not parsed.hostname:
            raise SubmissionError("ingestion endpoint must be HTTPS")
        if parsed.username is not None or parsed.password is not None:
            raise SubmissionError("ingestion endpoint cannot include credentials")
        if not credential:
            raise SubmissionError("ingestion credential is required")
        self._endpoint = endpoint
        self._credential = credential
        self._validator = validator
        self._http = http or httpx.Client(follow_redirects=False, timeout=20, trust_env=False)
        self._owns_http = http is None
        self._sleep = sleep
        self._max_attempts = max_attempts

    def submit(self, batch: dict[str, Any]) -> dict[str, Any]:
        self._validator.validate_import_batch(batch)
        headers = {
            "Authorization": f"Bearer {self._credential}",
            "Content-Type": "application/json",
            "Idempotency-Key": batch["idempotencyKey"],
            "X-Trace-Id": batch["traceId"],
        }
        if batch.get("traceparent"):
            headers["traceparent"] = batch["traceparent"]
        for attempt in range(1, self._max_attempts + 1):
            try:
                response = self._http.post(self._endpoint, json=batch, headers=headers)
            except httpx.RequestError as error:
                if attempt == self._max_attempts:
                    raise SubmissionError("ingestion request failed after bounded retries") from error
                self._sleep(2 ** (attempt - 1))
                continue
            if response.status_code in {200, 201, 202}:
                try:
                    payload = response.json()
                except ValueError as error:
                    raise SubmissionError("ingestion returned invalid JSON") from error
                if not isinstance(payload, dict):
                    raise SubmissionError("ingestion response must be an object")
                return payload
            if response.status_code == 429 or 500 <= response.status_code <= 599:
                if attempt < self._max_attempts:
                    self._sleep(_retry_delay(response, attempt))
                    continue
            raise SubmissionError(f"ingestion returned status {response.status_code}")
        raise SubmissionError("ingestion request failed after bounded retries")

    def close(self) -> None:
        if self._owns_http:
            self._http.close()

    def __enter__(self) -> "IngestionClient":
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()


def _retry_delay(response: httpx.Response, attempt: int) -> float:
    header = response.headers.get("Retry-After")
    if header is not None:
        try:
            return max(0.0, float(header))
        except ValueError:
            pass
    return float(2 ** (attempt - 1))
