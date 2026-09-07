#!/usr/bin/env bash
# Render a still of every asset into previews/, then stitch a contact sheet.
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
"$BLENDER" --background --python preview.py -- . previews

python3 - <<'PY'
import os
try:
    from PIL import Image
except ImportError:
    raise SystemExit("Install Pillow to stitch the contact sheet: pip install Pillow")

names = ["board","quantum-van","terminal-depot","token-quantum","token-coin",
         "token-robot","token-vest","token-megaphone","token-sneaker",
         "prop-robot","prop-bulb","prop-tap","prop-cards-kombi",
         "prop-cards-citywatch","prop-coins","prop-gantry"]
paths = [os.path.join("previews", f"{n}.png") for n in names]
images = [Image.open(p).convert("RGB") for p in paths if os.path.exists(p)]
if not images:
    raise SystemExit("No previews to stitch.")
import math
w, h = images[0].size
cols = 4
rows = math.ceil(len(images) / cols)
sheet = Image.new("RGB", (w * cols, h * rows), (18, 17, 13))
for i, im in enumerate(images):
    sheet.paste(im, ((i % cols) * w, (i // cols) * h))
sheet = sheet.resize((sheet.width // 2, sheet.height // 2), Image.LANCZOS)
sheet.save(os.path.join("previews", "contact.png"), optimize=True)
print("wrote previews/contact.png")
PY
