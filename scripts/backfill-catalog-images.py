#!/usr/bin/env python3
"""Backfill catalog images into the production R2 bucket and rewrite files.object_key.

Reads product_sorted.json (external object_key -> source_url), downloads each
source image, stores it content-addressed as catalog/<sha1>.<ext> in
robopartpicker-files, then updates files.object_key in production D1.

Resumable: a state file records completed keys. Run repeatedly until finished.
"""
import json, os, sys, time, hashlib, re, urllib.request, urllib.error
from urllib.parse import urlparse, urlunparse
from concurrent.futures import ThreadPoolExecutor
import boto3

ACCT = os.environ["CF_ACCOUNT_ID"]
TOKEN = os.environ["CF_API_TOKEN"]
DB = "10c57e79-e34f-4643-8c4e-4f0c7968a74d"  # production
BUCKET = "robopartpicker-files"
API = f"https://api.cloudflare.com/client/v4/accounts/{ACCT}/d1/database/{DB}/query"
STATE = "/root/.cloudflare/backfill_state.json"
UA = "Mozilla/5.0 (compatible; RoboPartPicker-Curation/1.0)"
LIMIT = int(sys.argv[1]) if len(sys.argv) > 1 else 0  # 0 = all

s3 = boto3.client("s3", endpoint_url=os.environ["R2_ENDPOINT"],
    aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
    region_name=os.environ.get("R2_REGION", "auto"),
    config=boto3.session.Config(signature_version="s3v4"))

def d1(sql, params=None):
    body = json.dumps({"sql": sql, "params": params or []}).encode()
    req = urllib.request.Request(API, data=body, headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    for _ in range(8):
        try:
            d = json.load(urllib.request.urlopen(req, timeout=120)); break
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504, 530):
                time.sleep(3); continue
            raise RuntimeError(f"HTTP {e.code}: {e.read().decode()[:300]}") from e
        except Exception:
            time.sleep(2)
    else:
        raise RuntimeError("d1 retries exhausted")
    if not d.get("success"):
        raise RuntimeError(json.dumps(d.get("errors"))[:400])
    return d["result"][0]

def head(key):
    try:
        s3.head_object(Bucket=BUCKET, Key=key); return True
    except Exception:
        return False

def norm_url(u):
    u = (u or "").replace("&amp;", "&").strip()
    if not u.startswith("http"): return None
    p = urlparse(u)
    return urlunparse((p.scheme, p.netloc, re.sub(r"/{2,}", "/", p.path or ""), p.params, p.query, p.fragment))

ADAFRUIT_SIZES = ["970x728", "1024x768", "1024x600", "800x800", "600x450"]

def candidate_urls(url):
    base = norm_url(url)
    urls = [base]
    if base and "cdn-shop.adafruit.com" in base:
        m = re.search(r"/(\d+x\d+|\d+w\d+)/", base)
        if m:
            for s in ADAFRUIT_SIZES:
                if s != m.group(1):
                    urls.append(base.replace("/" + m.group(1) + "/", "/" + s + "/"))
    return [u for u in urls if u]

def fetch(url, timeout=40):
    for u in candidate_urls(url):
        for att in range(2):
            try:
                req = urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "image/*"})
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    data = r.read()
                    if r.status != 200 or len(data) < 100:
                        break
                    return data
            except urllib.error.HTTPError:
                break
            except Exception:
                time.sleep(0.5)
    return None

def pick_ext(media, url, name):
    blob = (url or "") + " " + (name or "")
    for e in ("jpeg", "jpg", "png", "webp", "gif", "svg"):
        if "." + e in blob.lower(): return e
    if "webp" in (media or "").lower(): return "webp"
    if "png" in (media or "").lower(): return "png"
    if "jpeg" in (media or "").lower() or "jpg" in (media or "").lower(): return "jpg"
    return "img"

def sha1(b): return hashlib.sha1(b).hexdigest()

def process(item):
    old = item["object_key"]
    try:
        data = fetch(item.get("source_url", ""))
        if not data:
            return (old, "fetch_fail")
        ext = pick_ext(item.get("media_type", ""), item.get("source_url", ""), item.get("original_name", ""))
        h = sha1(data)
        new = f"catalog/{h}.{ext}"
        if not head(new):
            s3.put_object(Bucket=BUCKET, Key=new, Body=data, ContentType=item.get("media_type") or "application/octet-stream")
        d1("UPDATE files SET object_key=?1, updated_at=datetime('now') WHERE object_key=?2", [new, old])
        return (old, "ok")
    except Exception as e:
        return (old, f"err:{str(e)[:80]}")

def main():
    items = json.load(open("/root/.cloudflare/product_sorted.json"))
    if LIMIT:
        items = items[:LIMIT]
    done = set()
    if os.path.exists(STATE):
        done = set(json.load(open(STATE)))
    todo = [it for it in items if it["object_key"] not in done]
    print(f"total={len(items)} done={len(done)} todo={len(todo)}")
    results = []
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=6) as ex:
        for i, r in enumerate(ex.map(process, todo)):
            results.append(r)
            if (i + 1) % 200 == 0:
                ok = sum(1 for _, s in results if s == "ok")
                done.update(k for k, s in results if s == "ok")
                json.dump(sorted(done), open(STATE, "w"))
                print(f"progress {i+1}/{len(todo)} ok_total={len(done)} elapsed={round(time.time()-t0)}s", flush=True)
    done.update(k for k, s in results if s == "ok")
    json.dump(sorted(done), open(STATE, "w"))
    from collections import Counter
    print("DONE", dict(Counter(s for _, s in results)))

if __name__ == "__main__":
    main()
