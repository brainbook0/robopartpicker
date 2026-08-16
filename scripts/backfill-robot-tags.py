#!/usr/bin/env python3
"""Classify physical designs into robot categories and open/closed-source, adding tags.

Updates the RPPS tags array (rpps.tags) with category + license tags.
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

OSS_LICENSES = {"MIT", "Apache-2.0", "GPL-3.0", "GPL-2.0", "LGPL-3.0", "LGPL-2.1", "BSD-3-Clause", "BSD-2-Clause",
    "CERN-OHL-S-2.0", "CERN-OHL-W-2.0", "CERN-OHL-P-2.0", "CC-BY-SA-4.0", "CC-BY-4.0", "ISC", "MPL-2.0", "AGPL-3.0"}

CATEGORIES = [
    ("humanoid", ["humanoid", "biped", "bipedal"]),
    ("quadruped", ["quadruped", "four-legged", "4-legged", "quadraped", "cheetah", "dog", "go2", "spot", "barkour"]),
    ("robot-arm", ["robot arm", "robotic arm", "manipulator", "arm100", "arm-100", "so-100", "so100", "so101", "6dof", "7dof", "6-dof", "7-dof"]),
    ("rover", ["rover", "mars", "rocky terrain"]),
    ("drone", ["drone", "quadcopter", "uav", "aerial", "multi-rotor", "multirotor", "esp-drone"]),
    ("gripper", ["gripper", "robotic hand", "dexterous hand", "robot hand"]),
    ("wheeled", ["wheeled", "rover", "car", "mobile robot", "turtlebot"]),
    ("legged", ["legged", "hexapod", "spider", "walking"]),
    ("humanoid-upper", ["torso", "upper body", "arm torso"]),
]

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

def classify(text):
    lower = text.lower()
    hits = []
    for cat, kws in CATEGORIES:
        if any(kw in lower for kw in kws):
            hits.append(cat)
    return hits

def main():
    rows = d1("""SELECT p.id, p.slug, p.name, p.license_spdx, pv.id AS version_id, pv.rpps_json
        FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
        WHERE p.project_kind='physical_design' AND p.deleted_at IS NULL""")["results"]

    stmts = []
    updated = 0
    for r in rows:
        text = f"{r['slug']} {r['name'] or ''}".lower()
        cats = classify(text)
        lic = r["license_spdx"]
        source = "open-source" if (lic and lic in OSS_LICENSES) else ("source-available" if lic and lic not in ("NOASSERTION", None) else "license-unclear")
        new_tags = [f"category:{c}" for c in cats] + [source]
        try:
            rpps = json.loads(r["rpps_json"])
        except Exception:
            continue
        if not isinstance(rpps, dict):
            continue
        existing = list(rpps.get("tags") or [])
        merged = existing + [t for t in new_tags if t not in existing]
        if merged == existing:
            continue
        rpps["tags"] = merged
        stmts.append(f"UPDATE project_versions SET rpps_json = '{json.dumps(rpps).replace(chr(39), chr(39)+chr(39))}' WHERE id = '{r['version_id']}';")
        updated += 1
        print(f"{r['slug']}: {cats} {source}", flush=True)

    print(f"updated {updated} projects", flush=True)
    if not stmts or DRY:
        print("DRY RUN ONLY. Add --apply to execute." if stmts else "nothing to write")
        return
    open(f"/tmp/backfill-tags-{ENV}.sql", "w").write("\n".join(stmts))
    subprocess.run(["npx", "wrangler", "d1", "execute", "DB", "--env", ENV, "--remote", "--file", f"/tmp/backfill-tags-{ENV}.sql"], check=True)
    print("APPLIED")

if __name__ == "__main__":
    main()
