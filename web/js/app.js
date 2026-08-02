/**
 * 暖阳 - 前端逻辑 v3
 * 功能：随机展示、无限滚动、深色模式、5档字号、个性化推荐、设置中心
 * 支持多分类（每个视频可属于多个板块）
 */

// === 配置 ===
const DATA_URL = "data/videos.json";
const CODE_VERSION = "2026-08-02 16:40"; // 代码更新时间（手动维护）
const BATCH_DEFAULT = 6;
const STORAGE_KEYS = {
    font: "nuanyang-font",
    dark: "nuanyang-dark",
    recommend: "nuanyang-recommend",
    history: "nuanyang-history",
    batch: "nuanyang-batch",
    favorites: "nuanyang-favorites",
    digest: "nuanyang-digest",
};

// === 状态 ===
let allVideos = [];
let currentCategory = "全部";
let displayedVideos = [];       // 已展示的视频
let displayedBvids = new Set(); // 已展示的BVID集合
let isLoading = false;
let settings = {
    fontSize: "font-lg",
    darkMode: "auto",       // auto / on / off
    recommend: false,
    digest: false,
    batch: BATCH_DEFAULT,
};
let viewHistory = {};  // { bvid: { count, lastView, categories, upName, totalDuration } }
let favorites = {};  // { bvid: { title, up_name, cover, categories, favoritedAt } }

// === DOM ===
const videoListEl = document.getElementById("videoList");
const categoriesEl = document.getElementById("categories");
const playerModal = document.getElementById("playerModal");
const playerTitle = document.getElementById("playerTitle");
const playerContainer = document.getElementById("playerContainer");
const playerClose = document.getElementById("playerClose");
const refreshBtn = document.getElementById("refreshBtn");
const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const settingsOverlay = document.getElementById("settingsOverlay");
const settingsClose = document.getElementById("settingsClose");
const darkModeToggle = document.getElementById("darkModeToggle");
const recommendToggle = document.getElementById("recommendToggle");
const digestToggle = document.getElementById("digestToggle");
const digestBtn = document.getElementById("digestBtn");
const digestViewEl = document.getElementById("digestView");
const digestBackBtn = document.getElementById("digestBackBtn");
const digestContentEl = document.getElementById("digestContent");
const fontOptions = document.getElementById("fontOptions");
const batchOptions = document.getElementById("batchOptions");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const loadMoreEl = document.getElementById("loadMore");
const toastEl = document.getElementById("toast");
const searchInput = document.getElementById("searchInput");
const searchClear = document.getElementById("searchClear");
let searchKeyword = "";
let currentView = "main"; // main / digest

// =====================
// 工具函数：获取视频分类（兼容数组/字符串）
// =====================
function getVideoCategories(video) {
    if (Array.isArray(video.categories)) return video.categories;
    if (video.category) return [video.category];
    return [];
}

function formatCategories(video) {
    const cats = getVideoCategories(video);
    return cats.length > 0 ? cats.join(" · ") : "";
}

function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// =====================
// 设置管理
// =====================

function loadSettings() {
    try {
        const font = localStorage.getItem(STORAGE_KEYS.font);
        if (font) settings.fontSize = font;

        const dark = localStorage.getItem(STORAGE_KEYS.dark);
        if (dark) {
            settings.darkMode = dark;
        } else {
            settings.darkMode = window.matchMedia("(prefers-color-scheme: dark)").matches ? "on" : "off";
        }

        const rec = localStorage.getItem(STORAGE_KEYS.recommend);
        if (rec === "true") settings.recommend = true;

        const dig = localStorage.getItem(STORAGE_KEYS.digest);
        if (dig === "true") settings.digest = true;

        const batch = localStorage.getItem(STORAGE_KEYS.batch);
        if (batch) settings.batch = parseInt(batch);

        const hist = localStorage.getItem(STORAGE_KEYS.history);
        if (hist) viewHistory = JSON.parse(hist);

        const fav = localStorage.getItem(STORAGE_KEYS.favorites);
        if (fav) favorites = JSON.parse(fav);
    } catch (e) {
        console.warn("加载设置失败:", e);
    }
}

function saveSettings() {
    localStorage.setItem(STORAGE_KEYS.font, settings.fontSize);
    localStorage.setItem(STORAGE_KEYS.dark, settings.darkMode);
    localStorage.setItem(STORAGE_KEYS.recommend, settings.recommend.toString());
    localStorage.setItem(STORAGE_KEYS.batch, settings.batch.toString());
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(viewHistory));
    localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(favorites));
}

// 多窗口设置同步：监听 storage 事件（其他窗口修改 localStorage 时触发）
window.addEventListener("storage", (e) => {
    if (!e.key) return;
    // 只处理暖阳的 key
    if (!e.key.startsWith("nuanyang-")) return;
    // 重新加载设置
    const oldDigest = settings.digest;
    loadSettings();
    // 应用变化
    if (e.key === STORAGE_KEYS.font) {
        applyFontSize();
    } else if (e.key === STORAGE_KEYS.dark) {
        applyDarkMode();
    } else if (e.key === STORAGE_KEYS.batch) {
        applyBatch();
    } else if (e.key === STORAGE_KEYS.recommend) {
        recommendToggle.checked = settings.recommend;
        refreshList();
    } else if (e.key === STORAGE_KEYS.digest) {
        digestToggle.checked = settings.digest;
        const dBtn = document.getElementById("digestBtn");
        if (dBtn) dBtn.style.display = settings.digest ? "" : "none";
        if (!settings.digest && currentView === "digest") showDigestPage(false);
    } else if (e.key === STORAGE_KEYS.history || e.key === STORAGE_KEYS.favorites) {
        // 观看记录或收藏变化，刷新当前视图
        if (currentView === "digest") {
            renderDigestPage();
        } else {
            refreshList();
        }
    }
});

