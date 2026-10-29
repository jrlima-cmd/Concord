'use strict';

// ==================== ESTADO ====================
const STORAGE_ROLE = 'svi.role';
const STORAGE_STAFF_TOKEN = 'svi.staffToken';
const SCAN_COOLDOWN_MS = 4000;
const RESULT_DISPLAY_MS = 2500;

const state = {
    config: { eventName: 'Ingresso SVI', ticketPrice: 5500, currency: 'brl', maxTicketsPerOrder: 10 },
    role: null,          // 'VISITANTE' | 'SEGURANCA'
    staffToken: null,
    session: null,       // sessão do visitante no Supabase Auth
    signUpMode: false,
    scanner: null,
    scannerStarting: false,
    lastScan: { code: null, at: 0 },
    validating: false,
    history: [],
};

// Endereço da API: vazio = mesmo servidor (Node); definido em config.js para a API no Supabase
const API_BASE = (window.SVI_API_BASE || '').replace(/\/$/, '');

// Login dos visitantes: cada conta enxerga somente os próprios ingressos
const supabaseClient = window.supabase && window.SVI_SUPABASE_URL
    ? window.supabase.createClient(window.SVI_SUPABASE_URL, window.SVI_SUPABASE_KEY)
    : null;

const $ = (id) => document.getElementById(id);

// ==================== UTILITÁRIOS ====================
function storageGet(storage, key, fallback) {
    try {
        const raw = storage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function storageSet(storage, key, value) {
    try {
        if (value === null || value === undefined) storage.removeItem(key);
        else storage.setItem(key, JSON.stringify(value));
    } catch {
        // Armazenamento indisponível (modo privado); a sessão segue sem persistência
    }
}

function formatMoney(cents, currency = state.config.currency) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency.toUpperCase() })
        .format(cents / 100);
}

function formatDate(sqliteDate) {
    if (!sqliteDate) return '';
    const date = new Date(sqliteDate.replace(' ', 'T') + 'Z');
    return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Cria um elemento com atributos e filhos; textos são sempre inseridos com segurança (sem innerHTML). */
function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === undefined || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value);
    }
    for (const child of children.flat()) {
        if (child === null || child === undefined || child === false) continue;
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
}

function toast(message, type = 'info', duration = 4000) {
    const node = el('div', { class: `toast ${type}`, role: 'status' }, message);
    $('toast-container').append(node);
    setTimeout(() => node.remove(), duration);
}

async function api(path, { method = 'GET', body, auth = false } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && state.staffToken) headers['X-Staff-Token'] = state.staffToken;
    if (state.session) headers.Authorization = `Bearer ${state.session.access_token}`;

    let response;
    try {
        response = await fetch(API_BASE + path, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch {
        throw Object.assign(new Error('Sem conexão com o servidor. Verifique sua internet.'), { status: 0 });
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw Object.assign(new Error(data.error || 'Erro inesperado.'), { status: response.status });
    }
    return data;
}

function setButtonLoading(button, loading, label) {
    if (loading) {
        button.dataset.label = button.innerHTML;
        button.disabled = true;
        button.replaceChildren(el('span', { class: 'spinner' }), label || 'Aguarde...');
    } else {
        button.disabled = false;
        if (button.dataset.label) button.innerHTML = button.dataset.label;
    }
}

// ==================== PERFIS E NAVEGAÇÃO ====================
const ROLE_TABS = {
    VISITANTE: ['comprar', 'meus-ingressos'],
    SEGURANCA: ['portaria'],
};

async function setRole(role, initialTab) {
    state.role = role;
    storageSet(sessionStorage, STORAGE_ROLE, role);
    $('login-screen').classList.add('hidden');

    const badge = $('user-role-badge');
    badge.textContent = role === 'VISITANTE'
        ? `Visitante: ${state.session?.user?.email || ''}`
        : 'Perfil: Segurança (Portaria)';
    badge.classList.toggle('staff', role === 'SEGURANCA');

    document.querySelectorAll('.nav-btn').forEach((btn) => {
        btn.classList.toggle('hidden', !ROLE_TABS[role].includes(btn.dataset.tab));
    });

    await switchTab(initialTab || ROLE_TABS[role][0]);
}

async function logout() {
    await stopScanner();
    if (state.session && supabaseClient) await supabaseClient.auth.signOut().catch(() => {});
    state.session = null;
    state.role = null;
    state.staffToken = null;
    storageSet(sessionStorage, STORAGE_ROLE, null);
    storageSet(sessionStorage, STORAGE_STAFF_TOKEN, null);

    document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.add('hidden'));
    document.querySelectorAll('.tab-content').forEach((tab) => tab.classList.remove('active'));

    $('tickets-container').replaceChildren();
    updateTicketCount(0);
    $('login-visitante-pass').value = '';
    $('login-visitante-error').classList.add('hidden');
    $('visitante-form').classList.add('hidden');
    $('btn-login-visitante').classList.remove('hidden');
    $('login-seguranca-pass').value = '';
    $('login-seguranca-error').classList.add('hidden');
    $('seguranca-form').classList.add('hidden');
    $('btn-login-seguranca-trigger').classList.remove('hidden');
    $('login-screen').classList.remove('hidden');
}

