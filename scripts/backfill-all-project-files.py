#!/usr/bin/env python3
"""Collect key files (README, LICENSE, manifests, BOM, CAD) for ALL projects, not just physical designs.

For software projects this fetches README/LICENSE/package manifests/Dockerfile; for physical
designs it fetches CAD/BOM/docs. Resumable. Dry-run by default (pass --apply).
"""
import json, os, sys, time, hashlib, subprocess, urllib.request, urllib.error, urllib.parse
import boto3

DB = "10c57e79-e34f-4643-8c4e-4f0c7968a74d"
DB_PREVIEW = "af9e3aaa-4e74-4083-8317-a642bf0e07a6"
BUCKET = "robopartpicker-files"
BUCKET_PREVIEW = "robopartpicker-preview-files"
ENV = "preview" if ("--env" in sys.argv and sys.argv[sys.argv.index("--env") + 1] == "preview") else "production"
if ENV == "preview":
    DB = DB_PREVIEW
    BUCKET = BUCKET_PREVIEW
API = f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CF_ACCOUNT_ID']}/d1/database/{DB}/query"
STATE = f"/root/.cloudflare/backfill-all-files-state-{ENV}.json"
MAX_PER_PROJECT = 8
MAX_SIZE = 2 * 1024 * 1024
OWNER = "robotics-catalog-import"
DRY = "--apply" not in sys.argv

# extension -> (kind, media_type, priority)
EXT_MAP = {
    ".urdf": ("urdf", "application/xml", 0),
    ".stl": ("cad", "application/octet-stream", 1),
    ".step": ("cad", "application/octet-stream", 1),
    ".stp": ("cad", "application/octet-stream", 1),
    ".csv": ("bom", "text/csv", 2),
    ".xlsx": ("bom", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 2),
    ".md": ("document", "text/markdown", 3),
    ".pdf": ("document", "application/pdf", 3),
    ".ino": ("firmware", "text/plain", 4),
    ".c": ("firmware", "text/plain", 4),
    ".cpp": ("firmware", "text/plain", 4),
    ".h": ("firmware", "text/plain", 4),
    ".hpp": ("firmware", "text/plain", 4),
    ".yaml": ("configuration", "text/plain", 5),
    ".yml": ("configuration", "text/plain", 5),
    ".json": ("configuration", "application/json", 5),
    ".toml": ("configuration", "text/plain", 5),
    ".xml": ("configuration", "application/xml", 5),
    ".cfg": ("configuration", "text/plain", 5),
    ".launch": ("configuration", "text/plain", 5),
    ".py": ("configuration", "text/plain", 6),
    ".png": ("image", "image/png", 7),
    ".jpg": ("image", "image/jpeg", 7),
    ".jpeg": ("image", "image/jpeg", 7),
    ".webp": ("image", "image/webp", 7),
}

# Prefer manifest/license files by name.
def priority_bump(path):
    base = os.path.basename(path).lower()
    if base in ("readme.md", "license", "license.md", "license.txt", "copying"):
        return -5
    if base in ("package.xml", "cmakelists.txt", "requirements.txt", "pyproject.toml", "setup.py", "dockerfile"):
        return -3
    return 0

def load_creds():
    out = subprocess.run(["bash", "-c", "source /root/.cloudflare/credentials && env"], stdout=subprocess.PIPE, check=True).stdout.decode()
    env = {}
    for line in out.splitlines():
        if "=" in line:
            k, _, v = line.partition("=")
            env[k] = v
    return env

