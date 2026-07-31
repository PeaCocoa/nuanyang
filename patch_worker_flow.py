# -*- coding: utf-8 -*-
"""补丁脚本：让 worker.py 支持流程图式工作流"""

filepath = "crawler/worker.py"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. 替换 load_workflow 和 get_workflow_upmasters
old_wf_funcs = '''def load_workflow():
    """加载当前工作流配置（如果存在）"""
    wf_file = os.path.join(BASE_DIR, "data", "current_workflow.json")
    if not os.path.isfile(wf_file):
        return None
    try:
        with open(wf_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def get_workflow_upmasters(wf):
    """根据工作流配置构建UP主列表"""
    wf_ups = wf.get("ups", [])
    if not wf_ups:
        # 没有自定义UP列表，用全部
        return load_upmasters()

    # 按工作流中的顺序和配置构建
    result = []
    for wu in wf_ups:
        if not wu.get("enabled", True):
            continue
        repeat = wu.get("repeat", 1)
        for _ in range(repeat):
            result.append({
                "name": wu["name"],
                "uid": wu["uid"],
                "categories": wu.get("categories", []),
            })
    return result'''

new_wf_funcs = '''def load_workflow():
    """加载当前工作流配置（如果存在）"""
    wf_file = os.path.join(BASE_DIR, "data", "current_workflow.json")
    if not os.path.isfile(wf_file):
        return None
    try:
        with open(wf_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def parse_flow_nodes(wf):
    """从流程图工作流中提取UP主列表和配置"""
    nodes = wf.get("nodes", [])
    if not nodes:
        # 旧格式兼容
        return get_workflow_upmasters(wf), wf.get("config", {})

    upmasters = []
    delay_seconds = REQUEST_DELAY
    filter_config = {}
    has_push = False

    for node in nodes:
        ntype = node.get("type", "")
        data = node.get("data", {})

        if ntype == "up":
            uid_str = str(data.get("uid", "")).strip()
            if not uid_str:
                continue
            try:
                uid = int(uid_str)
            except ValueError:
                continue
            name = data.get("uname", f"UP主{uid}")
            cats_str = data.get("categories", "")
            categories = [c.strip() for c in cats_str.split(",") if c.strip()] if cats_str else []
            repeat = max(1, int(data.get("repeat", "1") or "1"))
            for _ in range(repeat):
                upmasters.append({"name": name, "uid": uid, "categories": categories})

        elif ntype == "delay":
            try:
                delay_seconds = int(data.get("seconds", "30"))
            except ValueError:
                delay_seconds = 30

        elif ntype == "filter":
            try:
                filter_config["duration_min"] = int(data.get("duration_min", "60"))
            except ValueError:
                filter_config["duration_min"] = 60
            try:
                filter_config["duration_max"] = int(data.get("duration_max", "3600"))
            except ValueError:
                filter_config["duration_max"] = 3600
            try:
                filter_config["pubdate_days"] = int(data.get("pubdate_days", "0"))
            except ValueError:
                filter_config["pubdate_days"] = 0

        elif ntype == "push":
            has_push = True

    config = {
        "total_limit": wf.get("config", {}).get("total_limit", MAX_VIDEOS_TOTAL),
        "delay_between_ups": delay_seconds,
        "delay_between_pages": SEARCH_PAGE_DELAY,
        "stop_after_done": True,
        "filter": filter_config,
        "has_push": has_push,
    }
    return upmasters, config


def get_workflow_upmasters(wf):
    """根据工作流配置构建UP主列表（旧格式兼容）"""
    wf_ups = wf.get("ups", [])
    if not wf_ups:
        # 没有自定义UP列表，用全部
        return load_upmasters()

    # 按工作流中的顺序和配置构建
    result = []
    for wu in wf_ups:
        if not wu.get("enabled", True):
            continue
        repeat = wu.get("repeat", 1)
        for _ in range(repeat):
            result.append({
                "name": wu["name"],
                "uid": wu["uid"],
                "categories": wu.get("categories", []),
            })
    return result'''

content = content.replace(old_wf_funcs, new_wf_funcs)

# 2. 修改 run() 函数中的工作流加载逻辑
old_run_wf = '''    # 检查是否有工作流配置
    wf = load_workflow()
    if wf:
        log(f"[工作流] 使用工作流: {wf.get('name', '未命名')}")
        config = wf.get("config", {})
        upmasters = get_workflow_upmasters(wf)
        total_limit = config.get("total_limit", MAX_VIDEOS_TOTAL)
        delay_ups = config.get("delay_between_ups", REQUEST_DELAY)
        delay_pages = config.get("delay_between_pages", SEARCH_PAGE_DELAY)
        stop_after_done = config.get("stop_after_done", True)
        batch_size = config.get("batch_size", 0)
        batch_delay = config.get("batch_delay", 60)
        log(f"[工作流] UP主数: {len(upmasters)}, 总量上限: {total_limit}")'''

