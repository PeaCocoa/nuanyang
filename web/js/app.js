/**
 * 暖阳 - 前端逻辑 v3
 * 功能：随机展示、无限滚动、深色模式、5档字号、个性化推荐、设置中心
 * 支持多分类（每个视频可属于多个板块）
 */

// === 配置 ===
const DATA_URL = "data/videos.json";
const CODE_VERSION = "2026-08-05 18:00"; // 代码更新时间（手动维护）
const BATCH_DEFAULT = 6;
const STORAGE_KEYS = {
    font: "nuanyang-font",
    dark: "nuanyang-dark",
    theme: "nuanyang-theme",
    recommend: "nuanyang-recommend",
    history: "nuanyang-history",
    batch: "nuanyang-batch",
    favorites: "nuanyang-favorites",
    digest: "nuanyang-digest",
    liquidIntensity: "nuanyang-liquid-intensity",
};

// === 状态 ===
let allVideos = [];
let currentCategory = "全部";
let displayedVideos = [];       // 已展示的视频
let displayedBvids = new Set(); // 已展示的BVID集合
let isLoading = false;
let settings = {
    fontSize: "font-lg",
    darkMode: "auto",       // 兼容旧版
    theme: "auto",         // auto / light / dark / liquid
    recommend: false,
    digest: false,
    liquidIntensity: 50, // 0=毛玻璃 50=液态玻璃 100=清透
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
const themeRow = document.getElementById("themeRow");
const themeLabel = document.getElementById("themeLabel");
const skinPicker = document.getElementById("skinPicker");
const skinPickerOverlay = document.getElementById("skinPickerOverlay");
const skinPickerClose = document.getElementById("skinPickerClose");
const skinOptions = document.getElementById("skinOptions");
const recommendToggle = document.getElementById("recommendToggle");
const digestToggle = document.getElementById("digestToggle");
const digestBtn = document.getElementById("digestBtn");
const digestViewEl = document.getElementById("digestView");
const digestBackBtn = document.getElementById("digestBackBtn");
const digestContentEl = document.getElementById("digestContent");
const fontOptions = document.getElementById("fontOptions");
const batchOptions = document.getElementById("batchOptions");
const liquidIntensityRow = document.getElementById("liquidIntensityRow");
const liquidIntensitySlider = document.getElementById("liquidIntensity");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const loadMoreEl = document.getElementById("loadMore");
const toastEl = document.getElementById("toast");
const searchInput = document.getElementById("searchInput");
const searchClear = document.getElementById("searchClear");
let searchKeyword = "";
let currentView = "main"; // main / digest
let allLoaded = false; // 是否已加载完所有视频

// === 短视频状态 ===
const shortsViewEl = document.getElementById("shortsView");
const shortsContainer = document.getElementById("shortsContainer");
const shortsBackBtn = document.getElementById("shortsBackBtn");
const navHome = document.getElementById("navHome");
const navShorts = document.getElementById("navShorts");
let shortVideos = [];
let shortsRendered = [];
let shortsCurrentIndex = 0;
let shortsLoaded = false;
let shortsObserver = null;
let _shortsPreventNav = null;
const SHORT_MAX_DURATION = 300; // 5分钟
const SHORTS_RENDER_AHEAD = 2;

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
    // 每项独立 try-catch，防止单项解析失败导致后续数据不加载
    try {
        const font = localStorage.getItem(STORAGE_KEYS.font);
        if (font) settings.fontSize = font;
    } catch (e) { console.warn("加载字体设置失败:", e); }

    try {
        const theme = localStorage.getItem(STORAGE_KEYS.theme);
        if (theme) {
            settings.theme = theme;
        } else {
            const dark = localStorage.getItem(STORAGE_KEYS.dark);
            if (dark === "on") settings.theme = "dark";
            else if (dark === "off") settings.theme = "light";
            else settings.theme = "auto";
        }
    } catch (e) { console.warn("加载主题设置失败:", e); }

    try {
        const rec = localStorage.getItem(STORAGE_KEYS.recommend);
        if (rec === "true") settings.recommend = true;
    } catch (e) { console.warn("加载推荐设置失败:", e); }

    try {
        const dig = localStorage.getItem(STORAGE_KEYS.digest);
        if (dig === "true") settings.digest = true;
    } catch (e) { console.warn("加载摘要设置失败:", e); }

    try {
        const li = localStorage.getItem(STORAGE_KEYS.liquidIntensity);
        if (li !== null) settings.liquidIntensity = parseInt(li);
    } catch (e) { console.warn("加载液态强度失败:", e); }

    try {
        const batch = localStorage.getItem(STORAGE_KEYS.batch);
        if (batch) settings.batch = parseInt(batch);
    } catch (e) { console.warn("加载批次设置失败:", e); }

    try {
        const hist = localStorage.getItem(STORAGE_KEYS.history);
        if (hist) viewHistory = JSON.parse(hist);
    } catch (e) { console.warn("加载观看历史失败:", e); }

    try {
        const fav = localStorage.getItem(STORAGE_KEYS.favorites);
        console.log("[暖阳诊断] nuanyang-favorites 原始值:", fav ? fav.substring(0, 200) : "null");
        if (fav) {
            favorites = JSON.parse(fav);
            console.log("[暖阳诊断] 收藏数量:", Object.keys(favorites).length);
        } else {
            console.log("[暖阳诊断] localStorage中无收藏数据");
        }
    } catch (e) {
        console.warn("[暖阳诊断] 加载收藏数据失败:", e);
        console.log("[暖阳诊断] 原始值:", localStorage.getItem(STORAGE_KEYS.favorites));
    }
}