CREDS = load_creds()
s3 = boto3.client("s3", endpoint_url=CREDS["R2_ENDPOINT"], aws_access_key_id=CREDS["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=CREDS["R2_SECRET_ACCESS_KEY"], region_name=CREDS.get("R2_REGION", "auto"),
    config=boto3.session.Config(signature_version="s3v4"))

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
    m = __import__("re").match(r"https://github\.com/([^/]+)/([^/]+?)(?:\.git)?/?$", url)
    return (m.group(1), m.group(2)) if m else None

def main():
    state = {}
    if os.path.exists(STATE):
        state = json.load(open(STATE))
    done = set(state.get("done", []))

    rows = d1("""SELECT p.id, p.slug, p.repository_url, p.project_kind, pv.id AS version_id
        FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
        WHERE p.deleted_at IS NULL AND p.repository_url LIKE 'https://github.com/%'
          AND NOT EXISTS (SELECT 1 FROM project_files pf WHERE pf.project_id = p.id)""")["results"]

    todo = [r for r in rows if r["slug"] not in done]
    print(f"projects without files: {len(rows)}, todo: {len(todo)}", flush=True)
    uploaded = 0

    for r in todo:
        slug = r["slug"]
        ro = repo_owner_name(r["repository_url"])
        if not ro:
            continue
        owner, repo = ro
        try:
            default_branch = gh(f"repos/{owner}/{repo}", "--jq", ".default_branch").strip().strip('"').strip()
            tree = json.loads(gh(f"repos/{owner}/{repo}/git/trees/{default_branch}?recursive=1"))
        except Exception:
            continue
        candidates = []
        for item in tree.get("tree", []):
            p = item.get("path", "")
            if item.get("type") != "blob" or item.get("size", 0) > MAX_SIZE:
                continue
            kf = EXT_MAP.get(os.path.splitext(p)[1].lower())
            if not kf:
                continue
            if any(part in p.lower() for part in ("node_modules/", "third_party/", "vendor/", ".git/", "test/", "tests/")):
                continue
            priority = kf[2] + priority_bump(p)
            candidates.append((priority, kf[0], kf[1], p))
        candidates.sort(key=lambda x: (x[0], x[3].lower()))
        picked = []
        seen_kinds = {}
        for priority, kind, media, path in candidates:
            if seen_kinds.get(kind, 0) >= {"document": 3, "cad": 6, "bom": 2, "configuration": 3, "image": 2, "urdf": 2, "firmware": 2}.get(kind, 2):
                continue
            seen_kinds[kind] = seen_kinds.get(kind, 0) + 1
            picked.append((kind, media, path))
            if len(picked) >= MAX_PER_PROJECT:
                break
        if not picked:
            continue
        for kind, media, path in picked:
            raw = f"https://raw.githubusercontent.com/{owner}/{repo}/{default_branch}/{urllib.parse.quote(path)}"
            try:
                req = urllib.request.Request(raw, headers={"User-Agent": "RoboPartPicker/1.0"})
                data = urllib.request.urlopen(req, timeout=60).read()
            except Exception:
                continue
            if len(data) > MAX_SIZE or len(data) < 10:
                continue
            if data[:40].startswith(b"version https://git-lfs.github.com") or b"oid sha256" in data[:200]:
                continue
            sha = hashlib.sha256(data).hexdigest()
            key = f"harvest-file:{slug}:{sha}:{path}"
            now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            if not DRY:
                s3.put_object(Bucket=BUCKET, Key=key, Body=data, ContentType=media, Metadata={"sha256": sha})
                d1("""INSERT OR IGNORE INTO files (id, object_key, original_name, media_type, size_bytes, checksum_sha256,
                      owner_user_id, visibility, status, kind, metadata_json, created_at, updated_at)
                      VALUES (?,?,?,?,?,?,?, 'public','ready', ?, '{}', ?, ?)""",
                   [key, key, os.path.basename(path), media, len(data), sha, OWNER, kind, now, now])
                d1("""INSERT OR IGNORE INTO project_files (project_id, project_version_id, file_id, purpose, relative_path, created_at)
                      VALUES (?,?,?, ?, ?, ?)""",
                   [r["id"], r["version_id"], key, kind, path, now])
            uploaded += 1
        if not DRY:
            done.add(slug)
            json.dump({"done": sorted(done)}, open(STATE, "w"))
        if uploaded % 200 == 0:
            print(f"progress: {uploaded} files", flush=True)
    print(f"{'DRY RUN' if DRY else 'APPLIED'}: uploaded {uploaded} files across {len(done)} projects", flush=True)

if __name__ == "__main__":
    main()
