import json
from pathlib import Path

import httpx
import pytest

from robopartpicker_collector.core.contracts import ContractValidator
from robopartpicker_collector.core.ingestion import IngestionClient, SubmissionError
from robopartpicker_collector.core.redaction import redact


REPO = Path(__file__).resolve().parents[3]


def batch() -> dict:
    return json.loads((REPO / "contracts" / "examples" / "import-batch.v2.json").read_text())


def test_ingestion_uses_required_headers_and_retries_without_logging_secret() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(503, request=request)
        return httpx.Response(202, json={"jobId": "job-1"}, request=request)

    sleeps: list[float] = []
    validator = ContractValidator(REPO / "contracts")
    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        result = IngestionClient(
            endpoint="https://robopartpicker.com/api/v1/imports/batches",
            credential="super-secret",
            validator=validator,
            http=http,
            sleep=sleeps.append,
            max_attempts=2,
        ).submit(batch())

    assert result == {"jobId": "job-1"}
    assert requests[-1].headers["Authorization"] == "Bearer super-secret"
    assert requests[-1].headers["Idempotency-Key"] == batch()["idempotencyKey"]
    assert requests[-1].headers["traceparent"] == batch()["traceparent"]
    assert sleeps == [1]
    assert "super-secret" not in json.dumps(redact({"authorization": "Bearer super-secret"}))


def test_ingestion_rejects_non_https_endpoint() -> None:
    with pytest.raises(SubmissionError, match="HTTPS"):
        IngestionClient(
            endpoint="http://robopartpicker.com/api/v1/imports/batches",
            credential="secret",
            validator=ContractValidator(REPO / "contracts"),
        )
