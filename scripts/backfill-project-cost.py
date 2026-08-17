#!/usr/bin/env python3
"""Fill estimated_cost_usd for physical-design projects with a category-typical
build-cost estimate. Every estimate is recorded as an evidence claim with
source_type 'inference', so it is never presented as a quoted price.

Dry-run by default (pass --apply). Env via --env preview|production.
"""
import json, os, sys, time, subprocess, urllib.request, urllib.error

DB = "10c57e79-e34f-4643-8c4e-4f0c7968a74d"
DB_PREVIEW = "af9e3aaa-4e74-4083-8317-a642bf0e07a6"
ENV = "preview" if "--env" in sys.argv and sys.argv[sys.argv.index("--env") + 1] == "preview" else "production"
if ENV == "preview":
    DB = DB_PREVIEW
API = f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CF_ACCOUNT_ID']}/d1/database/{DB}/query"
DRY = "--apply" not in sys.argv
NOW = "2026-08-17T07:05:00.000Z"

CATEGORY_COST = {
    "humanoid": 1500, "manipulator": 800, "gripper": 200, "quadruped": 1200,
    "hexapod": 500, "mobile": 600, "aerial": 400, "biped": 300, "exoskeleton": 1000,
    "head": 150, "actuator": 80, "underwater": 900, "other": 500,
}

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

def main():
    rows = d1("""SELECT p.id, p.robot_category, pv.id AS version_id, pv.rpps_json
        FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
        WHERE p.project_kind = 'physical_design' AND p.deleted_at IS NULL""")["results"]

    updated = 0
    for r in rows:
        try:
            rpps = json.loads(r["rpps_json"] or "{}")
        except Exception:
            continue
        if not isinstance(rpps, dict):
            continue
        build = dict(rpps.get("build") or {})
        if build.get("estimated_cost_usd") is not None:
            continue
        category = r["robot_category"] or "other"
        estimate = CATEGORY_COST.get(category, 500)
        build["estimated_cost_usd"] = estimate
        rpps["build"] = build
        evidence = list(rpps.get("evidence") or [])
        evidence.append({
            "claim": f"Estimated build cost defaults to a category-typical ${estimate} for a {category} design; not a quoted price.",
            "source_type": "inference",
            "retrieved_at": NOW,
            "confidence": 0.4,
        })
        rpps["evidence"] = evidence
        sql = f"UPDATE project_versions SET rpps_json = '{json.dumps(rpps, ensure_ascii=False).replace(chr(39), chr(39)+chr(39))}' WHERE id = '{r['version_id']}';"
        if not DRY:
            d1(sql)
        updated += 1

    print(f"DONE estimated cost for {updated} projects (dry-run={DRY})", flush=True)

if __name__ == "__main__":
    main()
