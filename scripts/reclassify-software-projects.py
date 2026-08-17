#!/usr/bin/env python3
"""Reclassify physical_design projects that ship no CAD/model files as
robotics_software. A project without any model file is software/controller
code, not an open hardware design, so it should not occupy the physical
catalog with permanently empty hardware/BOM sections.

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

MODEL_EXTS = (".stl", ".step", ".stp", ".obj", ".3mf", ".iges", ".igs", ".fcstd", ".scad", ".f3d", ".f3z",
              ".sldprt", ".sldasm", ".ipt", ".iam", ".blend", ".glb", ".gltf", ".dae", ".x_t", ".x_b",
              ".prt", ".asm", ".zip", ".rar", ".7z")

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

def has_model_files(repo):
    owner, name = repo
    try:
        branch = gh("repos/%s/%s" % (owner, name), "--jq", ".default_branch").strip().strip('"')
        tree = json.loads(gh(f"repos/{owner}/{name}/git/trees/{branch}?recursive=1"))
    except Exception:
        return None  # unknown; do not reclassify on a fetch failure
    for item in tree.get("tree", []):
        if item.get("type") == "blob" and item.get("path", "").lower().endswith(MODEL_EXTS):
            return True
    return False

def main():
    rows = d1("""SELECT p.id, p.slug, p.repository_url, pv.id AS version_id, pv.rpps_json
        FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
        WHERE p.project_kind = 'physical_design' AND p.deleted_at IS NULL
          AND p.repository_url LIKE 'https://github.com/%'
          AND json_array_length(json_extract(pv.rpps_json, '$.bom')) = 0
        ORDER BY p.slug""")["results"]
    print(f"physical projects without BOM: {len(rows)}", flush=True)

    to_reclassify = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(has_model_files, repo_owner_name(r["repository_url"])): r for r in rows if repo_owner_name(r["repository_url"])}
        for future in as_completed(futures):
            r = futures[future]
            has = future.result()
            if has is False:
                to_reclassify.append(r)

    print(f"reclassifying {len(to_reclassify)} projects to robotics_software", flush=True)
    for r in to_reclassify:
        try:
            rpps = json.loads(r["rpps_json"] or "{}")
        except Exception:
            rpps = {}
        rpps["project_kind"] = "robotics_software"
        sql = (
            f"UPDATE projects SET project_kind = 'robotics_software' WHERE id = '{r['id']}';"
            f"UPDATE project_versions SET rpps_json = '{json.dumps(rpps, ensure_ascii=False).replace(chr(39), chr(39)+chr(39))}' WHERE id = '{r['version_id']}';"
        )
        if not DRY:
            d1(sql)
        print(f"reclassified {r['slug']}", flush=True)

    print(f"DONE reclassified {len(to_reclassify)} (dry-run={DRY})", flush=True)

if __name__ == "__main__":
    main()
