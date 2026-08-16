#!/usr/bin/env python3
"""Parse collected BOM CSV files into project RPPS BOMs with names, MPNs, quantities, and prices.

Handles the common goBILDA / DigiKey CSV shapes plus a generic header mapper.
Dry-run by default (pass --apply). Env via --env preview|production.
"""
import json, os, sys, time, csv, io, re, subprocess, urllib.request, urllib.error

DB = "10c57e79-e34f-4643-8c4e-4f0c7968a74d"
DB_PREVIEW = "af9e3aaa-4e74-4083-8317-a642bf0e07a6"
ENV = "preview" if ("--env" in sys.argv and sys.argv[sys.argv.index("--env") + 1] == "preview") else "production"
if ENV == "preview":
    DB = DB_PREVIEW
API = f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CF_ACCOUNT_ID']}/d1/database/{DB}/query"
DRY = "--apply" not in sys.argv
OWNER = "robotics-catalog-import"

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
    req = urllib.request.Request(url, headers={"User-Agent": "RoboPartPicker/1.0"})
    return urllib.request.urlopen(req, timeout=60).read()

def parse_money(value):
    if value is None:
        return None
    s = str(value).strip().replace("$", "").replace(",", "").replace("£", "").replace("€", "")
    if not s:
        return None
    try:
        return int(round(float(s) * 100))
    except ValueError:
        return None

def parse_qty(value):
    if value is None:
        return 1
    s = str(value).strip()
    try:
        return max(1, int(round(float(s))))
    except ValueError:
        return 1

def col(header, *names):
    hl = [h.strip().lower() for h in header]
    for name in names:
        for i, h in enumerate(hl):
            if h == name.lower() or name.lower() in h:
                return i
    return None

def parse_csv(text):
    text = text.lstrip("\ufeff")
    reader = csv.reader(io.StringIO(text))
    rows = [r for r in reader if any(c.strip() for c in r)]
    if len(rows) < 2:
        return []
    header = rows[0]
    name_i = col(header, "short name", "part", "name", "description", "long name", "item", "value", "component")
    mpn_i = col(header, "part #", "mpn", "manufacturer part", "part number", "mfr part", "digikey part", "ref")
    qty_i = col(header, "# req in assy", "qty", "quantity", "count", "multiplier")
    price_i = col(header, "cost pp", "unit price", "unit cost", "price", "cost", "ext price", "unit")
    url_i = col(header, "link", "url", "source")
    mfr_i = col(header, "manufacturer", "maker", "mfr")
    if name_i is None and mpn_i is None:
        return []
    mult_i = col(header, "assembly multiplier", "multiplier")
    parts = []
    for r in rows[1:]:
        if len(r) <= max(i for i in [name_i, mpn_i, qty_i, price_i, url_i, mfr_i] if i is not None):
            continue
        def cell(i):
            return r[i].strip() if i is not None and i < len(r) else ""
        name = cell(name_i) or cell(mpn_i)
        if not name or name.lower() in ("n/a", "none", "—", "-"):
            continue
        mpn = cell(mpn_i) if mpn_i != name_i else ""
        qty = parse_qty(cell(qty_i))
        if mult_i is not None and mult_i != qty_i:
            qty = qty * parse_qty(cell(mult_i))
        price = parse_money(cell(price_i))
        url = cell(url_i)
        mfr = cell(mfr_i)
        parts.append({"name": name[:500], "mpn": (mpn or None) and mpn[:120] or None, "qty": qty,
                      "unit_cost_usd": None if price is None else round(price / 100, 4),
                      "source_url": url[:500] if url else None, "manufacturer": (mfr or None) and mfr[:120] or None})
    return parts

def main():
    rows = d1("""SELECT p.id, p.slug, pv.id AS version_id, pv.rpps_json, f.id AS file_id
        FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
        JOIN project_files pf ON pf.project_id = p.id JOIN files f ON f.id = pf.file_id
        WHERE p.project_kind='physical_design' AND p.deleted_at IS NULL AND f.kind='bom'
          AND (f.original_name LIKE '%.csv' OR f.original_name LIKE '%.md')
        ORDER BY p.slug""")["results"]

    by_project = {}
    for r in rows:
        by_project.setdefault(r["slug"], {"id": r["id"], "version_id": r["version_id"], "rpps_json": r["rpps_json"], "keys": []})
        by_project[r["slug"]]["keys"].append(r["file_id"])

    print(f"projects with BOM csv: {len(by_project)}", flush=True)
    stmts = []
    total_parts = 0
    for slug, info in by_project.items():
        try:
            rpps = json.loads(info["rpps_json"])
        except Exception:
            continue
        merged = list(rpps.get("bom", []))
        seen = set((b.get("name"), b.get("mpn")) for b in merged)
        added = 0
        for key in info["keys"]:
            # Fetch from R2 via content URL using the file id = object_key.
            cid = urllib.parse.quote(key, safe="")
            content_url = f"https://robopartpicker-production.ludomi2502.workers.dev/api/v1/files/content?id={cid}" if ENV == "production" else f"https://robopartpicker-preview.ludomi2502.workers.dev/api/v1/files/content?id={cid}"
            try:
                text = fetch(content_url).decode("utf-8", "replace")
            except Exception:
                continue
            text = text.replace("\x00", "")
            try:
                parts = parse_csv(text)
            except Exception:
                continue
            for part in parts:
                k = (part["name"], part["mpn"])
                if k in seen:
                    continue
                seen.add(k)
                merged.append(part)
                added += 1
        if added == 0:
            continue
        rpps["bom"] = merged
        stmts.append(f"UPDATE project_versions SET rpps_json = '{json.dumps(rpps).replace(chr(39), chr(39)+chr(39))}' WHERE id = '{info['version_id']}';")
        total_parts += added
        print(f"{slug}: +{added} parts", flush=True)

    print(f"total new parts: {total_parts}, projects updated: {len(stmts)}", flush=True)
    if not stmts or DRY:
        print("DRY RUN ONLY. Add --apply to execute." if stmts else "nothing to write")
        return
    sql = "\n".join(stmts)
    open(f"/tmp/backfill-bom-{ENV}.sql", "w").write(sql)
    subprocess.run(["npx", "wrangler", "d1", "execute", "DB", "--env", ENV, "--remote", "--file", f"/tmp/backfill-bom-{ENV}.sql"], check=True)
    print("APPLIED")

if __name__ == "__main__":
    main()
