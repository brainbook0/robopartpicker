#!/usr/bin/env bash
# Cut a semver release: bump VERSION, tag the current tree, push, and create a GitHub release.
# Usage: scripts/release.sh v0.7.0 [release-notes-file]
# The VERSION file and CHANGELOG.md must already be updated before running.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="${1:?usage: scripts/release.sh v0.7.0 [release-notes-file]}"
NOTES="${2:-}"
if [[ "$VERSION" != v* ]]; then VERSION="v$VERSION"; fi
CURRENT="$(cat VERSION | tr -d '[:space:]')"
if [[ "$CURRENT" != "$VERSION" && "$CURRENT" != "${VERSION#v}" ]]; then
  echo "VERSION file ($CURRENT) does not match $VERSION; update it first." >&2
  exit 1
fi
# keep package.json in sync
if command -v node >/dev/null; then
  node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));p.version='${VERSION#v}';fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"
  git add package.json
fi
git add VERSION CHANGELOG.md
git commit -m "chore(version): $VERSION" || true
git tag "$VERSION"
git push origin master --follow-tags
if command -v gh >/dev/null; then
  if [[ -n "$NOTES" ]]; then gh release create "$VERSION" --title "$VERSION" --notes-file "$NOTES";
  else gh release create "$VERSION" --title "$VERSION"; fi
  echo "Released $VERSION on GitHub."
else
  echo "Tag $VERSION pushed. Create the GitHub release manually or install gh."
fi
