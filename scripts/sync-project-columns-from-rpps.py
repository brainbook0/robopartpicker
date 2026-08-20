#!/usr/bin/env python3
"""Sync safe RPPS metadata into top-level project columns used by public cards.

This does not invent new facts. It copies already-reviewed values from the
current project_versions.rpps_json into projects when the public project column
is empty. Dry-run by default, pass --apply to write production/preview D1.
"""
import json, os, sys, time, subprocess, urllib.request, urllib.error

DB = "10c57e79-e34f-4643-8c4e-4f0c7968a74d"
DB_PREVIEW = "af9e3aaa-4e74-4083-8317-a642bf0e07a6"
ENV = "preview" if "--env" in sys.argv and sys.argv[sys.argv.index("--env") + 1] == "preview" else "production"
if ENV == "preview":
    DB = DB_PREVIEW
DRY = "--apply" not in sys.argv

def load_creds():
    out = subprocess.run(["bash", "-c", "source /root/.cloudflare/credentials && env"], stdout=subprocess.PIPE, check=True).stdout.decode()
    env = {}
    for line in out.splitlines():
        if "=" in line:
            k, _, v = line.partition("=")
            env[k] = v
    return env

CREDS = load_creds()
os.environ.setdefault("CF_ACCOUNT_ID", CREDS["CF_ACCOUNT_ID"])
os.environ.setdefault("CF_API_TOKEN", CREDS["CF_API_TOKEN"])
API = f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CF_ACCOUNT_ID']}/d1/database/{DB}/query"

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

def clean_text(value, max_len):
    if not isinstance(value, str):
        return None
    value = " ".join(value.split()).strip()
    return value[:max_len] if value else None

def main():
    rows = d1("""SELECT p.id, p.slug, p.summary, p.description, p.license_spdx, p.difficulty, p.estimated_cost_minor,
            pv.rpps_json
        FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
        WHERE p.project_kind = 'physical_design' AND p.deleted_at IS NULL""")["results"]
    stmts = []
    changed = []
    for row in rows:
        try:
            rpps = json.loads(row["rpps_json"] or "{}")
        except Exception:
            continue
        if not isinstance(rpps, dict):
            continue
        build = rpps.get("build") if isinstance(rpps.get("build"), dict) else {}
        updates = []
        summary = clean_text(rpps.get("summary"), 280)
        description = rpps.get("description") if isinstance(rpps.get("description"), str) else None
        license_spdx = clean_text(rpps.get("license"), 100)
        difficulty = clean_text(build.get("difficulty"), 40)
        cost = build.get("estimated_cost_usd")
        if (not row["summary"] or len(str(row["summary"]).strip()) < 20) and summary:
            updates.append(f"summary = {q(summary)}")
        if (not row["description"] or len(str(row["description"]).strip()) < 80) and description and len(description.strip()) >= 80:
            updates.append(f"description = {q(description)}")
        if not row["license_spdx"] and license_spdx:
            updates.append(f"license_spdx = {q(license_spdx)}")
        if not row["difficulty"] and difficulty in ("beginner", "intermediate", "advanced", "expert"):
            updates.append(f"difficulty = {q(difficulty)}")
        if row["estimated_cost_minor"] is None and isinstance(cost, (int, float)) and 0 <= cost <= 10_000_000:
            updates.append(f"estimated_cost_minor = {int(round(cost * 100))}")
            updates.append("estimated_cost_currency = 'USD'")
        if updates:
            updates.append(f"updated_at = {q(time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))}")
            stmts.append(f"UPDATE projects SET {', '.join(updates)} WHERE id = {q(row['id'])};")
            changed.append({"slug": row["slug"], "fields": [u.split(' = ',1)[0] for u in updates if not u.startswith('updated_at')]})
    print(json.dumps({"env": ENV, "dryRun": DRY, "projectsChanged": len(changed), "fieldUpdates": sum(len(c["fields"]) for c in changed), "sample": changed[:30]}, indent=2))
    if not stmts or DRY:
        if stmts:
            open(f"/tmp/sync-project-columns-{ENV}.sql", "w").write("\n".join(stmts) + "\n")
            print(f"DRY RUN ONLY. SQL: /tmp/sync-project-columns-{ENV}.sql")
        else:
            print("nothing to write")
        return
    path = f"/tmp/sync-project-columns-{ENV}.sql"
    open(path, "w").write("\n".join(stmts) + "\n")
    subprocess.run(["npx", "wrangler", "d1", "execute", "DB", "--env", ENV, "--remote", "--file", path], check=True)
    print("APPLIED")

if __name__ == "__main__":
    main()
