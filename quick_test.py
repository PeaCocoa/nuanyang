# -*- coding: utf-8 -*-
"""快速测试API是否恢复"""
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
time.sleep(3)

# 测试 nav
nav = page.evaluate("""
    async () => {
        const resp = await fetch("https://api.bilibili.com/x/web-interface/nav");
        const data = await resp.json();
        return {code: data.code, isLogin: data.data ? data.data.isLogin : null, msg: data.message};
    }
""")
print(f"Nav: {nav}")

# 测试 space
space = page.evaluate("""
    async () => {
        const resp = await fetch("https://api.bilibili.com/x/space/arc/search?mid=254463269&pn=1&ps=30&order=pubdate");
        const text = await resp.text();
        return text.substring(0, 200);
    }
""")
print(f"Space: {space[:150]}")

ctx.close()
p.stop()
