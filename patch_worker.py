# -*- coding: utf-8 -*-
"""给 worker.py 把 search_up_videos 改为 fetch_up_videos（UID直接拉取）"""

with open('crawler/worker.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    
    # 替换 search_up_videos 函数定义
    if line.strip() == 'def search_up_videos(crawler, up_name, exact_name):':
        # 写入新的 fetch_up_videos 函数
        new_func = '''def fetch_up_videos(crawler, uid, up_name):
    """通过UID直接拉取UP主视频列表（不依赖搜索，不会漏视频）"""
    all_results = []
    for page in range(1, SEARCH_PAGES + 1):
        results = crawler.get_up_videos(uid, page=page)
        if not results:
            break
        all_results.extend(results)
        log(f"  第{page}页: {len(results)}条视频")
        if page < SEARCH_PAGES:
            time.sleep(SEARCH_PAGE_DELAY)

    seen = set()
    unique = []
    for v in all_results:
        if v["bvid"] not in seen:
            seen.add(v["bvid"])
            unique.append(v)
    return unique
'''
        new_lines.append(new_func)
        # 跳过原函数直到 def fetch_video_details
        i += 1
        while i < len(lines) and not lines[i].startswith('def fetch_video_details'):
            i += 1
        continue
    
    # 替换测试搜索调用
    if 'test_results = crawler.search_videos("罗翔说刑法", page=1)' in line:
        new_lines.append(line.replace(
            'test_results = crawler.search_videos("罗翔说刑法", page=1)',
            'test_results = crawler.get_up_videos("254463269", page=1)'
        ))
        i += 1
        continue
    
    # 替换测试搜索的日志
    if 'test_results' in line and '搜索返回' in line:
        new_lines.append(line.replace('搜索返回', '获取到'))
        i += 1
        continue
    
    # 替换主循环中的调用
    if 'search_results = search_up_videos(crawler, name, name)' in line:
        new_lines.append(line.replace(
            'search_results = search_up_videos(crawler, name, name)',
            'search_results = fetch_up_videos(crawler, uid, name)'
        ))
        i += 1
        continue
    
    new_lines.append(line)
    i += 1

with open('crawler/worker.py', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('worker.py patched successfully')
