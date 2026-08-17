#!/usr/bin/env python3
"""Scrape Feetech servo catalog (names, SKUs, URLs) and import as actuator
components. Feetech is B2B and does not publish unit prices, so components are
imported unpriced; prices can be backfilled later.

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
BASE = "https://www.feetechrc.com"
SUPPLIER = {"id": "sup-feetech", "slug": "feetech", "name": "Feetech", "website": BASE}

CATEGORY_PATHS = [
    "/analog-servo",
    "/360-degree-steering-gear",
    "/24-v-steering-gear",
    "/24v-120kg-rs485-serial-bus-steering-gear",
    "/24v-45kg-rs485-serial-bus-steering-gear",
    "/12v-40kg-rs485-serial-bus-steering-gear",
    "/continuous-rudder-machine",
    "/brushless-actuator-series",
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

def name_from_slug(slug):
    name = slug.replace("-", " ").strip()
    name = re.sub(r"\b(\d+)v\b", lambda m: m.group(1).upper() + "V", name)
    name = re.sub(r"\b(\d+)kg\b", lambda m: m.group(1) + "kg", name)
    return name[:200]

def scrape_listing(path):
    try:
        html = fetch(BASE + path)
    except Exception:
        return []
    products = {}
    skip = {"about", "advantages", "contact", "products", "product-customization-and-oem-service",
            "after-sales-service-and-policy", "company-introduction", "contact-service",
            "advantages-of-fete-pwm-actuator", "data-download-51979"}
    for m in re.finditer(r'href="https://www\.feetechrc\.com/([a-z0-9-]+)"', html):
        slug = m.group(1)
        if slug in skip or slug.isdigit() or len(slug) < 5:
            continue
        products[slug] = {"url": BASE + "/" + slug, "name": name_from_slug(slug), "slug": slug}
    return list(products.values())

def fetch_detail(p):
    try:
        html = fetch(p["url"])
        m = re.search(r'<title>([^<]+)', html)
        if m:
            title = m.group(1).split("-")[0].strip()
            if title:
                p["name"] = title[:200]
        m = re.search(r'\b(FT[0-9]{2,}[A-Z0-9]*|SCS[0-9]+|STS[0-9]+|SM[0-9]+[A-Z]*)\b', html, re.I)
        if m:
            p["sku"] = m.group(1).upper()
    except Exception:
        pass
    return p

def main():
    print(f"scraping {len(CATEGORY_PATHS)} Feetech categories", flush=True)
    all_products = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        for prods in pool.map(scrape_listing, CATEGORY_PATHS):
            for p in prods:
                all_products[p["slug"]] = p
    products = list(all_products.values())
    print(f"found {len(products)} products; fetching detail", flush=True)
    with ThreadPoolExecutor(max_workers=8) as pool:
        products = list(pool.map(fetch_detail, products))

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    statements = [
        f"INSERT OR IGNORE INTO suppliers (id, slug, name, website_url, status, freshness_at, is_demo, created_at, updated_at) VALUES ({q(SUPPLIER['id'])}, {q(SUPPLIER['slug'])}, {q(SUPPLIER['name'])}, {q(SUPPLIER['website'])}, 'active', {q(now)}, 0, {q(now)}, {q(now)});"
    ]
    for p in products:
        comp_id = stable("cmp", f"feetech:{p['slug']}")
        sku = p.get("sku")
        statements.append(f"INSERT OR IGNORE INTO components (id, slug, manufacturer_id, manufacturer_part_number, name, category, summary, lifecycle_status, source_url, provenance_label, freshness_at, is_demo, version, created_at, updated_at) VALUES ({q(comp_id)}, {q('ft-'+p['slug'][:60])}, NULL, {'NULL' if sku is None else q(sku)}, {q(p['name'][:500])}, 'actuator', NULL, 'active', {q(p['url'])}, 'vendor', {q(now)}, 0, 1, {q(now)}, {q(now)});")

    print(f"prepared {len(statements)} statements", flush=True)
    if DRY:
        open("/tmp/feetech-import.sql", "w").write("\n".join(statements))
        print("DRY RUN: wrote /tmp/feetech-import.sql. Add --apply to execute.")
        return
    for i in range(0, len(statements), 40):
        d1("\n".join(statements[i:i+40]))
        print(f"applied {min(i+40, len(statements))}/{len(statements)}", flush=True)
    print("DONE", flush=True)

if __name__ == "__main__":
    main()
