import sys, os, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crawler.bilibili import BiliCrawler

c = BiliCrawler(headless=True)
c.start()
print("Login:", c.is_logged_in())

# 测试1：用networkidle
captured = []
def on_resp(resp):
    if 'arc/search' in resp.url:
        try:
            data = resp.json()
            print(f"  [CAPTURED] code={data.get('code')} url={resp.url[:120]}")
            if data.get('code') == 0 and data.get('data', {}).get('list', {}).get('vlist'):
                captured.extend(data['data']['list']['vlist'])
        except:
            print(f"  [CAPTURED] parse error url={resp.url[:120]}")

c.page.on('response', on_resp)

print("Navigating with networkidle...")
try:
    c.page.goto("https://space.bilibili.com/254463269/video?pn=1&ps=30&order=pubdate", wait_until='networkidle', timeout=60000)
    print("Page loaded (networkidle)")
except Exception as e:
    print(f"Page load error: {e}")

time.sleep(5)
print(f"\nTotal captured: {len(captured)} videos")
if captured:
    print(f"First: {captured[0].get('title','')[:50]}")

c.page.remove_listener('response', on_resp)
c.close()