new_run_wf = '''    # 检查是否有工作流配置
    wf = load_workflow()
    filter_override = None
    do_push = True
    if wf:
        log(f"[工作流] 使用工作流: {wf.get('name', '未命名')}")
        # 判断是流程图格式还是旧格式
        if wf.get("nodes"):
            upmasters, wf_config = parse_flow_nodes(wf)
            config = wf_config
            filter_override = config.get("filter", {})
            do_push = config.get("has_push", True)
        else:
            config = wf.get("config", {})
            upmasters = get_workflow_upmasters(wf)
        total_limit = config.get("total_limit", MAX_VIDEOS_TOTAL)
        delay_ups = config.get("delay_between_ups", REQUEST_DELAY)
        delay_pages = config.get("delay_between_pages", SEARCH_PAGE_DELAY)
        stop_after_done = config.get("stop_after_done", True)
        batch_size = config.get("batch_size", 0)
        batch_delay = config.get("batch_delay", 60)
        log(f"[工作流] UP主数: {len(upmasters)}, 总量上限: {total_limit}")
        if filter_override:
            log(f"[工作流] 筛选覆盖: 时长 {filter_override.get('duration_min',60)}-{filter_override.get('duration_max',3600)}s")'''

content = content.replace(old_run_wf, new_run_wf)

# 3. 修改 filter_and_transform 调用，支持 filter_override
old_filter_call = '''            up_videos = filter_and_transform(search_results, name, categories)'''
new_filter_call = '''            if filter_override:
                up_videos = filter_and_transform_override(search_results, name, categories, filter_override)
            else:
                up_videos = filter_and_transform(search_results, name, categories)'''
content = content.replace(old_filter_call, new_filter_call)

# 4. 在 filter_and_transform 后面添加 filter_and_transform_override
old_filter_end = '''    return result[:max_per_up]


# =====================
# 设置相关'''
new_filter_end = '''    return result[:max_per_up]


def filter_and_transform_override(videos, up_name, categories, override):
    """使用流程图中筛选节点的参数进行筛选"""
    duration_min = override.get("duration_min", 60)
    duration_max = override.get("duration_max", 3600)
    max_per_up = 50
    pubdate_days = override.get("pubdate_days", 0)

    EXCLUDE_KEYWORDS = [
        "抽奖福利", "恰饭", "广告", "推广", "赞助",
        "恐怖", "惊悚", "血腥", "暴力",
        "擦边", "色情", "低俗",
    ]

    now = time.time()
    pubdate_limit = now - pubdate_days * 86400 if pubdate_days > 0 else 0

    result = []
    for v in videos:
        title = v.get("title", "")
        duration = parse_duration(v.get("duration", 0))
        pubdate = v.get("pubdate", 0)
        clean_title = re.sub(r"<[^>]+>", "", title)

        if duration < duration_min or duration > duration_max:
            continue
        if pubdate_limit > 0 and pubdate < pubdate_limit:
            continue
        matched_kw = next((kw for kw in EXCLUDE_KEYWORDS if kw in title), None)
        if matched_kw:
            continue

        bvid = v.get("bvid", "")
        result.append({
            "bvid": bvid,
            "title": clean_title,
            "cover": process_cover_url(v.get("pic", "")),
            "duration": duration,
            "duration_text": format_duration(duration),
            "pubdate": pubdate,
            "play": v.get("play", 0),
            "like": 0,
            "up_name": up_name,
            "categories": categories,
            "url": f"https://www.bilibili.com/video/{bvid}",
            "iframe_url": f"//player.bilibili.com/player.html?bvid={bvid}&high_quality=1&danmaku=0",
        })
    return result[:max_per_up]


# =====================
# 设置相关'''
content = content.replace(old_filter_end, new_filter_end)

# 5. 修改推送逻辑，支持 has_push
old_push = '''    # 推送到GitHub
    git_push()'''
new_push = '''    # 推送到GitHub
    if do_push:
        git_push()
    else:
        log("[工作流] 跳过推送（流程中无推送节点）")'''
content = content.replace(old_push, new_push)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("worker.py patched with flow workflow support!")
print(f"File size: {len(content)} chars")
