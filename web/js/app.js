/**
 * 暖阳 - 前端逻辑 v3
 * 功能：随机展示、无限滚动、深色模式、5档字号、个性化推荐、设置中心
 * 支持多分类（每个视频可属于多个板块）
 */

// === 配置 ===
const DATA_URL = "data/videos.json";
const CODE_VERSION = "2026-08-30 15:05"; // 代码更新时间（手动维护）
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
if (navHome) navHome.addEventListener("click", () => showShortsPage(false));
if (navShorts) navShorts.addEventListener("click", () => showShortsPage(true));
if (shortsBackBtn) shortsBackBtn.addEventListener("click", () => showShortsPage(false));
// =====================
// 今天板块（天气 / 推荐 / 常看UP / 我的收藏）
// =====================
const navToday = document.getElementById("navToday");
const todayViewEl = document.getElementById("todayView");
const todayBackBtn = document.getElementById("todayBackBtn");
const todayContentEl = document.getElementById("todayContent");

const TODAY_CITY_KEY = 'nuanyang_today_city';
const TODAY_FOLD_KEY = 'nuanyang_today_card_fold';
let todayCity = '北京';
try { todayCity = localStorage.getItem(TODAY_CITY_KEY) || '北京'; } catch (e) {}
let todayWeather = null; // { city, temp, code, humidity, wind, daily:[{date,max,min,code}], updatedAt }

// WMO 天气码 -> [中文, emoji]
const WMO_COND = {
  0: ['晴', '☀️'], 1: ['基本晴', '🌤️'], 2: ['多云', '⛅'], 3: ['阴', '☁️'],
  45: ['雾', '🌫️'], 48: ['雾凇', '🌫️'],
  51: ['毛毛雨', '🌦️'], 53: ['毛毛雨', '🌦️'], 55: ['毛毛雨', '🌦️'],
  61: ['小雨', '🌧️'], 63: ['中雨', '🌧️'], 65: ['大雨', '🌧️'], 66: ['冻雨', '🌧️'], 67: ['冻雨', '🌧️'],
  71: ['小雪', '🌨️'], 73: ['中雪', '🌨️'], 75: ['大雪', '❄️'], 77: ['雪粒', '🌨️'],
  80: ['阵雨', '🌦️'], 81: ['阵雨', '🌦️'], 82: ['强阵雨', '⛈️'],
  85: ['阵雪', '🌨️'], 86: ['阵雪', '❄️'],
  95: ['雷阵雨', '⛈️'], 96: ['雷阵雨', '⛈️'], 99: ['雷阵雨', '⛈️']
};
const TODAY_CITIES = ['北京','上海','广州','深圳','成都','重庆','杭州','武汉','西安','南京','天津','苏州','长沙','郑州','青岛','沈阳','昆明','哈尔滨','乌鲁木齐','兰州'];

function wmoText(code) { const c = WMO_COND[code] || ['未知', '❓']; return c; }

// 简洁天气 SVG 图标（替代 emoji，减少AI味）
const WMO_ICON = {
    sun: '<svg class="today-wicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
    partly: '<svg class="today-wicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 12a4.5 4.5 0 0 0-8.9-1.2A3.5 3.5 0 0 0 8 18h9a3.5 3.5 0 0 0 .5-6.97z"/><circle cx="7" cy="8" r="2"/></svg>',
    cloud: '<svg class="today-wicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>',
    fog: '<svg class="today-wicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    drizzle: '<svg class="today-wicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2"/></svg>',
    rain: '<svg class="today-wicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><path d="M7 18l-1.5 3M12 18l-1.5 3M17 18l-1.5 3"/></svg>',
    snow: '<svg class="today-wicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><path d="M8 18l.01.01M12 18l.01.01M16 18l.01.01"/></svg>',
    thunder: '<svg class="today-wicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><path d="M12 16l-2 4h3l-1.5 4"/></svg>'
};
function wmoIcon(code) {
    if (code === 0 || code === 1) return WMO_ICON.sun;
    if (code === 2) return WMO_ICON.partly;
    if (code === 3) return WMO_ICON.cloud;
    if (code === 45 || code === 48) return WMO_ICON.fog;
    if (code >= 51 && code <= 55) return WMO_ICON.drizzle;
    if (code >= 61 && code <= 67 || code >= 80 && code <= 82) return WMO_ICON.rain;
    if (code >= 71 && code <= 77 || code >= 85 && code <= 86) return WMO_ICON.snow;
    if (code >= 95) return WMO_ICON.thunder;
    return WMO_ICON.cloud;
}

