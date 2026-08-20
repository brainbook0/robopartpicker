#!/usr/bin/env python3
"""Retired guessed project-completeness backfill.

The old implementation filled missing DoF, build time, difficulty, compute,
tools, skills, and assembly steps with category defaults. Those values were
not source-backed. Project completeness must now be built through reviewed
metadata, BOM, artifact, and project-content waves pinned to immutable source
revisions and hashes.
"""

import sys


def main() -> int:
    print(
        "Disabled: category defaults and fabricated assembly steps are not allowed. "
        "Use the reviewed source-backed project pipelines instead.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
