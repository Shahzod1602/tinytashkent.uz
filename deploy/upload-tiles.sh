#!/bin/bash
# Upload a baked tile folder to the server's shared storage. Run after tools/bake.py
# whenever the tile version in public/data/map.json changes, BEFORE pushing that change.
#   deploy/upload-tiles.sh [tiles-v11] [root@host]
set -euo pipefail
cd "$(dirname "$0")/.."
TILES="${1:-$(grep -o '"baseUrl":"[^"]*"' public/data/map.json | sed 's/.*\///; s/"//')}"
HOST="${2:-${TINY_TASHKENT_HOST:?set TINY_TASHKENT_HOST=root@server or pass it as the second argument}}"
[[ -f "public/data/$TILES/overview.webp" ]] || { echo "public/data/$TILES is not baked" >&2; exit 1; }
rsync -a --delete --info=progress2 --exclude size.json "public/data/$TILES/" "$HOST:/var/www/tiny-tashkent/shared/$TILES/"
echo "uploaded $TILES"
