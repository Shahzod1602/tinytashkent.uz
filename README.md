# tiny tashkent

An isometric pixel-art map of Tashkent — https://tinytashkent.uz

Real street and building outlines from OpenStreetMap, drawn pixel by pixel, with
live time of day, weather, seasons and ambient sound. Inspired by tiny.london.

## Layout

| Path | What it is |
|---|---|
| `public/` | The site: static files, no build step |
| `public/renderer.js`, `architecture.js`, `facades.js` | How the city is drawn (used by the tile bakery) |
| `public/fx.js`, `atmosphere.js`, `sound.js` | Time of day, weather, seasons and sound, applied in the browser |
| `public/data/` | OSM extract, search catalogue, districts, tile manifest (`map.json`) |
| `server/` | Visitor counter (Node, SQLite) |
| `tools/bake.py`, `tools/bake.html` | Tile bakery: renders the map in headless Chrome |
| `deploy/`, `.github/workflows/deploy.yml` | Deployment |

Tiles (`public/data/tiles-v*/`, ~180 MB) are generated, not committed.

## Run locally

```sh
python3 -m http.server 8765 --directory public    # the site, http://127.0.0.1:8765
```

## Re-bake the map

Needs Google Chrome and `pip install websockets pillow`.

```sh
python3 -m http.server 8766 &                              # the bakery page is served from the repo root
python3 tools/bake.py all public/data/tiles-v12            # every level-0 tile (resumable)
python3 tools/bake.py pyramid public/data/tiles-v12        # zoom levels + overview
python3 tools/bake.py at 69.28 41.311 720 405 out.png 3 '{"pixel":true,"levels":12,"art":1.5}'   # preview one spot
```

If a re-bake changes how tiles look, bump the folder name (`tiles-v13`) and the
`version`, `baseUrl` and `overview` fields in `public/data/map.json`, so browsers
do not mix old cached tiles with new ones.

## Deploy

Every push to `main` is checked and deployed by GitHub Actions. The server keeps
releases under `/var/www/tiny-tashkent/releases/` and switches the `current`
symlink; a failed health check rolls back automatically.

Tiles are uploaded separately, **before** pushing a `map.json` that points at a new folder:

```sh
TINY_TASHKENT_HOST=root@<server> deploy/upload-tiles.sh
```

The deploy refuses to go live if the tile folder named in `map.json` is not on the server.

Manual rollback on the server: `ln -sfn /var/www/tiny-tashkent/releases/<older> /var/www/tiny-tashkent/current && systemctl restart tiny-tashkent`.

## Data and licence

Map data © OpenStreetMap contributors, ODbL. Building heights that OSM does not
record are estimated; facades, trees and colours are an artistic interpretation.
Weather from Open-Meteo.
