#!/usr/bin/env bash
# Rebuild every Afromoly sound and export it into the web client.
#
#   ./export.sh          build everything
#   ./export.sh dice     build one sound
#
# Unlike the models, this needs nothing but Python: the synth is standard
# library only.
set -euo pipefail

cd "$(dirname "$0")"
PYTHON="${PYTHON:-python3}"
ARGS=(--out ../../apps/web/public/audio)
if [ $# -gt 0 ]; then ARGS+=(--only "$1"); fi

"$PYTHON" build_sounds.py "${ARGS[@]}"