async function switchTab(tabName) {
    if (!state.role || !ROLE_TABS[state.role].includes(tabName)) return;

    if (tabName !== 'portaria') await stopScanner();

    document.querySelectorAll('.tab-content').forEach((tab) => tab.classList.toggle('active', tab.id === tabName));
    document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));

    if (tabName === 'meus-ingressos') renderMyTickets();
    if (tabName === 'portaria') {
        refreshStats();
        startScanner();
    }
}

// ==================== LOGIN DO VISITANTE ====================
const AUTH_ERRORS = {
    'Invalid login credentials': 'E-mail ou senha incorretos.',
    'Email not confirmed': 'Confirme seu e-mail pelo link que enviamos antes de entrar.',
    'User already registered': 'Este e-mail já tem conta. Clique em "Já tenho conta" e entre.',
    'Failed to fetch': 'Sem conexão com o servidor. Verifique sua internet.',
    'Password should be at least 8 characters.': 'A senha precisa ter pelo menos 8 caracteres.',
};

function setSignUpMode(signUp) {
    state.signUpMode = signUp;
    $('btn-login-visitante-confirm').textContent = signUp ? 'Criar conta' : 'Entrar';
    $('btn-visitante-toggle').textContent = signUp ? 'Já tenho conta — entrar' : 'Não tenho conta — criar conta';
    $('login-visitante-pass').autocomplete = signUp ? 'new-password' : 'current-password';
    $('login-visitante-pass').placeholder = signUp ? 'Crie uma senha (mínimo 8 caracteres)' : 'Senha';
    $('login-visitante-error').classList.add('hidden');
}

async function loginVisitor(event) {
    event.preventDefault();
    const errorBox = $('login-visitante-error');
    const button = $('btn-login-visitante-confirm');
    const email = $('login-visitante-email').value.trim();
    const password = $('login-visitante-pass').value;

    const showError = (message) => {
        errorBox.textContent = `❌ ${message}`;
        errorBox.classList.remove('hidden');
    };
    if (!supabaseClient) return showError('Login indisponível. Verifique sua internet e recarregue a página.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return showError('Informe um e-mail válido.');
    // Contas novas exigem 8 caracteres; contas antigas com 6 ou 7 continuam entrando
    const minimo = state.signUpMode ? 8 : 6;
    if (password.length < minimo) return showError(`A senha precisa ter pelo menos ${minimo} caracteres.`);

    setButtonLoading(button, true, state.signUpMode ? 'Criando conta...' : 'Entrando...');
    try {
        const { data, error } = state.signUpMode
            ? await supabaseClient.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + window.location.pathname } })
            : await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) return showError(AUTH_ERRORS[error.message] || error.message);

        if (!data.session) {
            // Projeto exige confirmação de e-mail antes do primeiro login
            setSignUpMode(false);
            toast('Conta criada! Abra o link que enviamos para o seu e-mail e depois entre aqui.', 'success', 9000);
            return;
        }
        state.session = data.session;
        errorBox.classList.add('hidden');
        $('login-visitante-pass').value = '';
        await setRole('VISITANTE');
    } catch {
        showError('Sem conexão com o servidor. Verifique sua internet.');
    } finally {
        setButtonLoading(button, false);
    }
}

