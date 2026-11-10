#!/usr/bin/env python3
"""Bake map tiles with the site's renderer in headless Chrome.
  bake.py region X Y W H OUT.png [ratio] [json-options]   one-off render (world px)
  bake.py at LON LAT W H OUT.png [ratio] [json-options]   same, centred on a coordinate
  bake.py all OUT_DIR                                     every level-0 tile (resumable)
  bake.py pyramid OUT_DIR                                 levels 1..5, overview and manifest
"""
import asyncio, base64, json, math, os, subprocess, sys, tempfile, time, urllib.request
import websockets
ROOT = 'http://127.0.0.1:8766'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

class Page:
    def __init__(self, port=9777): self.port = port; self.n = 0
    async def __aenter__(self):
        self.proc = subprocess.Popen([CHROME, '--headless=new', '--enable-unsafe-swiftshader', f'--remote-debugging-port={self.port}', f'--user-data-dir={tempfile.mkdtemp()}', '--js-flags=--max-old-space-size=3072', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(60):
            try: tabs = json.load(urllib.request.urlopen(f'http://127.0.0.1:{self.port}/json')); break
            except Exception: time.sleep(.2)
        self.ws = await websockets.connect([t for t in tabs if t['type'] == 'page'][0]['webSocketDebuggerUrl'], max_size=None, ping_interval=None)
        await self.call('Runtime.enable'); await self.call('Page.enable')
        await self.call('Page.navigate', url=f'{ROOT}/tools/bake.html?v={int(time.time())}')
        for _ in range(100):
            if (await self.js('!!(window.bake&&window.bake.ready)')): break
            await asyncio.sleep(.2)
        self.info = await self.js('bake.load()')
        return self
    async def __aexit__(self, *a):
        await self.ws.close(); self.proc.terminate()
    async def call(self, method, **params):
        self.n += 1; mine = self.n
        await self.ws.send(json.dumps({'id': mine, 'method': method, 'params': params}))
        while True:
            msg = json.loads(await self.ws.recv())
            if msg.get('id') == mine:
                if 'error' in msg: raise RuntimeError(msg['error'])
                return msg['result']
            if msg.get('method') == 'Runtime.exceptionThrown': print('PAGE EXCEPTION', json.dumps(msg['params']['exceptionDetails'])[:600], file=sys.stderr)
    async def js(self, expression):
        r = await self.call('Runtime.evaluate', expression=expression, awaitPromise=True, returnByValue=True)
        if 'exceptionDetails' in r: raise RuntimeError(json.dumps(r['exceptionDetails'])[:800])
        return r['result'].get('value')
    async def render(self, x, y, w, h, options):
        r = await self.js(f'bake.render({x},{y},{w},{h},{json.dumps(options)})')
        return base64.b64decode(r.pop('image')), r

TILE, MAX_LEVEL = 1024, 5
STYLE = {'ratio': 3, 'pixel': True, 'levels': 12, 'type': 'image/webp', 'quality': 1}

def pyramid(out):
    """Zoomed-out levels are area-averaged from the pixel-art level below."""
    from PIL import Image
    meta = json.load(open(os.path.join(out, 'size.json'))); W, H = meta['width'], meta['height']
    for level in range(1, MAX_LEVEL + 1):
        span = TILE * 2 ** level; os.makedirs(f'{out}/{level}', exist_ok=True)
        for ty in range(math.ceil(H / span)):
            for tx in range(math.ceil(W / span)):
                w, h = min(span, W - tx * span), min(span, H - ty * span)
                sheet = Image.new('RGB', (math.ceil(w / 2 ** (level - 1)), math.ceil(h / 2 ** (level - 1))), '#819461')
                for dy in (0, 1):
                    for dx in (0, 1):
                        child = f'{out}/{level - 1}/{tx * 2 + dx}_{ty * 2 + dy}.webp'
                        if os.path.exists(child): sheet.paste(Image.open(child).convert('RGB'), (dx * TILE, dy * TILE))
                sheet.resize((math.ceil(w / 2 ** level), math.ceil(h / 2 ** level)), Image.BOX).save(f'{out}/{level}/{tx}_{ty}.webp', quality=90, method=6)
        print('level', level, 'done', file=sys.stderr)
    span = TILE * 2 ** MAX_LEVEL
    overview = Image.new('RGB', (math.ceil(W / 2 ** MAX_LEVEL), math.ceil(H / 2 ** MAX_LEVEL)))
    for ty in range(math.ceil(H / span)):
        for tx in range(math.ceil(W / span)): overview.paste(Image.open(f'{out}/{MAX_LEVEL}/{tx}_{ty}.webp'), (tx * TILE, ty * TILE))
    overview.save(f'{out}/overview.webp', quality=88, method=6)
    print('overview', overview.size, file=sys.stderr)

async def main():
    mode = sys.argv[1]
    if mode == 'pyramid': return pyramid(sys.argv[2])
    async with Page() as page:
        print('loaded', page.info, file=sys.stderr)
        if mode in ('region', 'at'):
            a, b, w, h = map(float, sys.argv[2:6]); out = sys.argv[6]
            ratio = float(sys.argv[7]) if len(sys.argv) > 7 else 2
            options = json.loads(sys.argv[8]) if len(sys.argv) > 8 else {}
            if mode == 'at':
                px = await page.js(f'bake.project([{a},{b}])'); a, b = px[0] - w / 2, px[1] - h / 2
            data, info = await page.render(round(a), round(b), round(w), round(h), {'ratio': ratio, **options})
            open(out, 'wb').write(data); print(info)
        if mode == 'all':
            out = sys.argv[2]; W, H = page.info['width'], page.info['height']
            os.makedirs(f'{out}/0', exist_ok=True); json.dump({'width': W, 'height': H}, open(f'{out}/size.json', 'w'))
            cols, rows = math.ceil(W / TILE), math.ceil(H / TILE); done = 0; started = time.time()
            for ty in range(rows):
                for tx in range(cols):
                    path = f'{out}/0/{tx}_{ty}.webp'
                    if os.path.exists(path): continue
                    data, info = await page.render(tx * TILE, ty * TILE, min(TILE, W - tx * TILE), min(TILE, H - ty * TILE), STYLE)
                    open(path + '.tmp', 'wb').write(data); os.replace(path + '.tmp', path); done += 1
                print(f'row {ty + 1}/{rows} tiles {done} {time.time() - started:.0f}s', file=sys.stderr, flush=True)
asyncio.run(main())
