#!/usr/bin/env python3
"""Scrape Waveshare's robotics-relevant product categories (servos, motors,
sensors, robots, robot arms) and import into the D1 supplier catalog.

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
BASE = "https://www.waveshare.com"
SUPPLIER = {"id": "sup-waveshare", "slug": "waveshare", "name": "Waveshare", "website": BASE}

CATEGORY_URLS = [
    "/product/accessories/motors-servos/servos.htm",
    "/product/accessories/motors-servos/motors.htm",
    "/product/accessories/motors-servos.htm",
    "/product/modules/motors-servos/drivers.htm",
    "/product/modules/motors-servos/motors-servos.htm",
    "/product/modules/sensors.htm",
    "/product/ai/robots.htm",
    "/product/ai/robots/robot-arm-control.htm",
    "/product/ai/robots/mobile-robots.htm",
    "/product/mcu-tools/robots.htm",
    "/product/mcu-tools/robots/robot-arm.htm",
    "/product/esp32-related/robots.htm",
]

CATEGORY_KEYWORDS = [
    ("servo", "actuator"), ("motor", "actuator"), ("actuator", "actuator"), ("driver", "driver"),
    ("sensor", "sensor"), ("imu", "sensor"), ("lidar", "sensor"), ("tof", "sensor"), ("camera", "sensor"),
    ("robot arm", "manipulator"), ("robotic arm", "manipulator"), ("gripper", "hand"),
    ("robot", "mobile"), ("display", "compute"), ("screen", "compute"), ("board", "compute"),
    ("raspberry", "compute"), ("esp32", "compute"), ("stm32", "compute"), ("jetson", "compute"),
    ("relay", "electronics"), ("power", "power"), ("battery", "power"), ("wheel", "mechanical"),
    ("chassis", "mechanical"), ("gear", "mechanical"),
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

def scrape_listing(path):
    try:
        html = fetch(BASE + path)
    except Exception:
        return []
    products = []
    for m in re.finditer(r'<a\s+href="(https://www\.waveshare\.com/product/[^"]+\.htm)"\s+title="([^"]{4,})"', html):
        url, name = m.group(1), m.group(2).strip()
        # Skip category pages (short, no SKU-like leaf)
        leaf = url.rstrip("/").split("/")[-1]
        if leaf in ("motors-servos.htm", "servos.htm", "motors.htm", "robots.htm", "sensors.htm", "drivers.htm", "robot-arm.htm", "mobile-robots.htm", "motors-servos.htm", "robot-arm-control.htm", "product.htm"):
            continue
        products.append({"name": name, "url": url})
    # dedupe
    seen = set(); out = []
    for p in products:
        if p["url"] in seen:
            continue
        seen.add(p["url"]); out.append(p)
    return out

def fetch_price(p):
    try:
        html = fetch(p["url"])
        m = re.search(r'"price"\s*:\s*([0-9]+(?:\.[0-9]{1,2})?)', html)
        if m:
            p["price"] = float(m.group(1))
        else:
            m = re.search(r'class="price"[^>]*>\$?([0-9]+(?:\.[0-9]{1,2})?)', html)
            p["price"] = float(m.group(1)) if m else None
    except Exception:
        p["price"] = None
    return p

def main():
    print(f"scraping {len(CATEGORY_URLS)} Waveshare categories", flush=True)
    all_products = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        for prods in pool.map(scrape_listing, CATEGORY_URLS):
            for p in prods:
                all_products[p["url"]] = p
    products = list(all_products.values())
    print(f"found {len(products)} products; fetching prices", flush=True)
    with ThreadPoolExecutor(max_workers=10) as pool:
        products = list(pool.map(fetch_price, products))
    priced = [p for p in products if p.get("price") is not None]
    print(f"priced {len(priced)}/{len(products)}", flush=True)

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    statements = [
        f"INSERT OR IGNORE INTO suppliers (id, slug, name, website_url, status, freshness_at, is_demo, created_at, updated_at) VALUES ({q(SUPPLIER['id'])}, {q(SUPPLIER['slug'])}, {q(SUPPLIER['name'])}, {q(SUPPLIER['website'])}, 'active', {q(now)}, 0, {q(now)}, {q(now)});"
    ]
    for p in products:
        leaf = p["url"].rstrip("/").split("/")[-1].replace(".htm", "")
        name = p["name"][:500]
        cat = categorize(name)
        comp_id = stable("cmp", f"waveshare:{leaf}")
        slug = f"ws-{leaf[:60]}"
        statements.append(f"INSERT OR IGNORE INTO components (id, slug, manufacturer_id, manufacturer_part_number, name, category, summary, lifecycle_status, source_url, provenance_label, freshness_at, is_demo, version, created_at, updated_at) VALUES ({q(comp_id)}, {q(slug)}, NULL, NULL, {q(name)}, {q(cat)}, NULL, 'active', {q(p['url'])}, 'vendor', {q(now)}, 0, 1, {q(now)}, {q(now)});")
        if p.get("price") is not None:
            offer_id = stable("off", f"waveshare:{leaf}:usd")
            statements.append(f"INSERT OR IGNORE INTO supplier_offers (id, supplier_id, component_id, supplier_sku, product_url, region_code, currency, unit_price_minor, minimum_quantity, availability, observed_at, is_demo, created_at, updated_at) VALUES ({q(offer_id)}, {q(SUPPLIER['id'])}, {q(comp_id)}, NULL, {q(p['url'])}, 'US', 'USD', {int(round(p['price']*100))}, 1, 'unknown', {q(now)}, 0, {q(now)}, {q(now)});")

    print(f"prepared {len(statements)} statements", flush=True)
    if DRY:
        open("/tmp/waveshare-import.sql", "w").write("\n".join(statements))
        print("DRY RUN: wrote /tmp/waveshare-import.sql. Add --apply to execute.")
        return
    for i in range(0, len(statements), 40):
        d1("\n".join(statements[i:i+40]))
        print(f"applied {min(i+40, len(statements))}/{len(statements)}", flush=True)
    print("DONE", flush=True)

if __name__ == "__main__":
    main()
