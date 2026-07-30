"""
暖阳爬虫主入口 — HTTP 服务器 + 子进程爬虫
启动后访问 http://localhost:8899/console.html 查看实时进度

用法:
  python -m crawler.main            # 启动服务器，等待手动开爬
  python -m crawler.main --auto     # 启动服务器并自动开爬
"""

import json
import time
import sys
import os
import subprocess
import threading
import http.server
import socketserver

# 添加项目根目录到 path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from crawler.config import load_upmasters, VIDEOS_FILE
import crawler.status as status

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_DIR = os.path.join(BASE_DIR, "web")
DATA_DIR = os.path.join(BASE_DIR, "data")
CONSOLE_PORT = 8899

# 爬虫子进程引用
_crawl_process = None
_crawl_lock = threading.Lock()

# =====================
# HTTP 服务器（常驻运行，提供控制台页面 + API）
# =====================

class ConsoleHandler(http.server.SimpleHTTPRequestHandler):
    """自定义HTTP处理器，提供控制台页面和API接口"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def do_GET(self):
        # 去掉query参数（如 /api/status?t=123 -> /api/status）
        from urllib.parse import urlparse
        path = urlparse(self.path).path

        if path == "/api/status":
            self._serve_json(status.get_status())
            return
        if path == "/api/settings":
            self._serve_json(status.get_settings())
            return
        if path == "/api/upmasters":
            self._serve_upmasters()
            return
        if path.startswith("/data/"):
            self._serve_data_file()
            return
        if path == "/console" or path == "/console.html":
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
        """通过子进程启动爬虫"""
        global _crawl_process
        with _crawl_lock:
            if _crawl_process is not None and _crawl_process.poll() is None:
                self._serve_json({"ok": False, "msg": "爬虫正在运行中"})
                return

            # 检查状态文件中是否已经是 running
            if status.is_running():
                self._serve_json({"ok": False, "msg": "爬虫正在运行中"})
                return

            # 用子进程启动爬虫 worker（不捕获stdout，直接输出到控制台）
            _crawl_process = subprocess.Popen(
                [sys.executable, "-m", "crawler.worker"],
                cwd=BASE_DIR,
                env={**os.environ, "PYTHONUNBUFFERED": "1"},
            )

        self._serve_json({"ok": True, "msg": "爬虫已启动"})

    def _handle_save_settings(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            body = raw.decode("utf-8") if raw else "{}"
            settings_data = json.loads(body)
            saved = status.save_settings(settings_data)
            self._serve_json({"ok": True, "settings": saved})
        except (UnicodeDecodeError, json.JSONDecodeError):
            try:
                body = raw.decode("latin-1").encode("latin-1").decode("utf-8")
                settings_data = json.loads(body)
                saved = status.save_settings(settings_data)
                self._serve_json({"ok": True, "settings": saved})
            except Exception as e:
                self._serve_json({"ok": False, "msg": f"解码失败: {e}"})
        except Exception as e:
            self._serve_json({"ok": False, "msg": str(e)})

    def log_message(self, *args):
        pass


def _pipe_output(proc):
    """读取子进程的stdout，转发到主进程控制台"""
    try:
        for line in iter(proc.stdout.readline, b''):
            text = line.decode("utf-8", errors="replace").rstrip()
            if text:
                print(f"[worker] {text}", flush=True)
    except Exception:
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


if __name__ == "__main__":
    auto_start = "--auto" in sys.argv

    print("暖阳爬虫服务器")
    print(f"控制台: http://localhost:{CONSOLE_PORT}/console.html")
    print("按 Ctrl+C 退出")

    # 先启动HTTP服务器（常驻）
    server_thread = threading.Thread(target=start_http_server, daemon=True)
    server_thread.start()
    time.sleep(0.5)

    if auto_start:
        print("[INFO] 自动启动爬虫...")
        # 直接运行 worker（阻塞直到完成）
        subprocess.run([sys.executable, "-m", "crawler.worker"], cwd=BASE_DIR)
    else:
        print('[INFO] 等待手动启动爬虫（在控制台点击"立即开爬"）')

    # 保持进程运行
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n退出")
