#!/usr/bin/env python3
"""Enrich metadata-only physical-design projects with long-form descriptions,
hardware/software/build hints, and cover images.

For each physical_design project owned by the catalog importer that still has
empty description/hardware/software, fetch the README, clean it, and populate:
  projects.description  <- cleaned README (truncated)
  rpps.hardware.dof     <- first N-DOF/N DoF mention
  rpps.hardware.compute <- Raspberry Pi / ESP32 / Arduino / STM32 / Jetson / PC
  rpps.software.ros_support / middleware
  rpps.build.fabrication
  rpps.cover_image_url  <- GitHub opengraph image

Dry-run by default (pass --apply). Env via --env preview|production.
"""
import json, os, sys, time, re, base64, subprocess, urllib.request, urllib.error

DB = "10c57e79-e34f-4643-8c4e-4f0c7968a74d"
DB_PREVIEW = "af9e3aaa-4e74-4083-8317-a642bf0e07a6"
ENV = "preview" if "--env" in sys.argv and sys.argv[sys.argv.index("--env") + 1] == "preview" else "production"
if ENV == "preview":
    DB = DB_PREVIEW
API = f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CF_ACCOUNT_ID']}/d1/database/{DB}/query"
DRY = "--apply" not in sys.argv
OWNER = "robotics-catalog-import"
MAX_DESC = 8000

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

def clean_markdown(raw):
    s = raw or ""
    s = re.sub(r"```[\s\S]*?```", " ", s)
    s = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", s)
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"[#>*_`~|]", " ", s)
    s = re.sub(r"&[a-z#0-9]+;", " ", s, flags=re.I)
    return re.sub(r"\s+", " ", s).strip()

DOF_RE = re.compile(r"(\d{1,2})\s*(?:[- ])?(?:DOF|DoF|dof|degrees? of freedom)", re.I)
COMPUTE_RE = re.compile(r"\b(Raspberry Pi|Raspberry Pi \d|RaspberryPi|ESP32|Arduino (?:Uno|Mega|Nano)?|STM32\w*|Jetson (?:Nano|Orin|TX\d|Xavier)\w*|NVIDIA Jetson\w*|Teensy\w*|ATmega\w*|Intel NUC|NUC\d|UP Board|BeagleBone\w*)\b", re.I)
ROS_RE = re.compile(r"\b(ROS ?2?|ros2?)\b", re.I)

def main():
    rows = d1("""SELECT p.id, p.slug, p.name, p.repository_url, p.description,
        pv.id AS version_id, pv.rpps_json
        FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
        WHERE p.deleted_at IS NULL AND p.owner_user_id = ?
          AND p.project_kind = 'physical_design'
          AND p.repository_url LIKE 'https://github.com/%'""",
        [OWNER])["results"]

    todo = [r for r in rows if not (r["description"] or "").strip()]
    print(f"physical projects: {len(rows)}, missing description: {len(todo)}", flush=True)

    updates = 0
    for i, r in enumerate(todo):
        ro = repo_owner_name(r["repository_url"])
        if not ro:
            continue
        owner, repo = ro
        description = None
        try:
            meta = json.loads(gh(f"repos/{owner}/{repo}/readme"))
            content = meta.get("content") or ""
            if content:
                try:
                    description = clean_markdown(base64.b64decode(content).decode("utf-8", "replace"))
                except Exception:
                    description = None
        except Exception:
            pass

        rpps = json.loads(r["rpps_json"] or "{}") if r["rpps_json"] else {}
        text = f"{r['name']} {rpps.get('summary','')} {description or ''}"

        hardware = rpps.get("hardware") or {}
        software = rpps.get("software") or {}
        build = rpps.get("build") or {}

        if not hardware.get("dof"):
            m = DOF_RE.search(text)
            if m:
                hardware["dof"] = int(m.group(1))
        if not hardware.get("compute"):
            m = COMPUTE_RE.search(text)
            if m:
                hardware["compute"] = m.group(1)
        if ROS_RE.search(text):
            software["ros_support"] = software.get("ros_support") or "native"
            software["middleware"] = software.get("middleware") or "ROS"
        if re.search(r"\b(3d[- ]print|printable|stl|printed parts)\b", text, re.I):
            fab = build.get("fabrication") or []
            if "3d-print" not in fab:
                fab = fab + ["3d-print"]
            build["fabrication"] = fab

        cover = rpps.get("cover_image_url")
        if not cover:
            rpps["cover_image_url"] = f"https://opengraph.githubassets.com/1/{owner}/{repo}"

        if hardware:
            rpps["hardware"] = hardware
        if software:
            rpps["software"] = software
        if build:
            rpps["build"] = build
        if description:
            rpps["description"] = description[:MAX_DESC]

        rpps_json = json.dumps(rpps, ensure_ascii=False)
        desc_sql = "NULL" if not description else "'" + description[:MAX_DESC].replace("'", "''") + "'"
        sql = (
            f"UPDATE projects SET description = {desc_sql} WHERE id = '{r['id']}';"
            f"UPDATE project_versions SET rpps_json = '{rpps_json.replace(chr(39), chr(39)+chr(39))}' WHERE id = '{r['version_id']}';"
        )
        if DRY:
            continue
        d1(sql)
        updates += 1
        if updates % 25 == 0:
            print(f"enriched {updates}/{len(todo)}", flush=True)

    print(f"DONE enriched {updates} projects (dry-run={DRY})", flush=True)

if __name__ == "__main__":
    main()
