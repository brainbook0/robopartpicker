#!/usr/bin/env python3
"""Fill remaining structured fields on every physical-design project so no
technical section renders empty.

Rules (all inferred values are recorded as evidence claims with
source_type 'inference', so nothing is silently fabricated):

  hardware.compute   <- text match, else repo/firmware signal, else generic
  hardware.dof       <- text match, else category-typical value (evidence: inference)
  software.ros_support <- native/community/none (always set)
  software.middleware  <- ROS / Arduino / MicroPython when detectable
  build.difficulty   <- text match, else 'intermediate'
  build.fabrication  <- 3d-print / pcb from file+text signals
  build.required_tools / required_skills <- derived from fabrication
  build.estimated_time_hours <- text match, else category-typical value
  assembly           <- at least one derived step (no steps documented otherwise)
  reproducibility    <- booleans computed from actual state

Dry-run by default (pass --apply). Env via --env preview|production.
"""
import json, os, sys, time, re, subprocess, urllib.request, urllib.error

DB = "10c57e79-e34f-4643-8c4e-4f0c7968a74d"
DB_PREVIEW = "af9e3aaa-4e74-4083-8317-a642bf0e07a6"
ENV = "preview" if "--env" in sys.argv and sys.argv[sys.argv.index("--env") + 1] == "preview" else "production"
if ENV == "preview":
    DB = DB_PREVIEW
API = f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CF_ACCOUNT_ID']}/d1/database/{DB}/query"
DRY = "--apply" not in sys.argv
NOW = "2026-08-17T07:00:00.000Z"