function saveSettings() {
    localStorage.setItem(STORAGE_KEYS.font, settings.fontSize);
    localStorage.setItem(STORAGE_KEYS.theme, settings.theme);
    localStorage.setItem(STORAGE_KEYS.dark, settings.theme === "dark" ? "on" : "off");
    localStorage.setItem(STORAGE_KEYS.recommend, settings.recommend.toString());
    localStorage.setItem(STORAGE_KEYS.digest, settings.digest.toString());
    localStorage.setItem(STORAGE_KEYS.liquidIntensity, settings.liquidIntensity.toString());
    localStorage.setItem(STORAGE_KEYS.batch, settings.batch.toString());
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(viewHistory));
    const favData = JSON.stringify(favorites);
    const favCount = Object.keys(favorites).length;
    const existingFav = localStorage.getItem(STORAGE_KEYS.favorites);
    // 保护：如果当前内存中favorites为空，但localStorage中有数据，可能是加载失败，不覆盖
    if (favCount === 0 && existingFav && existingFav !== "{}") {
        console.warn("[暖阳诊断] 收藏数据为空但localStorage有值，跳过保存防止覆盖。现有:", existingFav.substring(0, 100));
    } else {
        localStorage.setItem(STORAGE_KEYS.favorites, favData);
    }
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
    } else if (e.key === STORAGE_KEYS.theme || e.key === STORAGE_KEYS.dark) {
        loadSettings();
        applyTheme();
    } else if (e.key === STORAGE_KEYS.batch) {
        applyBatch();
    } else if (e.key === STORAGE_KEYS.liquidIntensity) {
        if (liquidIntensitySlider) liquidIntensitySlider.value = settings.liquidIntensity;
        applyLiquidIntensity();
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

const FONT_SIZES = ["font-sm", "font-md", "font-lg", "font-xl", "font-2xl"];
function applyFontSize() {
    document.body.classList.remove("font-sm", "font-md", "font-lg", "font-xl", "font-2xl");
    document.body.classList.add(settings.fontSize);
    const idx = FONT_SIZES.indexOf(settings.fontSize);
    const range = document.getElementById("fontRange");
    if (range && idx >= 0) range.value = idx;
}

function resolveColorScheme() {
    if (settings.theme === "dark") return "dark";
    if (settings.theme === "light") return "light";
    // auto / liquid / classic: 跟随系统
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const THEME_LABELS = {
    "auto": "跟随系统",
    "light": "白日",
    "dark": "黑夜",
    "liquid": "液态玻璃",
    "classic": "经典回忆",
};

function applyTheme() {
    const colorScheme = resolveColorScheme();
    document.body.setAttribute("data-theme", settings.theme);
    document.body.setAttribute("data-color-scheme", colorScheme);
    // 兼容旧版 body.dark 类
    document.body.classList.toggle("dark", colorScheme === "dark");
    // 兼容旧版 toggle
    if (darkModeToggle) darkModeToggle.checked = colorScheme === "dark";
    // 更新设置面板标签
    if (themeLabel) themeLabel.textContent = THEME_LABELS[settings.theme] || "跟随系统";
    // 更新皮肤选择器选中状态
    document.querySelectorAll(".skin-option").forEach(opt => {
        opt.classList.toggle("selected", opt.dataset.theme === settings.theme);
    });
    // 更新 meta theme-color
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
        metaTheme.content = colorScheme === "dark" ? "#1A1A1A" : "#FFFFFF";
    }
    // 液态玻璃强度滑动条显示/隐藏
    if (liquidIntensityRow) {
        liquidIntensityRow.style.display = (settings.theme === "liquid") ? "" : "none";
    }
    applyLiquidIntensity();
}

// 液态玻璃强度：通过JS修改SVG filter原语参数实现无级调节
// 0=毛玻璃(blur高,displace=0) 50=液态玻璃(原始值) 100=清透(全0)
const LIQUID_ORIGINAL = {
    thumbBlur: 0.2,
    thumbDisplace: 21.232824823888038,
    thumbFlood: 0.5,
    searchBlur: 1,
    searchDisplace: 54.97305784439829,
    searchFlood: 0.2,
};

function applyLiquidIntensity() {
    if (settings.theme !== "liquid") return;
    const v = settings.liquidIntensity; // 0-100
    const t = v / 100; // 0-1

    // 0→0.5: 毛玻璃→液态玻璃 (blur: 4→原始, displace: 0→原始, glow: 0.2→原始)
    // 0.5→1: 液态玻璃→清透 (blur: 原始→0, displace: 原始→0, glow: 原始→0)
    let blurMult, displaceMult, glowMult;
    if (t <= 0.5) {
        const p = t / 0.5; // 0→1
        blurMult = 4 + (1 - 4) * p; // 4→1
        displaceMult = p; // 0→1
        glowMult = 0.4 + (1 - 0.4) * p; // 0.4→1
    } else {
        const p = (t - 0.5) / 0.5; // 0→1
        blurMult = 1 + (0 - 1) * p; // 1→0
        displaceMult = 1 + (0 - 1) * p; // 1→0
        glowMult = 1 + (0 - 1) * p; // 1→0
    }

    const setAttr = (id, attr, val) => {
        const el = document.getElementById(id);
        if (el) el.setAttribute(attr, val);
    };

    // thumb-filter
    setAttr("thumb-blur", "stdDeviation", (LIQUID_ORIGINAL.thumbBlur * blurMult).toFixed(3));
    setAttr("thumb-displace", "scale", (LIQUID_ORIGINAL.thumbDisplace * displaceMult).toFixed(3));

    // searchbox-filter
    setAttr("search-blur", "stdDeviation", (LIQUID_ORIGINAL.searchBlur * blurMult).toFixed(3));
    setAttr("search-displace", "scale", (LIQUID_ORIGINAL.searchDisplace * displaceMult).toFixed(3));

    // 边缘发光通过CSS变量控制（替代feFuncA slope）
    document.body.style.setProperty("--liquid-glow", (LIQUID_ORIGINAL.thumbFlood * glowMult).toFixed(3));
    document.body.style.setProperty("--liquid-glow-bottom", (LIQUID_ORIGINAL.thumbFlood * glowMult * 0.25).toFixed(3));
}

// 液态玻璃强度滑动条事件
if (liquidIntensitySlider) {
    liquidIntensitySlider.addEventListener("input", () => {
        settings.liquidIntensity = parseInt(liquidIntensitySlider.value);
        applyLiquidIntensity();
    });
    liquidIntensitySlider.addEventListener("change", () => {
        saveSettings();
    });
}

function applyBatch() {
    const range = document.getElementById("batchRange");
    if (range) range.value = settings.batch;
}

// =====================
// 主题切换（皮肤选择器）
// =====================

// 皮肤选择器：打开
if (themeRow) {
    themeRow.addEventListener("click", () => {
        skinPickerOverlay.classList.add("active");
        skinPicker.classList.add("active");
    });
}
// 皮肤选择器：关闭
if (skinPickerClose) {
    skinPickerClose.addEventListener("click", closeSkinPicker);
}
if (skinPickerOverlay) {
    skinPickerOverlay.addEventListener("click", closeSkinPicker);
}
function closeSkinPicker() {
    skinPickerOverlay.classList.remove("active");
    skinPicker.classList.remove("active");
}
// 皮肤选择器：选择皮肤
if (skinOptions) {
    skinOptions.addEventListener("click", (e) => {
        const opt = e.target.closest(".skin-option");
        if (!opt) return;
        settings.theme = opt.dataset.theme;
        applyTheme();
        saveSettings();
        closeSkinPicker();
        showToast("已切换至" + (THEME_LABELS[settings.theme] || "跟随系统"));
    });
}
// 兼容旧版深色模式 toggle（如果存在）
if (darkModeToggle) {
    darkModeToggle.addEventListener("change", () => {
        settings.theme = darkModeToggle.checked ? "dark" : "light";
        applyTheme();
        saveSettings();
    });
}

// 系统深浅色变化时，auto/liquid 需要跟随
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (["auto", "liquid"].includes(settings.theme)) {
        applyTheme();
    }
});

