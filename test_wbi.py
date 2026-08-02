import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crawler.bilibili import BiliCrawler

c = BiliCrawler(headless=True)
c.start()
print("Login:", c.is_logged_in())

JS_WBI_TEST = r"""
async () => {
    const navResp = await fetch('https://api.bilibili.com/x/web-interface/nav');
    const navData = await navResp.json();
    if (navData.code !== 0) return {error: 'nav failed', code: navData.code};
    
    const imgKey = navData.data.wbi_img.img_url.split('/').pop().split('.')[0];
    const subKey = navData.data.wbi_img.sub_url.split('/').pop().split('.')[0];
    
    const mixinKeyEncTab = [
        46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,
        27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,
        37,36,25,24,30,48,51,40,44,17,20,4,0,6,52,21,
        22,11,1,55,26,34,7,16,57,56,54,59,61,60,63,62
    ];
    
    function getMixinKey(orig) {
        let temp = '';
        for (let i = 0; i < 32; i++) {
            temp += orig.charAt(mixinKeyEncTab[i]);
        }
        return temp;
    }
    
    const mixinKey = getMixinKey(imgKey + subKey);
    const wts = Math.floor(Date.now() / 1000);
    const params = {mid: '254463269', pn: '1', ps: '5', order: 'pubdate', wts: wts};
    
    const sortedKeys = Object.keys(params).sort();
    const queryParts = sortedKeys.map(k => k + '=' + params[k]);
    const query = queryParts.join('&');
    
    // MD5 hash using crypto.subtle
    const encoder = new TextEncoder();
    const data = encoder.encode(query + mixinKey);
    const hashBuffer = await crypto.subtle.digest('MD5', data);
    const wRidHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    const finalUrl = 'https://api.bilibili.com/x/space/wbi/arc/search?' + query + '&w_rid=' + wRidHex;
    const resp2 = await fetch(finalUrl);
    const data2 = await resp2.json();
    
    return {
        code: data2.code,
        message: data2.message,
        count: data2.data && data2.data.list && data2.data.list.vlist ? data2.data.list.vlist.length : 0,
        firstTitle: data2.data && data2.data.list && data2.data.list.vlist && data2.data.list.vlist[0] ? data2.data.list.vlist[0].title : 'none'
    };
}
"""

r = c.page.evaluate(JS_WBI_TEST)
print(json.dumps(r, ensure_ascii=False, indent=2))
c.close()
