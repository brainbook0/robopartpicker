#!/usr/bin/env python3
"""Scrape Hiwonder's catalog via its Shopify products.json endpoint and import
into the D1 supplier catalog. Paginated; every product has title, handle,
price (first variant), and product type.

Dry-run by default (pass --apply). Env via --env preview|production.
"""
import json, os, sys, time, re, hashlib, subprocess, urllib.request, urllib.error

DB = "10c57e79-e34f-4643-8c4e-4f0c7968a74d"
DB_PREVIEW = "af9e3aaa-4e74-4083-8317-a642bf0e07a6"
ENV = "preview" if "--env" in sys.argv and sys.argv[sys.argv.index("--env") + 1] == "preview" else "production"
if ENV == "preview":
    DB = DB_PREVIEW
API = f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CF_ACCOUNT_ID']}/d1/database/{DB}/query"
DRY = "--apply" not in sys.argv
BASE = "https://www.hiwonder.com"
SUPPLIER = {"id": "sup-hiwonder", "slug": "hiwonder", "name": "Hiwonder", "website": BASE}

CATEGORY_KEYWORDS = [
    ("robotic arm", "manipulator"), ("armpi", "manipulator"), ("nexarm", "manipulator"),
    ("servo", "actuator"), ("motor", "actuator"), ("actuator", "actuator"), ("gripper", "hand"),
    ("claw", "hand"), ("hand", "hand"),
    ("sensor", "sensor"), ("imu", "sensor"), ("lidar", "sensor"), ("camera", "sensor"), ("vision", "sensor"),
    ("driver", "driver"), ("controller", "compute"), ("board", "compute"), ("jetson", "compute"),
    ("raspberry", "compute"), ("esp32", "compute"), ("arduino", "compute"),
    ("robot car", "mobile"), ("rover", "mobile"), ("robot", "mobile"), ("mecanum", "mobile"),
    ("kit", "mobile"), ("chassis", "mechanical"), ("wheel", "mechanical"),
    ("display", "compute"), ("screen", "compute"), ("module", "module"), ("battery", "power"),
]

def load_creds():
    out = subprocess.run(["bash", "-c", "source /root/.cloudflare/credentials && env"],
                         stdout=subprocess.PIPE, check=True).stdout.decode()
    env = {}
    for line in out.splitlines():
        if "=" in line:
            k, _, v = line.partition("=")
            env[k] = v
    return env

CREDS = load_creds()
os.environ.setdefault("CF_ACCOUNT_ID", CREDS["CF_ACCOUNT_ID"])
os.environ.setdefault("CF_API_TOKEN", CREDS["CF_API_TOKEN"])

def d1(sql, params=None):
    body = json.dumps({"sql": sql, "params": params or []}).encode()
    req = urllib.request.Request(API, data=body, headers={"Authorization": f"Bearer {CREDS['CF_API_TOKEN']}", "Content-Type": "application/json"})
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

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"})
    return urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")

def q(v):
    return "'" + str(v).replace("'", "''") + "'"

def stable(prefix, seed):
    return f"{prefix}-{hashlib.sha256(seed.encode()).hexdigest()[:24]}"

def categorize(title, ptype):
    text = f"{title} {ptype or ''}".lower()
    for kw, cat in CATEGORY_KEYWORDS:
        if kw in text:
            return cat
    return "electronics"

def clean_summary(html):
    if not html:
        return None
    s = re.sub(r"<[^>]+>", " ", html)
    s = re.sub(r"\s+", " ", s).strip()
    return s[:800] or None

def main():
    products = []
    page = 1
    while True:
        try:
            data = json.loads(fetch(f"{BASE}/products.json?limit=250&page={page}"))
        except Exception as e:
            print(f"page {page} failed: {e}", flush=True)
            break
        batch = data.get("products", [])
        if not batch:
            break
        products.extend(batch)
        print(f"page {page}: {len(batch)} products", flush=True)
        if len(batch) < 250:
            break
        page += 1

    print(f"total {len(products)} products", flush=True)
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    statements = [
        f"INSERT OR IGNORE INTO suppliers (id, slug, name, website_url, status, freshness_at, is_demo, created_at, updated_at) VALUES ({q(SUPPLIER['id'])}, {q(SUPPLIER['slug'])}, {q(SUPPLIER['name'])}, {q(SUPPLIER['website'])}, 'active', {q(now)}, 0, {q(now)}, {q(now)});"
    ]
    for p in products:
        handle = p.get("handle") or "p"
        title = p.get("title") or handle
        ptype = p.get("product_type")
        variants = p.get("variants") or []
        price = None
        sku = None
        if variants:
            price = variants[0].get("price")
            sku = variants[0].get("sku")
        cat = categorize(title, ptype)
        comp_id = stable("cmp", f"hiwonder:{handle}")
        summary = clean_summary(p.get("body_html"))
        url = f"{BASE}/products/{handle}"
        statements.append(f"INSERT OR IGNORE INTO components (id, slug, manufacturer_id, manufacturer_part_number, name, category, summary, lifecycle_status, source_url, provenance_label, freshness_at, is_demo, version, created_at, updated_at) VALUES ({q(comp_id)}, {q('hw-'+handle[:60])}, NULL, {'NULL' if not sku else q(sku)}, {q(title[:500])}, {q(cat)}, {'NULL' if summary is None else q(summary)}, 'active', {q(url)}, 'vendor', {q(now)}, 0, 1, {q(now)}, {q(now)});")
        if price is not None:
            try:
                price_minor = int(round(float(price) * 100))
                offer_id = stable("off", f"hiwonder:{handle}:usd")
                statements.append(f"INSERT OR IGNORE INTO supplier_offers (id, supplier_id, component_id, supplier_sku, product_url, region_code, currency, unit_price_minor, minimum_quantity, availability, observed_at, is_demo, created_at, updated_at) VALUES ({q(offer_id)}, {q(SUPPLIER['id'])}, {q(comp_id)}, {'NULL' if not sku else q(sku)}, {q(url)}, 'US', 'USD', {price_minor}, 1, 'unknown', {q(now)}, 0, {q(now)}, {q(now)});")
            except (TypeError, ValueError):
                pass

    print(f"prepared {len(statements)} statements", flush=True)
    if DRY:
        open("/tmp/hiwonder-import.sql", "w").write("\n".join(statements))
        print("DRY RUN: wrote /tmp/hiwonder-import.sql. Add --apply to execute.")
        return
    for i in range(0, len(statements), 40):
        d1("\n".join(statements[i:i+40]))
        print(f"applied {min(i+40, len(statements))}/{len(statements)}", flush=True)
    print("DONE", flush=True)

if __name__ == "__main__":
    main()
