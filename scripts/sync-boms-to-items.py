#!/usr/bin/env python3
"""Sync each project's RPPS BOM (rpps.bom) into the structured boms,
bom_versions, and bom_items tables so card/overview line counts and the
sourcing estimate see the same parts as the RPPS package view.

Idempotent: creates a boms + bom_versions row if missing, then replaces the
bom_items for the current version from the RPPS BOM.

Dry-run by default (pass --apply). Env via --env preview|production.
"""
import json, os, sys, time, hashlib, subprocess, urllib.request, urllib.error

DB = "10c57e79-e34f-4643-8c4e-4f0c7968a74d"
DB_PREVIEW = "af9e3aaa-4e74-4083-8317-a642bf0e07a6"
ENV = "preview" if "--env" in sys.argv and sys.argv[sys.argv.index("--env") + 1] == "preview" else "production"
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

def q(v):
    return "'" + str(v).replace("'", "''") + "'"

def short_id(prefix, seed):
    return f"{prefix}-{hashlib.sha256(seed.encode()).hexdigest()[:24]}"

def main():
    rows = d1("""SELECT p.id AS project_id, p.slug, pv.rpps_json
        FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
        WHERE p.project_kind = 'physical_design' AND p.deleted_at IS NULL
          AND json_array_length(json_extract(pv.rpps_json, '$.bom')) > 0
        ORDER BY p.slug""")["results"]
    print(f"projects with RPPS BOM: {len(rows)}", flush=True)

    existing = {r["project_id"]: r for r in d1("SELECT id, project_id, current_version_id FROM boms WHERE project_id IS NOT NULL")["results"]}
    existing_versions = {r["id"]: r for r in d1("SELECT id, bom_id FROM bom_versions")["results"]}

    synced = 0
    items_total = 0
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    for r in rows:
        try:
            rpps = json.loads(r["rpps_json"] or "{}")
        except Exception:
            continue
        bom = rpps.get("bom") or []
        if not bom:
            continue

        bom_row = existing.get(r["project_id"])
        if bom_row:
            bom_id = bom_row["id"]
            bom_version_id = bom_row["current_version_id"]
        else:
            bom_id = short_id("bom", f"project:{r['project_id']}")
            bom_version_id = short_id("bv", f"bom:{bom_id}:0.1.0")
            if not DRY:
                d1(f"INSERT INTO boms (id, project_id, owner_user_id, slug, name, current_version_id, visibility, is_demo, created_at, updated_at) VALUES ({q(bom_id)}, {q(r['project_id'])}, {q(OWNER)}, {q(r['slug'] + '-bom')}, {q(r['slug'] + ' BOM')}, {q(bom_version_id)}, 'public', 0, {q(now)}, {q(now)});")
                d1(f"INSERT INTO bom_versions (id, bom_id, version_label, notes, currency, created_by_user_id, created_at) VALUES ({q(bom_version_id)}, {q(bom_id)}, '0.1.0', 'Synced from the published RPPS package BOM', 'USD', {q(OWNER)}, {q(now)});")
                existing[r["project_id"]] = {"id": bom_id, "current_version_id": bom_version_id}

        # Replace items for this version (idempotent re-sync)
        if not DRY:
            d1(f"DELETE FROM bom_items WHERE bom_version_id = {q(bom_version_id)};")
        statements = []
        for i, item in enumerate(bom):
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            qty = max(1, min(100000, int(item.get("qty") or 1)))
            slot = f"item-{i}"
            description = name[:2000]
            unit = "each"
            price_minor = None
            if item.get("unit_cost_usd") is not None:
                price_minor = int(round(float(item["unit_cost_usd"]) * 100))
            notes = None
            if item.get("fabricated"):
                notes = "fabricated"
            elif item.get("notes"):
                notes = str(item["notes"])[:1000]
            item_id = short_id("bi", f"{bom_version_id}:{slot}")
            statements.append(f"INSERT INTO bom_items (id, bom_version_id, component_id, slot_key, description, quantity, unit, selected_supplier_offer_id, target_unit_price_minor, notes, sort_order) VALUES ({q(item_id)}, {q(bom_version_id)}, NULL, {q(slot)}, {q(description)}, {qty}, {q(unit)}, NULL, {'NULL' if price_minor is None else price_minor}, {'NULL' if notes is None else q(notes)}, {i});")
        if statements and not DRY:
            d1("\n".join(statements))
        synced += 1
        items_total += len(statements)

    print(f"DONE synced {synced} BOMs with {items_total} items (dry-run={DRY})", flush=True)

if __name__ == "__main__":
    main()
