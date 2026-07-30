"""
B站 API 封装 — Playwright 浏览器自动化版本
通过真实浏览器上下文调用B站API，绕过风控
首次运行需扫码登录，之后自动复用Cookie
"""

import os
import time
from playwright.sync_api import sync_playwright, Browser, BrowserContext, Page

# Cookie持久化路径
AUTH_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "auth")

# B站搜索API（不需要WBI签名，需要Cookie）
SEARCH_API = "https://api.bilibili.com/x/web-interface/search/type"
# B站视频详情API（不需要WBI签名，需要Cookie）
VIEW_API = "https://api.bilibili.com/x/web-interface/view"

# JavaScript：搜索视频（通过参数传递，避免f-string冲突）
JS_SEARCH = """
async (args) => {
    const url = args.api + '?search_type=video&keyword=' +
        encodeURIComponent(args.keyword) +
        '&order=' + args.order + '&page=' + args.page;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.code === 0 && data.data && data.data.result) {
        return data.data.result.map(function(v) {
            return {
                bvid: v.bvid,
                title: v.title.replace(/<[^>]+>/g, ''),
                author: v.author,
                duration: v.duration,
                play: v.play,
                pubdate: v.pubdate,
                pic: v.pic,
            };
        });
    }
    return [];
}
"""

# JavaScript：获取视频详情
JS_VIEW = """
async (bvid) => {
    const resp = await fetch('https://api.bilibili.com/x/web-interface/view?bvid=' + bvid);
    const data = await resp.json();
    if (data.code === 0 && data.data) {
        var d = data.data;
        return {
            bvid: d.bvid,
            title: d.title,
            pic: d.pic,
            duration: d.duration,
            pubdate: d.pubdate,
            view: d.stat ? d.stat.view : 0,
            like: d.stat ? d.stat.like : 0,
            up_name: d.owner ? d.owner.name : '',
        };
    }
    return null;
}
"""

# JavaScript：检查登录状态
JS_CHECK_LOGIN = """
async () => {
    const resp = await fetch('https://api.bilibili.com/x/web-interface/nav');
    const data = await resp.json();
    return data.code === 0 && data.data && data.data.isLogin;
}
"""


class BiliCrawler:
    """B站爬虫 — 基于 Playwright 浏览器自动化"""

    def __init__(self, headless: bool = False):
        """
        Args:
            headless: 是否无头模式运行（首次登录需设为 False）
        """
        self.headless = headless
        self.playwright = None
        self.browser: Browser = None
        self.context: BrowserContext = None
        self.page: Page = None

    def start(self):
        """启动浏览器，加载已保存的登录状态"""
        self.playwright = sync_playwright().start()
        os.makedirs(AUTH_DIR, exist_ok=True)

        # 始终用持久化上下文启动（Cookie会自动保存）
        # 使用 args 绕过 sandbox 权限问题
        # --remote-debugging-port 替代默认的 pipe，避免子进程管道通信问题
        launch_args = [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-extensions",
            "--remote-debugging-port=0",
        ]
        self.context = self.playwright.chromium.launch_persistent_context(
            user_data_dir=AUTH_DIR,
            headless=self.headless,
            viewport={"width": 1280, "height": 800},
            locale="zh-CN",
            args=launch_args,
        )
        self.page = self.context.pages[0] if self.context.pages else self.context.new_page()

        # 先导航到B站，再检查登录状态
        self.page.goto("https://www.bilibili.com", wait_until="domcontentloaded")
        time.sleep(2)

        if self.is_logged_in():
            print("[INFO] 登录状态有效")
        else:
            # 未登录，需要弹出浏览器让用户扫码
            print("[INFO] 未登录，需要扫码登录B站...")
            # 重新以非无头模式启动
            self.context.close()
            self.context = self.playwright.chromium.launch_persistent_context(
                user_data_dir=AUTH_DIR,
                headless=False,
                viewport={"width": 1280, "height": 800},
                locale="zh-CN",
                args=launch_args,
            )
            self.page = self.context.pages[0] if self.context.pages else self.context.new_page()
            self._login()

    def _login(self):
        """打开B站登录页面，等待用户扫码登录"""
        self.page.goto("https://passport.bilibili.com/login", wait_until="networkidle")
        print("=" * 50)
        print("请在弹出的浏览器窗口中扫码登录B站")
        print("登录成功后程序会自动继续...")
        print("=" * 50)

        # 等待登录成功：URL跳转 或 页面出现用户头像
        logged = False
        try:
            self.page.wait_for_url("**/www.bilibili.com**", timeout=120000)
            logged = True
        except Exception:
            try:
                self.page.wait_for_selector(".header-login-entry", state="detached", timeout=120000)
                logged = True
            except Exception:
                print("[WARN] 等待登录超时，继续尝试...")

        if logged:
            print("[INFO] 登录成功！")
            # 导航到桌面版B站首页，确保Cookie正确写入
            self.page.goto("https://www.bilibili.com", wait_until="domcontentloaded")
            time.sleep(3)
            # 验证登录状态
            if self.is_logged_in():
                print("[INFO] 登录状态验证通过")
            else:
                print("[WARN] 登录状态验证未通过，但继续尝试...")
        else:
            time.sleep(3)

    def is_logged_in(self) -> bool:
        """检查是否已登录"""
        try:
            result = self.page.evaluate(JS_CHECK_LOGIN)
            return result
        except Exception:
            return False

    def search_videos(self, keyword: str, page: int = 1, order: str = "pubdate") -> list:
        """
        搜索视频（浏览器内fetch，自动携带Cookie）
        含重试机制：B站风控会间歇性返回HTML而非JSON

        Args:
            keyword: 搜索关键词（UP主名称）
            page: 页码
            order: 排序方式 (pubdate/latest/click/stow)

        Returns:
            视频列表 [{bvid, title, author, duration, ...}, ...]
        """
        max_retries = 3
        for attempt in range(max_retries):
            try:
                result = self.page.evaluate(JS_SEARCH, {
                    "api": SEARCH_API,
                    "keyword": keyword,
                    "order": order,
                    "page": str(page),
                })
                return result or []
            except Exception as e:
                err_msg = str(e)
                if "Unexpected token" in err_msg and attempt < max_retries - 1:
                    # B站返回了HTML（风控），等待后重试
                    wait = (attempt + 1) * 5
                    print(f"  [WARN] 搜索触发风控，{wait}秒后重试 ({attempt+1}/{max_retries})...")
                    time.sleep(wait)
                    # 导航回B站首页刷新Cookie状态
                    if attempt == 1:
                        self.page.goto("https://www.bilibili.com", wait_until="domcontentloaded")
                        time.sleep(2)
                    continue
                print(f"  [ERROR] 搜索失败: {e}")
                return []
        return []

    def get_video_info(self, bvid: str) -> dict:
        """
        获取单个视频详细信息（浏览器内fetch）

        Args:
            bvid: 视频 BV 号

        Returns:
            {bvid, title, pic, duration, pubdate, view, like, up_name}
        """
        try:
            result = self.page.evaluate(JS_VIEW, bvid)
            return result
        except Exception as e:
            print(f"  [ERROR] 获取视频详情失败 {bvid}: {e}")
            return None

    def close(self):
        """关闭浏览器，保存登录状态"""
        if self.context:
            self.context.close()
        if self.playwright:
            self.playwright.stop()
