#!/usr/bin/env python3
"""Mirror exact official component photos from reviewed vendor hosts.

Dry-run is default. Publication requires both a stored MPN match in the official
page bytes and an image URL on an allowlisted first-party/vendor CDN. Images are
normalized to bounded WebP files, uploaded content-addressed to R2, and linked
with idempotent SQL waves. No fuzzy identity matching is used.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import io
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from PIL import Image

for site in Path("/root/.cloudflare/venv/lib").glob("python*/site-packages"):
    sys.path.append(str(site))
import boto3  # type: ignore[import-not-found]  # noqa: E402

DATABASE_ID = "10c57e79-e34f-4643-8c4e-4f0c7968a74d"
BUCKET = "robopartpicker-files"
STAMP = "2026-08-26T00:00:00.000Z"
OUTPUT = Path(".ingest/component-images/exact-official-v1")
CHECKPOINT = OUTPUT / "checkpoint.jsonl"
VENDORS = {
    "schunk.com": {"d16vz4puxlsxm1.cloudfront.net", "schunk.com"},
    "store.tmotor.com": {"store.tmotor.com"},
    "www.pololu.com": {"a.pololu-files.com", "www.pololu.com"},
    "www.revrobotics.com": {"cdn11.bigcommerce.com", "www.revrobotics.com"},
    "www.gobilda.com": {"cdn11.bigcommerce.com", "www.gobilda.com"},
    "www.digikey.com": {"mm.digikey.com", "media.digikey.com", "sc-c.digikeyassets.com", "www.digikey.com"},
}
PAGE_LIMIT = 3_000_000
IMAGE_LIMIT = 15 * 1024 * 1024
UA = "Mozilla/5.0 (compatible; RoboPartPickerEvidenceCollector/1.0; +https://robopartpicker.com/about)"


def norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", html.unescape(value).lower())


def attrs(tag: str) -> dict[str, str]:
    return {name.lower(): html.unescape(value) for name, _, value in re.findall(r"([:\w-]+)\s*=\s*([\"'])(.*?)\2", tag, re.S)}


def official_image(page: str, page_url: str) -> str | None:
    candidates: list[str] = []
    for tag in re.findall(r"<meta\b[^>]*>", page, re.I | re.S):
        item = attrs(tag)
        key = (item.get("property") or item.get("name") or "").lower()
        if key in {"og:image", "og:image:secure_url", "twitter:image", "twitter:image:src"} and item.get("content"):
            candidates.append(urljoin(page_url, item["content"]))
    for value in candidates:
        if urlparse(value).hostname in VENDORS[urlparse(page_url).hostname or ""]:
            return value
    return None


def digikey_image(page: str, mpn: str) -> str | None:
    normalized_mpn = norm(mpn)
    for alt, value in re.findall(r"!\[([^\]]*)\]\((https?://[^)\s]+)[^)]*\)", page, re.I):
        host = urlparse(value).hostname
        if host not in VENDORS["www.digikey.com"] or normalized_mpn not in norm(alt):
            continue
        if any(token in value.lower() for token in ("nophoto", "no-photo", "no_image", "noimage", "pna_")):
            continue
        return html.unescape(value)
    return None


def file_id(component_id: str, checksum: str) -> str:
    return "file-component-photo-" + hashlib.sha256(f"{component_id}:{checksum}".encode()).hexdigest()[:24]


def sql(value: str | None) -> str:
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


class D1:
    def __init__(self) -> None:
        self.url = f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CF_ACCOUNT_ID']}/d1/database/{DATABASE_ID}/query"
        self.headers = {"Authorization": f"Bearer {os.environ['CF_API_TOKEN']}", "Content-Type": "application/json"}

    def rows(self, statement: str) -> list[dict[str, object]]:
        for attempt in range(5):
            response = requests.post(self.url, headers=self.headers, json={"sql": statement}, timeout=120)
            payload = response.json()
            if response.ok and payload.get("success"):
                return payload["result"][0].get("results", [])
            if attempt == 4:
                raise RuntimeError(f"D1 HTTP {response.status_code}: {payload.get('errors')}")
            time.sleep(2 ** attempt)
        raise AssertionError("unreachable")


def candidates(d1: D1, limit: int) -> list[dict[str, object]]:
    suffix = f" LIMIT {limit}" if limit else ""
    return d1.rows(f"""SELECT c.id,c.slug,c.name,c.manufacturer_part_number,c.source_url
      FROM components c WHERE c.deleted_at IS NULL AND c.is_demo=0
        AND trim(coalesce(c.manufacturer_part_number,''))<>''
        AND (c.source_url LIKE 'https://schunk.com/%' OR c.source_url LIKE 'https://store.tmotor.com/%'
          OR c.source_url LIKE 'https://www.pololu.com/%' OR c.source_url LIKE 'https://www.revrobotics.com/%'
          OR c.source_url LIKE 'https://www.gobilda.com/%' OR c.source_url LIKE 'https://www.digikey.com/%')
        AND NOT EXISTS (SELECT 1 FROM component_files cf JOIN files f ON f.id=cf.file_id
          WHERE cf.component_id=c.id AND cf.purpose='image' AND f.status='ready' AND f.deleted_at IS NULL)
        AND (c.source_url NOT LIKE 'https://www.digikey.com/%' OR EXISTS (
          SELECT 1 FROM bom_items bi JOIN bom_versions bv ON bv.id=bi.bom_version_id
          JOIN boms b ON b.current_version_id=bv.id WHERE bi.component_id=c.id AND bi.included=1
            AND b.is_demo=0 AND bv.publication_state IN ('verified','partial')
        ))
      ORDER BY c.source_url,c.id{suffix}""")


def checkpoint_latest() -> dict[str, dict[str, object]]:
    latest: dict[str, dict[str, object]] = {}
    if not CHECKPOINT.exists():
        return latest
    for line in CHECKPOINT.read_text().splitlines():
        if not line.strip():
            continue
        try:
            item = json.loads(line)
            latest[str(item["componentId"])] = item
        except Exception:
            continue
    return latest


def fetch(session: requests.Session, row: dict[str, object]) -> dict[str, object]:
    source_url = str(row["source_url"])
    source_host = urlparse(source_url).hostname
    if source_host not in VENDORS:
        raise ValueError("source host is not allowlisted")
    reader_url = f"https://r.jina.ai/{source_url}" if source_host == "www.digikey.com" else source_url
    page_response = session.get(reader_url, timeout=90 if source_host == "www.digikey.com" else 40, allow_redirects=True, headers={"Accept": "text/markdown" if source_host == "www.digikey.com" else "text/html,application/xhtml+xml"})
    page_response.raise_for_status()
    if source_host != "www.digikey.com" and urlparse(page_response.url).hostname != source_host:
        raise ValueError("official page redirected off the reviewed host")
    page = page_response.text[:PAGE_LIMIT]
    mpn = str(row["manufacturer_part_number"])
    if len(norm(mpn)) < 3 or norm(mpn) not in norm(page):
        raise ValueError("stored MPN is not present in official page")
    image_url = digikey_image(page, mpn) if source_host == "www.digikey.com" else official_image(page, page_response.url)
    if not image_url:
        raise ValueError("official page has no exact allowlisted product image")
    image_response = session.get(image_url, timeout=50, allow_redirects=True, stream=True, headers={"Accept": "image/*", "Referer": page_response.url})
    image_response.raise_for_status()
    final_host = urlparse(image_response.url).hostname
    if final_host not in VENDORS[source_host]:
        raise ValueError("product image redirected off the reviewed CDN")
    raw = bytearray()
    for chunk in image_response.iter_content(64 * 1024):
        raw.extend(chunk)
        if len(raw) > IMAGE_LIMIT:
            raise ValueError("product image exceeds 15 MiB")
    with Image.open(io.BytesIO(raw)) as source:
        source.load()
        if source.width < 240 or source.height < 180:
            raise ValueError(f"product image is too small: {source.width}x{source.height}")
        image = source.convert("RGB")
        image.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        image.save(buffer, "WEBP", quality=88, method=6)
        transformed = buffer.getvalue()
        width, height = image.size
    checksum = hashlib.sha256(transformed).hexdigest()
    component_id = str(row["id"])
    target = OUTPUT / "media" / f"{component_id}-{checksum[:12]}.webp"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(transformed)
    return {"componentId": component_id, "slug": row["slug"], "mpn": mpn, "sourcePageUrl": source_url if source_host == "www.digikey.com" else page_response.url,
        "sourceImageUrl": image_response.url, "checksumSha256": checksum, "fileId": file_id(component_id, checksum),
        "objectKey": f"component-media/exact-official-v1/{component_id}/{checksum}.webp", "localPath": str(target),
        "sizeBytes": len(transformed), "width": width, "height": height, "status": "prepared"}


def upload_s3(item: dict[str, object]) -> None:
    s3 = boto3.client("s3", endpoint_url=os.environ["R2_ENDPOINT"], aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"], region_name=os.environ.get("R2_REGION", "auto"),
        config=boto3.session.Config(signature_version="s3v4"))
    key = str(item["objectKey"])
    try:
        s3.head_object(Bucket=BUCKET, Key=key)
        return
    except Exception:
        pass
    s3.put_object(Bucket=BUCKET, Key=key, Body=Path(str(item["localPath"])).read_bytes(), ContentType="image/webp",
        CacheControl="public, max-age=31536000, immutable", Metadata={"sha256": str(item["checksumSha256"]), "source-page": str(item["sourcePageUrl"])[:1800]})


def statement(item: dict[str, object]) -> str:
    metadata = json.dumps({"exactIdentity": {"field": "manufacturer_part_number", "value": item["mpn"]},
        "sourcePageUrl": item["sourcePageUrl"], "sourceImageUrl": item["sourceImageUrl"], "checksumSha256": item["checksumSha256"],
        "width": item["width"], "height": item["height"], "transform": "bounded-webp-q88-v1"}, separators=(",", ":"))
    return f"""INSERT OR IGNORE INTO files (id,object_key,original_name,media_type,size_bytes,checksum_sha256,owner_user_id,organization_id,visibility,status,kind,metadata_json,created_at,updated_at)