function applyFontSize() {
    document.body.classList.remove("font-sm", "font-md", "font-lg", "font-xl", "font-2xl");
    document.body.classList.add(settings.fontSize);

    document.querySelectorAll(".font-option[data-size]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.size === settings.fontSize);
    });
}

function applyDarkMode() {
    const isDark = settings.darkMode === "on";
    document.body.classList.toggle("dark", isDark);
    darkModeToggle.checked = isDark;
}

function applyBatch() {
    document.querySelectorAll(".font-option[data-batch]").forEach(btn => {
        btn.classList.toggle("active", parseInt(btn.dataset.batch) === settings.batch);
    });
}

// =====================
// 主题切换
// =====================

darkModeToggle.addEventListener("change", () => {
    settings.darkMode = darkModeToggle.checked ? "on" : "off";
    applyDarkMode();
    saveSettings();
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    const saved = localStorage.getItem(STORAGE_KEYS.dark);
    if (!saved) {
        settings.darkMode = e.matches ? "on" : "off";
        applyDarkMode();
    }
});

// =====================
// 字号选择
// =====================

fontOptions.addEventListener("click", (e) => {
    const btn = e.target.closest(".font-option[data-size]");
    if (!btn) return;
    settings.fontSize = btn.dataset.size;
    applyFontSize();
    saveSettings();
    showToast("字号已调整");
});

// =====================
// 批量数量选择
// =====================

batchOptions.addEventListener("click", (e) => {
    const btn = e.target.closest(".font-option[data-batch]");
    if (!btn) return;
    settings.batch = parseInt(btn.dataset.batch);
    applyBatch();
    saveSettings();
    showToast("每次展示 " + settings.batch + " 条");
});

// =====================
// 个性化推荐
// =====================

recommendToggle.addEventListener("change", () => {
    settings.recommend = recommendToggle.checked;
    saveSettings();
    if (settings.recommend) {
        showToast("个性化推荐已开启");
    } else {
        showToast("个性化推荐已关闭");
    }
    refreshList();
});

clearHistoryBtn.addEventListener("click", () => {
    viewHistory = {};
    saveSettings();
    showToast("观看记录已清除");
    refreshList();
});

// =====================
// 每日摘要
// =====================

digestToggle.addEventListener("change", () => {
    settings.digest = digestToggle.checked;
    saveSettings();
    if (settings.digest) {
        showToast("每日摘要已开启");
    } else {
        showToast("每日摘要已关闭");
        if (currentView === "digest") showDigestPage(false);
    }
    const dBtn = document.getElementById("digestBtn");
    if (dBtn) dBtn.style.display = settings.digest ? "" : "none";
});

// 每日摘要页面切换
if (digestBtn) {
    digestBtn.addEventListener("click", () => {
        if (allVideos.length === 0) {
            showToast("视频数据加载中...");
            return;
        }
        showDigestPage(true);
    });
}

if (digestBackBtn) {
    digestBackBtn.addEventListener("click", () => showDigestPage(false));
}

function showDigestPage(show) {
    currentView = show ? "digest" : "main";
    if (show) {
        videoListEl.style.display = "none";
        loadMoreEl.style.display = "none";
        scrollSentinel.style.display = "none";
        categoriesEl.style.display = "none";
        // 隐藏 header 右侧按钮（摘要按钮和刷新按钮）
        if (digestBtn) digestBtn.style.display = "none";
        if (refreshBtn) refreshBtn.style.display = "none";
        // 暂停滚动观察器，防止触发 loadMoreVideos
        scrollObserver.disconnect();
        digestViewEl.style.display = "block";
        renderDigestPage();
    } else {
        videoListEl.style.display = "";
        scrollSentinel.style.display = "";
        categoriesEl.style.display = "";
        // 恢复 header 按钮
        if (refreshBtn) refreshBtn.style.display = "";
        if (digestBtn) digestBtn.style.display = settings.digest ? "" : "none";
        // 恢复滚动观察器
        scrollObserver.observe(scrollSentinel);
        digestViewEl.style.display = "none";
    }
}

