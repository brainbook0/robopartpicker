from __future__ import annotations

import ipaddress
import socket
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from urllib.parse import urlsplit


class UnsafeUrl(RuntimeError):
    pass


Resolver = Callable[[str], Iterable[str]]


@dataclass(frozen=True)
class ValidatedUrl:
    url: str
    host: str
    port: int
    addresses: tuple[str, ...]


def system_resolver(host: str) -> list[str]:
    return sorted({item[4][0] for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)})


class UrlGuard:
    def __init__(self, *, resolver: Resolver = system_resolver) -> None:
        self._resolver = resolver

    def validate(self, url: str, allowed_hosts: tuple[str, ...]) -> ValidatedUrl:
        parsed = urlsplit(url)
        if parsed.scheme.lower() != "https":
            raise UnsafeUrl("only HTTPS source URLs are allowed")
        if parsed.username is not None or parsed.password is not None:
            raise UnsafeUrl("embedded URL credentials are forbidden")
        try:
            port = parsed.port
        except ValueError as error:
            raise UnsafeUrl("invalid URL port") from error
        if port not in {None, 443}:
            raise UnsafeUrl("only the default HTTPS port is allowed")
        host = (parsed.hostname or "").rstrip(".").lower()
        if not host:
            raise UnsafeUrl("URL hostname is required")
        allowed = {item.rstrip(".").lower() for item in allowed_hosts}
        if host not in allowed:
            raise UnsafeUrl(f"host {host} is not in the source allowlist")
        try:
            addresses = list(self._resolver(host))
        except OSError as error:
            raise UnsafeUrl(f"DNS resolution failed for {host}") from error
        if not addresses:
            raise UnsafeUrl(f"DNS returned no addresses for {host}")
        for address in addresses:
            try:
                parsed_address = ipaddress.ip_address(address)
            except ValueError as error:
                raise UnsafeUrl(f"DNS returned an invalid address for {host}") from error
            if not parsed_address.is_global:
                raise UnsafeUrl(f"DNS returned non-public address for {host}")
        return ValidatedUrl(
            url=parsed.geturl(),
            host=host,
            port=port or 443,
            addresses=tuple(addresses),
        )
