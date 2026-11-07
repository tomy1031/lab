#!/bin/sh
# site/publish.sh — build the site and force-push it as a single commit to the gh-pages branch.
# GitHub Pages serves that branch (Settings → Pages → Deploy from a branch → gh-pages / root).
# Uses this repository's own git credentials, so it works both locally and in GitHub Actions.
set -eu
cd "$(git rev-parse --show-toplevel)"
node site/build.mjs .site
INDEX="$(mktemp)"
trap 'rm -f "$INDEX"' EXIT
rm -f "$INDEX"
GIT_INDEX_FILE="$INDEX" git --work-tree=.site add -A .
TREE="$(GIT_INDEX_FILE="$INDEX" git write-tree)"
COMMIT="$(git commit-tree "$TREE" -m "Publish lab site from $(git rev-parse --short HEAD)")"
git push -f origin "$COMMIT:refs/heads/gh-pages"
echo "published $COMMIT to gh-pages"
