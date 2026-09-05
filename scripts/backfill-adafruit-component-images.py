#!/usr/bin/env python3
"""Backfill exact Adafruit component-image links without a remote D1 join.

Dry-run is the default. The input exports come from D1 JSON queries containing
public component source URLs and ready catalog file metadata. Product identity
is accepted only when both sides expose the same numeric Adafruit product ID.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import requests

DATABASE_ID = "10c57e79-e34f-4643-8c4e-4f0c7968a74d"
EXPECTED_LINKS = 23_299
EXPECTED_COMPONENTS = 5_495
STAMP = "2026-08-25T00:00:00.000Z"
COMPONENT_RE = re.compile(r"^https?://(?:www\.)?adafruit\.com/product/(\d+)/?$")
FILE_RE = re.compile(r"^[0-9a-f]{32}-(\d+)-(\d+)[^/]*\.(?:jpe?g|png|webp|gif)$", re.IGNORECASE)


def d1_rows(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list) or not payload or not isinstance(payload[0].get("results"), list):
        raise ValueError(f"{path} is not a Wrangler D1 JSON result")
    return payload[0]["results"]


def build_links(components: list[dict[str, Any]], files: list[dict[str, Any]]) -> list[tuple[str, str, int]]:
    by_product: dict[str, str] = {}
    ambiguous: set[str] = set()
    for component in components:
        match = COMPONENT_RE.fullmatch(str(component.get("source_url") or ""))
        if not match:
            continue
        product_id = match.group(1)
        component_id = str(component["id"])
        existing = by_product.get(product_id)
        if existing is not None and existing != component_id:
            ambiguous.add(product_id)
        else:
            by_product[product_id] = component_id
    for product_id in ambiguous:
        by_product.pop(product_id, None)

    links: set[tuple[str, str, int]] = set()
    for file in files:
        match = FILE_RE.fullmatch(str(file.get("original_name") or ""))
        if not match:
            continue
        component_id = by_product.get(match.group(1))
        if component_id is None:
            continue
        links.add((component_id, str(file["id"]), int(match.group(2))))
    return sorted(links)


def sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def insert_sql(rows: list[tuple[str, str, int]]) -> str:
    values = ",\n".join(
        f"({sql_text(component_id)}, NULL, {sql_text(file_id)}, 'image', {sequence}, {sql_text(STAMP)})"
        for component_id, file_id, sequence in rows
    )
    return f"""INSERT OR IGNORE INTO component_files
(component_id, component_revision_id, file_id, purpose, sort_order, created_at)
VALUES\n{values}"""


class D1Client:
    def __init__(self) -> None:
        account_id = os.environ["CLOUDFLARE_ACCOUNT_ID"]
        token = os.environ["CLOUDFLARE_API_TOKEN"]
        self.endpoint = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{DATABASE_ID}/query"
        self.headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    def query(self, sql: str, attempts: int = 5) -> dict[str, Any]:
        for attempt in range(attempts):
            response = requests.post(self.endpoint, headers=self.headers, json={"sql": sql}, timeout=60)
            payload = response.json()
            if response.ok and payload.get("success"):
                return payload["result"][0]
            if attempt + 1 == attempts:
                raise RuntimeError(f"D1 query failed: HTTP {response.status_code} {payload.get('errors')}")
            time.sleep(2**attempt)
        raise AssertionError("unreachable")

    def scalar(self, sql: str) -> int:
        return int(self.query(sql)["results"][0]["n"])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--components", type=Path, default=Path("/tmp/rpp-components.json"))
    parser.add_argument("--files", type=Path, default=Path("/tmp/rpp-catalog-files.json"))
    parser.add_argument("--batch-size", type=int, default=250)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    links = build_links(d1_rows(args.components), d1_rows(args.files))
    component_count = len({component_id for component_id, _, _ in links})
    print(json.dumps({"links": len(links), "components": component_count, "mode": "apply" if args.apply else "dry-run"}))
    if len(links) != EXPECTED_LINKS or component_count != EXPECTED_COMPONENTS:
        raise RuntimeError("exact-link population changed; inspect the source exports before applying")
    if not args.apply:
        return 0

    client = D1Client()
    for index in range(0, len(links), args.batch_size):
        client.query(insert_sql(links[index:index + args.batch_size]))
        if index == 0 or (index // args.batch_size + 1) % 10 == 0 or index + args.batch_size >= len(links):
            print(f"applied {min(index + args.batch_size, len(links))}/{len(links)}", flush=True)

    exact_links = client.scalar("SELECT COUNT(*) AS n FROM component_files WHERE purpose = 'image'")
    exact_components = client.scalar("SELECT COUNT(DISTINCT component_id) AS n FROM component_files WHERE purpose = 'image'")
    print(json.dumps({"verified_links": exact_links, "verified_components": exact_components}))
    if exact_links != EXPECTED_LINKS or exact_components != EXPECTED_COMPONENTS:
        raise RuntimeError("remote component image counts do not match the reviewed map")
    return 0


if __name__ == "__main__":
    sys.exit(main())
