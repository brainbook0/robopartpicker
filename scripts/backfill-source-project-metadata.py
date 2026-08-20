#!/usr/bin/env python3
"""Backfill remaining physical-project summary, description, and license fields from GitHub.

No guessed licenses. License is copied only from GitHub repository metadata when
GitHub reports a concrete SPDX id that is not NOASSERTION. Summary and
description come from GitHub description/README text. Dry-run by default.
"""
import base64, json, os, re, subprocess, sys, time, urllib.error, urllib.request

DB = "10c57e79-e34f-4643-8c4e-4f0c7968a74d"
DB_PREVIEW = "af9e3aaa-4e74-4083-8317-a642bf0e07a6"
ENV = "preview" if "--env" in sys.argv and sys.argv[sys.argv.index("--env") + 1] == "preview" else "production"
if ENV == "preview":
    DB = DB_PREVIEW
DRY = "--apply" not in sys.argv

def load_creds():
    out = subprocess.run(["bash", "-c", "source /root/.cloudflare/credentials && env"], stdout=subprocess.PIPE, check=True).stdout.decode()
    env = {}
    for line in out.splitlines():
        if "=" in line:
            k, _, v = line.partition("=")
            env[k] = v
    return env

CREDS = load_creds()
os.environ.setdefault("CF_ACCOUNT_ID", CREDS["CF_ACCOUNT_ID"])
os.environ.setdefault("CF_API_TOKEN", CREDS["CF_API_TOKEN"])
API = f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CF_ACCOUNT_ID']}/d1/database/{DB}/query"

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

def q(v):
    return "'" + str(v).replace("'", "''") + "'"

def gh_json(path):
    out = subprocess.run(["gh", "api", path], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if out.returncode != 0 or not out.stdout:
        return None
    try:
        return json.loads(out.stdout.decode())
    except Exception:
        return None

def repo_owner_name(url):
    m = re.match(r"https://github\.com/([^/]+)/([^/]+?)(?:\.git)?/?$", url or "")
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

def first_sentence(text):
    text = clean_markdown(text)
    if len(text) <= 280:
        return text
    m = re.search(r"^(.{40,260}?[.!?])\s", text)
    return (m.group(1) if m else text[:277] + "...").strip()

def main():
    rows = d1("""SELECT p.id, p.slug, p.repository_url, p.summary, p.description, p.license_spdx, pv.id AS version_id, pv.rpps_json
        FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
        WHERE p.project_kind = 'physical_design' AND p.deleted_at IS NULL
          AND p.repository_url LIKE 'https://github.com/%'
          AND ((p.summary IS NULL OR length(trim(p.summary)) < 20)
            OR (p.description IS NULL OR length(trim(p.description)) < 80)
            OR (p.license_spdx IS NULL OR trim(p.license_spdx) = ''))
        ORDER BY p.github_stars DESC""")["results"]
    stmts = []
    changes = []
    for row in rows:
        ro = repo_owner_name(row["repository_url"])
        if not ro:
            continue
        owner, repo = ro
        meta = gh_json(f"repos/{owner}/{repo}") or {}
        readme = gh_json(f"repos/{owner}/{repo}/readme") or {}
        readme_text = ""
        content = readme.get("content") if isinstance(readme, dict) else None
        if isinstance(content, str):
            try:
                readme_text = clean_markdown(base64.b64decode(content).decode("utf-8", "replace"))
            except Exception:
                readme_text = ""
        try:
            rpps = json.loads(row["rpps_json"] or "{}")
        except Exception:
            rpps = {}
        if not isinstance(rpps, dict):
            rpps = {}
        updates = []
        fields = []
        summary = meta.get("description") if isinstance(meta.get("description"), str) else rpps.get("summary")
        summary = first_sentence(summary or readme_text)
        if (not row["summary"] or len(str(row["summary"]).strip()) < 20) and summary and len(summary) >= 20:
            updates.append(f"summary = {q(summary[:280])}")
            rpps["summary"] = summary[:500]
            fields.append("summary")
        description = readme_text or (meta.get("description") if isinstance(meta.get("description"), str) else "")
        if (not row["description"] or len(str(row["description"]).strip()) < 80) and len(description) >= 80:
            updates.append(f"description = {q(description[:8000])}")
            rpps["description"] = description[:40000]
            fields.append("description")
        license_obj = meta.get("license") if isinstance(meta.get("license"), dict) else {}
        spdx = license_obj.get("spdx_id") if isinstance(license_obj.get("spdx_id"), str) else None
        if spdx and spdx != "NOASSERTION" and not row["license_spdx"]:
            updates.append(f"license_spdx = {q(spdx)}")
            rpps["license"] = spdx
            fields.append("license_spdx")
        if not updates:
            continue
        updates.append(f"updated_at = {q(time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))}")
        stmts.append(f"UPDATE projects SET {', '.join(updates)} WHERE id = {q(row['id'])};")
        stmts.append(f"UPDATE project_versions SET rpps_json = {q(json.dumps(rpps, ensure_ascii=False))} WHERE id = {q(row['version_id'])};")
        changes.append({"slug": row["slug"], "fields": fields})
    print(json.dumps({"env": ENV, "dryRun": DRY, "projectsChanged": len(changes), "fieldUpdates": sum(len(c['fields']) for c in changes), "sample": changes[:40]}, indent=2))
    path = f"/tmp/backfill-source-metadata-{ENV}.sql"
    if stmts:
        open(path, "w").write("\n".join(stmts) + "\n")
    if DRY or not stmts:
        print(f"DRY RUN ONLY. SQL: {path}" if stmts else "nothing to write")
        return
    subprocess.run(["npx", "wrangler", "d1", "execute", "DB", "--env", ENV, "--remote", "--file", path], check=True)
    print("APPLIED")

if __name__ == "__main__":
    main()
