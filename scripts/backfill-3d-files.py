#!/usr/bin/env python3
"""Fetch and store 3D design files (STL/STEP/URDF) for physical-design projects that lack them.

For each physical_design project without a .stl/.step/.urdf file, lists the GitHub repo tree,
downloads up to MAX_FILES_PER_PROJECT small 3D files, uploads them to R2, and links them via
files + project_files. Resumable via a state file. Dry-run by default.
"""
import json, os, sys, time, hashlib, subprocess, urllib.request, urllib.error, urllib.parse
import boto3

DB = "10c57e79-e34f-4643-8c4e-4f0c7968a74d"  # production
DB_PREVIEW = "af9e3aaa-4e74-4083-8317-a642bf0e07a6"
BUCKET = "robopartpicker-files"
BUCKET_PREVIEW = "robopartpicker-preview-files"
ENV = "preview" if "--env" in sys.argv and sys.argv[sys.argv.index("--env") + 1] == "preview" else "production"
if ENV == "preview":
    DB = DB_PREVIEW
    BUCKET = BUCKET_PREVIEW
API = f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CF_ACCOUNT_ID']}/d1/database/{DB}/query"
STATE = f"/root/.cloudflare/backfill-3d-state-{ENV}.json"
MAX_FILES_PER_PROJECT = 6
MAX_SIZE = 12 * 1024 * 1024
KINDS = (".stl", ".step", ".stp", ".urdf", ".iges", ".igs")
OWNER = "robotics-catalog-import"
DRY = "--apply" not in sys.argv

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

def main():
    state = {}
    if os.path.exists(STATE):
        state = json.load(open(STATE))
    done = state.setdefault("done", [])

    rows = d1("""SELECT p.id, p.slug, p.repository_url, pv.id AS version_id
        FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
        WHERE p.project_kind='physical_design' AND p.deleted_at IS NULL AND p.repository_url LIKE 'https://github.com/%'
        AND NOT EXISTS (SELECT 1 FROM project_files pf JOIN files f ON f.id=pf.file_id
            WHERE pf.project_id=p.id AND (lower(f.original_name) LIKE '%.stl' OR lower(f.original_name) LIKE '%.step'
              OR lower(f.original_name) LIKE '%.urdf'))""")["results"]

    todo = [r for r in rows if r["slug"] not in done]
    print(f"physical designs lacking 3D files: {len(rows)}, todo: {len(todo)}", flush=True)
    uploaded = 0

    for r in todo:
        slug = r["slug"]
        ro = repo_owner_name(r["repository_url"])
        if not ro:
            print(f"skip {slug}: bad repo url", flush=True); continue
        owner, repo = ro
        try:
            default_branch = gh(f"repos/{owner}/{repo}", "--jq", ".default_branch").strip().strip('"').strip()
            tree = json.loads(gh(f"repos/{owner}/{repo}/git/trees/{default_branch}?recursive=1"))
        except Exception as e:
            print(f"skip {slug}: tree error {e}", flush=True); continue
        paths = []
        for item in tree.get("tree", []):
            p = item.get("path", "")
            if p.lower().endswith(KINDS) and item.get("type") == "blob" and item.get("size", 0) <= MAX_SIZE:
                paths.append(p)
        if not paths:
            print(f"skip {slug}: no 3D files in repo", flush=True); continue
        paths = paths[:MAX_FILES_PER_PROJECT]
        for path in paths:
            raw = f"https://raw.githubusercontent.com/{owner}/{repo}/{default_branch}/{urllib.parse.quote(path)}"
            try:
                req = urllib.request.Request(raw, headers={"User-Agent": "RoboPartPicker/1.0"})
                data = urllib.request.urlopen(req, timeout=120).read()
            except Exception as e:
                print(f"  {slug}: download fail {path}: {e}", flush=True); continue
            if len(data) > MAX_SIZE:
                continue
            if data[:40].startswith(b"version https://git-lfs.github.com") or b"oid sha256" in data[:200]:
                continue
            sha = hashlib.sha256(data).hexdigest()
            ext = os.path.splitext(path)[1].lower().lstrip(".")
            kind = "urdf" if ext == "urdf" else "cad"
            media = "application/octet-stream"
            if ext == "urdf": media = "application/xml"
            key = f"harvest-file:{slug}:{sha}:{path}"
            file_id = key
            rel = path
            now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            if not DRY:
                s3.put_object(Bucket=BUCKET, Key=key, Body=data, ContentType=media,
                              Metadata={"sha256": sha})
                d1("""INSERT OR IGNORE INTO files (id, object_key, original_name, media_type, size_bytes, checksum_sha256,
                      owner_user_id, visibility, status, kind, metadata_json, created_at, updated_at)
                      VALUES (?,?,?,?,?,?,?, 'public','ready', ?, '{}', ?, ?)""",
                   [file_id, key, os.path.basename(path), media, len(data), sha, OWNER, kind, now, now])
                d1("""INSERT OR IGNORE INTO project_files (project_id, project_version_id, file_id, purpose, relative_path, created_at)
                      VALUES (?,?,?, 'cad', ?, ?)""",
                   [r["id"], r["version_id"], file_id, rel, now])
            print(f"  {slug}: {path} ({len(data)} bytes)", flush=True)
            uploaded += 1
        if not DRY:
            done.append(slug)
            json.dump(state, open(STATE, "w"))
    print(f"{'DRY RUN' if DRY else 'APPLIED'}: uploaded {uploaded} 3D files across {len(done)} projects", flush=True)

if __name__ == "__main__":
    main()
