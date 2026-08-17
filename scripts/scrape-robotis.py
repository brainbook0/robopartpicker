#!/usr/bin/env python3
"""Scrape ROBOTIS Dynamixel servo catalog and import into the D1 supplier
catalog (reusing the existing robotis-us supplier row). Dynamixel servos are
the core actuators used in open-source humanoids.

Dry-run by default (pass --apply). Env via --env preview|production.
"""
import json, os, sys, time, re, hashlib, subprocess, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

DB = "10c57e79-e34f-4643-8c4e-4f0c7968a74d"
DB_PREVIEW = "af9e3aaa-4e74-4083-8317-a642bf0e07a6"
ENV = "preview" if "--env" in sys.argv and sys.argv[sys.argv.index("--env") + 1] == "preview" else "production"
if ENV == "preview":
    DB = DB_PREVIEW
API = f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CF_ACCOUNT_ID']}/d1/database/{DB}/query"
DRY = "--apply" not in sys.argv
BASE = "https://www.robotis.us"
SUPPLIER = {"id": "robotis-store/robotis-us", "slug": "robotis-us", "name": "ROBOTIS US", "website": BASE}

SERIES_PATHS = [
    "/dynamixel/",
    "/dynamixel-x/",
    "/dynamixel-y/",
    "/dynamixel-p/",
    "/dynamixel-q/",
    "/dynamixel-pulse/",
    "/dynamixel-system/",
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
    return urllib.request.urlopen(req, timeout=40).read().decode("utf-8", "replace")

def q(v):
    return "'" + str(v).replace("'", "''") + "'"

def stable(prefix, seed):
    return f"{prefix}-{hashlib.sha256(seed.encode()).hexdigest()[:24]}"

def scrape_listing(path):
    try:
        html = fetch(BASE + path)
    except Exception:
        return []
    products = {}
    series_slugs = {"dynamixel", "dynamixel-x", "dynamixel-y", "dynamixel-p", "dynamixel-q", "dynamixel-pulse", "dynamixel-system"}
    for m in re.finditer(r'href="(https://www\.robotis\.us/dynamixel-[a-z0-9-]+/)"', html):
        url = m.group(1)
        slug = url.rstrip("/").split("/")[-1]
        if slug in series_slugs:
            continue
        products[url] = {"url": url}
    return list(products.values())

def fetch_product(p):
    try:
        html = fetch(p["url"])
        m = re.search(r'<title>\s*DYNAMIXEL\s+([A-Z0-9][A-Z0-9-]+)', html)
        if m:
            p["name"] = "DYNAMIXEL " + m.group(1)
        m = re.search(r'"price"\s*:\s*"([0-9]+(?:\.[0-9]{1,2})?)"', html)
        if not m:
            m = re.search(r'"price"\s*content="([0-9]+(?:\.[0-9]{1,2})?)"', html)
        if m:
            p["price"] = float(m.group(1))
    except Exception:
        pass
    return p

def main():
    print(f"scraping {len(SERIES_PATHS)} Dynamixel series", flush=True)
    all_products = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        for prods in pool.map(scrape_listing, SERIES_PATHS):
            for p in prods:
                all_products[p["url"]] = p
    products = list(all_products.values())
    print(f"found {len(products)} products; fetching detail", flush=True)
    with ThreadPoolExecutor(max_workers=10) as pool:
        products = list(pool.map(fetch_product, products))
    priced = [p for p in products if p.get("price") is not None]
    print(f"priced {len(priced)}/{len(products)}", flush=True)

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    statements = [
        f"INSERT OR IGNORE INTO suppliers (id, slug, name, website_url, status, freshness_at, is_demo, created_at, updated_at) VALUES ({q(SUPPLIER['id'])}, {q(SUPPLIER['slug'])}, {q(SUPPLIER['name'])}, {q(SUPPLIER['website'])}, 'active', {q(now)}, 0, {q(now)}, {q(now)});"
    ]
    for p in products:
        slug = p["url"].rstrip("/").split("/")[-1]
        model = slug.replace("dynamixel-", "").replace("-t", "").upper()
        name = p.get("name") or ("DYNAMIXEL " + model)
        comp_id = stable("cmp", f"robotis:{model}")
        cslug = f"dynamixel-{model.lower()}"
        statements.append(f"INSERT OR IGNORE INTO components (id, slug, manufacturer_id, manufacturer_part_number, name, category, summary, lifecycle_status, source_url, provenance_label, freshness_at, is_demo, version, created_at, updated_at) VALUES ({q(comp_id)}, {q(cslug)}, NULL, {q(model)}, {q(name)}, 'actuator', NULL, 'active', {q(p['url'])}, 'vendor', {q(now)}, 0, 1, {q(now)}, {q(now)});")
        if p.get("price") is not None:
            offer_id = stable("off", f"robotis:{model}:usd")
            statements.append(f"INSERT OR IGNORE INTO supplier_offers (id, supplier_id, component_id, supplier_sku, product_url, region_code, currency, unit_price_minor, minimum_quantity, availability, observed_at, is_demo, created_at, updated_at) VALUES ({q(offer_id)}, {q(SUPPLIER['id'])}, {q(comp_id)}, {q(model)}, {q(p['url'])}, 'US', 'USD', {int(round(p['price']*100))}, 1, 'unknown', {q(now)}, 0, {q(now)}, {q(now)});")

    print(f"prepared {len(statements)} statements", flush=True)
    if DRY:
        open("/tmp/robotis-import.sql", "w").write("\n".join(statements))
        print("DRY RUN: wrote /tmp/robotis-import.sql. Add --apply to execute.")
        return
    for i in range(0, len(statements), 40):
        d1("\n".join(statements[i:i+40]))
        print(f"applied {min(i+40, len(statements))}/{len(statements)}", flush=True)
    print("DONE", flush=True)

if __name__ == "__main__":
    main()