// 卡片图标（简洁 SVG，替代 emoji）
const CARD_ICON = {
    weather: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
    recommend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18.8 6.2 21l1.1-6.5L2.6 9.8l6.5-.9z"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    fav: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    tip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/></svg>'
};

// 进入/退出今天板块
function showTodayPage(show) {
    currentView = show ? 'today' : 'main';
    var siteHeader = document.querySelector('.header');
    var siteFooter = document.querySelector('.footer');
    if (show) {
        videoListEl.style.display = 'none';
        loadMoreEl.style.display = 'none';
        scrollSentinel.style.display = 'none';
        categoriesEl.style.display = 'none';
        if (digestBtn) digestBtn.style.display = 'none';
        if (refreshBtn) refreshBtn.style.display = 'none';
        if (siteHeader) siteHeader.style.display = 'none';
        if (siteFooter) siteFooter.style.display = 'none';
        scrollObserver.disconnect();
        todayViewEl.style.display = 'block';
        navHome.classList.remove('active');
        navShorts.classList.remove('active');
        navToday.classList.add('active');
        renderTodayPage();
        if (!todayWeather) fetchTodayWeather();
    } else {
        videoListEl.style.display = '';
        scrollSentinel.style.display = '';
        categoriesEl.style.display = '';
        if (siteHeader) siteHeader.style.display = '';
        if (siteFooter) siteFooter.style.display = '';
        if (refreshBtn) refreshBtn.style.display = '';
        if (digestBtn) digestBtn.style.display = settings.digest ? '' : 'none';
        scrollObserver.observe(scrollSentinel);
        todayViewEl.style.display = 'none';
        navHome.classList.add('active');
        navShorts.classList.remove('active');
        navToday.classList.remove('active');
    }
}

// 拉取天气（Open-Meteo，无需Key）
async function fetchTodayWeather() {
    try {
        const geo = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(todayCity) + '&count=1&language=zh');
        const gd = await geo.json();
        const loc = gd.results && gd.results[0];
        if (!loc) throw new Error('未找到城市');
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.latitude + '&longitude=' + loc.longitude +
            '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m' +
            '&daily=temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset' +
            '&forecast_days=3&timezone=Asia%2FShanghai';
        const fc = await fetch(url);
        const d = await fc.json();
        todayWeather = {
            city: loc.name || todayCity,
            temp: Math.round(d.current.temperature_2m),
            feels: Math.round(d.current.apparent_temperature != null ? d.current.apparent_temperature : d.current.temperature_2m),
            code: d.current.weather_code,
            humidity: d.current.relative_humidity_2m,
            wind: Math.round(d.current.wind_speed_10m),
            sunrise: d.daily && d.daily.sunrise ? d.daily.sunrise[0] : '',
            sunset: d.daily && d.daily.sunset ? d.daily.sunset[0] : '',
            daily: (d.daily.time || []).map(function(t, i) { return {
                date: t, max: Math.round(d.daily.temperature_2m_max[i]), min: Math.round(d.daily.temperature_2m_min[i]), code: d.daily.weather_code[i]
            }; }),
            updatedAt: Date.now()
        };
        renderTodayPage();
    } catch (e) {
        console.error('天气拉取失败:', e);
        todayWeather = null;
    }
}

