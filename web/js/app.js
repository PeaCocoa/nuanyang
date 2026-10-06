/**
 * 暖阳 - 前端逻辑 v3
 * 功能：随机展示、无限滚动、深色模式、5档字号、个性化推荐、设置中心
 * 支持多分类（每个视频可属于多个板块）
 */

// === 配置 ===
const DATA_URL = "data/videos.json";
const CODE_VERSION = "2026-10-06 22:20"; // 代码更新时间（手动维护）
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
    likes: "nuanyang-likes",
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
    likes: [],
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
let shortsCurrentIndex = -1;
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
        const likes = localStorage.getItem(STORAGE_KEYS.likes);
        if (likes) { settings.likes = JSON.parse(likes); if (Array.isArray(settings.likes) && settings.likes.length) { currentCategory = settings.likes[0]; } }
        else { settings.likes = []; }
    } catch (e) { console.warn("加载喜好设置失败:", e); settings.likes = []; }

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
    localStorage.setItem(STORAGE_KEYS.likes, JSON.stringify(settings.likes || []));
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
        if (!settings.digest && currentView === "digest") showDigestPage(false);
        if (typeof applyCloudConfig === "function") applyCloudConfig();
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

// === 动态测量标题栏真实高度，写入 --header-h，避免下滑后分类栏被标题栏遮挡 ===
function syncHeaderHeight() {
    var h = document.querySelector(".header");
    if (!h) return;
    requestAnimationFrame(function () {
        var hh = h.offsetHeight;
        if (hh > 0) document.documentElement.style.setProperty("--header-h", hh + "px");
    });
}
window.addEventListener("resize", syncHeaderHeight);
window.addEventListener("orientationchange", function () { setTimeout(syncHeaderHeight, 300); });
function applyFontSize() {
    document.body.classList.remove("font-sm", "font-md", "font-lg", "font-xl", "font-2xl");
    document.body.classList.add(settings.fontSize);
    const idx = FONT_SIZES.indexOf(settings.fontSize);
    const range = document.getElementById("fontRange");
    if (range && idx >= 0) range.value = idx;
    syncHeaderHeight();
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
    syncHeaderHeight();
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
        hideAllSubViews();
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
        hideAllSubViews();
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
        // 触发淡入
        requestAnimationFrame(() => {
            shortsViewEl.classList.add("visible");
        });
        navHome.classList.remove("active");
        navShorts.classList.add("active");
        if (!shortsLoaded) {
            initShorts();
        } else {
            reshuffleShorts();
        }
    } else {
        videoListEl.style.display = "";
        scrollSentinel.style.display = "";
        categoriesEl.style.display = "";
        if (siteHeader) siteHeader.style.display = "";
        if (siteFooter) siteFooter.style.display = "";
        if (refreshBtn) refreshBtn.style.display = "";
        if (digestBtn) digestBtn.style.display = settings.digest ? "" : "none";
        scrollObserver.observe(scrollSentinel);
        shortsViewEl.classList.remove("visible");
        setTimeout(() => { shortsViewEl.style.display = "none"; }, 250);
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

/**
 * UP主打散：将按权重排好序的视频列表重新排列，确保相邻视频来自不同UP主。
 * 策略：按UP主分组后轮询取出，每轮UP主顺序随机打乱，避免每次固定排列。
 */
function interleaveByUp(videos) {
    if (videos.length <= 1) return videos;
    // 按UP主分组，组内按权重顺序
    const groups = {};
    const upOrder = [];
    for (const v of videos) {
        const up = v.up_name || '\u672a\u77e5';
        if (!groups[up]) {
            groups[up] = [];
            upOrder.push(up);
        }
        groups[up].push(v);
    }
    // 组内随机打乱（保留推荐权重大致顺序但增加变化）
    for (const up of upOrder) {
        const g = groups[up];
        for (let i = g.length - 1; i > 0; i--) {
            // 局部洗牌：只交换邻近位置，保持大致权重顺序
            const j = Math.max(0, i - 1 - Math.floor(Math.random() * 2));
            [g[i], g[j]] = [g[j], g[i]];
        }
    }
    
    const result = [];
    const maxLen = Math.max(...upOrder.map(u => groups[u].length));
    
    // 轮询：第i轮从每个UP主取第i个视频
    for (let i = 0; i < maxLen; i++) {
        // 每轮UP主顺序随机打乱
        const roundOrder = upOrder.filter(u => groups[u].length > i);
        for (let r = roundOrder.length - 1; r > 0; r--) {
            const s = Math.floor(Math.random() * (r + 1));
            [roundOrder[r], roundOrder[s]] = [roundOrder[s], roundOrder[r]];
        }
        for (const up of roundOrder) {
            result.push(groups[up][i]);
        }
    }
    
    return result;
}

/**
 * 重新洗牌已加载的短视频列表，让每次进入都有不同顺序。
 * 保留推荐权重排序，但重新随机打散UP主+组内洗牌。
 */
function showShortsOverlay() {
    var ov = document.getElementById('shortsOverlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'shortsOverlay';
        ov.className = 'shorts-overlay-loading';
        ov.innerHTML = '<div class="shorts-loading-spinner"></div>';
        var sv = document.getElementById('shortsView');
        if (sv) sv.appendChild(ov);
    }
    ov.style.display = 'flex';
}

function hideShortsOverlay() {
    var ov = document.getElementById('shortsOverlay');
    if (ov) ov.style.display = 'none';
}

function reshuffleShorts() {
    if (!shortVideos || shortVideos.length <= 1) return;
    // 显示加载遮罩
    showShortsOverlay();
    // 延迟一帧让遮罩渲染，再执行重排
    requestAnimationFrame(() => {
        setTimeout(() => {
            doReshuffle();
            hideShortsOverlay();
        }, 200);
    });
}

function doReshuffle() {
    // 重新按权重排序
    const hasHistory = Object.keys(viewHistory).length > 0;
    const hasFavorites = Object.keys(favorites).length > 0;
    if (settings.recommend && (hasHistory || hasFavorites)) {
        const catAffinity = getCategoryAffinity();
        const upAffinity = getUpAffinity();
        const viewedBvids = new Set(Object.keys(viewHistory));
        const weighted = shortVideos.map(v => {
            const cats = getVideoCategories(v);
            const catScore = cats.length > 0
                ? Math.max(...cats.map(c => catAffinity[c] || 0))
                : 0;
            const upScore = Math.sqrt(upAffinity[v.up_name] || 0);
            let weight = 0.4 * catScore + 0.3 * upScore + 0.1;
            if (favorites[v.bvid]) weight *= 3;
            if (viewedBvids.has(v.bvid)) weight *= 0.5;
            weight *= (0.7 + Math.random() * 0.6);
            return { video: v, weight: weight };
        });
        weighted.sort((a, b) => b.weight - a.weight);
        shortVideos = interleaveByUp(weighted.map(w => w.video));
    } else {
        // 纯随机
        for (let i = shortVideos.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shortVideos[i], shortVideos[j]] = [shortVideos[j], shortVideos[i]];
        }
        shortVideos = interleaveByUp(shortVideos);
    }
    // 重新渲染
    const container = document.querySelector('.shorts-container');
    if (container) {
        container.scrollTop = 0;
        renderShortsInitial();
        setupShortsObserver();
    }
    console.log("[\u6696\u9633\u77ed\u89c6\u9891] \u91cd\u65b0\u6d17\u724c");
}

