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

# JavaScript：通过URL fetch获取视频列表（URL由Python端构建含wbi签名）
JS_FETCH_VIDEOS = r"""
async (url) => {
    const resp = await fetch(url, {credentials: 'include'});
    const data = await resp.json();
    if (data.code === 0 && data.data && data.data.list && data.data.list.vlist) {
        return data.data.list.vlist.map(function(v) {
            return {bvid: v.bvid, title: v.title, author: v.author, duration: v.length, play: v.play, pubdate: v.created, pic: v.pic};
        });
    }
    return [];
}
"""

# JavaScript：获取nav API返回的wbi密钥（从页面上下文）
JS_GET_WBI_KEYS = r"""
async () => {
    try {
        const resp = await fetch('https://api.bilibili.com/x/web-interface/nav', {credentials: 'include'});
        const data = await resp.json();
        if (data.code === 0 && data.data && data.data.wbi_img) {
            return {
                imgKey: data.data.wbi_img.img_url.split('/').pop().split('.')[0],
                subKey: data.data.wbi_img.sub_url.split('/').pop().split('.')[0]
            };
        }
    } catch(e) {}
    return null;
}
"""

# JavaScript：检查登录状态
# B站nav API在非headless也可能返回-101，但Cookie实际有效
# 通过尝试访问空间API判断：-799(频繁)和-352(风控)都说明Cookie被识别
JS_CHECK_LOGIN = """
async () => {
    try {
        const resp = await fetch('https://api.bilibili.com/x/space/arc/search?mid=254463269&pn=1&ps=1&order=pubdate');
        const data = await resp.json();
        // 0=成功, -799=请求频繁, -352=风控校验 → 都说明Cookie有效
        return data.code === 0 || data.code === -799 || data.code === -352;
    } catch(e) {
        return false;
    }
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
        """启动浏览器，加载已保存的登录状态
        
        注意：B站在headless模式下会拒绝识别登录态（nav返回-101），
        因此始终使用非headless模式运行。浏览器窗口会最小化以减少干扰。
        """
        self.playwright = sync_playwright().start()
        os.makedirs(AUTH_DIR, exist_ok=True)

        launch_args = [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-extensions",
            "--remote-debugging-port=0",
        ]
        # 始终用非headless模式，B站headless模式不识别登录态
        self.context = self.playwright.chromium.launch_persistent_context(
            user_data_dir=AUTH_DIR,
            headless=False,
            viewport={"width": 1280, "height": 800},
            locale="zh-CN",
            args=launch_args,
        )
        self.page = self.context.pages[0] if self.context.pages else self.context.new_page()

        # 导航到B站，检查登录状态
        self.page.goto("https://www.bilibili.com", wait_until="domcontentloaded")
        time.sleep(2)

        if self.is_logged_in():
            print("[INFO] 登录状态有效")
        else:
            # 未登录，需要扫码
            print("[INFO] 未登录，需要扫码登录B站...")
            self._login()
            # 登录后保持非headless模式，不切换
            time.sleep(1)

    def _login(self):
        """打开B站登录页面，等待用户扫码登录"""
        self.page.goto("https://passport.bilibili.com/login", wait_until="networkidle")
        print("=" * 50)
        print("请在弹出的浏览器窗口中扫码登录B站")
        print("登录成功后程序会自动继续...")
        print("=" * 50)

        # 轮询检测 Cookie 中是否出现 SESSDATA（登录成功标志）
        max_wait = 60  # 最多等30分钟（每30秒检测一次）
        logged = False
        for i in range(max_wait):
            time.sleep(30)
            if i > 0 and i % 2 == 0:
                print(f"[INFO] 等待扫码登录... ({(i+1)*30}s)")
            # 检查 Cookie 是否已包含 SESSDATA
            cookies = self.context.cookies("https://www.bilibili.com")
            for c in cookies:
                if c["name"] == "SESSDATA" and len(c["value"]) > 10:
                    logged = True
                    break
            if logged:
                break

        if logged:
            print("[INFO] 登录成功！Cookie已保存")
            # 导航到B站首页，确保Cookie正确写入
            self.page.goto("https://www.bilibili.com", wait_until="domcontentloaded")
            time.sleep(2)
            # 在B站首页上下文验证登录状态（同域，Cookie会正确携带）
            if self.is_logged_in():
                print("[INFO] 登录状态验证通过")
            else:
                print("[WARN] Cookie检测通过，nav验证未通过，继续尝试...")
        else:
            print("[WARN] 等待登录超时（30分钟），继续尝试...")
            time.sleep(2)

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
        max_retries = 5
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
                    wait = [20, 30, 50, 30, 20][attempt]
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

    def get_up_videos(self, mid: str, page: int = 1) -> list:
        """
        通过导航到B站空间页，拦截页面自身的wbi签名API响应获取视频列表
        页面浏览走完整wbi签名（包含所有必要参数），不会触发风控
        含3次重试机制
        """
        max_retries = 3
        for attempt in range(max_retries):
            captured = []
            api_received = False

            def _on_response(resp):
                nonlocal api_received
                if 'arc/search' in resp.url and 'wbi' in resp.url:
                    try:
                        data = resp.json()
                        if data.get('code') == 0 and data.get('data', {}).get('list', {}).get('vlist'):
                            captured.extend(data['data']['list']['vlist'])
                            api_received = True
                    except:
                        pass

            self.page.on('response', _on_response)

            try:
                url = f"https://space.bilibili.com/{mid}/video?pn={page}&ps=30&order=pubdate"
                self.page.goto(url, wait_until='networkidle', timeout=60000)
                # 多等2秒确保response处理完成
                time.sleep(2)
                
                if api_received and captured:
                    break
                if attempt < max_retries - 1:
                    print(f"  [WARN] 第{page}页未捕获到数据，重试({attempt+1}/{max_retries})...")
                    time.sleep(3)
            except Exception as e:
                if attempt < max_retries - 1:
                    print(f"  [WARN] 页面加载失败: {e}，重试({attempt+1}/{max_retries})...")
                    time.sleep(5)
                else:
                    print(f"  [ERROR] 第{page}页获取失败(已重试{max_retries}次): {e}")
            finally:
                try:
                    self.page.remove_listener('response', _on_response)
                except:
                    pass

        result = []
        for v in captured:
            result.append({
                'bvid': v.get('bvid', ''),
                'title': v.get('title', ''),
                'author': v.get('author', ''),
                'duration': v.get('length', 0),
                'play': v.get('play', 0),
                'pubdate': v.get('created', 0),
                'pic': v.get('pic', ''),
            })
        return result

    def close(self):
        """关闭浏览器，保存登录状态"""
        if self.context:
            self.context.close()
        if self.playwright:
            self.playwright.stop()
