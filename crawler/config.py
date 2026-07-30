"""
爬虫配置 — 加载 UP主列表
"""

import json
import os

# 数据文件路径（相对于项目根目录）
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPMASTERS_FILE = os.path.join(BASE_DIR, "data", "upmasters.json")
VIDEOS_FILE = os.path.join(BASE_DIR, "data", "videos.json")

# 抓取参数
SEARCH_PAGES = 5           # 每位UP主搜索的页数（每页20条）
MAX_VIDEOS_PER_UP = 50     # 每位UP主最多保留的视频数
MAX_VIDEOS_TOTAL = 800     # 视频总数上限
REQUEST_DELAY = 3          # UP主之间的请求间隔（秒）
SEARCH_PAGE_DELAY = 5      # 搜索翻页间隔（秒），B站搜索风控较严

def load_upmasters() -> list:
    """
    加载 UP主配置（支持多分类）

    Returns:
        [{"name": "毕导", "uid": 254463269, "categories": ["科普探索", "教育学习"]}, ...]
    """
    with open(UPMASTERS_FILE, "r", encoding="utf-8") as f:
        config = json.load(f)

    upmasters = []
    for up in config.get("upmasters", []):
        upmasters.append({
            "name": up["name"],
            "uid": up["uid"],
            "categories": up.get("categories", []),
        })

    return upmasters

def load_all_categories() -> list:
    """
    加载所有板块分类（去重）

    Returns:
        ["科普探索", "教育学习", ...]
    """
    upmasters = load_upmasters()
    seen = set()
    for up in upmasters:
        for cat in up.get("categories", []):
            seen.add(cat)
    return sorted(seen)