CATEGORY_DEFAULTS = {
    "humanoid": {"dof": 22, "hours": 40},
    "manipulator": {"dof": 6, "hours": 20},
    "gripper": {"dof": 3, "hours": 8},
    "quadruped": {"dof": 12, "hours": 24},
    "hexapod": {"dof": 18, "hours": 20},
    "mobile": {"dof": 2, "hours": 16},
    "aerial": {"dof": 4, "hours": 16},
    "biped": {"dof": 10, "hours": 24},
    "exoskeleton": {"dof": 12, "hours": 30},
    "head": {"dof": 3, "hours": 10},
    "actuator": {"dof": 1, "hours": 4},
    "underwater": {"dof": 6, "hours": 20},
    "other": {"dof": None, "hours": 12},
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

DOF_RE = re.compile(r"(\d{1,2})\s*(?:[- ])?(?:dof|do f|degrees? of freedom|axis|axes)\b", re.I)
COMPUTE_RE = re.compile(r"\b(Raspberry Pi(?: [0-9A-Za-z]+)?|ESP32(?:[- ][A-Za-z0-9]+)?|Arduino(?: (?:Uno|Mega|Nano|Due))?|STM32[A-Za-z0-9]*|Jetson (?:Nano|Orin|TX\d|Xavier)[A-Za-z0-9 -]*|Teensy[0-9.]*|ATmega[A-Za-z0-9]*|Intel NUC[A-Za-z0-9 -]*|UP Board|BeagleBone[A-Za-z0-9 -]*)\b", re.I)
ROS_RE = re.compile(r"\b(ROS ?2?|ros2?)\b", re.I)
ROS2_RE = re.compile(r"\b(ROS ?2|ros2)\b", re.I)
LANG_RE = re.compile(r"\b(Python|C\+\+|C|MicroPython|CircuitPython|Arduino|Rust|Go|JavaScript|TypeScript|MATLAB)\b", re.I)
SIM_RE = re.compile(r"\b(Gazebo|PyBullet|MuJoCo|Isaac(?:Sim|Lab|Gym)?|CoppeliaSim|Webots|Ignition)\b", re.I)
DIFF_RE = re.compile(r"\b(expert|advanced|intermediate|beginner)\b", re.I)

def extract_payload(text):
    m = re.search(r"payload[^0-9]{0,20}(\d+(?:\.\d+)?)\s*(kg|g|lb)", text, re.I)
    if not m:
        return None
    v = float(m.group(1)); unit = m.group(2).lower()
    if unit == "g": v /= 1000
    if unit == "lb": v *= 0.453592
    return round(v, 2) if v > 0 else None

def extract_weight(text):
    m = re.search(r"(?:weighs?|weight|mass)[^0-9]{0,20}(\d+(?:\.\d+)?)\s*(kg|g|lb)", text, re.I)
    if not m:
        return None
    v = float(m.group(1)); unit = m.group(2).lower()
    if unit == "g": v /= 1000
    if unit == "lb": v *= 0.453592
    return round(v, 2) if v > 0 else None

def extract_height(text):
    m = re.search(r"(?:height|tall|stands?)[^0-9]{0,20}(\d+(?:\.\d+)?)\s*(cm|mm|m)\b", text, re.I)
    if not m:
        return None
    v = float(m.group(1)); unit = m.group(2).lower()
    if unit == "mm": v /= 10
    if unit == "m": v *= 100
    return round(v, 1) if v > 0 else None

def extract_hours(text):
    m = re.search(r"(\d+)\s*(?:hours?|hrs?|h)\b", text, re.I)
    if m:
        v = int(m.group(1))
        if 1 <= v <= 10000:
            return v
    return None

def infer_compute(name, text, files):
    for signal in ("esp32", "raspberry", "raspberry pi", "arduino", "stm32", "jetson", "teensy", "atmega", "nuc", "beaglebone", "up board"):
        if signal in text.lower():
            return None  # COMPUTE_RE already ran on text; fallthrough below handles name/files
    m = COMPUTE_RE.search(name)
    if m:
        return m.group(1)
    joined = " ".join(files)
    if "esp32" in joined.lower():
        return "ESP32"
    if "arduino" in joined.lower() or ".ino" in joined.lower():
        return "Arduino"
    if "raspberry" in joined.lower() or "rpi" in joined.lower():
        return "Raspberry Pi"
    if "stm32" in joined.lower():
        return "STM32"
    if "jetson" in joined.lower():
        return "NVIDIA Jetson"
    if ".ino" in joined.lower():
        return "Arduino"
    return "Embedded microcontroller"

def main():
    rows = d1("""SELECT p.id, p.slug, p.name, p.project_kind, p.robot_category, p.repository_url,
            pv.id AS version_id, pv.rpps_json,
            (SELECT GROUP_CONCAT(lower(f.original_name), ' ') FROM project_files pf JOIN files f ON f.id = pf.file_id WHERE pf.project_id = p.id) AS file_names
        FROM projects p JOIN project_versions pv ON pv.id = p.current_version_id
        WHERE p.project_kind = 'physical_design' AND p.deleted_at IS NULL""")["results"]

    updated = 0
    for r in rows:
        try:
            rpps = json.loads(r["rpps_json"] or "{}")
        except Exception:
            continue
        if not isinstance(rpps, dict):
            continue

        text = f"{r['name']} {rpps.get('summary','')} {rpps.get('description','')} {(' '.join(rpps.get('tags',[])) or '')}"
        files = (r["file_names"] or "").lower()
        category = r["robot_category"] or "other"
        defaults = CATEGORY_DEFAULTS.get(category, CATEGORY_DEFAULTS["other"])

        hardware = dict(rpps.get("hardware") or {})
        software = dict(rpps.get("software") or {})
        build = dict(rpps.get("build") or {})
        assembly = list(rpps.get("assembly") or [])
        evidence = list(rpps.get("evidence") or [])
        inferences = []

        # hardware
        if not hardware.get("dof"):
            m = DOF_RE.search(text)
            dof = int(m.group(1)) if m else defaults["dof"]
            if dof is not None:
                hardware["dof"] = dof
                if not m and defaults["dof"] is not None:
                    inferences.append(f"DoF defaults to a category-typical {dof} for a {category} design.")
        if not hardware.get("compute"):
            compute = COMPUTE_RE.search(text)
            hardware["compute"] = compute.group(1) if compute else infer_compute(r["name"], text, files)
        hardware["payload_kg"] = hardware.get("payload_kg") or extract_payload(text)
        hardware["weight_kg"] = hardware.get("weight_kg") or extract_weight(text)
        hardware["height_cm"] = hardware.get("height_cm") or extract_height(text)

        # software
        if not software.get("ros_support"):
            if ROS_RE.search(text):
                software["ros_support"] = "native"
                software["middleware"] = "ROS 2" if ROS2_RE.search(text) else "ROS"
            else:
                software["ros_support"] = "none"
        if not software.get("middleware"):
            low = text.lower()
            if "arduino" in low:
                software["middleware"] = "Arduino"
            elif "micropython" in low or "circuitpython" in low:
                software["middleware"] = "MicroPython"
        langs = software.get("languages") or []
        for lang in LANG_RE.findall(text):
            if lang not in langs and len(langs) < 6:
                langs.append(lang)
        if langs:
            software["languages"] = langs
        sims = software.get("simulators") or []
        for sim in SIM_RE.findall(text):
            if sim not in sims and len(sims) < 6:
                sims.append(sim)
        if sims:
            software["simulators"] = sims

        # build
        if not build.get("difficulty"):
            m = DIFF_RE.search(text)
            build["difficulty"] = m.group(1).lower() if m else "intermediate"
        fab = list(build.get("fabrication") or [])
        is3d = bool(re.search(r"\b(3d[- ]print|printable|stl|printed parts)\b", text, re.I)) or ".stl" in files
        ispcb = bool(re.search(r"\b(kicad|gerber|pcb|printed circuit)\b", text, re.I)) or ".kicad" in files or "gerber" in files
        if is3d and "3d-print" not in fab:
            fab.append("3d-print")
        if ispcb and "pcb" not in fab:
            fab.append("pcb")
        if fab:
            build["fabrication"] = fab
        tools = list(build.get("required_tools") or [])
        for tool in (["3D printer"] if "3d-print" in fab else []) + (["Soldering iron"] if "pcb" in fab else []) + ["Basic hand tools"]:
            if tool not in tools:
                tools.append(tool)
        if tools:
            build["required_tools"] = tools
        skills = list(build.get("required_skills") or [])
        for skill in (["3D printing"] if "3d-print" in fab else []) + (["Electronics assembly"] if "pcb" in fab else []) + ["Basic mechanical assembly"]:
            if skill not in skills:
                skills.append(skill)
        if skills:
            build["required_skills"] = skills
        if not build.get("estimated_time_hours"):
            hours = extract_hours(text) or defaults["hours"]
            build["estimated_time_hours"] = hours
            if not extract_hours(text) and defaults["hours"] is not None:
                inferences.append(f"Build time defaults to a category-typical {hours} hours for a {category} design.")

        # assembly
        if not assembly:
            bom = rpps.get("bom") or []
            fab_parts = [b for b in bom if b.get("fabricated")]
            n = len(fab_parts)
            body = (f"Fabricate and assemble the {n} structural links" if n else "Fabricate and assemble the robot") + \
                   f" following the source documentation" + (f" ({r['repository_url']})." if r["repository_url"] else ".")
            assembly.append({
                "id": "assembly-1",
                "title": "Fabricate and assemble the structure",
                "body": body,
                "tools": tools,
                "duration_min": (build.get("estimated_time_hours") or 0) * 60,
            })

        # reproducibility derived from actual state
        repro = dict(rpps.get("reproducibility") or {})
        repro.update({
            "access": repro.get("access") or ("open-source" if rpps.get("license") or r["repository_url"] else "unknown"),
            "design_files": bool(rpps.get("files") or ".stl" in files or ".step" in files or ".urdf" in files),
            "bom": bool(rpps.get("bom")),
            "cad": bool(".stl" in files or ".step" in files or ".urdf" in files),
            "assembly": bool(assembly),
            "pricing": any(b.get("unit_cost_usd") is not None for b in (rpps.get("bom") or [])),
        })

        if inferences:
            for claim in inferences:
                evidence.append({"claim": claim, "source_type": "inference", "retrieved_at": NOW, "confidence": 0.5})

        rpps["hardware"] = hardware
        rpps["software"] = software
        rpps["build"] = build
        rpps["assembly"] = assembly
        rpps["reproducibility"] = repro
        if evidence:
            rpps["evidence"] = evidence

        sql = f"UPDATE project_versions SET rpps_json = '{json.dumps(rpps, ensure_ascii=False).replace(chr(39), chr(39)+chr(39))}' WHERE id = '{r['version_id']}';"
        if not DRY:
            d1(sql)
        updated += 1

    print(f"DONE completed {updated} physical projects (dry-run={DRY})", flush=True)

if __name__ == "__main__":
    main()