// =====================
// 字号选择
// =====================

if (fontOptions) {
    const range = document.getElementById("fontRange");
    if (range) {
        range.addEventListener("input", () => {
            settings.fontSize = FONT_SIZES[parseInt(range.value)];
            applyFontSize();
            saveSettings();
        });
        range.addEventListener("change", () => {
            showToast("字号已调整");
        });
    }
}

// =====================
// 批量数量选择
// =====================

if (batchOptions) {
    const range = document.getElementById("batchRange");
    if (range) {
        range.addEventListener("input", () => {
            settings.batch = parseInt(range.value);
            applyBatch();
            saveSettings();
        });
        range.addEventListener("change", () => {
            showToast("每次展示 " + settings.batch + " 条");
        });
    }
}

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
        if (siteHeader) siteHeader.style.display = "";
        if (siteFooter) siteFooter.style.display = "";
        // 恢复 header 按钮
        if (refreshBtn) refreshBtn.style.display = "";
        if (digestBtn) digestBtn.style.display = settings.digest ? "" : "none";
        // 恢复滚动观察器
        scrollObserver.observe(scrollSentinel);
        digestViewEl.style.display = "none";
    }
}

// =====================
// 短视频刷流
// =====================

function showShortsPage(show) {
    currentView = show ? "shorts" : "main";
    var siteHeader = document.querySelector(".header");
    var siteFooter = document.querySelector(".footer");
    if (show) {
        videoListEl.style.display = "none";
        loadMoreEl.style.display = "none";
        scrollSentinel.style.display = "none";
        categoriesEl.style.display = "none";
        if (digestBtn) digestBtn.style.display = "none";
        if (refreshBtn) refreshBtn.style.display = "none";
        if (siteHeader) siteHeader.style.display = "none";
        if (siteFooter) siteFooter.style.display = "none";
        scrollObserver.disconnect();
        shortsViewEl.style.display = "block";
        navHome.classList.remove("active");
        navShorts.classList.add("active");
        if (!shortsLoaded) {
            initShorts();
        }
    } else {
        videoListEl.style.display = "";
        scrollSentinel.style.display = "";
        categoriesEl.style.display = "";
        if (refreshBtn) refreshBtn.style.display = "";
        if (digestBtn) digestBtn.style.display = settings.digest ? "" : "none";
        scrollObserver.observe(scrollSentinel);
        shortsViewEl.style.display = "none";
        navHome.classList.add("active");
        navShorts.classList.remove("active");
        // 离开短视频时清理所有iframe
        cleanupAllShortsIframes();
    }
}

