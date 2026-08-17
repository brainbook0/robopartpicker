#!/usr/bin/env python3
"""Derive a BOM for physical-design projects that have none by asking a cheap
LLM to read the project metadata/README and list build parts.

Output is written to rpps.bom and marked with an inference evidence claim so it
is never presented as a sourced/verified BOM.

Usage: python scripts/backfill-ai-bom.py [--env production] [--apply] [--limit N]
"""
import json, os, sys, time, subprocess, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

DB = "10c57e79-e34f-4643-8c4e-4f0c7968a74d"
DB_PREVIEW = "af9e3aaa-4e74-4083-8317-a642bf0e07a6"
ENV = "preview" if "--env" in sys.argv and sys.argv[sys.argv.index("--env") + 1] == "preview" else "production"
if ENV == "preview":
    DB = DB_PREVIEW
API = f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CF_ACCOUNT_ID']}/d1/database/{DB}/query"
DRY = "--apply" not in sys.argv
MODEL = os.environ.get("AI_BOM_MODEL", "deepseek/deepseek-v4-flash-0731")
LIMIT = None
if "--limit" in sys.argv:
    LIMIT = int(sys.argv[sys.argv.index("--limit") + 1])
NOW = "2026-08-17T09:00:00.000Z"

SYSTEM = (
    "You extract a bill of materials (BOM) for open-source robot hardware projects. "
    "From the provided project name, category, tags, and README excerpt, list the physical parts "
    "and components a builder needs. Include both purchased parts (motors, servos, screws, "
    "bearings, electronics, controllers, batteries) and fabricated/3D-printed structural parts. "
    "Return ONLY a single JSON object, no markdown fences, with shape: "
    '{"items":[{"name":"...","qty":1,"manufacturer":"...","mpn":"...","category":"...","fabricated":false,"notes":"..."}]}. '
    "qty must be a positive integer. Omit unknown fields. If no parts can be determined, return {\"items\":[]}."
)

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

def llm(system, user):
    body = json.dumps({
        "model": MODEL,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "max_tokens": 1200,
        "temperature": 0,
    }).encode()
    req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions", data=body,
                                 headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "Content-Type": "application/json"})
    for attempt in range(5):
        try:
            resp = json.load(urllib.request.urlopen(req, timeout=120))
            return resp["choices"][0]["message"]["content"] or ""
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(3 * (attempt + 1))
                continue
            raise
        except (KeyError, IndexError):
            time.sleep(2)
    return ""

def parse_items(raw):
    raw = raw.strip()
    raw = raw.strip("`")
    if raw.startswith("json"):
        raw = raw[4:]
    # tolerate a leading/trailing fence or prose by extracting the first {...} block
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return []
    try:
        obj = json.loads(raw[start:end + 1])
    except Exception:
        return []
    items = obj.get("items") if isinstance(obj, dict) else None
    if not isinstance(items, list):
        return []
    out = []
    for it in items[:200]:
        if not isinstance(it, dict):
            continue
        name = str(it.get("name") or "").strip()
        if not name or len(name) > 500:
            continue
        qty = it.get("qty")
        try:
            qty = max(1, min(100000, int(qty)))
        except (TypeError, ValueError):
            qty = 1
        entry = {"name": name, "qty": qty}
        if it.get("manufacturer"):
            entry["manufacturer"] = str(it["manufacturer"])[:120]
        if it.get("mpn"):
            entry["mpn"] = str(it["mpn"])[:120]
        if it.get("category"):
            entry["category"] = str(it["category"])[:60]
        if isinstance(it.get("fabricated"), bool):
            entry["fabricated"] = it["fabricated"]
        if it.get("notes"):
            entry["notes"] = str(it["notes"])[:500]
        out.append(entry)
    return out

def process_project(r):
    try:
        rpps = json.loads(r["rpps_json"] or "{}")
    except Exception:
        return None
    desc = (rpps.get("description") or "")[:4000]
    tags = " ".join(rpps.get("tags") or [])
    files = (r.get("file_names") or "")[:1500]
    user = f"Project: {r['name']}\nCategory: {r['robot_category'] or 'unknown'}\nTags: {tags}\nSummary: {rpps.get('summary','')}\nFiles: {files}\n\nREADME excerpt:\n{desc}"
    raw = llm(SYSTEM, user)
    items = parse_items(raw)
    if not items:
        raw = llm(SYSTEM, user)
        items = parse_items(raw)
    if not items:
        return None
    rpps["bom"] = items
    evidence = list(rpps.get("evidence") or [])
    evidence.append({
        "claim": f"Bill of materials derived from repository text by {MODEL}; {len(items)} parts. Verify before sourcing.",
        "source_type": "inference",
        "source_url": r["repository_url"],
        "retrieved_at": NOW,
        "confidence": 0.5,
    })
    rpps["evidence"] = evidence
    sql = f"UPDATE project_versions SET rpps_json = '{json.dumps(rpps, ensure_ascii=False).replace(chr(39), chr(39)+chr(39))}' WHERE id = '{r['version_id']}';"
    if not DRY:
        d1(sql)
    return (r["slug"], len(items))

def main():
    where = "AND json_array_length(json_extract(pv.rpps_json, '$.bom')) = 0"
    sql = f"""SELECT p.id, p.slug, p.name, p.robot_category, p.repository_url, pv.id AS version_id, pv.rpps_json,
        (SELECT GROUP_CONCAT(lower(f.original_name), ' ') FROM project_files pf JOIN files f ON f.id = pf.file_id WHERE pf.project_id = p.id) AS file_names
        FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
        WHERE p.project_kind = 'physical_design' AND p.deleted_at IS NULL {where}
        ORDER BY p.slug"""
    if LIMIT:
        sql += f" LIMIT {LIMIT}"
    rows = d1(sql)["results"]
    print(f"projects without BOM: {len(rows)}", flush=True)

    updated = 0
    with_bom = 0
    workers = 8
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(process_project, r): r for r in rows}
        for future in as_completed(futures):
            result = future.result()
            if result:
                slug, n = result
                updated += 1
                with_bom += n
                print(f"{slug}: +{n} AI-derived parts", flush=True)

    print(f"DONE updated {updated} projects with {with_bom} parts (dry-run={DRY}, model={MODEL})", flush=True)

if __name__ == "__main__":
    main()
