// 暖阳 Service Worker — 离线缓存 + 自动更新
const CACHE_VERSION = 'nuanyang-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/app.js',
    '/manifest.json',
    '/favicon.png',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/data/videos.json'
];

// 安装：缓存核心资源
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
            .then(() => self.skipWaiting())
    );
});

// 激活：清理旧缓存
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

// 请求拦截：缓存优先，网络回退
self.addEventListener('fetch', (event) => {
    // 只处理 GET 请求
    if (event.request.method !== 'GET') return;

    // 视频数据：网络优先（确保最新），失败回退缓存
    if (event.request.url.includes('/data/videos.json')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const cloned = response.clone();
                    caches.open(CACHE_VERSION).then((cache) => {
                        cache.put('/data/videos.json', cloned);
                    });
                    return response;
                })
                .catch(() => caches.match('/data/videos.json'))
        );
        return;
    }

    // 其他资源：缓存优先，网络回退
    event.respondWith(
        caches.match(event.request)
            .then((cached) => {
                if (cached) return cached;
                return fetch(event.request)
                    .then((response) => {
                        // 只缓存同源请求
                        if (response.status === 200 && event.request.url.startsWith(self.location.origin)) {
                            const cloned = response.clone();
                            caches.open(CACHE_VERSION).then((cache) => {
                                cache.put(event.request, cloned);
                            });
                        }
                        return response;
                    })
                    .catch(() => {
                        // 离线时返回首页
                        if (event.request.mode === 'navigate') {
                            return caches.match('/index.html');
                        }
                    });
            })
    );
});
