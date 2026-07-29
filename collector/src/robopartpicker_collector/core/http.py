from __future__ import annotations

import hashlib
import http.client
import random
import socket
import ssl
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from email.utils import parsedate_to_datetime
from typing import Protocol
from urllib.parse import urljoin, urlsplit

from .policy import SourcePolicy, SourcePolicyEngine
from .resilience import CircuitBreaker
from .security import UrlGuard, ValidatedUrl


class AcquisitionError(RuntimeError):
    pass


@dataclass
class TransportResponse:
    status: int
    headers: dict[str, str]
    body: Iterable[bytes] = ()
    close: Callable[[], None] = lambda: None


@dataclass(frozen=True)
class TransportRequest:
    url: str
    headers: dict[str, str]


class Transport(Protocol):
    def send(self, target: ValidatedUrl, headers: dict[str, str]) -> TransportResponse: ...


class FakeTransport:
    def __init__(self, responses: list[TransportResponse]) -> None:
        self._responses = list(responses)
        self.requests: list[TransportRequest] = []

    @property
    def request_count(self) -> int:
        return len(self.requests)

    def send(self, target: ValidatedUrl, headers: dict[str, str]) -> TransportResponse:
        self.requests.append(TransportRequest(url=target.url, headers=dict(headers)))
        if not self._responses:
            raise AssertionError("fake transport exhausted")
        response = self._responses.pop(0)
        response.headers = {key.lower().replace("_", "-"): value for key, value in response.headers.items()}
        return response


class PinnedHttpsTransport:
    """Connects to the already-validated IP while retaining hostname TLS verification."""

    def __init__(self, *, timeout_seconds: float = 20, chunk_size: int = 64 * 1024) -> None:
        self._timeout = timeout_seconds
        self._chunk_size = chunk_size
        self._context = ssl.create_default_context()

    def send(self, target: ValidatedUrl, headers: dict[str, str]) -> TransportResponse:
        parsed = urlsplit(target.url)
        path = parsed.path or "/"
        if parsed.query:
            path = f"{path}?{parsed.query}"
        last_error: OSError | http.client.HTTPException | None = None
        for address in target.addresses:
            connection = _PinnedHttpsConnection(
                target.host,
                address,
                target.port,
                timeout=self._timeout,
                context=self._context,
            )
            try:
                connection.request("GET", path, headers=headers)
                response = connection.getresponse()

                def chunks() -> Iterable[bytes]:
                    while chunk := response.read(self._chunk_size):
                        yield chunk

                return TransportResponse(
                    status=response.status,
                    headers={key.lower(): value for key, value in response.getheaders()},
                    body=chunks(),
                    close=connection.close,
                )
            except (OSError, http.client.HTTPException) as error:
                connection.close()
                last_error = error
        raise AcquisitionError("all validated source addresses failed") from last_error


class _PinnedHttpsConnection(http.client.HTTPSConnection):
    def __init__(
        self,
        hostname: str,
        address: str,
        port: int,
        *,
        timeout: float,
        context: ssl.SSLContext,
    ) -> None:
        super().__init__(hostname, port=port, timeout=timeout, context=context)
        self._validated_address = address

    def connect(self) -> None:
        sock = socket.create_connection((self._validated_address, self.port), self.timeout)
        try:
            self.sock = self._context.wrap_socket(sock, server_hostname=self.host)
        except Exception:
            sock.close()
            raise


@dataclass(frozen=True)
class AcquisitionResult:
    final_url: str
    status: int
    headers: dict[str, str]
    content: bytes
    content_sha256: str
    redirect_chain: tuple[str, ...] = field(default_factory=tuple)
    not_modified: bool = False