// ==================== LOGIN DA PORTARIA ====================
async function loginStaff(event) {
    event.preventDefault();
    const passInput = $('login-seguranca-pass');
    const errorBox = $('login-seguranca-error');
    const button = $('btn-login-seguranca-confirm');
    const password = passInput.value.trim();
    if (!password) return passInput.focus();

    setButtonLoading(button, true, 'Verificando...');
    try {
        const { token } = await api('/api/staff/login', { method: 'POST', body: { password } });
        state.staffToken = token;
        storageSet(sessionStorage, STORAGE_STAFF_TOKEN, token);
        errorBox.classList.add('hidden');
        passInput.value = '';
        await setRole('SEGURANCA');
    } catch (err) {
        errorBox.textContent = `❌ ${err.message}`;
        errorBox.classList.remove('hidden');
        passInput.select();
    } finally {
        setButtonLoading(button, false);
    }
}

// ==================== COMPRA ====================
function getQuantity() {
    const max = state.config.maxTicketsPerOrder;
    const value = parseInt($('quantidade').value, 10);
    if (!Number.isFinite(value)) return 1;
    return Math.min(Math.max(value, 1), max);
}

function updateTotal() {
    const quantity = getQuantity();
    $('valor-unitario').textContent = formatMoney(state.config.ticketPrice);
    $('resumo-quantidade').textContent = quantity;
    $('valor-total').textContent = formatMoney(state.config.ticketPrice * quantity);
}

function changeQuantity(delta) {
    $('quantidade').value = Math.min(Math.max(getQuantity() + delta, 1), state.config.maxTicketsPerOrder);
    updateTotal();
}

async function startCheckout(event) {
    event.preventDefault();
    const nameInput = $('nome-titular');
    const holderName = nameInput.value.trim().replace(/\s+/g, ' ');

    if (holderName.length < 3 || !holderName.includes(' ')) {
        toast('Informe o nome completo do titular (nome e sobrenome).', 'warning');
        nameInput.focus();
        return;
    }

    const button = $('btn-pagamento');
    setButtonLoading(button, true, 'Abrindo checkout seguro...');
    try {
        const { url } = await api('/api/checkout', {
            method: 'POST',
            body: { holderName, quantity: getQuantity(), returnPath: window.location.pathname },
        });
        window.location.assign(url);
    } catch (err) {
        if (err.status === 401) return sessionExpired();
        toast(err.message, 'error');
        setButtonLoading(button, false);
    }
}

// ==================== RETORNO DO STRIPE CHECKOUT ====================
function showCheckoutModal(...content) {
    $('checkout-modal-content').replaceChildren(...content);
    $('checkout-modal').classList.add('active');
}

function closeCheckoutModal() {
    $('checkout-modal').classList.remove('active');
}

