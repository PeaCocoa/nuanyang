# -*- coding: utf-8 -*-
"""
worker.py 重构：去掉逐条获取详情，直接用space API列表数据筛选
请求数从约3990降到约190，减少95%
"""
import json
import os
import re
import time
import random

# 添加项目根目录到 path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

from crawler.config import load_upmasters, VIDEOS_FILE, MAX_VIDEOS_TOTAL, SEARCH_PAGES, REQUEST_DELAY, SEARCH_PAGE_DELAY
from crawler.bilibili import BiliCrawler
import crawler.status as status

DATA_DIR = os.path.join(BASE_DIR, "data")
WEB_DIR = os.path.join(BASE_DIR, "web")

# =====================
# 工具函数
# =====================

# worker 启动时间，用于判断 stop_signal 是否为本次启动后产生的
_WORKER_START_TIME = time.time()

# 停止检查（基于时间戳，残留的旧信号自动失效）
def is_stop_requested():
    stop_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "stop_signal")
    if not os.path.exists(stop_file):
        return False
    try:
        with open(stop_file, "r") as f:
            signal_time = float(f.read().strip())
        # 只有信号时间戳新于 worker 启动时间，才认为是有效停止指令
        if signal_time > _WORKER_START_TIME:
            os.remove(stop_file)
            return True
        # 旧残留信号，静默删除
        os.remove(stop_file)
        return False
    except Exception:
        return False

def log(msg, level="info"):
    print(msg, flush=True)
    status.log(msg, level)

def parse_duration(val):
    """将B站的时长字段转为秒数（可能是 'MM:SS'、'HH:MM:SS' 或数字）"""
    if isinstance(val, (int, float)):
        return int(val)
    if not val:
        return 0
    parts = str(val).split(":")
    if len(parts) == 2:
        return int(parts[0]) * 60 + int(parts[1])
    elif len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    try:
        return int(val)
    except:
        return 0

def format_duration(seconds):
    seconds = parse_duration(seconds)
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

def random_delay(base, jitter):
    """随机延迟，避免规律性请求被风控"""
    delay = base + random.uniform(0, jitter)
    time.sleep(delay)

# =====================
# 抓取逻辑
# =====================

_wf_delay_pages = 8  # 默认翻页间隔，可被工作流覆盖

def fetch_up_videos(crawler, uid, up_name):
    """通过UID直接拉取UP主视频列表（不依赖搜索，不会漏视频）"""
    all_results = []
    for page in range(1, SEARCH_PAGES + 1):
        results = crawler.get_up_videos(uid, page=page)
        if not results:
            break
        all_results.extend(results)
        log(f"  第{page}页: {len(results)}条视频")
        if page < SEARCH_PAGES:
            random_delay(_wf_delay_pages, 3)
    seen = set()
    unique = []
    for v in all_results:
        if v["bvid"] not in seen:
            seen.add(v["bvid"])
            unique.append(v)
    return unique

def filter_and_transform(videos, up_name, categories):
    """直接用space API列表数据筛选，不需要逐条获取详情"""
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
        duration = parse_duration(v.get("duration", 0))
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
            "play": v.get("play", 0),
            "like": 0,
            "up_name": up_name,
            "categories": categories,
            "url": f"https://www.bilibili.com/video/{bvid}",
            "iframe_url": f"//player.bilibili.com/player.html?bvid={bvid}&high_quality=1&danmaku=0",
        })
    return result[:max_per_up]


def filter_and_transform_override(videos, up_name, categories, override):
    """使用流程图中筛选节点的参数进行筛选"""
    duration_min = override.get("duration_min", 60)
    duration_max = override.get("duration_max", 3600)
    max_per_up = 50
    pubdate_days = override.get("pubdate_days", 0)

    EXCLUDE_KEYWORDS = [
        "抽奖福利", "恰饽", "广告", "推广", "赞助",
        "恐怖", "惊悚", "血腥", "暴力",
        "擦边", "色情", "低俗",
    ]

    now = time.time()
    pubdate_limit = now - pubdate_days * 86400 if pubdate_days > 0 else 0

    result = []
    for v in videos:
        title = v.get("title", "")
        duration = parse_duration(v.get("duration", 0))
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
            "play": v.get("play", 0),
            "like": 0,
            "up_name": up_name,
            "categories": categories,
            "url": f"https://www.bilibili.com/video/{bvid}",
            "iframe_url": f"//player.bilibili.com/player.html?bvid={bvid}&high_quality=1&danmaku=0",
        })
    return result[:max_per_up]


# =====================
# 设置相关
# =====================

def get_crawl_upmasters():
    all_ups = load_upmasters()
    settings = status.get_settings()
    selected = settings.get("selected_ups", [])

    if not selected:
        return all_ups

    selected_set = set(selected)
    return [up for up in all_ups if up["name"] in selected_set]