// 计算卡片活跃度（0-100），决定排序与是否折叠
function computeCardActivity() {
    const now = Date.now();
    const day = 86400000;
    const upSet = {};
    let recentViews = 0;
    for (const bvid in viewHistory) {
        const h = viewHistory[bvid];
        if (h.upName) upSet[h.upName] = (upSet[h.upName] || 0) + (h.count || 1);
        if (h.lastView && h.lastView > now - 3 * day) recentViews++;
    }
    const upCount = Object.keys(upSet).length;
    let recentFavs = 0;
    for (const bvid in favorites) {
        if (favorites[bvid].favoritedAt && favorites[bvid].favoritedAt > now - 3 * day) recentFavs++;
    }
    const upActive = (recentViews > 0 || upCount > 0) ? Math.min(100, 55 + recentViews * 3 + upCount * 2) : 25;
    const favActive = Object.keys(favorites).length > 0 ? Math.min(100, 50 + recentFavs * 8) : 20;
    return { weather: 100, recommend: 95, up: upActive, fav: favActive };
}

// 读取/写入卡片折叠状态
function getFoldedCards() {
    try { const v = JSON.parse(localStorage.getItem(TODAY_FOLD_KEY) || '{}'); return v; } catch (e) { return {}; }
}
function setFoldedCard(key, folded) {
    const f = getFoldedCards();
    f[key] = folded ? 1 : 0;
    try { localStorage.setItem(TODAY_FOLD_KEY, JSON.stringify(f)); } catch (e) {}
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
    showTodayPage(false);
    window.scrollTo(0, 0);
}

// 折叠/展开卡片
function toggleTodayCard(key) {
    const card = document.getElementById('card-' + key);
    if (!card) return;
    const body = card.querySelector('.today-card-body');
    const arrow = card.querySelector('.today-card-arrow');
    const foldedNow = body.style.display === 'none';
    body.style.display = foldedNow ? '' : 'none';
    card.classList.toggle('collapsed', !foldedNow);
    arrow.textContent = foldedNow ? '▾' : '▸';
    setFoldedCard(key, !foldedNow);
}

// 城市选择器
function showCityPicker() {
    const citySel = document.getElementById('todayCitySelect');
    if (!citySel) return;
    citySel.value = todayCity;
    citySel.style.display = (citySel.style.display === 'none' || !citySel.style.display) ? 'block' : 'none';
}
function changeTodayCity(sel) {
    const val = sel.value.trim();
    if (!val) return;
    todayCity = val;
    try { localStorage.setItem(TODAY_CITY_KEY, val); } catch (e) {}
    todayWeather = null;
    fetchTodayWeather();
}

