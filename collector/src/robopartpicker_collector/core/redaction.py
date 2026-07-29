from __future__ import annotations

from typing import Any


SENSITIVE_FRAGMENTS = ("authorization", "credential", "secret", "token", "password", "api_key", "apikey")


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: "[REDACTED]" if any(fragment in key.lower() for fragment in SENSITIVE_FRAGMENTS) else redact(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, tuple):
        return tuple(redact(item) for item in value)
    return value
