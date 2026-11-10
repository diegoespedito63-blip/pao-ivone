/**
 * Sabor de Pão — Camada de dados.
 *  • Modo "supabase": banco real (preços validados no servidor, RLS, Storage).
 *  • Modo "demo": banco local no navegador, com as mesmas regras, para testes
 *    enquanto o Supabase não estiver configurado.
 */
(function () {
    'use strict';
    const SP = window.SP;
    const cfg = Object.assign({}, window.SP_CONFIG || {});
    cfg.SUPABASE_URL = String(cfg.SUPABASE_URL || '').trim(); cfg.SUPABASE_ANON_KEY = String(cfg.SUPABASE_ANON_KEY || '').trim();
    // Proteção: se o endereço e a chave forem colados trocados no config.js, destroca sozinho.
    if (!/^https?:\/\//i.test(cfg.SUPABASE_URL) && /^https?:\/\//i.test(cfg.SUPABASE_ANON_KEY)) {
        [cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY] = [cfg.SUPABASE_ANON_KEY, cfg.SUPABASE_URL];
        console.warn('config.js: SUPABASE_URL e SUPABASE_ANON_KEY estavam trocados — corrigido automaticamente.');
    }
    const LIVE = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
    const API = { mode: LIVE ? 'supabase' : 'demo' };

    const loadScript = src => new Promise((res, rej) => {
        if (document.querySelector(`script[data-src="${src}"]`)) return res();
        const s = document.createElement('script'); s.src = src; s.dataset.src = src; s.onload = res; s.onerror = () => rej(new Error('Falha ao carregar ' + src));
        document.head.appendChild(s);
    });

    // ════════════════════════════════════════════════════════════
    //  SUPABASE
    // ════════════════════════════════════════════════════════════
    const BASE = (cfg.SUPABASE_URL || '').replace(/\/$/, '');
    async function rpc(fn, body, token) {
        const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 15000);
        try {
            // Chave antiga (anon, começa com "eyJ") vai também no Authorization.
            // Chave nova do Supabase (sb_publishable_...) vai só no apikey — no Authorization ela é recusada.
            const headers = { apikey: cfg.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
            const bearer = token || (String(cfg.SUPABASE_ANON_KEY).startsWith('eyJ') ? cfg.SUPABASE_ANON_KEY : '');
            if (bearer) headers.Authorization = `Bearer ${bearer}`;
            let r;
            try { r = await fetch(`${BASE}/rest/v1/rpc/${fn}`, { method: 'POST', signal: ctrl.signal, headers, body: JSON.stringify(body || {}) }); }
            catch (e) { const er = new Error(`Sem resposta do Supabase (${BASE || 'URL vazia'}). Confira a internet e o SUPABASE_URL no config.js.`); er.diag = true; throw er; }
            const txt = await r.text(); let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (_) { }
            if (!r.ok) {
                const msg = (data && (data.message || data.hint)) || `HTTP ${r.status}`;
                const e = new Error(msg); e.detail = data && data.details; e.status = r.status;
                if (r.status === 401 || /api key|apikey|JWT/i.test(msg)) e.diag = `Chave do Supabase recusada (${r.status}). Confira o SUPABASE_ANON_KEY no config.js.`;
                else if (r.status === 404 || /Could not find the function/i.test(msg)) e.diag = `O banco ainda não foi preparado: rode o schema.sql e o seed.sql no SQL Editor do Supabase. (${msg})`;
                throw e;
            }
            return data;
        } finally { clearTimeout(to); }
    }

    let sb = null;
    async function client() {
        if (sb) return sb;
        await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js');
        sb = window.supabase.createClient(BASE, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'sp_admin_auth' } });
        return sb;
    }
    const chk = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

    const live = {
        getCatalog: () => rpc('get_catalog'),
        createOrder: p => rpc('create_order', { p }),
        trackOrders: refs => rpc('track_orders', { refs }),
        registerCustomer: p => rpc('register_customer', { p }),
        async listCustomers() { const c = await client(); return chk(await c.rpc('admin_list_customers')) || []; },
        async saveCustomerNotes(phone, notes) { const c = await client(); chk(await c.from('customers').update({ notes }).eq('phone', phone)); },
        async deleteCustomer(phone) { const c = await client(); chk(await c.from('customers').delete().eq('phone', phone)); },

        async signIn(email, password) {
            const c = await client();
            chk(await c.auth.signInWithPassword({ email, password }));
            if (!(await live.isAdmin())) { await c.auth.signOut(); throw new Error('Este usuário não é administrador da loja.'); }
            return true;
        },
        async signOut() { const c = await client(); await c.auth.signOut(); },
        async session() { const c = await client(); const { data } = await c.auth.getSession(); return data.session && (await live.isAdmin()) ? data.session : null; },
        async isAdmin() { const c = await client(); const { data } = await c.rpc('is_admin'); return data === true; },
        async changePassword(pw) { const c = await client(); chk(await c.auth.updateUser({ password: pw })); },
        async userEmail() { const c = await client(); const { data } = await c.auth.getUser(); return data.user ? data.user.email : ''; },

        async listCategories() { const c = await client(); return chk(await c.from('categories').select('*').order('sort_order').order('name')); },
        async saveCategory(cat) {
            const c = await client(); const row = { name: cat.name, description: cat.description || '', image_url: cat.image_url || '', sort_order: cat.sort_order || 0, active: cat.active !== false };
            return cat.id ? chk(await c.from('categories').update(row).eq('id', cat.id).select().single()) : chk(await c.from('categories').insert(row).select().single());
        },
        async deleteCategory(id) { const c = await client(); chk(await c.from('categories').delete().eq('id', id)); },
        async listProducts() { const c = await client(); return chk(await c.from('products').select('*').order('sort_order').order('name')); },
        async saveProduct(p) {
            const c = await client();
            const row = {}; PRODUCT_FIELDS.forEach(k => { if (k in p) row[k] = p[k]; });
            return p.id ? chk(await c.from('products').update(row).eq('id', p.id).select().single()) : chk(await c.from('products').insert(row).select().single());
        },
        async deleteProduct(id) { const c = await client(); chk(await c.from('products').delete().eq('id', id)); },
        async reorder(table, rows) {
            const c = await client();
            await Promise.all(rows.map(r => c.from(table).update({ sort_order: r.sort_order }).eq('id', r.id).then(chk)));
        },
        async getSettings() { const c = await client(); return chk(await c.from('settings').select('data').eq('id', 1).single()).data || {}; },
        async saveSettings(data) { const c = await client(); chk(await c.from('settings').update({ data }).eq('id', 1)); },
        async listOrders({ statuses, limit = 300 } = {}) {
            const c = await client(); let qy = c.from('orders').select('*').order('created_at', { ascending: false }).limit(limit);
            if (statuses && statuses.length) qy = qy.in('status', statuses);
            return chk(await qy);
        },
        async setStatus(id, status, note) { const c = await client(); return chk(await c.rpc('admin_set_status', { p_order: id, p_status: status, p_note: note || '' })); },
        async setQuote(id, unitPrice, fee, note) { const c = await client(); return chk(await c.rpc('admin_set_quote', { p_order: id, p_unit_price: unitPrice, p_delivery_fee: fee || 0, p_note: note || '' })); },
        async uploadImage(blob, path) {
            const c = await client();
            chk(await c.storage.from('imagens').upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false }));
            return { path, url: c.storage.from('imagens').getPublicUrl(path).data.publicUrl };
        },
        async deleteImages(paths) { paths = (paths || []).filter(Boolean); if (!paths.length) return; const c = await client(); chk(await c.storage.from('imagens').remove(paths)); },
    };

    const PRODUCT_FIELDS = ['category_id', 'name', 'description', 'flavors', 'image_url', 'image_path', 'thumb_url', 'thumb_path', 'price_mode', 'price', 'promo_price',
        'unit', 'weight_label', 'variants', 'addons', 'featured', 'active', 'sort_order'];

    // ════════════════════════════════════════════════════════════
    //  DEMONSTRAÇÃO (localStorage) — mesmas regras do servidor
    // ════════════════════════════════════════════════════════════
    const DKEY = 'sp_demo_db_v1';
    const now = () => new Date().toISOString();
    const clone = o => JSON.parse(JSON.stringify(o));
    async function dload() {
        let db = null; try { db = JSON.parse(localStorage.getItem(DKEY) || 'null'); } catch (_) { }
        if (db) { db.customers = db.customers || []; return db; }
        if (!window.SP_SEED) {
            try { await loadScript('seed.js?v=20261110d'); }
            catch (e) { const er = new Error('Modo demonstração: o arquivo seed.js não foi encontrado. Ele precisa estar na mesma pasta do index.html.'); er.diag = er.message; throw er; }
        }
        const S = window.SP_SEED; const cats = {};
        db = { version: 1, seq: 1001, admin_pass: '1234', orders: [], customers: [], settings: clone(S.settings), categories: [], products: [] };
        S.categories.forEach(c => { const id = SP.uuid(); cats[c.slug] = id; db.categories.push({ id, slug: c.slug, name: c.name, description: c.description, image_url: c.image_url, sort_order: c.sort_order, active: true, created_at: now(), updated_at: now() }); });
        S.products.forEach(p => { const r = clone(p); r.id = SP.uuid(); r.category_id = cats[p.category]; delete r.category; r.thumb_url = ''; r.created_at = r.updated_at = now(); db.products.push(r); });
        dsave(db); return db;
    }
    function dsave(db) {
        try { localStorage.setItem(DKEY, JSON.stringify(db)); }
        catch (e) { throw new Error('Armazenamento do navegador cheio (modo demonstração). Use imagens menores ou configure o Supabase.'); }
    }
    const bump = db => { db.version++; };
    const fail = code => { throw new Error(code); };
    let demoAuthed = sessionStorage.getItem('sp_demo_admin') === '1';
    const needAdmin = () => { if (!demoAuthed) fail('NOT_ADMIN'); };

    function demoCatalog(db) {
        const cats = db.categories.filter(c => c.active).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
        const catIdx = Object.fromEntries(cats.map((c, i) => [c.id, i]));
        const prods = db.products.filter(p => p.active && p.category_id in catIdx)
            .sort((a, b) => catIdx[a.category_id] - catIdx[b.category_id] || a.sort_order - b.sort_order || a.name.localeCompare(b.name))
            .map(p => ({ ...clone(p), variants: SP.activeVariants(p), addons: SP.activeAddons(p) }));
        const cutoff = Date.now() - 120 * 864e5, count = {};
        db.orders.filter(o => o.kind === 'normal' && o.status !== 'cancelado' && Date.parse(o.created_at) > cutoff)
            .forEach(o => o.items.forEach(i => { count[i.product_id] = (count[i.product_id] || 0) + i.qty; }));
        const best = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 6).map(e => e[0]);
        return { version: db.version, settings: clone(db.settings), categories: cats.map(c => clone(c)), products: prods, best_sellers: best };
    }

    function demoUpsertCustomer(db, phone, name, origin) {
        const c = db.customers.find(x => x.phone === phone);
        if (c) { c.name = name; c.updated_at = now(); }
        else db.customers.push({ phone, name, origin, notes: '', created_at: now(), updated_at: now() });
    }
    function demoCreateOrder(db, p) {
        const ex = db.orders.find(o => o.client_ref === p.client_ref);
        if (ex) return { ...clone(ex), duplicate: true };
        if (!p.client_ref) fail('INVALID_REQUEST');
        const name = String((p.customer && p.customer.name) || '').trim(), phone = SP.digits(p.customer && p.customer.phone);
        if (name.length < 2 || phone.length < 10 || phone.length > 13) fail('INVALID_CUSTOMER');
        if (db.orders.filter(o => o.customer_phone === phone && Date.now() - Date.parse(o.created_at) < 6e5).length >= 6) fail('TOO_MANY_ORDERS');
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (p.scheduled_for) { const d = new Date(p.scheduled_for + 'T00:00:00'); if (isNaN(d) || d < today || d - today > 120 * 864e5) fail('INVALID_DATE'); }
        const base = { id: SP.uuid(), code: 'SP' + (db.seq++), client_ref: p.client_ref, customer_name: name, customer_phone: phone, scheduled_for: p.scheduled_for || null, notes: String(p.notes || '').slice(0, 1000), created_at: now(), updated_at: now() };

        if (p.kind === 'personalizado') {
            const c = p.custom || {}; const prod = db.products.find(x => x.id === c.product_id && x.active && SP.isQuote(x));
            const qty = parseInt(c.qty, 10);
            if (!prod || !(qty >= 1 && qty <= 500) || String(c.filling || '').trim().length < 2) fail('INVALID_ITEM');
            const o = { ...base, kind: 'personalizado', status: 'aguardando_orcamento', fulfillment: ['entrega', 'retirada'].includes(p.fulfillment) ? p.fulfillment : null, address: null, payment_method: null, change_for: '',
                items: [{ product_id: prod.id, name: prod.name, variant_id: null, variant_name: null, weight_label: prod.weight_label, addons: [], qty, unit_price: null, total: null,
                    custom: { filling: String(c.filling).trim().slice(0, 300), ingredients: String(c.ingredients || '').trim().slice(0, 500), notes: String(c.notes || '').trim().slice(0, 500) } }],
                subtotal: null, delivery_fee: null, delivery_pending: false, total: null, status_history: [{ status: 'aguardando_orcamento', at: now() }] };
            demoUpsertCustomer(db, phone, name, 'pedido');
            db.orders.unshift(o); dsave(db); return clone(o);
        }

        const s = db.settings;
        if (!['entrega', 'retirada'].includes(p.fulfillment)) fail('INVALID_FULFILLMENT');
        if ((p.fulfillment === 'entrega' && s.delivery_enabled === false) || (p.fulfillment === 'retirada' && s.pickup_enabled === false)) fail('INVALID_FULFILLMENT');
        if (!SP.PAY_LABEL[p.payment_method]) fail('INVALID_PAYMENT');
        let address = null;
        if (p.fulfillment === 'entrega') {
            const a = p.address || {}; address = {};
            ['street', 'number', 'complement', 'district', 'city', 'reference'].forEach(k => { address[k] = String(a[k] || '').trim().slice(0, 150); });
            if (!address.street || !address.number || !address.district || !address.city) fail('INVALID_ADDRESS');
        }
        if (!Array.isArray(p.items) || !p.items.length) fail('EMPTY_ORDER');
        const activeCats = new Set(db.categories.filter(c => c.active).map(c => c.id));
        const items = p.items.map(it => {
            const prod = db.products.find(x => x.id === it.product_id && x.active && activeCats.has(x.category_id));
            if (!prod) fail('INVALID_ITEM');
            if (SP.isQuote(prod)) fail('QUOTE_PRODUCT');
            const r = SP.priceLine(prod, it); if (!r.ok) fail('INVALID_ITEM');
            return { product_id: prod.id, name: prod.name, variant_id: r.variant ? r.variant.id : null, variant_name: r.variant ? r.variant.name : null,
                weight_label: (r.variant && r.variant.weight_label) || prod.weight_label, unit: prod.unit,
                addons: r.addons.map(a => ({ id: a.id, name: a.name, price: Number(a.price) })), qty: parseInt(it.qty, 10), unit_price: r.unit, total: r.total };
        });
        const subtotal = SP.round2(items.reduce((t, i) => t + i.total, 0));
        const fee = SP.deliveryFee(s, p.fulfillment);
        const total = SP.round2(subtotal + (fee || 0));
        if (typeof p.expected_total === 'number' && Math.abs(p.expected_total - total) > 0.009) fail('PRICE_CHANGED');
        const o = { ...base, kind: 'normal', status: 'pendente', fulfillment: p.fulfillment, address, payment_method: p.payment_method,
            change_for: p.payment_method === 'dinheiro' ? String(p.change_for || '').slice(0, 30) : '', items, subtotal, delivery_fee: fee,
            delivery_pending: fee === null, total, status_history: [{ status: 'pendente', at: now() }] };
        demoUpsertCustomer(db, phone, name, 'pedido');
        db.orders.unshift(o); dsave(db); return clone(o);
    }

    const delay = v => new Promise(r => setTimeout(() => r(v), 30));
    const demo = {
        async getCatalog() { return delay(demoCatalog(await dload())); },
        async createOrder(p) { return delay(demoCreateOrder(await dload(), p)); },
        async trackOrders(refs) {
            const db = await dload();
            return db.orders.filter(o => refs.includes(o.client_ref)).map(o => ({ client_ref: o.client_ref, code: o.code, kind: o.kind, status: o.status, fulfillment: o.fulfillment, scheduled_for: o.scheduled_for,
                total: o.total, subtotal: o.subtotal, delivery_fee: o.delivery_fee, delivery_pending: o.delivery_pending, created_at: o.created_at, updated_at: o.updated_at,
                items: o.items.map(i => ({ name: i.name, variant_name: i.variant_name, qty: i.qty, unit_price: i.unit_price, total: i.total })) }));
        },
        async registerCustomer(p) {
            const db = await dload(), name = String(p.name || '').trim(), phone = SP.digits(p.phone);
            if (name.length < 2 || name.length > 100 || phone.length < 10 || phone.length > 13) fail('INVALID_CUSTOMER');
            demoUpsertCustomer(db, phone, name, 'cadastro'); dsave(db); return delay({ ok: true, name, phone });
        },
        async listCustomers() {
            needAdmin(); const db = await dload();
            return db.customers.map(c => {
                const os = db.orders.filter(o => o.customer_phone === c.phone && o.status !== 'cancelado');
                const last = os.map(o => o.created_at).sort().pop() || null;
                return { ...clone(c), orders_count: os.length, total_spent: SP.round2(os.reduce((t, o) => t + (o.total || 0), 0)), last_order_at: last };
            }).sort((a, b) => String(b.last_order_at || b.created_at).localeCompare(String(a.last_order_at || a.created_at)));
        },
        async saveCustomerNotes(phone, notes) { needAdmin(); const db = await dload(); const c = db.customers.find(x => x.phone === phone); if (c) { c.notes = String(notes || '').slice(0, 500); dsave(db); } },
        async deleteCustomer(phone) { needAdmin(); const db = await dload(); db.customers = db.customers.filter(x => x.phone !== phone); dsave(db); },
        async signIn(_email, password) {
            const db = await dload();
            if (password !== db.admin_pass) throw new Error('Senha incorreta.');
            demoAuthed = true; sessionStorage.setItem('sp_demo_admin', '1'); return true;
        },
        async signOut() { demoAuthed = false; sessionStorage.removeItem('sp_demo_admin'); },
        async session() { return demoAuthed ? { demo: true } : null; },
        async changePassword(pw) { needAdmin(); const db = await dload(); db.admin_pass = pw; dsave(db); },
        async userEmail() { return 'modo demonstração'; },
        async listCategories() { needAdmin(); const db = await dload(); return clone(db.categories).sort((a, b) => a.sort_order - b.sort_order); },
        async saveCategory(c) {
            needAdmin(); const db = await dload();
            if (!String(c.name || '').trim()) fail('INVALID_REQUEST');
            let row = c.id && db.categories.find(x => x.id === c.id);
            if (!row) { row = { id: SP.uuid(), slug: null, created_at: now() }; db.categories.push(row); }
            Object.assign(row, { name: c.name.trim(), description: c.description || '', image_url: c.image_url || '', sort_order: c.sort_order || 0, active: c.active !== false, updated_at: now() });
            bump(db); dsave(db); return clone(row);
        },
        async deleteCategory(id) {
            needAdmin(); const db = await dload();
            db.categories = db.categories.filter(c => c.id !== id); db.products.forEach(p => { if (p.category_id === id) p.category_id = null; });
            bump(db); dsave(db);
        },
        async listProducts() { needAdmin(); const db = await dload(); return clone(db.products).sort((a, b) => a.sort_order - b.sort_order); },
        async saveProduct(p) {
            needAdmin(); const db = await dload();
            const existing = p.id && db.products.find(x => x.id === p.id);
            const m = Object.assign({ variants: [], addons: [] }, existing ? clone(existing) : {}, clone(p));   // valida o resultado final
            if (!String(m.name || '').trim()) fail('INVALID_REQUEST');
            if (m.price_mode !== 'quote') {
                const vs = m.variants || [];
                if (vs.length) { if (vs.some(v => !v.name || !(Number(v.price) > 0))) throw new Error('INVALID_VARIANT: preço da variação deve ser maior que zero'); }
                else if (!(Number(m.price) > 0)) throw new Error('INVALID_REQUEST: preço deve ser maior que zero');
            }
            if ((m.addons || []).some(a => !a.name || !(Number(a.price) >= 0))) throw new Error('INVALID_ADDON');
            let row = existing;
            if (!row) { row = { id: SP.uuid(), created_at: now() }; db.products.push(row); }
            PRODUCT_FIELDS.forEach(k => { if (k in m) row[k] = m[k]; });
            if (row.price_mode === 'quote') row.promo_price = null;
            row.updated_at = now(); bump(db); dsave(db); return clone(row);
        },
        async deleteProduct(id) { needAdmin(); const db = await dload(); db.products = db.products.filter(p => p.id !== id); bump(db); dsave(db); },
        async reorder(table, rows) {
            needAdmin(); const db = await dload(); const list = db[table];
            rows.forEach(r => { const x = list.find(i => i.id === r.id); if (x) x.sort_order = r.sort_order; });
            bump(db); dsave(db);
        },
        async getSettings() { needAdmin(); return clone((await dload()).settings); },
        async saveSettings(data) {
            needAdmin(); const db = await dload();
            if (data.delivery_fee !== null && (typeof data.delivery_fee !== 'number' || data.delivery_fee < 0)) throw new Error('INVALID_SETTINGS');
            db.settings = clone(data); bump(db); dsave(db);
        },
        async listOrders({ statuses } = {}) { needAdmin(); const db = await dload(); return clone(db.orders.filter(o => !statuses || !statuses.length || statuses.includes(o.status))); },
        async setStatus(id, status, note) {
            needAdmin(); const db = await dload(); const o = db.orders.find(x => x.id === id); if (!o) fail('INVALID_REQUEST');
            if (!SP.STATUS[status]) fail('INVALID_REQUEST');
            if (!['cancelado', 'aguardando_orcamento'].includes(status) && o.total == null) fail('QUOTE_REQUIRED');
            o.status = status; o.updated_at = now(); o.status_history.push({ status, at: now(), note: note || '' }); dsave(db); return clone(o);
        },
        async setQuote(id, unitPrice, fee, note) {
            needAdmin(); const db = await dload(); const o = db.orders.find(x => x.id === id);
            if (!o || o.kind !== 'personalizado' || ['cancelado', 'concluido'].includes(o.status)) fail('INVALID_REQUEST');
            unitPrice = SP.round2(unitPrice); fee = SP.round2(fee || 0);
            if (!(unitPrice > 0) || fee < 0) throw new Error('INVALID_REQUEST: valor deve ser maior que zero');
            const it = o.items[0]; it.unit_price = unitPrice; it.total = SP.round2(unitPrice * it.qty);
            o.subtotal = it.total; o.delivery_fee = fee; o.delivery_pending = false; o.total = SP.round2(o.subtotal + fee);
            if (o.status === 'aguardando_orcamento') o.status = 'confirmado';
            o.status_history.push({ status: 'confirmado', at: now(), note: `Valor confirmado: ${unitPrice.toFixed(2)}${note ? ' — ' + note : ''}` });
            o.updated_at = now(); dsave(db); return clone(o);
        },
        async uploadImage(blob, path) {
            needAdmin();
            const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
            return { path, url };
        },
        async deleteImages() { },
    };

    Object.assign(API, LIVE ? live : demo);
    window.SPApi = API;
})();
