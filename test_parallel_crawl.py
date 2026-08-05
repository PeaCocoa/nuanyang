#!/usr/bin/env python3
"""
多标签页并行爬虫测试脚本（async 版）
同一 BrowserContext 下开多个 Page，同时爬多个 UP 主

运行方式：
  cd nuanyang
  python test_parallel_crawl.py
"""

import os
import sys
import time
import asyncio

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from playwright.async_api import async_playwright

AUTH_DIR = os.path.join(BASE_DIR, "auth")

TEST_UPS = [
    {"name": "毕导", "uid": 254463269, "categories": ["科普探索"]},
    {"name": "罗翔说刑法", "uid": 517327498, "categories": ["教育学习"]},
    {"name": "影视飓风", "uid": 946974, "categories": ["影视娱乐"]},
    {"name": "老师好我叫何同学", "uid": 163637592, "categories": ["科技数码"]},
]


async def crawl_one_up(context, up, page_index):
    """在一个独立 Page 中爬取一个 UP 主的视频列表"""
    page = await context.new_page()
    start = time.time()
    captured = []
    api_received = False

    async def _on_response(resp):
        nonlocal api_received
        if 'arc/search' in resp.url and 'wbi' in resp.url:
            try:
                data = await resp.json()
                if data.get('code') == 0 and data.get('data', {}).get('list', {}).get('vlist'):
                    captured.extend(data['data']['list']['vlist'])
                    api_received = True
            except:
                pass

    page.on('response', _on_response)

    try:
        uid = up["uid"]
        name = up["name"]
        url = f"https://space.bilibili.com/{uid}/video?pn=1&ps=30&order=pubdate"
        await page.goto(url, wait_until='networkidle', timeout=60000)
        await asyncio.sleep(2)

        titles = [v.get('title', '') for v in captured[:5]]
        elapsed = time.time() - start
        print(f"  [{page_index+1}] {name}: {len(captured)} 条视频, 耗时 {elapsed:.1f}s")
        return (page_index, name, len(captured), elapsed, titles)
    except Exception as e:
        elapsed = time.time() - start
        print(f"  [{page_index+1}] {up['name']}: ERROR: {e}, 耗时 {elapsed:.1f}s")
        return (page_index, up["name"], 0, elapsed, [f"ERROR: {e}"])
    finally:
        await page.close()


async def crawl_one_up_serial(context, up, page_index):
    """串行版（对比用）"""
    return await crawl_one_up(context, up, page_index)


async def main():
    print("=" * 60)
    print("多标签页并行爬虫测试 (async)")
    print(f"测试 UP 主数: {len(TEST_UPS)} (每人爬 1 页)")
    print("=" * 60)

    pw = await async_playwright().start()
    os.makedirs(AUTH_DIR, exist_ok=True)

    context = await pw.chromium.launch_persistent_context(
        user_data_dir=AUTH_DIR,
        headless=False,
        viewport={"width": 1280, "height": 800},
        locale="zh-CN",
        args=[
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-extensions",
        ],
    )

    # 检查登录状态
    main_page = context.pages[0] if context.pages else await context.new_page()
    await main_page.goto("https://www.bilibili.com", wait_until="domcontentloaded")
    await asyncio.sleep(2)

    cookies = await context.cookies("https://www.bilibili.com")
    has_sessdata = any(c["name"] == "SESSDATA" and len(c["value"]) > 10 for c in cookies)
    if has_sessdata:
        print("[INFO] 检测到登录 Cookie，开始测试\n")
    else:
        print("[WARN] 未检测到登录 Cookie，API 可能无返回\n")

    # === 并行测试 ===
    print(f"--- 并行模式: {len(TEST_UPS)} 个标签页同时爬 ---")
    t0 = time.time()

    tasks = [crawl_one_up(context, up, i) for i, up in enumerate(TEST_UPS)]
    parallel_results = await asyncio.gather(*tasks)

    parallel_time = time.time() - t0
    print(f"\n并行总耗时: {parallel_time:.1f}s\n")

    # === 串行对比测试 ===
    print(f"--- 串行模式: 逐个爬取（对比） ---")
    t0 = time.time()
    serial_results = []

    for i, up in enumerate(TEST_UPS):
        result = await crawl_one_up_serial(context, up, i)
        serial_results.append(result)

    serial_time = time.time() - t0
    print(f"\n串行总耗时: {serial_time:.1f}s\n")

    # === 汇总 ===
    print("=" * 60)
    print("测试结果汇总")
    print("=" * 60)
    print(f"{'UP主':<16} {'并行':>12} {'串行':>12} {'匹配':>6}")
    print("-" * 52)

    parallel_results.sort(key=lambda x: x[0])
    serial_results.sort(key=lambda x: x[0])

    for i in range(len(TEST_UPS)):
        _, p_name, p_count, p_time, _ = parallel_results[i]
        _, s_name, s_count, s_time, _ = serial_results[i]
        match = "OK" if p_count == s_count else "DIFF"
        print(f"{p_name:<16} {p_count:>4}条/{p_time:.1f}s  {s_count:>4}条/{s_time:.1f}s  {match:>6}")

    print("-" * 52)
    print(f"{'总计':<16} {parallel_time:>8.1f}s      {serial_time:>8.1f}s")
    speedup = serial_time / parallel_time if parallel_time > 0 else 0
    print(f"加速比: {speedup:.2f}x")

    # 检查数据一致性
    all_match = all(
        parallel_results[i][2] == serial_results[i][2]
        for i in range(len(TEST_UPS))
    )
    if all_match:
        print("\n[OK] 并行与串行结果完全一致")
    else:
        print("\n[WARN] 并行与串行结果有差异（可能是B站返回数据波动）")

    print("=" * 60)

    await context.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(main())
