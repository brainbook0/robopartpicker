#!/usr/bin/env python3
"""Migrate the catalog from preview D1/R2 to production D1/R2.

Copies catalog tables (manufacturers -> files) row-for-row from the preview D1
into production, then copies the referenced R2 objects from
robopartpicker-preview-files into robopartpicker-files. Idempotent: uses
INSERT OR IGNORE and skips R2 objects that already exist.

Usage: python3 scripts/migrate-catalog-to-production.py [--r2-only]
"""
import json, os, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

ACCT = os.environ["CF_ACCOUNT_ID"]
TOKEN = os.environ["CF_API_TOKEN"]
SRC_DB = "af9e3aaa-4e74-4083-8317-a642bf0e07a6"   # preview
DST_DB = "10c57e79-e34f-4643-8c4e-4f0c7968a74d"  # production
SRC_BUCKET = "robopartpicker-preview-files"
DST_BUCKET = "robopartpicker-files"
R2_ONLY = "--r2-only" in sys.argv
D1_ONLY = "--d1-only" in sys.argv

API = f"https://api.cloudflare.com/client/v4/accounts/{ACCT}/d1/database/"

# dependency order
TABLES = [
    "manufacturers",
    "suppliers",
    "supplier_regions",
    "supplier_metrics",
    "supplier_capabilities",
    "supplier_interfaces",
    "components",
    "component_revisions",
    "component_specs",
    "component_tags",
    "component_compatibility_tags",
    "supplier_offers",
    "offer_price_history",
    "files",
]

def d1(db, sql, params=None):
    body = json.dumps({"sql": sql, "params": params or []}).encode()
    req = urllib.request.Request(API + db + "/query", data=body,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    last = None
    for _ in range(8):
        try:
            d = json.load(urllib.request.urlopen(req, timeout=120)); break
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (429, 500, 502, 503, 504, 530):
                time.sleep(3); continue
            raise RuntimeError(f"HTTP {e.code}: {e.read().decode()[:300]}") from e
        except Exception:
            last = None; time.sleep(2)
    else:
        raise RuntimeError("d1 retries exhausted")
    if not d.get("success"):
        raise RuntimeError(json.dumps(d.get("errors"))[:500])
    return d["result"]

def cols(db, table):
    r = d1(db, f"PRAGMA table_info({table})")
    return [row["name"] for row in r[0]["results"]]

def export_rows(db, table):
    c = cols(db, table)
    rows = []
    offset = 0
    while True:
        r = d1(db, f"SELECT * FROM {table} LIMIT 1000 OFFSET {offset}")
        batch = r[0]["results"]
        rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return c, rows

def sqlv(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"

def migrate_table(table):
    src_cols = cols(SRC_DB, table)
    dst_cols = cols(DST_DB, table)
    # Only copy columns present in both, so preview's extra (drifted) columns
    # are skipped and production's new defaulted columns fall back to defaults.
    common = [c for c in src_cols if c in dst_cols]
    skipped = [c for c in src_cols if c not in dst_cols]
    if skipped:
        print(f"{table}: skipping preview-only columns {skipped}")
    colsel = ", ".join(common)
    rows = []
    offset = 0
    while True:
        r = d1(SRC_DB, f"SELECT {colsel} FROM {table} LIMIT 1000 OFFSET {offset}")
        batch = r[0]["results"]
        rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    print(f"{table}: {len(rows)} rows, {len(common)} cols")
    # NULL out references to preview-only users/orgs that don't exist in production
    KNOWN = {"system", "robotics-catalog-import", "org_public_ingest"}
    for row in rows:
        for col in ("created_by_user_id", "owner_user_id", "created_by", "organization_id"):
            if col in common and row.get(col) and row[col] not in KNOWN:
                row[col] = None
    stmts = []
    for row in rows:
        vals = ", ".join(sqlv(row.get(col)) for col in common)
        stmts.append(f"INSERT OR IGNORE INTO {table} ({colsel}) VALUES ({vals});")
    # execute in ~150KB batches
    buf = []
    buf_len = 0
    done = 0
    for s in stmts:
        buf.append(s)
        buf_len += len(s)
        if buf_len >= 150_000:
            d1(DST_DB, "\n".join(buf))
            done += len(buf)
            buf = []; buf_len = 0
    if buf:
        d1(DST_DB, "\n".join(buf))
        done += len(buf)
    print(f"  inserted {done}")

def prepare():
    stmts = [
        """INSERT OR IGNORE INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
           VALUES ('robotics-catalog-import', 'Open Source Robotics Catalog', 'robotics-catalog@robopartpicker.local', 0, '2026-08-13', '2026-08-13');""",
        """INSERT OR IGNORE INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
           VALUES ('system', 'System', 'system@robopartpicker.local', 1, '2026-08-09', '2026-08-09');""",
        """INSERT OR IGNORE INTO organizations (id, slug, name, description, avatar_url, created_by_user_id, version, created_at, updated_at, deleted_at)
           VALUES ('org_public_ingest', 'public-ingest', 'Public Ingest', 'Synthetic owner for public imported catalog files', NULL, NULL, 1, '2026-08-09T03:27:38.011Z', '2026-08-09T03:27:38.011Z', NULL);""",
    ]
    for s in stmts:
        d1(DST_DB, s)
    print("sentinel rows prepared")

def main():
    if not R2_ONLY:
        prepare()
        for t in TABLES:
            migrate_table(t)
        print("D1 catalog migration done")
    if D1_ONLY:
        return

    # R2 objects referenced by files.object_key
    import boto3
    s3 = boto3.client("s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name=os.environ.get("R2_REGION", "auto"),
        config=boto3.session.Config(signature_version="s3v4"))
    keys = []
    offset = 0
    while True:
        r = d1(SRC_DB, f"SELECT DISTINCT object_key AS k FROM files WHERE object_key IS NOT NULL LIMIT 1000 OFFSET {offset}")
        batch = [row["k"] for row in r[0]["results"] if row["k"]]
        keys.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    print(f"copying {len(keys)} R2 objects preview -> production")
    def head(key):
        try:
            s3.head_object(Bucket=DST_BUCKET, Key=key); return True
        except Exception:
            return False
    copied = [0]; failed = [0]
    def copy(key):
        try:
            if head(key):
                return
            s3.copy_object(Bucket=DST_BUCKET, Key=key,
                CopySource={"Bucket": SRC_BUCKET, "Key": key})
            copied[0] += 1
        except Exception as e:
            failed[0] += 1
            if failed[0] <= 10:
                print(f"  copy fail {key}: {e}")
    with ThreadPoolExecutor(max_workers=10) as ex:
        list(ex.map(copy, keys))
    print(f"R2 copy done: {copied[0]} copied, {failed[0]} failed, {len(keys)} total")

if __name__ == "__main__":
    main()
