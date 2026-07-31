# -*- coding: utf-8 -*-
"""给 style.css 添加搜索框样式"""

with open('web/css/style.css', 'r', encoding='utf-8') as f:
    content = f.read()

insert_css = """

/* === 搜索框 === */
.search-box {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    padding: 4px 12px;
    background: var(--cloud);
    border-radius: var(--radius-pill);
    border: 1px solid var(--hairline);
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.search-box:focus-within {
    border-color: var(--rausch);
    box-shadow: 0 0 0 3px rgba(255, 107, 53, 0.12);
}

.search-icon {
    flex-shrink: 0;
    color: var(--ink-3, #999);
}

.search-input {
    border: none;
    outline: none;
    background: transparent;
    font-size: 14px;
    color: var(--ink);
    width: 140px;
    font-family: inherit;
}

.search-input::placeholder {
    color: var(--ink-3, #999);
}

.search-clear {
    flex-shrink: 0;
    border: none;
    background: transparent;
    color: var(--ink-3, #999);
    cursor: pointer;
    font-size: 13px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    transition: background 0.15s ease, color 0.15s ease;
}

.search-clear:hover {
    background: var(--hairline);
    color: var(--ink);
}

[data-theme="dark"] .search-box {
    background: rgba(255,255,255,0.06);
}

[data-theme="dark"] .search-input {
    color: var(--ink);
}
"""

# 在 .video-list 之前插入
marker = "/* === "
# 找到视频列表的注释行
import re
match = re.search(r'\n/\* === [^\n]*视频[^\n]* === \*/', content)
if match:
    content = content[:match.start()] + insert_css + content[match.start():]
else:
    # fallback: 在 .video-list 前插入
    content = content.replace('.video-list {', insert_css + '\n.video-list {', 1)

with open('web/css/style.css', 'w', encoding='utf-8') as f:
    f.write(content)

print('style.css patched')
