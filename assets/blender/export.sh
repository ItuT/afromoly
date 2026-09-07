#!/usr/bin/env bash
# Rebuild every Afromoly 3D asset and export it into the web client.
#
#   ./export.sh              build everything
#   ./export.sh token-coin   build one asset
#
# Set BLENDER to override how Blender is found.
set -euo pipefail

BLENDER="${BLENDER:-}"
if [ -z "$BLENDER" ]; then
  for candidate in \
    "$(command -v blender || true)" \
    "/Applications/Blender.app/Contents/MacOS/Blender" \
    "/usr/bin/blender"; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then BLENDER="$candidate"; break; fi
  done
fi

if [ -z "$BLENDER" ]; then
  echo "Blender not found. Install it, or set BLENDER to its executable." >&2
  exit 1
fi

cd "$(dirname "$0")"
ARGS=(--glb ../../apps/web/public/models --blend .)
if [ $# -gt 0 ]; then ARGS+=(--only "$1"); fi

"$BLENDER" --background --factory-startup --python build_models.py -- "${ARGS[@]}"
