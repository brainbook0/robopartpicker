#!/usr/bin/env python3
import concurrent.futures
import hashlib
import json
import os
import sys
from pathlib import Path

import boto3
from botocore.config import Config

manifest_path = Path("data/commercial-catalog/media/top-300-gallery-manifest.json")
bucket = "robopartpicker-files"
account_id = os.environ.get("CF_ACCOUNT_ID") or os.environ.get("CLOUDFLARE_ACCOUNT_ID")
access_key = os.environ.get("R2_ACCESS_KEY_ID")
secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
if not all([account_id, access_key, secret_key]):
    raise SystemExit("CF_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required")
manifest = json.loads(manifest_path.read_text())
items = manifest["items"]
client = boto3.client(
    "s3",
    endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
    aws_access_key_id=access_key,
    aws_secret_access_key=secret_key,
    region_name="auto",
    config=Config(retries={"max_attempts": 4, "mode": "adaptive"}, max_pool_connections=16),
)
listed = set()
kwargs = {"Bucket": bucket, "Prefix": "commercial-catalog/top-300/"}
while True:
    page = client.list_objects_v2(**kwargs)
    listed.update(entry["Key"] for entry in page.get("Contents", []))
    if not page.get("IsTruncated"):
        break
    kwargs["ContinuationToken"] = page["NextContinuationToken"]

def verify(item):
    if item["objectKey"] not in listed:
        return item["slug"], "missing from listing"
    body = client.get_object(Bucket=bucket, Key=item["objectKey"])["Body"].read()
    if len(body) != item["sizeBytes"]:
        return item["slug"], f"size {len(body)} != {item['sizeBytes']}"
    digest = hashlib.sha256(body).hexdigest()
    if digest != item["checksumSha256"]:
        return item["slug"], f"sha256 {digest} != {item['checksumSha256']}"
    if body[:4] != b"RIFF" or body[8:12] != b"WEBP":
        return item["slug"], "not a WebP container"
    return item["slug"], None

with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
    results = list(executor.map(verify, items))
failures = [{"slug": slug, "error": error} for slug, error in results if error]
summary = {"expected": len(items), "listed": sum(item["objectKey"] in listed for item in items), "verified": len(items) - len(failures), "failures": failures}
print(json.dumps(summary, separators=(",", ":")))
if failures:
    sys.exit(1)
