"""临时调试脚本：检查乙未爷爷的视频数据格式，分析筛选0条的原因"""
import sys, os, json, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from playwright.sync_api import sync_playwright

AUTH_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "auth")
TARGET_UID = "492399858"  # 乙未爷爷

def main():
    with sync_playwright() as p:
        # 用临时目录，不干扰正在运行的爬虫
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=AUTH_DIR,
            headless=False,
            viewport={"width": 1280, "height": 800},
            locale="zh-CN",
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()

        captured = []

        def on_response(resp):
            if 'arc/search' in resp.url and 'wbi' in resp.url:
                try:
                    data = resp.json()
                    if data.get('code') == 0:
                        vlist = data.get('data', {}).get('list', {}).get('vlist', [])
                        captured.extend(vlist)
                except:
                    pass

        page.on('response', on_response)

        url = f"https://space.bilibili.com/{TARGET_UID}/video?pn=1&ps=30&order=pubdate"
        page.goto(url, wait_until='networkidle', timeout=60000)
        time.sleep(3)

        print(f"Captured {len(captured)} videos")
        if captured:
            # 打印前5条视频的关键字段
            for i, v in enumerate(captured[:5]):
                print(f"\n--- Video {i+1} ---")
                print(f"  bvid: {v.get('bvid', 'N/A')}")
                print(f"  title: {v.get('title', 'N/A')}")
                print(f"  length: {repr(v.get('length', 'MISSING'))}")
                print(f"  created: {v.get('created', 'N/A')}")
                print(f"  play: {v.get('play', 'N/A')}")
                print(f"  pic: {v.get('pic', 'N/A')[:50] if v.get('pic') else 'N/A'}")
                # 所有字段名
                if i == 0:
                    print(f"  ALL KEYS: {list(v.keys())}")

            # 统计 length 字段情况
            lengths = [v.get('length') for v in captured]
            empty_count = sum(1 for l in lengths if not l)
            print(f"\n=== Length field analysis ===")
            print(f"Total: {len(lengths)}")
            print(f"Empty/None: {empty_count}")
            print(f"Sample lengths: {lengths[:10]}")

            # 模拟筛选
            from crawler.worker import parse_duration, filter_and_transform
            import crawler.status as status
            settings = status.get_settings()
            print(f"\n=== Settings ===")
            print(f"duration_min: {settings.get('duration_min')}")
            print(f"duration_max: {settings.get('duration_max')}")
            print(f"pubdate_days: {settings.get('pubdate_days')}")

            # 手动模拟筛选
            duration_min = settings.get('duration_min', 60)
            duration_max = settings.get('duration_max', 3600)
            pubdate_days = settings.get('pubdate_days', 0)
            now = time.time()
            pubdate_limit = now - pubdate_days * 86400 if pubdate_days > 0 else 0

            EXCLUDE_KEYWORDS = [
                "抽奖福利", "恰饭", "广告", "推广", "赞助",
                "恐怖", "惊悚", "血腥", "暴力",
                "擦边", "色情", "低俗",
            ]

            pass_count = 0
            fail_reasons = {"duration": 0, "pubdate": 0, "keyword": 0}
            for v in captured:
                title = v.get("title", "")
                duration = parse_duration(v.get("length", 0))
                pubdate = v.get("created", 0)

                if duration < duration_min or duration > duration_max:
                    fail_reasons["duration"] += 1
                    if fail_reasons["duration"] <= 3:
                        print(f"  [DURATION FAIL] title={title[:30]} length={v.get('length')} parsed={duration}")
                    continue
                if pubdate_limit > 0 and pubdate < pubdate_limit:
                    fail_reasons["pubdate"] += 1
                    continue
                matched_kw = next((kw for kw in EXCLUDE_KEYWORDS if kw in title), None)
                if matched_kw:
                    fail_reasons["keyword"] += 1
                    print(f"  [KEYWORD FAIL] title={title[:30]} keyword={matched_kw}")
                    continue
                pass_count += 1

            print(f"\n=== Filter results ===")
            print(f"Passed: {pass_count}/{len(captured)}")
            print(f"Failed - duration: {fail_reasons['duration']}")
            print(f"Failed - pubdate: {fail_reasons['pubdate']}")
            print(f"Failed - keyword: {fail_reasons['keyword']}")

        ctx.close()

if __name__ == "__main__":
    main()
