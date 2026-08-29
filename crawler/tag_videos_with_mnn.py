"""
用 MNN 加载 Qwen3.5-4B 给暖阳全部视频批量打标。
每个视频根据【标题+UP名】从34个标签中选出1-3个最贴切的内容类别，覆盖原有UP继承分类。

用法: python tag_videos_with_mnn.py
"""
import os
import re
import json
import time
import sys
import MNN

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_DIR = r"E:\claw\20260730-15-11-53-783\models\Qwen3.5-4B-MNN"
VIDEOS_FILE = os.path.join(BASE_DIR, "data", "videos.json")

LABELS = [
    "人道救援","传统手艺","体育健身","健康养生","全球公益","军事国防","农业农村",
    "历史人文","喜剧短剧","国际事务","家庭亲情","影视制作","戏曲曲艺","手工DIY",
    "教育学习","文化艺术","新闻时政","民生资讯","法律普及","生活日常","社会百态",
    "科技前沿","科技数码","科普探索","纪录片","美食烹饪","自然环境","艺术欣赏",
    "花艺园艺","趣味实验","趣味挑战","非遗文化","音乐综艺","魔术表演"
]
LABEL_STR = "、".join(LABELS)

SYSTEM_PROMPT = "你是视频内容分类助手。根据标题和UP主判断视频内容类别，只能从给定标签中选择1到3个最贴切的，输出JSON数组。"

def make_prompt(title, up_name):
    return (f"视频标题：{title}\nUP主：{up_name}\n"
            f"可选标签：{LABEL_STR}\n"
            f"请选出1到3个最贴切的内容类别，只输出JSON数组，如：[\"科普探索\",\"趣味实验\"]")

# 常见别名 → 规范标签（模型有时会输出变体/近义词）
ALIAS_MAP = {
    "手工DIY": "手工DIY",
    "技艺展示": "艺术欣赏",
    "娱乐": "音乐综艺",
    "娱乐节目": "音乐综艺",
    "欢乐春节": "生活日常",
    "节日庆典": "生活日常",
    "搞笑": "喜剧短剧",
    "搞笑短剧": "喜剧短剧",
    "魔术": "魔术表演",
    "魔术师": "魔术表演",
    "美食": "美食烹饪",
    "宠物": "生活日常",
    "健康": "健康养生",
    "科学": "科普探索",
    "数码": "科技数码",
    "手工": "手工DIY",
    "传统文化": "非遗文化",
}

def normalize_label(x):
    """规范化单个标签：去空白 → 查别名 → 合法标签"""
    x = re.sub(r'\s+', '', str(x))
    if x in LABELS:
        return x
    if x in ALIAS_MAP:
        return ALIAS_MAP[x]
    return None

def parse_response(text):
    """从模型输出中解析JSON数组（规范化到合法标签）"""
    if not text:
        return []
    # 提取JSON数组
    m = re.search(r'\[.*?\]', text, re.DOTALL)
    if not m:
        return []
    try:
        arr = json.loads(m.group(0))
        if isinstance(arr, list):
            # 规范化并去重，只保留合法标签
            seen = set()
            out = []
            for x in arr:
                lab = normalize_label(x)
                if lab and lab not in seen:
                    seen.add(lab)
                    out.append(lab)
                if len(out) >= 3:
                    break
            return out
    except Exception:
        pass
    # 退而求其次：按顿号/逗号分割
    valid = []
    for x in re.split(r'[、,，]', text):
        lab = normalize_label(x)
        if lab and lab not in valid:
            valid.append(lab)
        if len(valid) >= 3:
            break
    return valid

def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="只打标前 N 条（0=全部）")
    ap.add_argument("--start", type=int, default=0, help="从第 N 条开始")
    ap.add_argument("--out", type=str, default="", help="输出分片结果文件（{bvid: [cats]}），默认写回 videos.json")
    args = ap.parse_args()
    print("加载 Qwen3.5-4B-MNN 模型...")
    config_path = os.path.join(MODEL_DIR, "config.json")
    llm = MNN.llm.create(config_path)
    llm.load()
    print("模型加载成功")

    with open(VIDEOS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    videos = data["videos"]
    if args.start > 0:
        videos = videos[args.start:]
    if args.limit > 0:
        videos = videos[:args.limit]
    print(f"共 {len(videos)} 条视频待打标 (start={args.start}, limit={args.limit})")

    total = len(videos)
    done = 0
    start_time = time.time()
    changed = 0
    errors = 0
    result = {}  # bvid -> [categories]

    llm.generate_init()  # 初始化一次，循环内不再重复初始化

    for v in videos:
        title = v.get("title", "")
        up = v.get("up_name", "")
        bvid = v.get("bvid", "")
        if not title or not bvid:
            done += 1
            continue
        prompt = make_prompt(title, up)
        try:
            raw = llm.response(prompt)
            cats = parse_response(raw)
            if cats:
                result[bvid] = cats
                changed += 1
            else:
                errors += 1
                print(f"  [解析失败] {title[:30]} -> {raw[:60]}")
        except Exception as e:
            errors += 1
            print(f"  [错误] {title[:30]}: {e}")
        done += 1
        if done % 20 == 0:
            elapsed = time.time() - start_time
            speed = done / elapsed
            remain = (total - done) / speed if speed > 0 else 0
            print(f"  进度 {done}/{total} ({done/total*100:.0f}%) 预计剩余 {remain/60:.1f} 分钟", flush=True)

    # 保存
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
    else:
        with open(VIDEOS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    elapsed = time.time() - start_time
    print(f"\n完成！共 {total} 条，成功打标 {changed} 条，失败 {errors} 条，耗时 {elapsed/60:.1f} 分钟")
    print(f"结果已写入 {args.out or VIDEOS_FILE}")

if __name__ == "__main__":
    main()