class SecureAcquirer:
    REDIRECT_STATUSES = {301, 302, 303, 307, 308}

    def __init__(
        self,
        *,
        transport: Transport,
        url_guard: UrlGuard,
        policy_engine: SourcePolicyEngine | None = None,
        circuit_breaker: CircuitBreaker | None = None,
        sleep: Callable[[float], None] = time.sleep,
        jitter: Callable[[], float] = random.random,
        max_attempts: int = 3,
        max_redirects: int = 5,
    ) -> None:
        if max_attempts < 1:
            raise ValueError("max_attempts must be positive")
        self._transport = transport
        self._url_guard = url_guard
        self._policy_engine = policy_engine or SourcePolicyEngine()
        self._circuit_breaker = circuit_breaker or CircuitBreaker()
        self._sleep = sleep
        self._jitter = jitter
        self._max_attempts = max_attempts
        self._max_redirects = max_redirects

    def fetch(
        self,
        url: str,
        policy: SourcePolicy,
        *,
        max_bytes: int,
        etag: str | None = None,
        last_modified: str | None = None,
    ) -> AcquisitionResult:
        self._policy_engine.authorize(policy, fixture_mode=False)
        self._circuit_breaker.before_request(policy.source_id)
        if max_bytes <= 0:
            raise ValueError("max_bytes must be positive")
        headers = {
            "Accept-Encoding": "identity",
            "User-Agent": policy.user_agent,
        }
        if etag:
            headers["If-None-Match"] = etag
        if last_modified:
            headers["If-Modified-Since"] = last_modified

        last_error: AcquisitionError | None = None
        for attempt in range(1, self._max_attempts + 1):
            current = url
            redirect_chain: list[str] = []
            try:
                for _ in range(self._max_redirects + 1):
                    target = self._url_guard.validate(current, policy.allowed_hosts)
                    current = target.url
                    response = self._transport.send(target, headers)
                    if response.status in self.REDIRECT_STATUSES:
                        try:
                            location = response.headers["location"]
                        except KeyError as error:
                            response.close()
                            raise AcquisitionError("redirect response is missing Location") from error
                        response.close()
                        redirect_chain.append(current)
                        current = urljoin(current, location)
                        continue
                    result = self._consume(response, current, tuple(redirect_chain), max_bytes)
                    self._circuit_breaker.record_success(policy.source_id)
                    return result
                raise AcquisitionError("redirect limit exceeded")
            except _RetryableAcquisition as error:
                last_error = AcquisitionError(str(error))
                if attempt == self._max_attempts:
                    break
                delay = error.retry_after if error.retry_after is not None else 2 ** (attempt - 1)
                self._sleep(delay + self._jitter())
            except AcquisitionError:
                self._circuit_breaker.record_failure(policy.source_id)
                raise
        self._circuit_breaker.record_failure(policy.source_id)
        raise last_error or AcquisitionError("acquisition failed")

    def _consume(
        self,
        response: TransportResponse,
        final_url: str,
        redirect_chain: tuple[str, ...],
        max_bytes: int,
    ) -> AcquisitionResult:
        try:
            if response.status == 304:
                return AcquisitionResult(
                    final_url=final_url,
                    status=304,
                    headers=response.headers,
                    content=b"",
                    content_sha256=hashlib.sha256(b"").hexdigest(),
                    redirect_chain=redirect_chain,
                    not_modified=True,
                )
            if response.status == 429:
                raise _RetryableAcquisition(
                    "source rate limited the request",
                    retry_after=_parse_retry_after(response.headers.get("retry-after")),
                )
            if 500 <= response.status <= 599:
                raise _RetryableAcquisition(f"source returned retryable status {response.status}")
            if response.status < 200 or response.status >= 300:
                raise AcquisitionError(f"source returned status {response.status}")
            content_encoding = response.headers.get("content-encoding", "identity").lower()
            if content_encoding not in {"", "identity"}:
                raise AcquisitionError("compressed response is not allowed by the bounded core")
            declared_length = response.headers.get("content-length")
            if declared_length is not None:
                try:
                    parsed_length = int(declared_length)
                    if parsed_length < 0:
                        raise AcquisitionError("invalid Content-Length")
                    if parsed_length > max_bytes:
                        raise AcquisitionError("response exceeds byte limit")
                except ValueError as error:
                    raise AcquisitionError("invalid Content-Length") from error
            chunks: list[bytes] = []
            total = 0
            digest = hashlib.sha256()
            try:
                for chunk in response.body:
                    total += len(chunk)
                    if total > max_bytes:
                        raise AcquisitionError("response exceeds byte limit")
                    chunks.append(chunk)
                    digest.update(chunk)
            except OSError as error:
                raise AcquisitionError("source stream failed") from error
            return AcquisitionResult(
                final_url=final_url,
                status=response.status,
                headers=response.headers,
                content=b"".join(chunks),
                content_sha256=digest.hexdigest(),
                redirect_chain=redirect_chain,
            )
        finally:
            response.close()


class _RetryableAcquisition(RuntimeError):
    def __init__(self, message: str, retry_after: float | None = None) -> None:
        super().__init__(message)
        self.retry_after = retry_after


def _parse_retry_after(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        try:
            target = parsedate_to_datetime(value)
            return max(0.0, target.timestamp() - time.time())
        except (TypeError, ValueError):
            return None
