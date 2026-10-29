'use strict';

// Service worker do SVI: guarda os arquivos do site para o app instalado abrir sem internet.
// Só cuida de arquivos deste site; a API (Supabase) e a Stripe nunca passam por aqui.
const CACHE = 'svi-v1';
const NETWORK_TIMEOUT_MS = 4000;
const APP_SHELL = [
    './',
    'styles.css',
    'app.js',
    'config.js',
    'manifest.webmanifest',
    'vendor/qrcode.min.js',
    'vendor/html5-qrcode.min.js',
    'vendor/supabase.js',
    'icons/icon.svg',
    'icons/icon-192.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

// Rede primeiro: com internet o app sempre recebe a versão mais nova do site.
// Sem internet (ou com a rede travada por mais de alguns segundos), usa a última cópia salva.
async function networkFirst(request) {
    const cache = await caches.open(CACHE);
    // Páginas são guardadas sem a query (o retorno do Checkout traz ?order=...&token=...)
    const url = new URL(request.url);
    const key = request.mode === 'navigate' ? url.origin + url.pathname : request;

    const fromNetwork = fetch(request).then((response) => {
        // Redirecionamentos (ex.: /index.html -> /) não podem ser servidos a uma navegação
        if (response.ok && response.type === 'basic' && !response.redirected) {
            cache.put(key, response.clone());
        }
        return response;
    });
    fromNetwork.catch(() => {}); // A falha é tratada abaixo; evita aviso de rejeição não tratada

    const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, null));
    const cached = () => cache.match(key)
        .then((match) => match || (request.mode === 'navigate' ? cache.match('./') : undefined));

    try {
        const response = await Promise.race([fromNetwork, timeout]);
        if (response) return response;
        // Rede lenta: entrega a cópia salva, se houver; senão continua esperando a rede
        return (await cached()) || (await fromNetwork);
    } catch {
        const fallback = await cached();
        if (fallback) return fallback;
        throw new Error('Sem internet e sem cópia salva');
    }
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
    event.respondWith(networkFirst(request));
});
