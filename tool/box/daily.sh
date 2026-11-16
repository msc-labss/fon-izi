#!/usr/bin/env bash
# Private daily capture on the maintainer's machine (plan design D15).
#
# Until publishing data is approved, the snapshot runs here instead of in
# GitHub Actions. It runs from a fixed clone ($FON_IZI_RUN) and writes into a
# local git repository with no remote ($FON_IZI_PRIVATE), using the same
# archive/ layout as this repository, so publication later is a plain copy.
#
# Exit status is the snapshot's: a red day is visible in
# `systemctl --user status fon-izi-snapshot.service`. Whatever was written
# and validates is committed either way.
set -euo pipefail

RUN="${FON_IZI_RUN:-$HOME/.fon-izi/run}"
PRIVATE="${FON_IZI_PRIVATE:-$HOME/.fon-izi/private}"
NODE="${NODE:-node}"

cd "$RUN"
# The tool version this run starts with (the clone may be updated while it runs).
TOOL="$(git -C "$RUN" rev-parse --short HEAD)"
status=0
# Local trials only: FON_IZI_LIMIT=N captures the first N funds; FON_IZI_NO_WITNESS=1 sends nothing to archive.org.
"$NODE" --experimental-strip-types --no-warnings src/cli.ts snapshot --archive "$PRIVATE/archive" \
  ${FON_IZI_LIMIT:+--limit "$FON_IZI_LIMIT"} ${FON_IZI_NO_WITNESS:+--no-witness} || status=$?
"$NODE" --experimental-strip-types --no-warnings src/cli.ts validate-archive --archive "$PRIVATE/archive"

git -C "$PRIVATE" add archive
if ! git -C "$PRIVATE" diff --cached --quiet; then
  git -C "$PRIVATE" -c user.name='fon-izi box' -c user.email='box@fon-izi.invalid' \
    commit -q -m "Snapshot $(date -u +%F) (tool $TOOL)"
fi
exit "$status"
