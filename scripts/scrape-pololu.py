#!/usr/bin/env python3
"""Scrape Pololu's robotics product categories and import into the D1 supplier
catalog. Pololu category pages list product names + URLs; each product page
carries JSON-LD structured data (sku, brand, price, description).

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
BASE = "https://www.pololu.com"
SUPPLIER = {"id": "sup-pololu", "slug": "pololu", "name": "Pololu", "website": BASE}

CATEGORY_PATHS = [
    "/category/205/servos",
    "/category/22/motors-and-gearboxes",
    "/category/10/brushed-dc-motor-controllers",
    "/category/120/stepper-motor-drivers",
    "/category/102/maestro-usb-servo-controllers",
    "/category/127/linear-actuators",
    "/category/2/robot-kits",
    "/category/129/zumo-robots-and-accessories",
    "/category/327/collaborative-robots",
    "/category/24/wheels-tracks-and-ball-casters",
    "/category/118/current-sensors",
    "/category/201/encoders",
    "/category/234/wheels",
    "/category/289/motoron-motor-controllers",
    "/category/124/roboclaw-motor-controllers",
]

CATEGORY_KEYWORDS = [
    ("servo", "actuator"), ("motor", "actuator"), ("actuator", "actuator"), ("linear actuator", "actuator"),
    ("gearbox", "actuator"), ("gear motor", "actuator"), ("stepper", "actuator"), ("encoder", "sensor"),
    ("sensor", "sensor"), ("distance", "sensor"), ("current sensor", "sensor"),
    ("motor driver", "driver"), ("motor controller", "driver"), ("servo controller", "driver"), ("driver", "driver"),
    ("robot kit", "mobile"), ("robot arm", "manipulator"), ("gripper", "hand"), ("arm", "manipulator"),
    ("wheel", "mechanical"), ("track", "mechanical"), ("chassis", "mechanical"), ("ball caster", "mechanical"),
    ("cobot", "manipulator"), ("collaborative", "manipulator"),
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
    for m in re.finditer(r'<a\s+href="(/product/\d+)"[^>]*>\s*([^<]{3,120})', html):
        url, name = BASE + m.group(1), m.group(2).strip()
        products.append({"name": name, "url": url})
    seen = set(); out = []
    for p in products:
        if p["url"] in seen:
            continue
        seen.add(p["url"]); out.append(p)
    return out

def fetch_product(p):
    try:
        html = fetch(p["url"])
        blocks = re.findall(r"<script[^>]*type=['\"]application/ld\+json['\"][^>]*>(.*?)</script>", html, re.S)
        for block in blocks:
            try:
                data = json.loads(block)
            except Exception:
                continue
            items = data if isinstance(data, list) else [data]
            for it in items:
                if isinstance(it, dict) and it.get("@type") == "Product":
                    p["name"] = (it.get("name") or p["name"])[:500]
                    if it.get("sku"):
                        p["sku"] = str(it["sku"])
                    if it.get("description"):
                        p["summary"] = str(it["description"])[:800]
                    offers = it.get("offers") or {}
                    if isinstance(offers, list):
                        offers = offers[0] if offers else {}
                    price = offers.get("price")
                    if price is not None:
                        try:
                            p["price"] = float(price)
                        except (TypeError, ValueError):
                            pass
                    return p
    except Exception:
        pass
    return p

def main():
    print(f"scraping {len(CATEGORY_PATHS)} Pololu categories", flush=True)
    all_products = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        for prods in pool.map(scrape_listing, CATEGORY_PATHS):
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
        pid = re.search(r"/product/(\d+)", p["url"]).group(1)
        sku = p.get("sku") or pid
        name = p["name"][:500]
        cat = categorize(name)
        comp_id = stable("cmp", f"pololu:{pid}")
        slug = f"pol-{pid}"
        summary = p.get("summary")
        statements.append(f"INSERT OR IGNORE INTO components (id, slug, manufacturer_id, manufacturer_part_number, name, category, summary, lifecycle_status, source_url, provenance_label, freshness_at, is_demo, version, created_at, updated_at) VALUES ({q(comp_id)}, {q(slug)}, NULL, {q(sku)}, {q(name)}, {q(cat)}, {'NULL' if summary is None else q(summary)}, 'active', {q(p['url'])}, 'vendor', {q(now)}, 0, 1, {q(now)}, {q(now)});")
        if p.get("price") is not None:
            offer_id = stable("off", f"pololu:{pid}:usd")
            statements.append(f"INSERT OR IGNORE INTO supplier_offers (id, supplier_id, component_id, supplier_sku, product_url, region_code, currency, unit_price_minor, minimum_quantity, availability, observed_at, is_demo, created_at, updated_at) VALUES ({q(offer_id)}, {q(SUPPLIER['id'])}, {q(comp_id)}, {q(sku)}, {q(p['url'])}, 'US', 'USD', {int(round(p['price']*100))}, 1, 'unknown', {q(now)}, 0, {q(now)}, {q(now)});")

    print(f"prepared {len(statements)} statements", flush=True)
    if DRY:
        open("/tmp/pololu-import.sql", "w").write("\n".join(statements))
        print("DRY RUN: wrote /tmp/pololu-import.sql. Add --apply to execute.")
        return
    for i in range(0, len(statements), 40):
        d1("\n".join(statements[i:i+40]))
        print(f"applied {min(i+40, len(statements))}/{len(statements)}", flush=True)
    print("DONE", flush=True)

if __name__ == "__main__":
    main()