async function initShorts() {
    showShortsOverlay();
    try {
        const all = allVideos.length > 0 ? allVideos : (await fetch(DATA_URL).then(r=>r.json())).videos || [];
        if (allVideos.length === 0) allVideos = all;
        shortVideos = all.filter(v => (v.duration || 0) <= SHORT_MAX_DURATION);

        // 个性化推荐排序
        const hasHistory = Object.keys(viewHistory).length > 0;
        const hasFavorites = Object.keys(favorites).length > 0;
        if (settings.recommend && (hasHistory || hasFavorites)) {
            const catAffinity = getCategoryAffinity();
            const upAffinity = getUpAffinity();
            const viewedBvids = new Set(Object.keys(viewHistory));

            // 加权排序：收藏视频最优先，然后按偏好权重
            const weighted = shortVideos.map(v => {
                const cats = getVideoCategories(v);
                const catScore = cats.length > 0
                    ? Math.max(...cats.map(c => catAffinity[c] || 0))
                    : 0;
                const upScore = Math.sqrt(upAffinity[v.up_name] || 0);
                let weight = 0.4 * catScore + 0.3 * upScore + 0.1;
                // 收藏的视频大幅提权
                if (favorites[v.bvid]) weight *= 3;
                // 看过的视频降权（但不排除，短视频适合重复看）
                if (viewedBvids.has(v.bvid)) weight *= 0.5;
                // 随机扰动，避免每次完全一样
                weight *= (0.7 + Math.random() * 0.6);
                return { video: v, weight: weight };
            });
            // 按权重降序排，前半部分放入结果
            weighted.sort((a, b) => b.weight - a.weight);
            const sortedVideos = weighted.map(w => w.video);
            // UP打散：确保相邻视频来自不同UP主，避免连续刷到同一人
            shortVideos = interleaveByUp(sortedVideos);
            console.log("[暖阳短视频] 个性化推荐排序，收藏" + (hasFavorites ? "有" : "无") + " 历史" + (hasHistory ? "有" : "无"));
        } else {
            // 无推荐数据时纯随机
            for (let i = shortVideos.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shortVideos[i], shortVideos[j]] = [shortVideos[j], shortVideos[i]];
            }
            // 随机后也打散UP主
            shortVideos = interleaveByUp(shortVideos);
            console.log("[暖阳短视频] 随机排序+UP主打散（未开启推荐或无历史数据）");
        }
        console.log("[暖阳短视频] 加载 " + shortVideos.length + " 条");
        renderShortsInitial();
        setupShortsObserver();
        shortsLoaded = true;
        hideShortsOverlay();
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
    cover.addEventListener("click", () => {
        if (item.dataset.loaded === "1") return; // 已在播放，不处理(遮罩负责)
        resumeShortsVideo(item);
    });

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
    // 显示加载旋转动画
    if (cover) {
        cover.classList.add("loading");
        cover.style.display = "";
    }
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
        // iframe加载完成，隐藏封面和loading
        if (cover) {
            cover.style.display = "none";
            cover.classList.remove("loading");
            cover.classList.remove("paused");
        }
    });

    if (_shortsPreventNav) window.removeEventListener("beforeunload", _shortsPreventNav);
    _shortsPreventNav = function(e) { e.preventDefault(); e.returnValue = ""; return ""; };
    window.addEventListener("beforeunload", _shortsPreventNav, { once: true });

    // 暂停遮罩：单击暂停，双击收藏
    const pauseOverlay = document.createElement("div");
    pauseOverlay.className = "shorts-pause-overlay";
    
    let clickTimer = null;
    pauseOverlay.addEventListener("click", (e) => {
        e.stopPropagation();
        if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
            const favBtn = item.querySelector('[data-action="fav"]');
            if (favBtn) favBtn.click();
            showShortsHeart(item);
        } else {
            clickTimer = setTimeout(() => {
                clickTimer = null;
                pauseShortsVideo(item);
            }, 250);
        }
    });
    wrap.appendChild(pauseOverlay);

    item.dataset.loaded = "1";
}

function showShortsHeart(item) {
    const heart = document.createElement("div");
    heart.className = "shorts-heart-animation";
    heart.innerHTML = '<svg width="80" height="80" viewBox="0 0 24 24" fill="#FF385C" stroke="#FF385C" stroke-width="1"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
    item.appendChild(heart);
    setTimeout(() => heart.remove(), 800);
}

function pauseShortsVideo(item) {
    const wrap = item.querySelector(".shorts-player-wrap");
    const iframe = wrap.querySelector("iframe");
    const overlay = wrap.querySelector(".shorts-pause-overlay");
    const cover = wrap.querySelector(".shorts-cover");
    
    if (!iframe) return;
    
    // 删除iframe真正停止播放（B站iframe跨域无法postMessage暂停）
    iframe.remove();
    if (overlay) overlay.remove();
    if (_shortsPreventNav) { window.removeEventListener("beforeunload", _shortsPreventNav); _shortsPreventNav = null; }
    
    // 显示封面作为暂停画面
    if (cover) {
        cover.style.display = "";
        cover.classList.add("paused");
    }
    item.dataset.loaded = "0";
}

function resumeShortsVideo(item) {
    // 重新加载iframe（B站iframe跨域无法控制播放，只能重建）
    const video = shortVideos[parseInt(item.dataset.index, 10)];
    if (!video) return;
    loadShortsVideo(item, video);
}

