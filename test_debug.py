import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crawler.bilibili import BiliCrawler

c = BiliCrawler(headless=True)
c.start()

# 直接测试各种API的返回码
r = c.page.evaluate(r"""
async () => {
    const results = {};
    
    // 1. nav API
    try {
        const r1 = await fetch('https://api.bilibili.com/x/web-interface/nav', {credentials: 'include'});
        const d1 = await r1.json();
        results.nav = d1.code;
    } catch(e) { results.nav = 'error: ' + e.message; }
    
    // 2. arc/search (no wbi)
    try {
        const r2 = await fetch('https://api.bilibili.com/x/space/arc/search?mid=254463269&pn=1&ps=1&order=pubdate', {credentials: 'include'});
        const d2 = await r2.json();
        results.arc_search = d2.code;
        results.arc_search_msg = d2.message;
    } catch(e) { results.arc_search = 'error: ' + e.message; }
    
    // 3. wbi keys
    try {
        const r3 = await fetch('https://api.bilibili.com/x/web-interface/nav', {credentials: 'include'});
        const d3 = await r3.json();
        if (d3.code === 0 && d3.data && d3.data.wbi_img) {
            results.wbi_keys = 'available';
        } else {
            results.wbi_keys = 'unavailable (nav code: ' + d3.code + ')';
        }
    } catch(e) { results.wbi_keys = 'error: ' + e.message; }
    
    // 4. Cookie检查
    results.cookies = document.cookie.length > 0 ? 'has cookies (' + document.cookie.length + ' chars)' : 'no cookies';
    
    return results;
}
""")
print(json.dumps(r, ensure_ascii=False, indent=2))
c.close()
