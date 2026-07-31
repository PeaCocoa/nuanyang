# -*- coding: utf-8 -*-
"""完整登录诊断脚本"""
from playwright.sync_api import sync_playwright
import time

p = sync_playwright().start()
ctx = p.chromium.launch_persistent_context(
    user_data_dir='auth',
    headless=False,
    viewport={'width': 1280, 'height': 800},
    locale='zh-CN',
    args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-extensions','--remote-debugging-port=0','--disable-blink-features=AutomationControlled'],
    ignore_default_args=['--enable-automation'],
)
page = ctx.pages[0] if ctx.pages else ctx.new_page()

page.goto('https://passport.bilibili.com/login', wait_until='networkidle')
print('Login page loaded. Please scan QR code...')
print('Waiting for login (checking cookies every 2s)...')

for i in range(120):
    time.sleep(2)
    cookies = ctx.cookies()
    has_sess = any(c['name'] == 'SESSDATA' for c in cookies)
    if has_sess:
        print(f'[{i*2}s] SESSDATA found!')
        for c in cookies:
            if c['name'] in ('SESSDATA','bili_jct','DedeUserID','DedeUserID__ckMd5'):
                print(f'  {c["name"]}: domain={c["domain"]} httpOnly={c["httpOnly"]} secure={c["secure"]} sameSite={c["sameSite"]}')
        break
    if i % 5 == 0:
        print(f'[{i*2}s] Waiting... ({len(cookies)} cookies)')
else:
    print('Timeout: 240s')

# 登录成功后，导航到B站首页
print('Navigating to bilibili.com to settle cookies...')
page.goto('https://www.bilibili.com', wait_until='domcontentloaded')
time.sleep(5)

# 再次检查
cookies = ctx.cookies()
has_sess = any(c['name'] == 'SESSDATA' for c in cookies)
print(f'After navigation: SESSDATA present = {has_sess}')

# 测试nav
nav = page.evaluate("""
    async () => {
        const resp = await fetch("https://api.bilibili.com/x/web-interface/nav");
        const data = await resp.json();
        return {code: data.code, isLogin: data.data ? data.data.isLogin : null};
    }
""")
print(f'Nav API: {nav}')

# 测试 space API
space = page.evaluate("""
    async () => {
        const resp = await fetch("https://api.bilibili.com/x/space/arc/search?mid=254463269&pn=1&ps=30&order=pubdate");
        const text = await resp.text();
        return text.substring(0, 200);
    }
""")
print(f'Space API: {space[:150]}')

ctx.close()
p.stop()
print('Done')
