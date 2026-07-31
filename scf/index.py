"""
暖阳爬虫 — 腾讯云函数版
部署到腾讯云SCF，定时触发，不经过本地路由器

入口函数: main_handler(event, context)
定时触发: 每天 06:00 和 15:00 (北京时间)
每月19日跳过

部署方式:
  1. 将本文件 + upmasters.json 打包为 zip
  2. 上传到腾讯云函数 SCF
  3. 配置定时触发器
"""

import json
import time
import re
import os
import base64
import random
import requests

# =====================
# 配置
# =====================

# GitHub配置（环境变量）
# 在SCF函数配置中添加环境变量:
#   GITHUB_TOKEN: 你的GitHub Token (需要repo权限)
#   GITHUB_OWNER: PeaCocoa
#   GITHUB_REPO: nuanyang
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_OWNER = os.environ.get("GITHUB_OWNER", "PeaCocoa")
GITHUB_REPO = os.environ.get("GITHUB_REPO", "nuanyang")

# B站API配置
BILI_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.bilibili.com",
    "Origin": "https://www.bilibili.com",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

# 爬虫参数
SEARCH_PAGES = 5           # 每位UP主搜索的页数
MAX_VIDEOS_PER_UP = 50     # 每位UP主最多保留的视频数
MAX_VIDEOS_TOTAL = 800     # 视频总数上限
REQUEST_DELAY = 3          # UP主之间的请求间隔（秒）
SEARCH_PAGE_DELAY = 5      # 翻页间隔（秒）

# 风控状态
_risk_control = False

# 排除关键词
EXCLUDE_KEYWORDS = [
    "抽奖福利", "恰饭", "广告", "推广", "赞助",
    "恐怖", "惊悚", "血腥", "暴力",
    "擦边", "色情", "低俗",
]

# =====================
# 加载UP主配置
# =====================

def load_upmasters():
    """从同目录的upmasters.json加载"""
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "upmasters.json")
    # SCF环境可能在不同路径
    if not os.path.exists(config_path):
        config_path = "/var/user/upmasters.json"
    if not os.path.exists(config_path):
        config_path = "upmasters.json"

    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)

    return [
        {
            "name": up["name"],
            "uid": up["uid"],
            "categories": up.get("categories", []),
        }
        for up in config.get("upmasters", [])
    ]

# =====================
# B站API
# =====================

def check_risk_control(data):
    global _risk_control
    code = data.get("code", 0)
    msg = data.get("message", "")
    if code in (-412, -799, -509) or "风控" in msg or "频繁" in msg:
        _risk_control = True
        return True
    return False

def wait_if_risk():
    global _risk_control
    if _risk_control:
        wait = random.randint(30, 60)
        print(f"  [WARN] 触发风控，等待{wait}秒后继续...", flush=True)
        time.sleep(wait)
        _risk_control = False

def get_up_videos(session, mid, page=1):
    """通过UID获取UP主视频列表"""
    wait_if_risk()
    url = "https://api.bilibili.com/x/space/arc/search"
    params = {"mid": mid, "pn": page, "ps": 30, "order": "pubdate"}
    try:
        resp = session.get(url, params=params, timeout=15)
        data = resp.json()
        if check_risk_control(data):
            return []
        if data.get("code") == 0 and data.get("data", {}).get("list", {}).get("vlist"):
            return data["data"]["list"]["vlist"]
        else:
            print(f"  [WARN] API返回异常: code={data.get('code')}, msg={data.get('message', '')}", flush=True)
            return []
    except Exception as e:
        print(f"  [ERROR] 获取视频列表失败: {e}", flush=True)
        return []

# =====================
# 工具函数
# =====================

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

def get_duration(v):
    dur = v.get("duration", 0)
    if dur:
        return dur
    length = v.get("length", "")
    if isinstance(length, str) and ":" in length:
        parts = length.split(":")
        if len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
        elif len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    try:
        return int(length)
    except:
        return 0

def get_pubdate(v):
    return v.get("pubdate", 0) or v.get("created", 0)

def get_play(v):
    return v.get("view", 0) or v.get("play", 0)

def filter_and_transform(videos, up_name, categories):
    result = []
    for v in videos:
        title = v.get("title", "")
        duration = get_duration(v)
        pubdate = get_pubdate(v)
        clean_title = re.sub(r"<[^>]+>", "", title)

        if duration < 60 or duration > 3600:
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
            "play": get_play(v),
            "like": v.get("like", 0),
            "up_name": v.get("up_name", "") or v.get("author", "") or up_name,
            "categories": categories,
            "url": f"https://www.bilibili.com/video/{bvid}",
            "iframe_url": f"//player.bilibili.com/player.html?bvid={bvid}&high_quality=1&danmaku=0",
        })
    return result[:MAX_VIDEOS_PER_UP]

# =====================
# GitHub API（更新文件）
# =====================

def github_get_file_sha(path):
    """获取GitHub文件的当前SHA（更新时需要）"""
    url = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/contents/{path}"
    headers = {"Authorization": f"token {GITHUB_TOKEN}", "Accept": "application/vnd.github+json"}
    try:
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code == 200:
            return resp.json().get("sha")
    except:
        pass
    return None