async function handleCheckoutReturn() {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('order');
    const outcome = params.get('checkout');
    if (!orderId || !outcome) return false;

    // Limpa a URL para que um recarregamento não repita o fluxo
    history.replaceState(null, '', window.location.pathname);
    if (!state.session) {
        toast('Entre na sua conta para ver os ingressos comprados.', 'warning', 6000);
        return false;
    }
    await setRole('VISITANTE', outcome === 'success' ? 'meus-ingressos' : 'comprar');

    if (outcome === 'cancel') {
        toast('Pagamento cancelado. Nenhuma cobrança foi realizada.', 'warning', 6000);
        return true;
    }

    showCheckoutModal(
        el('div', { class: 'spinner lg' }),
        el('h2', {}, 'Confirmando pagamento...'),
        el('p', {}, 'Aguarde enquanto recebemos a confirmação da Stripe.')
    );

    // Pagamentos com cartão confirmam em segundos; métodos assíncronos (ex.: Pix/boleto) podem levar mais
    const deadline = Date.now() + 45000;
    let order = null;
    while (Date.now() < deadline) {
        try {
            order = await api(`/api/orders/${encodeURIComponent(orderId)}`);
            if (order.status !== 'PENDING') break;
        } catch (err) {
            if (err.status === 404 || err.status === 401) break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const okButton = el('button', { class: 'btn btn-primary', type: 'button', onclick: closeCheckoutModal }, 'Ver meus ingressos');

    if (order?.status === 'PAID') {
        showCheckoutModal(
            el('div', { style: 'font-size: 56px;' }, '✅'),
            el('h2', {}, 'Pagamento confirmado!'),
            el('p', {}, `${order.quantity} ingresso(s) emitido(s) para ${order.holderName}.`),
            el('div', { class: 'modal-actions' }, okButton)
        );
    } else {
        showCheckoutModal(
            el('div', { style: 'font-size: 56px;' }, '⏳'),
            el('h2', {}, 'Pagamento em processamento'),
            el('p', {}, 'Assim que a Stripe confirmar o pagamento, seus ingressos aparecerão em "Meus Ingressos". Você pode atualizar a página a qualquer momento.'),
            el('div', { class: 'modal-actions' }, okButton)
        );
    }
    renderMyTickets();
    return true;
}

// ==================== MEUS INGRESSOS ====================
function renderEmptyState() {
    return el('div', { class: 'empty-state' },
        el('div', { class: 'empty-state-icon' }, '🎫'),
        el('div', { class: 'empty-state-title' }, 'Nenhum ingresso adquirido'),
        el('div', { class: 'empty-state-message' }, 'Você ainda não possui ingressos nesta conta. Vá para "Comprar" para adquirir os seus.'),
        el('button', { class: 'btn btn-primary', type: 'button', onclick: () => switchTab('comprar') }, 'Comprar Ingressos')
    );
}

function downloadQr(container, code) {
    const canvas = container.querySelector('canvas');
    const img = container.querySelector('img');
    const href = canvas ? canvas.toDataURL('image/png') : img?.src;
    if (!href) return;
    el('a', { href, download: `${code}.png` }).click();
}

function renderTicketCard(ticket) {
    const used = ticket.status === 'USED';
    const qrBox = el('div', { class: 'ticket-qrcode', 'aria-label': `QR Code do ingresso ${ticket.code}` });

    if (window.QRCode) {
        new QRCode(qrBox, {
            text: ticket.code,
            width: 200,
            height: 200,
            colorDark: '#0f172a',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H,
        });
    } else {
        qrBox.append(el('span', { style: 'color: #0f172a;' }, 'QR Code indisponível'));
    }
    if (used) qrBox.append(el('div', { class: 'used-stamp' }, 'UTILIZADO'));

    return el('div', { class: `ticket-card${used ? ' used' : ''}` },
        el('div', { class: 'ticket-header' },
            el('span', {}, `Ingresso #${ticket.number}`),
            el('small', {}, state.config.eventName)
        ),
        el('div', { class: 'ticket-body' },
            el('div', { class: 'ticket-info' },
                el('div', { class: 'ticket-label' }, 'Titular'),
                el('div', { class: 'ticket-value' }, ticket.holderName)
            ),
            el('div', { class: 'ticket-info' },
                el('div', { class: 'ticket-label' }, 'Código'),
                el('div', { class: 'ticket-code-container' },
                    el('div', { class: 'ticket-code' }, ticket.code),
                    el('button', {
                        class: 'btn btn-secondary btn-sm',
                        type: 'button',
                        onclick: () => copyText(ticket.code, `Código ${ticket.code} copiado!`),
                    }, '📋 Copiar')
                )
            ),
            qrBox,
            el('div', { class: 'ticket-footer' },
                el('span', { class: `badge ${used ? 'badge-used' : 'badge-valid'}` },
                    used ? `✗ Utilizado ${formatDate(ticket.usedAt)}` : '✓ Válido'),
                used || !window.QRCode ? null : el('button', {
                    class: 'btn btn-secondary btn-sm',
                    type: 'button',
                    onclick: () => downloadQr(qrBox, ticket.code),
                }, '⬇️ Baixar QR')
            )
        )
    );
}

function renderOrder(order) {
    const header = el('div', { class: 'order-header' },
        el('span', {}, 'Pedido de ', el('strong', {}, order.holderName), ` · ${formatDate(order.createdAt)}`),
        el('span', {}, `${order.quantity}x · `, el('strong', {}, formatMoney(order.amountTotal, order.currency)))
    );

    if (order.status === 'PAID') {
        return el('div', { class: 'order-block' },
            header,
            el('div', { class: 'tickets-grid' }, order.tickets.map(renderTicketCard))
        );
    }

    // A API só lista pedidos pagos ou aguardando pagamento
    return el('div', { class: 'order-block' },
        header,
        el('div', { class: 'order-notice' },
            el('span', { class: 'badge badge-pending' }, 'Aguardando pagamento'),
            el('span', { class: 'grow muted' }, 'Se você já pagou, a confirmação pode levar alguns instantes.'),
            el('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: renderMyTickets }, '↻ Verificar')
        )
    );
}

let renderSequence = 0;
async function renderMyTickets() {
    const container = $('tickets-container');
    const sequence = ++renderSequence;
    if (!state.session) return;

    if (!container.childElementCount) {
        container.replaceChildren(el('div', { class: 'empty-state' }, el('div', { class: 'spinner lg' })));
    }

    let orders;
    try {
        ({ orders } = await api('/api/my/orders'));
    } catch (err) {
        if (sequence !== renderSequence) return;
        if (err.status === 401) return sessionExpired();
        container.replaceChildren(el('div', { class: 'empty-state' },
            el('div', { class: 'empty-state-icon' }, '📡'),
            el('div', { class: 'empty-state-title' }, 'Sem conexão'),
            el('div', { class: 'empty-state-message' }, 'Não conseguimos carregar seus ingressos agora.'),
            el('button', { class: 'btn btn-primary', type: 'button', onclick: renderMyTickets }, 'Tentar novamente')
        ));
        return;
    }
    if (sequence !== renderSequence) return; // Outra renderização mais recente já começou

    if (orders.length === 0) {
        container.replaceChildren(renderEmptyState());
        updateTicketCount(0);
        return;
    }

    container.replaceChildren(...orders.map(renderOrder));
    updateTicketCount(orders.reduce((sum, o) => sum + o.tickets.filter((t) => t.status === 'VALID').length, 0));
}

async function sessionExpired() {
    toast('Sua sessão expirou. Entre novamente.', 'error', 6000);
    await logout();
}

function updateTicketCount(count) {
    const badge = $('tickets-count');
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
}

async function copyText(text, successMessage) {
    try {
        await navigator.clipboard.writeText(text);
        toast(successMessage, 'success');
    } catch {
        toast('Não foi possível copiar automaticamente.', 'error');
    }
}

// ==================== PORTARIA ====================
function showCameraError(message) {
    $('qr-reader').replaceChildren(el('div', { class: 'camera-error' },
        el('div', { style: 'font-size: 40px;' }, '📷'),
        el('div', {}, message),
        el('button', {
            class: 'btn btn-secondary btn-sm',
            type: 'button',
            style: 'margin-top: 12px;',
            onclick: () => { state.scanner = null; $('qr-reader').replaceChildren(); startScanner(); },
        }, 'Tentar novamente')
    ));
}

async function startScanner() {
    if (state.scannerStarting || state.scanner?.isScanning) return;
    if (!window.Html5Qrcode) {
        showCameraError('Leitor de QR Code não carregou (verifique a internet). Use a validação manual abaixo.');
        return;
    }
    state.scannerStarting = true;

    try {
        if (!state.scanner) state.scanner = new Html5Qrcode('qr-reader');
        await state.scanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: (w, h) => {
                const size = Math.floor(Math.min(w, h) * 0.7);
                return { width: size, height: size };
            } },
            (decodedText) => onScan(decodedText),
            () => {}
        );
    } catch (err) {
        console.warn('Câmera indisponível:', err);
        state.scanner = null;
        showCameraError('Câmera indisponível ou sem permissão. Use a validação manual abaixo.');
    } finally {
        state.scannerStarting = false;
    }
}

async function stopScanner() {
    if (state.scanner?.isScanning) {
        try {
            await state.scanner.stop();
            state.scanner.clear();
        } catch (err) {
            console.error('Erro ao parar a câmera:', err);
        }
    }
}

function onScan(text) {
    const code = text.trim().toUpperCase();
    const now = Date.now();
    // Ignora a mesma leitura repetida enquanto o QR ainda está na frente da câmera
    if (state.validating || (code === state.lastScan.code && now - state.lastScan.at < SCAN_COOLDOWN_MS)) return;
    state.lastScan = { code, at: now };
    validateTicket(code);
}

async function validateTicket(code) {
    if (state.validating) return;
    state.validating = true;

    try {
        const data = await api('/api/tickets/validate', { method: 'POST', body: { code }, auth: true });
        if (data.stats) updateStats(data.stats);

        const messages = {
            OK: ['ENTRADA LIBERADA', data.ticket?.holderName],
            ALREADY_USED: ['JÁ UTILIZADO', data.ticket ? `${data.ticket.holderName} · entrou ${formatDate(data.ticket.usedAt)}` : ''],
            NOT_FOUND: ['CÓDIGO INVÁLIDO', 'Ingresso não encontrado'],
            INVALID: ['CÓDIGO INVÁLIDO', 'Formato não reconhecido'],
        };
        const [title, detail] = messages[data.result] || messages.INVALID;
        const ok = data.result === 'OK';
        showResult(ok, title, detail, code);
        addHistory(ok, code, ok ? data.ticket.holderName : title);
    } catch (err) {
        if (err.status === 401) {
            toast(err.message, 'error', 6000);
            await logout();
            return;
        }
        showResult(false, 'ERRO NA VALIDAÇÃO', err.message, code);
    } finally {
        state.validating = false;
    }
}

function showResult(ok, title, detail, code) {
    const overlay = $('result-overlay');
    overlay.className = `result-overlay ${ok ? 'ok' : 'fail'}`;
    overlay.replaceChildren(
        el('div', { class: 'result-icon' }, ok ? '✅' : '⛔'),
        el('div', { class: 'result-title' }, title),
        detail ? el('div', { class: 'result-detail' }, detail) : null,
        el('div', { class: 'result-code' }, code),
        el('div', { class: 'result-dismiss' }, 'Toque para continuar')
    );

    feedback(ok);
    clearTimeout(showResult.timer);
    showResult.timer = setTimeout(hideResult, ok ? RESULT_DISPLAY_MS : RESULT_DISPLAY_MS * 1.6);
}

function hideResult() {
    $('result-overlay').classList.add('hidden');
}

let audioContext = null;
function feedback(ok) {
    if (navigator.vibrate) navigator.vibrate(ok ? 120 : [200, 80, 200]);
    try {
        audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = ok ? 'sine' : 'square';
        osc.frequency.value = ok ? 880 : 220;
        gain.gain.value = 0.15;
        osc.connect(gain).connect(audioContext.destination);
        osc.start();
        osc.stop(audioContext.currentTime + (ok ? 0.15 : 0.4));
    } catch {
        // Áudio indisponível; o feedback visual é suficiente
    }
}

function addHistory(ok, code, detail) {
    state.history.unshift({ ok, code, detail, at: new Date() });
    state.history = state.history.slice(0, 15);

    $('history-list').replaceChildren(...state.history.map((h) =>
        el('li', { class: `history-item ${h.ok ? 'ok' : 'fail'}` },
            el('span', {}, h.ok ? '✅' : '⛔'),
            el('div', { class: 'grow' },
                el('div', { class: 'code' }, h.code),
                el('div', { class: 'name' }, h.detail)
            ),
            el('time', {}, h.at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
        )
    ));
}

function updateStats({ total, used }) {
    $('stat-total').textContent = total;
    $('stat-used').textContent = used;
    $('stat-remaining').textContent = total - used;
}

async function refreshStats() {
    try {
        updateStats(await api('/api/staff/stats', { auth: true }));
    } catch (err) {
        if (err.status === 401) {
            toast(err.message, 'error', 6000);
            logout();
        }
    }
}

async function pasteCode() {
    try {
        const text = await navigator.clipboard.readText();
        if (text) $('manual-code').value = text.trim().toUpperCase();
    } catch {
        toast('Não foi possível acessar a área de transferência. Cole com Ctrl+V.', 'warning');
    }
}

// ==================== INICIALIZAÇÃO ====================
function bindEvents() {
    $('btn-login-visitante').addEventListener('click', () => {
        $('btn-login-visitante').classList.add('hidden');
        $('visitante-form').classList.remove('hidden');
        $('login-visitante-email').focus();
    });
    $('visitante-form').addEventListener('submit', loginVisitor);
    $('btn-visitante-toggle').addEventListener('click', () => setSignUpMode(!state.signUpMode));
    $('btn-login-seguranca-trigger').addEventListener('click', () => {
        $('btn-login-seguranca-trigger').classList.add('hidden');
        $('seguranca-form').classList.remove('hidden');
        $('login-seguranca-pass').focus();
    });
    $('seguranca-form').addEventListener('submit', loginStaff);
    $('btn-logout').addEventListener('click', logout);

    document.querySelectorAll('.nav-btn').forEach((btn) => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    $('quantidade').addEventListener('input', updateTotal);
    $('quantidade').addEventListener('blur', () => { $('quantidade').value = getQuantity(); updateTotal(); });
    $('btn-qty-minus').addEventListener('click', () => changeQuantity(-1));
    $('btn-qty-plus').addEventListener('click', () => changeQuantity(1));
    $('comprar-form').addEventListener('submit', startCheckout);

    $('btn-refresh').addEventListener('click', renderMyTickets);
    $('btn-print').addEventListener('click', () => window.print());

    $('manual-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const code = $('manual-code').value.trim().toUpperCase();
        if (!code) return;
        $('manual-code').value = '';
        validateTicket(code);
    });
    $('btn-paste-code').addEventListener('click', pasteCode);
    $('result-overlay').addEventListener('click', hideResult);

    // Voltar do Checkout pelo botão "voltar" do navegador restaura a página do cache
    window.addEventListener('pageshow', (e) => {
        if (e.persisted) setButtonLoading($('btn-pagamento'), false);
    });
    window.addEventListener('beforeunload', stopScanner);
}

async function init() {
    bindEvents();

    // O supabase-js renova o token sozinho; mantemos a cópia usada nas chamadas da API
    if (supabaseClient) {
        const { data } = await supabaseClient.auth.getSession();
        state.session = data.session;
        supabaseClient.auth.onAuthStateChange((_event, session) => { state.session = session; });
    }

    try {
        state.config = await api('/api/config');
    } catch {
        toast('Não foi possível carregar as configurações do evento.', 'error');
    }
    $('event-name').textContent = state.config.eventName;
    $('quantidade').max = state.config.maxTicketsPerOrder;
    updateTotal();

    if (await handleCheckoutReturn()) return;

    // Restaura a sessão da aba (recarregar a página não exige novo login)
    const savedRole = storageGet(sessionStorage, STORAGE_ROLE, null);
    const savedToken = storageGet(sessionStorage, STORAGE_STAFF_TOKEN, null);
    if (state.session && savedRole !== 'SEGURANCA') {
        await setRole('VISITANTE');
    } else if (savedRole === 'SEGURANCA' && savedToken) {
        state.staffToken = savedToken;
        await setRole('SEGURANCA');
    }
}

init();