function cleanupAllShortsIframes() {
    shortsRendered.forEach(entry => {
        if (!entry.el) return;
        const wrap = entry.el.querySelector(".shorts-player-wrap");
        const iframe = wrap && wrap.querySelector("iframe");
        const overlay = wrap && wrap.querySelector(".shorts-pause-overlay");
        if (overlay) overlay.remove();
        if (iframe) iframe.remove();
        entry.el.dataset.loaded = "0";
        const cover = wrap && wrap.querySelector(".shorts-cover");
        if (cover) {
            cover.style.display = "";
            cover.classList.remove("paused");
        }
    });
    if (_shortsPreventNav) {
        window.removeEventListener("beforeunload", _shortsPreventNav);
        _shortsPreventNav = null;
    }
}

async function initShorts() {
    try {
        const all = allVideos.length > 0 ? allVideos : (await fetch(DATA_URL).then(r=>r.json())).videos || [];
        if (allVideos.length === 0) allVideos = all;
        shortVideos = all.filter(v => (v.duration || 0) <= SHORT_MAX_DURATION);
        // 打乱
        for (let i = shortVideos.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shortVideos[i], shortVideos[j]] = [shortVideos[j], shortVideos[i]];
        }
        console.log("[暖阳短视频] 加载 " + shortVideos.length + " 条");
        renderShortsInitial();
        setupShortsObserver();
        shortsLoaded = true;
    } catch (e) {
        console.error("[暖阳短视频] 加载失败:", e);
        if (document.getElementById("shortsLoading"))
            document.getElementById("shortsLoading").innerHTML = '<div class="shorts-loading-text">加载失败，请稍后重试</div>';
    }
}