// ===================== 今天问候区（日期 / 节日 / 问候语） =====================
const SOLAR_FESTIVALS = {
  '1-1': '元旦', '2-14': '情人节', '3-8': '妇女节', '3-12': '植树节', '4-1': '愚人节',
  '5-1': '劳动节', '5-4': '青年节', '6-1': '儿童节', '7-1': '建党节', '8-1': '建军节',
  '9-10': '教师节', '10-1': '国庆节', '10-24': '程序员节', '12-25': '圣诞节'
};
// 常用节日（按公历近似日期，误差±1天可接受，用于提醒）
const SOLAR_TERMS = {
  '1-5': '小寒', '1-20': '大寒', '2-4': '立春', '2-19': '雨水', '3-5': '惊蛰', '3-20': '春分',
  '4-5': '清明', '4-20': '谷雨', '5-6': '立夏', '5-21': '小满', '6-6': '芒种', '6-21': '夏至',
  '7-7': '小暑', '7-23': '大暑', '8-7': '立秋', '8-23': '处暑', '9-8': '白露', '9-23': '秋分',
  '10-8': '寒露', '10-23': '霜降', '11-7': '立冬', '11-22': '小雪', '12-7': '大雪', '12-22': '冬至'
};
const TODAY_QUOTES = [
  '愿这一天的暖阳，照进你心里的每个角落',
  '生活明朗，万物可爱，人间值得，未来可期',
  '每天给自己一个微笑，就是给生活一份力量',
  '慢慢来，比较快；稳稳走，更长久',
  '把日子过成喜欢的样子，从今天开始',
  '愿有人陪你立黄昏，有人问你粥可温',
  '温柔地对待自己，世界也会温柔待你',
  '今天的你，也比昨天更接近理想一步',
];
function todayHeroHtml() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
  const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
  const hour = now.getHours();
  let greet;
  if (hour >= 5 && hour < 9) greet = '早上好';
  else if (hour >= 9 && hour < 12) greet = '上午好';
  else if (hour >= 12 && hour < 14) greet = '中午好';
  else if (hour >= 14 && hour < 18) greet = '下午好';
  else if (hour >= 18 && hour < 22) greet = '晚上好';
  else greet = '夜深了';
  const key = m + '-' + d;
  let badgeTxt = '';
  let badgeCls = '';
  if (SOLAR_FESTIVALS[key]) { badgeTxt = SOLAR_FESTIVALS[key]; badgeCls = 'today-hero-badge-fest'; }
  else if (SOLAR_TERMS[key]) { badgeTxt = SOLAR_TERMS[key]; badgeCls = 'today-hero-badge-term'; }
  else if (week === '日') { badgeTxt = '周末'; badgeCls = 'today-hero-badge-term'; }
  const quote = TODAY_QUOTES[Math.floor(Math.random() * TODAY_QUOTES.length)];
  return '<div class="today-hero-grad">'
    + '<div class="today-hero-top">'
    + '<div class="today-hero-date">' + m + '月' + d + '日 <span class="today-hero-week">星期' + week + '</span></div>'
    + '<div class="today-hero-y">' + y + '年</div>'
    + '</div>'
    + '<div class="today-hero-greet">' + greet + '</div>'
    + '<div class="today-hero-quote">' + quote + '</div>'
    + (badgeTxt ? '<div class="today-hero-badge-wrap"><span class="today-hero-badge ' + badgeCls + '">' + badgeTxt + '</span></div>' : '')
    + '</div>';
}

