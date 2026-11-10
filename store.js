/**
 * Sabor de Pão — Cardápio e pedidos (layout no estilo do TDA Açaí)
 * Produtos, preços e textos vêm do banco (editáveis no painel).
 * Velocidade: mostra o cardápio guardado no aparelho na hora e atualiza com UMA consulta.
 * O carrinho guarda só referências; os preços sempre vêm do cardápio mais recente.
 */
(function () {
    'use strict';
    const SP = window.SP, API = window.SPApi;
    const $ = (s, el = document) => el.querySelector(s);
    const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
    const esc = SP.esc, money = SP.money;
    const LS = {
        get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
        set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { } },
        del(k) { try { localStorage.removeItem(k); } catch (_) { } },
    };
    const K = { catalog: 'sp_catalog_v1_' + API.mode, cart: 'sp_cart_v1', cartMeta: 'sp_cart_meta_v1', profile: 'sp_profile_v1', orders: 'sp_my_orders_v1' };

    let catalog = null, byId = {}, settings = {};
    let cart = LS.get(K.cart, []);
    let cartMeta = LS.get(K.cartMeta, { notes: '' });
    let lastFetch = 0, filterCat = 'all', searchQ = '';
    const t0 = performance.now();

    // ── Utilidades ───────────────────────────────────────────
    let toastT;
    function toast(msg, err) {
        const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
        clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'toast'; }, 3000);
    }
    function openM(id) { $('#' + id).hidden = false; document.body.style.overflow = 'hidden'; }
    function closeM(id) { const m = $('#' + id); if (!m || m.hidden) return; m.hidden = true; if (!$$('.overlay').some(o => !o.hidden)) document.body.style.overflow = ''; }
    document.addEventListener('click', e => {
        if (e.target.closest('[data-close]')) closeM(e.target.closest('.overlay').id);
        else if (e.target.classList.contains('overlay')) closeM(e.target.id);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { const o = $$('.overlay').filter(x => !x.hidden).pop(); if (o) closeM(o.id); } });
    const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
    const deliveryOn = () => settings.delivery_enabled === true;          // padrão: só retirada
    const pickupOn = () => settings.pickup_enabled !== false || !deliveryOn();
    const imgUrl = (p, w) => SP.img(p.thumb_url || p.image_url, w, w);

    // ════════════════════════════════════════════════════════════
    //  CARDÁPIO (cache + atualização)
    // ════════════════════════════════════════════════════════════
    async function loadCatalog(force) {
        const cached = LS.get(K.catalog, null);
        if (cached && !catalog) apply(cached, true);
        try {
            const fresh = await API.getCatalog();
            lastFetch = Date.now();
            if (!catalog || force || fresh.version !== catalog.version || !cached) apply(fresh, false);
            LS.set(K.catalog, fresh);
        } catch (e) {
            console.warn('Cardápio indisponível:', e);
            if (!catalog) {
                $('#menu').innerHTML = `<div class="empty"><p>😕</p><p>Não foi possível carregar o cardápio.</p><button class="btn btn-primary btn-sm" type="button" id="retryLoad">Tentar novamente</button></div>`;
                $('#retryLoad').onclick = () => loadCatalog(true);
            }
        }
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastFetch > 60000) loadCatalog(); });

    function apply(c, fromCache) {
        catalog = c; settings = c.settings || {};
        byId = {}; (c.products || []).forEach(p => { byId[p.id] = p; p._s = SP.norm([p.name, p.description, p.flavors, p.weight_label, (p.variants || []).map(v => v.name).join(' ')].join(' ')); });
        const before = cart.length; cart = cart.filter(l => SP.priceLine(byId[l.product_id], l).ok);
        if (cart.length !== before) { saveCart(); if (!fromCache) toast('Um item do carrinho não está mais disponível e foi retirado.'); }
        applySettings(); renderPills(); renderMenu(); updateCart();
        if (!$('#mCheckout').hidden) renderSummary();
        if (!$('#mCart').hidden) renderCart();
        if (!window.__spFirstPaint) { window.__spFirstPaint = Math.round(performance.now() - t0); window.__spFromCache = fromCache; }
    }

    function applySettings() {
        const s = settings;
        $$('[data-s]').forEach(el => { const v = s[el.dataset.s]; if (v) el.textContent = v; });
        document.title = `${s.business_name || 'Sabor de Pão'} | Cardápio e encomendas`;
        $$('.js-wa').forEach(a => { a.hidden = !s.whatsapp; if (s.whatsapp) { a.href = SP.waLink(s.whatsapp, a.dataset.wa || ''); a.target = '_blank'; a.rel = 'noopener'; } });
        if (s.hero_image) { const src = SP.img(s.hero_image, 828, 360); if ($('#coverImg').getAttribute('src') !== src) $('#coverImg').src = src; }
        if (s.logo_url) $('#storeLogo').innerHTML = `<img src="${esc(s.logo_url)}" alt="">`;
        $('#notice').hidden = false;
        $('#noticeText').innerHTML = s.announcement ? esc(s.announcement) : (deliveryOn() ? 'Faça sua encomenda pelo site: <b>retirada ou entrega</b>!' : 'Faça sua encomenda pelo site e <b>retire no local</b>!');
        const city = $('#storeCity'); city.hidden = !s.city; city.textContent = s.city ? '📍 ' + s.city : '';
        const open = SP.isOpenNow(s.hours), st = $('#storeStatus');
        st.hidden = open === null; st.textContent = open ? '● Aberto agora' : '● Fechado agora'; st.className = 'status ' + (open ? 'open' : 'closed');
        $('#demoBar').hidden = API.mode !== 'demo';
        $('#year').textContent = new Date().getFullYear();
        renderFooter();
    }

    function hoursRows() {
        const s = settings, d = new Date().getDay();
        if (!SP.hoursConfigured(s.hours)) return '';
        return [1, 2, 3, 4, 5, 6, 0].map(i => { const h = s.hours.find(x => Number(x.d) === i) || {}; return `<div class="info-row ${i === d ? 'today' : ''}"><span>${SP.DAYS[i]}</span><span>${h.closed || !h.open ? 'Fechado' : `${h.open} às ${h.close}`}</span></div>`; }).join('');
    }
    function renderFooter() {
        const s = settings, out = [];
        if (SP.hoursConfigured(s.hours) || s.hours_note) {
            const lines = SP.hoursConfigured(s.hours) ? [1, 2, 3, 4, 5, 6, 0].map(i => { const h = s.hours.find(x => Number(x.d) === i) || {}; return `<p>${SP.DAYS[i]}: ${h.closed || !h.open ? 'Fechado' : `${h.open} às ${h.close}`}</p>`; }).join('') : '';
            out.push(`<div><h4>🕐 Horários</h4>${lines}${s.hours_note ? `<p>${esc(s.hours_note)}</p>` : ''}</div>`);
        }
        if (s.address || s.city) out.push(`<div><h4>📍 Retirada</h4><p>${esc(s.address || '')}</p><p>${esc(s.city || '')}</p><a class="btn btn-outline btn-sm" href="${esc(s.maps_url || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([s.address, s.city].filter(Boolean).join(', ')))}" target="_blank" rel="noopener">Ver no mapa</a></div>`);
        if (s.whatsapp) out.push(`<div><h4>📱 Contato</h4><p>${esc(SP.phoneMask(s.whatsapp))}</p><a class="btn btn-wa btn-sm" href="${esc(SP.waLink(s.whatsapp, 'Olá! Gostaria de fazer uma encomenda.'))}" target="_blank" rel="noopener">💬 WhatsApp</a></div>`);
        $('#footerInfo').innerHTML = out.join('');
    }

    // ── Informações da loja ──────────────────────────────────
    $('#btnInfo').onclick = () => {
        const s = settings, fee = SP.deliveryFee(s, 'entrega');
        $('#infoBody').innerHTML = `
            ${hoursRows() ? `<div class="info-block"><h4>🕐 Horários</h4>${hoursRows()}${s.hours_note ? `<p class="muted tiny">${esc(s.hours_note)}</p>` : ''}</div>` : (s.hours_note ? `<div class="info-block"><h4>🕐 Horários</h4><p>${esc(s.hours_note)}</p></div>` : '')}
            <div class="info-block"><h4>🛍️ Retirada no local</h4>${s.pickup_info ? `<p>${esc(s.pickup_info)}</p>` : '<p>Faça o pedido pelo site e retire no local.</p>'}${s.address ? `<p><b>${esc(s.address)}</b>${s.city ? ' – ' + esc(s.city) : ''}</p>` : ''}</div>
            ${deliveryOn() ? `<div class="info-block"><h4>🛵 Entrega</h4><p>Taxa: ${fee === null ? 'a combinar' : money(fee)}</p>${s.delivery_info ? `<p>${esc(s.delivery_info)}</p>` : ''}</div>` : ''}
            ${s.orders_info ? `<div class="info-block"><h4>📋 Encomendas</h4><p>${esc(s.orders_info)}</p></div>` : ''}
            <div class="info-block"><h4>💳 Pagamento</h4><div class="pay-tags"><span>📲 PIX</span><span>💵 Dinheiro</span><span>💳 Débito</span><span>💳 Crédito</span></div></div>
            ${s.whatsapp ? `<a class="btn btn-wa btn-block" href="${esc(SP.waLink(s.whatsapp, 'Olá! Gostaria de fazer uma encomenda.'))}" target="_blank" rel="noopener">📱 Falar no WhatsApp</a>` : ''}`;
        openM('mInfo');
    };

    // ════════════════════════════════════════════════════════════
    //  LISTA DE PRODUTOS
    // ════════════════════════════════════════════════════════════
    function renderPills() {
        const cats = catalog.categories || [];
        const extra = [];
        if ((catalog.products || []).some(SP.hasPromo)) extra.push(['promo', '🔥 Promoções']);
        $('#pills').innerHTML = [['all', 'Todos']].concat(extra, cats.map(c => [c.id, c.name]))
            .map(([id, n]) => `<button class="pill" type="button" data-cat="${esc(id)}" aria-selected="${filterCat === id}">${esc(n)}</button>`).join('');
    }
    function priceHTML(p) {
        if (SP.isQuote(p)) return `<span class="quote">Sob consulta</span>`;
        const d = SP.displayPrice(p); if (!d) return '';
        const unit = p.unit && p.unit !== 'unidade' ? ` / ${esc(p.unit)}` : '';
        return `${d.from ? 'A partir de ' : ''}${d.original > d.price ? `<s>${money(d.original)}</s>` : ''}<strong>${money(d.price)}</strong>${unit}`;
    }
    function itemHTML(p, i) {
        const tags = [];
        if (SP.hasPromo(p)) tags.push('<span class="tag tag-promo">Promoção</span>');
        if (p.weight_label) tags.push(`<span class="tag tag-weight">${esc(p.weight_label)}</span>`);
        (p.flavors || '').split(',').map(f => f.trim()).filter(Boolean).slice(0, 3).forEach(f => tags.push(`<span class="tag">${esc(f)}</span>`));
        const img = p.thumb_url || p.image_url;
        return `<button class="item" type="button" data-id="${esc(p.id)}">
            <span class="item-info">
                <span class="item-name">${esc(p.name)}</span>
                ${tags.length ? `<span class="item-tags">${tags.join('')}</span>` : ''}
                ${p.description ? `<span class="item-desc">${esc(p.description)}</span>` : ''}
                <span class="item-price">${priceHTML(p)}</span>
            </span>
            <span class="item-img">${img ? `<img src="${esc(imgUrl(p, 200))}" srcset="${esc(imgUrl(p, 200))} 1x, ${esc(imgUrl(p, 300))} 2x" alt="" width="100" height="100" ${i < 4 ? '' : 'loading="lazy"'} decoding="async">` : ''}<span class="plus" aria-hidden="true">+</span><span class="in-cart" data-incart="${esc(p.id)}" hidden></span></span>
        </button>`;
    }
    // Renderização progressiva: primeiros itens na hora, o resto em lotes (não trava com muitos produtos)
    let renderToken = 0;
    function renderMenu() {
        const token = ++renderToken;
        const prods = catalog.products || [];
        const sections = [];
        const promos = prods.filter(SP.hasPromo);
        if (promos.length) sections.push({ id: 'promo', title: '🔥 Promoções', cls: 'promo', list: promos });
        const feat = prods.filter(p => p.featured);
        if (feat.length) sections.push({ id: 'destaques', title: '⭐ Destaques', list: feat });
        const best = (catalog.best_sellers || []).map(id => byId[id]).filter(Boolean).slice(0, 4);
        if (best.length) sections.push({ id: 'maispedidos', title: '❤️ Mais pedidos', list: best });
        (catalog.categories || []).forEach(c => { const l = prods.filter(p => p.category_id === c.id); if (l.length) sections.push({ id: c.id, title: '🥖 ' + c.name, list: l, cat: true }); });
        $('#menu').innerHTML = sections.map(s => `<section class="sec" data-sec="${esc(s.id)}" data-cat="${s.cat ? esc(s.id) : ''}"><h2 class="sec-title ${s.cls || ''}" id="sec-${esc(s.id)}">${esc(s.title)}</h2><div class="sec-list"></div></section>`).join('')
            || '<div class="empty"><p>🥖</p><p>Cardápio em atualização. Fale conosco pelo WhatsApp!</p></div>';
        const queue = [];
        sections.forEach(s => { const box = $(`[data-sec="${CSS.escape(s.id)}"] .sec-list`); s.list.forEach(p => queue.push([box, p])); });
        let i = 0;
        const step = n => {
            if (token !== renderToken) return;
            const end = Math.min(queue.length, i + n), parts = new Map();
            for (; i < end; i++) { const [b, p] = queue[i]; parts.set(b, (parts.get(b) || '') + itemHTML(p, i)); }
            parts.forEach((h, b) => b.insertAdjacentHTML('beforeend', h));
            applyFilter(); markInCart();
            if (i < queue.length) setTimeout(() => step(40), 0);
        };
        step(30);
    }
    function applyFilter() {
        const q = SP.norm(searchQ); let any = false;
        $$('.sec', $('#menu')).forEach(sec => {
            const isCat = !!sec.dataset.cat, id = sec.dataset.sec;
            let show;
            if (q) show = isCat;                                   // na busca: só as categorias (sem repetir destaques)
            else if (filterCat === 'all') show = true;
            else show = id === filterCat;
            let has = false;
            $$('.item', sec).forEach(it => { const m = show && (!q || (byId[it.dataset.id] || {})._s.includes(q)); it.hidden = !m; if (m) has = true; });
            sec.hidden = !has; if (has) any = true;
        });
        $('#emptySearch').hidden = any || !catalog;
    }
    function markInCart() {
        const qty = {}; cart.forEach(l => { qty[l.product_id] = (qty[l.product_id] || 0) + l.qty; });
        $$('[data-incart]').forEach(b => { const n = qty[b.dataset.incart]; b.hidden = !n; b.textContent = n || ''; });
    }
    $('#pills').addEventListener('click', e => {
        const b = e.target.closest('.pill'); if (!b) return;
        filterCat = b.dataset.cat; $('#search').value = ''; searchQ = '';
        $$('.pill').forEach(p => p.setAttribute('aria-selected', String(p === b)));
        applyFilter();
        const nav = $('#stickyNav'); window.scrollTo({ top: $('#menu').getBoundingClientRect().top + scrollY - nav.offsetHeight - 56, behavior: 'smooth' });
    });
    let searchT;
    $('#search').addEventListener('input', e => { clearTimeout(searchT); searchT = setTimeout(() => { searchQ = e.target.value; applyFilter(); }, 90); });
    $('#clearSearch').onclick = () => { $('#search').value = ''; searchQ = ''; filterCat = 'all'; renderPills(); applyFilter(); };
    $('#menu').addEventListener('click', e => {
        const it = e.target.closest('.item'); if (!it) return;
        const p = byId[it.dataset.id]; if (!p) return;
        SP.isQuote(p) ? openCustom(p) : openProduct(p);
    });

    // ════════════════════════════════════════════════════════════
    //  PRODUTO
    // ════════════════════════════════════════════════════════════
    let pm = null;
    function openProduct(p) {
        const vs = SP.activeVariants(p), ads = SP.activeAddons(p);
        pm = { p, variant_id: vs.length ? vs[0].id : null, addon_ids: [], qty: 1 };
        const has = !!(p.image_url || p.thumb_url);
        $('#pmImgWrap').hidden = !has; if (has) { $('#pmImg').src = SP.img(p.image_url || p.thumb_url, 800, 600); $('#pmImg').alt = p.name; }
        $('#pmName').textContent = p.name;
        $('#pmDesc').textContent = p.description || '';
        $('#pmTags').innerHTML = [p.weight_label ? `<span class="tag tag-weight">${esc(p.weight_label)}</span>` : '', ...(p.flavors || '').split(',').map(f => f.trim()).filter(Boolean).map(f => `<span class="tag">${esc(f)}</span>`)].join('');
        $('#pmVariants').innerHTML = vs.length ? '<p class="opt-title">Escolha uma opção:</p>' + vs.map((v, i) => {
            const pr = SP.priceOf(v.price, v.promo_price);
            return `<label class="opt"><input type="radio" name="pmv" value="${esc(v.id)}" ${i === 0 ? 'checked' : ''}><span>${esc(v.name)}${v.weight_label ? `<small>${esc(v.weight_label)}</small>` : ''}</span><b>${money(pr)}</b></label>`;
        }).join('') : '';
        $('#pmAddons').innerHTML = ads.length ? '<p class="opt-title">Adicionais (opcional):</p>' + ads.map(a => `<label class="opt"><input type="checkbox" name="pma" value="${esc(a.id)}"><span>${esc(a.name)}</span><b>+ ${money(a.price)}</b></label>`).join('') : '';
        updatePM(); openM('mProduct');
    }
    function updatePM() { $('#pmQty').textContent = pm.qty; const r = SP.priceLine(pm.p, pm); $('#pmTotal').textContent = r.ok ? money(r.total) : '—'; $('#pmAdd').disabled = !r.ok; }
    $('#mProduct').addEventListener('change', e => {
        if (e.target.name === 'pmv') pm.variant_id = e.target.value;
        if (e.target.name === 'pma') pm.addon_ids = $$('input[name=pma]:checked').map(i => i.value);
        updatePM();
    });
    $('#pmMinus').onclick = () => { pm.qty = Math.max(1, pm.qty - 1); updatePM(); };
    $('#pmPlus').onclick = () => { pm.qty = Math.min(99, pm.qty + 1); updatePM(); };
    $('#pmAdd').onclick = () => { addToCart(pm.p, pm.variant_id, pm.addon_ids, pm.qty); closeM('mProduct'); };

    // ════════════════════════════════════════════════════════════
    //  CARRINHO
    // ════════════════════════════════════════════════════════════
    function saveCart() { LS.set(K.cart, cart); LS.set(K.cartMeta, cartMeta); }
    function addToCart(p, variant_id, addon_ids, qty) {
        const line = { product_id: p.id, variant_id: variant_id || null, addon_ids: (addon_ids || []).slice().sort(), qty };
        const r = SP.priceLine(p, line); if (!r.ok) { toast(r.error, true); return; }
        line.key = [p.id, line.variant_id || '', line.addon_ids.join('+')].join('|');
        const ex = cart.find(l => l.key === line.key);
        if (ex) ex.qty = Math.min(99, ex.qty + qty); else cart.push(line);
        saveCart(); updateCart(true);
        toast(`✓ ${qty}x ${p.name} adicionado!`);
    }
    const fulfillment = () => (deliveryOn() && $('#checkoutForm').fulfillment.value === 'entrega') ? 'entrega' : 'retirada';
    const calc = f => SP.computeCart(byId, cart, settings, f || 'retirada');
    function updateCart(bump) {
        const n = cart.reduce((s, l) => s + l.qty, 0);
        const bar = $('#cartBar'); bar.hidden = !n; document.body.classList.toggle('has-cart', !!n);
        if (catalog) { $('#cbCount').textContent = n; $('#cbTotal').textContent = money(calc().total); }
        if (bump && n) { bar.classList.remove('bump'); void bar.offsetWidth; bar.classList.add('bump'); }
        markInCart();
    }
    $('#cartBar').onclick = () => { renderCart(); openM('mCart'); };

    function renderCart() {
        if (!cart.length) { $('#cartBody').innerHTML = '<div class="cart-empty"><p>🛒</p><p>Seu carrinho está vazio.</p><button class="btn btn-primary" type="button" data-close>Ver cardápio</button></div>'; return; }
        const t = calc();
        $('#cartBody').innerHTML = t.lines.map(l => `<div class="ci" data-key="${esc(l.line.key)}">
                ${l.product && (l.product.thumb_url || l.product.image_url) ? `<img src="${esc(imgUrl(l.product, 120))}" alt="" width="58" height="58">` : ''}
                <div class="ci-info">
                    <div class="ci-name">${esc(l.product.name)}</div>
                    <div class="ci-meta">${[l.variant && l.variant.name, ...l.addons.map(a => '+ ' + a.name)].filter(Boolean).map(esc).join(' · ')}${l.variant || l.addons.length ? ' · ' : ''}${money(l.unit)} cada</div>
                    <div class="ci-total">${money(l.total)}</div>
                </div>
                <div class="mini-qty"><button type="button" data-q="-1" aria-label="Diminuir">−</button><output>${l.line.qty}</output><button type="button" data-q="1" aria-label="Aumentar">+</button></div>
                <button class="ci-rm" type="button" data-rm aria-label="Remover">🗑</button>
            </div>`).join('')
            + `<label class="tiny muted" for="cartNotes" style="display:block;margin-top:14px;font-weight:700">Observações</label>
               <textarea class="cart-note" id="cartNotes" rows="2" maxlength="1000" placeholder="Ex.: pão fatiado, embalar para presente…">${esc(cartMeta.notes || '')}</textarea>
               <div class="sum-row"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
               <div class="sum-row"><span>${deliveryOn() ? 'Retirada' : 'Retirada no local'}</span><span>Grátis</span></div>
               <div class="sum-row total"><span>Total</span><span>${money(t.total)}</span></div>
               <button class="btn btn-primary btn-block btn-lg" type="button" id="goCheckout" style="margin-top:14px">Finalizar pedido →</button>
               <button class="btn btn-outline btn-block btn-sm" type="button" id="clearCart" style="margin-top:8px">Esvaziar carrinho</button>`;
    }
    $('#mCart').addEventListener('click', e => {
        const row = e.target.closest('.ci');
        if (row) {
            const l = cart.find(x => x.key === row.dataset.key); if (!l) return;
            const q = e.target.closest('[data-q]');
            if (q) { l.qty += Number(q.dataset.q); if (l.qty < 1) cart = cart.filter(x => x !== l); else l.qty = Math.min(99, l.qty); }
            if (e.target.closest('[data-rm]')) cart = cart.filter(x => x !== l);
            if (q || e.target.closest('[data-rm]')) { saveCart(); updateCart(); renderCart(); }
        }
        if (e.target.id === 'goCheckout') openCheckout();
        if (e.target.id === 'clearCart' && confirm('Esvaziar o carrinho?')) { cart = []; saveCart(); updateCart(); renderCart(); }
    });
    $('#mCart').addEventListener('input', e => { if (e.target.id === 'cartNotes') { cartMeta.notes = e.target.value; saveCart(); } });

    // ════════════════════════════════════════════════════════════
    //  FINALIZAR PEDIDO
    // ════════════════════════════════════════════════════════════
    let checkoutRef = null, submitting = false;
    const form = $('#checkoutForm');
    function openCheckout() {
        if (!cart.length) return;
        const pr = LS.get(K.profile, {});
        if (!form.name.value && pr.name) form.name.value = pr.name;
        if (!form.phone.value && pr.phone) form.phone.value = SP.phoneMask(pr.phone);
        if (!form.notes.value && cartMeta.notes) form.notes.value = cartMeta.notes;
        form.date.min = today();
        // Só retirada (padrão): esconde a escolha. Se a dona ativar entrega no painel, aparece.
        $('#fulfillBlock').hidden = !deliveryOn();
        if (!deliveryOn()) $$('input[name=fulfillment]', form).forEach(r => { r.checked = r.value === 'retirada'; });
        else if (!form.fulfillment.value) form.fulfillment.value = 'retirada';
        $('#pickupNote').textContent = [settings.pickup_info || 'Você retira o pedido no local.', settings.address && `📍 ${settings.address}${settings.city ? ' – ' + settings.city : ''}`].filter(Boolean).join('\n');
        $('#coError').hidden = true;
        checkoutRef = checkoutRef || SP.uuid();
        sync(); closeM('mCart'); openM('mCheckout');
    }
    function sync() {
        const f = fulfillment();
        $('#addressBox').hidden = f !== 'entrega';
        $('#changeBox').hidden = form.payment.value !== 'dinheiro';
        renderSummary();
    }
    function renderSummary() {
        const f = fulfillment(), t = calc(f);
        $('#coSummary').innerHTML = t.lines.map(l => `<div class="li"><span>${l.line.qty}x ${esc(l.product.name)}${l.variant ? ` (${esc(l.variant.name)})` : ''}</span><span>${money(l.total)}</span></div>`).join('')
            + (f === 'entrega' ? `<div class="sum-row"><span>Entrega</span><span>${t.feePending ? 'a combinar' : money(t.fee)}</span></div>` : '')
            + `<div class="sum-row total"><span>Total</span><span>${money(t.total)}${t.feePending && f === 'entrega' ? ' + entrega' : ''}</span></div>`;
    }
    form.addEventListener('change', sync);
    form.phone.addEventListener('input', e => { e.target.value = SP.phoneMask(e.target.value); });

    function validate(frm, names) {
        let first = null;
        names.forEach(n => {
            const el = frm[n];
            const bad = n === 'phone' ? SP.digits(el.value).length < 10 : n === 'name' ? el.value.trim().length < 2 : !String(el.value || '').trim();
            el.classList.toggle('invalid', bad); if (bad && !first) first = el;
        });
        return first;
    }
    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (submitting) return;                                   // evita cliques repetidos
        const err = $('#coError'); err.hidden = true;
        const f = fulfillment(), pay = form.payment.value;
        const bad = validate(form, ['name', 'phone'].concat(f === 'entrega' ? ['street', 'number', 'district', 'city'] : []));
        if (bad) { err.textContent = 'Preencha os campos em vermelho.'; err.hidden = false; bad.focus(); return; }
        if (!pay) { err.textContent = 'Escolha a forma de pagamento.'; err.hidden = false; return; }
        if (form.date.value && form.date.value < today()) { err.textContent = SP.ERRORS.INVALID_DATE; err.hidden = false; return; }
        const t = calc(f);
        if (!t.lines.length || t.invalid.length) { err.textContent = SP.ERRORS.INVALID_ITEM; err.hidden = false; return; }
        const payload = {
            client_ref: checkoutRef, kind: 'normal',
            customer: { name: form.name.value.trim(), phone: SP.digits(form.phone.value) },
            fulfillment: f, payment_method: pay, change_for: pay === 'dinheiro' ? form.change.value.trim() : '',
            address: f === 'entrega' ? { street: form.street.value, number: form.number.value, district: form.district.value, city: form.city.value, complement: form.complement.value } : null,
            scheduled_for: form.date.value || null, notes: form.notes.value.trim(),
            items: cart.map(l => ({ product_id: l.product_id, variant_id: l.variant_id, addon_ids: l.addon_ids, qty: l.qty })),
            expected_total: t.total,
        };
        const btn = $('#coSubmit'); submitting = true; btn.disabled = true; btn.textContent = 'Enviando…';
        try {
            const order = await API.createOrder(payload);
            LS.set(K.profile, Object.assign(LS.get(K.profile, {}), { name: payload.customer.name, phone: payload.customer.phone }));
            const mine = LS.get(K.orders, []); if (!mine.some(o => o.ref === order.client_ref)) mine.unshift({ ref: order.client_ref, code: order.code, at: order.created_at }); LS.set(K.orders, mine.slice(0, 30));
            cart = []; cartMeta.notes = ''; saveCart(); updateCart();
            checkoutRef = null; form.notes.value = ''; form.date.value = ''; form.change.value = '';
            closeM('mCheckout'); showDone(order);
        } catch (ex) {
            if (String(ex.message).includes('PRICE_CHANGED')) await loadCatalog(true);
            err.textContent = SP.errorText(ex); err.hidden = false;
        } finally { submitting = false; btn.disabled = false; btn.textContent = 'Confirmar pedido ✓'; }
    });

    // ── Pedido confirmado ────────────────────────────────────
    function showDone(o) {
        const s = settings, msg = SP.orderMessage(o, s);
        let pix = '';
        if (o.payment_method === 'pix') {
            pix = s.pix_key
                ? `<div class="pix-box"><h3>📲 Pague via PIX</h3><p class="tiny muted">Titular: <b>${esc(s.pix_holder || '')}</b></p>${s.pix_city ? '<canvas class="pix-qr" id="pixQr" width="190" height="190"></canvas>' : ''}<div class="pix-key">${esc(s.pix_key)}</div><button class="btn btn-outline btn-sm" type="button" id="copyPix">📋 Copiar chave PIX</button><p style="margin:10px 0 0">Valor: <b>${money(o.total)}</b></p><p class="tiny muted" style="margin:4px 0 0">Depois de pagar, envie o comprovante no WhatsApp.</p></div>`
                : `<div class="pix-box"><h3>📲 Pagamento via PIX</h3><p>Titular: <b>${esc(s.pix_holder || '')}</b></p><p class="tiny muted">Enviaremos a chave PIX pelo WhatsApp.</p></div>`;
        }
        $('#doneBody').innerHTML = `<div class="done-check">✓</div><h2 id="doneTitle">Pedido registrado!</h2>
            <div class="done-code">Pedido ${esc(o.code)}</div>
            <p><b>Último passo:</b> toque no botão verde para enviar o pedido pelo WhatsApp.</p>
            ${s.whatsapp ? `<a class="btn btn-wa btn-block btn-lg" id="sendWa" href="${esc(SP.waLink(s.whatsapp, msg))}" target="_blank" rel="noopener">📱 ENVIAR PEDIDO PELO WHATSAPP</a>` : ''}
            ${pix}
            <div class="co-summary">${o.items.map(i => `<div class="li"><span>${i.qty}x ${esc(SP.itemLabel(i))}</span><span>${money(i.total)}</span></div>`).join('')}
                <div class="sum-row total"><span>Total</span><span>${money(o.total)}${o.delivery_pending ? ' + entrega' : ''}</span></div>
                <div class="li"><span>Recebimento</span><span>${esc(SP.FULFILL_LABEL[o.fulfillment] || '')}</span></div>
                ${o.scheduled_for ? `<div class="li"><span>Data</span><span>${SP.dateBR(o.scheduled_for)}</span></div>` : ''}
                <div class="li"><span>Pagamento</span><span>${esc(SP.PAY_LABEL[o.payment_method] || '')}</span></div></div>
            <button class="btn btn-outline btn-block" type="button" data-close>Voltar ao cardápio</button>`;
        openM('mDone');
        if (o.payment_method === 'pix' && s.pix_key && s.pix_city) drawQR(SP.pixPayload(s.pix_key, s.pix_holder, s.pix_city, o.delivery_pending ? 0 : o.total));
        if ($('#copyPix')) $('#copyPix').onclick = () => (navigator.clipboard ? navigator.clipboard.writeText(s.pix_key) : Promise.reject()).then(() => toast('Chave PIX copiada!')).catch(() => prompt('Copie a chave:', s.pix_key));
    }
    function drawQR(text) {
        const draw = () => {
            const cv = $('#pixQr'); if (!cv || !window.qrcode) return;
            const qr = window.qrcode(0, 'M'); qr.addData(text); qr.make();
            const n = qr.getModuleCount(), size = 190, cell = Math.floor(size / (n + 4)), off = Math.floor((size - cell * n) / 2), ctx = cv.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size); ctx.fillStyle = '#4a2c21';
            for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(off + c * cell, off + r * cell, cell, cell);
        };
        if (window.qrcode) return draw();
        const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'; sc.onload = draw; document.head.appendChild(sc);
    }

    // ════════════════════════════════════════════════════════════
    //  RECHEIO DO SEU JEITO
    // ════════════════════════════════════════════════════════════
    let customProduct = null, customRef = null, customSending = false;
    function openCustom(p) {
        customProduct = p; customRef = customRef || SP.uuid();
        const f = $('#customForm'), pr = LS.get(K.profile, {});
        $('#cmTitle').textContent = p.name;
        const has = !!(p.image_url || p.thumb_url); $('#cmImgWrap').hidden = !has; if (has) $('#cmImg').src = SP.img(p.image_url || p.thumb_url, 800, 400);
        if (!f.name.value && pr.name) f.name.value = pr.name;
        if (!f.phone.value && pr.phone) f.phone.value = SP.phoneMask(pr.phone);
        f.date.min = today();
        openM('mCustom');
    }
    $('#customForm').phone.addEventListener('input', e => { e.target.value = SP.phoneMask(e.target.value); });
    $('#customForm').addEventListener('submit', async e => {
        e.preventDefault();
        if (customSending) return;
        const f = e.target, qty = parseInt(f.qty.value, 10);
        const bad = validate(f, ['filling', 'name', 'phone']);
        if (bad || !(qty >= 1 && qty <= 500)) { toast('Preencha o recheio, a quantidade, seu nome e WhatsApp.', true); (bad || f.qty).focus(); return; }
        if (!settings.whatsapp) { toast('WhatsApp da loja não configurado.', true); return; }
        const c = { filling: f.filling.value.trim(), ingredients: f.ingredients.value.trim(), notes: f.notes.value.trim(), qty, name: f.name.value.trim() };
        const dateNote = f.date.value ? `Para o dia ${SP.dateBR(f.date.value)}` : '';
        const win = window.open('', '_blank');                  // abre já no toque (evita bloqueio)
        customSending = true; const btn = $('#cmSubmit'); btn.disabled = true; btn.textContent = 'Enviando…';
        let code = '';
        try {
            const o = await API.createOrder({ client_ref: customRef, kind: 'personalizado', fulfillment: 'retirada', customer: { name: c.name, phone: SP.digits(f.phone.value) }, scheduled_for: f.date.value || null, notes: dateNote,
                custom: { product_id: customProduct.id, filling: c.filling, ingredients: c.ingredients, notes: c.notes, qty } });
            code = o.code;
            const mine = LS.get(K.orders, []); if (!mine.some(x => x.ref === o.client_ref)) mine.unshift({ ref: o.client_ref, code: o.code, at: o.created_at }); LS.set(K.orders, mine.slice(0, 30));
            LS.set(K.profile, Object.assign(LS.get(K.profile, {}), { name: c.name, phone: SP.digits(f.phone.value) }));
            customRef = null; f.filling.value = f.ingredients.value = f.notes.value = ''; f.qty.value = 1; f.date.value = '';
        } catch (ex) { console.warn(ex); }
        finally { customSending = false; btn.disabled = false; btn.textContent = 'CONSULTAR PELO WHATSAPP'; }
        const link = SP.waLink(settings.whatsapp, SP.customMessage({ ...c, notes: [c.notes, dateNote].filter(Boolean).join(' — '), code }));
        if (win && !win.closed) win.location.href = link; else location.href = link;
        closeM('mCustom');
        if (code) toast(`Pedido ${code} enviado! Aguarde nossa resposta com o valor.`);
    });

    // ════════════════════════════════════════════════════════════
    //  MEUS PEDIDOS / MEUS DADOS
    // ════════════════════════════════════════════════════════════
    $('#btnOrders').onclick = async () => {
        const mine = LS.get(K.orders, []), body = $('#ordersBody');
        openM('mOrders');
        if (!mine.length) { body.innerHTML = '<div class="cart-empty"><p>📦</p><p>Você ainda não fez pedidos neste celular.</p></div>'; return; }
        body.innerHTML = '<div class="sk"></div>';
        try {
            const list = await API.trackOrders(mine.map(m => m.ref));
            body.innerHTML = list.map(o => {
                const st = SP.STATUS[o.status] || { label: o.status, tone: '' };
                return `<div class="track"><div class="track-head"><b>${esc(o.code)}</b><span class="st st-${st.tone}">${esc(st.label)}</span></div>
                    <div class="track-items">${(o.items || []).map(i => `${i.qty}x ${esc(i.name)}`).join(', ')}</div>
                    <div class="track-head tiny muted"><span>${SP.dateTimeBR(o.created_at)}${o.scheduled_for ? ` · para ${SP.dateBR(o.scheduled_for)}` : ''}</span><b>${o.total != null ? money(o.total) : 'aguardando valor'}</b></div></div>`;
            }).join('') || '<p class="muted">Nenhum pedido encontrado.</p>';
        } catch (e) { body.innerHTML = '<p class="muted">Não foi possível consultar agora. Tente de novo em instantes.</p>'; }
    };
    $('#btnAccount').onclick = () => { const f = $('#accountForm'), pr = LS.get(K.profile, {}); f.name.value = pr.name || ''; f.phone.value = pr.phone ? SP.phoneMask(pr.phone) : ''; openM('mAccount'); };
    $('#accountForm').phone.addEventListener('input', e => { e.target.value = SP.phoneMask(e.target.value); });
    $('#accountForm').addEventListener('submit', e => { e.preventDefault(); LS.set(K.profile, { name: e.target.name.value.trim(), phone: SP.digits(e.target.phone.value) }); closeM('mAccount'); toast('Dados salvos!'); });
    $('#accClear').onclick = () => { LS.del(K.profile); $('#accountForm').reset(); toast('Dados apagados deste celular.'); };

    // Acesso ao painel: 5 toques no nome da loja (igual ao sistema anterior)
    let taps = 0, tapT;
    $('#brand').addEventListener('click', () => { taps++; clearTimeout(tapT); if (taps >= 5) { taps = 0; location.href = 'admin.html'; } else tapT = setTimeout(() => { taps = 0; }, 1800); });

    updateCart();
    loadCatalog();
    window.SPStore = { reload: () => loadCatalog(true), state: () => ({ catalog, cart, settings }) };
})();