function createShortsItem(video, index) {
    const item = document.createElement("div");
    item.className = "shorts-item";
    item.dataset.index = index;
    const isFav = !!favorites[video.bvid];

    item.innerHTML = `
        <div class="shorts-player-wrap">
            <div class="shorts-cover" data-bvid="${video.bvid}">
                <img src="${video.cover}" alt="${escapeHtml(video.title)}" loading="eager" referrerpolicy="no-referrer">
            </div>
        </div>
        <div class="shorts-info">
            <div class="shorts-title">${escapeHtml(video.title)}</div>
            <div class="shorts-meta">
                <span class="shorts-up">${escapeHtml(video.up_name)}</span>
                <span> · ${formatDurationShort(video.duration)} · ${formatPubdate(video.pubdate)}</span>
            </div>
        </div>
        <div class="shorts-actions">
            <button class="shorts-action-btn ${isFav ? 'favorited' : ''}" data-action="fav" aria-label="收藏">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
            </button>
        </div>
    `;

    const cover = item.querySelector(".shorts-cover");
    cover.addEventListener("click", () => loadShortsVideo(item, video));

    const favBtn = item.querySelector('[data-action="fav"]');
    favBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const nowFav = toggleShortsFavorite(video.bvid);
        favBtn.classList.toggle("favorited", nowFav);
        const svg = favBtn.querySelector("svg");
        if (svg) svg.setAttribute("fill", nowFav ? "currentColor" : "none");
        showToast(nowFav ? "已收藏" : "已取消收藏");
    });

    return item;
}

