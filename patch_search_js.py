# -*- coding: utf-8 -*-
"""给 app.js 添加搜索功能"""

with open('web/js/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. 替换 getPool 函数
old_pool = '''function getPool() {
    if (currentCategory === "全部") return allVideos;
    // 检查视频的分类数组中是否包含当前选中的分类
    return allVideos.filter(v => getVideoCategories(v).includes(currentCategory));
}'''

new_pool = '''function getPool() {
    let pool = allVideos;
    if (currentCategory !== "全部") {
        pool = pool.filter(v => getVideoCategories(v).includes(currentCategory));
    }
    if (searchKeyword) {
        const kw = searchKeyword.toLowerCase();
        pool = pool.filter(v => {
            const title = (v.title || "").toLowerCase();
            const upName = (v.up_name || "").toLowerCase();
            const cats = getVideoCategories(v).join(" ").toLowerCase();
            return title.includes(kw) || upName.includes(kw) || cats.includes(kw);
        });
    }
    return pool;
}'''

content = content.replace(old_pool, new_pool, 1)

# 2. 在文件末尾添加搜索事件监听
search_code = '''

// === 搜索功能 ===
let searchDebounce = null;
searchInput.addEventListener("input", (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
        searchKeyword = e.target.value.trim();
        searchClear.style.display = searchKeyword ? "block" : "none";
        refreshList();
    }, 300);
});

searchClear.addEventListener("click", () => {
    searchInput.value = "";
    searchKeyword = "";
    searchClear.style.display = "none";
    refreshList();
    searchInput.focus();
});
'''

content += search_code

with open('web/js/app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('app.js patched')
