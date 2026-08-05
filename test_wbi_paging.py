#!/usr/bin/env python3
"""
测试WBI签名翻页是否正常工作
验证：第1页和第2页应该返回不同的视频
"""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crawler.bilibili import BiliCrawler

crawler = BiliCrawler(headless=False)
crawler.start()

mid = "254463269"  # 毕导
print("\n=== 测试翻页 ===")

all_bvids = set()
for page in range(1, 4):
    print(f"\n--- 第 {page} 页 ---")
    results = crawler.get_up_videos(mid, page=page)
    print(f"获取到 {len(results)} 条视频")

    if not results:
        print("无数据，停止")
        break

    page_bvids = set()
    for v in results[:3]:
        print(f"  {v.get('bvid','')} | {v.get('title','')[:30]}")
        page_bvids.add(v.get('bvid', ''))

    # 检查是否有重复
    overlap = page_bvids & all_bvids
    if overlap:
        print(f"  [WARN] 与之前页面重复的bvid: {overlap}")
    else:
        print(f"  [OK] 无重复，翻页正常")

    all_bvids.update(page_bvids)
    all_bvids.update(v.get('bvid', '') for v in results)

    if page < 3:
        time.sleep(2)

print(f"\n=== 总计 {len(all_bvids)} 个不重复bvid ===")
crawler.close()
