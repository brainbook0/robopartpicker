#!/usr/bin/env python3
"""Retired guessed project-cost backfill.

The old implementation assigned category-typical prices and presented them as
estimates. RoboPartPicker now accepts only observed supplier pricing, explicit
source costs, or clearly unavailable pricing states.
"""

import sys


def main() -> int:
    print(
        "Disabled: category-typical project costs are not allowed. "
        "Use source-backed supplier or project cost evidence instead.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
