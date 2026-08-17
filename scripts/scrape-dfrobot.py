#!/usr/bin/env python3
"""Scrape DFRobot's public product catalog and import into the D1 supplier
catalog (suppliers + components + supplier_offers). Idempotent via
INSERT OR IGNORE / deterministic ids.

Dry-run by default (pass --apply). Env via --env preview|production.
"""
import json, os, sys, time, re, hashlib, subprocess, urllib.request, urllib.error, urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

DB = "10c57e79-e34f-4643-8c4e-4f0c7968a74d"
DB_PREVIEW = "af9e3aaa-4e74-4083-8317-a642bf0e07a6"
ENV = "preview" if "--env" in sys.argv and sys.argv[sys.argv.index("--env") + 1] == "preview" else "production"
if ENV == "preview":
    DB = DB_PREVIEW
API = f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CF_ACCOUNT_ID']}/d1/database/{DB}/query"
DRY = "--apply" not in sys.argv
BASE = "https://www.dfrobot.com"
SUPPLIER = {"id": "sup-dfrobot", "slug": "dfrobot", "name": "DFRobot", "website": BASE}

# category-43 confirmed; add a broad sweep of robotics-relevant category ids.
CATEGORY_IDS = [43, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100,
                105, 108, 115, 132, 156, 158, 160, 184, 185, 186, 188, 199, 200,
                201, 202, 203, 204, 205, 206, 213, 215, 219, 223, 227, 229, 230,
                232, 257, 259, 261, 268, 269, 270, 271, 294, 301, 303, 305, 311, 312]

CATEGORY_KEYWORDS = [
    ("servo", "actuator"), ("motor", "actuator"), ("actuator", "actuator"), ("stepper", "actuator"),
    ("gripper", "hand"), ("hand", "hand"), ("robot arm", "manipulator"), ("robotic arm", "manipulator"),
    ("sensor", "sensor"), ("distance", "sensor"), ("imu", "sensor"), ("lidar", "sensor"), ("tof", "sensor"),
    ("camera", "sensor"), ("vision", "sensor"), ("proximity", "sensor"), ("temperature", "sensor"),
    ("humidity", "sensor"), ("pressure", "sensor"), ("gas", "sensor"), ("gesture", "sensor"),
    ("driver", "driver"), ("controller", "compute"), ("board", "compute"), ("raspberry", "compute"),
    ("arduino", "compute"), ("esp32", "compute"), ("stm32", "compute"), ("micro:bit", "compute"),
    ("jetson", "compute"), ("display", "compute"), ("screen", "compute"), ("lcd", "compute"),
    ("oled", "compute"), ("battery", "power"), ("power", "power"), ("charger", "power"), ("regulator", "power"),
    ("relay", "electronics"), ("switch", "electronics"), ("cable", "electronics"), ("connector", "electronics"),
    ("wheel", "mechanical"), ("chassis", "mechanical"), ("bracket", "mechanical"), ("gear", "mechanical"),
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

def categorize(name):
    low = name.lower()
    for kw, cat in CATEGORY_KEYWORDS:
        if kw in low:
            return cat
    return "electronics"

def scrape_category(cat_id):
    url = f"{BASE}/category-{cat_id}.html"
    try:
        html = fetch(url)
    except Exception:
        return []
    products = []
    # Each product tile links to /product-NNNN.html and has a class="name"> title and a $price.
    blocks = re.split(r'<li[^>]*class="[^"]*item[^"]*"', html)
    if len(blocks) <= 1:
        blocks = re.split(r'class="prod-item|class="product', html)
    for block in blocks[1:]:
        m_url = re.search(r'href="(/product-\d+\.html)"', block)
        m_name = re.search(r'class="name">\s*([^<]+)', block)
        if not m_url or not m_name:
            continue
        name = m_name.group(1).strip()
        if not name:
            continue
        products.append({"name": name, "url": BASE + m_url.group(1), "price": None, "cat_id": cat_id})
    return products

def fetch_price(p):
    try:
        html = fetch(p["url"])
        m = re.search(r'"price"\s*:\s*([0-9]+(?:\.[0-9]{1,2})?)', html)
        p["price"] = float(m.group(1)) if m else None
    except Exception:
        p["price"] = None
    return p

def main():
    print(f"scraping {len(CATEGORY_IDS)} DFRobot categories", flush=True)
    all_products = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(scrape_category, c): c for c in CATEGORY_IDS}
        for f in as_completed(futures):
            prods = f.result()
            for p in prods:
                all_products[p["url"]] = p
    print(f"scraped {len(all_products)} unique products; fetching prices", flush=True)
    products = list(all_products.values())
    with ThreadPoolExecutor(max_workers=10) as pool:
        products = list(pool.map(fetch_price, products))
    priced = [p for p in products if p.get("price") is not None]
    print(f"priced {len(priced)}/{len(products)}", flush=True)

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    statements = [
        f"INSERT OR IGNORE INTO suppliers (id, slug, name, website_url, status, freshness_at, is_demo, created_at, updated_at) VALUES ({q(SUPPLIER['id'])}, {q(SUPPLIER['slug'])}, {q(SUPPLIER['name'])}, {q(SUPPLIER['website'])}, 'active', {q(now)}, 0, {q(now)}, {q(now)});"
    ]
    count = 0
    for p in products:
        url = p["url"]
        sku = re.search(r"product-(\d+)\.html", url).group(1)
        name = p["name"][:500]
        cat = categorize(name)
        slug = f"dfr-{sku}"
        comp_id = stable("cmp", f"dfrobot:{sku}")
        statements.append(f"INSERT OR IGNORE INTO components (id, slug, manufacturer_id, manufacturer_part_number, name, category, summary, lifecycle_status, source_url, provenance_label, freshness_at, is_demo, version, created_at, updated_at) VALUES ({q(comp_id)}, {q(slug)}, NULL, {q('DFR' + sku)}, {q(name)}, {q(cat)}, NULL, 'active', {q(url)}, 'vendor', {q(now)}, 0, 1, {q(now)}, {q(now)});")
        if p["price"] is not None:
            offer_id = stable("off", f"dfrobot:{sku}:usd")
            statements.append(f"INSERT OR IGNORE INTO supplier_offers (id, supplier_id, component_id, supplier_sku, product_url, region_code, currency, unit_price_minor, minimum_quantity, availability, observed_at, is_demo, created_at, updated_at) VALUES ({q(offer_id)}, {q(SUPPLIER['id'])}, {q(comp_id)}, {q('DFR' + sku)}, {q(url)}, 'US', 'USD', {int(round(p['price']*100))}, 1, 'unknown', {q(now)}, 0, {q(now)}, {q(now)});")
        count += 1

    print(f"prepared {count} component inserts (+ offers)", flush=True)
    if DRY:
        open("/tmp/dfrobot-import.sql", "w").write("\n".join(statements))
        print("DRY RUN: wrote /tmp/dfrobot-import.sql. Add --apply to execute.")
        return
    for i in range(0, len(statements), 40):
        d1("\n".join(statements[i:i+40]))
        print(f"applied {min(i+40, len(statements))}/{len(statements)}", flush=True)
    print("DONE", flush=True)

if __name__ == "__main__":
    main()
