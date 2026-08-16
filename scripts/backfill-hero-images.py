#!/usr/bin/env python3
"""Extract the hero image from each project's README/description and set it as the cover.

Parses markdown `![alt](url)` and <img src="..."> references from the stored description,
downloads the first usable image, uploads it to R2, and sets cover_image_url.
Dry-run by default (pass --apply). Env via --env preview|production.
"""
import json, os, sys, re, subprocess, urllib.request, urllib.error, time, hashlib
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
DRY = "--apply" not in sys.argv
MAX_SIZE = 8 * 1024 * 1024
IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp", ".gif")

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

def image_urls(text):
    urls = []
    # markdown images
    urls += re.findall(r'!\[[^\]]*\]\(\s*(https?://[^)\s]+)', text)
    # html img
    urls += re.findall(r'<img[^>]+src\s*=\s*["\'](https?://[^"\']+)', text, re.I)
    # bare image urls
    urls += re.findall(r'https?://[^\s"\')]+\.(?:png|jpg|jpeg|webp|gif)', text, re.I)
    return urls

def main():
    rows = d1("""SELECT p.id, p.slug, p.description, p.repository_url, pv.id AS version_id, pv.rpps_json
        FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
        WHERE p.project_kind='physical_design' AND p.deleted_at IS NULL""")["results"]

    stmts = []
    updated = 0
    for r in rows:
        urls = image_urls(r["description"] or "")
        if not urls:
            continue
        # Prefer urls that look like the robot, skip badges/shields.
        def ok(u):
            low = u.lower()
            return not any(b in low for b in ("shields.io", "badge", "img.shields", "travis", "circleci", "github.com/actions", "workflow", "icons8", "creativecommons", "youtube-play"))
        candidates = [u for u in urls if ok(u)]
        # Convert github blob urls to raw so the image actually downloads.
        candidates = [re.sub(r"github\.com/([^/]+)/([^/]+)/blob/([^/]+)/(.+)$", r"raw.githubusercontent.com/\1/\2/\3/\4", u) if "github.com" in u else u for u in candidates]
        if not candidates:
            continue
        # Download the first usable image.
        chosen = None
        data = None
        for u in candidates[:8]:
            try:
                req = urllib.request.Request(u, headers={"User-Agent": "RoboPartPicker/1.0"})
                blob = urllib.request.urlopen(req, timeout=60).read()
                if 0 < len(blob) <= MAX_SIZE and u.lower().endswith(IMAGE_EXT):
                    chosen, data = u, blob
                    break
            except Exception:
                continue
        if not chosen or data is None:
            continue
        try:
            rpps = json.loads(r["rpps_json"])
        except Exception:
            continue
        if not isinstance(rpps, dict):
            continue
        sha = hashlib.sha256(data).hexdigest()
        ext = os.path.splitext(chosen.split("?")[0])[1].lower() or ".png"
        media = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "gif": "image/gif"}.get(ext.lstrip("."), "image/png")
        key = f"cover:{r['slug']}:{sha}{ext}"
        if not DRY:
            s3.put_object(Bucket=BUCKET, Key=key, Body=data, ContentType=media, Metadata={"sha256": sha})
        content_url = f"/api/v1/files/content?id={urllib.parse.quote(key, safe='')}"
        rpps["cover_image_url"] = content_url
        stmts.append(f"UPDATE project_versions SET rpps_json = '{json.dumps(rpps).replace(chr(39), chr(39)+chr(39))}' WHERE id = '{r['version_id']}';")
        updated += 1
        print(f"{r['slug']}: {chosen[:90]}", flush=True)

    print(f"updated {updated} covers from README images", flush=True)
    if not stmts or DRY:
        print("DRY RUN ONLY. Add --apply to execute." if stmts else "nothing to write")
        return
    open(f"/tmp/backfill-hero-{ENV}.sql", "w").write("\n".join(stmts))
    subprocess.run(["npx", "wrangler", "d1", "execute", "DB", "--env", ENV, "--remote", "--file", f"/tmp/backfill-hero-{ENV}.sql"], check=True)
    print("APPLIED")

if __name__ == "__main__":
    main()
