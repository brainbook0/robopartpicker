#!/usr/bin/env python3
"""Extract cost, build time, and difficulty from project descriptions into structured fields.

Updates projects.estimated_cost_minor, projects.difficulty, and the RPPS build object.
Dry-run by default (pass --apply). Env via --env preview|production.
"""
import json, os, sys, re, subprocess, urllib.request, urllib.error, time

DB = "10c57e79-e34f-4643-8c4e-4f0c7968a74d"
DB_PREVIEW = "af9e3aaa-4e74-4083-8317-a642bf0e07a6"
ENV = "preview" if ("--env" in sys.argv and sys.argv[sys.argv.index("--env") + 1] == "preview") else "production"
if ENV == "preview":
    DB = DB_PREVIEW
API = f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CF_ACCOUNT_ID']}/d1/database/{DB}/query"
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

def extract_cost(text):
    # Prefer "total cost $1600", "cost: $X", "~$1600", "price $X".
    patterns = [
        r"(?:total|estimated|approx(?:imate)?|overall)\s+cost\s*(?:is|of|:)?\s*\$?\s*([0-9][0-9,.]*(?:k|K)?)",
        r"\bcost\s*:?\s*\$?\s*([0-9][0-9,.]*(?:k|K)?)",
        r"\b(?:around|about|~|≈)\s*\$?\s*([0-9][0-9,.]*(?:k|K)?)",
        r"\$\s*([0-9][0-9,.]*(?:k|K)?)\b",
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            raw = m.group(1).replace(",", "")
            try:
                if raw.lower().endswith("k"):
                    return int(float(raw[:-1]) * 1000)
                return int(float(raw))
            except ValueError:
                continue
    return None

def extract_hours(text):
    m = re.search(r"(?:build|assembly|construction)?\s*(?:time|takes?)?\s*:?\s*([0-9]+)\s*(?:hours?|hrs?|h)\b", text, re.I)
    if m:
        return int(m.group(1))
    m = re.search(r"([0-9]+)\s*(?:hours?|hrs?)\s*(?:to|-)+\s*(?:build|assemble)", text, re.I)
    if m:
        return int(m.group(1))
    return None

def extract_difficulty(text):
    lower = text.lower()
    if re.search(r"\bexpert\b", lower):
        return "expert"
    if re.search(r"\badvanced\b", lower):
        return "advanced"
    if re.search(r"\bintermediate\b", lower):
        return "intermediate"
    if re.search(r"no prior (?:skills|knowledge|experience)", lower) or re.search(r"\bbeginner\b", lower):
        return "beginner"
    return None

def main():
    rows = d1("""SELECT p.id, p.slug, pv.id AS version_id, pv.rpps_json, p.description, p.difficulty, p.estimated_cost_minor
        FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
        WHERE p.project_kind='physical_design' AND p.deleted_at IS NULL""")["results"]

    stmts = []
    updated = 0
    for r in rows:
        desc = r["description"] or ""
        cost = extract_cost(desc)
        hours = extract_hours(desc)
        difficulty = extract_difficulty(desc) or r["difficulty"]
        try:
            rpps = json.loads(r["rpps_json"])
        except Exception:
            continue
        if not isinstance(rpps, dict):
            continue
        build = dict(rpps.get("build") or {})
        changed = False
        if cost is not None and (r["estimated_cost_minor"] is None or abs(r["estimated_cost_minor"] - cost * 100) > 1) and 1 <= cost <= 1_000_000:
            build["estimated_cost_usd"] = cost
            changed = True
        if hours is not None and 1 <= hours <= 10_000:
            build["estimated_time_hours"] = hours
            changed = True
        if difficulty and difficulty != r["difficulty"]:
            build["difficulty"] = difficulty
            changed = True
        if not changed:
            continue
        rpps["build"] = build
        minor = int(cost * 100) if cost is not None else r["estimated_cost_minor"]
        diff = difficulty or r["difficulty"]
        stmts.append(f"UPDATE projects SET difficulty = {('NULL' if diff is None else chr(39)+diff.replace(chr(39),chr(39)+chr(39))+chr(39))}, estimated_cost_minor = {('NULL' if minor is None else minor)} WHERE id = '{r['id']}';")
        stmts.append(f"UPDATE project_versions SET rpps_json = '{json.dumps(rpps).replace(chr(39), chr(39)+chr(39))}' WHERE id = '{r['version_id']}';")
        updated += 1
        print(f"{r['slug']}: cost={cost} hours={hours} difficulty={difficulty}", flush=True)

    print(f"updated {updated} projects", flush=True)
    if not stmts or DRY:
        print("DRY RUN ONLY. Add --apply to execute." if stmts else "nothing to write")
        return
    open(f"/tmp/backfill-meta-{ENV}.sql", "w").write("\n".join(stmts))
    subprocess.run(["npx", "wrangler", "d1", "execute", "DB", "--env", ENV, "--remote", "--file", f"/tmp/backfill-meta-{ENV}.sql"], check=True)
    print("APPLIED")

if __name__ == "__main__":
    main()
