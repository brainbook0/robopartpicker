#!/usr/bin/env python3
"""Build BOMs from a project's stored files when it has none yet.

Sources parsed, in priority order:
  1. BOM spreadsheets/CSVs  (files.kind = 'bom')
  2. Markdown tables         (README/docs: | Part | Qty | Link |)
  3. Markdown bullet lists   (2x M3 screws, * [NEMA17](url) x4)
  4. URDF <link> elements    (marked fabricated)

Merges results into project_versions.rpps_json.bom. Idempotent by (name, mpn).
Dry-run by default (pass --apply). Env via --env preview|production.
"""
import json, os, sys, time, csv, io, re, subprocess, urllib.request, urllib.error, urllib.parse

DB = "10c57e79-e34f-4643-8c4e-4f0c7968a74d"
DB_PREVIEW = "af9e3aaa-4e74-4083-8317-a642bf0e07a6"
ENV = "preview" if "--env" in sys.argv and sys.argv[sys.argv.index("--env") + 1] == "preview" else "production"
if ENV == "preview":
    DB = DB_PREVIEW
API = f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CF_ACCOUNT_ID']}/d1/database/{DB}/query"
DRY = "--apply" not in sys.argv
BASE = "https://robopartpicker-production.ludomi2502.workers.dev" if ENV == "production" else "https://robopartpicker-preview.ludomi2502.workers.dev"
MAX_ITEMS = 400

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

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "RoboPartPicker/1.0"})
    return urllib.request.urlopen(req, timeout=60).read()

# ---- CSV BOM ----
def col(header, *names):
    hl = [h.strip().lower() for h in header]
    for name in names:
        for i, h in enumerate(hl):
            if h == name.lower() or name.lower() in h:
                return i
    return None

def parse_qty(value):
    if value is None:
        return 1
    s = str(value).strip().replace(",", "")
    m = re.match(r"(\d+(?:\.\d+)?)", s)
    if not m:
        return 1
    try:
        return max(1, int(round(float(m.group(1)))))
    except ValueError:
        return 1

def parse_csv_parts(text):
    text = text.lstrip("\ufeff")
    try:
        reader = csv.reader(io.StringIO(text))
        rows = [r for r in reader if any(c.strip() for c in r)]
    except Exception:
        return []
    if len(rows) < 2:
        return []
    header = rows[0]
    name_i = col(header, "short name", "part name", "part", "name", "description", "long name", "item", "value", "component", "comment")
    mpn_i = col(header, "part #", "mpn", "manufacturer part", "part number", "mfr part", "digikey part", "sku")
    qty_i = col(header, "# req in assy", "qty", "quantity", "count", "multiplier", "pcs")
    url_i = col(header, "link", "url", "source", "buy")
    mfr_i = col(header, "manufacturer", "maker", "mfr", "vendor", "brand")
    if name_i is None and mpn_i is None:
        return []
    parts = []
    for r in rows[1:]:
        def cell(i):
            return r[i].strip() if i is not None and i < len(r) else ""
        name = cell(name_i) or cell(mpn_i)
        if not name or name.lower() in ("n/a", "none", "—", "-", ""):
            continue
        mpn = cell(mpn_i) if mpn_i != name_i else ""
        qty = parse_qty(cell(qty_i))
        parts.append({
            "name": name[:500],
            "mpn": (mpn or None) and mpn[:120] or None,
            "qty": qty,
            "supplier_url": (cell(url_i) or None) and cell(url_i)[:500] or None,
            "manufacturer": (cell(mfr_i) or None) and cell(mfr_i)[:120] or None,
        })
    return parts

# ---- Markdown tables ----
def clean_md(s):
    s = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", s)
    s = re.sub(r"\[([^\]]*)\]\(([^)]*)\)", r"\1 \2", s)
    s = re.sub(r"[*_`>#]", " ", s)
    return re.sub(r"\s+", " ", s).strip()

