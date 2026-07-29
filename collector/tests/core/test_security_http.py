from collections.abc import Iterable
from dataclasses import replace

import pytest

from robopartpicker_collector.core.http import (
    AcquisitionError,
    FakeTransport,
    SecureAcquirer,
    TransportResponse,
)
from robopartpicker_collector.core.policy import PolicyDenied, SourcePolicy
from robopartpicker_collector.core.resilience import CircuitBreaker, CircuitOpen
from robopartpicker_collector.core.security import UnsafeUrl, UrlGuard


def policy() -> SourcePolicy:
    return SourcePolicy(
        source_id="manufacturer-pilot",
        revision_id="policy-rev-1",
        policy_state="approved_live",
        enabled=True,
        base_url="https://manufacturer.example",
        allowed_hosts=("manufacturer.example", "docs.manufacturer.example"),
        robots_status="allowed",
        terms_status="approved",
        reuse_status="retention_approved",
        user_agent="RoboPartPickerBot/0.1 (+mailto:data@example.com)",
    )


def response(status: int, body: Iterable[bytes] = (), **headers: str) -> TransportResponse:
    return TransportResponse(status=status, headers=headers, body=body)


def public_resolver(_host: str) -> list[str]:
    return ["93.184.216.34"]


@pytest.mark.parametrize(
    "url",
    [
        "http://manufacturer.example/part",
        "https://user:pass@manufacturer.example/part",
        "https://localhost/part",
        "https://manufacturer.example:444/part",
        "https://not-approved.example/part",
    ],
)
def test_url_guard_rejects_unsafe_targets(url: str) -> None:
    guard = UrlGuard(resolver=lambda host: ["127.0.0.1"] if host == "localhost" else public_resolver(host))
    with pytest.raises(UnsafeUrl):
        guard.validate(url, policy().allowed_hosts)


def test_redirect_target_is_revalidated_against_dns_rebinding() -> None:
    answers = iter([["93.184.216.34"], ["10.0.0.2"]])
    guard = UrlGuard(resolver=lambda _host: next(answers))
    transport = FakeTransport(
        [
            response(302, location="https://docs.manufacturer.example/part"),
            response(200, [b"must not be reached"]),
        ],
    )
    with pytest.raises(UnsafeUrl, match="non-public"):
        SecureAcquirer(transport=transport, url_guard=guard).fetch(
            "https://manufacturer.example/part",
            policy(),
            max_bytes=100,
        )
    assert transport.request_count == 1


def test_policy_denial_prevents_transport_and_auth_challenges_are_not_retried() -> None:
    denied_transport = FakeTransport([])
    with pytest.raises(PolicyDenied):
        SecureAcquirer(
            transport=denied_transport,
            url_guard=UrlGuard(resolver=public_resolver),
        ).fetch(
            "https://manufacturer.example/part",
            replace(policy(), terms_status="denied"),
            max_bytes=100,
        )
    assert denied_transport.request_count == 0

    challenge = FakeTransport([response(401)])
    with pytest.raises(AcquisitionError, match="401"):
        SecureAcquirer(
            transport=challenge,
            url_guard=UrlGuard(resolver=public_resolver),
            max_attempts=3,
        ).fetch("https://manufacturer.example/part", policy(), max_bytes=100)
    assert challenge.request_count == 1


def test_conditional_304_and_bounded_streaming() -> None:
    guard = UrlGuard(resolver=public_resolver)
    not_modified = FakeTransport([response(304, etag='"same"')])
    result = SecureAcquirer(transport=not_modified, url_guard=guard).fetch(
        "https://manufacturer.example/part",
        policy(),
        max_bytes=100,
        etag='"same"',
    )
    assert result.not_modified is True
    assert not_modified.requests[0].headers["If-None-Match"] == '"same"'

    oversized = FakeTransport([response(200, [b"12345", b"67890", b"!"])])
    with pytest.raises(AcquisitionError, match="byte limit"):
        SecureAcquirer(transport=oversized, url_guard=guard).fetch(
            "https://manufacturer.example/part",
            policy(),
            max_bytes=10,
        )

    compressed = FakeTransport([response(200, [b"compressed"], content_encoding="gzip")])
    with pytest.raises(AcquisitionError, match="compressed"):
        SecureAcquirer(transport=compressed, url_guard=guard).fetch(
            "https://manufacturer.example/part",
            policy(),
            max_bytes=100,
        )


def test_429_retry_after_and_retryable_5xx_are_bounded() -> None:
    sleeps: list[float] = []
    transport = FakeTransport(
        [
            response(429, retry_after="2"),
            response(503),
            response(200, [b"ok"], content_type="text/plain"),
        ],
    )
    result = SecureAcquirer(
        transport=transport,
        url_guard=UrlGuard(resolver=public_resolver),
        sleep=sleeps.append,
        jitter=lambda: 0,
        max_attempts=3,
    ).fetch("https://manufacturer.example/part", policy(), max_bytes=10)
    assert result.content == b"ok"
    assert sleeps == [2, 2]
    assert transport.request_count == 3


def test_repeated_failures_open_source_local_circuit() -> None:
    transport = FakeTransport([response(503), response(503)])
    breaker = CircuitBreaker(failure_threshold=2, reset_after_seconds=60, clock=lambda: 0)
    acquirer = SecureAcquirer(
        transport=transport,
        url_guard=UrlGuard(resolver=public_resolver),
        circuit_breaker=breaker,
        max_attempts=1,
    )
    for _ in range(2):
        with pytest.raises(AcquisitionError):
            acquirer.fetch("https://manufacturer.example/part", policy(), max_bytes=10)
    with pytest.raises(CircuitOpen):
        acquirer.fetch("https://manufacturer.example/part", policy(), max_bytes=10)
    assert transport.request_count == 2
