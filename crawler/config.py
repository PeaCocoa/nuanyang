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
SEARCH_PAGES = 2           # 每位UP主搜索的页数（每页20条）
MAX_VIDEOS_PER_UP = 5      # 每位UP主最多保留的视频数
MAX_VIDEOS_TOTAL = 200     # 视频总数上限
REQUEST_DELAY = 3          # UP主之间的请求间隔（秒）
SEARCH_PAGE_DELAY = 5      # 搜索翻页间隔（秒），B站搜索风控较严

def load_upmasters() -> list[dict]:
    """
    加载 UP主配置

    Returns:
        [{"name": "罗翔说刑法", "uid": 517327498, "category": "知识科普"}, ...]
    """
    with open(UPMASTERS_FILE, "r", encoding="utf-8") as f:
        config = json.load(f)

    upmasters = []
    for category, ups in config.get("categories", {}).items():
        for up in ups:
            upmasters.append({
                "name": up["name"],
                "uid": up["uid"],
                "category": category,
            })

    return upmasters
