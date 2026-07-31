import re

path = r"E:\claw\20260730-15-11-53-783\nuanyang\crawler\bilibili.py"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. 在JS_CHECK_LOGIN前插入新的JS_SPACE_VIDEOS
insert_code = '''# JavaScript：获取UP主视频列表（通过UID直接获取，不依赖搜索）
JS_SPACE_VIDEOS = """
async (args) => {
    const url = 'https://api.bilibili.com/x/space/wbi/arc/search?mid=' + args.mid +
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
"""

'''

marker = "# JavaScript\u68c3\u67e5\u767b\u5f55\u72b6\u6001"
content = content.replace(marker, insert_code + marker, 1)

# 2. 在BiliCrawler类的search_videos方法后添加get_up_videos方法
# 找到 get_video_info 方法定义处，在其前面插入
get_video_marker = "    def get_video_info(self, bvid: str) -> dict:"
new_method = '''    def get_up_videos(self, mid: str, page: int = 1) -> list:
        """
        通过UID直接获取UP主的视频列表（不依赖搜索）

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

'''
content = content.replace(get_video_marker, new_method + get_video_marker, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("OK - bilibili.py updated")
# Verify
with open(path, "r", encoding="utf-8") as f:
    c = f.read()
print("JS_SPACE_VIDEOS" in c, "get_up_videos" in c)
