/* === 暖阳短视频刷流 === */

(function() {
    "use strict";

    // === 常量 ===
    const STORAGE_KEYS = {
        favorites: "nuanyang-favorites",
        theme: "nuanyang-theme",
        history: "nuanyang-history",
    };

    // === DOM ===
    const container = document.getElementById("shortsContainer");
    const loadingEl = document.getElementById("shortsLoading");
    const backBtn = document.getElementById("shortsBackBtn");
    const toastEl = document.getElementById("toast");

    // === 状态 ===
    let shortVideos = [];
    let currentIndex = 0;
    let renderedItems = []; // {el, video, iframe, loaded}
    const RENDER_AHEAD = 2; // 预渲染前后几个
    const SHORT_MAX_DURATION = 300; // 5分钟

    // === 工具函数 ===
    function escapeHtml(str) {
        if (!str) return "";
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    function formatDuration(sec) {
        sec = parseInt(sec) || 0;
        if (sec < 3600) return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
        return Math.floor(sec / 3600) + ":" + String(Math.floor((sec % 3600) / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
    }

    function formatPubdate(ts) {
        if (!ts) return "";
        const d = new Date(ts * 1000);
        return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }

    function showToast(msg) {
        if (!toastEl) return;
        toastEl.textContent = msg;
        toastEl.classList.add("show");
        setTimeout(() => toastEl.classList.remove("show"), 2000);
    }

    // === 主题适配 ===
    function applyTheme() {
        const theme = localStorage.getItem(STORAGE_KEYS.theme) || "auto";
        const isDark = theme === "night" || theme === "liquid" ||
            (theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
        document.body.setAttribute("data-theme", theme === "auto" ? (isDark ? "night" : "daylight") : theme);
        document.body.setAttribute("data-color-scheme", isDark ? "dark" : "light");
    }

    // === 收藏 ===
    function getFavorites() {
        try {
            const fav = localStorage.getItem(STORAGE_KEYS.favorites);
            return fav ? JSON.parse(fav) : {};
        } catch (e) {
            return {};
        }
    }

    function toggleFavorite(bvid) {
        const fav = getFavorites();
        if (fav[bvid]) {
            delete fav[bvid];
            localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(fav));
            return false;
        } else {
            fav[bvid] = Date.now();
            localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(fav));
            return true;
        }
    }

    // === 数据加载 ===
    async function loadVideos() {
        try {
            const resp = await fetch("data/videos.json?v=29");
            const data = await resp.json();
            const all = data.videos || [];
            // 筛选5分钟以内
            shortVideos = all.filter(v => (v.duration || 0) <= SHORT_MAX_DURATION);
            // 随机打乱
            for (let i = shortVideos.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shortVideos[i], shortVideos[j]] = [shortVideos[j], shortVideos[i]];
            }
            console.log("[暖阳短视频] 加载 " + shortVideos.length + " 条短视频");
            return true;
        } catch (e) {
            console.error("[暖阳短视频] 加载失败:", e);
            return false;
        }
    }

    // === 创建短视频卡片 ===
    function createShortsItem(video, index) {
        const item = document.createElement("div");
        item.className = "shorts-item";
        item.dataset.index = index;

        const fav = getFavorites();
        const isFav = !!fav[video.bvid];

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
                    <span> · ${formatDuration(video.duration)} · ${formatPubdate(video.pubdate)}</span>
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

        // 点击封面播放（封面也用于暂停后恢复）
        const cover = item.querySelector(".shorts-cover");
        cover.addEventListener("click", () => {
            loadVideoInItem(item, video);
        });

        // 收藏按钮
        const favBtn = item.querySelector('[data-action="fav"]');
        favBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const nowFav = toggleFavorite(video.bvid);
            favBtn.classList.toggle("favorited", nowFav);
            const svg = favBtn.querySelector("svg");
            if (svg) svg.setAttribute("fill", nowFav ? "currentColor" : "none");
            showToast(nowFav ? "已收藏" : "已取消收藏");
        });

        return item;
    }

    // === 拦截顶层导航 ===
    let _preventNavRef = null;
    function preventNav(e) {
        e.preventDefault();
        e.returnValue = "";
        return "";
    }

    // === 在卡片中加载视频 ===
    function loadVideoInItem(item, video) {
        const wrap = item.querySelector(".shorts-player-wrap");
        const existingIframe = wrap.querySelector("iframe");
        if (existingIframe) return;

        const cover = wrap.querySelector(".shorts-cover");
        if (cover) {
            cover.style.display = "none";
            cover.classList.remove("paused");
        }

        const iframe = document.createElement("iframe");
        // sandbox 不加 allow-popups（阻止window.open）
        // 不加 allow-top-navigation（阻止跳转顶层窗口）
        // 保留 allow-scripts allow-same-origin（播放器正常工作）
        iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
        iframe.setAttribute("allow", "autoplay; fullscreen; encrypted-media; picture-in-picture");
        iframe.setAttribute("scrolling", "no");
        iframe.setAttribute("frameborder", "0");
        iframe.setAttribute("referrerpolicy", "no-referrer");
        iframe.src = video.iframe_url + "&autoplay=1";
        wrap.appendChild(iframe);

        // 拦截iframe内点击导航（跨域会静默失败，不影响）
        iframe.addEventListener("load", function() {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                doc.addEventListener("click", function(e) {
                    const a = e.target.closest("a");
                    if (a && a.href) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                }, true);
                iframe.contentWindow.open = function() { return null; };
            } catch(e) {}
        });

        // 拦截顶层窗口跳转（B站播放器可能尝试 window.top.location）
        if (_preventNavRef) {
            window.removeEventListener("beforeunload", _preventNavRef);
        }
        _preventNavRef = preventNav;
        window.addEventListener("beforeunload", preventNav, { once: true });

        // 添加点击遮罩用于暂停（覆盖在iframe上方，透明，捕获点击）
        const pauseOverlay = document.createElement("div");
        pauseOverlay.className = "shorts-pause-overlay";
        pauseOverlay.addEventListener("click", (e) => {
            e.stopPropagation();
            pauseVideo(item, video);
        });
        wrap.appendChild(pauseOverlay);

        item.dataset.loaded = "1";
    }

    // === 暂停视频：删除iframe，显示封面+暂停图标 ===
    function pauseVideo(item, video) {
        const wrap = item.querySelector(".shorts-player-wrap");
        const iframe = wrap.querySelector("iframe");
        const overlay = wrap.querySelector(".shorts-pause-overlay");
        if (overlay) overlay.remove();
        if (iframe) iframe.remove();

        // 移除 beforeunload 监听
        if (_preventNavRef) {
            window.removeEventListener("beforeunload", _preventNavRef);
            _preventNavRef = null;
        }

        const cover = wrap.querySelector(".shorts-cover");
        if (cover) {
            cover.style.display = "";
            cover.classList.add("paused");
        }
        item.dataset.loaded = "0";
    }

    // === 清理非当前卡片的iframe（停止后台播放）===
    function cleanupInvisibleIframes() {
        let anyRemoved = false;
        renderedItems.forEach(entry => {
            if (!entry.el) return;
            if (entry.el.dataset.index !== String(currentIndex)) {
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
        // 清理 beforeunload 监听（新视频加载时会重新注册）
        if (anyRemoved && _preventNavRef) {
            window.removeEventListener("beforeunload", _preventNavRef);
            _preventNavRef = null;
        }
    }

    // === 渲染 ===
    function renderInitial() {
        if (loadingEl) loadingEl.remove();
        container.innerHTML = "";
        renderedItems = [];

        // 渲染前3个
        const count = Math.min(3, shortVideos.length);
        for (let i = 0; i < count; i++) {
            const item = createShortsItem(shortVideos[i], i);
            container.appendChild(item);
            renderedItems.push({ el: item, video: shortVideos[i], index: i });
        }
    }

    // === 滚动监听：检测当前可见项 ===
    function setupScrollObserver() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
                    const idx = parseInt(entry.target.dataset.index, 10);
                    if (idx !== currentIndex) {
                        currentIndex = idx;
                        onSlideChanged(idx);
                    }
                }
            });
        }, {
            root: container,
            threshold: [0.6],
        });

        // 观察现有元素
        renderedItems.forEach(entry => observer.observe(entry.el));

        // 存储observer供后续使用
        container._observer = observer;
    }

    // === 切换到新视频时 ===
    function onSlideChanged(index) {
        console.log("[暖阳短视频] 切换到第 " + (index + 1) + " 个视频");

        // 清理非当前卡片的iframe，停止后台播放
        cleanupInvisibleIframes();

        // 自动播放当前视频
        const curEntry = renderedItems.find(e => e.index === index);
        if (curEntry && curEntry.el.dataset.loaded !== "1") {
            loadVideoInItem(curEntry.el, curEntry.video);
        }

        // 动态加载更多
        const needIndex = index + RENDER_AHEAD;
        if (needIndex < shortVideos.length && needIndex >= renderedItems.length) {
            const video = shortVideos[needIndex];
            const item = createShortsItem(video, needIndex);
            container.appendChild(item);
            renderedItems.push({ el: item, video: video, index: needIndex });
            if (container._observer) container._observer.observe(item);
        }

        // 接近末尾时循环
        if (index >= shortVideos.length - 2) {
            console.log("[暖阳短视频] 接近末尾，重新打乱");
            // 不打断当前体验，只是追加打乱后的视频
            const remaining = shortVideos.slice();
            for (let i = remaining.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
            }
            shortVideos = shortVideos.concat(remaining);
        }
    }

    // === 返回按钮 ===
    backBtn.addEventListener("click", () => {
        // 如果有referrer就返回，否则跳首页
        if (document.referrer && document.referrer.includes("peacocoa.github.io")) {
            history.back();
        } else {
            window.location.href = "index.html";
        }
    });

    // === 初始化 ===
    async function init() {
        applyTheme();
        const ok = await loadVideos();
        if (!ok || shortVideos.length === 0) {
            if (loadingEl) {
                loadingEl.innerHTML = '<div class="shorts-loading-text">加载失败，请稍后重试</div>';
            }
            return;
        }
        renderInitial();
        setupScrollObserver();

        // 自动播放第一个视频
        if (renderedItems.length > 0) {
            loadVideoInItem(renderedItems[0].el, renderedItems[0].video);
        }
    }

    init();
})();
