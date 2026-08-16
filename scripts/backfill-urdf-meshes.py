#!/usr/bin/env python3
"""Fetch the mesh files referenced by each project's URDF so the 3D assembly renders.

For every project with a urdf file, download the URDF, parse <mesh filename="...">,
resolve each reference to a repo path, download that mesh (STL/DAE), and upload/link it.
"""
import json, os, sys, time, hashlib, subprocess, urllib.request, urllib.error, urllib.parse, re
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
OWNER = "robotics-catalog-import"
DRY = "--apply" not in sys.argv
MAX_SIZE = 12 * 1024 * 1024
KINDS = (".stl", ".dae", ".step", ".stp", ".obj", ".3ds")

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
    aws_access_key_id=CREDS["R2_ACCESS_KEY_ID"], aws_secret_access_key=CREDS["R2_SECRET_ACCESS_KEY"],
    region_name=CREDS.get("R2_REGION", "auto"), config=boto3.session.Config(signature_version="s3v4"))

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

def normalize(path):
    parts = []
    for part in path.replace("\\", "/").split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            if parts: parts.pop()
            continue
        parts.append(part)
    return "/".join(parts)

def main():
    rows = d1("""SELECT p.id, p.slug, p.repository_url, pv.id AS version_id, f.id AS urdf_id, f.object_key, f.original_name
        FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
        JOIN project_files pf ON pf.project_id = p.id JOIN files f ON f.id = pf.file_id
        WHERE p.deleted_at IS NULL AND f.kind='urdf' AND f.original_name LIKE '%.urdf'""")["results"]

    # Map project -> urdf rows (take one urdf per project: prefer so100.urdf / *.urdf base).
    by_project = {}
    for r in rows:
        by_project.setdefault(r["slug"], []).append(r)

    print(f"projects with urdf: {len(by_project)}", flush=True)
    uploaded = 0

    for slug, urdfs in by_project.items():
        urdf = urdfs[0]
        ro = repo_owner_name(urdf["repository_url"])
        if not ro:
            continue
        owner, repo = ro
        try:
            default_branch = gh(f"repos/{owner}/{repo}", "--jq", ".default_branch").strip().strip('"').strip()
        except Exception:
            continue
        # Fetch the URDF content from R2 via its object_key using r2.py dl.
        urdf_dir = os.path.dirname(urdf["object_key"].replace("harvest-file:" + slug + ":", "", 1))
        # The object_key is harvest-file:<slug>:<sha>:<path>; the repo path is after the second colon segment.
        # Simpler: derive the repo path from the object key suffix.
        key_parts = urdf["object_key"].split(":")
        repo_rel = key_parts[-1] if len(key_parts) >= 4 else None
        if not repo_rel:
            continue
        urdf_dir = os.path.dirname(repo_rel).replace("\\", "/")
        # Download URDF text from R2.
        tmp = f"/tmp/urdf-{slug}.urdf"
        subprocess.run(["bash", "-c", f"source /root/.cloudflare/credentials && /root/.jcode/scratch/r2-venv/bin/python /root/.cloudflare/r2.py dl {BUCKET} '{urdf['object_key']}' {tmp}"], check=False)
        if not os.path.exists(tmp):
            continue
        text = open(tmp, encoding="utf-8", errors="replace").read()
        meshes = re.findall(r'<mesh\b[^>]*filename\s*=\s*"([^"]+)"', text)
        seen = set()
        for ref in meshes:
            if ref.startswith("package://"):
                ref = re.sub(r"^package://[^/]+/", "", ref)
            if ref.startswith("/"):
                continue
            resolved = normalize(f"{urdf_dir}/{ref}")
            if resolved in seen:
                continue
            seen.add(resolved)
            if not resolved.lower().endswith(KINDS):
                continue
            raw = f"https://raw.githubusercontent.com/{owner}/{repo}/{default_branch}/{urllib.parse.quote(resolved)}"
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
            ext = os.path.splitext(resolved)[1].lower().lstrip(".")
            kind = "cad"
            media = "application/octet-stream"
            if ext == "dae": media = "application/xml"
            key = f"harvest-file:{slug}:{sha}:{resolved}"
            now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            if not DRY:
                s3.put_object(Bucket=BUCKET, Key=key, Body=data, ContentType=media, Metadata={"sha256": sha})
                d1("""INSERT OR IGNORE INTO files (id, object_key, original_name, media_type, size_bytes, checksum_sha256,
                      owner_user_id, visibility, status, kind, metadata_json, created_at, updated_at)
                      VALUES (?,?,?,?,?,?,?, 'public','ready', ?, '{}', ?, ?)""",
                   [key, key, os.path.basename(resolved), media, len(data), sha, OWNER, kind, now, now])
                d1("""INSERT OR IGNORE INTO project_files (project_id, project_version_id, file_id, purpose, relative_path, created_at)
                      VALUES (?,?,?, 'cad', ?, ?)""",
                   [urdf["id"], urdf["version_id"], key, resolved, now])
            uploaded += 1
        print(f"{slug}: {len(seen)} mesh refs", flush=True)
    print(f"{'DRY RUN' if DRY else 'APPLIED'}: uploaded {uploaded} URDF meshes", flush=True)

if __name__ == "__main__":
    main()