function toggleShortsFavorite(bvid) {
    // 复用主站收藏逻辑
    const video = shortVideos.find(v => v.bvid === bvid);
    if (!video) return false;
    if (favorites[bvid]) {
        delete favorites[bvid];
        saveSettings();
        return false;
    } else {
        favorites[bvid] = {
            title: video.title,
            up_name: video.up_name,
            cover: video.cover || "",
            categories: getVideoCategories(video),
            favoritedAt: Date.now(),
        };
        saveSettings();
        return true;
    }
}

function formatDurationShort(sec) {
    sec = parseInt(sec) || 0;
    if (sec < 3600) return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
    return Math.floor(sec / 3600) + ":" + String(Math.floor((sec % 3600) / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
}

function loadShortsVideo(item, video) {
    const wrap = item.querySelector(".shorts-player-wrap");
    if (wrap.querySelector("iframe")) return;

    const cover = wrap.querySelector(".shorts-cover");
    if (cover) { cover.style.display = "none"; cover.classList.remove("paused"); }

    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
    iframe.setAttribute("allow", "autoplay; fullscreen; encrypted-media; picture-in-picture");
    iframe.setAttribute("scrolling", "no");
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute("referrerpolicy", "no-referrer");
    iframe.src = video.iframe_url + "&autoplay=1";
    wrap.appendChild(iframe);

    iframe.addEventListener("load", function() {
        try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            doc.addEventListener("click", function(e) {
                const a = e.target.closest("a");
                if (a && a.href) { e.preventDefault(); e.stopPropagation(); }
            }, true);
            iframe.contentWindow.open = function() { return null; };
        } catch(e) {}
    });

    if (_shortsPreventNav) window.removeEventListener("beforeunload", _shortsPreventNav);
    _shortsPreventNav = function(e) { e.preventDefault(); e.returnValue = ""; return ""; };
    window.addEventListener("beforeunload", _shortsPreventNav, { once: true });

    const pauseOverlay = document.createElement("div");
    pauseOverlay.className = "shorts-pause-overlay";
    pauseOverlay.addEventListener("click", (e) => {
        e.stopPropagation();
        pauseShortsVideo(item);
    });
    wrap.appendChild(pauseOverlay);

    item.dataset.loaded = "1";
}

function pauseShortsVideo(item) {
    const wrap = item.querySelector(".shorts-player-wrap");
    const iframe = wrap.querySelector("iframe");
    const overlay = wrap.querySelector(".shorts-pause-overlay");
    if (overlay) overlay.remove();
    if (iframe) iframe.remove();
    if (_shortsPreventNav) { window.removeEventListener("beforeunload", _shortsPreventNav); _shortsPreventNav = null; }
    const cover = wrap.querySelector(".shorts-cover");
    if (cover) { cover.style.display = ""; cover.classList.add("paused"); }
    item.dataset.loaded = "0";
}

function cleanupShortsInvisible() {
    let anyRemoved = false;
    shortsRendered.forEach(entry => {
        if (!entry.el) return;
        if (entry.el.dataset.index !== String(shortsCurrentIndex)) {
            const wrap = entry.el.querySelector(".shorts-player-wrap");
            const iframe = wrap && wrap.querySelector("iframe");
            if (iframe) {
                iframe.remove();
                entry.el.dataset.loaded = "0";
                const cover = wrap.querySelector(".shorts-cover");
                if (cover) cover.style.display = "";
                anyRemoved = true;
            }
        }
    });
    if (anyRemoved && _shortsPreventNav) {
        window.removeEventListener("beforeunload", _shortsPreventNav);
        _shortsPreventNav = null;
    }
}

function renderShortsInitial() {
    const loadingEl = document.getElementById("shortsLoading");
    if (loadingEl) loadingEl.remove();
    shortsContainer.innerHTML = "";
    shortsRendered = [];
    const count = Math.min(3, shortVideos.length);
    for (let i = 0; i < count; i++) {
        const item = createShortsItem(shortVideos[i], i);
        shortsContainer.appendChild(item);
        shortsRendered.push({ el: item, video: shortVideos[i], index: i });
    }
}

function setupShortsObserver() {
    if (shortsObserver) shortsObserver.disconnect();
    shortsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
                const idx = parseInt(entry.target.dataset.index, 10);
                if (idx !== shortsCurrentIndex) {
                    shortsCurrentIndex = idx;
                    onShortsSlideChanged(idx);
                }
            }
        });
    }, { root: shortsContainer, threshold: [0.6] });
    shortsRendered.forEach(entry => shortsObserver.observe(entry.el));
}