VALUES ({sql(str(item['fileId']))},{sql(str(item['objectKey']))},{sql(str(item['slug']) + '-official.webp')},'image/webp',{int(str(item['sizeBytes']))},{sql(str(item['checksumSha256']))},'system',NULL,'public','ready','image',{sql(metadata)},{sql(STAMP)},{sql(STAMP)});
INSERT OR IGNORE INTO component_files (component_id,component_revision_id,file_id,purpose,sort_order,created_at)
VALUES ({sql(str(item['componentId']))},NULL,{sql(str(item['fileId']))},'image',0,{sql(STAMP)});"""


def apply_waves(items: list[dict[str, object]], batch_size: int) -> None:
    wave_dir = OUTPUT / "waves"
    wave_dir.mkdir(parents=True, exist_ok=True)
    for offset in range(0, len(items), batch_size):
        path = wave_dir / f"wave-{offset // batch_size + 1:03d}.sql"
        path.write_text("\n".join(statement(item) for item in items[offset:offset + batch_size]) + "\n")
        subprocess.run(["node_modules/.bin/wrangler", "d1", "execute", "DB", "--env", "production", "--remote", "--file", str(path)], check=True)
        print(f"applied {min(offset + batch_size, len(items))}/{len(items)}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--concurrency", type=int, default=6)
    parser.add_argument("--batch-size", type=int, default=40)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    rows = candidates(D1(), args.limit)
    completed = checkpoint_latest()
    pending = [row for row in rows if completed.get(str(row["id"]), {}).get("status") not in {"prepared", "published"}]
    print(json.dumps({"candidates": len(rows), "pending": len(pending), "mode": "apply" if args.apply else "dry-run"}), flush=True)
    session = requests.Session()
    session.headers["User-Agent"] = UA
    prepared: list[dict[str, object]] = [item for item in completed.values() if item.get("status") in {"prepared", "published"} and any(str(row["id"]) == item.get("componentId") for row in rows)]
    from concurrent.futures import ThreadPoolExecutor, as_completed
    with ThreadPoolExecutor(max_workers=max(1, min(args.concurrency, 12))) as pool:
        futures = {pool.submit(fetch, session, row): row for row in pending}
        for index, future in enumerate(as_completed(futures), 1):
            row = futures[future]
            try:
                item = future.result()
                prepared.append(item)
            except Exception as error:
                item = {"componentId": row["id"], "slug": row["slug"], "sourcePageUrl": row["source_url"], "status": "rejected", "error": str(error)[:400]}
            with CHECKPOINT.open("a") as handle:
                handle.write(json.dumps(item, separators=(",", ":")) + "\n")
            if index % 25 == 0 or index == len(pending):
                print(f"processed {index}/{len(pending)} prepared={len(prepared)}", flush=True)
    prepared = list({str(item["componentId"]): item for item in prepared}.values())
    if args.apply:
        for index, item in enumerate(prepared, 1):
            upload_s3(item)
            if index % 50 == 0 or index == len(prepared): print(f"uploaded {index}/{len(prepared)}", flush=True)
        apply_waves(prepared, args.batch_size)
    print(json.dumps({"prepared": len(prepared), "rejected": len(rows) - len(prepared), "applied": args.apply}), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