// 渲染今天板块
function renderTodayPage() {
    if (!todayContentEl) return;
    const heroEl = document.getElementById('todayHero');
    if (heroEl) heroEl.innerHTML = todayHeroHtml();
    const act = computeCardActivity();
    const folded = getFoldedCards();

    // ---- 天气卡片 ----
    const w = todayWeather;
    let weatherBody;
    if (w) {
        const wc = wmoText(w.code);
        const days = (w.daily || []).slice(0, 3).map(function(d, i) {
            return '<div class="today-weather-day"><span>' + (i === 0 ? '今天' : d.date.slice(5)) + '</span><span class="today-weather-day-ico">' + wmoIcon(d.code) + '</span><span>' + d.min + '°/' + d.max + '°</span></div>';
        }).join('');
        const cityOptions = TODAY_CITIES.map(function(c) { return '<option value="' + c + '"' + (c === todayCity ? ' selected' : '') + '>' + c + '</option>'; }).join('');
        const feelsHtml = w.feels != null ? '<span class="today-weather-feels">体感 ' + w.feels + '°</span>' : '';
        const sunHtml = (w.sunrise && w.sunset) ? '<span class="today-weather-sun">日出 ' + String(w.sunrise).slice(11, 16) + ' · 日落 ' + String(w.sunset).slice(11, 16) + '</span>' : '';
        weatherBody = '<div class="today-weather-main">'
            + '<span class="today-weather-temp">' + w.temp + '°</span>'
            + '<div class="today-weather-info"><div class="today-weather-cond">' + wmoIcon(w.code) + '<span>' + wc[0] + '</span>' + '</div>'
            + '<div class="today-weather-meta">' + feelsHtml + '<span>湿度 ' + w.humidity + '%</span><span>风 ' + w.wind + 'km/h</span></div>'
            + (sunHtml ? '<div class="today-weather-sun">' + sunHtml + '</div>' : '')
            + '<div class="today-weather-city">' + escapeHtml(w.city) + '</div></div>'
            + '<button class="today-weather-citybtn" onclick="showCityPicker()">切换城市</button>'
            + '<select id="todayCitySelect" style="display:none" class="today-city-select" onchange="changeTodayCity(this)">' + cityOptions + '</select>'
            + '</div>'
            + '<div class="today-weather-days">' + days + '</div>';
    } else {
        weatherBody = '<div class="today-weather-loading">天气加载中… <button class="today-weather-retry" onclick="fetchTodayWeather()">重试</button></div>';
    }

    // ---- 推荐视频 ----
    const recs = getTopRecommendations(true);
    let recBody;
    if (recs.length > 0) {
        recBody = '<div class="today-rec-list">' + recs.slice(0, 3).map(function(v) {
            return '<div class="today-rec-item" onclick="openPlayer(allVideos.find(function(x){return x.bvid===\'' + v.bvid + '\';}))">'
                + '<div class="today-rec-cover"><img src="' + escapeHtml(v.cover || '') + '" referrerpolicy="no-referrer" loading="lazy"></div>'
                + '<div class="today-rec-meta"><div class="today-rec-title">' + escapeHtml(v.title) + '</div><div class="today-rec-up">' + escapeHtml(v.up_name) + '</div></div>'
                + '</div>';
        }).join('') + '</div>';
    } else {
        recBody = '<div class="today-empty">暂无推荐，多看几个视频就能获得专属推荐</div>';
    }

    // ---- 常看UP ----
    const upSorted = Object.entries(upSetHelper()).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 4);
    let upBody;
    if (upSorted.length > 0) {
        upBody = '<div class="today-up-list">' + upSorted.map(function(u) {
            const uname = String(u[0]).replace(/'/g, '');
            return '<div class="today-up-item" onclick="filterByUp(\'' + uname + '\')">' + escapeHtml(u[0]) + ' <span class="today-up-count">看过' + u[1] + '次</span></div>';
        }).join('') + '</div>';
    } else {
        upBody = '<div class="today-empty">还没有常看的UP主，多逛逛吧</div>';
    }

    // ---- 我的收藏 ----
    const favList = Object.values(favorites).sort(function(a, b) { return (b.favoritedAt || 0) - (a.favoritedAt || 0); }).slice(0, 4);
    let favBody;
    if (favList.length > 0) {
        favBody = '<div class="today-fav-list">' + favList.map(function(v) {
            const bvid = String(v.bvid || '').replace(/'/g, '');
            return '<div class="today-fav-item" onclick="openPlayer(favVideoByBvid(\'' + bvid + '\'))">'
                + '<span class="today-fav-title">' + escapeHtml(v.title || '') + '</span><span class="today-fav-up">' + escapeHtml(v.up_name || '') + '</span>'
                + '</div>';
        }).join('') + '</div>';
    } else {
        favBody = '<div class="today-empty">还没有收藏，在视频播放页点击收藏即可</div>';
    }

    // ---- 今日概览（使用数据）----
    const now0 = new Date();
    const todayStart0 = new Date(now0.getFullYear(), now0.getMonth(), now0.getDate()).getTime();
    let todayViewed = 0, totalViewed = 0, todayFavs = 0;
    for (const bvid in viewHistory) {
        const h = viewHistory[bvid];
        totalViewed++;
        if (h.lastView && h.lastView > todayStart0) todayViewed++;
    }
    for (const bvid in favorites) {
        if (favorites[bvid].favoritedAt && favorites[bvid].favoritedAt > todayStart0) todayFavs++;
    }
    const favTotal = Object.keys(favorites).length;
    const upCount = Object.keys(upSetHelper()).length;
    const statsBody = '<div class="today-stats-grid">'
        + '<div class="today-stat"><span class="today-stat-num">' + totalViewed + '</span><span class="today-stat-label">看过视频</span></div>'
        + '<div class="today-stat"><span class="today-stat-num">' + todayViewed + '</span><span class="today-stat-label">今日观看</span></div>'
        + '<div class="today-stat"><span class="today-stat-num">' + favTotal + '</span><span class="today-stat-label">我的收藏</span></div>'
        + '<div class="today-stat"><span class="today-stat-num">' + upCount + '</span><span class="today-stat-label">常看UP</span></div>'
        + '</div>'
        + '<div class="today-stats-tip">' + (todayViewed > 0 ? '今天已看了 ' + todayViewed + ' 个视频，收获满满' : '今天还没看视频，去找个喜欢的看看吧') + '</div>';

    // ---- 生活小贴士（基于天气）----
    let tipText = '多喝水、多走走，健康每一天';
    if (w) {
        const t = w.temp;
        if (t >= 33) tipText = '今天较热，记得防暑降温、及时补水';
        else if (t >= 27) tipText = '天气偏热，外出注意防晒、多补充水分';
        else if (t >= 20) tipText = '温度适宜，很适合出门走走、晒晒太阳';
        else if (t >= 12) tipText = '有点凉，记得添件外套，别着凉';
        else if (t >= 5) tipText = '天气偏冷，注意保暖，喝点热水暖暖身';
        else tipText = '天冷路滑，出门多穿衣，注意脚下安全';
        const c = w.code;
        if (c >= 61 && c <= 67 || c >= 80 && c <= 82) tipText += '；今天可能有雨，出门记得带伞';
        else if (c >= 71 && c <= 77 || c >= 85 && c <= 86) tipText += '；今天有雪，注意保暖防滑';
        else if (c >= 95) tipText += '；今天有雷雨，尽量减少外出';
    }
    const tipBody = '<div class="today-tip">' + tipText + '</div>';

    // ---- 组装卡片（天气置顶，其余按活跃度排序；低活跃自动折叠） ----
    const cards = [
        { key: 'weather', title: '今天天气', icon: CARD_ICON.weather, active: act.weather, body: weatherBody, alwaysTop: true },
        { key: 'recommend', title: '今日推荐', icon: CARD_ICON.recommend, active: act.recommend, body: recBody },
        { key: 'stats', title: '今日概览', icon: CARD_ICON.stats, active: 90, body: statsBody },
        { key: 'tip', title: '生活小贴士', icon: CARD_ICON.tip, active: 85, body: tipBody },
        { key: 'up', title: '常看UP', icon: CARD_ICON.up, active: act.up, body: upBody },
        { key: 'fav', title: '我的收藏', icon: CARD_ICON.fav, active: act.fav, body: favBody }
    ];
    cards.sort(function(a, b) { return (b.alwaysTop ? 1 : 0) - (a.alwaysTop ? 1 : 0) || (b.active - a.active); });

    todayContentEl.innerHTML = cards.map(function(c) {
        const isFolded = folded[c.key] === 1;
        const collapsed = (folded[c.key] !== undefined) ? isFolded : (c.active <= 35);
        return '<div class="today-card' + (collapsed ? ' collapsed' : '') + '" id="card-' + c.key + '">'
            + '<div class="today-card-header" onclick="toggleTodayCard(\'' + c.key + '\')">'
            + '<span class="today-card-icon">' + c.icon + '</span><span class="today-card-title">' + c.title + '</span>'
            + '<span class="today-card-arrow">' + (collapsed ? '▸' : '▾') + '</span>'
            + '</div>'
            + '<div class="today-card-body"' + (collapsed ? ' style="display:none"' : '') + '>' + c.body + '</div>'
            + '</div>';
    }).join('');
}

// 导航事件
if (navToday) navToday.addEventListener('click', function() { showTodayPage(true); });
if (todayBackBtn) todayBackBtn.addEventListener('click', function() { showTodayPage(false); });

// 云控：今天板块开关（在 applyCloudConfig 中同步显隐 navToday）
function applyTodayVisibility() {
    if (navToday) navToday.style.display = isFeatureVisible('today') ? '' : 'none';
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
    applyTodayVisibility();
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