function cleanupShortsInvisible() {
    let anyRemoved = false;
    shortsRendered.forEach(entry => {
        if (!entry.el) return;
        if (entry.el.dataset.index !== String(shortsCurrentIndex)) {
            const wrap = entry.el.querySelector(".shorts-player-wrap");
            const iframe = wrap && wrap.querySelector("iframe");
            const overlay = wrap && wrap.querySelector(".shorts-pause-overlay");
            if (iframe) {
                iframe.remove();
                entry.el.dataset.loaded = "0";
                const cover = wrap.querySelector(".shorts-cover");
                if (cover) { cover.style.display = ""; cover.classList.remove("paused"); }
                if (overlay) overlay.remove();
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
        // 循环时重新洗牌，收藏和偏好优先
        const remaining = shortVideos.slice();
        if (settings.recommend && (Object.keys(viewHistory).length > 0 || Object.keys(favorites).length > 0)) {
            const catAffinity = getCategoryAffinity();
            const upAffinity = getUpAffinity();
            remaining.sort((a, b) => {
                const wA = (favorites[a.bvid] ? 3 : 1) * (0.4 * Math.max(...(getVideoCategories(a).map(c => catAffinity[c] || 0)), 0) + 0.3 * Math.sqrt(upAffinity[a.up_name] || 0) + 0.1) * (0.7 + Math.random() * 0.6);
                const wB = (favorites[b.bvid] ? 3 : 1) * (0.4 * Math.max(...(getVideoCategories(b).map(c => catAffinity[c] || 0)), 0) + 0.3 * Math.sqrt(upAffinity[b.up_name] || 0) + 0.1) * (0.7 + Math.random() * 0.6);
                return wB - wA;
            });
        } else {
            for (let i = remaining.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
            }
        }
        shortVideos = shortVideos.concat(remaining);
    }
}

// 导航栏和返回按钮事件
if (navHome) navHome.addEventListener("click", () => { hideAllSubViews(); showShortsPage(false); });
if (navShorts) navShorts.addEventListener("click", () => { hideAllSubViews(); showShortsPage(true); });
if (shortsBackBtn) shortsBackBtn.addEventListener("click", () => { hideAllSubViews(); showShortsPage(false); });
// =====================
// 我的板块（观看数据 / 设置）
// =====================
const navMine = document.getElementById("navMine");
const mineViewEl = document.getElementById("mineView");
const mineContentEl = document.getElementById("mineContent");

// 统一隐藏所有子视图（用于修复视图重叠Bug）
function hideAllSubViews() {
    if (shortsViewEl) shortsViewEl.style.display = 'none';
    if (digestViewEl) digestViewEl.style.display = 'none';
    if (mineViewEl) mineViewEl.style.display = 'none';
}

// 进入/退出我的板块（与其他视图互斥，修复重叠Bug）
function showMinePage(show) {
    currentView = show ? 'mine' : 'main';
    var siteHeader = document.querySelector('.header');
    var siteFooter = document.querySelector('.footer');
    if (show) {
        // 隐藏所有其他视图，避免重叠
        hideAllSubViews();
        videoListEl.style.display = 'none';
        loadMoreEl.style.display = 'none';
        scrollSentinel.style.display = 'none';
        categoriesEl.style.display = 'none';
        if (digestBtn) digestBtn.style.display = 'none';
        if (refreshBtn) refreshBtn.style.display = 'none';
        if (siteHeader) siteHeader.style.display = 'none';
        if (siteFooter) siteFooter.style.display = 'none';
        scrollObserver.disconnect();
        mineViewEl.style.display = 'block';
        navHome.classList.remove('active');
        navShorts.classList.remove('active');
        navMine.classList.add('active');
        renderMinePage();
        setupMineAnnounceBtn();
    } else {
        hideAllSubViews();
        videoListEl.style.display = '';
        scrollSentinel.style.display = '';
        categoriesEl.style.display = '';
        if (siteHeader) siteHeader.style.display = '';
        if (siteFooter) siteFooter.style.display = '';
        if (refreshBtn) refreshBtn.style.display = '';
        if (digestBtn) digestBtn.style.display = settings.digest ? '' : 'none';
        scrollObserver.observe(scrollSentinel);
        navHome.classList.add('active');
        navShorts.classList.remove('active');
        navMine.classList.remove('active');
    }
}

// 常看UP统计
function upSetHelper() {
    const up = {};
    for (const bvid in viewHistory) {
        const h = viewHistory[bvid];
        if (h.upName) up[h.upName] = (up[h.upName] || 0) + (h.count || 1);
    }
    return up;
}

// 收藏中按bvid找视频对象（用于打开播放器）
function favVideoByBvid(bvid) {
    const f = favorites[bvid];
    if (!f) return null;
    return { bvid: bvid, title: f.title, cover: f.cover, up_name: f.up_name, categories: f.categories, url: f.url, iframe_url: f.iframe_url, duration_text: f.duration_text };
}

// 按UP搜索并回到主站
function filterByUp(name) {
    searchInput.value = name;
    searchKeyword = name;
    searchClear.style.display = 'block';
    currentCategory = '全部';
    document.querySelectorAll('.category-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.category === '全部'); });
    refreshList();
    showMinePage(false);
    window.scrollTo(0, 0);
}

// 观看数据统计
function computeMineStats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    let totalViewed = 0, todayViewed = 0, totalDurationMs = 0;
    for (const bvid in viewHistory) {
        const h = viewHistory[bvid];
        totalViewed++;
        if (h.lastView && h.lastView > todayStart) todayViewed++;
        if (h.totalDuration) totalDurationMs += h.totalDuration;
    }
    const favTotal = Object.keys(favorites).length;
    const upCount = Object.keys(upSetHelper()).length;
    return { totalViewed: totalViewed, todayViewed: todayViewed, favTotal: favTotal, upCount: upCount, totalDurationMs: totalDurationMs };
}

// 观看时长格式化（毫秒 -> "x小时x分" / "x分"）
function formatWatchDuration(ms) {
    if (!ms || ms <= 0) return '0分钟';
    const totalMin = Math.round(ms / 60000);
    if (totalMin < 60) return totalMin + '分钟';
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h + '小时' + (m > 0 ? m + '分钟' : '');
}

// 我的板块：查看视频对象（通过bvid在allVideos中找，找不到回退收藏）
function mineVideoByBvid(bvid) {
    const v = allVideos.find(function(x) { return x.bvid === bvid; });
    if (v) return v;
    return favVideoByBvid(bvid);
}

// 生成UP头像（无头像数据时用首字 + 稳定配色）
const UP_AVATAR_COLORS = ['#FF6B35', '#4A90D9', '#2E7D32', '#D81B60', '#8E44AD', '#F57C00', '#00ACC1', '#C62828'];
function upAvatarHtml(name) {
    const ch = (name || '?').trim().charAt(0) || '?';
    let hash = 0;
    for (let k = 0; k < (name || '').length; k++) hash = (hash * 31 + (name.charCodeAt(k) || 0)) % 997;
    const color = UP_AVATAR_COLORS[hash % UP_AVATAR_COLORS.length];
    return '<div class="mine-up-avatar" style="background:' + color + '">' + escapeHtml(ch) + '</div>';
}

// 渲染我的板块：横向最近观看 + 横向我的收藏 + 横向常看UP
function renderMinePage() {
    if (!mineContentEl) return;

    // ---- 最近观看（横向排布）----
    const recentList = Object.entries(viewHistory)
        .sort(function(a, b) { return (b[1].lastView || 0) - (a[1].lastView || 0); })
        .slice(0, 10);
    let recentHtml;
    if (recentList.length > 0) {
        recentHtml = '<div class="mine-section">'
            + '<h3 class="mine-section-title">最近观看</h3>'
            + '<div class="mine-hscroll">'
            + recentList.map(function(e) {
                const bvid = String(e[0]).replace(/'/g, '');
                const v = mineVideoByBvid(e[0]);
                const title = v ? v.title : (e[1].title || '已下架视频');
                const upName = v ? v.up_name : (e[1].upName || '');
                const cover = v && v.cover ? v.cover : '';
                const dur = v && v.duration_text ? v.duration_text : '';
                return '<div class="mine-vcard" onclick="openPlayer(mineVideoByBvid(\'' + bvid + '\'))">'
                    + (cover ? '<div class="mine-vcard-cover"><img src="' + escapeHtml(cover) + '" referrerpolicy="no-referrer" loading="lazy">' + (dur ? '<span class="mine-vcard-dur">' + escapeHtml(dur) + '</span>' : '') + '</div>' : '<div class="mine-vcard-cover mine-vcard-cover-empty">暖阳</div>')
                    + '<div class="mine-vcard-title">' + escapeHtml(title) + '</div>'
                    + '<div class="mine-vcard-up">' + escapeHtml(upName) + '</div>'
                    + '</div>';
            }).join('')
            + '</div></div>';
    } else {
        recentHtml = '';
    }

    // ---- 我的收藏（横向排布）----
    const favList = Object.values(favorites).sort(function(a, b) { return (b.favoritedAt || 0) - (a.favoritedAt || 0); }).slice(0, 10);
    let favHtml;
    if (favList.length > 0) {
        favHtml = '<div class="mine-section">'
            + '<h3 class="mine-section-title">我的收藏</h3>'
            + '<div class="mine-hscroll">'
            + favList.map(function(v) {
                const bvid = String(v.bvid || '').replace(/'/g, '');
                const cover = v.cover || '';
                const dur = v.duration_text || '';
                return '<div class="mine-vcard" onclick="openPlayer(favVideoByBvid(\'' + bvid + '\'))">'
                    + (cover ? '<div class="mine-vcard-cover"><img src="' + escapeHtml(cover) + '" referrerpolicy="no-referrer" loading="lazy">' + (dur ? '<span class="mine-vcard-dur">' + escapeHtml(dur) + '</span>' : '') + '</div>' : '<div class="mine-vcard-cover mine-vcard-cover-empty">暖阳</div>')
                    + '<div class="mine-vcard-title">' + escapeHtml(v.title || '') + '</div>'
                    + '<div class="mine-vcard-up">' + escapeHtml(v.up_name || '') + '</div>'
                    + '</div>';
            }).join('')
            + '</div></div>';
    } else {
        favHtml = '<div class="mine-section"><h3 class="mine-section-title">我的收藏</h3><div class="mine-empty">还没有收藏的视频<br>在视频播放页点击♡即可收藏</div></div>';
    }

    // ---- 常看UP（头像+名称+次数，横向排布）----
    const upSorted = Object.entries(upSetHelper()).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 8);
    let upHtml;
    if (upSorted.length > 0) {
        upHtml = '<div class="mine-section">'
            + '<h3 class="mine-section-title">常看UP</h3>'
            + '<div class="mine-up-hscroll">'
            + upSorted.map(function(u) {
                const uname = String(u[0]).replace(/'/g, '');
                return '<div class="mine-up-chip" onclick="filterByUp(\'' + uname + '\')">'
                    + upAvatarHtml(u[0])
                    + '<span class="mine-up-chip-name">' + escapeHtml(u[0]) + '</span>'
                    + '<span class="mine-up-chip-count">看过' + u[1] + '次</span>'
                    + '</div>';
            }).join('')
            + '</div></div>';
    } else {
        upHtml = '';
    }

    // ---- 设置入口（二级菜单）----
    const settingsHtml = '<div class="mine-section">'
        + '<div class="mine-menu-item" onclick="openSettings()">'
        + '<span class="mine-menu-label">设置</span>'
        + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mine-menu-arrow"><polyline points="9 18 15 12 9 6"/></svg>'
        + '</div>'
        + '</div>';

    mineContentEl.innerHTML = recentHtml + favHtml + upHtml + settingsHtml;
}

// "我的"页顶部公告按钮（复用云控公告）
function setupMineAnnounceBtn() {
    const btn = document.getElementById('mineAnnounceBtn');
    if (!btn) return;
    const cfg = getEffectiveConfig();
    const ann = cfg.announcement || {};
    btn.style.display = (ann.enabled && ann.title) ? '' : 'none';
    btn.onclick = function() {
        const a = getEffectiveConfig().announcement || {};
        if (a.title) showAnnounceModal(a.title, a.content || '');
    };
}

// 导航事件
if (navMine) navMine.addEventListener('click', function() { showMinePage(true); });

// 云控：我的板块开关（在 applyCloudConfig 中同步显隐 navMine）
function applyMineVisibility() {
    const mineVisible = isFeatureVisible('mine');
    if (navMine) navMine.style.display = mineVisible ? '' : 'none';
    // 设置入口兜底：正常时位于"我的"板块二级菜单；"我的"被云控关闭或灰度未抽中（不可见）时，
    // 还原到首页顶部 header 的 settingsBtn 显示，保证设置始终可进
    if (settingsBtn) settingsBtn.style.display = mineVisible ? 'none' : '';
    if (!mineVisible) {
        // 若当前停留在"我的"板块视图则切回首页（板块已被云控关闭）
        if (currentView === 'mine') showMinePage(false);
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
    const cats = ["全部"];
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
    if (currentCategory !== "全部") {
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

if (settingsBtn) settingsBtn.addEventListener("click", openSettings);
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
            // 桌面小组件/外部直达：URL 带 ?bvid= 时打开对应视频
            const targetBvid = new URLSearchParams(location.search).get('bvid');
            if (targetBvid) {
                const tv = allVideos.find(function (x) { return x.bvid === targetBvid; });
                if (tv) setTimeout(function () { openPlayer(tv); }, 600);
            }
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
syncHeaderHeight();
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

// 更新日志弹窗（内容从 data/changelog.json 动态加载，主站与外部智能客服共用同一数据源）
const aboutRow = document.getElementById('aboutRow');
const changelogModalOverlay = document.getElementById('changelogModalOverlay');
const changelogModalClose = document.getElementById('changelogModalClose');
const changelogArrow = document.getElementById('changelogArrow');
const changelogBody = document.querySelector('.changelog-modal-body');
let changelogLoaded = false;
async function loadChangelog() {
    if (!changelogBody || changelogLoaded) return;
    try {
        const resp = await fetch('data/changelog.json', { cache: 'no-store' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        if (!data || !Array.isArray(data.entries)) throw new Error('数据格式错误');
        changelogBody.innerHTML = data.entries.map(entry => {
            const items = (entry.content || []).map(c => '<p>' + escapeHtml(c) + '</p>').join('');
            return '<div class="changelog-entry">' +
                '<div class="changelog-entry-date">' + escapeHtml(entry.date) + '</div>' +
                '<div class="changelog-entry-content">' + items + '</div>' +
                '</div>';
        }).join('');
        changelogLoaded = true;
    } catch (err) {
        console.error('更新日志加载失败:', err);
        const loading = document.getElementById('changelogLoading');
        if (loading) loading.textContent = '更新日志加载失败，请稍后再试';
    }
}
if (aboutRow && changelogModalOverlay) {
    aboutRow.addEventListener('click', () => {
        loadChangelog();
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

// =====================
// 语音输入（Web Speech API · ASR）：零依赖，不支持环境优雅降级
// =====================
const NYVoice = (function () {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const supported = !!SR;
    // 桥接惰性解析（兼容 addJavascriptInterface 注入晚于脚本执行的时序）
    function getBridge() {
        try {
            if (window.AndroidVoiceBridge && typeof window.AndroidVoiceBridge.startVoice === "function") return window.AndroidVoiceBridge;
        } catch (e) {}
        return null;
    }
    let recog = null;
    let listening = false;

    function reset(btn) {
        listening = false;
        if (!btn) return;
        btn.classList.remove("listening");
        const label = btn.querySelector(".voice-input-label");
        if (label) label.textContent = "语音输入";
        btn.setAttribute("title", "语音输入");
    }

    // opts: { btn, target, ontext }  target 为要回填的搜索框
    // 原生桥接回调：MainActivity 在识别结束后调用 window.__onNativeVoiceResult({text|error})
    let nativePending = null; // 保存当前一次 toggle 的 opts
    if (!window.__onNativeVoiceResult) {
        window.__onNativeVoiceResult = function (res) {
            const o = nativePending; nativePending = null;
            if (!o) return;
            reset(o.btn);
            if (!res) return;
            if (res.text) {
                if (o.target) {
                    o.target.value = res.text;
                    o.target.dispatchEvent(new Event("input", { bubbles: true }));
                }
                if (o.ontext) o.ontext(res.text);
            } else if (res.error) {
                if (res.error === "cancelled") return; // 用户取消不打扰
                if (typeof showToast === "function") showToast("语音识别不可用，请用文字搜索");
            }
        };
    }

    function toggle(opts) {
        // 优先走原生桥接（WebView 壳 / 国产 ROM 自带识别引擎，不依赖 Web Speech API）
        const br = getBridge();
        if (br) {
            if (nativePending) { reset(opts.btn); return; } // 已有进行中的识别，忽略重复点击
            nativePending = opts;
            if (opts.btn) { opts.btn.classList.add("listening"); const lb = opts.btn.querySelector(".voice-input-label"); if (lb) lb.textContent = "聆听中…"; }
            if (typeof showToast === "function") showToast("请在弹出的界面中说出想看的内容");
            try { br.startVoice(); }
            catch (e) { nativePending = null; reset(opts.btn); if (typeof showToast === "function") showToast("启动语音识别失败"); }
            return;
        }
        // 回退：Web Speech API（桌面/安卓原生 Chrome/Edge）
        if (!supported) {
            if (typeof showToast === "function") showToast("当前浏览器不支持语音输入，请改用系统浏览器/Chrome 或文字搜索");
            return;
        }
        // 已在聆听 → 再次点击提前结束
        if (listening && recog) { recog.stop(); return; }
        if (listening) return;

        try { recog = new SR(); } catch (e) { showToast("语音识别启动失败"); return; }
        recog.lang = "zh-CN";
        recog.continuous = false;
        recog.interimResults = true;
        recog.maxAlternatives = 1;

        const btn = opts.btn, target = opts.target;
        listening = true;
        if (btn) {
            btn.classList.add("listening");
            const label = btn.querySelector(".voice-input-label");
            if (label) label.textContent = "聆听中…";
        }
        if (typeof showToast === "function") showToast("请说出你想看的内容");

        recog.onresult = (ev) => {
            let text = "";
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
                text += ev.results[i][0].transcript;
            }
            text = text.trim();
            if (!text) return;
            if (target) {
                target.value = text;
                target.dispatchEvent(new Event("input", { bubbles: true }));
            }
            if (opts.ontext) opts.ontext(text);
        };
        recog.onerror = (ev) => {
            const e = ev.error;
            let msg = "语音识别暂时不可用";
            if (e === "not-allowed" || e === "service-not-allowed") msg = "请在浏览器允许使用麦克风";
            else if (e === "no-speech") msg = "没听清，请再说一次";
            else if (e === "audio-capture") msg = "未检测到麦克风设备";
            if (typeof showToast === "function") showToast(msg);
        };
        recog.onend = () => reset(btn);

        try { recog.start(); }
        catch (e) { reset(btn); }
    }

    return { toggle: toggle, supported: function () { return supported || !!getBridge(); } };
})();

// =====================
// 移动端适配：全屏搜索页 + 语音按钮 + 设置二级页
// =====================
(function initMobileAdapt() {
    const searchView = document.getElementById("searchView");
    const searchViewBack = document.getElementById("searchViewBack");
    const searchViewInput = document.getElementById("searchViewInput");
    const searchViewClear = document.getElementById("searchViewClear");
    const searchViewResults = document.getElementById("searchViewResults");
    const voiceInputBtn = document.getElementById("voiceInputBtn");
    const settingsMorePage = document.getElementById("settingsMorePage");
    const settingsMoreBack = document.getElementById("settingsMoreBack");
    const settingsMoreBody = document.getElementById("settingsMoreBody");
    const settingsMoreEntry = document.getElementById("settingsMoreEntry");
    if (!searchView || !settingsMorePage) return;

    const mq = window.matchMedia("(max-width: 767px)");
    let isMobile = mq.matches;

    // 移动端全屏页「从右推进 / 退场」转场 helper
    // 尊重减弱动效：无动画时靠 setTimeout 兜底隐藏，避免卡住不关
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function pageOpen(el) {
        el.classList.remove("nv-out");
        el.style.display = "flex";
        if (!reduceMotion) {
            el.classList.remove("nv-in");
            void el.offsetWidth; // 强制重排，确保动画重新播放
            el.classList.add("nv-in");
        }
    }
    function pageClose(el, after) {
        if (el.style.display === "none") { if (after) after(); return; }
        if (reduceMotion) {
            el.style.display = "none";
            el.classList.remove("nv-in", "nv-out");
            if (after) after();
            return;
        }
        el.classList.remove("nv-in");
        el.classList.add("nv-out");
        setTimeout(function () {
            el.style.display = "none";
            el.classList.remove("nv-out");
            if (after) after();
        }, 240);
    }

    // 语音按钮定位到输入法键盘上方
    function positionVoiceBtn() {
        if (!isMobile || searchView.style.display === "none") {
            voiceInputBtn.style.bottom = "";
            return;
        }
        if (window.visualViewport) {
            const kb = window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop;
            voiceInputBtn.style.bottom = Math.max(10, kb + 10) + "px";
        }
    }
    if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", positionVoiceBtn);
        window.visualViewport.addEventListener("scroll", positionVoiceBtn);
    }

    // 搜索结果卡片渲染
    function renderSearchCard(video) {
        const card = document.createElement("div");
        card.className = "video-card";
        const coverHtml = video.cover
            ? `<img class="video-cover" src="${video.cover}" alt="${escapeHtml(video.title)}" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=\\'video-cover-placeholder\\'>暖阳</div>'">`
            : `<div class="video-cover-placeholder">暖阳</div>`;
        card.innerHTML = `
            <div class="video-cover-wrap">${coverHtml}
                ${video.duration_text ? `<span class="video-duration">${video.duration_text}</span>` : ""}
            </div>
            <div class="video-info">
                <div class="video-title">${escapeHtml(video.title)}</div>
                <div class="video-meta"><span class="video-up">${escapeHtml(video.up_name)}</span></div>
            </div>`;
        card.addEventListener("click", () => openPlayer(video));
        searchViewResults.appendChild(card);
    }

    function renderSearchResults(kw) {
        searchViewResults.innerHTML = "";
        kw = (kw || "").trim();
        if (!kw) {
            searchViewResults.innerHTML = '<div class="search-view-empty">输入关键词搜索视频或 UP 主</div>';
            return;
        }
        const lower = kw.toLowerCase();
        const matched = allVideos.filter(v =>
            (v.title && v.title.toLowerCase().includes(lower)) ||
            (v.up_name && v.up_name.toLowerCase().includes(lower))
        ).slice(0, 60);
        if (matched.length === 0) {
            searchViewResults.innerHTML = '<div class="search-view-empty">没有找到相关内容</div>';
            return;
        }
        matched.forEach(renderSearchCard);
    }

    function openSearchView() {
        pageOpen(searchView);
        searchViewInput.value = searchInput.value;
        renderSearchResults(searchViewInput.value);
        searchViewClear.style.display = searchViewInput.value ? "block" : "none";
        setTimeout(() => searchViewInput.focus(), 120);
        positionVoiceBtn();
    }
    function closeSearchView() {
        searchViewInput.blur();
        voiceInputBtn.style.bottom = "";
        pageClose(searchView);
    }

    // 顶部搜索框：移动端点击/聚焦改为打开全屏搜索页
    searchInput.addEventListener("focus", () => {
        if (!isMobile) return;
        searchInput.blur();
        openSearchView();
    });
    searchViewBack.addEventListener("click", closeSearchView);
    let svDebounce;
    searchViewInput.addEventListener("input", () => {
        searchViewClear.style.display = searchViewInput.value ? "block" : "none";
        clearTimeout(svDebounce);
        svDebounce = setTimeout(() => renderSearchResults(searchViewInput.value), 200);
        positionVoiceBtn();
    });
    searchViewClear.addEventListener("click", () => {
        searchViewInput.value = "";
        searchViewClear.style.display = "none";
        renderSearchResults("");
        searchViewInput.focus();
    });
    // 语音输入按钮：识别结果回填全屏搜索页输入框（复用其 input 逻辑自动搜索）
    voiceInputBtn.addEventListener("click", () => {
        NYVoice.toggle({ btn: voiceInputBtn, target: searchViewInput });
    });
    if (!NYVoice.supported()) {
        voiceInputBtn.classList.add("unsupported");
        const vl = voiceInputBtn.querySelector(".voice-input-label");
        if (vl) vl.textContent = "暂不支持";
    }

    // 设置二级页：移动端把内容/关于移入更多设置页
    const settingsBody = settingsPanel.querySelector(".settings-body");
    const allSections = Array.prototype.slice.call(settingsBody.querySelectorAll(":scope > .settings-section"));
    const keepFirst = allSections[0]; // 外观
    const quickConfigSection = document.getElementById('quickConfigSection');
    // 外观、暖阳快速配置、更多设置入口 三者常驻一级设置页；内容/关于等才移入二级页
    const movable = allSections.filter(s => s !== keepFirst && s !== settingsMoreEntry && s !== quickConfigSection);
    let mobileApplied = false;

    function toMoreLayout() {
        movable.forEach(s => settingsMoreBody.appendChild(s));
        settingsMoreEntry.style.display = "";
    }
    function toDesktopLayout() {
        movable.forEach(s => settingsBody.appendChild(s));
        settingsMoreEntry.style.display = "none";
    }
    function applySettingsLayout() {
        if (isMobile && !mobileApplied) { toMoreLayout(); mobileApplied = true; }
        else if (!isMobile && mobileApplied) { toDesktopLayout(); mobileApplied = false; }
    }
    applySettingsLayout();

    settingsMoreEntry.addEventListener("click", () => {
        pageOpen(settingsMorePage);
    });
    settingsMoreBack.addEventListener("click", () => {
        pageClose(settingsMorePage);
    });
    // 设置面板关闭时一并收起更多设置页（避免残留 nv 动画类）
    new MutationObserver(() => {
        if (!settingsPanel.classList.contains("active")) {
            settingsMorePage.style.display = "none";
            settingsMorePage.classList.remove("nv-in", "nv-out");
        }
    }).observe(settingsPanel, { attributes: true, attributeFilter: ["class"] });

    // 断点切换
    mq.addEventListener("change", (e) => {
        isMobile = e.matches;
        if (!isMobile) { closeSearchView(); }
        applySettingsLayout();
        positionVoiceBtn();
    });
})();


// =====================
// 大屏快速配置（身份选择 / 子女帮配 / 语音占位）
// 移动端沿用全屏搜索页与设置二级页，不触发本弹层
// =====================
(function initQuickConfig() {
    const ROLE_KEY = 'nuanyang_role_done';
    const obOverlay = document.getElementById('quickConfigOverlay');
    const obChild = document.getElementById('obChildPanel');
    const quickConfigRow = document.getElementById('quickConfigRow');
    const searchVoiceBtn = document.getElementById('searchVoiceBtn');
    if (!obOverlay || !obChild) return;

    const mqDesktop = window.matchMedia('(min-width: 768px)');

    const QUICK_ROLE_KEY = 'nuanyang-quick-role';
    const QUICK_CODE_KEY = 'nuanyang-quick-code';

    function showOverlay(el) { el.style.display = 'flex'; }
    function hideOverlay(el) { el.style.display = 'none'; }
    function openQuickConfig() { showOverlay(obOverlay); }
    function openChildPanel() { hideOverlay(obOverlay); populateLikes(); showOverlay(obChild); }

    // base64 工具（支持中文）
    function encB64(str) { try { return btoa(unescape(encodeURIComponent(str))); } catch (e) { return ''; } }
    function decB64(b64) { try { return decodeURIComponent(escape(atob(String(b64).trim()))); } catch (e) { return ''; } }

    function applyRole(role) {
        if (role === 'elder') {
            settings.fontSize = 'font-2xl';
            settings.theme = 'classic';
        } else {
            // child / user：普通字体；从老人模式切走时删除本地保存的配置代码与喜好
            settings.fontSize = 'font-lg';
            localStorage.removeItem(QUICK_CODE_KEY);
            settings.likes = [];
        }
        saveSettings();
        applyFontSize();
        applyTheme();
        localStorage.setItem(ROLE_KEY, '1');
        localStorage.setItem(QUICK_ROLE_KEY, role);
        renderCodeSection();
    }

    // 身份卡片
    document.getElementById('obCardChild').addEventListener('click', openChildPanel);
    document.getElementById('obCardElder').addEventListener('click', () => { applyRole('elder'); hideOverlay(obOverlay); });
    document.getElementById('obCardUser').addEventListener('click', () => { applyRole('user'); hideOverlay(obOverlay); });

    // 单选选项组（字体/主题）
    function bindChoices(id) {
        const box = document.getElementById(id);
        if (!box) return;
        box.addEventListener('click', (e) => {
            const btn = e.target.closest('.ob-choice');
            if (!btn) return;
            box.querySelectorAll('.ob-choice').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            box.dataset.value = btn.dataset.val;
        });
    }
    bindChoices('obFontChoices');
    bindChoices('obThemeChoices');

    // 老人喜好：多选，来源于视频分类
    const likeBox = document.getElementById('obLikeChoices');
    function populateLikes() {
        if (!likeBox || likeBox.dataset.filled === '1') return;
        let cats = [];
        try {
            const seen = {};
            allVideos.forEach(v => {
                const arr = Array.isArray(v.categories) ? v.categories : (v.category ? [v.category] : []);
                arr.forEach(c => { if (c) seen[c] = (seen[c] || 0) + 1; });
            });
            cats = Object.keys(seen).sort((a, b) => seen[b] - seen[a]);
        } catch (e) {}
        if (!cats.length) { likeBox.innerHTML = '<span class="ob-likes-empty">暂无可选项</span>'; likeBox.dataset.filled = '1'; return; }
        cats.forEach(c => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'ob-choice';
            b.textContent = c;
            b.dataset.val = c;
            b.addEventListener('click', () => b.classList.toggle('selected'));
            likeBox.appendChild(b);
        });
        likeBox.dataset.filled = '1';
    }

    // 生成配置代码（Base64）
    const obShareBox = document.getElementById('obShareBox');
    const obShareInput = document.getElementById('obShareInput');
    const obShareCopy = document.getElementById('obShareCopy');
    document.getElementById('obChildBack').addEventListener('click', () => { hideOverlay(obChild); openQuickConfig(); });

    function buildChildCode() {
        const font = document.getElementById('obFontChoices').dataset.value || 'font-2xl';
        const theme = document.getElementById('obThemeChoices').dataset.value || 'classic';
        const likes = likeBox ? Array.prototype.map.call(likeBox.querySelectorAll('.ob-choice.selected'), b => b.dataset.val) : [];
        const rec = document.getElementById('obRecommend').checked ? 1 : 0;
        const dig = document.getElementById('obDigest').checked ? 1 : 0;
        const obj = { v: 1, f: font, t: theme, l: likes, r: rec, d: dig };
        return encB64(JSON.stringify(obj));
    }
    document.getElementById('obChildDone').addEventListener('click', () => {
        const code = buildChildCode();
        if (!code) { if (typeof showToast === 'function') showToast('生成失败，请重试'); return; }
        obShareInput.textContent = code;
        obShareBox.style.display = 'flex';
    });
    function fallbackCopy(txt) {
        const ta = document.createElement('textarea');
        ta.value = txt; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
    }
    if (obShareCopy) obShareCopy.addEventListener('click', () => {
        const txt = obShareInput.textContent || '';
        let ok = false;
        try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt); ok = true; } } catch (e) {}
        if (!ok) { fallbackCopy(txt); }
        obShareCopy.textContent = '已复制';
        setTimeout(() => { obShareCopy.textContent = '复制代码'; }, 1500);
    });
    obChild.addEventListener('click', (e) => { if (e.target === obChild) { hideOverlay(obChild); openQuickConfig(); } });

    // 内容板块“暖阳快速配置”入口（移动端与大屏均可进入）
    if (quickConfigRow) quickConfigRow.addEventListener('click', () => { openQuickConfig(); });

    // ===== 配置代码套用（老人模式在设置内输入） =====
    const codeInputSection = document.getElementById('codeInputSection');
    const codeInput = document.getElementById('codeInput');
    const codeApplyBtn = document.getElementById('codeApplyBtn');
    const codeStatus = document.getElementById('codeStatus');
    const codeAppliedRow = document.getElementById('codeAppliedRow');
    const codeAppliedText = document.getElementById('codeAppliedText');
    const codeClearBtn = document.getElementById('codeClearBtn');

    function setStatus(msg, ok) {
        if (!codeStatus) return;
        codeStatus.textContent = msg;
        codeStatus.style.color = ok ? 'var(--rausch)' : '#d33';
        codeStatus.style.display = 'block';
    }
    function applyCodeString(code) {
        const json = decB64(code);
        let obj;
        try { obj = JSON.parse(json); } catch (e) { obj = null; }
        if (!obj || !obj.f) { setStatus('配置代码无效，请核对后重试', false); return false; }
        if (FONT_SIZES.includes(obj.f)) settings.fontSize = obj.f;
        if (['auto', 'light', 'dark', 'liquid', 'classic'].includes(obj.t)) settings.theme = obj.t;
        settings.recommend = !!obj.r;
        settings.digest = !!obj.d;
        if (Array.isArray(obj.l) && obj.l.length) {
            settings.likes = obj.l;
            currentCategory = obj.l[0];
        }
        saveSettings();
        applyFontSize();
        applyTheme();
        localStorage.setItem(QUICK_CODE_KEY, String(code).trim());
        try { if (typeof refreshList === 'function') refreshList(); } catch (e) {}
        try { document.querySelectorAll('.category-btn').forEach(b => b.classList.toggle('active', b.dataset.category === currentCategory)); } catch (e) {}
        setStatus('已应用配置', true);
        renderCodeSection();
        if (typeof showToast === 'function') showToast('配置已套好');
        return true;
    }
    if (codeApplyBtn) codeApplyBtn.addEventListener('click', () => {
        const c = (codeInput && codeInput.value || '').trim();
        if (!c) { setStatus('请先输入配置代码', false); return; }
        applyCodeString(c);
    });
    if (codeClearBtn) codeClearBtn.addEventListener('click', () => {
        localStorage.removeItem(QUICK_CODE_KEY);
        if (codeInput) codeInput.value = '';
        renderCodeSection();
        setStatus('已清除本地配置代码', true);
    });

    function renderCodeSection() {
        if (!codeInputSection) return;
        const role = localStorage.getItem(QUICK_ROLE_KEY);
        const stored = localStorage.getItem(QUICK_CODE_KEY);
        if (role === 'elder') {
            codeInputSection.style.display = '';
            if (stored) {
                codeAppliedRow.style.display = '';
                codeAppliedText.textContent = stored.length > 60 ? stored.slice(0, 57) + '…' : stored;
            } else {
                codeAppliedRow.style.display = 'none';
            }
        } else {
            codeInputSection.style.display = 'none';
        }
    }

    // 首次打开（大屏且未配置过）自动弹身份选择
    if (mqDesktop.matches && !localStorage.getItem(ROLE_KEY)) {
        setTimeout(openQuickConfig, 600);
    }
    renderCodeSection();

    // 大屏语音输入按钮：识别结果回填顶部搜索框（复用其 input 逻辑自动搜索）
    if (searchVoiceBtn) searchVoiceBtn.addEventListener('click', () => {
        NYVoice.toggle({ btn: searchVoiceBtn, target: searchInput });
    });
    if (searchVoiceBtn && !NYVoice.supported()) searchVoiceBtn.classList.add('unsupported');
})();

// =====================
// 云控系统（功能开关 / 灰度 / 公告 / 调试模式）
// =====================
const CLOUD_CACHE_KEY = 'nuanyang_cloud_cache';
const GRAY_PREFIX = 'nuanyang_gray_';
const DEBUG_FLAG_KEY = 'nuanyang_debug_mode';
const DEBUG_SETTINGS_KEY = 'nuanyang_debug_settings';
const ANNOUNCE_SEEN_KEY = 'nuanyang_announce_seen';

let cloudConfig = null;
let debugEnabled = false;
let debugSettings = null;

// 从本地缓存加载（立即应用避免闪烁）
try {
    const cached = localStorage.getItem(CLOUD_CACHE_KEY);
    if (cached) cloudConfig = JSON.parse(cached);
} catch (e) {}
try {
    debugEnabled = localStorage.getItem(DEBUG_FLAG_KEY) === '1';
    const ds = localStorage.getItem(DEBUG_SETTINGS_KEY);
    if (ds) debugSettings = JSON.parse(ds);
} catch (e) {}

if (cloudConfig) applyCloudConfig();

// fetch 云端最新配置
fetch('data/cloud_config.json?t=' + Date.now())
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(cfg => {
        cloudConfig = cfg;
        try { localStorage.setItem(CLOUD_CACHE_KEY, JSON.stringify(cfg)); } catch (e) {}
        applyCloudConfig();
    })
    .catch(() => {
        // 云端配置加载失败：回退为默认全显示（无缓存时），并解除加载态
        applyCloudConfig();
    });

function getEffectiveConfig() {
    if (!cloudConfig) return { features: {}, announcement: { enabled: false, title: '', content: '' }, debug: {} };
    return cloudConfig;
}

function getDebugOverride() {
    return (debugEnabled && debugSettings) ? debugSettings : null;
}

// 灰度抽签：本地保存结果，抽过不再重抽
function grayResult(key, prob) {
    const k = GRAY_PREFIX + key;
    let v = null;
    try { v = localStorage.getItem(k); } catch (e) {}
    if (v === null) {
        v = (Math.random() < prob) ? '1' : '0';
        try { localStorage.setItem(k, v); } catch (e) {}
    }
    return v === '1';
}

// 判断功能是否可见（调试本机设置优先于云控）
function isFeatureVisible(key) {
    const dbg = getDebugOverride();
    if (dbg && dbg.features && dbg.features[key]) {
        const f = dbg.features[key];
        if (!f.enabled) return false;
        if (f.gray) return grayResult(key, f.gray_probability || 0);
        return true;
    }
    const cfg = getEffectiveConfig();
    const feat = (cfg.features || {})[key];
    if (!feat) return true;
    if (!feat.enabled) return false;
    if (feat.gray) return grayResult(key, feat.gray_probability || 0);
    return true;
}

// 应用功能开关
function applyCloudConfig() {
    applyMineVisibility();
    // 短视频
    if (navShorts) navShorts.style.display = isFeatureVisible('shorts') ? '' : 'none';
    // 液态玻璃
    const showLiquid = isFeatureVisible('liquid');
    document.querySelectorAll('.skin-option[data-theme="liquid"]').forEach(el => {
        el.style.display = showLiquid ? '' : 'none';
    });
    if (liquidIntensityRow) {
        liquidIntensityRow.style.display = (showLiquid && settings.theme === 'liquid') ? '' : 'none';
    }
    // 每日摘要
    const showDigest = isFeatureVisible('daily_digest');
    const digestGroup = document.getElementById('digestSettingsGroup');
    if (digestGroup) digestGroup.style.display = showDigest ? '' : 'none';
    if (digestBtn) digestBtn.style.display = (showDigest && settings.digest) ? '' : 'none';
    // 公告
    setupAnnounceBtn();
    applyAnnouncement();
    // 调试入口
    setupDebugMode();
    // 云控已应用，移除加载态标记
    document.body.classList.remove("cloud-pending");
}

// === 公告 ===
function setupAnnounceBtn() {
    const btn = document.getElementById('announceBtn');
    if (!btn) return;
    const cfg = getEffectiveConfig();
    const ann = cfg.announcement || {};
    btn.style.display = (ann.enabled && ann.title) ? '' : 'none';
    btn.onclick = () => {
        const a = getEffectiveConfig().announcement || {};
        if (a.title) showAnnounceModal(a.title, a.content || '');
    };
}

function applyAnnouncement() {
    const cfg = getEffectiveConfig();
    const ann = cfg.announcement || {};
    if (!ann.enabled || !ann.title) return;
    const today = new Date().toDateString();
    let seen = null;
    try { seen = localStorage.getItem(ANNOUNCE_SEEN_KEY); } catch (e) {}
    if (seen !== today) {
        try { localStorage.setItem(ANNOUNCE_SEEN_KEY, today); } catch (e) {}
        showAnnounceModal(ann.title, ann.content || '');
    }
}

function showAnnounceModal(title, content) {
    const overlay = document.getElementById('announceModal');
    if (!overlay) return;
    const titleEl = document.getElementById('announceModalTitle');
    const contentEl = document.getElementById('announceModalContent');
    if (titleEl) titleEl.textContent = title;
    if (contentEl) contentEl.innerHTML = String(content || '').replace(/\n/g, '<br>');
    overlay.classList.add('show');
}

function closeAnnounceModal() {
    const overlay = document.getElementById('announceModal');
    if (overlay) overlay.classList.remove('show');
}

// === 调试模式（点击标题9次 + 密码） ===
function setupDebugMode() {
    const headerTitle = document.querySelector('.header-title');
    if (!headerTitle || headerTitle.dataset.cloudBound) return;
    headerTitle.dataset.cloudBound = '1';
    let clicks = 0;
    let timer = null;
    headerTitle.addEventListener('click', () => {
        clicks++;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { clicks = 0; }, 3000);
        if (clicks >= 9) {
            clicks = 0;
            showDebugPwdModal();
        }
    });
}

async function sha256Hex(str) {
    try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) { return ''; }
}

function showDebugPwdModal() {
    const overlay = document.getElementById('debugPwdModal');
    if (!overlay) return;
    overlay.classList.add('show');
    const input = document.getElementById('debugPwdInput');
    if (input) { input.value = ''; input.focus(); }
    const err = document.getElementById('debugPwdError');
    if (err) err.textContent = '';
}

function closeDebugPwdModal() {
    const overlay = document.getElementById('debugPwdModal');
    if (overlay) overlay.classList.remove('show');
}

async function verifyDebugPwd() {
    const input = document.getElementById('debugPwdInput');
    const hash = (getEffectiveConfig().debug && getEffectiveConfig().debug.password_hash) || '';
    if (!input || !hash) { closeDebugPwdModal(); return; }
    const pwdHash = await sha256Hex(input.value);
    if (pwdHash === hash) {
        debugEnabled = true;
        try { localStorage.setItem(DEBUG_FLAG_KEY, '1'); } catch (e) {}
        if (!debugSettings) {
            debugSettings = {
                features: {
                    shorts: { enabled: true, gray: false, gray_probability: 0 },
                    liquid: { enabled: true, gray: false, gray_probability: 0 },
                    daily_digest: { enabled: true, gray: false, gray_probability: 0 }
                },
                announcement: { enabled: false, title: '', content: '' }
            };
            try { localStorage.setItem(DEBUG_SETTINGS_KEY, JSON.stringify(debugSettings)); } catch (e) {}
        }
        closeDebugPwdModal();
        showDebugPanel();
        applyCloudConfig();
    } else {
        const err = document.getElementById('debugPwdError');
        if (err) err.textContent = '密码错误';
    }
}

// === 调试面板（本机设置，和云控相同项） ===
function showDebugPanel() {
    const panel = document.getElementById('debugPanel');
    if (!panel) return;
    renderDebugPanel();
    panel.classList.add('show');
}

function closeDebugPanel() {
    const panel = document.getElementById('debugPanel');
    if (panel) panel.classList.remove('show');
}

function renderDebugPanel() {
    const list = document.getElementById('debugFeatureList');
    if (!list) return;
    const FEATURES = [
        { key: 'shorts', label: '短视频', desc: '底部导航短视频刷流' },
        { key: 'liquid', label: '液态玻璃', desc: '液态玻璃主题外观' },
        { key: 'daily_digest', label: '每日摘要', desc: '每日摘要/祝语/今日推荐' },
    ];
    list.innerHTML = FEATURES.map(f => {
        const feat = debugSettings.features[f.key] || { enabled: true, gray: false, gray_probability: 0 };
        const pct = Math.round((feat.gray_probability || 0) * 100);
        return `
        <div class="settings-row">
            <div class="settings-row-label">
                <span class="settings-row-name">${f.label}</span>
                <span class="settings-row-desc">${f.desc}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:12px;color:var(--mute);">灰度</span>
                <label class="toggle" style="margin:0;">
                    <input type="checkbox" ${feat.gray ? 'checked' : ''} onchange="setDebugGray('${f.key}',this.checked)">
                    <span class="toggle-slider"></span>
                </label>
                <input type="range" min="0" max="100" value="${pct}" style="width:70px;" oninput="setDebugProb('${f.key}',this.value)">
                <span id="debugPct_${f.key}" style="font-size:12px;color:var(--mute);width:36px;">${pct}%</span>
                <label class="toggle" style="margin:0;">
                    <input type="checkbox" ${feat.enabled ? 'checked' : ''} onchange="setDebugEnabled('${f.key}',this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            </div>
        </div>`;
    }).join('');
}

function setDebugEnabled(key, val) {
    debugSettings.features[key].enabled = val;
    saveDebugSettings();
    applyCloudConfig();
}
function setDebugGray(key, val) {
    debugSettings.features[key].gray = val;
    saveDebugSettings();
}
function setDebugProb(key, val) {
    debugSettings.features[key].gray_probability = parseInt(val) / 100;
    document.getElementById('debugPct_' + key).textContent = val + '%';
    saveDebugSettings();
}

function saveDebugSettings() {
    try { localStorage.setItem(DEBUG_SETTINGS_KEY, JSON.stringify(debugSettings)); } catch (e) {}
}

function exitDebugMode() {
    debugEnabled = false;
    try { localStorage.removeItem(DEBUG_FLAG_KEY); } catch (e) {}
    try { localStorage.removeItem(DEBUG_SETTINGS_KEY); } catch (e) {}
    debugSettings = null;
    closeDebugPanel();
    applyCloudConfig();
}