function renderDigestPage() {
    if (!digestContentEl) return;
    digestContentEl.innerHTML = "";
    const digest = getDailyDigest();

    // 暖阳祝语
    if (digest.greeting) {
        const card = document.createElement("div");
        card.className = "digest-greeting-card";
        card.innerHTML = '<div class="digest-greeting-icon">☀️</div>' +
            '<div class="digest-greeting-text">' + escapeHtml(digest.greeting) + '</div>';
        digestContentEl.appendChild(card);
    }

    // 收藏的UP主今日更新
    if (digest.favoriteUpdates.length > 0) {
        renderDigestSectionPage(digestContentEl, "收藏的UP主今日更新", digest.favoriteUpdates, "暖阳推荐-收藏更新");
    }

    // 今日推荐
    if (digest.todayRecommend.length > 0) {
        renderDigestSectionPage(digestContentEl, "今日推荐", digest.todayRecommend, "暖阳推荐-今日推荐");
    }

    // 央视推荐
    if (digest.cctvRecommend.length > 0) {
        renderDigestSectionPage(digestContentEl, "央视推荐", digest.cctvRecommend, "暖阳推荐-央视推荐");
    }

    // 如果全部为空
    if (digest.favoriteUpdates.length === 0 && digest.todayRecommend.length === 0 && digest.cctvRecommend.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "今天暂无摘要内容，去看看视频列表吧";
        digestContentEl.appendChild(empty);
    }
}

function renderDigestSectionPage(container, title, videos, badgeText) {
    const header = document.createElement("div");
    header.className = "digest-section-header";
    header.textContent = title;
    container.appendChild(header);

    videos.forEach(v => {
        const card = document.createElement("div");
        card.className = "video-card digest-card";

        const coverHtml = v.cover
            ? `<img class="video-cover" src="${v.cover}" alt="${escapeHtml(v.title)}" loading="lazy" referrerpolicy="no-referrer"
                 onerror="this.outerHTML='<div class=\\'video-cover-placeholder\\'>暖阳</div>'">`
            : `<div class="video-cover-placeholder">暖阳</div>`;

        const favBadge = favorites[v.bvid]
            ? '<span class="video-fav-badge">♥</span>'
            : "";

        card.innerHTML = `
            <div class="video-cover-wrap">
                ${coverHtml}
                ${v.duration_text ? `<span class="video-duration">${v.duration_text}</span>` : ""}
            </div>
            <div class="video-info">
                <div class="video-title">${escapeHtml(v.title)}</div>
                <div class="video-meta">
                    <span class="video-up">${escapeHtml(v.up_name)}</span>
                    ${favBadge}
                    <span class="video-digest-badge">${badgeText}</span>
                </div>
            </div>
        `;
        card.addEventListener("click", () => openPlayer(v));
        container.appendChild(card);
    });
}

let playerOpenTime = 0;
const MIN_WATCH_MS = 3000;

function recordView(video, watchMs) {
    if (watchMs < MIN_WATCH_MS) return;
    if (!viewHistory[video.bvid]) {
        viewHistory[video.bvid] = { count: 0, categories: getVideoCategories(video), upName: video.up_name, lastView: 0, totalDuration: 0 };
    }
    viewHistory[video.bvid].count++;
    viewHistory[video.bvid].lastView = Date.now();
    viewHistory[video.bvid].totalDuration += watchMs;
    saveSettings();
}

function getCategoryAffinity() {
    const catScores = {};
    let totalViews = 0;
    for (const bvid in viewHistory) {
        const h = viewHistory[bvid];
        const cats = Array.isArray(h.categories) ? h.categories : [h.categories];
        for (const cat of cats) {
            if (!cat) continue;
            catScores[cat] = (catScores[cat] || 0) + h.count;
        }
        totalViews += h.count;
    }
    // 收藏视频的分类微量增加亲和度
    for (const bvid in favorites) {
        const cats = favorites[bvid].categories || [];
        for (const cat of cats) {
            if (!cat) continue;
            catScores[cat] = (catScores[cat] || 0) + 0.5;
        }
        totalViews += 0.5;
    }
    if (totalViews === 0) return {};
    for (const cat in catScores) {
        catScores[cat] = catScores[cat] / totalViews;
    }
    return catScores;
}

function getUpAffinity() {
    const upScores = {};
    let totalViews = 0;
    for (const bvid in viewHistory) {
        const h = viewHistory[bvid];
        const up = h.upName || "";
        if (!up) continue;
        upScores[up] = (upScores[up] || 0) + h.count;
        totalViews += h.count;
    }
    // 收藏视频的UP主微量增加亲和度
    for (const bvid in favorites) {
        const up = favorites[bvid].up_name || "";
        if (!up) continue;
        upScores[up] = (upScores[up] || 0) + 0.5;
        totalViews += 0.5;
    }
    if (totalViews === 0) return {};
    for (const up in upScores) {
        upScores[up] = upScores[up] / totalViews;
    }
    return upScores;
}

