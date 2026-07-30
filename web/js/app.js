/**
 * 暖阳 - 前端逻辑 v2
 * 功能：随机展示、无限滚动、深色模式、5档字号、个性化推荐、设置中心
 */

// === 配置 ===
const DATA_URL = "data/videos.json";
const BATCH_DEFAULT = 6;
const STORAGE_KEYS = {
    font: "nuanyang-font",
    dark: "nuanyang-dark",
    recommend: "nuanyang-recommend",
    history: "nuanyang-history",
    batch: "nuanyang-batch",
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
    batch: BATCH_DEFAULT,
};
let viewHistory = {};  // { bvid: { count, lastView, category, upName, totalDuration } }

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
const fontOptions = document.getElementById("fontOptions");
const batchOptions = document.getElementById("batchOptions");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const loadMoreEl = document.getElementById("loadMore");
const toastEl = document.getElementById("toast");

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
            // 首次访问：跟随系统主题
            settings.darkMode = window.matchMedia("(prefers-color-scheme: dark)").matches ? "on" : "off";
        }

        const rec = localStorage.getItem(STORAGE_KEYS.recommend);
        if (rec === "true") settings.recommend = true;

        const batch = localStorage.getItem(STORAGE_KEYS.batch);
        if (batch) settings.batch = parseInt(batch);

        const hist = localStorage.getItem(STORAGE_KEYS.history);
        if (hist) viewHistory = JSON.parse(hist);
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
}

function applyFontSize() {
    document.body.classList.remove("font-sm", "font-md", "font-lg", "font-xl", "font-2xl");
    document.body.classList.add(settings.fontSize);

    document.querySelectorAll(".font-option[data-size]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.size === settings.fontSize);
    });
}

function applyDarkMode() {
    // 完全由 JS 控制，不依赖 CSS 媒体查询
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

// 系统主题变化时，如果用户未手动设置过，则跟随系统
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
    // 重新加载列表
    refreshList();
});

clearHistoryBtn.addEventListener("click", () => {
    viewHistory = {};
    saveSettings();
    showToast("观看记录已清除");
    refreshList();
});

let playerOpenTime = 0; // 播放器打开时间戳
const MIN_WATCH_MS = 3000; // 最小观看时长（3秒），不足则不计入推荐

function recordView(video, watchMs) {
    // 不足3秒退出，不计入观看偏好
    if (watchMs < MIN_WATCH_MS) return;
    if (!viewHistory[video.bvid]) {
        viewHistory[video.bvid] = { count: 0, category: video.category, upName: video.up_name, lastView: 0, totalDuration: 0 };
    }
    viewHistory[video.bvid].count++;
    viewHistory[video.bvid].lastView = Date.now();
    viewHistory[video.bvid].totalDuration += watchMs;
    saveSettings();
}

function getCategoryAffinity() {
    // 统计每个分类的观看次数
    const catScores = {};
    let totalViews = 0;
    for (const bvid in viewHistory) {
        const h = viewHistory[bvid];
        catScores[h.category] = (catScores[h.category] || 0) + h.count;
        totalViews += h.count;
    }
    if (totalViews === 0) return {};
    // 转为权重比例
    for (const cat in catScores) {
        catScores[cat] = catScores[cat] / totalViews;
    }
    return catScores;
}

function getUpAffinity() {
    // 统计每个UP主的观看次数
    const upScores = {};
    let totalViews = 0;
    for (const bvid in viewHistory) {
        const h = viewHistory[bvid];
        const up = h.upName || "";
        if (!up) continue;
        upScores[up] = (upScores[up] || 0) + h.count;
        totalViews += h.count;
    }
    if (totalViews === 0) return {};
    // 转为权重比例
    for (const up in upScores) {
        upScores[up] = upScores[up] / totalViews;
    }
    return upScores;
}

function selectVideos(pool, count) {
    const result = [];
    const used = new Set();

    if (settings.recommend && Object.keys(viewHistory).length > 0) {
        // 个性化推荐：30%分类亲和度 + 70%UP主亲和度
        const catAffinity = getCategoryAffinity();
        const upAffinity = getUpAffinity();
        const viewedBvids = new Set(Object.keys(viewHistory));

        // 将视频分为：已看过 + 未看过
        const unviewed = pool.filter(v => !viewedBvids.has(v.bvid));
        const viewed = pool.filter(v => viewedBvids.has(v.bvid));

        // 70% 推荐未看过的（优先高亲和度），30% 已看过的（可能想重温）
        const recommendCount = Math.min(Math.ceil(count * 0.7), unviewed.length);
        const revisitCount = Math.min(count - recommendCount, viewed.length);

        // 按综合权重从未看过中选：30%分类 + 70%UP主
        const weighted = unviewed.map(v => ({
            video: v,
            weight: 0.3 * (catAffinity[v.category] || 0.05) + 0.7 * (upAffinity[v.up_name] || 0.05) + 0.05, // 基础权重0.05避免完全排除
        }));
        let totalWeight = weighted.reduce((s, w) => s + w.weight, 0);

        for (let i = 0; i < recommendCount && weighted.length > 0; i++) {
            let r = Math.random() * totalWeight;
            for (let j = 0; j < weighted.length; j++) {
                r -= weighted[j].weight;
                if (r <= 0) {
                    result.push({ ...weighted[j].video, recommended: true });
                    totalWeight -= weighted[j].weight;
                    weighted.splice(j, 1);
                    break;
                }
            }
        }

        // 从已看过中随机选
        const shuffled = viewed.sort(() => Math.random() - 0.5);
        for (let i = 0; i < revisitCount; i++) {
            result.push(shuffled[i]);
        }
    } else {
        // 纯随机
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        for (let i = 0; i < Math.min(count, shuffled.length); i++) {
            result.push(shuffled[i]);
        }
    }

    return result;
}

