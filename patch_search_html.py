# -*- coding: utf-8 -*-
"""给 index.html 添加搜索框"""

with open('web/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

old = '''<!-- 二级菜单：分类标签 -->
    <nav class="categories" id="categories">
        <button class="category-btn active" data-category="全部">全部</button>
    </nav>'''

new = '''<!-- 二级菜单：分类标签 + 搜索 -->
    <nav class="categories" id="categories">
        <button class="category-btn active" data-category="全部">全部</button>
        <div class="search-box">
            <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input type="text" id="searchInput" class="search-input" placeholder="搜索视频或UP主" autocomplete="off">
            <button class="search-clear" id="searchClear" aria-label="清除搜索" style="display:none;">\u2715</button>
        </div>
    </nav>'''

content = content.replace(old, new, 1)

with open('web/index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print('index.html patched')