function selectVideos(pool, count) {
    const result = [];
    const used = new Set();

    if (settings.recommend && Object.keys(viewHistory).length > 0) {
        const catAffinity = getCategoryAffinity();
        const upAffinity = getUpAffinity();
        const viewedBvids = new Set(Object.keys(viewHistory));

        const unviewed = pool.filter(v => !viewedBvids.has(v.bvid));
        const viewed = pool.filter(v => viewedBvids.has(v.bvid));

        // 每批保留1个名额给"发现"视频（非推荐），打破信息茧房
        const discoveryCount = 1;
        const recommendCount = Math.min(count - discoveryCount, unviewed.length + viewed.length);
        const revisitCount = Math.min(recommendCount - Math.min(recommendCount, unviewed.length), viewed.length);
        const actualRecommendCount = Math.min(recommendCount, unviewed.length);

        // 按综合权重从未看过中选：40%分类 + 30%UP主(平方根平滑) + 30%基础
        // 平方根平滑防止头部UP形成正反馈循环（马太效应）
        const weighted = unviewed.map(v => {
            const cats = getVideoCategories(v);
            const catScore = cats.length > 0
                ? Math.max(...cats.map(c => catAffinity[c] || 0))
                : 0;
            // sqrt 平滑：降低高亲和度UP的权重优势，让其他UP也有曝光机会
            const upScore = Math.sqrt(upAffinity[v.up_name] || 0);
            let weight = 0.5 * catScore + 0.3 * upScore + 0.05;
            // 收藏过的视频权重增加
            if (favorites[v.bvid]) weight *= 1.5;
            // 记录是否匹配用户偏好（用于决定是否标推荐）
            const matchesPreference = catScore > 0 || upScore > 0;
            return {
                video: v,
                weight: weight,
                matchesPreference: matchesPreference,
            };
        });
        let totalWeight = weighted.reduce((s, w) => s + w.weight, 0);

        for (let i = 0; i < actualRecommendCount && weighted.length > 0; i++) {
            let r = Math.random() * totalWeight;
            for (let j = 0; j < weighted.length; j++) {
                r -= weighted[j].weight;
                if (r <= 0) {
                    result.push({ ...weighted[j].video, recommended: weighted[j].matchesPreference });
                    totalWeight -= weighted[j].weight;
                    weighted.splice(j, 1);
                    break;
                }
            }
        }

        // 不足部分从已看过的中补充，也标记为推荐
        const shuffled = viewed.sort(() => Math.random() - 0.5);
        for (let i = 0; i < revisitCount && i < shuffled.length; i++) {
            // 已看过的视频：只有匹配偏好才标推荐
            const v = shuffled[i];
            const cats = getVideoCategories(v);
            const catScore = cats.length > 0
                ? Math.max(...cats.map(c => catAffinity[c] || 0))
                : 0;
            const upScore = upAffinity[v.up_name] || 0;
            const matchesPref = catScore > 0 || upScore > 0;
            result.push({ ...v, recommended: matchesPref });
        }

        // 插入1个"发现"视频：从剩余池中随机选，不带推荐标签
        const usedBvids = new Set(result.map(v => v.bvid));
        const remaining = pool.filter(v => !usedBvids.has(v.bvid));
        if (remaining.length > 0) {
            const discovery = remaining[Math.floor(Math.random() * remaining.length)];
            result.push(discovery);
        }
    } else {
        // 非个性化模式：按UP主均匀分配，避免视频数多的UP刷屏
        const upGroups = {};
        for (const v of pool) {
            const up = v.up_name || "未知";
            if (!upGroups[up]) upGroups[up] = [];
            upGroups[up].push(v);
        }
        const upNames = Object.keys(upGroups);
        // 每个UP内部先打乱
        upNames.forEach(up => upGroups[up].sort(() => Math.random() - 0.5));

        const takeCount = Math.min(count, pool.length);
        for (let i = 0; i < takeCount; i++) {
            // 随机选一个还有视频的UP
            const availableUps = upNames.filter(up => upGroups[up].length > 0);
            if (availableUps.length === 0) break;
            const pickedUp = availableUps[Math.floor(Math.random() * availableUps.length)];
            result.push(upGroups[pickedUp].pop());
        }
    }

    return result;
}

// =====================
// 视频列表渲染
// =====================

function renderCategories() {
    const cats = ["全部", "我的收藏"];
    const seen = new Set(["全部"]);
    allVideos.forEach(v => {
        const videoCats = getVideoCategories(v);
        videoCats.forEach(cat => {
            if (!seen.has(cat)) {
                seen.add(cat);
                cats.push(cat);
            }
        });
    });

    // 只移除分类按钮，保留搜索框
    categoriesEl.querySelectorAll(".category-btn").forEach(b => b.remove());
    // 按顺序追加到搜索框后面：全部 → 我的收藏 → 其他分类
    let anchor = categoriesEl.querySelector(".search-box");
    cats.forEach(cat => {
        const btn = document.createElement("button");
        btn.className = "category-btn" + (cat === currentCategory ? " active" : "");
        btn.textContent = cat;
        btn.dataset.category = cat;
        btn.addEventListener("click", () => {
            currentCategory = cat;
            document.querySelectorAll(".category-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            refreshList();
        });
        anchor.after(btn);
        anchor = btn;
    });
}

function getPool() {
    let pool = allVideos;
    if (currentCategory === "我的收藏") {
        pool = pool.filter(v => !!favorites[v.bvid]);
    } else if (currentCategory !== "全部") {
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
}

function getTopRecommendations(force = false) {
    // 个性化推荐置顶：最常看UP主或偏好分类的今日/昨日且没看过的新视频
    if (!force && !settings.recommend) return [];
    if (Object.keys(viewHistory).length === 0) return [];

    const upAffinity = getUpAffinity();
    const catAffinity = getCategoryAffinity();
    // 取观看次数最多的前5个UP主（放宽范围）
    const topUps = new Set(Object.entries(upAffinity)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name]) => name));
    // 取偏好度最高的前5个分类
    const topCats = new Set(Object.entries(catAffinity)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name]) => name));

    if (topUps.size === 0 && topCats.size === 0) return [];

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
    const yesterdayStart = todayStart - 86400;
    const dayBeforeStart = todayStart - 86400 * 2;

    // 已看过的视频
    const viewedBvids = new Set(Object.keys(viewHistory));

    // 找到今日/昨日新视频：匹配偏好UP主 OR 偏好分类
    const candidates = allVideos.filter(v => {
        if (viewedBvids.has(v.bvid)) return false;
        const pubdate = v.pubdate || 0;
        if (pubdate < dayBeforeStart || pubdate >= todayStart + 86400) return false;
        const matchUp = topUps.has(v.up_name);
        const vCats = getVideoCategories(v);
        const matchCat = vCats.some(c => topCats.has(c));
        return matchUp || matchCat;
    });

    // 按综合权重排序：UP主亲和度 + 分类亲和度
    candidates.sort((a, b) => {
        const scoreA = (upAffinity[a.up_name] || 0) + Math.max(...getVideoCategories(a).map(c => catAffinity[c] || 0), 0);
        const scoreB = (upAffinity[b.up_name] || 0) + Math.max(...getVideoCategories(b).map(c => catAffinity[c] || 0), 0);
        return scoreB - scoreA;
    });

    // 每个UP主最多取1条，总共最多3条
    const result = [];
    const usedUps = new Set();
    for (const v of candidates) {
        if (result.length >= 3) break;
        if (usedUps.has(v.up_name)) continue;
        usedUps.add(v.up_name);
        result.push({ ...v, topRecommended: true });
    }
    return result;
}