// =====================
// 视频列表渲染
// =====================

function renderCategories() {
    const cats = ["全部"];
    const seen = new Set(["全部"]);
    allVideos.forEach(v => {
        if (!seen.has(v.category)) {
            seen.add(v.category);
            cats.push(v.category);
        }
    });

    categoriesEl.innerHTML = "";
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
        categoriesEl.appendChild(btn);
    });
}

function getPool() {
    return currentCategory === "全部"
        ? allVideos
        : allVideos.filter(v => v.category === currentCategory);
}

function refreshList() {
    isLoading = false; // 重置加载状态，避免上次 setTimeout 阻塞
    displayedVideos = [];
    displayedBvids = new Set();
    videoListEl.innerHTML = "";
    loadMoreVideos();
}

function loadMoreVideos() {
    if (isLoading) return;
    isLoading = true;
    loadMoreEl.style.display = "flex";

    // 模拟网络延迟
    setTimeout(() => {
        const pool = getPool();
        // 排除已展示的
        const available = pool.filter(v => !displayedBvids.has(v.bvid));

        if (available.length === 0) {
            // 所有视频都已展示完，重新打乱允许重复
            const freshPool = pool.filter(v => true);
            const selected = selectVideos(freshPool, settings.batch);
            selected.forEach(v => {
                displayedBvids.add(v.bvid);
                displayedVideos.push(v);
                renderVideoCard(v);
            });
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
            // 加载完成后检查哨兵是否仍在视口内，如果是则继续加载
            requestAnimationFrame(() => {
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
        ? `<img class="video-cover" src="${video.cover}" alt="${video.title}" loading="lazy" referrerpolicy="no-referrer"
             onerror="this.outerHTML='<div class=\\'video-cover-placeholder\\'>暖阳</div>'">`
        : `<div class="video-cover-placeholder">暖阳</div>`;

    const badge = video.recommended
        ? `<span class="video-recommend-badge">推荐</span>`
        : "";

    card.innerHTML = `
        <div class="video-cover-wrap">
            ${coverHtml}
            ${video.duration_text ? `<span class="video-duration">${video.duration_text}</span>` : ""}
        </div>
        <div class="video-info">
            <div class="video-title">${video.title}</div>
            <div class="video-meta">
                <span class="video-up">${video.up_name}</span>
                <span class="video-meta-dot">·</span>
                <span class="video-category-tag">${video.category}</span>
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

// 方案1: IntersectionObserver
const scrollObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoading) {
        loadMoreVideos();
    }
}, { rootMargin: "300px" });

// 方案2: scroll 事件监听（更可靠，作为 IO 的补充）
let scrollTimer = null;
window.addEventListener("scroll", () => {
    if (scrollTimer) return;
    scrollTimer = setTimeout(() => {
        scrollTimer = null;
        if (isLoading) return;
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

refreshBtn.addEventListener("click", () => {
    refreshBtn.style.transform = "rotate(360deg)";
    refreshBtn.style.transition = "transform 0.5s ease";
    setTimeout(() => {
        refreshBtn.style.transform = "";
        refreshBtn.style.transition = "";
    }, 500);
    refreshList();
    showToast("已刷新");
});

// =====================
// 播放器
// =====================

let currentPlayingVideo = null; // 当前播放的视频（用于关闭时记录观看时长）

function openPlayer(video) {
    currentPlayingVideo = video;
    playerOpenTime = Date.now();
    playerTitle.textContent = video.title;
    playerContainer.innerHTML = `<iframe src="${video.iframe_url}"
        allowfullscreen="true"
        scrolling="no"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
    ></iframe>`;
    playerModal.classList.add("active");
    document.body.style.overflow = "hidden";
}

function closePlayer() {
    // 关闭时计算观看时长，不足3秒不计入推荐
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
playerModal.addEventListener("click", (e) => {
    if (e.target === playerModal) closePlayer();
});

window.addEventListener("popstate", () => {
    if (playerModal.classList.contains("active")) closePlayer();
});

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

async function loadData() {
    try {
        const resp = await fetch(DATA_URL);
        const data = await resp.json();
        allVideos = data.videos || [];
        renderCategories();
        refreshList();
        setupScrollObserver();
    } catch (e) {
        videoListEl.innerHTML = '<div class="empty">数据加载失败，请稍后再试</div>';
        console.error("加载失败:", e);
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
loadData();
