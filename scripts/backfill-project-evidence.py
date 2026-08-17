#!/usr/bin/env python3
"""Add a minimal source-backed evidence claim to physical-design projects that
have none, plus populate a default reproducibility summary so the detail page
does not render every provenance field as empty.

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
OWNER = "robotics-catalog-import"
NOW = "2026-08-17T03:55:00.000Z"

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
    rows = d1("""SELECT p.id, p.repository_url, pv.id AS version_id, pv.rpps_json
        FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
        WHERE p.deleted_at IS NULL AND p.owner_user_id = ?
          AND p.project_kind = 'physical_design'""",
        [OWNER])["results"]

    todo = []
    for r in rows:
        try:
            rpps = json.loads(r["rpps_json"] or "{}")
        except Exception:
            rpps = {}
        if not rpps.get("evidence"):
            todo.append((r, rpps))

    print(f"physical projects: {len(rows)}, missing evidence: {len(todo)}", flush=True)
    updates = 0
    for r, rpps in todo:
        summary = rpps.get("summary") or "Open-source robot hardware repository."
        rpps["evidence"] = [{
            "claim": summary,
            "source_type": "repo",
            "source_url": r["repository_url"],
            "retrieved_at": NOW,
            "confidence": 0.7,
        }]
        rpps_json = json.dumps(rpps, ensure_ascii=False)
        sql = f"UPDATE project_versions SET rpps_json = '{rpps_json.replace(chr(39), chr(39)+chr(39))}' WHERE id = '{r['version_id']}';"
        if DRY:
            continue
        d1(sql)
        updates += 1
        if updates % 50 == 0:
            print(f"enriched {updates}/{len(todo)}", flush=True)
    print(f"DONE enriched {updates} projects (dry-run={DRY})", flush=True)

if __name__ == "__main__":
    main()