def load_workflow():
    """加载当前工作流配置（如果存在）"""
    wf_file = os.path.join(BASE_DIR, "data", "current_workflow.json")
    if not os.path.isfile(wf_file):
        return None
    try:
        with open(wf_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def parse_flow_nodes(wf):
    """从流程图工作流中提取UP主列表和配置"""
    nodes = wf.get("nodes", [])
    if not nodes:
        # 旧格式兼容
        return get_workflow_upmasters(wf), wf.get("config", {})

    upmasters = []
    delay_seconds = REQUEST_DELAY
    filter_config = {}
    has_push = False

    for node in nodes:
        ntype = node.get("type", "")
        data = node.get("data", {})

        if ntype == "up":
            uid_str = str(data.get("uid", "")).strip()
            if not uid_str:
                continue
            try:
                uid = int(uid_str)
            except ValueError:
                continue
            name = data.get("uname", f"UP主{uid}")
            cats_str = data.get("categories", "")
            categories = [c.strip() for c in cats_str.split(",") if c.strip()] if cats_str else []
            repeat = max(1, int(data.get("repeat", "1") or "1"))
            for _ in range(repeat):
                upmasters.append({"name": name, "uid": uid, "categories": categories})

        elif ntype == "delay":
            try:
                delay_seconds = int(data.get("seconds", "30"))
            except ValueError:
                delay_seconds = 30

        elif ntype == "filter":
            try:
                filter_config["duration_min"] = int(data.get("duration_min", "60"))
            except ValueError:
                filter_config["duration_min"] = 60
            try:
                filter_config["duration_max"] = int(data.get("duration_max", "3600"))
            except ValueError:
                filter_config["duration_max"] = 3600
            try:
                filter_config["pubdate_days"] = int(data.get("pubdate_days", "0"))
            except ValueError:
                filter_config["pubdate_days"] = 0

        elif ntype == "push":
            has_push = True

    config = {
        "total_limit": wf.get("config", {}).get("total_limit", MAX_VIDEOS_TOTAL),
        "delay_between_ups": delay_seconds,
        "delay_between_pages": SEARCH_PAGE_DELAY,
        "stop_after_done": True,
        "filter": filter_config,
        "has_push": has_push,
    }
    return upmasters, config


def get_workflow_upmasters(wf):
    """根据工作流配置构建UP主列表（旧格式兼容）"""
    wf_ups = wf.get("ups", [])
    if not wf_ups:
        # 没有自定义UP列表，用全部
        return load_upmasters()

    # 按工作流中的顺序和配置构建
    result = []
    for wu in wf_ups:
        if not wu.get("enabled", True):
            continue
        repeat = wu.get("repeat", 1)
        for _ in range(repeat):
            result.append({
                "name": wu["name"],
                "uid": wu["uid"],
                "categories": wu.get("categories", []),
            })
    return result

# =====================
# git 推送
# =====================

def git_push():
    """推送数据到GitHub（最多重试3次，间隔20秒）"""
    import subprocess

    for attempt in range(3):
        try:
            log(f"[GIT] 推送数据 (第{attempt+1}次尝试)...")
            subprocess.run(
                ["git", "add", "-A"],
                cwd=BASE_DIR, capture_output=True, text=True, timeout=30
            )
            result = subprocess.run(
                ["git", "commit", "-m", f"自动更新视频数据 {time.strftime('%Y-%m-%d %H:%M')}"],
                cwd=BASE_DIR, capture_output=True, text=True, timeout=30
            )
            # 直接用 origin remote（URL中已内嵌Token）
            result = subprocess.run(
                ["git", "push", "origin", "main"],
                cwd=BASE_DIR, capture_output=True, text=True, timeout=60
            )
            if result.returncode == 0:
                log("[GIT] 推送成功")
                return True
            else:
                log(f"[GIT] 推送失败: {result.stderr[:150]}", "warn")
        except Exception as e:
            log(f"[GIT] 推送异常: {e}", "warn")

        if attempt < 2:
            log("[GIT] 20秒后重试...")
            time.sleep(20)

    log("[GIT] 推送失败，已达最大重试次数", "error")
    return False

# =====================
# 主流程
# =====================

def run():
    log("=" * 50)
    log("暖阳爬虫启动 (Playwright 版本)")
    log("=" * 50)

    # 检查是否有工作流配置
    wf = load_workflow()
    filter_override = None
    do_push = True
    if wf:
        log(f"[工作流] 使用工作流: {wf.get('name', '未命名')}")
        # 判断是流程图格式还是旧格式
        if wf.get("nodes"):
            upmasters, wf_config = parse_flow_nodes(wf)
            config = wf_config
            filter_override = config.get("filter", {})
            do_push = config.get("has_push", True)
        else:
            config = wf.get("config", {})
            upmasters = get_workflow_upmasters(wf)
        total_limit = config.get("total_limit", MAX_VIDEOS_TOTAL)
        delay_ups = config.get("delay_between_ups", REQUEST_DELAY)
        delay_pages = config.get("delay_between_pages", SEARCH_PAGE_DELAY)
        stop_after_done = config.get("stop_after_done", True)
        batch_size = config.get("batch_size", 0)
        batch_delay = config.get("batch_delay", 60)
        log(f"[工作流] UP主数: {len(upmasters)}, 总量上限: {total_limit}")
        if filter_override:
            log(f"[工作流] 筛选覆盖: 时长 {filter_override.get('duration_min',60)}-{filter_override.get('duration_max',3600)}s")
    else:
        upmasters = get_crawl_upmasters()
        settings = status.get_settings()
        total_limit = settings.get("total_limit", MAX_VIDEOS_TOTAL)
        delay_ups = settings.get("delay_between_ups", REQUEST_DELAY)
        delay_pages = settings.get("delay_between_pages", SEARCH_PAGE_DELAY)
        stop_after_done = True
        batch_size = settings.get("batch_size", 0)
        batch_delay = settings.get("batch_delay", 60)

    global _wf_delay_pages
    _wf_delay_pages = delay_pages
    log(f"共 {len(upmasters)} 位 UP主待抓取")

    status.init(len(upmasters), upmasters)

    headless = os.environ.get("NUANYANG_HEADLESS", "") == "1"
    crawler = BiliCrawler(headless=headless)

    log("[INFO] 启动浏览器...")
    status.set_login_required()

    crawler.start()
    status.set_login_done()

    log("[INFO] 验证API连通性...")
    test_results = crawler.get_up_videos("254463269", page=1)
    if not test_results:
        log("[ERROR] API无返回，可能未登录或被风控", "error")
        log("[ERROR] 请重新运行并扫码登录B站", "error")
        crawler.close()
        status.finish("error")
        return
    log(f"[INFO] API正常，测试获取到 {len(test_results)} 条视频")

    all_videos = []

    try:
        for i, up in enumerate(upmasters):
            if is_stop_requested():
                log("[INFO] 收到停止指令，停止抓取")
                break
            name = up["name"]
            uid = up["uid"]
            categories = up.get("categories", [])

            log(f"[{i+1}/{len(upmasters)}] 抓取: {name} (UID: {uid}) 分类: {', '.join(categories)}")
            status.set_current(i, "searching")

            search_results = fetch_up_videos(crawler, uid, name)

            if not search_results:
                log(f"  [WARN] 未找到 {name} 的视频", "warn")
                status.update_up(i, "failed", error="未找到视频")
                continue

            log(f"  共找到 {len(search_results)} 条视频，直接筛选...")
            status.set_current(i, "filtering")

            if filter_override:
                up_videos = filter_and_transform_override(search_results, name, categories, filter_override)
            else:
                up_videos = filter_and_transform(search_results, name, categories)
            all_videos.extend(up_videos)

            log(f"  通过筛选: {len(up_videos)} 条, 累计: {len(all_videos)} 条")
            status.update_up(i, "done", videos=len(up_videos))
            status.add_videos(len(up_videos))

            if is_stop_requested():
                log("[INFO] 收到停止指令，停止抓取")
                break

            random_delay(delay_ups, 3)

            # 批次间隔
            if batch_size > 0 and (i + 1) % batch_size == 0 and i < len(upmasters) - 1:
                log(f"[批次] 第 {(i+1)//batch_size} 批完成，等待 {batch_delay}s 后继续...")
                time.sleep(batch_delay)

            if len(all_videos) >= total_limit:
                log(f"达到总数上限 {MAX_VIDEOS_TOTAL}，停止抓取")
                break

    except Exception as e:
        log(f"[ERROR] 爬虫异常: {e}", "error")
        status.finish("error")
        crawler.close()
        return
    finally:
        crawler.close()

    # 写入文件
    output = {
        "version": 4,
        "updated": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total": len(all_videos),
        "source": "bilibili_space_api_via_playwright",
        "videos": all_videos,
    }

    os.makedirs(os.path.dirname(VIDEOS_FILE), exist_ok=True)
    with open(VIDEOS_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    # 同步到 web/data/
    web_data_dir = os.path.join(WEB_DIR, "data")
    os.makedirs(web_data_dir, exist_ok=True)
    import shutil
    shutil.copy2(VIDEOS_FILE, os.path.join(web_data_dir, "videos.json"))

    log("=" * 50)
    log(f"抓取完成: 共 {len(all_videos)} 条视频")
    log(f"数据已写入: {VIDEOS_FILE}")
    log("=" * 50)

    # 推送到GitHub
    if do_push:
        git_push()
    else:
        log("[工作流] 跳过推送（流程中无推送节点）")

    # 爬完后清理工作流文件
    if stop_after_done:
        wf_file = os.path.join(BASE_DIR, "data", "current_workflow.json")
        if os.path.exists(wf_file):
            try:
                os.remove(wf_file)
            except:
                pass

    status.finish("done")

if __name__ == "__main__":
    run()
