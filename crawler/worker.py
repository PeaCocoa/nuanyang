"""
暖阳爬虫 Worker — 轻量版（requests直接调API，不开浏览器）
"""

import json
import time
import sys
import os
import re
import subprocess

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from crawler.config import load_upmasters, VIDEOS_FILE, MAX_VIDEOS_TOTAL, SEARCH_PAGES, REQUEST_DELAY, SEARCH_PAGE_DELAY
from crawler.bilibili import BiliAPI
import crawler.status as status

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_DIR = os.path.join(BASE_DIR, "web")

# =====================
# 工具函数
# =====================

def log(msg, level="info"):
    print(msg, flush=True)
    status.log(msg, level)

def format_duration(seconds):
    if seconds >= 3600:
        h, remainder = divmod(seconds, 3600)
        m, s = divmod(remainder, 60)
        return f"{h}:{m:02d}:{s:02d}"
    m, s = divmod(seconds, 60)
    return f"{m:02d}:{s:02d}"

def process_cover_url(pic):
    if not pic:
        return ""
    url = pic.replace("http://", "https://")
    if not re.search(r'\.(jpg|png|webp)$', url):
        url = url + ".jpg"
    if "@672w_378h" not in url:
        url = url + "@672w_378h_1c.jpg"
    return url

def get_crawl_upmasters():
    all_ups = load_upmasters()
    settings = status.get_settings()

    if settings.get("test_mode"):
        selected = all_ups[:2]
        log(f"[测试模式] 只爬取 {len(selected)} 位UP主: {', '.join(u['name'] for u in selected)}")
        return selected

    selected_names = settings.get("selected_ups", [])
    if selected_names:
        selected = [u for u in all_ups if u["name"] in selected_names]
        if selected:
            log(f"按设置筛选: 共 {len(selected)} 位UP主")
            return selected

    return all_ups

# =====================
# 抓取逻辑
# =====================

def fetch_up_videos(api, uid, up_name):
    """通过UID直接拉取UP主视频列表"""
    all_results = []
    for page in range(1, SEARCH_PAGES + 1):
        results = api.get_up_videos(uid, page=page)
        if not results:
            break
        all_results.extend(results)
        log(f"  第{page}页: {len(results)}条视频")
        if page < SEARCH_PAGES:
            time.sleep(SEARCH_PAGE_DELAY + random.uniform(0, 2))

    seen = set()
    unique = []
    for v in all_results:
        bvid = v.get("bvid", "")
        if bvid and bvid not in seen:
            seen.add(bvid)
            unique.append(v)
    return unique

def fetch_video_details(api, bvids, max_count):
    """批量获取视频详情"""
    details = []
    for i, bvid in enumerate(bvids[:max_count * 2]):
        info = api.get_video_info(bvid)
        if info:
            details.append(info)
            log(f"  [{i+1}/{min(len(bvids), max_count*2)}] {bvid} ok {info['title'][:30]}")
        else:
            log(f"  [{i+1}/{min(len(bvids), max_count*2)}] {bvid} 获取失败", "warn")
        time.sleep(0.5 + random.uniform(0, 0.5))
    return details

def filter_and_transform(videos, up_name, categories):
    settings = status.get_settings()
    duration_min = settings.get("duration_min", 60)
    duration_max = settings.get("duration_max", 3600)
    max_per_up = settings.get("max_videos_per_up", 50)
    pubdate_days = settings.get("pubdate_days", 0)

    EXCLUDE_KEYWORDS = [
        "抽奖福利", "恰饭", "广告", "推广", "赞助",
        "恐怖", "惊悚", "血腥", "暴力",
        "擦边", "色情", "低俗",
    ]

    now = time.time()
    pubdate_limit = now - pubdate_days * 86400 if pubdate_days > 0 else 0

    result = []
    for v in videos:
        title = v.get("title", "")
        duration = v.get("duration", 0)
        pubdate = v.get("pubdate", 0)
        clean_title = re.sub(r"<[^>]+>", "", title)

        if duration < duration_min or duration > duration_max:
            continue
        if pubdate_limit > 0 and pubdate < pubdate_limit:
            continue
        matched_kw = next((kw for kw in EXCLUDE_KEYWORDS if kw in title), None)
        if matched_kw:
            continue

        bvid = v.get("bvid", "")
        result.append({
            "bvid": bvid,
            "title": clean_title,
            "cover": process_cover_url(v.get("pic", "")),
            "duration": duration,
            "duration_text": format_duration(duration),
            "pubdate": pubdate,
            "play": v.get("view", 0),
            "like": v.get("like", 0),
            "up_name": v.get("up_name", up_name),
            "categories": categories,
            "url": f"https://www.bilibili.com/video/{bvid}",
            "iframe_url": f"//player.bilibili.com/player.html?bvid={bvid}&high_quality=1&danmaku=0",
        })
    return result[:max_per_up]

# =====================
# 主流程
# =====================

