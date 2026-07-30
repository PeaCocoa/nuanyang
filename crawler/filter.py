"""
内容筛选 — 从抓取的视频中筛选适合老年人观看的内容
"""

import re
from datetime import datetime, timedelta


# 筛选参数
MAX_VIDEO_DURATION = 900       # 最长 15 分钟（秒）
MIN_VIDEO_DURATION = 60        # 最短 1 分钟（秒）
MAX_VIDEOS_PER_UP = 5          # 每位UP主最多取最近 5 条
DAYS_BACK = 30                 # 只取最近 30 天内的视频

# 标题关键词排除（不适老内容）
EXCLUDE_KEYWORDS = [
    "抽奖", "恰饭", "广告", "推广", "赞助",
    "恐怖", "惊悚", "血腥", "暴力",
    "擦边", "色情", "低俗",
]

# 标题关键词优先（明显适老内容）
PRIORITY_KEYWORDS = [
    "健康", "养生", "历史", "文化", "传统",
    "美食", "做菜", "烹饪", "风景", "自然",
    "科普", "知识", "故事", "人物",
]


def filter_video(video: dict) -> bool:
    """
    判断单个视频是否符合筛选条件

    Args:
        video: B站 API 返回的视频条目

    Returns:
        True 表示通过筛选
    """
    title = video.get("title", "")
    duration = video.get("length", 0)  # 秒
    pubdate = video.get("pubdate", 0)  # Unix 时间戳

    # 时长筛选
    if duration < MIN_VIDEO_DURATION or duration > MAX_VIDEO_DURATION:
        return False

    # 时间筛选
    if pubdate > 0:
        pub_time = datetime.fromtimestamp(pubdate)
        cutoff = datetime.now() - timedelta(days=DAYS_BACK)
        if pub_time < cutoff:
            return False

    # 排除关键词
    for kw in EXCLUDE_KEYWORDS:
        if kw in title:
            return False

    return True


def calculate_priority(video: dict) -> int:
    """
    计算视频优先级分数（越高越优先推荐）

    Args:
        video: 视频条目

    Returns:
        优先级分数
    """
    score = 0
    title = video.get("title", "")
    play_count = video.get("play", 0)
    like_count = video.get("like", 0)

    # 播放量加分
    if play_count > 100000:
        score += 30
    elif play_count > 50000:
        score += 20
    elif play_count > 10000:
        score += 10

    # 点赞量加分
    if like_count > 10000:
        score += 20
    elif like_count > 5000:
        score += 10

    # 优先关键词加分
    for kw in PRIORITY_KEYWORDS:
        if kw in title:
            score += 15
            break

    return score


def extract_video_data(video: dict, up_name: str, category: str) -> dict:
    """
    从 B站 API 响应中提取需要的字段

    Args:
        video: B站 API 返回的视频条目
        up_name: UP主名称
        category: 分类

    Returns:
        精简后的视频信息 dict
    """
    bvid = video.get("bvid", "")
    return {
        "bvid": bvid,
        "title": _strip_html(video.get("title", "")),
        "cover": video.get("pic", "").replace("http://", "https://"),
        "duration": video.get("length", 0),
        "duration_text": _format_duration(video.get("length", 0)),
        "pubdate": video.get("pubdate", 0),
        "play": video.get("play", 0),
        "like": video.get("like", 0),
        "up_name": up_name,
        "category": category,
        "url": f"https://www.bilibili.com/video/{bvid}",
        "iframe_url": f"//player.bilibili.com/player.html?bvid={bvid}&high_quality=1&danmaku=0",
        "priority": calculate_priority(video),
    }


def _strip_html(text: str) -> str:
    """去除标题中的 HTML 标签"""
    return re.sub(r"<[^>]+>", "", text)


def _format_duration(seconds: int) -> str:
    """秒数转 mm:ss 格式"""
    m, s = divmod(seconds, 60)
    return f"{m:02d}:{s:02d}"
