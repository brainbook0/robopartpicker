#!/usr/bin/env python3
"""Derive fabricated (3D-printed/CNC) BOM parts directly from a repo's model
files. Every STL/STEP/OBJ/3MF/IGES file in the git tree is a part; the filename
is its name. No text parsing or LLM required, so it works for every repo that
ships CAD.

Merged into rpps.bom with fabricated=true, deduped by cleaned name.

Dry-run by default (pass --apply). Env via --env preview|production.
"""
import json, os, sys, time, re, subprocess, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

DB = "10c57e79-e34f-4643-8c4e-4f0c7968a74d"
DB_PREVIEW = "af9e3aaa-4e74-4083-8317-a642bf0e07a6"
ENV = "preview" if "--env" in sys.argv and sys.argv[sys.argv.index("--env") + 1] == "preview" else "production"
if ENV == "preview":
    DB = DB_PREVIEW
API = f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CF_ACCOUNT_ID']}/d1/database/{DB}/query"
DRY = "--apply" not in sys.argv
MODEL_EXTS = (".stl", ".step", ".stp", ".obj", ".3mf", ".iges", ".igs", ".fcstd", ".scad", ".f3d", ".f3z", ".sldprt", ".sldasm", ".ipt", ".iam", ".blend", ".glb", ".gltf", ".dae", ".x_t", ".x_b", ".prt", ".asm", ".zip", ".rar", ".7z")
MAX_PARTS = 150

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

def gh(*args):
    return subprocess.run(["gh", "api", *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.decode()

def repo_owner_name(url):
    m = re.match(r"https://github\.com/([^/]+)/([^/]+?)(?:\.git)?/?$", url)
    return (m.group(1), m.group(2)) if m else None

def clean_part_name(path):
    parts = path.split("/")
    base = parts[-1]
    base = re.sub(r"\.(stl|step|stp|obj|3mf|iges|igs|fcstd|scad|f3d|f3z|sldprt|sldasm|ipt|iam|blend|glb|gltf|dae|x_t|x_b|prt|asm|zip|rar|7z)$", "", base, flags=re.I)
    name = re.sub(r"[_\-.]+", " ", base).strip()
    name = re.sub(r"\s+", " ", name)
    if len(name) < 3 or GENERIC.match(name):
        if len(parts) >= 2:
            parent = re.sub(r"[_\-.]+", " ", parts[-2]).strip()
            if parent and not GENERIC.match(parent) and len(parent) >= 2:
                name = f"{parent} {name}".strip()
    return name

GENERIC = re.compile(r"^(part\d*|component\d*|model\d*|untitled|mesh\d*|body\d*|solid\d*|file\d*)$", re.I)

def derive_from_tree(tree_items):
    names = []
    seen = set()
    for item in tree_items:
        p = item.get("path", "")
        if item.get("type") != "blob" or not p.lower().endswith(MODEL_EXTS):
            continue
        name = clean_part_name(p)
        if not name or len(name) < 2 or len(name) > 160 or GENERIC.match(name):
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        names.append({"name": name, "qty": 1, "fabricated": True, "notes": f"Derived from model file {p}"[:200]})
        if len(names) >= MAX_PARTS:
            break
    return names

def process_project(r):
    ro = repo_owner_name(r["repository_url"])
    if not ro:
        return None
    owner, repo = ro
    try:
        branch = gh("repos/%s/%s" % (owner, repo), "--jq", ".default_branch").strip().strip('"')
        tree = json.loads(gh(f"repos/{owner}/{repo}/git/trees/{branch}?recursive=1"))
    except Exception:
        return None
    parts = derive_from_tree(tree.get("tree", []))
    if not parts:
        return None
    try:
        rpps = json.loads(r["rpps_json"] or "{}")
    except Exception:
        return None
    merged = list(rpps.get("bom") or [])
    seen = set((b.get("name") or "").lower() for b in merged)
    added = 0
    for p in parts:
        if p["name"].lower() in seen:
            continue
        seen.add(p["name"].lower())
        merged.append(p)
        added += 1
    if added == 0:
        return None
    # Keep the merged BOM bounded so the rpps_json UPDATE stays under D1's
    # single-statement length limit.
    merged = merged[:150]
    rpps["bom"] = merged
    sql = f"UPDATE project_versions SET rpps_json = '{json.dumps(rpps, ensure_ascii=False).replace(chr(39), chr(39)+chr(39))}' WHERE id = '{r['version_id']}';"
    if not DRY:
        d1(sql)
    return (r["slug"], added)

def main():
    rows = d1("""SELECT p.id, p.slug, p.repository_url, pv.id AS version_id, pv.rpps_json
        FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
        WHERE p.project_kind = 'physical_design' AND p.deleted_at IS NULL
          AND p.repository_url LIKE 'https://github.com/%'
        ORDER BY p.slug""")["results"]
    print(f"physical projects with a repo: {len(rows)}", flush=True)

    updated = 0
    parts_total = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(process_project, r): r for r in rows}
        for future in as_completed(futures):
            result = future.result()
            if result:
                slug, n = result
                updated += 1
                parts_total += n
                print(f"{slug}: +{n} model-derived parts", flush=True)

    print(f"DONE updated {updated} projects with {parts_total} parts (dry-run={DRY})", flush=True)

if __name__ == "__main__":
    main()
