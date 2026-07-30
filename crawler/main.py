"""
暖阳爬虫主入口 — Playwright 版本
启动后访问 http://localhost:8899/console.html 查看实时进度

用法:
  python -m crawler.main            # 启动服务器，等待手动开爬
  python -m crawler.main --auto     # 启动服务器并自动开爬
"""

import json
import time
import sys
import os
import re
import subprocess
import threading
import http.server
import socketserver
from urllib.parse import parse_qs

# 添加项目根目录到 path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from crawler.config import load_upmasters, VIDEOS_FILE, UPMASTERS_FILE, MAX_VIDEOS_TOTAL, SEARCH_PAGES, REQUEST_DELAY, SEARCH_PAGE_DELAY
from crawler.bilibili import BiliCrawler
import crawler.status as status

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_DIR = os.path.join(BASE_DIR, "web")
DATA_DIR = os.path.join(BASE_DIR, "data")
CONSOLE_PORT = 8899

# =====================
# HTTP 服务器（常驻运行，提供控制台页面 + API）
# =====================

class ConsoleHandler(http.server.SimpleHTTPRequestHandler):
    """自定义HTTP处理器，提供控制台页面和API接口"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def do_GET(self):
        if self.path == "/api/status":
            self._serve_json(status.get_status())
            return
        if self.path == "/api/settings":
            self._serve_json(status.get_settings())
            return
        if self.path == "/api/upmasters":
            self._serve_upmasters()
            return
        if self.path.startswith("/data/"):
            self._serve_data_file()
            return
        if self.path == "/console" or self.path == "/console.html":
            self.path = "/console.html"
        super().do_GET()

    def do_POST(self):
        if self.path == "/api/start":
            self._handle_start()
            return
        if self.path == "/api/settings":
            self._handle_save_settings()
            return
        self.send_error(404)

    def _serve_json(self, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def _serve_upmasters(self):
        """返回所有UP主列表（供前端选择）"""
        try:
            ups = load_upmasters()
            self._serve_json({"ups": ups})
        except Exception as e:
            self._serve_json({"error": str(e)})

    def _serve_data_file(self):
        rel = self.path[len("/data/"):]
        filepath = os.path.join(DATA_DIR, rel)
        if os.path.isfile(filepath):
            with open(filepath, "rb") as f:
                body = f.read()
            self.send_response(200)
            if rel.endswith(".json"):
                self.send_header("Content-Type", "application/json; charset=utf-8")
            else:
                self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_error(404)

    def _handle_start(self):
        """启动爬虫（后台线程）"""
        if status.is_running():
            self._serve_json({"ok": False, "msg": "爬虫正在运行中"})
            return
        # 在后台线程启动爬虫
        t = threading.Thread(target=_run_crawl, daemon=True)
        t.start()
        self._serve_json({"ok": True, "msg": "爬虫已启动"})

    def _handle_save_settings(self):
        """保存设置"""
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            body = raw.decode("utf-8") if raw else "{}"
            settings_data = json.loads(body)
            saved = status.save_settings(settings_data)
            self._serve_json({"ok": True, "settings": saved})
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            # 尝试 latin-1 兜底再 encode 回 utf-8
            try:
                body = raw.decode("latin-1").encode("latin-1").decode("utf-8")
                settings_data = json.loads(body)
                saved = status.save_settings(settings_data)
                self._serve_json({"ok": True, "settings": saved})
            except Exception as e2:
                self._serve_json({"ok": False, "msg": f"解码失败: {e2}"})
        except Exception as e:
            self._serve_json({"ok": False, "msg": str(e)})

    def log_message(self, *args):
        pass

def start_http_server():
    """启动HTTP服务器"""
    try:
        server = socketserver.TCPServer(("0.0.0.0", CONSOLE_PORT), ConsoleHandler)
        print(f"[INFO] 控制台地址: http://localhost:{CONSOLE_PORT}/console.html")
        server.serve_forever()
    except OSError as e:
        if "address already in use" in str(e).lower():
            print(f"[WARN] 端口 {CONSOLE_PORT} 已被占用")
        else:
            print(f"[WARN] HTTP服务器启动失败: {e}")

# =====================
# 工具函数
# =====================

def log(msg: str, level: str = "info"):
    print(msg)
    status.log(msg, level)

def format_duration(seconds: int) -> str:
    if seconds >= 3600:
        h, remainder = divmod(seconds, 3600)
        m, s = divmod(remainder, 60)
        return f"{h}:{m:02d}:{s:02d}"
    m, s = divmod(seconds, 60)
    return f"{m:02d}:{s:02d}"

def process_cover_url(pic: str) -> str:
    if not pic:
        return ""
    url = pic.replace("http://", "https://")
    if "@672w_378h" not in url:
        base = re.sub(r'\.(jpg|png|webp)$', '', url)
        url = base + "@672w_378h_1c.webp"
    return url

def get_crawl_upmasters() -> list:
    """根据设置获取要爬取的UP主列表"""
    all_ups = load_upmasters()
    settings = status.get_settings()

    if settings.get("test_mode"):
        # 测试模式：只爬前2个UP主
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

def search_up_videos(crawler: BiliCrawler, up_name: str, exact_name: str) -> list:
    all_results = []
    for page in range(1, SEARCH_PAGES + 1):
        results = crawler.search_videos(up_name, page=page, order="pubdate")
        if not results:
            break
        matched = [v for v in results if v.get("author") == exact_name]
        all_results.extend(matched)
        log(f"  搜索第{page}页: {len(results)}条结果, 精确匹配{len(matched)}条")
        if page < SEARCH_PAGES:
            time.sleep(SEARCH_PAGE_DELAY)

    seen = set()
    unique = []
    for v in all_results:
        if v["bvid"] not in seen:
            seen.add(v["bvid"])
            unique.append(v)
    return unique

def fetch_video_details(crawler: BiliCrawler, bvids: list) -> list:
    details = []
    for i, bvid in enumerate(bvids):
        info = crawler.get_video_info(bvid)
        if info:
            details.append(info)
            log(f"  [{i+1}/{len(bvids)}] {bvid} ok {info['title'][:30]}")
        else:
            log(f"  [{i+1}/{len(bvids)}] {bvid} 获取失败", "warn")
        time.sleep(0.5)
    return details

def filter_and_transform(videos: list, up_name: str, category: str) -> list:
    settings = status.get_settings()
    duration_min = settings.get("duration_min", 60)
    duration_max = settings.get("duration_max", 900)
    max_per_up = settings.get("max_videos_per_up", 5)
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
            log(f"    过滤: {clean_title[:30]} (时长={duration}s, 超出{duration_min}-{duration_max}s)", "warn")
            continue
        if pubdate_limit > 0 and pubdate < pubdate_limit:
            log(f"    过滤: {clean_title[:30]} (投稿时间超出{pubdate_days}天)", "warn")
            continue
        matched_kw = next((kw for kw in EXCLUDE_KEYWORDS if kw in title), None)
        if matched_kw:
            log(f"    过滤: {clean_title[:30]} (包含关键词: {matched_kw})", "warn")
            continue

        bvid = v.get("bvid", "")
        result.append({
            "bvid": bvid,
            "title": re.sub(r"<[^>]+>", "", title),
            "cover": process_cover_url(v.get("pic", "")),
            "duration": duration,
            "duration_text": format_duration(duration),
            "pubdate": pubdate,
            "play": v.get("view", 0),
            "like": v.get("like", 0),
            "up_name": v.get("up_name", up_name),
            "category": category,
            "url": f"https://www.bilibili.com/video/{bvid}",
            "iframe_url": f"//player.bilibili.com/player.html?bvid={bvid}&high_quality=1&danmaku=0",
        })
    return result[:max_per_up]

# =====================
# 主流程
# =====================

def _run_crawl():
    """爬虫主流程（在后台线程中运行）"""
    log("=" * 50)
    log("暖阳爬虫启动 (Playwright 版本)")
    log("=" * 50)

    # 根据设置获取UP主列表
    upmasters = get_crawl_upmasters()
    log(f"共 {len(upmasters)} 位 UP主待抓取")

    # 初始化状态
    status.init(len(upmasters), upmasters)

    # 启动浏览器
    crawler = BiliCrawler(headless=False)

    log("[INFO] 启动浏览器...")
    status.set_login_required()

    crawler.start()
    status.set_login_done()

    # 验证API连通性
    log("[INFO] 验证API连通性...")
    test_results = crawler.search_videos("罗翔说刑法", page=1)
    if not test_results:
        log("[ERROR] 搜索API无返回，可能未登录或被风控", "error")
        log("[ERROR] 请重新运行并扫码登录B站", "error")
        crawler.close()
        status.finish("error")
        return
    log(f"[INFO] API正常，测试搜索返回 {len(test_results)} 条结果")

    all_videos = []

    try:
        for i, up in enumerate(upmasters):
            name = up["name"]
            uid = up["uid"]
            category = up["category"]

            log(f"[{i+1}/{len(upmasters)}] 抓取: {name} (UID: {uid})")
            status.set_current(i, "searching")

            search_results = search_up_videos(crawler, name, name)

            if not search_results:
                log(f"  [WARN] 未找到 {name} 的视频", "warn")
                status.update_up(i, "failed", error="未找到视频")
                continue

            log(f"  共找到 {len(search_results)} 条视频，开始获取详情...")
            status.set_current(i, "fetching")

            settings = status.get_settings()
            max_per_up = settings.get("max_videos_per_up", 5)
            bvids = [v["bvid"] for v in search_results[:max_per_up * 2]]
            details = fetch_video_details(crawler, bvids)

            status.set_current(i, "filtering")
            up_videos = filter_and_transform(details, name, category)
            all_videos.extend(up_videos)

            log(f"  通过筛选: {len(up_videos)} 条, 累计: {len(all_videos)} 条")
            status.update_up(i, "done", videos=len(up_videos))
            status.add_videos(len(up_videos))

            time.sleep(REQUEST_DELAY)

            if len(all_videos) >= MAX_VIDEOS_TOTAL:
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
        "source": "bilibili_search_and_view_via_playwright",
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

    status.finish("done")

    # 尝试推送到GitHub
    git_push()

def git_push():
    project_dir = BASE_DIR
    try:
        subprocess.run(["git", "rev-parse", "--git-dir"],
                       cwd=project_dir, capture_output=True, check=True)

        import shutil
        web_data_dir = os.path.join(WEB_DIR, "data")
        os.makedirs(web_data_dir, exist_ok=True)
        shutil.copy2(VIDEOS_FILE, os.path.join(web_data_dir, "videos.json"))

        subprocess.run(["git", "add", "data/videos.json", "web/data/videos.json"],
                       cwd=project_dir, check=True)

        result = subprocess.run(["git", "diff", "--staged", "--quiet"],
                                cwd=project_dir)
        if result.returncode == 0:
            log("[INFO] 无新数据，跳过提交")
            return

        commit_msg = f"自动更新视频数据 {time.strftime('%Y-%m-%d %H:%M:%S')}"
        subprocess.run(["git", "commit", "-m", commit_msg],
                       cwd=project_dir, check=True)
        subprocess.run(["git", "push"],
                       cwd=project_dir, check=True)
        log("[INFO] 已推送到GitHub")
    except subprocess.CalledProcessError as e:
        log(f"[WARN] Git操作失败: {e}", "warn")
    except Exception as e:
        log(f"[WARN] Git推送失败: {e}", "warn")

if __name__ == "__main__":
    auto_start = "--auto" in sys.argv

    print(f"暖阳爬虫服务器")
    print(f"控制台: http://localhost:{CONSOLE_PORT}/console.html")
    print(f"按 Ctrl+C 退出")

    # 先启动HTTP服务器（常驻）
    server_thread = threading.Thread(target=start_http_server, daemon=True)
    server_thread.start()
    time.sleep(0.5)

    if auto_start:
        print("[INFO] 自动启动爬虫...")
        _run_crawl()
    else:
        print('[INFO] 等待手动启动爬虫（在控制台点击"立即开爬"）')

    # 保持进程运行
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n退出")
