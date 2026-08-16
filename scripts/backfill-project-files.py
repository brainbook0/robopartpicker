#!/usr/bin/env python3
"""Fetch a broad set of project artifact files (URDF, CAD, BOM, firmware, config, docs, images)
for physical-design projects, upload them to R2, and link them via files + project_files.

Resumable. Dry-run by default (pass --apply). Env via --env preview|production.
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
STATE = f"/root/.cloudflare/backfill-files-state-{ENV}.json"
MAX_PER_PROJECT = 40
MAX_SIZE = 12 * 1024 * 1024
OWNER = "robotics-catalog-import"
DRY = "--apply" not in sys.argv

# extension -> (kind, media_type, priority). Lower priority is fetched first.
EXT_MAP = {
    ".urdf": ("urdf", "application/xml", 0),
    ".stl": ("cad", "application/octet-stream", 1),
    ".step": ("cad", "application/octet-stream", 1),
    ".stp": ("cad", "application/octet-stream", 1),
    ".iges": ("cad", "application/octet-stream", 1),
    ".igs": ("cad", "application/octet-stream", 1),
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
    ".cfg": ("configuration", "text/plain", 5),
    ".launch": ("configuration", "text/plain", 5),
    ".png": ("image", "image/png", 6),
    ".jpg": ("image", "image/jpeg", 6),
    ".jpeg": ("image", "image/jpeg", 6),
    ".webp": ("image", "image/webp", 6),
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
s3 = boto3.client("s3", endpoint_url=CREDS["R2_ENDPOINT"],
    aws_access_key_id=CREDS["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=CREDS["R2_SECRET_ACCESS_KEY"],
    region_name=CREDS.get("R2_REGION", "auto"),
    config=boto3.session.Config(signature_version="s3v4"))

def d1(sql, params=None):
    body = json.dumps({"sql": sql, "params": params or []}).encode()
    req = urllib.request.Request(API, data=body, headers={
        "Authorization": f"Bearer {CREDS['CF_API_TOKEN']}", "Content-Type": "application/json"})
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

def kind_for(path):
    ext = os.path.splitext(path)[1].lower()
    return EXT_MAP.get(ext)

def main():
    state = {}
    if os.path.exists(STATE):
        state = json.load(open(STATE))
    done = state.setdefault("done", [])

    rows = d1("""SELECT p.id, p.slug, p.repository_url, pv.id AS version_id
        FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
        WHERE p.project_kind='physical_design' AND p.deleted_at IS NULL AND p.repository_url LIKE 'https://github.com/%'""")["results"]

    todo = [r for r in rows if r["slug"] not in done]
    print(f"physical designs: {len(rows)}, todo: {len(todo)}", flush=True)
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
        # Collect candidates, skip third-party/vendor noise and tiny LFS pointers.
        candidates = []
        for item in tree.get("tree", []):
            p = item.get("path", "")
            if item.get("type") != "blob":
                continue
            if item.get("size", 0) > MAX_SIZE:
                continue
            kf = kind_for(p)
            if not kf:
                continue
            if any(part in p.lower() for part in ("node_modules/", "third_party/", "vendor/", ".git/")):
                continue
            candidates.append((kf[2], kf[0], kf[1], p))
        candidates.sort(key=lambda x: (x[0], x[3].lower()))
        kind_limits = {"urdf": 8, "cad": 10, "bom": 4, "document": 4, "firmware": 6, "configuration": 6, "image": 4}
        kind_count = {}
        picked = []
        for priority, kind, media, path in candidates:
            if kind_count.get(kind, 0) >= kind_limits.get(kind, 4):
                continue
            kind_count[kind] = kind_count.get(kind, 0) + 1
            picked.append((kind, media, path))
            if len(picked) >= MAX_PER_PROJECT:
                break
        if not picked:
            continue
        for kind, media, path in picked:
            raw = f"https://raw.githubusercontent.com/{owner}/{repo}/{default_branch}/{urllib.parse.quote(path)}"
            try:
                req = urllib.request.Request(raw, headers={"User-Agent": "RoboPartPicker/1.0"})
                data = urllib.request.urlopen(req, timeout=120).read()
            except Exception:
                continue
            if len(data) > MAX_SIZE:
                continue
            if data[:40].startswith(b"version https://git-lfs.github.com") or b"oid sha256" in data[:200]:
                continue
            sha = hashlib.sha256(data).hexdigest()
            key = f"harvest-file:{slug}:{sha}:{path}"
            file_id = key
            now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            if not DRY:
                s3.put_object(Bucket=BUCKET, Key=key, Body=data, ContentType=media, Metadata={"sha256": sha})
                d1("""INSERT OR IGNORE INTO files (id, object_key, original_name, media_type, size_bytes, checksum_sha256,
                      owner_user_id, visibility, status, kind, metadata_json, created_at, updated_at)
                      VALUES (?,?,?,?,?,?,?, 'public','ready', ?, '{}', ?, ?)""",
                   [file_id, key, os.path.basename(path), media, len(data), sha, OWNER, kind, now, now])
                d1("""INSERT OR IGNORE INTO project_files (project_id, project_version_id, file_id, purpose, relative_path, created_at)
                      VALUES (?,?,?, ?, ?, ?)""",
                   [r["id"], r["version_id"], file_id, kind, path, now])
            uploaded += 1
        if not DRY:
            done.append(slug)
            json.dump(state, open(STATE, "w"))
        print(f"{slug}: {len(picked)} files", flush=True)
    print(f"{'DRY RUN' if DRY else 'APPLIED'}: uploaded {uploaded} files", flush=True)

if __name__ == "__main__":
    main()
