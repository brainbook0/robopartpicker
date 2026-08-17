#!/usr/bin/env python3
"""Re-categorize DigiKey-crawled components whose `category` field is either
'uncategorized' or garbage (a manufacturer + part number string). Category is
inferred from the product name/summary with a keyword map.

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

CATEGORY_KEYWORDS = [
    ("connector", "connector"), ("header", "connector"), ("socket", "connector"), ("receptacle", "connector"),
    ("plug", "connector"), ("jack", "connector"), ("terminal", "connector"), ("contact", "connector"),
    ("resistor", "resistor"), ("potentiometer", "resistor"), ("trimmer", "resistor"),
    ("capacitor", "capacitor"), ("ceramic", "capacitor"), ("tantalum", "capacitor"),
    ("inductor", "inductor"), ("ferrite", "inductor"), ("choke", "inductor"), ("bead", "inductor"),
    ("diode", "diode"), ("rectifier", "diode"), ("zener", "diode"), ("schottky", "diode"),
    ("transistor", "transistor"), ("mosfet", "transistor"), ("fet", "transistor"), ("igbt", "transistor"),
    ("integrated circuit", "ic"), ("microcontroller", "ic"), ("mcu", "ic"), ("processor", "ic"),
    ("op amp", "ic"), ("amplifier", "ic"), ("regulator", "ic"), ("converter", "ic"), ("driver ic", "ic"),
    ("logic", "ic"), ("memory", "ic"), ("flash", "ic"), ("fpga", "ic"), ("adc", "ic"), ("dac", "ic"),
    ("transceiver", "ic"), ("interface", "ic"), ("clock", "ic"), ("timer", "ic"), ("ic ", "ic"),
    ("sensor", "sensor"), ("accelerometer", "sensor"), ("gyro", "sensor"), ("temperature", "sensor"),
    ("humidity", "sensor"), ("pressure", "sensor"), ("proximity", "sensor"), ("hall effect", "sensor"),
    ("switch", "switch"), ("relay", "switch"), ("pushbutton", "switch"), ("tactile", "switch"),
    ("fuse", "fuse"), ("circuit breaker", "fuse"), ("ptc", "fuse"),
    ("led", "led"), ("display", "display"), ("lcd", "display"), ("oled", "display"), ("tft", "display"),
    ("crystal", "crystal"), ("oscillator", "crystal"), ("resonator", "crystal"),
    ("cable", "cable"), ("wire", "cable"), ("cord", "cable"), ("harness", "cable"),
    ("battery", "battery"), ("cell", "battery"),
    ("motor", "actuator"), ("servo", "actuator"), ("actuator", "actuator"), ("solenoid", "actuator"),
    ("transformer", "transformer"), ("coil", "inductor"),
    ("heatsink", "thermal"), ("heat sink", "thermal"), ("fan", "thermal"),
    ("antenna", "antenna"), ("gps", "module"), ("wi-fi", "module"), ("wifi", "module"),
    ("bluetooth", "module"), ("module", "module"), ("shield", "module"), ("board", "module"),
    ("audio", "audio"), ("speaker", "audio"), ("microphone", "audio"), ("buzzer", "audio"),
]

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

def q(v):
    return "'" + str(v).replace("'", "''") + "'"

def infer_category(name, summary):
    text = f"{name or ''} {summary or ''}".lower()
    for kw, cat in CATEGORY_KEYWORDS:
        if kw in text:
            return cat
    return "electronics"

def main():
    # Garbage category = not one of the clean vocab, i.e. it carries a part-number-ish string.
    rows = d1("""SELECT id, name, summary, category FROM components
        WHERE deleted_at IS NULL AND (category = 'uncategorized' OR category LIKE '% %' OR length(category) > 24)""")["results"]
    print(f"components to re-categorize: {len(rows)}", flush=True)

    updates = []
    for r in rows:
        cat = infer_category(r["name"], r["summary"])
        if cat and cat != r["category"]:
            updates.append((r["id"], cat))
    print(f"would update {len(updates)} components", flush=True)

    if DRY:
        counts = {}
        for _, cat in updates:
            counts[cat] = counts.get(cat, 0) + 1
        print("CATEGORY_COUNTS", json.dumps(counts))
        return

    for i in range(0, len(updates), 60):
        batch = updates[i:i+60]
        sql = "\n".join(f"UPDATE components SET category = {q(cat)} WHERE id = {q(cid)};" for cid, cat in batch)
        d1(sql)
        print(f"applied {min(i+60, len(updates))}/{len(updates)}", flush=True)
    print("DONE", flush=True)

if __name__ == "__main__":
    main()
