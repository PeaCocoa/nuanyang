// 暖阳 Service Worker v5 — 彻底解决缓存问题
// 策略：HTML/JS/CSS 网络优先，videos.json 永远走网络，图片缓存优先
const CACHE_VERSION = 'nuanyang-v27';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/shorts.html',
    '/css/style.css',
    '/css/shorts.css',
    '/js/app.js',
    '/js/shorts.js',
    '/manifest.json',
    '/favicon.png',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/legal.html'
];

// 安装：跳过等待，立即激活
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
    );
});

// 激活：清理所有旧缓存，立即接管
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((key) => key !== CACHE_VERSION)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// 请求拦截
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // 跨域请求（B站图片等）不经过SW拦截，直接让浏览器处理
    // 避免低端浏览器SW对跨域no-cors请求的兼容性问题
    if (url.origin !== self.location.origin) {
        return;
    }

    // === videos.json：永远走网络，绝不缓存 ===
    if (url.pathname.includes('/data/videos.json')) {
        event.respondWith(
            fetch(event.request.url + '?t=' + Date.now(), {
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-cache' }
            })
            .catch(() => caches.match('/data/videos.json'))
        );
        return;
    }

    // === HTML：网络优先，确保最新页面 ===
    if (event.request.mode === 'navigate' ||
        event.request.destination === 'document') {
        event.respondWith(
            fetch(event.request, { cache: 'no-cache' })
                .then((response) => {
                    const cloned = response.clone();
                    caches.open(CACHE_VERSION).then((cache) => {
                        cache.put(event.request, cloned);
                    });
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // === JS/CSS：网络优先 ===
    if (event.request.destination === 'style' ||
        event.request.destination === 'script') {
        event.respondWith(
            fetch(event.request, { cache: 'no-cache' })
                .then((response) => {
                    const cloned = response.clone();
                    caches.open(CACHE_VERSION).then((cache) => {
                        cache.put(event.request, cloned);
                    });
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // === 其他资源（图片等）：缓存优先 ===
    event.respondWith(
        caches.match(event.request)
            .then((cached) => {
                if (cached) return cached;
                return fetch(event.request)
                    .then((response) => {
                        if (response.status === 200 && url.origin === self.location.origin) {
                            const cloned = response.clone();
                            caches.open(CACHE_VERSION).then((cache) => {
                                cache.put(event.request, cloned);
                            });
                        }
                        return response;
                    })
                    .catch(() => {
                        if (event.request.mode === 'navigate') {
                            return caches.match('/index.html',
    '/shorts.html',);
                        }
                    });
            })
    );
});

// === 接收到更新消息，通知所有客户端刷新 ===
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
