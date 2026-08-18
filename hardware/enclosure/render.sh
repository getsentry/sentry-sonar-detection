#!/usr/bin/env bash
# Regenerate the enclosure STLs and the preview image from sensor-node-box.scad.
# Reproducible build for the Sentry Sonar sensor-node case. See README.md.
#
#   ./render.sh
#
# Requires OpenSCAD on PATH (`brew install --cask openscad`, tested with 2021.01).
# The preview's pure-white background is an optional post-step that needs Python
# with Pillow; if unavailable the render still succeeds with OpenSCAD's default
# near-white (#f8f8f8) background and a note is printed.

set -euo pipefail
cd "$(dirname "$0")"

SCAD=sensor-node-box.scad
CS=Tomorrow                       # blue body / orange interior, light background
IMG=1000,750
CAM=32,39,12,60,0,215,320       # look-at x,y,z + rot x,y,z + distance (shows body + lid)

echo "==> STL: body"
openscad -D 'part="body"' -o sensor-node-box-body.stl "$SCAD"
echo "==> STL: lid"
openscad -D 'part="lid"'  -o sensor-node-box-lid.stl  "$SCAD"

echo "==> preview.png"
openscad -D 'part="all"' --colorscheme="$CS" --imgsize="$IMG" --camera="$CAM" \
    -o preview.png "$SCAD"

# OpenSCAD has no pure-white built-in scheme and the app bundle is SIP-locked, so
# flood the flat near-white field (#f8f8f8) to #ffffff. Pillow only; skipped if
# absent (the render is already effectively white).
if python3 -c 'import PIL' 2>/dev/null; then
    echo "==> whitening background"
    python3 - <<'PY'
from PIL import Image
im = Image.open('preview.png').convert('RGB'); px = im.load(); w, h = im.size
for y in range(h):
    for x in range(w):
        r, g, b = px[x, y]
        if min(r, g, b) >= 235 and (max(r, g, b) - min(r, g, b)) <= 6:
            px[x, y] = (255, 255, 255)
im.save('preview.png')
PY
else
    echo "note: Pillow not found — preview kept on OpenSCAD's #f8f8f8 background."
    echo "      For pure white: python3 -m venv /tmp/v && /tmp/v/bin/pip install Pillow,"
    echo "      then re-run with that interpreter on PATH."
fi

echo "done."