def run():
    log("=" * 50)
    log("暖阳爬虫启动 (轻量API版本)")
    log("=" * 50)

    upmasters = get_crawl_upmasters()
    log(f"共 {len(upmasters)} 位 UP主待抓取")

    status.init(len(upmasters), upmasters)

    # 读取cookie（可选，从环境变量或设置文件）
    cookie = os.environ.get("BILI_COOKIE", "")
    settings = status.get_settings()
    if settings.get("bili_cookie"):
        cookie = settings["bili_cookie"]

    api = BiliAPI(cookie=cookie)

    log("[INFO] 验证API连通性...")
    status.set_login_done()

    if not api.check_accessible():
        log("[ERROR] API无法访问，可能是网络问题或IP被风控", "error")
        log("[INFO] 等待30秒后重试一次...", "info")
        time.sleep(30)
        if not api.check_accessible():
            log("[ERROR] 重试失败，退出", "error")
            status.finish("error")
            api.close()
            return

    log("[INFO] API正常")

    all_videos = []

    try:
        for i, up in enumerate(upmasters):
            name = up["name"]
            uid = up["uid"]
            categories = up.get("categories", [])

            log(f"[{i+1}/{len(upmasters)}] 抓取: {name} (UID: {uid}) 分类: {', '.join(categories)}")
            status.set_current(i, "searching")

            search_results = fetch_up_videos(api, uid, name)

            if not search_results:
                log(f"  [WARN] 未找到 {name} 的视频", "warn")
                status.update_up(i, "failed", error="未找到视频")
                continue

            log(f"  共找到 {len(search_results)} 条视频，开始获取详情...")
            status.set_current(i, "fetching")

            max_per_up = settings.get("max_videos_per_up", 50)
            details = fetch_video_details(api, [v["bvid"] for v in search_results], max_per_up)

            status.set_current(i, "filtering")
            up_videos = filter_and_transform(details, name, categories)
            all_videos.extend(up_videos)

            log(f"  通过筛选: {len(up_videos)} 条, 累计: {len(all_videos)} 条")
            status.update_up(i, "done", videos=len(up_videos))
            status.add_videos(len(up_videos))

            time.sleep(REQUEST_DELAY + random.uniform(0, 2))

            if len(all_videos) >= MAX_VIDEOS_TOTAL:
                log(f"达到总数上限 {MAX_VIDEOS_TOTAL}，停止抓取")
                break

    except Exception as e:
        log(f"[ERROR] 爬虫异常: {e}", "error")
        status.finish("error")
        api.close()
        return
    finally:
        api.close()

    # 写入文件
    output = {
        "version": 5,
        "updated": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total": len(all_videos),
        "source": "bilibili_api_requests",
        "videos": all_videos,
    }

    os.makedirs(os.path.dirname(VIDEOS_FILE), exist_ok=True)
    with open(VIDEOS_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    import shutil
    web_data_dir = os.path.join(WEB_DIR, "data")
    os.makedirs(web_data_dir, exist_ok=True)
    shutil.copy2(VIDEOS_FILE, os.path.join(web_data_dir, "videos.json"))

    log("=" * 50)
    log(f"抓取完成: 共 {len(all_videos)} 条视频")
    log(f"数据已写入: {VIDEOS_FILE}")
    log("=" * 50)

    status.finish("done")

    git_push()

def git_push():
    project_dir = BASE_DIR

    try:
        subprocess.run(["git", "rev-parse", "--git-dir"],
                       cwd=project_dir, capture_output=True, check=True)
    except Exception:
        log("[WARN] 不是git仓库，跳过推送", "warn")
        return

    import shutil
    web_data_dir = os.path.join(WEB_DIR, "data")
    os.makedirs(web_data_dir, exist_ok=True)
    shutil.copy2(VIDEOS_FILE, os.path.join(web_data_dir, "videos.json"))

    subprocess.run(["git", "add", "data/videos.json", "web/data/videos.json", ".github/"],
                   cwd=project_dir, check=True)

    result = subprocess.run(["git", "diff", "--staged", "--quiet"],
                            cwd=project_dir)
    if result.returncode == 0:
        log("[INFO] 无新数据，跳过提交")
        return

    commit_msg = f"自动更新视频数据 {time.strftime('%Y-%m-%d %H:%M:%S')}"
    subprocess.run(["git", "commit", "-m", commit_msg],
                   cwd=project_dir, check=True)

    git_token = os.environ.get("GITHUB_TOKEN", "")
    push_urls = []
    if git_token:
        push_urls.append(f"https://PeaCocoa:{git_token}@github.com/PeaCocoa/nuanyang.git")
    push_urls.append("origin")

    max_attempts = 5
    retry_delay = 120

    for attempt in range(1, max_attempts + 1):
        for url in push_urls:
            try:
                log(f"[INFO] 推送尝试 {attempt}/{max_attempts} -> {url[:50]}...")
                subprocess.run(["git", "push", url, "main"],
                               cwd=project_dir, check=True,
                               capture_output=True, text=True, timeout=60)
                log("[INFO] 已推送到GitHub，Actions将自动部署")
                return
            except subprocess.TimeoutExpired:
                log(f"[WARN] 推送超时（{url[:40]}...），尝试下一个地址", "warn")
            except subprocess.CalledProcessError as e:
                log(f"[WARN] 推送失败（{url[:40]}...）: {e.stderr[:100] if e.stderr else str(e)}", "warn")
            except Exception as e:
                log(f"[WARN] 推送异常（{url[:40]}...）: {e}", "warn")

        if attempt < max_attempts:
            log(f"[INFO] {retry_delay}秒后重试...")
            time.sleep(retry_delay)

    log(f"[ERROR] 推送失败，已达最大重试次数 {max_attempts}", "error")
    log("[INFO] 数据已保存在本地，下次运行时会自动重试", "info")

if __name__ == "__main__":
    run()
