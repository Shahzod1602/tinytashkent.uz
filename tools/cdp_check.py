#!/usr/bin/env python3
"""Drive headless Chrome over CDP: open the map, optionally click, screenshot, report console errors.
usage: cdp_check.py OUT.png URL WIDTH HEIGHT [mobile] [click=SELECTOR ...] [eval=JS]"""
import asyncio, base64, json, subprocess, sys, tempfile, time, urllib.request
import websockets
out, url, width, height = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
extra = sys.argv[5:]
mobile = 'mobile' in extra
port = 9300 + (hash(out) % 500)
chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
proc = subprocess.Popen([chrome, '--headless=new', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', '--mute-audio', f'--remote-debugging-port={port}', f'--user-data-dir={tempfile.mkdtemp()}', f'--window-size={width},{height}', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
async def main():
    for _ in range(50):
        try:
            tabs = json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json')); break
        except Exception: time.sleep(.2)
    ws_url = [t for t in tabs if t['type'] == 'page'][0]['webSocketDebuggerUrl']
    async with websockets.connect(ws_url, max_size=None) as ws:
        n = 0; logs = []
        async def call(method, **params):
            nonlocal n; n += 1; mine = n
            await ws.send(json.dumps({'id': mine, 'method': method, 'params': params}))
            while True:
                msg = json.loads(await ws.recv())
                if msg.get('id') == mine: return msg.get('result', msg)
                if msg.get('method') == 'Runtime.consoleAPICalled' and msg['params']['type'] in ('error', 'warning', 'info'):
                    logs.append(msg['params']['type'] + ': ' + ' '.join(str(a.get('value', a.get('description', ''))) for a in msg['params']['args']))
                if msg.get('method') == 'Runtime.exceptionThrown': logs.append('EXCEPTION: ' + json.dumps(msg['params']['exceptionDetails'].get('exception', {}).get('description', msg['params']['exceptionDetails'].get('text')))[:400])
        await call('Runtime.enable'); await call('Page.enable')
        await call('Emulation.setDeviceMetricsOverride', width=width, height=height, deviceScaleFactor=2 if mobile else 1, mobile=mobile)
        await call('Page.navigate', url=url)
        await asyncio.sleep(6)
        for item in extra:
            if item.startswith('click='):
                await call('Runtime.evaluate', expression=f"document.querySelector({json.dumps(item[6:])}).click()"); await asyncio.sleep(1.2)
            if item.startswith('eval='):
                r = await call('Runtime.evaluate', expression=item[5:], awaitPromise=True, returnByValue=True); print('eval →', json.dumps(r.get('result', {}).get('value'))[:600]); await asyncio.sleep(1)
        shot = await call('Page.captureScreenshot', format='png')
        open(out, 'wb').write(base64.b64decode(shot['data']))
        for line in logs: print(line[:300])
asyncio.run(main()); proc.terminate()
