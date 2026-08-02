import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crawler.bilibili import BiliCrawler

c = BiliCrawler(headless=True)
c.start()
print("Login:", c.is_logged_in())

# 导航到B站空间页，拦截实际发出的API请求
captured_urls = []

def on_request(req):
    if 'arc/search' in req.url:
        captured_urls.append(req.url)

c.page.on('request', on_request)

# 访问空间页，让浏览器自己发请求
c.page.goto("https://space.bilibili.com/254463269/video", wait_until="networkidle", timeout=30000)

import time
time.sleep(3)

print(f"\nCaptured {len(captured_urls)} arc/search requests:")
for url in captured_urls:
    print(f"  {url[:200]}")

c.page.remove_listener('request', on_request)
c.close()
