# -*- coding: utf-8 -*-
"""给 bilibili.py 添加 JS_SPACE_VIDEOS 和 get_up_videos 方法"""

with open('crawler/bilibili.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. 在 JS_CHECK_LOGIN 之前插入 JS_SPACE_VIDEOS
space_js = """# JavaScript：通过UID获取UP主视频列表（不需要WBI签名）
JS_SPACE_VIDEOS = \"\"\"
async (args) => {
    const url = 'https://api.bilibili.com/x/space/arc/search?mid=' + args.mid +
        '&pn=' + args.pn + '&ps=30&order=pubdate';
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.code === 0 && data.data && data.data.list && data.data.list.vlist) {
        return data.data.list.vlist.map(function(v) {
            return {
                bvid: v.bvid,
                title: v.title,
                author: v.author,
                duration: v.length,
                play: v.play,
                pubdate: v.created,
                pic: v.pic,
            };
        });
    }
    return [];
}
\"\"\"

# JavaScript：检查登录状态"""

content = content.replace('# JavaScript：检查登录状态', space_js, 1)

# 2. 在 get_video_info 之前插入 get_up_videos 方法
get_up_videos = '''    def get_up_videos(self, mid: str, page: int = 1) -> list:
        """
        通过UID直接获取UP主的视频列表（不依赖搜索，不会漏视频）

        Args:
            mid: UP主的UID
            page: 页码（每页30条）

        Returns:
            视频列表 [{bvid, title, author, duration, ...}, ...]
        """
        max_retries = 3
        for attempt in range(max_retries):
            try:
                result = self.page.evaluate(JS_SPACE_VIDEOS, {
                    "mid": str(mid),
                    "pn": str(page),
                })
                return result or []
            except Exception as e:
                err_msg = str(e)
                if "Unexpected token" in err_msg and attempt < max_retries - 1:
                    wait = (attempt + 1) * 5
                    print(f"  [WARN] 获取UP视频触发风控，{wait}秒后重试 ({attempt+1}/{max_retries})...")
                    time.sleep(wait)
                    if attempt == 1:
                        self.page.goto("https://www.bilibili.com", wait_until="domcontentloaded")
                        time.sleep(2)
                    continue
                print(f"  [ERROR] 获取UP视频失败: {e}")
                return []
        return []

    def get_video_info'''

content = content.replace('    def get_video_info', get_up_videos, 1)

with open('crawler/bilibili.py', 'w', encoding='utf-8') as f:
    f.write(content)

print('bilibili.py patched successfully')