function renderTopRecommendation(video) {
    const card = document.createElement("div");
    card.className = "video-card top-recommend-card";

    const coverHtml = video.cover
        ? `<img class="video-cover" src="${video.cover}" alt="${escapeHtml(video.title)}" loading="lazy" referrerpolicy="no-referrer"
             onerror="this.outerHTML='<div class=\\'video-cover-placeholder\\'>暖阳</div>'">`
        : `<div class="video-cover-placeholder">暖阳</div>`;

    const catText = formatCategories(video);

    card.innerHTML = `
        <div class="video-cover-wrap">
            ${coverHtml}
            ${video.duration_text ? `<span class="video-duration">${video.duration_text}</span>` : ""}
        </div>
        <div class="video-info">
            <div class="video-title">${escapeHtml(video.title)}</div>
            <div class="video-meta">
                <span class="video-up">${escapeHtml(video.up_name)}</span>
                ${favorites[video.bvid] ? '<span class="video-fav-badge">\u2665</span>' : ''}
                <span class="video-top-badge">今日推荐</span>
            </div>
        </div>
    `;
    card.addEventListener("click", () => openPlayer(video));
    videoListEl.appendChild(card);
}

// =====================
// 每日摘要
// =====================

function getDailyDigest() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
    const threeDaysAgo = todayStart - 86400 * 3;
    const viewedBvids = new Set(Object.keys(viewHistory));

    // 1. 暖阳祝语
    const hour = now.getHours();
    let greeting = "";
    if (hour >= 5 && hour < 9) greeting = "早上好！新的一天，暖阳陪你开始";
    else if (hour >= 9 && hour < 12) greeting = "上午好！看个好视频，心情不错";
    else if (hour >= 12 && hour < 14) greeting = "中午好！吃饺看视频，双重享受";
    else if (hour >= 14 && hour < 18) greeting = "下午好！来点好内容，给下午加加油";
    else if (hour >= 18 && hour < 22) greeting = "晚上好！今天辛苦了，好好放松一下";
    else greeting = "夜深了，早点休息，明天暖阳还在";

    const tips = [
        "记得多喝水，照顾好自己",
        "笑一笑，十年少",
        "生命在于运动，别忘了活动活动",
        "好视频配好心情，享受当下",
        "今天也要元气满满哦",
        "愿这缕暖阳温暖你的每一天",
    ];
    greeting += " · " + tips[Math.floor(Math.random() * tips.length)];

    // 2. 收藏的UP主今日更新
    const favUpNames = new Set();
    for (const bvid in favorites) {
        if (favorites[bvid].up_name) favUpNames.add(favorites[bvid].up_name);
    }
    const favoriteUpdates = allVideos.filter(v => {
        if (!favUpNames.has(v.up_name)) return false;
        if (viewedBvids.has(v.bvid)) return false;
        const pubdate = v.pubdate || 0;
        return pubdate >= todayStart && pubdate < todayStart + 86400;
    }).slice(0, 5);

    // 3. 今日推荐（复用 getTopRecommendations，force=true 跳过 recommend 检查）
    let todayRecommend = getTopRecommendations(true);
    // 如果没有推荐（无匹配的偏好UP主/分类新视频），回退到按分类偏好+播放量排序
    if (todayRecommend.length === 0) {
        const catAffinity = getCategoryAffinity();
        const upAffinity = getUpAffinity();
        todayRecommend = allVideos.filter(v => {
            if (viewedBvids.has(v.bvid)) return false;
            const pubdate = v.pubdate || 0;
            return pubdate >= todayStart && pubdate < todayStart + 86400;
        }).map(v => {
            const cats = getVideoCategories(v);
            const catScore = cats.length > 0
                ? Math.max(...cats.map(c => catAffinity[c] || 0))
                : 0;
            const upScore = upAffinity[v.up_name] || 0;
            // 综合分：分类权重50% + UP主权重20% + 播放量归一化30%
            const playScore = Math.log10((v.play || 10) + 1) / 6; // log10归一化，10万播放约0.5
            const score = 0.5 * catScore + 0.2 * upScore + 0.3 * playScore;
            return { ...v, _score: score };
        }).sort((a, b) => b._score - a._score).slice(0, 5);
    }

    // 4. 央视推荐（央视系列UP主近3日更新）
    const cctvKeywords = ["央视", "央广", "央广总垂"];
    const cctvRecommend = allVideos.filter(v => {
        if (viewedBvids.has(v.bvid)) return false;
        if (!v.up_name) return false;
        if (!cctvKeywords.some(kw => v.up_name.includes(kw))) return false;
        const pubdate = v.pubdate || 0;
        return pubdate >= threeDaysAgo && pubdate < todayStart + 86400;
    }).sort((a, b) => (b.pubdate || 0) - (a.pubdate || 0)).slice(0, 5);

    return { greeting, favoriteUpdates, todayRecommend, cctvRecommend };
}


