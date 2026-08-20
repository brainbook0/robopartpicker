#!/usr/bin/env python3
"""Retired unsafe AI BOM backfill.

The old implementation asked a model to invent a parts list from a README
excerpt and wrote it into production with only an inference label. That does
not satisfy RoboPartPicker's source-backed catalog standard and could consume
paid model quota. Reviewed BOM waves must instead pin the exact source file,
revision, hash, and line-level transformation.
"""

import sys


def main() -> int:
    print(
        "Disabled: unverified AI-generated BOMs are not allowed. "
        "Use the reviewed BOM wave pipeline with immutable source evidence.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
