// sw.js — Service Worker：预缓存资源，cache-first + 后台更新（移动端二次访问零下载，支持离线）
const CACHE = 'coin-flip-v6'; // v6: 校准向导节拍 550ms→1.1s 修复高延迟下拍击归属翻转/容差全拒
const ASSETS = ['./', './index.html', './dist/bundle.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // 页面导航：网络优先（保证拿到最新 HTML），断网时回退缓存（离线可玩）
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }

  // 静态资源：缓存优先，命中即秒回；同时后台更新缓存（stale-while-revalidate）
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || net;
    })
  );
});