function onShortsSlideChanged(index) {
    cleanupShortsInvisible();
    const curEntry = shortsRendered.find(e => e.index === index);
    if (curEntry && curEntry.el.dataset.loaded !== "1") {
        loadShortsVideo(curEntry.el, curEntry.video);
    }
    const needIndex = index + SHORTS_RENDER_AHEAD;
    if (needIndex < shortVideos.length && needIndex >= shortsRendered.length) {
        const video = shortVideos[needIndex];
        const item = createShortsItem(video, needIndex);
        shortsContainer.appendChild(item);
        shortsRendered.push({ el: item, video: video, index: needIndex });
        if (shortsObserver) shortsObserver.observe(item);
    }
    if (index >= shortVideos.length - 2) {
        const remaining = shortVideos.slice();
        for (let i = remaining.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
        }
        shortVideos = shortVideos.concat(remaining);
    }
}

// 导航栏和返回按钮事件
if (navHome) navHome.addEventListener("click", () => showShortsPage(false));
if (navShorts) navShorts.addEventListener("click", () => showShortsPage(true));
if (shortsBackBtn) shortsBackBtn.addEventListener("click", () => showShortsPage(false));

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
            ? `<img class="video-cover" src="${v.cover}" alt="${escapeHtml(v.title)}" referrerpolicy="no-referrer"
                 onerror="if(!this.dataset.retry){this.dataset.retry=1;this.src=this.src.split('?')[0]+'?retry='+Date.now()}else{this.outerHTML='<div class=\'video-cover-placeholder\'>暖阳</div>'}">`
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

    if (settings.recommend && Object.keys(viewHistory).length > 0 && !searchKeyword) {
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
        // 模糊搜索：关键词拆成单字，每个字都需在标题/UP名/分类中至少一处出现
        // 如"科普"能匹配"科学普及"（科→科学，普→普及）
        const chars = kw.split('').filter(c => c.trim());
        pool = pool.filter(v => {
            const title = (v.title || "").toLowerCase();
            const upName = (v.up_name || "").toLowerCase();
            const cats = getVideoCategories(v).join(" ").toLowerCase();
            const haystack = title + ' ' + upName + ' ' + cats;
            // 所有字符都能在文本中找到，即认为匹配
            return chars.every(ch => haystack.includes(ch));
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
        ? `<img class="video-cover" src="${video.cover}" alt="${escapeHtml(video.title)}" referrerpolicy="no-referrer"
             onerror="if(!this.dataset.retry){this.dataset.retry=1;this.src=this.src.split('?')[0]+'?retry='+Date.now()}else{this.outerHTML='<div class=\'video-cover-placeholder\'>暖阳</div>'}">`
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
    allLoaded = false;
    displayedVideos = [];
    displayedBvids = new Set();
    videoListEl.innerHTML = "";

    // 置顶推荐：仅在"全部"分类且无搜索时显示
    // "我的收藏"等特定分类不显示置顶推荐，避免混淆
    if (!searchKeyword && currentCategory === "全部") {
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
            allLoaded = true;
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
                if (currentCategory === "我的收藏") {
                    videoListEl.innerHTML = '<div class="empty">还没有收藏的视频<br>点击视频播放页的♡即可收藏</div>';
                } else {
                    videoListEl.innerHTML = '<div class="empty">暂无视频，请稍后再来看看</div>';
                }
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
                if (rect.top < window.innerHeight + 300 && !isLoading && !allLoaded && displayedVideos.length < 60) {
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
        ? `<img class="video-cover" src="${video.cover}" alt="${escapeHtml(video.title)}" referrerpolicy="no-referrer"
             onerror="if(!this.dataset.retry){this.dataset.retry=1;this.src=this.src.split('?')[0]+'?retry='+Date.now()}else{this.outerHTML='<div class=\'video-cover-placeholder\'>暖阳</div>'}">`
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
    if (entries[0].isIntersecting && !isLoading && !allLoaded && displayedVideos.length < 60) {
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
        if (allLoaded) return;
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
        referrerpolicy="no-referrer"
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
applyTheme();
applyBatch();
recommendToggle.checked = settings.recommend;
digestToggle.checked = settings.digest;
if (digestBtn) digestBtn.style.display = settings.digest ? "" : "none";
if (liquidIntensitySlider) liquidIntensitySlider.value = settings.liquidIntensity;
applyLiquidIntensity();
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

// === 诊断工具（可在控制台调用）===
window.debugFavorites = function() {
    const raw = localStorage.getItem("nuanyang-favorites");
    console.log("=== 暖阳收藏诊断 ===");
    console.log("localStorage 原始值:", raw);
    console.log("localStorage 长度:", raw ? raw.length : 0);
    try {
        const parsed = JSON.parse(raw);
        const keys = Object.keys(parsed);
        console.log("收藏数量:", keys.length);
        if (keys.length > 0) {
            console.log("前5个收藏bvid:", keys.slice(0, 5));
            console.log("第一个收藏详情:", parsed[keys[0]]);
        }
        console.log("内存中 favorites 对象:", favorites);
        console.log("内存中收藏数量:", Object.keys(favorites).length);
        console.log("allVideos 数量:", allVideos.length);
        if (keys.length > 0 && allVideos.length > 0) {
            const matched = keys.filter(bvid => allVideos.some(v => v.bvid === bvid));
            console.log("匹配allVideos的收藏:", matched.length, "/", keys.length);
            if (matched.length === 0) {
                console.warn("警告: 收藏的bvid与当前视频库不匹配！可能是视频数据已更新");
                console.log("收藏bvid示例:", keys[0]);
                console.log("视频库bvid示例:", allVideos[0].bvid);
            }
        }
    } catch(e) {
        console.error("解析失败:", e);
    }
    console.log("====================");
};

// 更新日志弹窗
const aboutRow = document.getElementById('aboutRow');
const changelogModalOverlay = document.getElementById('changelogModalOverlay');
const changelogModalClose = document.getElementById('changelogModalClose');
const changelogArrow = document.getElementById('changelogArrow');
if (aboutRow && changelogModalOverlay) {
    aboutRow.addEventListener('click', () => {
        changelogModalOverlay.classList.add('show');
        if (changelogArrow) changelogArrow.classList.add('rotated');
    });
}
if (changelogModalClose) {
    changelogModalClose.addEventListener('click', () => {
        changelogModalOverlay.classList.remove('show');
        if (changelogArrow) changelogArrow.classList.remove('rotated');
    });
}
if (changelogModalOverlay) {
    changelogModalOverlay.addEventListener('click', (e) => {
        if (e.target === changelogModalOverlay) {
            changelogModalOverlay.classList.remove('show');
            if (changelogArrow) changelogArrow.classList.remove('rotated');
        }
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
