from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path
from typing import Any, Protocol

import yaml


CAPABILITY_FLAGS = ("discover", "acquire", "snapshot", "extract", "normalize", "submit")


class SourceAdapter(Protocol):
    def discover(self) -> Iterable[Any]: ...
    def acquire(self, discovered: Iterable[Any]) -> Iterable[Any]: ...
    def snapshot(self, acquired: Iterable[Any]) -> Iterable[Any]: ...
    def extract(self, snapshots: Iterable[Any]) -> Iterable[Any]: ...
    def normalize(self, extracted: Iterable[Any]) -> Iterable[Any]: ...
    def submit(self, normalized: Iterable[Any]) -> Any: ...


def validate_adapter_family_contract(path: Path) -> None:
    value = yaml.safe_load(path.read_text(encoding="utf8"))
    protocol = value.get("protocol", {})
    if tuple(protocol.get("capability_flags", ())) != CAPABILITY_FLAGS:
        raise ValueError("adapter-family capability flags do not match SourceAdapter")
    if tuple(protocol.get("lifecycle_order", ())) != CAPABILITY_FLAGS:
        raise ValueError("adapter-family lifecycle does not match SourceAdapter")
    for family_id, family in value.get("families", {}).items():
        if tuple(family.get("capabilities", {}).keys()) != CAPABILITY_FLAGS:
            raise ValueError(f"{family_id} does not declare every SourceAdapter capability")


def run_adapter(adapter: SourceAdapter) -> Any:
    discovered = adapter.discover()
    acquired = adapter.acquire(discovered)
    snapshots = adapter.snapshot(acquired)
    extracted = adapter.extract(snapshots)
    normalized = adapter.normalize(extracted)
    return adapter.submit(normalized)
