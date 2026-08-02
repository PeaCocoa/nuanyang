import sys, os, json, hashlib, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crawler.bilibili import BiliCrawler

c = BiliCrawler(headless=True)
c.start()
print("Login:", c.is_logged_in())

# 手动测试 wbi 签名流程
# 1. 获取 wbi 密钥
wbi_keys = c.page.evaluate(r"""
async () => {
    const resp = await fetch('https://api.bilibili.com/x/web-interface/nav', {credentials: 'include'});
    const data = await resp.json();
    if (data.code === 0 && data.data && data.data.wbi_img) {
        return {
            imgKey: data.data.wbi_img.img_url.split('/').pop().split('.')[0],
            subKey: data.data.wbi_img.sub_url.split('/').pop().split('.')[0]
        };
    }
    return null;
}
""")
print("wbi_keys:", wbi_keys)

if wbi_keys:
    # 2. Python端计算wbi签名
    mixin_key_enc_tab = [
        46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,
        27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,
        37,36,25,24,30,48,51,40,44,17,20,4,0,6,52,21,
        22,11,1,55,26,34,7,16,57,56,54,59,61,60,63,62
    ]
    orig = wbi_keys['imgKey'] + wbi_keys['subKey']
    mixin_key = ''.join(orig[i] for i in mixin_key_enc_tab)
    
    wts = int(time.time())
    params = {'mid': '254463269', 'pn': '1', 'ps': '30', 'order': 'pubdate', 'wts': wts}
    query = '&'.join(f'{k}={v}' for k, v in sorted(params.items()))
    w_rid = hashlib.md5((query + mixin_key).encode()).hexdigest()
    
    url = f'https://api.bilibili.com/x/space/wbi/arc/search?{query}&w_rid={w_rid}'
    print(f"\nSigned URL (first 100 chars): {url[:100]}...")
    
    # 3. 浏览器fetch
    result = c.page.evaluate(r"""
async (url) => {
    const resp = await fetch(url, {credentials: 'include'});
    const data = await resp.json();
    return {
        code: data.code,
        message: data.message,
        count: data.data && data.data.list && data.data.list.vlist ? data.data.list.vlist.length : 0,
        firstTitle: data.data && data.data.list && data.data.list.vlist && data.data.list.vlist[0] ? data.data.list.vlist[0].title : 'none'
    };
}
""", url)
    print("\nResult:", json.dumps(result, ensure_ascii=False, indent=2))

c.close()
