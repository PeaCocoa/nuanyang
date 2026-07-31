"""
爬虫进度管理器 — 实时写入 data/crawl_status.json 供控制台读取
支持从文件恢复状态（进程重启后不丢失）
"""

import json
import os
import time
import threading

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATUS_FILE = os.path.join(BASE_DIR, "data", "crawl_status.json")
SETTINGS_FILE = os.path.join(BASE_DIR, "data", "crawl_settings.json")

_lock = threading.Lock()

_default_status = {
    "state": "idle",          # idle / running / done / error
    "start_time": 0,
    "end_time": 0,
    "current_up": "",
    "current_step": "",       # searching / fetching / filtering
    "total_ups": 0,
    "done_ups": 0,
    "total_videos": 0,
    "ups": [],                # [{name, uid, categories, status, videos, error}]
    "logs": [],               # [{time, level, msg}]
    "login_required": False,
    "login_done": False,
}

# 从文件恢复状态（如果存在）
_status = dict(_default_status)
_load_ok = False

def _load_from_file():
    """从 crawl_status.json 恢复状态"""
    global _status, _load_ok
    try:
        if os.path.isfile(STATUS_FILE):
            with open(STATUS_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                # 保留文件中的状态，但 running 状态降级为 idle（进程重启说明爬虫已中断）
                if saved.get("state") == "running":
                    saved["state"] = "idle"
                    saved["current_up"] = ""
                    saved["current_step"] = ""
                _status = saved
                _load_ok = True
    except Exception:
        _status = dict(_default_status)

_load_from_file()

MAX_LOGS = 300

# =====================
# 设置管理
# =====================

_default_settings = {
    "selected_ups": [],       # 空 = 全部UP主; 非空 = 只爬选中的
    "max_videos_per_up": 50,  # 每位UP主最多保留的视频数
    "pubdate_days": 0,        # 0 = 不限制; >0 = 只取 N 天内的投稿
    "duration_min": 60,       # 最短时长（秒）
    "duration_max": 3600,     # 最长时长（秒，60分钟）
    "test_mode": False,       # 测试模式：只爬前2个UP主
    "total_limit": 800,       # 视频总数上限
    "delay_between_ups": 5,   # UP主之间的请求间隔（秒）
    "delay_between_pages": 8, # 翻页间隔（秒）
    "batch_size": 0,          # 批量大小（0=不分批）
    "batch_delay": 60,        # 批次间隔（秒）
}

def get_settings() -> dict:
    """读取爬虫设置"""
    try:
        if os.path.isfile(SETTINGS_FILE):
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                merged = dict(_default_settings)
                merged.update(saved)
                return merged
    except Exception:
        pass
    return dict(_default_settings)

def save_settings(settings: dict) -> dict:
    """保存爬虫设置"""
    merged = dict(_default_settings)
    merged.update(settings)
    try:
        os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(merged, f, ensure_ascii=False, indent=2)
    except Exception:
        pass
    return merged

# =====================
# 状态管理
# =====================

def is_running() -> bool:
    """检查爬虫是否正在运行（从文件读取，跨进程准确）"""
    with _lock:
        try:
            status_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "crawl_status.json")
            if os.path.exists(status_file):
                with open(status_file, "r", encoding="utf-8") as f:
                    saved = json.load(f)
                file_state = saved.get("state", "idle")
                _status["state"] = file_state
                return file_state == "running"
        except:
            pass
        return _status.get("state") == "running"

def init(total_ups: int, ups: list):
    """初始化状态"""
    with _lock:
        _status["state"] = "running"
        _status["start_time"] = time.time()
        _status["end_time"] = 0
        _status["current_up"] = ""
        _status["current_step"] = ""
        _status["total_ups"] = total_ups
        _status["done_ups"] = 0
        _status["total_videos"] = 0
        _status["ups"] = [{
            "name": up["name"],
            "uid": up["uid"],
            "categories": up.get("categories", []),
            "status": "pending",
            "videos": 0,
            "error": "",
        } for up in ups]
        _status["logs"] = []
        _status["login_required"] = False
        _status["login_done"] = False
    _flush()

def set_login_required():
    with _lock:
        _status["login_required"] = True
    _flush()

def set_login_done():
    with _lock:
        _status["login_done"] = True
        _status["login_required"] = False
    _flush()

def set_current(up_index: int, step: str):
    with _lock:
        if up_index < len(_status["ups"]):
            _status["current_up"] = _status["ups"][up_index]["name"]
            _status["ups"][up_index]["status"] = step
        _status["current_step"] = step
    _flush()

def update_up(up_index: int, status: str, videos: int = -1, error: str = ""):
    with _lock:
        if up_index < len(_status["ups"]):
            _status["ups"][up_index]["status"] = status
            if videos >= 0:
                _status["ups"][up_index]["videos"] = videos
            if error:
                _status["ups"][up_index]["error"] = error
        if status == "done" or status == "failed":
            _status["done_ups"] = sum(1 for u in _status["ups"] if u["status"] in ("done", "failed"))
    _flush()

def add_videos(count: int):
    with _lock:
        _status["total_videos"] += count
    _flush()

def log(msg: str, level: str = "info"):
    with _lock:
        _status["logs"].append({
            "time": time.strftime("%H:%M:%S"),
            "level": level,
            "msg": msg,
        })
        if len(_status["logs"]) > MAX_LOGS:
            _status["logs"] = _status["logs"][-MAX_LOGS:]
    _flush()

def finish(state: str = "done"):
    with _lock:
        _status["state"] = state
        _status["end_time"] = time.time()
        _status["current_up"] = ""
        _status["current_step"] = ""
        for u in _status["ups"]:
            if u["status"] not in ("done", "failed"):
                u["status"] = "skipped"
    _flush()

def get_status() -> dict:
    """从文件读取状态（兼容子进程模式）"""
    try:
        if os.path.isfile(STATUS_FILE):
            with open(STATUS_FILE, "r", encoding="utf-8") as f:
                result = json.load(f)
        else:
            with _lock:
                result = json.loads(json.dumps(_status))
        # 同时更新内存（供 is_running 使用）
        with _lock:
            _status["state"] = result.get("state", "idle")
            _status["login_required"] = result.get("login_required", False)
        # 附加设置信息
        result["settings"] = get_settings()
        return result
    except Exception:
        with _lock:
            result = json.loads(json.dumps(_status))
        result["settings"] = get_settings()
        return result

def _flush():
    """写入状态文件"""
    try:
        with _lock:
            data = json.loads(json.dumps(_status))
        os.makedirs(os.path.dirname(STATUS_FILE), exist_ok=True)
        tmp = STATUS_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, STATUS_FILE)
    except Exception:
        pass