function refreshList() {
    isLoading = false;
    displayedVideos = [];
    displayedBvids = new Set();
    videoListEl.innerHTML = "";

    // 置顶推荐：最常看UP主的今日/昨日新视频
    // 搜索时不显示置顶推荐，只显示搜索结果
    if (!searchKeyword) {
        const topRecs = getTopRecommendations();
        topRecs.forEach(v => {
            displayedBvids.add(v.bvid);
            displayedVideos.push(v);
            renderTopRecommendation(v);
        });
    }

    loadMoreVideos();
}

function loadMoreVideos() {
    if (isLoading) return;
    if (currentView !== "main") return;
    isLoading = true;
    loadMoreEl.style.display = "flex";

    setTimeout(() => {
        const pool = getPool();
        const available = pool.filter(v => !displayedBvids.has(v.bvid));

        if (available.length === 0) {
            if (displayedVideos.length > 0) {
                // 检查是否已有“已到底”提示，避免重复添加
                const existingHint = videoListEl.querySelector('.empty:last-child');
                if (!existingHint) {
                    const hint = document.createElement("div");
                    hint.className = "empty";
                    hint.textContent = "已经到底了，更多好视频正在路上";
                    videoListEl.appendChild(hint);
                }
            } else {
                videoListEl.innerHTML = '<div class="empty">暂无视频，请稍后再来看看</div>';
            }
            isLoading = false;
            loadMoreEl.style.display = "none";
            return;
        } else {
            const selected = selectVideos(available, Math.min(settings.batch, available.length));
            selected.forEach(v => {
                displayedBvids.add(v.bvid);
                displayedVideos.push(v);
                renderVideoCard(v);
            });
        }

        isLoading = false;
        loadMoreEl.style.display = "none";

        if (displayedVideos.length === 0) {
            videoListEl.innerHTML = '<div class="empty">暂无视频，请稍后再来看看</div>';
        } else {
            requestAnimationFrame(() => {
                if (currentView !== "main") return;
                const rect = scrollSentinel.getBoundingClientRect();
                if (rect.top < window.innerHeight + 300 && !isLoading && displayedVideos.length < 60) {
                    loadMoreVideos();
                }
            });
        }
    }, 400);
}

function renderVideoCard(video) {
    const card = document.createElement("div");
    card.className = "video-card";

    const coverHtml = video.cover
        ? `<img class="video-cover" src="${video.cover}" alt="${escapeHtml(video.title)}" loading="lazy" referrerpolicy="no-referrer"
             onerror="this.outerHTML='<div class=\\'video-cover-placeholder\\'>暖阳</div>'">`
        : `<div class="video-cover-placeholder">暖阳</div>`;

    const badge = video.recommended
        ? `<span class="video-recommend-badge">推荐</span>`
        : "";
    const favBadge = favorites[video.bvid]
        ? `<span class="video-fav-badge">\u2665</span>`
        : "";

    const catText = formatCategories(video);

    card.innerHTML = `
        <div class="video-cover-wrap">
            ${coverHtml}
            ${video.duration_text ? `<span class="video-duration">${video.duration_text}</span>` : ""}
        </div>
        <div class="video-info">
            <div class="video-title">${escapeHtml(video.title)}</div>
            <div class="video-meta">
                <span class="video-up">${escapeHtml(video.up_name)}</span>
                ${favBadge}
                ${badge}
            </div>
        </div>
    `;
    card.addEventListener("click", () => openPlayer(video));
    videoListEl.appendChild(card);
}

// =====================
// 无限滚动
// =====================

const scrollSentinel = document.getElementById("scrollSentinel");

const scrollObserver = new IntersectionObserver((entries) => {
    if (currentView !== "main") return;
    if (entries[0].isIntersecting && !isLoading && displayedVideos.length < 60) {
        loadMoreVideos();
    }
}, { rootMargin: "300px" });

let scrollTimer = null;
window.addEventListener("scroll", () => {
    if (scrollTimer) return;
    if (currentView !== "main") return;
    scrollTimer = setTimeout(() => {
        scrollTimer = null;
        if (isLoading) return;
        if (currentView !== "main") return;
        const rect = scrollSentinel.getBoundingClientRect();
        if (rect.top < window.innerHeight + 300) {
            loadMoreVideos();
        }
    }, 100);
}, { passive: true });

