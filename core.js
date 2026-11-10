/**
 * Sabor de Pão — núcleo compartilhado (loja, painel e testes).
 * Regras de preço, formatação, mensagens de WhatsApp e PIX.
 * As MESMAS regras de preço são reaplicadas no banco (função create_order),
 * que é quem decide o valor final do pedido.
 */
(function (root) {
    'use strict';
    const SP = {};

    // ── Formatação ────────────────────────────────────────────
    SP.round2 = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
    SP.money = v => {
        if (v === null || v === undefined || v === '' || isNaN(v)) return '';
        const [i, d] = SP.round2(v).toFixed(2).split('.');
        return 'R$ ' + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d;
    };
    SP.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    SP.norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    SP.digits = s => String(s || '').replace(/\D/g, '');
    SP.uid = (p = '') => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
    SP.uuid = () => (root.crypto && root.crypto.randomUUID) ? root.crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
    SP.phoneMask = v => {
        const d = SP.digits(v).slice(0, 11);
        if (d.length <= 2) return d;
        if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
        if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
        return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    };
    SP.dateBR = iso => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
    SP.dateTimeBR = iso => iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';

    // ── Imagens: tamanhos adequados para cada uso ─────────────
    // Unsplash: redimensiona e entrega WebP/AVIF automaticamente (auto=format).
    // Supabase Storage: o painel já grava versão grande (-lg) e miniatura (-sm).
    SP.img = (url, w, h) => {
        if (!url) return '';
        if (url.includes('images.unsplash.com')) {
            const base = url.split('?')[0];
            return `${base}?auto=format&fit=crop&w=${w}${h ? `&h=${h}` : ''}&q=${w > 500 ? 60 : 65}`;
        }
        return url;
    };

    // ── Preços ────────────────────────────────────────────────
    const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);
    SP.priceOf = (base, promo) => {
        base = num(base); promo = num(promo);
        if (base === null) return null;
        return (promo !== null && promo > 0 && promo < base) ? promo : base;
    };
    SP.activeVariants = p => (p.variants || []).filter(v => v && v.active !== false);
    SP.activeAddons = p => (p.addons || []).filter(a => a && a.active !== false);
    SP.isQuote = p => p && p.price_mode === 'quote';
    SP.hasPromo = p => {
        if (SP.isQuote(p)) return false;
        const vs = SP.activeVariants(p);
        if (vs.length) return vs.some(v => SP.priceOf(v.price, v.promo_price) < num(v.price));
        return SP.priceOf(p.price, p.promo_price) < num(p.price);
    };
    /** Menor preço exibível do produto ({price, original}) ou null quando é "consultar". */
    SP.displayPrice = p => {
        if (SP.isQuote(p)) return null;
        const vs = SP.activeVariants(p);
        if (vs.length) {
            let best = null;
            vs.forEach(v => { const pr = SP.priceOf(v.price, v.promo_price); if (pr !== null && (!best || pr < best.price)) best = { price: pr, original: num(v.price), from: vs.length > 1 }; });
            return best;
        }
        const pr = SP.priceOf(p.price, p.promo_price);
        return pr === null ? null : { price: pr, original: num(p.price), from: false };
    };
    /**
     * Calcula uma linha do carrinho a partir do catálogo ATUAL.
     * O carrinho guarda apenas referências (produto, variação, adicionais, quantidade);
     * o preço sempre vem do catálogo mais recente.
     */
    SP.priceLine = (product, line) => {
        const out = { ok: false, error: '', unit: 0, total: 0, variant: null, addons: [] };
        if (!product) { out.error = 'Produto indisponível'; return out; }
        if (SP.isQuote(product)) { out.error = 'Produto sob consulta'; return out; }
        const qty = parseInt(line.qty, 10);
        if (!(qty >= 1 && qty <= 99)) { out.error = 'Quantidade inválida'; return out; }
        let unit;
        const vs = SP.activeVariants(product);
        if (vs.length) {
            const v = vs.find(x => x.id === line.variant_id);
            if (!v) { out.error = 'Opção indisponível'; return out; }
            out.variant = v; unit = SP.priceOf(v.price, v.promo_price);
        } else {
            unit = SP.priceOf(product.price, product.promo_price);
        }
        if (!(unit > 0)) { out.error = 'Preço indisponível'; return out; }
        const ads = SP.activeAddons(product);
        for (const id of (line.addon_ids || [])) {
            const a = ads.find(x => x.id === id);
            if (!a) { out.error = 'Adicional indisponível'; return out; }
            out.addons.push(a); unit += Number(a.price) || 0;
        }
        out.unit = SP.round2(unit); out.total = SP.round2(out.unit * qty); out.ok = true;
        return out;
    };
    /** Taxa de entrega: null = "a combinar" (não configurada). */
    SP.deliveryFee = (settings, fulfillment) => {
        if (fulfillment !== 'entrega') return 0;
        const f = num(settings && settings.delivery_fee);
        return f === null || f < 0 ? null : SP.round2(f);
    };
    SP.computeCart = (productsById, cart, settings, fulfillment) => {
        const lines = cart.map(l => ({ line: l, product: productsById[l.product_id], ...SP.priceLine(productsById[l.product_id], l) }));
        const valid = lines.filter(l => l.ok);
        const subtotal = SP.round2(valid.reduce((s, l) => s + l.total, 0));
        const fee = SP.deliveryFee(settings, fulfillment);
        return { lines, subtotal, fee, feePending: fee === null, total: SP.round2(subtotal + (fee || 0)), invalid: lines.filter(l => !l.ok) };
    };

    // ── Horário de funcionamento ─────────────────────────────
    SP.DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    SP.hoursConfigured = hours => Array.isArray(hours) && hours.some(h => h && (h.closed || (h.open && h.close)));
    SP.isOpenNow = (hours, now = new Date()) => {
        if (!SP.hoursConfigured(hours)) return null;
        const h = hours.find(x => Number(x.d) === now.getDay());
        if (!h || h.closed || !h.open || !h.close) return false;
        const t = now.getHours() * 60 + now.getMinutes();
        const m = s => { const [a, b] = s.split(':').map(Number); return a * 60 + (b || 0); };
        return t >= m(h.open) && t < m(h.close);
    };

    // ── WhatsApp ──────────────────────────────────────────────
    SP.waNumber = s => { let d = SP.digits(s); if (d.length === 10 || d.length === 11) d = '55' + d; return d; };
    SP.waLink = (phone, text) => `https://wa.me/${SP.waNumber(phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
    SP.PAY_LABEL = { pix: 'PIX', dinheiro: 'Dinheiro', debito: 'Cartão de débito', credito: 'Cartão de crédito' };
    SP.FULFILL_LABEL = { entrega: 'Entrega', retirada: 'Retirada no local' };
    SP.addressText = a => {
        if (!a) return '';
        return [
            [a.street, a.number].filter(Boolean).join(', '),
            a.complement, a.district, a.city
        ].filter(Boolean).join(' – ') + (a.reference ? ` (Ref.: ${a.reference})` : '');
    };
    SP.itemLabel = it => it.name + (it.variant_name ? ` (${it.variant_name})` : '') + (it.weight_label && !String(it.name + (it.variant_name || '')).includes(it.weight_label) ? ` – ${it.weight_label}` : '');
    /** Mensagem do pedido — usa SEMPRE os valores devolvidos pelo servidor. */
    SP.orderMessage = (o, settings) => {
        const biz = (settings && settings.business_name) || 'Sabor de Pão';
        const L = [];
        L.push(`*Nova encomenda — ${biz}*`);
        L.push(`Pedido: *${o.code}*`);
        L.push('');
        L.push(`*Cliente:* ${o.customer_name}`);
        L.push(`*Telefone:* ${SP.phoneMask(o.customer_phone)}`);
        L.push('');
        L.push('*Produtos:*');
        (o.items || []).forEach(it => {
            L.push(`• ${it.qty}x ${SP.itemLabel(it)} — ${SP.money(it.unit_price)} cada = ${SP.money(it.total)}`);
            (it.addons || []).forEach(a => L.push(`   + ${a.name} (${SP.money(a.price)})`));
        });
        L.push('');
        if (o.fulfillment === 'entrega') {
            L.push(`Subtotal: ${SP.money(o.subtotal)}`);
            L.push(`Taxa de entrega: ${o.delivery_pending ? 'a combinar' : SP.money(o.delivery_fee)}`);
        }
        L.push(`*Total: ${SP.money(o.total)}${o.delivery_pending ? ' + entrega' : ''}*`);
        L.push('');
        if (o.fulfillment === 'entrega') { L.push('*Recebimento:* Entrega'); L.push(`*Endereço:* ${SP.addressText(o.address)}`); }
        else L.push('*Recebimento:* Retirada no local');
        if (o.scheduled_for) L.push(`*Data da retirada:* ${SP.dateBR(o.scheduled_for)}`);
        L.push(`*Pagamento:* ${SP.PAY_LABEL[o.payment_method] || o.payment_method}${o.payment_method === 'dinheiro' && o.change_for ? ` (troco para ${o.change_for})` : ''}`);
        L.push(`*Observações:* ${o.notes || 'nenhuma'}`);
        return L.join('\n');
    };
    SP.customMessage = c => {
        const L = ['Olá! Gostaria de encomendar um pãozinho personalizado.', ''];
        L.push(`Meu recheio desejado é: ${c.filling}.`);
        if (c.ingredients) { L.push(''); L.push(`Ingredientes: ${c.ingredients}.`); }
        L.push(''); L.push(`Quantidade: ${c.qty}.`);
        L.push(''); L.push(`Observações: ${c.notes || 'nenhuma'}.`);
        L.push(''); L.push('Poderiam me informar o valor e a disponibilidade?');
        if (c.code) { L.push(''); L.push(`(Solicitação ${c.code} — ${c.name})`); }
        return L.join('\n');
    };
    SP.quoteReplyMessage = (o, settings) => {
        const it = (o.items || [])[0] || {};
        const L = [`Olá, ${String(o.customer_name || '').split(' ')[0]}! Aqui é da ${(settings && settings.business_name) || 'Sabor de Pão'}.`, ''];
        L.push(`Sobre sua encomenda personalizada *${o.code}*:`);
        L.push(`${it.qty}x ${it.name} — recheio: ${(it.custom && it.custom.filling) || ''}`);
        L.push(`Valor: ${SP.money(it.unit_price)} cada = ${SP.money(o.subtotal)}`);
        if (Number(o.delivery_fee) > 0) L.push(`Entrega: ${SP.money(o.delivery_fee)}`);
        L.push(`*Total: ${SP.money(o.total)}*`);
        L.push(''); L.push('Podemos confirmar a sua encomenda?');
        return L.join('\n');
    };

    // ── PIX (BR Code estático) ────────────────────────────────
    SP.pixPayload = (key, name, city, amount) => {
        const clean = s => SP.norm(s).replace(/[^a-z0-9 ]/gi, '').toUpperCase();
        const f = (id, v) => `${id}${String(v.length).padStart(2, '0')}${v}`;
        const gui = f('00', 'br.gov.bcb.pix') + f('01', key.trim());
        let p = f('00', '01') + f('26', gui) + f('52', '0000') + f('53', '986');
        if (amount > 0) p += f('54', SP.round2(amount).toFixed(2));
        p += f('58', 'BR') + f('59', clean(name).slice(0, 25) || 'RECEBEDOR') + f('60', clean(city).slice(0, 15) || 'BRASIL') + f('62', f('05', '***')) + '6304';
        let crc = 0xFFFF;
        for (let i = 0; i < p.length; i++) { crc ^= p.charCodeAt(i) << 8; for (let j = 0; j < 8; j++) { crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1; crc &= 0xFFFF; } }
        return p + crc.toString(16).toUpperCase().padStart(4, '0');
    };

    // ── Status de pedidos ─────────────────────────────────────
    SP.STATUS = {
        aguardando_orcamento: { label: 'Aguardando orçamento', tone: 'quote' },
        pendente:   { label: 'Recebido', tone: 'pending' },
        confirmado: { label: 'Confirmado', tone: 'info' },
        em_preparo: { label: 'Em preparo', tone: 'info' },
        pronto:     { label: 'Pronto', tone: 'info' },
        saiu_entrega: { label: 'Saiu para entrega', tone: 'info' },
        concluido:  { label: 'Concluído', tone: 'done' },
        cancelado:  { label: 'Cancelado', tone: 'cancel' },
    };
    SP.OPEN_STATUSES = ['pendente', 'confirmado', 'em_preparo', 'pronto', 'saiu_entrega'];

    SP.ERRORS = {
        PRICE_CHANGED: 'Alguns preços foram atualizados. Confira o novo total e confirme novamente.',
        INVALID_ITEM: 'Um dos produtos do carrinho não está mais disponível. Revise o carrinho.',
        QUOTE_PRODUCT: 'Produtos sob consulta não podem ser comprados pelo carrinho.',
        INVALID_CUSTOMER: 'Informe nome e telefone válidos.',
        INVALID_ADDRESS: 'Preencha o endereço de entrega.',
        INVALID_PAYMENT: 'Escolha a forma de pagamento.',
        INVALID_FULFILLMENT: 'Forma de recebimento indisponível.',
        INVALID_DATE: 'Escolha uma data a partir de hoje.',
        EMPTY_ORDER: 'Seu carrinho está vazio.',
        TOO_MANY_ORDERS: 'Muitos pedidos em sequência. Aguarde alguns minutos ou fale conosco pelo WhatsApp.',
        INVALID_REQUEST: 'Não foi possível registrar. Verifique os dados.',
        QUOTE_REQUIRED: 'Defina o valor da encomenda personalizada antes de mudar o status.',
        NOT_ADMIN: 'Acesso restrito ao administrador.',
    };
    SP.errorText = e => {
        const m = String((e && e.message) || e || '');
        const code = Object.keys(SP.ERRORS).find(k => m.includes(k));
        return code ? SP.ERRORS[code] : 'Não foi possível concluir. Verifique sua conexão e tente novamente.';
    };

    root.SP = SP;
    if (typeof module !== 'undefined' && module.exports) module.exports = SP;
})(typeof window !== 'undefined' ? window : globalThis);