def github_update_file(path, content, message):
    """通过GitHub API更新文件"""
    url = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/contents/{path}"
    headers = {"Authorization": f"token {GITHUB_TOKEN}", "Accept": "application/vnd.github+json"}

    sha = github_get_file_sha(path)

    data = {
        "message": message,
        "content": base64.b64encode(content.encode("utf-8")).decode("ascii"),
    }
    if sha:
        data["sha"] = sha

    try:
        resp = requests.put(url, headers=headers, json=data, timeout=30)
        if resp.status_code in (200, 201):
            print(f"  [OK] GitHub文件已更新: {path}", flush=True)
            return True
        else:
            print(f"  [ERROR] GitHub更新失败: {resp.status_code} {resp.text[:100]}", flush=True)
            return False
    except Exception as e:
        print(f"  [ERROR] GitHub更新异常: {e}", flush=True)
        return False

# =====================
# 主爬虫流程
# =====================

def crawl():
    print("=" * 50, flush=True)
    print("暖阳爬虫启动 (腾讯云函数版)", flush=True)
    print("=" * 50, flush=True)

    if not GITHUB_TOKEN:
        print("[ERROR] 未配置GITHUB_TOKEN环境变量", flush=True)
        return {"ok": False, "error": "未配置GITHUB_TOKEN"}

    # 每月19日跳过
    day = int(time.strftime("%d"))
    if day == 19:
        print("[INFO] 今天是19日，休息日，跳过爬虫", flush=True)
        return {"ok": True, "skipped": "每月19日休息"}

    upmasters = load_upmasters()
    print(f"共 {len(upmasters)} 位 UP主待抓取", flush=True)

    session = requests.Session()
    session.headers.update(BILI_HEADERS)

    # 验证API连通性
    test = get_up_videos(session, "254463269", page=1)
    if not test:
        print("[ERROR] API无法访问", flush=True)
        return {"ok": False, "error": "B站API无法访问"}

    print(f"[INFO] API正常，测试获取到 {len(test)} 条视频", flush=True)

    all_videos = []

    for i, up in enumerate(upmasters):
        name = up["name"]
        uid = up["uid"]
        categories = up.get("categories", [])

        print(f"[{i+1}/{len(upmasters)}] 抓取: {name} (UID: {uid}) 分类: {', '.join(categories)}", flush=True)

        # 拉取视频列表
        up_results = []
        for page in range(1, SEARCH_PAGES + 1):
            results = get_up_videos(session, uid, page=page)
            if not results:
                break
            up_results.extend(results)
            print(f"  第{page}页: {len(results)}条视频", flush=True)
            if page < SEARCH_PAGES:
                time.sleep(SEARCH_PAGE_DELAY + random.uniform(0, 2))

        # 去重
        seen = set()
        unique = []
        for v in up_results:
            bvid = v.get("bvid", "")
            if bvid and bvid not in seen:
                seen.add(bvid)
                unique.append(v)

        if not unique:
            print(f"  [WARN] 未找到 {name} 的视频", flush=True)
            continue

        # 筛选
        up_videos = filter_and_transform(unique, name, categories)
        all_videos.extend(up_videos)
        print(f"  通过筛选: {len(up_videos)} 条, 累计: {len(all_videos)} 条", flush=True)

        time.sleep(REQUEST_DELAY + random.uniform(0, 2))

        if len(all_videos) >= MAX_VIDEOS_TOTAL:
            print(f"达到总数上限 {MAX_VIDEOS_TOTAL}，停止抓取", flush=True)
            break

    # 写入JSON
    output = {
        "version": 6,
        "updated": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total": len(all_videos),
        "source": "tencent_scf_bilibili_api",
        "videos": all_videos,
    }
    json_str = json.dumps(output, ensure_ascii=False, indent=2)

    # 推送到GitHub
    print("[INFO] 推送数据到GitHub...", flush=True)
    commit_msg = f"自动更新视频数据 {time.strftime('%Y-%m-%d %H:%M:%S')}"

    ok1 = github_update_file("data/videos.json", json_str, commit_msg)
    ok2 = github_update_file("web/data/videos.json", json_str, commit_msg)

    # 触发部署（GitHub Pages会自动构建）
    print("=" * 50, flush=True)
    print(f"抓取完成: 共 {len(all_videos)} 条视频", flush=True)
    print(f"GitHub推送: data={ok1}, web={ok2}", flush=True)
    print("=" * 50, flush=True)

    return {
        "ok": ok1 or ok2,
        "total": len(all_videos),
        "github_data": ok1,
        "github_web": ok2,
    }

# =====================
# SCF入口函数
# =====================

def main_handler(event, context):
    """腾讯云函数入口"""
    try:
        result = crawl()
        print(f"[结果] {json.dumps(result, ensure_ascii=False)}", flush=True)
        return result
    except Exception as e:
        print(f"[ERROR] 爬虫异常: {e}", flush=True)
        return {"ok": False, "error": str(e)}