function setupScrollObserver() {
    scrollObserver.disconnect();
    scrollObserver.observe(scrollSentinel);
}

// =====================
// 刷新
// =====================

refreshBtn.addEventListener("click", async () => {
    refreshBtn.style.transform = "rotate(360deg)";
    refreshBtn.style.transition = "transform 0.5s ease";
    setTimeout(() => {
        refreshBtn.style.transform = "";
        refreshBtn.style.transition = "";
    }, 500);
    // 重新从服务器获取最新数据，而非仅从内存缓存刷新
    try {
        const resp = await fetch(DATA_URL + "?t=" + Date.now(), { cache: "no-store" });
        const data = await resp.json();
        const newVideos = data.videos || [];
        if (newVideos.length !== allVideos.length) {
            allVideos = newVideos;
            lastVideoCount = newVideos.length;

        // 根据设置显示/隐藏每日摘要入口按钮
        const digestBtn = document.getElementById("digestBtn");
        if (digestBtn) digestBtn.style.display = settings.digest ? "" : "none";
            renderCategories();
            showToast("发现新视频，已更新");
        } else {
            showToast("已是最新");
        }
    } catch (e) {
        showToast("刷新失败，请稍后重试");
    }
    // 根据当前视图刷新对应内容
    if (currentView === "digest") {
        renderDigestPage();
        showToast("每日摘要已刷新");
    } else {
        refreshList();
    }
});

// =====================
// 播放器
// =====================

let currentPlayingVideo = null;

function formatPubdate(ts) {
    if (!ts) return "";
    const d = new Date(ts * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function openPlayer(video) {
    currentPlayingVideo = video;
    playerOpenTime = Date.now();
    playerTitle.textContent = video.title;
    // 显示发布时间和UP主
    const pubdateEl = document.getElementById("playerPubdate");
    if (pubdateEl) {
        const pubdate = formatPubdate(video.pubdate);
        pubdateEl.textContent = pubdate ? `${video.up_name} · ${pubdate}` : video.up_name;
    }
    playerContainer.innerHTML = `<iframe src="${video.iframe_url}"
        allowfullscreen="true"
        scrolling="no"
        sandbox="allow-scripts allow-same-origin"
    ></iframe>`;
    // 拦截iframe内跳转
    blockIframeNavigation();
    playerModal.classList.add("active");
    document.body.style.overflow = "hidden";
    updateFavoriteButton();
}

function closePlayer() {
    if (_preventNavRef) {
        window.removeEventListener("beforeunload", _preventNavRef);
        _preventNavRef = null;
    }
    if (currentPlayingVideo && playerOpenTime > 0) {
        const watchMs = Date.now() - playerOpenTime;
        recordView(currentPlayingVideo, watchMs);
    }
    currentPlayingVideo = null;
    playerOpenTime = 0;
    playerModal.classList.remove("active");
    playerContainer.innerHTML = "";
    document.body.style.overflow = "";
}

playerClose.addEventListener("click", closePlayer);

// =====================
// 收藏功能
// =====================

function toggleFavorite() {
    if (!currentPlayingVideo) return;
    const bvid = currentPlayingVideo.bvid;
    if (favorites[bvid]) {
        delete favorites[bvid];
        showToast("已取消收藏");
    } else {
        favorites[bvid] = {
            title: currentPlayingVideo.title,
            up_name: currentPlayingVideo.up_name,
            cover: currentPlayingVideo.cover || "",
            categories: getVideoCategories(currentPlayingVideo),
            favoritedAt: Date.now(),
        };
        showToast("已收藏");
    }
    saveSettings();
    updateFavoriteButton();
}

function updateFavoriteButton() {
    const btn = document.getElementById('playerFavBtn');
    if (!btn || !currentPlayingVideo) return;
    const isFav = !!favorites[currentPlayingVideo.bvid];
    btn.classList.toggle('favorited', isFav);
    btn.querySelector('.fav-icon').textContent = isFav ? '\u2665' : '\u2661';
    btn.querySelector('.fav-text').textContent = isFav ? '已收藏' : '收藏';
}

const playerFavBtn = document.getElementById('playerFavBtn');
if (playerFavBtn) {
    playerFavBtn.addEventListener('click', toggleFavorite);
}
playerModal.addEventListener("click", (e) => {
    if (e.target === playerModal) closePlayer();
});

window.addEventListener("popstate", () => {
    if (playerModal.classList.contains("active")) closePlayer();
});

// === 拦截iframe内跳转，防止跳到B站网页或App ===
let _preventNavRef = null;

function blockIframeNavigation() {
    if (_preventNavRef) {
        window.removeEventListener("beforeunload", _preventNavRef);
        _preventNavRef = null;
    }
    const iframe = playerContainer.querySelector("iframe");
    if (!iframe) return;

    // 拦截 iframe 内的点击导致的导航
    try {
        iframe.addEventListener("load", function() {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                // 拦截所有链接点击
                doc.addEventListener("click", function(e) {
                    const a = e.target.closest("a");
                    if (a && a.href) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                }, true);
                // 拦截 window.open
                iframe.contentWindow.open = function() { return null; };
            } catch(e) {
                // 跨域无法访问，忽略
            }
        });
    } catch(e) {}

    // 拦截顶层窗口跳转（B站播放器可能尝试 window.top.location）
    _preventNavRef = preventNav;
    window.addEventListener("beforeunload", preventNav, { once: true });
}

function preventNav(e) {
    // 如果播放器开着，阻止任何导航
    if (playerModal.classList.contains("active")) {
        e.preventDefault();
        e.returnValue = "";
        return "";
    }
}

// =====================
// 设置面板
// =====================

function openSettings() {
    settingsPanel.classList.add("active");
    settingsOverlay.classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeSettings() {
    settingsPanel.classList.remove("active");
    settingsOverlay.classList.remove("active");
    document.body.style.overflow = "";
}

settingsBtn.addEventListener("click", openSettings);
settingsClose.addEventListener("click", closeSettings);
settingsOverlay.addEventListener("click", closeSettings);

// =====================
// Toast
// =====================

let toastTimer = null;
function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toastEl.classList.remove("show");
    }, 2000);
}

