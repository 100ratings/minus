const CACHE = 'nomes-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json'
  // ./data/nomes.txt (se quiser forçar cache, descomente e garanta que exista)
];

self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});
self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE && caches.delete(k))))
  );
});
self.addEventListener('fetch', (e)=>{
  const url = new URL(e.request.url);
  // Network-first para nomes.txt, cache-first para estáticos
  if (url.pathname.endsWith('/data/nomes.txt')) {
    e.respondWith(
      fetch(e.request).then(resp=> {
        const clone = resp.clone();
        caches.open(CACHE).then(c=>c.put(e.request, clone));
        return resp;
      }).catch(()=>caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
