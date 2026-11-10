/**
 * Sabor de Pão — Painel administrativo
 * Controla 100% da loja: produtos, preços, fotos, categorias, pedidos e configurações.
 */
(function () {
    'use strict';
    const SP = window.SP, API = window.SPApi;
    const $ = (s, el = document) => el.querySelector(s);
    const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
    const esc = SP.esc, money = SP.money;
    const DEMO = API.mode === 'demo';

    let categories = [], products = [], orders = [], settings = {};
    let orderFilter = 'abertos', pollTimer = null, knownOrderIds = null;

    // ── UI básica ─────────────────────────────────────────────
    let toastT;
    function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : ''); clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'toast'; }, 3400); }
    function openM(id) { $('#' + id).hidden = false; document.body.style.overflow = 'hidden'; }
    function closeM(id) { $('#' + id).hidden = true; if (!$$('.overlay').some(o => !o.hidden)) document.body.style.overflow = ''; }
    document.addEventListener('click', e => {
        if (e.target.closest('[data-close]')) closeM(e.target.closest('.overlay').id);
        else if (e.target.classList.contains('overlay')) closeM(e.target.id);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { const o = $$('.overlay').filter(x => !x.hidden).pop(); if (o) closeM(o.id); } });
    const errMsg = e => {
        const m = String((e && e.message) || e || '');
        if (/INVALID_VARIANT|INVALID_ADDON|INVALID_SETTINGS|INVALID_REQUEST/.test(m)) return m.replace(/^.*?(INVALID_\w+):?\s*/, '') || 'Dados inválidos.';
        if (/JWT|session|not authenticated/i.test(m)) return 'Sua sessão expirou. Entre novamente.';
        if (/row-level security|permission denied|NOT_ADMIN/i.test(m)) return 'Acesso negado: este usuário não é administrador.';
        if (/Failed to fetch|NetworkError|AbortError/i.test(m)) return 'Sem conexão. Verifique a internet e tente novamente.';
        return SP.ERRORS[Object.keys(SP.ERRORS).find(k => m.includes(k))] || m || 'Erro inesperado.';
    };
    const parseMoney = v => { v = String(v == null ? '' : v).trim().replace(/[R$\s]/g, ''); if (!v) return null; if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.'); const n = Number(v); return isFinite(n) ? SP.round2(n) : NaN; };
    const fmtNum = v => v == null || v === '' ? '' : Number(v).toFixed(2).replace('.', ',');
    const invalidateStoreCache = () => { try { Object.keys(localStorage).filter(k => k.startsWith('sp_catalog_')).forEach(k => localStorage.removeItem(k)); } catch (_) { } };
    async function busy(btn, label, fn) {
        if (btn.disabled) return; const old = btn.textContent; btn.disabled = true; btn.textContent = label;
        try { return await fn(); } finally { btn.disabled = false; btn.textContent = old; }
    }

    // ════════════════════════════════════════════════════════════
    //  LOGIN
    // ════════════════════════════════════════════════════════════
    async function boot() {
        $('#modeBadge').textContent = DEMO ? 'Modo demonstração' : 'Painel administrativo';
        $('#demoNote').hidden = !DEMO; $('#emailWrap').hidden = DEMO;
        if (DEMO) $('#loginForm').email.required = false;
        let s = null; try { s = await API.session(); } catch (_) { }
        if (s) startApp(); else { $('#login').hidden = false; $('#app').hidden = true; }
    }
    $('#loginForm').addEventListener('submit', e => {
        e.preventDefault(); const f = e.target, err = $('#loginError'); err.hidden = true;
        busy($('#loginBtn'), 'Entrando…', async () => {
            try { await API.signIn(f.email.value.trim(), f.password.value); f.password.value = ''; startApp(); }
            catch (ex) { err.textContent = /Invalid login/i.test(ex.message) ? 'E-mail ou senha incorretos.' : errMsg(ex); err.hidden = false; }
        });
    });
    $('#logout').onclick = async () => { await API.signOut(); clearInterval(pollTimer); location.reload(); };

    async function startApp() {
        $('#login').hidden = true; $('#app').hidden = false;
        try { [categories, products, settings] = await Promise.all([API.listCategories(), API.listProducts(), API.getSettings()]); }
        catch (e) { toast(errMsg(e), true); }
        if (settings.logo_url) $('#aLogo').innerHTML = `<img src="${esc(settings.logo_url)}" alt="">`;
        $('#userInfo').textContent = 'Usuário: ' + (await API.userEmail());
        showTab(location.hash.replace('#', '') || 'orders');
        loadOrders();
        pollTimer = setInterval(() => { if (!document.hidden) loadOrders(true); }, 30000);
    }

    // ── Abas ──────────────────────────────────────────────────
    function showTab(tab) {
        if (!['orders', 'customers', 'products', 'categories', 'settings'].includes(tab)) tab = 'orders';
        $$('#tabs button').forEach(b => { if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
        $$('.view').forEach(v => { v.hidden = v.id !== 'v-' + tab; });
        history.replaceState(null, '', '#' + tab);
        if (tab === 'customers') loadCustomers();
        if (tab === 'products') renderProducts();
        if (tab === 'categories') renderCategories();
        if (tab === 'settings') fillSettings();
        window.scrollTo(0, 0);
    }
    $('#tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab); });

    // ════════════════════════════════════════════════════════════
    //  IMAGENS — compressão, redimensionamento e pré-visualização
    // ════════════════════════════════════════════════════════════
    const WEBP = (() => { try { const c = document.createElement('canvas'); c.width = c.height = 1; return c.toDataURL('image/webp').startsWith('data:image/webp'); } catch (_) { return false; } })();
    async function decode(file) {
        if (window.createImageBitmap) { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) { } }
        return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Imagem inválida')); i.src = URL.createObjectURL(file); });
    }
    async function resize(src, maxW, q) {
        const w0 = src.width, h0 = src.height, sc = Math.min(1, maxW / Math.max(w0, h0 * 1.34));
        const w = Math.max(1, Math.round(w0 * sc)), h = Math.max(1, Math.round(h0 * sc));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, w, h);
        const type = WEBP ? 'image/webp' : 'image/jpeg';
        const blob = await new Promise(r => c.toBlob(r, type, q));
        return { blob, w, h };
    }
    const imgState = new WeakMap();
    function initImgField(field, url) {
        const st = { url: url || '', newLg: null, newSm: null, removed: false, preview: null };
        imgState.set(field, st); paintImg(field); $('.img-info', field) && ($('.img-info', field).textContent = '');
        const input = $('input[type=file]', field); input.value = '';
        input.onchange = async () => {
            const file = input.files[0]; if (!file) return;
            if (!/^image\//.test(file.type)) { toast('Escolha um arquivo de imagem.', true); return; }
            if (file.size > 25 * 1024 * 1024) { toast('Imagem muito grande (máx. 25 MB).', true); return; }
            try {
                const size = Number(field.dataset.size) * (DEMO ? 0.6 : 1), thumb = Number(field.dataset.thumb) * (DEMO ? 0.75 : 1);
                const bmp = await decode(file);
                const lg = await resize(bmp, size, DEMO ? 0.7 : 0.82);
                const sm = thumb ? await resize(bmp, thumb, DEMO ? 0.68 : 0.78) : null;
                st.newLg = lg.blob; st.newSm = sm && sm.blob; st.removed = false;
                if (st.preview) URL.revokeObjectURL(st.preview); st.preview = URL.createObjectURL(lg.blob);
                paintImg(field);
                const info = $('.img-info', field);
                if (info) info.textContent = `Otimizada: ${(file.size / 1024).toFixed(0)} KB → ${(lg.blob.size / 1024).toFixed(0)} KB (${lg.w}×${lg.h}, ${WEBP ? 'WebP' : 'JPEG'})${sm ? ` + miniatura ${(sm.blob.size / 1024).toFixed(0)} KB` : ''}. Salve para publicar.`;
            } catch (e) { toast('Não foi possível ler esta imagem.', true); }
        };
        const clr = $('[data-img-clear]', field);
        if (clr) clr.onclick = () => { st.removed = true; st.newLg = st.newSm = null; paintImg(field); const info = $('.img-info', field); if (info) info.textContent = 'Foto será removida ao salvar.'; };
    }
    function paintImg(field) {
        const st = imgState.get(field), prev = $('.img-prev', field);
        const src = st.preview && st.newLg ? st.preview : (st.removed ? '' : SP.img(st.url, 640));
        prev.style.backgroundImage = src ? `url("${src}")` : ''; prev.classList.toggle('has', !!src); prev.textContent = src ? '' : 'Sem imagem';
    }
    const storagePath = url => { const m = String(url || '').match(/\/storage\/v1\/object\/public\/imagens\/(.+)$/); return m ? decodeURIComponent(m[1]) : null; };
    /** Envia a imagem nova (se houver). Retorna {url, thumb, uploaded:[paths], old:[paths a remover depois]} */
    async function commitImg(field, folder) {
        const st = imgState.get(field);
        if (!st.newLg && !st.removed) return null;
        const old = [storagePath(st.url)].concat(st.oldThumb ? [storagePath(st.oldThumb)] : []).filter(Boolean);
        if (st.removed) return { url: '', thumb: '', uploaded: [], old };
        const id = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ext = st.newLg.type === 'image/webp' ? 'webp' : 'jpg';
        const lg = await API.uploadImage(st.newLg, `${id}-lg.${ext}`);
        const sm = st.newSm ? await API.uploadImage(st.newSm, `${id}-sm.${ext}`) : null;
        return { url: lg.url, thumb: sm ? sm.url : '', paths: { lg: lg.path, sm: sm && sm.path }, uploaded: [lg.path, sm && sm.path].filter(Boolean), old };
    }

    // ════════════════════════════════════════════════════════════
    //  PEDIDOS
    // ════════════════════════════════════════════════════════════
    const FILTERS = {
        abertos: { label: 'Em andamento', st: SP.OPEN_STATUSES },
        orcamento: { label: 'Aguardando orçamento', st: ['aguardando_orcamento'] },
        concluidos: { label: 'Concluídos', st: ['concluido'] },
        cancelados: { label: 'Cancelados', st: ['cancelado'] },
        todos: { label: 'Todos', st: null },
    };
    async function loadOrders(silent) {
        try {
            orders = await API.listOrders({ limit: 500 });
            const ids = new Set(orders.map(o => o.id));
            if (knownOrderIds && silent) {
                const fresh = orders.filter(o => !knownOrderIds.has(o.id));
                if (fresh.length) { toast(`${fresh.length} novo(s) pedido(s)! ${fresh.map(o => o.code).join(', ')}`); try { navigator.vibrate && navigator.vibrate(200); } catch (_) { } }
            }
            knownOrderIds = ids;
            renderOrders();
        } catch (e) { if (!silent) toast(errMsg(e), true); }
    }
    $('#refreshOrders').onclick = () => busy($('#refreshOrders'), 'Atualizando…', () => loadOrders());
    function renderOrders() {
        const count = k => FILTERS[k].st ? orders.filter(o => FILTERS[k].st.includes(o.status)).length : orders.length;
        $('#orderFilters').innerHTML = Object.entries(FILTERS).map(([k, f]) => `<button class="pill" type="button" data-f="${k}" aria-selected="${orderFilter === k}">${f.label}<b>${count(k)}</b></button>`).join('');
        const pend = orders.filter(o => o.status === 'pendente' || o.status === 'aguardando_orcamento').length;
        const dot = $('#ordersDot'); dot.hidden = !pend; dot.textContent = pend;
        document.title = (pend ? `(${pend}) ` : '') + 'Painel | Sabor de Pão';
        const q = SP.norm($('#orderSearch').value), qd = SP.digits(q);
        const f = FILTERS[orderFilter];
        const list = orders.filter(o => (!f.st || f.st.includes(o.status)) && (!q || SP.norm(o.customer_name).includes(q) || SP.norm(o.code).includes(q) || (qd.length >= 3 && o.customer_phone.includes(qd))));
        $('#ordersList').innerHTML = list.length ? list.map(o => {
            const st = SP.STATUS[o.status] || { label: o.status, tone: '' };
            return `<article class="order-card t-${st.tone}" data-id="${esc(o.id)}">
                <div class="oc-top"><span class="code">${esc(o.code)}</span><span class="st st-${st.tone}">${esc(st.label)}</span>${o.kind === 'personalizado' ? '<span class="st st-quote">Personalizado</span>' : ''}<span class="when">${SP.dateTimeBR(o.created_at)}</span></div>
                <div class="oc-name">${esc(o.customer_name)} · <span class="muted">${esc(SP.phoneMask(o.customer_phone))}</span></div>
                <div class="oc-items">${o.items.map(i => `${i.qty}× ${esc(i.name)}${i.variant_name ? ` (${esc(i.variant_name)})` : ''}`).join(', ')}</div>
                <div class="oc-foot"><span>${esc(SP.FULFILL_LABEL[o.fulfillment] || 'A definir')}${o.scheduled_for ? ` · para <b>${SP.dateBR(o.scheduled_for)}</b>` : ''}</span><b>${o.total != null ? money(o.total) : 'sem valor'}${o.delivery_pending ? ' + entrega' : ''}</b></div>
            </article>`;
        }).join('') : '<p class="muted center">Nenhum pedido aqui.</p>';
    }
    $('#orderFilters').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { orderFilter = b.dataset.f; renderOrders(); } });
    $('#orderSearch').addEventListener('input', renderOrders);
    $('#ordersList').addEventListener('click', e => { const c = e.target.closest('.order-card'); if (c) openOrder(c.dataset.id); });

    function openOrder(id) {
        const o = orders.find(x => x.id === id); if (!o) return;
        const st = SP.STATUS[o.status] || { label: o.status, tone: '' };
        const prev = orders.filter(x => x.customer_phone === o.customer_phone && x.id !== o.id).length;
        const isQuote = o.kind === 'personalizado';
        const it0 = o.items[0] || {};
        const waCustomer = SP.waLink(o.customer_phone, `Olá, ${o.customer_name.split(' ')[0]}! Aqui é da ${settings.business_name || 'Sabor de Pão'}, sobre o seu pedido ${o.code}.`);
        $('#orderDetail').innerHTML = `<div class="od">
            <h2 id="odTitle">Pedido ${esc(o.code)}</h2>
            <p><span class="st st-${st.tone}">${esc(st.label)}</span> <span class="muted tiny">${SP.dateTimeBR(o.created_at)}</span></p>
            ${isQuote ? `<div class="quote-box">
                <h3 style="font-size:1.05rem">Encomenda personalizada</h3>
                <p><b>Recheio:</b> ${esc(it0.custom && it0.custom.filling)}</p>
                ${it0.custom && it0.custom.ingredients ? `<p><b>Ingredientes:</b> ${esc(it0.custom.ingredients)}</p>` : ''}
                ${it0.custom && it0.custom.notes ? `<p><b>Observações:</b> ${esc(it0.custom.notes)}</p>` : ''}
                <p><b>Quantidade:</b> ${it0.qty}</p>
                ${['cancelado', 'concluido'].includes(o.status) ? '' : `<form class="form" id="quoteForm" style="margin-top:10px">
                    <div class="row2"><label>Valor por unidade (R$) *<input name="unit" inputmode="decimal" required value="${fmtNum(it0.unit_price)}"></label>
                    <label>Taxa de entrega (R$)<input name="fee" inputmode="decimal" value="${fmtNum(o.delivery_fee)}" placeholder="0,00"></label></div>
                    <button class="btn btn-brown btn-block" type="submit">${o.total == null ? 'Confirmar valor' : 'Atualizar valor'}</button>
                </form>`}
                ${o.total != null ? `<a class="btn btn-wa btn-block" style="margin-top:8px" href="${esc(SP.waLink(o.customer_phone, SP.quoteReplyMessage(o, settings)))}" target="_blank" rel="noopener">Enviar valor ao cliente pelo WhatsApp</a>` : ''}
            </div>` : ''}
            <div class="od-sec"><h3>Cliente</h3>
                <p><b>${esc(o.customer_name)}</b></p><p>${esc(SP.phoneMask(o.customer_phone))}</p>
                <p class="muted tiny">${prev ? `${prev} outro(s) pedido(s) deste telefone` : 'Primeiro pedido deste telefone'}</p>
                <a class="btn btn-wa btn-sm" href="${esc(waCustomer)}" target="_blank" rel="noopener">Conversar no WhatsApp</a>
            </div>
            <div class="od-sec"><h3>Itens</h3>
                ${o.items.map(i => `<div class="kv"><span>${i.qty}× ${esc(SP.itemLabel(i))}${(i.addons || []).map(a => `<br><small>+ ${esc(a.name)} (${money(a.price)})</small>`).join('')}${i.unit_price != null ? `<br><small>${money(i.unit_price)} cada</small>` : ''}</span><span>${i.total != null ? money(i.total) : '—'}</span></div>`).join('')}
                <div class="kv" style="border-top:1px solid var(--line);margin-top:6px;padding-top:6px"><span>Subtotal</span><span>${o.subtotal != null ? money(o.subtotal) : '—'}</span></div>
                <div class="kv"><span>Entrega</span><span>${o.fulfillment === 'retirada' ? 'Retirada (sem taxa)' : o.delivery_pending ? 'a combinar' : o.delivery_fee != null ? money(o.delivery_fee) : '—'}</span></div>
                <div class="kv"><span><b>Total</b></span><span>${o.total != null ? money(o.total) : 'aguardando valor'}</span></div>
            </div>
            <div class="od-sec"><h3>Entrega e pagamento</h3>
                <div class="kv"><span>Recebimento</span><span>${esc(SP.FULFILL_LABEL[o.fulfillment] || 'A definir')}</span></div>
                ${o.address ? `<div class="kv"><span>Endereço</span><span>${esc(SP.addressText(o.address))}</span></div>` : ''}
                ${o.scheduled_for ? `<div class="kv"><span>Data desejada</span><span>${SP.dateBR(o.scheduled_for)}</span></div>` : ''}
                ${o.payment_method ? `<div class="kv"><span>Pagamento</span><span>${esc(SP.PAY_LABEL[o.payment_method])}${o.change_for ? ` · troco p/ ${esc(o.change_for)}` : ''}</span></div>` : ''}
                ${o.notes ? `<div class="kv"><span>Observações</span><span>${esc(o.notes)}</span></div>` : ''}
            </div>
            <div class="od-sec"><h3>Alterar status</h3>
                <div class="status-grid">${Object.entries(SP.STATUS).filter(([k]) => k !== 'cancelado' && (isQuote || k !== 'aguardando_orcamento')).map(([k, v]) => `<button type="button" data-status="${k}" class="${o.status === k ? 'cur' : ''}">${v.label}</button>`).join('')}</div>
                ${o.status !== 'cancelado' ? '<button class="btn btn-outline btn-block btn-sm" type="button" data-status="cancelado" style="color:var(--danger);border-color:var(--danger)">Cancelar pedido</button>' : ''}
            </div>
            <div class="od-sec"><h3>Histórico</h3><ul class="hist">${(o.status_history || []).slice().reverse().map(h => `<li><b>${esc((SP.STATUS[h.status] || {}).label || h.status)}</b> · ${SP.dateTimeBR(h.at)}${h.note ? ` — ${esc(h.note)}` : ''}</li>`).join('')}</ul></div>
        </div>`;
        openM('mOrder');
        $$('#orderDetail [data-status]').forEach(b => b.onclick = async () => {
            const s = b.dataset.status;
            if (s === o.status) return;
            if (s === 'cancelado' && !confirm(`Cancelar o pedido ${o.code}?`)) return;
            try { const up = await API.setStatus(o.id, s, ''); Object.assign(o, up); toast(`Pedido ${o.code}: ${SP.STATUS[s].label}`); renderOrders(); openOrder(o.id); }
            catch (e) { toast(errMsg(e), true); }
        });
        const qf = $('#quoteForm');
        if (qf) qf.onsubmit = async e => {
            e.preventDefault();
            const unit = parseMoney(qf.unit.value), fee = parseMoney(qf.fee.value) || 0;
            if (!(unit > 0)) { toast('Informe um valor maior que zero.', true); qf.unit.classList.add('invalid'); return; }
            if (isNaN(fee) || fee < 0) { toast('Taxa de entrega inválida.', true); return; }
            try { const up = await API.setQuote(o.id, unit, fee, ''); Object.assign(o, up); toast(`Valor confirmado: ${money(o.total)}`); renderOrders(); openOrder(o.id); }
            catch (ex) { toast(errMsg(ex), true); }
        };
    }

    // ════════════════════════════════════════════════════════════
    //  CLIENTES (cadastrados pelo site ou que já fizeram pedido)
    // ════════════════════════════════════════════════════════════
    let customers = [], customerFilter = 'todos';
    async function loadCustomers() {
        $('#customersList').innerHTML = '<p class="muted center">Carregando…</p>';
        try { customers = await API.listCustomers(); renderCustomers(); }
        catch (e) { $('#customersList').innerHTML = ''; toast(errMsg(e), true); }
    }
    function renderCustomers() {
        const q = SP.norm($('#customerSearch').value), qd = SP.digits(q);
        const list = customers.filter(c => (customerFilter === 'todos' || (customerFilter === 'cadastro' ? c.origin === 'cadastro' : c.orders_count > 0))
            && (!q || SP.norm(c.name).includes(q) || (qd.length >= 3 && c.phone.includes(qd))));
        const cad = customers.filter(c => c.origin === 'cadastro').length, buy = customers.filter(c => c.orders_count > 0).length;
        $('#customersInfo').textContent = `${customers.length} cliente(s) no total · ${cad} cadastrado(s) pelo site · ${buy} já compraram`;
        $('#customersList').innerHTML = list.map(c => `<div class="row-card" data-phone="${esc(c.phone)}">
                <span class="ph cust-ini">${esc((c.name || '?').trim().charAt(0).toUpperCase())}</span>
                <div class="row-main" data-act="open"><div class="row-title">${esc(c.name)}</div>
                    <div class="row-sub">${esc(SP.phoneMask(c.phone))} · ${c.orders_count ? `<b>${c.orders_count}</b> pedido(s) · ${money(c.total_spent)}` : 'ainda sem pedidos'}${c.origin === 'cadastro' ? ' · 👤 cadastrado' : ''}</div></div>
                <div class="row-actions"><a class="ibtn" href="${esc(SP.waLink(c.phone, `Olá, ${c.name.split(' ')[0]}! Aqui é da ${settings.business_name || 'Sabor de Pão'}.`))}" target="_blank" rel="noopener" aria-label="WhatsApp" title="Chamar no WhatsApp">💬</a></div>
            </div>`).join('') || '<p class="muted center">Nenhum cliente encontrado.</p>';
    }
    $('#customerSearch').addEventListener('input', renderCustomers);
    $('#customerFilters').addEventListener('click', e => {
        const b = e.target.closest('[data-cf]'); if (!b) return; customerFilter = b.dataset.cf;
        $$('#customerFilters .pill').forEach(p => p.setAttribute('aria-selected', String(p === b))); renderCustomers();
    });
    $('#customersList').addEventListener('click', e => { if (!e.target.closest('[data-act=open]')) return; openCustomer(e.target.closest('.row-card').dataset.phone); });
    function openCustomer(phone) {
        const c = customers.find(x => x.phone === phone); if (!c) return;
        const hist = orders.filter(o => o.customer_phone === phone);
        $('#customerDetail').innerHTML = `<div class="od"><h2 id="cuTitle">${esc(c.name)}</h2>
            <div class="od-sec"><div class="kv"><span>WhatsApp</span><span>${esc(SP.phoneMask(c.phone))}</span></div>
                <div class="kv"><span>Cliente desde</span><span>${SP.dateTimeBR(c.created_at)}</span></div>
                <div class="kv"><span>Como chegou</span><span>${c.origin === 'cadastro' ? 'Cadastro no site' : 'Fez um pedido'}</span></div>
                <div class="kv"><span>Pedidos</span><span>${c.orders_count}</span></div>
                <div class="kv"><span>Total comprado</span><span>${money(c.total_spent)}</span></div>
                ${c.last_order_at ? `<div class="kv"><span>Último pedido</span><span>${SP.dateTimeBR(c.last_order_at)}</span></div>` : ''}
                <a class="btn btn-wa btn-block" style="margin-top:10px" href="${esc(SP.waLink(c.phone, `Olá, ${c.name.split(' ')[0]}! Aqui é da ${settings.business_name || 'Sabor de Pão'}.`))}" target="_blank" rel="noopener">💬 Chamar no WhatsApp</a></div>
            <form class="form od-sec" id="custNotesForm"><label>Anotações sobre o cliente<textarea name="notes" rows="2" maxlength="500" placeholder="Ex.: prefere pão bem assado">${esc(c.notes || '')}</textarea></label><button class="btn btn-brown btn-sm" type="submit">Salvar anotação</button></form>
            ${hist.length ? `<div class="od-sec"><h3>Pedidos</h3>${hist.map(o => `<div class="kv"><span>${esc(o.code)} · ${SP.dateTimeBR(o.created_at)}<br><small>${esc((SP.STATUS[o.status] || {}).label || o.status)}</small></span><span>${o.total != null ? money(o.total) : '—'}</span></div>`).join('')}</div>` : ''}
            <button class="btn btn-outline btn-block btn-sm" type="button" id="custDelete" style="color:var(--danger);border-color:var(--danger)">Excluir cadastro</button></div>`;
        openM('mCustomer');
        $('#custNotesForm').onsubmit = async e => {
            e.preventDefault();
            try { await API.saveCustomerNotes(c.phone, e.target.notes.value.trim()); c.notes = e.target.notes.value.trim(); toast('Anotação salva!'); }
            catch (ex) { toast(errMsg(ex), true); }
        };
        $('#custDelete').onclick = async () => {
            if (!confirm(`Excluir o cadastro de ${c.name}? Os pedidos dele continuam guardados.`)) return;
            try { await API.deleteCustomer(c.phone); customers = customers.filter(x => x !== c); closeM('mCustomer'); renderCustomers(); toast('Cadastro excluído.'); }
            catch (ex) { toast(errMsg(ex), true); }
        };
    }
    // Baixa a lista em planilha (abre no Excel / Google Planilhas)
    $('#exportCustomers').onclick = () => {
        if (!customers.length) { toast('Ainda não há clientes.', true); return; }
        const cell = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
        const rows = [['Nome', 'WhatsApp', 'Origem', 'Pedidos', 'Total comprado (R$)', 'Último pedido', 'Cliente desde', 'Anotações']]
            .concat(customers.map(c => [c.name, SP.phoneMask(c.phone), c.origin === 'cadastro' ? 'Cadastro no site' : 'Pedido', c.orders_count,
                Number(c.total_spent || 0).toFixed(2).replace('.', ','), c.last_order_at ? SP.dateTimeBR(c.last_order_at) : '', SP.dateTimeBR(c.created_at), c.notes || '']));
        const csv = '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        a.download = `clientes-sabor-de-pao-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); a.remove();
        toast('Lista de clientes baixada!');
    };

    // ════════════════════════════════════════════════════════════
    //  PRODUTOS
    // ════════════════════════════════════════════════════════════
    const catName = id => (categories.find(c => c.id === id) || {}).name || 'Sem categoria';
    function fillCatSelects() {
        $('#productCatFilter').innerHTML = '<option value="">Todas as categorias</option>' + categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
        $('#productForm').category_id.innerHTML = categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}${c.active ? '' : ' (inativa)'}</option>`).join('');
    }
    function sortedProducts() {
        const ci = Object.fromEntries(categories.map((c, i) => [c.id, i]));
        return products.slice().sort((a, b) => ((ci[a.category_id] ?? 999) - (ci[b.category_id] ?? 999)) || (a.sort_order - b.sort_order) || a.name.localeCompare(b.name));
    }
    function renderProducts() {
        const sel = $('#productCatFilter'), cur = sel.value; fillCatSelects(); sel.value = cur;
        const q = SP.norm($('#productSearch').value);
        const list = sortedProducts().filter(p => (!cur || p.category_id === cur) && (!q || SP.norm(p.name + ' ' + p.flavors).includes(q)));
        let lastCat = null;
        $('#productsList').innerHTML = list.map(p => {
            const group = p.category_id !== lastCat ? `<h3 class="group-title">${esc(catName(p.category_id))}</h3>` : ''; lastCat = p.category_id;
            const siblings = list.filter(x => x.category_id === p.category_id), idx = siblings.indexOf(p);
            const d = SP.displayPrice(p);
            const price = SP.isQuote(p) ? 'Sob consulta' : d ? `${d.from ? 'a partir de ' : ''}<b>${money(d.price)}</b>${d.original > d.price ? ` <s>${money(d.original)}</s>` : ''}` : '<b style="color:var(--danger)">sem preço</b>';
            const img = p.thumb_url || p.image_url;
            return `${group}<div class="row-card ${p.active ? '' : 'off'}" data-id="${esc(p.id)}">
                ${img ? `<img src="${esc(SP.img(img, 112, 112))}" alt="" loading="lazy" width="56" height="56">` : '<span class="ph"></span>'}
                <div class="row-main" data-act="edit"><div class="row-title">${esc(p.name)}</div><div class="row-sub">${price}${p.weight_label ? ` · ${esc(p.weight_label)}` : ''}${(p.variants || []).length ? ` · ${(p.variants || []).length} opções` : ''}</div></div>
                <div class="row-actions">
                    <button class="ibtn" type="button" data-act="up" ${idx === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
                    <button class="ibtn" type="button" data-act="down" ${idx === siblings.length - 1 ? 'disabled' : ''} aria-label="Descer">↓</button>
                    <button class="ibtn ${p.featured ? 'on' : ''}" type="button" data-act="feat" aria-label="Destaque" title="Destaque">★</button>
                    <label class="switch" title="Ativo na loja"><input type="checkbox" data-act="toggle" ${p.active ? 'checked' : ''} aria-label="Ativo"><span></span></label>
                </div>
            </div>`;
        }).join('') || '<p class="muted center">Nenhum produto encontrado.</p>';
    }
    $('#productSearch').addEventListener('input', renderProducts);
    $('#productCatFilter').addEventListener('change', renderProducts);
    $('#productsList').addEventListener('click', async e => {
        const el = e.target.closest('[data-act]'); if (!el) return;
        const row = el.closest('.row-card'), p = products.find(x => x.id === row.dataset.id); if (!p) return;
        const act = el.dataset.act;
        if (act === 'edit') return openProductEditor(p);
        if (act === 'toggle') return;
        try {
            if (act === 'feat') { const up = await API.saveProduct({ id: p.id, featured: !p.featured }); Object.assign(p, up); toast(p.featured ? 'Marcado como destaque' : 'Destaque removido'); }
            if (act === 'up' || act === 'down') {
                const sib = sortedProducts().filter(x => x.category_id === p.category_id), i = sib.indexOf(p), j = act === 'up' ? i - 1 : i + 1;
                if (j < 0 || j >= sib.length) return;
                [sib[i], sib[j]] = [sib[j], sib[i]];
                const rows = sib.map((x, k) => ({ id: x.id, sort_order: (k + 1) * 10 })).filter(r => products.find(x => x.id === r.id).sort_order !== r.sort_order);
                rows.forEach(r => { products.find(x => x.id === r.id).sort_order = r.sort_order; });
                renderProducts();
                await API.reorder('products', rows);
            }
            invalidateStoreCache(); renderProducts();
        } catch (ex) { toast(errMsg(ex), true); products = await API.listProducts(); renderProducts(); }
    });
    $('#productsList').addEventListener('change', async e => {
        if (e.target.dataset.act !== 'toggle') return;
        const p = products.find(x => x.id === e.target.closest('.row-card').dataset.id);
        try { const up = await API.saveProduct({ id: p.id, active: e.target.checked }); Object.assign(p, up); invalidateStoreCache(); toast(p.active ? 'Produto ativado — visível na loja' : 'Produto desativado — oculto na loja'); renderProducts(); }
        catch (ex) { e.target.checked = !e.target.checked; toast(errMsg(ex), true); }
    });

    // ── Editor de produto ────────────────────────────────────
    let editing = null;
    const pf = $('#productForm');
    function variantRow(v = {}) {
        const d = document.createElement('div'); d.className = 'ed-row'; d.dataset.id = v.id || SP.uid('v');
        d.innerHTML = `<input class="ed-name" data-k="name" placeholder="Nome (ex.: Grande, Calabresa)" maxlength="60" value="${esc(v.name || '')}">
            <input data-k="price" inputmode="decimal" placeholder="Preço R$" value="${fmtNum(v.price)}">
            <input data-k="promo_price" inputmode="decimal" placeholder="Promo R$" value="${fmtNum(v.promo_price)}">
            <input data-k="weight_label" placeholder="Peso (opcional)" maxlength="30" value="${esc(v.weight_label || '')}">
            <div class="ed-tools"><label class="check"><input type="checkbox" data-k="active" ${v.active === false ? '' : 'checked'}> Ativa</label><button class="link-btn" type="button" data-rm>Remover</button></div>`;
        return d;
    }
    function addonRow(a = {}) {
        const d = document.createElement('div'); d.className = 'ed-row addon'; d.dataset.id = a.id || SP.uid('a');
        d.innerHTML = `<input class="ed-name" data-k="name" placeholder="Adicional (ex.: Queijo extra)" maxlength="60" value="${esc(a.name || '')}">
            <input data-k="price" inputmode="decimal" placeholder="R$ (0 = grátis)" value="${fmtNum(a.price)}">
            <div class="ed-tools"><label class="check"><input type="checkbox" data-k="active" ${a.active === false ? '' : 'checked'}> Ativo</label><button class="link-btn" type="button" data-rm>Remover</button></div>`;
        return d;
    }
    $('#addVariant').onclick = () => { $('#variantsEd').appendChild(variantRow()); syncPriceMode(); $('#variantsEd').lastChild.querySelector('input').focus(); };
    $('#addAddon').onclick = () => { $('#addonsEd').appendChild(addonRow()); $('#addonsEd').lastChild.querySelector('input').focus(); };
    pf.addEventListener('click', e => { if (e.target.matches('[data-rm]')) { e.target.closest('.ed-row').remove(); syncPriceMode(); } });
    pf.addEventListener('change', e => { if (e.target.name === 'price_mode') syncPriceMode(); });
    function syncPriceMode() {
        const quote = pf.price_mode.value === 'quote', hasVar = $('#variantsEd').children.length > 0;
        $('#fixedBox').hidden = quote; $('#variantsBox').hidden = quote; $('#addonsBox').hidden = quote;
        $('#priceHint').textContent = hasVar ? '(não usado: preço vem das opções)' : '';
        pf.price.disabled = hasVar; pf.promo_price.disabled = hasVar;
    }
    function openProductEditor(p) {
        editing = p || null; fillCatSelects(); pf.reset();
        $('#editTitle').textContent = p ? 'Editar produto' : 'Novo produto';
        $('#editError').hidden = true; $$('.invalid', pf).forEach(x => x.classList.remove('invalid'));
        const v = p || { active: true, price_mode: 'fixed', unit: 'unidade', category_id: $('#productCatFilter').value || (categories[0] || {}).id, sort_order: (Math.max(0, ...products.map(x => x.sort_order || 0)) + 10) };
        pf.name.value = v.name || ''; pf.category_id.value = v.category_id || ''; pf.flavors.value = v.flavors || ''; pf.description.value = v.description || '';
        $$('input[name=price_mode]', pf).forEach(r => { r.checked = r.value === (v.price_mode || 'fixed'); });
        pf.price.value = fmtNum(v.price); pf.promo_price.value = fmtNum(v.promo_price);
        pf.unit.value = v.unit || 'unidade'; pf.weight_label.value = v.weight_label || '';
        pf.active.checked = v.active !== false; pf.featured.checked = !!v.featured; pf.sort_order.value = v.sort_order || 0;
        $('#variantsEd').innerHTML = ''; (v.variants || []).forEach(x => $('#variantsEd').appendChild(variantRow(x)));
        $('#addonsEd').innerHTML = ''; (v.addons || []).forEach(x => $('#addonsEd').appendChild(addonRow(x)));
        const field = $('.img-field', pf); initImgField(field, v.image_url); imgState.get(field).oldThumb = v.thumb_url;
        $('#deleteProduct').hidden = !p;
        syncPriceMode(); openM('mEdit');
    }
    $('#newProduct').onclick = () => { if (!categories.length) { toast('Crie uma categoria primeiro.', true); showTab('categories'); return; } openProductEditor(null); };

    function readRows(box, kind) {
        const out = [];
        for (const r of $$('.ed-row', box)) {
            const g = k => r.querySelector(`[data-k="${k}"]`);
            const name = g('name').value.trim(), price = parseMoney(g('price').value);
            if (!name && price === null) continue;
            const row = { id: r.dataset.id, name, price, active: g('active').checked };
            if (kind === 'v') { row.promo_price = parseMoney(g('promo_price').value); row.weight_label = g('weight_label').value.trim(); }
            const bad = !name || (kind === 'v' ? !(price > 0) : !(price >= 0)) || (kind === 'v' && row.promo_price !== null && !(row.promo_price > 0));
            r.querySelectorAll('input').forEach(i => i.classList.remove('invalid'));
            if (bad) { (name ? g('price') : g('name')).classList.add('invalid'); throw new Error(kind === 'v' ? 'Cada opção precisa de nome e preço maior que zero.' : 'Cada adicional precisa de nome e preço (pode ser 0).'); }
            if (kind === 'v' && row.promo_price !== null && row.promo_price >= price) { g('promo_price').classList.add('invalid'); throw new Error('O preço promocional deve ser menor que o preço normal.'); }
            out.push(row);
        }
        return out;
    }
    pf.addEventListener('submit', e => {
        e.preventDefault();
        const err = $('#editError'); err.hidden = true;
        busy($('#saveProduct'), 'Salvando…', async () => {
            let uploaded = [];
            try {
                const quote = pf.price_mode.value === 'quote';
                if (!pf.name.value.trim()) { pf.name.classList.add('invalid'); throw new Error('Informe o nome do produto.'); }
                if (!pf.category_id.value) throw new Error('Escolha a categoria.');
                const variants = quote ? [] : readRows($('#variantsEd'), 'v');
                const addons = quote ? [] : readRows($('#addonsEd'), 'a');
                let price = null, promo = null;
                if (!quote && !variants.length) {
                    price = parseMoney(pf.price.value); promo = parseMoney(pf.promo_price.value);
                    if (!(price > 0)) { pf.price.classList.add('invalid'); throw new Error('Informe um preço maior que zero.'); }
                    if (promo !== null && (isNaN(promo) || promo <= 0 || promo >= price)) { pf.promo_price.classList.add('invalid'); throw new Error('O preço promocional deve ser maior que zero e menor que o preço normal.'); }
                }
                const field = $('.img-field', pf);
                const img = await commitImg(field, 'produtos');
                if (img) uploaded = img.uploaded;
                const data = {
                    id: editing ? editing.id : undefined, name: pf.name.value.trim(), category_id: pf.category_id.value,
                    flavors: pf.flavors.value.trim(), description: pf.description.value.trim(),
                    price_mode: quote ? 'quote' : 'fixed', price: quote ? null : price, promo_price: quote ? null : promo,
                    unit: pf.unit.value.trim() || 'unidade', weight_label: pf.weight_label.value.trim(),
                    variants, addons, active: pf.active.checked, featured: pf.featured.checked, sort_order: parseInt(pf.sort_order.value, 10) || 0,
                };
                if (img) Object.assign(data, { image_url: img.url, thumb_url: img.thumb, image_path: img.paths ? img.paths.lg : null, thumb_path: img.paths ? img.paths.sm : null });
                if (!data.id) delete data.id;
                const saved = await API.saveProduct(data);
                if (img && img.old.length) API.deleteImages(img.old).catch(() => { });
                const i = products.findIndex(x => x.id === saved.id); if (i >= 0) products[i] = saved; else products.push(saved);
                invalidateStoreCache(); closeM('mEdit'); renderProducts();
                toast(editing ? 'Produto atualizado — já está na loja.' : 'Produto cadastrado!');
            } catch (ex) {
                if (uploaded.length) API.deleteImages(uploaded).catch(() => { });
                err.textContent = errMsg(ex); err.hidden = false;
            }
        });
    });
    $('#deleteProduct').onclick = async () => {
        if (!editing || !confirm(`Excluir "${editing.name}" definitivamente?\n\nDica: para apenas esconder da loja, use "Ativo".`)) return;
        try {
            await API.deleteProduct(editing.id);
            API.deleteImages([storagePath(editing.image_url), storagePath(editing.thumb_url)].filter(Boolean)).catch(() => { });
            products = products.filter(p => p.id !== editing.id); invalidateStoreCache(); closeM('mEdit'); renderProducts(); toast('Produto excluído.');
        } catch (ex) { toast(errMsg(ex), true); }
    };

    // ════════════════════════════════════════════════════════════
    //  CATEGORIAS
    // ════════════════════════════════════════════════════════════
    function renderCategories() {
        categories.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
        $('#categoriesList').innerHTML = categories.map((c, i) => {
            const n = products.filter(p => p.category_id === c.id).length;
            return `<div class="row-card ${c.active ? '' : 'off'}" data-id="${esc(c.id)}">
                ${c.image_url ? `<img src="${esc(SP.img(c.image_url, 112, 112))}" alt="" width="56" height="56">` : '<span class="ph"></span>'}
                <div class="row-main" data-act="edit"><div class="row-title">${esc(c.name)}</div><div class="row-sub">${n} produto(s)</div></div>
                <div class="row-actions">
                    <button class="ibtn" type="button" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
                    <button class="ibtn" type="button" data-act="down" ${i === categories.length - 1 ? 'disabled' : ''} aria-label="Descer">↓</button>
                    <label class="switch" title="Ativa"><input type="checkbox" data-act="toggle" ${c.active ? 'checked' : ''} aria-label="Ativa"><span></span></label>
                </div></div>`;
        }).join('') || '<p class="muted center">Nenhuma categoria.</p>';
    }
    let editingCat = null;
    const cf = $('#categoryForm');
    function openCategory(c) {
        editingCat = c || null; cf.reset(); $('#catError').hidden = true;
        $('#catTitle').textContent = c ? 'Editar categoria' : 'Nova categoria';
        cf.name.value = c ? c.name : ''; cf.description.value = c ? c.description || '' : '';
        cf.sort_order.value = c ? c.sort_order : (Math.max(0, ...categories.map(x => x.sort_order)) + 1);
        cf.active.checked = c ? c.active : true;
        initImgField($('.img-field', cf), c && c.image_url);
        $('#deleteCategory').hidden = !c; openM('mCat');
    }
    $('#newCategory').onclick = () => openCategory(null);
    $('#categoriesList').addEventListener('click', async e => {
        const el = e.target.closest('[data-act]'); if (!el) return;
        const c = categories.find(x => x.id === el.closest('.row-card').dataset.id);
        if (el.dataset.act === 'edit') return openCategory(c);
        if (el.dataset.act === 'up' || el.dataset.act === 'down') {
            const i = categories.indexOf(c), j = el.dataset.act === 'up' ? i - 1 : i + 1; if (j < 0 || j >= categories.length) return;
            [categories[i], categories[j]] = [categories[j], categories[i]];
            const rows = categories.map((x, k) => ({ id: x.id, sort_order: k + 1 })).filter(r => categories.find(x => x.id === r.id).sort_order !== r.sort_order);
            rows.forEach(r => { categories.find(x => x.id === r.id).sort_order = r.sort_order; });
            renderCategories();
            try { await API.reorder('categories', rows); invalidateStoreCache(); } catch (ex) { toast(errMsg(ex), true); categories = await API.listCategories(); renderCategories(); }
        }
    });
    $('#categoriesList').addEventListener('change', async e => {
        if (e.target.dataset.act !== 'toggle') return;
        const c = categories.find(x => x.id === e.target.closest('.row-card').dataset.id);
        try { const up = await API.saveCategory({ ...c, active: e.target.checked }); Object.assign(c, up); invalidateStoreCache(); renderCategories(); toast(c.active ? 'Categoria visível na loja' : 'Categoria oculta (e seus produtos)'); }
        catch (ex) { e.target.checked = !e.target.checked; toast(errMsg(ex), true); }
    });
    cf.addEventListener('submit', async e => {
        e.preventDefault(); const err = $('#catError'); err.hidden = true;
        if (!cf.name.value.trim()) { cf.name.classList.add('invalid'); return; }
        let uploaded = [];
        try {
            const img = await commitImg($('.img-field', cf), 'categorias'); if (img) uploaded = img.uploaded;
            const data = { id: editingCat && editingCat.id, name: cf.name.value.trim(), description: cf.description.value.trim(), sort_order: parseInt(cf.sort_order.value, 10) || 0, active: cf.active.checked, image_url: img ? img.url : (editingCat ? editingCat.image_url : '') };
            const saved = await API.saveCategory(data);
            if (img && img.old.length) API.deleteImages(img.old).catch(() => { });
            const i = categories.findIndex(x => x.id === saved.id); if (i >= 0) categories[i] = saved; else categories.push(saved);
            invalidateStoreCache(); closeM('mCat'); renderCategories(); toast('Categoria salva!');
        } catch (ex) { if (uploaded.length) API.deleteImages(uploaded).catch(() => { }); err.textContent = errMsg(ex); err.hidden = false; }
    });
    $('#deleteCategory').onclick = async () => {
        const c = editingCat; if (!c) return;
        const n = products.filter(p => p.category_id === c.id).length;
        if (n) { alert(`A categoria "${c.name}" tem ${n} produto(s). Mova-os para outra categoria ou exclua-os antes. Se quiser apenas esconder, desative a categoria.`); return; }
        if (!confirm(`Excluir a categoria "${c.name}"?`)) return;
        try { await API.deleteCategory(c.id); categories = categories.filter(x => x.id !== c.id); invalidateStoreCache(); closeM('mCat'); renderCategories(); toast('Categoria excluída.'); }
        catch (ex) { toast(errMsg(ex), true); }
    };

    // ════════════════════════════════════════════════════════════
    //  CONFIGURAÇÕES
    // ════════════════════════════════════════════════════════════
    const sf = $('#settingsForm');
    const TEXT_FIELDS = ['business_name', 'tagline', 'instagram', 'facebook', 'maps_url', 'address', 'city', 'hours_note', 'delivery_info', 'pickup_info', 'orders_info', 'pix_key', 'pix_holder', 'pix_city', 'hero_title', 'hero_subtitle', 'hero_cta', 'announcement', 'verse', 'verse_ref', 'quote'];
    function fillSettings() {
        const s = settings;
        TEXT_FIELDS.forEach(k => { sf[k].value = s[k] || ''; });
        sf.whatsapp.value = s.whatsapp ? SP.phoneMask(s.whatsapp) : '';
        sf.delivery_fee.value = fmtNum(s.delivery_fee);
        sf.delivery_enabled.checked = s.delivery_enabled === true; sf.pickup_enabled.checked = s.pickup_enabled !== false;
        const hours = Array.isArray(s.hours) ? s.hours : [];
        $('#hoursEditor').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => {
            const h = hours.find(x => Number(x.d) === d) || {};
            return `<div class="h-row ${h.closed ? 'closed' : ''}" data-d="${d}"><b>${SP.DAYS[d]}</b><input type="time" data-k="open" value="${esc(h.open || '')}" aria-label="Abre"><input type="time" data-k="close" value="${esc(h.close || '')}" aria-label="Fecha"><label><input type="checkbox" data-k="closed" ${h.closed ? 'checked' : ''}> Fechado</label></div>`;
        }).join('');
        $$('.img-field', sf).forEach(f => initImgField(f, s[f.dataset.field]));
    }
    $('#hoursEditor').addEventListener('change', e => { if (e.target.dataset.k === 'closed') e.target.closest('.h-row').classList.toggle('closed', e.target.checked); });
    sf.whatsapp.addEventListener('input', e => { e.target.value = SP.phoneMask(e.target.value); });
    sf.addEventListener('submit', e => {
        e.preventDefault();
        busy($('#saveSettings'), 'Salvando…', async () => {
            let uploaded = []; const toDelete = [];
            try {
                const data = Object.assign({}, settings);
                TEXT_FIELDS.forEach(k => { data[k] = sf[k].value.trim(); });
                data.pix_key = SP.pixKey(data.pix_key);          // celular vira +55..., como o PIX exige
                const wa = SP.digits(sf.whatsapp.value);
                if (wa && (wa.length < 10 || wa.length > 13)) { sf.whatsapp.classList.add('invalid'); throw new Error('WhatsApp inválido. Use DDD + número.'); }
                data.whatsapp = wa;
                const fee = parseMoney(sf.delivery_fee.value);
                if (fee !== null && (isNaN(fee) || fee < 0)) { sf.delivery_fee.classList.add('invalid'); throw new Error('Taxa de entrega inválida.'); }
                data.delivery_fee = fee;
                data.delivery_enabled = sf.delivery_enabled.checked; data.pickup_enabled = sf.pickup_enabled.checked;
                if (!data.delivery_enabled && !data.pickup_enabled) throw new Error('Ative ao menos uma forma de recebimento (entrega ou retirada).');
                data.hours = $$('.h-row', $('#hoursEditor')).map(r => ({ d: Number(r.dataset.d), open: r.querySelector('[data-k=open]').value, close: r.querySelector('[data-k=close]').value, closed: r.querySelector('[data-k=closed]').checked }))
                    .filter(h => h.closed || (h.open && h.close));
                for (const f of $$('.img-field', sf)) {
                    const img = await commitImg(f, 'loja');
                    if (img) { uploaded = uploaded.concat(img.uploaded); toDelete.push(...img.old); data[f.dataset.field] = img.url; }
                }
                await API.saveSettings(data);
                settings = data; toDelete.length && API.deleteImages(toDelete).catch(() => { });
                $$('.invalid', sf).forEach(x => x.classList.remove('invalid'));
                invalidateStoreCache(); fillSettings(); toast('Configurações salvas — a loja já está atualizada.');
                if (settings.logo_url) $('#aLogo').innerHTML = `<img src="${esc(settings.logo_url)}" alt="">`;
            } catch (ex) { if (uploaded.length) API.deleteImages(uploaded).catch(() => { }); toast(errMsg(ex), true); }
        });
    });
    $('#passwordForm').addEventListener('submit', async e => {
        e.preventDefault(); const f = e.target;
        if (f.pw1.value.length < 8) { toast('A senha deve ter pelo menos 8 caracteres.', true); return; }
        if (f.pw1.value !== f.pw2.value) { toast('As senhas não conferem.', true); return; }
        try { await API.changePassword(f.pw1.value); f.reset(); toast('Senha alterada!'); } catch (ex) { toast(errMsg(ex), true); }
    });

    boot();
    window.SPAdmin = { state: () => ({ categories, products, orders, settings }) };
})();