// =====================
// 数据加载
// =====================

// 记录上次加载的视频数，用于检测更新
let lastVideoCount = 0;

async function loadData() {
    try {
        // 加时间戳破坏浏览器缓存 + no-cache 确保拿到最新数据
        const resp = await fetch(DATA_URL + "?t=" + Date.now(), {
            cache: "no-store"
        });
        const data = await resp.json();
        const newVideos = data.videos || [];
        allVideos = newVideos;

        // 如果视频数量变化或首次加载，重新渲染
        if (lastVideoCount === 0) {
            renderCategories();
            refreshList();
            setupScrollObserver();
            // 展示页demo模式：通过URL参数自动展示对应页面
            const demo = new URLSearchParams(location.search).get('demo');
            if (demo === 'play' && allVideos.length > 0) {
                setTimeout(() => openPlayer(allVideos[0]), 600);
            } else if (demo === 'search') {
                setTimeout(() => {
                    searchInput.value = '科普';
                    searchKeyword = '科普';
                    searchClear.style.display = 'block';
                    refreshList();
                }, 600);
            }
        } else if (newVideos.length !== lastVideoCount) {
            // 数据更新了，静默刷新
            renderCategories();
            refreshList();
            showToast("视频已更新");
        }
        lastVideoCount = newVideos.length;

        // 更新时间显示代码版本时间（非视频数据时间）
        const updateEl = document.getElementById('updateTime');
        if (updateEl) {
            updateEl.textContent = '最近更新：' + CODE_VERSION;
        }

        // 5分钟后自动检查更新
        setTimeout(checkForUpdate, 5 * 60 * 1000);
    } catch (e) {
        videoListEl.innerHTML = '<div class="empty">数据加载失败，请稍后再试</div>';
        console.error("加载失败:", e);
    }
}

// 静默检查视频数据更新
async function checkForUpdate() {
    try {
        const resp = await fetch(DATA_URL + "?t=" + Date.now(), {
            cache: "no-store"
        });
        const data = await resp.json();
        const newVideos = data.videos || [];
        if (newVideos.length !== lastVideoCount) {
            allVideos = newVideos;
            lastVideoCount = newVideos.length;
            renderCategories();
            refreshList();
            showToast("发现新视频，已更新");
        }
    } catch (e) {
        // 静默失败
    }
    // 页面可见时继续检查，不可见时暂停
    if (!document.hidden) {
        setTimeout(checkForUpdate, 5 * 60 * 1000);
    }
}

// =====================
// 启动
// =====================

loadSettings();
applyFontSize();
applyDarkMode();
applyBatch();
recommendToggle.checked = settings.recommend;
digestToggle.checked = settings.digest;
loadData();


// 页面重新可见时恢复自动更新检查
document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !isLoading) {
        setTimeout(checkForUpdate, 30 * 1000);
    }
});


// === 分类栏鼠标拖拽滚动（适配无触控设备）===
(function() {
    const el = document.getElementById('categories');
    if (!el) return;
    let isDown = false, startX, scrollLeft;
    el.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.closest('.search-box')) return;
        isDown = true;
        el.style.cursor = 'grabbing';
        startX = e.pageX - el.offsetLeft;
        scrollLeft = el.scrollLeft;
    });
    el.addEventListener('mouseleave', () => { isDown = false; el.style.cursor = ''; });
    el.addEventListener('mouseup', () => { isDown = false; el.style.cursor = ''; });
    el.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - el.offsetLeft;
        el.scrollLeft = scrollLeft - (x - startX);
    });
})();

// 更新日志点击展开/收起
const aboutRow = document.getElementById('aboutRow');
const changelogWrap = document.getElementById('changelogWrap');
const changelogArrow = document.getElementById('changelogArrow');
if (aboutRow && changelogWrap) {
    aboutRow.addEventListener('click', () => {
        const isShow = changelogWrap.classList.toggle('show');
        if (changelogArrow) changelogArrow.classList.toggle('rotated', isShow);
    });
}

// 设置面板更新时间（使用代码版本时间）
{
    const el = document.getElementById('updateTime');
    if (el) el.textContent = '最近更新：' + CODE_VERSION;
}

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
