"""
暖阳爬虫 — B站API直接调用（无需浏览器）
使用 requests 库直接请求B站API，轻量高效
"""

import requests
import time
import random

# 风控状态
_risk_control = False

class BiliAPI:
    """B站API直接调用，不需要浏览器"""

    def __init__(self, cookie=""):
        self.session = requests.Session()
        self.cookie = cookie

        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://www.bilibili.com",
            "Origin": "https://www.bilibili.com",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        })

        if cookie:
            self.session.headers["Cookie"] = cookie

    def _check_risk_control(self, data):
        """检测是否被风控"""
        global _risk_control
        code = data.get("code", 0)
        msg = data.get("message", "")
        # B站风控code: -412（请求过于频繁）、-799（风控）
        if code in (-412, -799, -509) or "风控" in msg or "频繁" in msg:
            _risk_control = True
            return True
        return False

    def _wait_if_risk(self):
        """如果被风控，等待一段时间"""
        global _risk_control
        if _risk_control:
            wait = random.randint(30, 60)
            print(f"  [WARN] 触发风控，等待{wait}秒后继续...")
            time.sleep(wait)
            _risk_control = False

    def get_up_videos(self, mid, page=1, page_size=30):
        """
        通过UID获取UP主视频列表
        API: /x/space/arc/search
        """
        self._wait_if_risk()
        url = "https://api.bilibili.com/x/space/arc/search"
        params = {
            "mid": mid,
            "pn": page,
            "ps": page_size,
            "order": "pubdate",
        }
        try:
            resp = self.session.get(url, params=params, timeout=15)
            data = resp.json()
            if self._check_risk_control(data):
                return []
            if data.get("code") == 0 and data.get("data", {}).get("list", {}).get("vlist"):
                return data["data"]["list"]["vlist"]
            else:
                print(f"  [WARN] API返回异常: code={data.get('code')}, msg={data.get('message', '')}")
                return []
        except Exception as e:
            print(f"  [ERROR] 获取视频列表失败: {e}")
            return []

    def get_video_info(self, bvid):
        """
        获取视频详细信息
        API: /x/web-interface/view
        """
        self._wait_if_risk()
        url = "https://api.bilibili.com/x/web-interface/view"
        params = {"bvid": bvid}
        try:
            resp = self.session.get(url, params=params, timeout=15)
            data = resp.json()
            if self._check_risk_control(data):
                return None
            if data.get("code") == 0 and data.get("data"):
                d = data["data"]
                return {
                    "bvid": d.get("bvid", ""),
                    "title": d.get("title", ""),
                    "pic": d.get("pic", ""),
                    "duration": d.get("duration", 0),
                    "pubdate": d.get("pubdate", 0),
                    "view": d.get("stat", {}).get("view", 0),
                    "like": d.get("stat", {}).get("like", 0),
                    "coin": d.get("stat", {}).get("coin", 0),
                    "favorite": d.get("stat", {}).get("favorite", 0),
                    "reply": d.get("stat", {}).get("reply", 0),
                    "up_name": d.get("owner", {}).get("name", ""),
                    "up_mid": d.get("owner", {}).get("mid", 0),
                    "desc": d.get("desc", ""),
                    "tid": d.get("tid", 0),
                    "tname": d.get("tname", ""),
                }
            else:
                return None
        except Exception as e:
            print(f"  [ERROR] 获取视频详情失败 {bvid}: {e}")
            return None

    def check_accessible(self):
        """检查API是否可访问"""
        try:
            result = self.get_up_videos("254463269", page=1)
            return len(result) > 0
        except:
            return False

    def close(self):
        """关闭session"""
        self.session.close()
