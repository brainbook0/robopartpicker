#!/usr/bin/env python3
"""Collect relative 12-month Google Trends interest in anchored five-term batches.

Requires pytrends. Every four candidate terms are queried with the same anchor,
then candidate mean interest is divided by the anchor mean. Failed/rate-limited
batches are retained as blocked records rather than assigned plausible scores.
"""
from __future__ import annotations
import argparse
import json
import random
import time
from pathlib import Path
from urllib.parse import urlencode
from pytrends.request import TrendReq

ANCHOR = "Boston Dynamics Spot robot"

def load_candidates(directory: Path) -> list[dict]:
    values: list[dict] = []
    for path in sorted(directory.glob("*.json")):
        values.extend(json.loads(path.read_text()))
    return values

def term(candidate: dict) -> str:
    return " ".join(f"{candidate['manufacturer']} {candidate['model']} robot".split())[:100]

def source_url(query: str, timeframe: str) -> str:
    return "https://trends.google.com/trends/explore?" + urlencode({"date": timeframe, "q": f"{query},{ANCHOR}"})

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default="data/commercial-catalog/candidates")
    parser.add_argument("--output", default="data/commercial-catalog/collected/search-signals.json")
    parser.add_argument("--collected-at", required=True)
    parser.add_argument("--timeframe", default="2025-08-25 2026-08-25")
    parser.add_argument("--delay", type=float, default=2.25)
    args = parser.parse_args()
    candidates = load_candidates(Path(args.dir))
    records: list[dict] = []
    client = TrendReq(hl="en-US", tz=0, timeout=(10, 40), retries=0)
    for start in range(0, len(candidates), 4):
        batch = candidates[start:start + 4]
        query_terms = [term(candidate) for candidate in batch]
        request_terms = list(dict.fromkeys([*query_terms, ANCHOR]))
        error = ""
        frame = None
        for attempt in range(1, 4):
            try:
                client.build_payload(request_terms, timeframe=args.timeframe, geo="")
                frame = client.interest_over_time()
                if frame is None or frame.empty or ANCHOR not in frame.columns:
                    raise RuntimeError("Google Trends returned no anchored timeline")
                break
            except Exception as cause:
                error = f"{type(cause).__name__}: {cause}"
                if attempt < 3:
                    time.sleep(attempt * 8)
        if frame is None or frame.empty or ANCHOR not in frame.columns:
            for candidate, query in zip(batch, query_terms):
                records.append({"candidateKey": candidate["slug"], "signal": "searchInterest", "value": None, "status": "blocked", "collectedAt": args.collected_at, "sourceUrl": source_url(query, args.timeframe), "error": error})
        else:
            values = frame.drop(columns=["isPartial"], errors="ignore").mean()
            anchor_mean = float(values.get(ANCHOR, 0))
            for candidate, query in zip(batch, query_terms):
                candidate_mean = float(values.get(query, 0))
                if query == ANCHOR:
                    value = 100.0
                elif anchor_mean > 0:
                    value = candidate_mean / anchor_mean * 100.0
                else:
                    value = None
                records.append({"candidateKey": candidate["slug"], "signal": "searchInterest", "value": value, "status": "ok" if value is not None else "missing", "collectedAt": args.collected_at, "sourceUrl": source_url(query, args.timeframe), "batchAnchorMean": anchor_mean, "candidateMean": candidate_mean})
        print(f"Google Trends {min(start + 4, len(candidates))}/{len(candidates)}", flush=True)
        time.sleep(args.delay + random.random() * 0.5)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = {"collectedAt": args.collected_at, "timeframe": args.timeframe, "anchor": ANCHOR, "methodology": "mean weekly interest divided by shared anchor mean, multiplied by 100", "records": records}
    output.write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps({"output": str(output.resolve()), "candidates": len(candidates), "ok": sum(record["status"] == "ok" for record in records), "blocked": sum(record["status"] == "blocked" for record in records), "missing": sum(record["status"] == "missing" for record in records)}))

if __name__ == "__main__":
    main()