PART_KEYWORDS = re.compile(
    r"(screw|bolt|nut|washer|bearing|motor|servo|actuator|driver|sensor|board|arduino|esp32|raspberry|stm32|"
    r"battery|bracket|extrusion|frame|chassis|gear|gearbox|wheel|belt|pulley|spring|spacer|standoff|connector|"
    r"cable|wire|switch|relay|display|screen|camera|encoder|potentiometer|resistor|capacitor|diode|led|transistor|"
    r"magnet|hinge|coupler|shaft|mount|hub|link|joint|pump|valve|hose|fitting|tank|propeller|esc|radio|receiver|"
    r"transmitter|power supply|buck|regulator|fuse|holder|clamp|clip|fastener|nema|stepper|brushless|dc motor|"
    r"linear actuator|solenoid|endstop|limit switch|timing pulley|gt2|m3|m4|m5|m6|m8|2020|2040|v[- ]slot|"
    r"aluminum|aluminium|spool|sprocket|chain|rod|tube|plate|panel|enclosure|case|heatsink|fan|thermistor|"
    r"mcu|microcontroller|gpio|pwm|i2c|spi|uart|can bus|ethercat|encoder|imu|gyro|accelerometer|lidar|tof|"
    r"ultrasonic|proximity|switch|button|knob|joystick|gamepad|antenna|gps|gnss|modem|sim|sd card|flash)"
)

STORE_DOMAINS = re.compile(r"(amazon|aliexpress|alibaba|digikey|digi-key|mouser|farnell|newark|rs-online|rsdelivers|"
    r"banggood|ebay|adafruit|sparkfun|pololu|robotshop|hobbyking|servocity|gobilda|mc?master|mcmaster-carr|"
    r"misumi|openbuilds|bulkman|ratrig|dfrobot|seeed|waveshare|hackaday|instructables|thingiverse|printables|"
    r"creality|prusa|voron|bcn3d|ultimaker)"
)

NON_PART_RE = re.compile(r"(step|section|chapter|note|warning|tip|todo|install|clone|git |sudo|apt |pip |npm |"
    r"open source|designed|perfect for|suitable|low cost|hardware cost|born|released|education|course|"
    r"training|inference|policy|interface|homepage|guide|discussion|communication|technical guide|community|"
    r"media|github pages|documentation|license|copyright|permission|warranty|disclaimer|table of contents|"
    r"features|specifications|requirements|prerequisites|overview|introduction|getting started|usage|"
    r"contribution|contributing|changelog|roadmap|faq|troubleshoot|reference|resources|related|acknowledg)",
    re.I)

def looks_like_part(name):
    if not name or len(name) < 3 or len(name) > 160:
        return False
    if NON_PART_RE.search(name):
        return False
    return bool(PART_KEYWORDS.search(name))

def parse_markdown_tables(text):
    lines = text.splitlines()
    parts = []
    for i in range(len(lines) - 1):
        if "|" not in lines[i]:
            continue
        header = [c.strip() for c in lines[i].strip().strip("|").split("|")]
        if not any(h for h in header):
            continue
        sep = lines[i + 1]
        if not re.match(r"^\s*\|?[\s:|-]+\|?\s*$", sep) or "-" not in sep:
            continue
        name_i = col(header, "part", "item", "name", "description", "component", "title", "part name")
        qty_i = col(header, "qty", "quantity", "count", "amount", "number", "#", "pcs", "pieces")
        url_i = col(header, "url", "link", "source", "buy", "store", "where")
        mfr_i = col(header, "manufacturer", "maker", "brand", "vendor", "mfr")
        if name_i is None or (qty_i is None and url_i is None):
            continue
        valid = 0
        j = i + 2
        while j < len(lines) and "|" in lines[j] and lines[j].strip():
            cells = [c.strip() for c in lines[j].strip().strip("|").split("|")]
            def cell(k):
                return cells[k] if k is not None and k < len(cells) else ""
            name = clean_md(cell(name_i))
            if not name or name.lower() in ("n/a", "none", "item", "part", "name", "description", "total", "subtotal"):
                j += 1
                continue
            if not looks_like_part(name) and not (cell(url_i) and STORE_DOMAINS.search(cell(url_i))):
                j += 1
                continue
            parts.append({
                "name": name[:500],
                "qty": parse_qty(cell(qty_i)),
                "supplier_url": (cell(url_i) or None) and cell(url_i)[:500] or None,
                "manufacturer": (cell(mfr_i) or None) and cell(mfr_i)[:120] or None,
            })
            valid += 1
            j += 1
        if valid >= 2:
            break  # first good table wins; avoid re-parsing the same region
    return parts

# ---- Markdown bullet lists (conservative) ----
BULLET_RE = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+(.+)$")
QTY_PREFIX_RE = re.compile(r"^(?:(\d+)\s*[x×*])\s*(.+)$", re.I)
LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
PRICE_RE = re.compile(r"[$€£]\s*\d")

