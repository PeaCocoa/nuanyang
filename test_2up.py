# -*- coding: utf-8 -*-
"""快速测试：只爬2个UP，验证API是否恢复"""
import json, os, time, re, random

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys_path = os.path.dirname(__file__)
import sys
sys.path.insert(0, BASE_DIR)

from crawler.bilibili import BiliCrawler
from crawler.config import load_upmasters, SEARCH_PAGES, SEARCH_PAGE_DELAY
import crawler.status as status

def format_duration(seconds):
    if seconds < 3600:
        return f"{seconds // 60}:{seconds % 60:02d}"
    return f"{seconds // 3600}:{(seconds % 3600) // 60:02d}:{seconds % 60:02d}"

def process_cover_url(pic):
    if not pic:
        return ""
    if pic.startswith("//"):
        pic = "https:" + pic
    if "?" not in pic and "@" not in pic:
        pic = pic + "@672w_378h_1c.jpg"
    return pic

# 只测2个UP
all_ups = load_upmasters()
test_ups = all_ups[:2]
print(f"测试 {len(test_ups)} 个UP: {[u['name'] for u in test_ups]}")

status.init(len(test_ups), test_ups)

crawler = BiliCrawler(headless=False)
print("[INFO] 启动浏览器...")
status.set_login_required()
crawler.start()
status.set_login_done()

print("[INFO] 验证API连通性...")
test_results = crawler.get_up_videos("254463269", page=1)
if not test_results:
    print("[ERROR] API无返回，仍被风控")
    crawler.close()
    status.finish("error")
    exit(1)
print(f"[INFO] API正常，测试获取到 {len(test_results)} 条视频")

all_videos = []
for i, up in enumerate(test_ups):
    name = up["name"]
    uid = up["uid"]
    categories = up.get("categories", [])
    print(f"\n[{i+1}/{len(test_ups)}] 抓取: {name} (UID: {uid})")

    all_results = []
    for page in range(1, SEARCH_PAGES + 1):
        results = crawler.get_up_videos(uid, page=page)
        if not results:
            break
        all_results.extend(results)
        print(f"  第{page}页: {len(results)}条视频")
        if page < SEARCH_PAGES:
            time.sleep(SEARCH_PAGE_DELAY + random.uniform(0, 3))

    # 去重
    seen = set()
    unique = []
    for v in all_results:
        if v["bvid"] not in seen:
            seen.add(v["bvid"])
            unique.append(v)

    # 筛选
    for v in unique:
        title = re.sub(r"<[^>]+>", "", v.get("title", ""))
        duration = v.get("duration", 0)
        pubdate = v.get("pubdate", 0)
        bvid = v.get("bvid", "")
        all_videos.append({
            "bvid": bvid,
            "title": title,
            "cover": process_cover_url(v.get("pic", "")),
            "duration": duration,
            "duration_text": format_duration(duration),
            "pubdate": pubdate,
            "play": v.get("play", 0),
            "like": 0,
            "up_name": name,
            "categories": categories,
            "url": f"https://www.bilibili.com/video/{bvid}",
            "iframe_url": f"//player.bilibili.com/player.html?bvid={bvid}&high_quality=1&danmaku=0",
        })
    print(f"  通过筛选: {len(unique)} 条, 累计: {len(all_videos)} 条")
    status.update_up(i, "done", videos=len(unique))
    status.add_videos(len(unique))

crawler.close()

# 写入文件
output = {
    "version": 4,
    "updated": time.strftime("%Y-%m-%d %H:%M:%S"),
    "total": len(all_videos),
    "source": "bilibili_space_api_via_playwright",
    "videos": all_videos,
}

videos_file = os.path.join(BASE_DIR, "data", "videos.json")
with open(videos_file, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

web_data_dir = os.path.join(BASE_DIR, "web", "data")
os.makedirs(web_data_dir, exist_ok=True)
import shutil
shutil.copy2(videos_file, os.path.join(web_data_dir, "videos.json"))

print(f"\n{'='*50}")
print(f"完成: 共 {len(all_videos)} 条视频")
print(f"{'='*50}")
status.finish("done")
