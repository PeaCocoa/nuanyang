# -*- coding: utf-8 -*-
"""诊断页面拦截"""
from playwright.sync_api import sync_playwright
import time

p = sync_playwright().start()
ctx = p.chromium.launch_persistent_context(
    user_data_dir='auth',
    headless=False,
    viewport={'width': 1280, 'height': 800},
    locale='zh-CN',
    args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-extensions','--remote-debugging-port=0'],
)
page = ctx.pages[0] if ctx.pages else ctx.new_page()

page.goto('https://www.bilibili.com', wait_until='domcontentloaded')
time.sleep(2)

captured = []
def on_response(resp):
    url = resp.url
    if 'arc/search' in url or 'wbi/arc' in url:
        try:
            data = resp.json()
            vlist = data.get('data', {}).get('list', {}).get('vlist', [])
            captured.append({
                'url': url[:120],
                'code': data.get('code'),
                'vlist_len': len(vlist),
            })
        except:
            captured.append({'url': url[:120], 'error': True})

page.on('response', on_response)

page.goto('https://space.bilibili.com/254463269/video?pn=1&ps=30&order=pubdate', wait_until='networkidle')
time.sleep(5)

print(f'Final URL: {page.url}')
print(f'Intercepted: {len(captured)}')
for c in captured:
    print(f'  {c}')

body_text = page.evaluate('() => document.body.innerText.substring(0, 500)')
print(f'Body: {body_text[:300]}')

ctx.close()
p.stop()