def parse_markdown_bullets(text):
    parts = []
    in_code = False
    for line in text.splitlines():
        if line.strip().startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        m = BULLET_RE.match(line)
        if not m:
            continue
        content = m.group(1)
        url = None
        lm = LINK_RE.search(content)
        if lm:
            name = lm.group(1)
            url = lm.group(2)
            content = content.replace(lm.group(0), name)
        qty = 1
        qm = QTY_PREFIX_RE.match(content.strip())
        if qm:
            qty = parse_qty(qm.group(1))
            content = qm.group(2)
        name = clean_md(content)
        has_qty = qm is not None
        has_store_link = bool(url and STORE_DOMAINS.search(url))
        has_price = bool(PRICE_RE.search(name))
        # Only accept as a part when it names a part AND (has qty, a store link, or a price).
        if not looks_like_part(name):
            continue
        if not (has_qty or has_store_link or has_price):
            continue
        parts.append({
            "name": name[:500],
            "qty": qty,
            "supplier_url": (url or None) and url[:500] or None,
        })
    return parts

# ---- URDF links ----
URDF_LINK_RE = re.compile(r"<link\s+name=[\"']([^\"']+)[\"']", re.I)

def parse_urdf_parts(text):
    parts = []
    for name in URDF_LINK_RE.findall(text):
        if re.match(r"(?:world|base_footprint|base_link|gazebo|odom|map|earth)", name, re.I):
            continue
        parts.append({"name": f"URDF link: {name}"[:500], "qty": 1, "fabricated": True})
    return parts

def main():
    rows = d1("""SELECT p.id, p.slug, pv.id AS version_id, pv.rpps_json,
            f.id AS file_id, f.kind AS file_kind, f.original_name AS file_name
        FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
        JOIN project_files pf ON pf.project_id = p.id JOIN files f ON f.id = pf.file_id
        WHERE p.project_kind = 'physical_design' AND p.deleted_at IS NULL
          AND f.kind IN ('bom','document','urdf') AND f.status = 'ready'
          AND json_array_length(json_extract(pv.rpps_json, '$.bom')) = 0
        ORDER BY p.slug, f.kind, f.original_name""")["results"]

    by_project = {}
    for r in rows:
        info = by_project.setdefault(r["slug"], {"id": r["id"], "version_id": r["version_id"], "rpps_json": r["rpps_json"], "files": []})
        info["files"].append({"id": r["file_id"], "kind": r["file_kind"], "name": r["file_name"]})

    print(f"projects without BOM but with files: {len(by_project)}", flush=True)
    total_items = 0
    updated_projects = 0

    for slug, info in by_project.items():
        merged = []
        seen = set()
        for f in info["files"]:
            content_url = f"{BASE}/api/v1/files/content?id={urllib.parse.quote(f['id'], safe='')}"
            try:
                text = fetch(content_url).decode("utf-8", "replace").replace("\x00", "")
            except Exception:
                continue
            parts = []
            lower = f["name"].lower()
            if f["kind"] == "bom" and lower.endswith((".csv", ".tsv")):
                parts = parse_csv_parts(text)
            elif f["kind"] == "bom" and lower.endswith((".xlsx", ".xls")):
                continue  # binary spreadsheet; not parsed as text
            elif f["kind"] == "document" and lower.endswith((".md", ".markdown", ".txt")):
                parts = parse_markdown_tables(text) + parse_markdown_bullets(text)
            elif f["kind"] == "urdf":
                parts = parse_urdf_parts(text)
            for part in parts:
                key = (part["name"].lower(), part.get("mpn") or "")
                if key in seen:
                    continue
                seen.add(key)
                merged.append(part)
                if len(merged) >= MAX_ITEMS:
                    break
            if len(merged) >= MAX_ITEMS:
                break

        if not merged:
            continue
        try:
            rpps = json.loads(info["rpps_json"])
        except Exception:
            continue
        rpps["bom"] = merged
        sql = f"UPDATE project_versions SET rpps_json = '{json.dumps(rpps, ensure_ascii=False).replace(chr(39), chr(39)+chr(39))}' WHERE id = '{info['version_id']}';"
        if not DRY:
            d1(sql)
        total_items += len(merged)
        updated_projects += 1
        print(f"{slug}: +{len(merged)} items", flush=True)

    print(f"DONE updated {updated_projects} projects with {total_items} items (dry-run={DRY})", flush=True)

if __name__ == "__main__":
    main()
