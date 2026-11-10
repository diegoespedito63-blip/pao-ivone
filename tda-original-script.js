/**
 * TDA Açaí — Script Principal
 */

// ─────────────────────────────────────────────────────────────
// ⚠️  CONFIGURAÇÕES FIXAS — valem em TODOS os dispositivos
// ─────────────────────────────────────────────────────────────
const SHEETS_URL_FIXO   = 'https://script.google.com/macros/s/AKfycbxn3um0K22U7ykTRA5VPBntTmy_JiKuBS2IGujuyrt6V34jwmHg-JlfgdwSgf1PLBMR/exec';
const TAXA_ENTREGA_FIXA = 2;
const PIX_KEY_FIXA      = '8af2ba28-1c9c-47cd-82cc-3be69599d2d1';
const PIX_NOME_FIXO     = 'TDA Acai';
const PIX_CIDADE_FIXA   = 'Mogi Mirim';

const FRETE_GRATIS_BAIRROS = ['manacas','manacás','condominio dos manacas','cond. dos manacas','Rua Maria Magdalena Urban','Maria Magdalena Urban','maria magdalena urban','rua maria magdalena urban','RUA MARIA MAGDALENA URBAN'];

// ─────────────────────────────────────────────────────────────
// PRODUTOS
// ─────────────────────────────────────────────────────────────
const PRODUCTS = {
    diego:   { id:'diego',   name:'Copo Diego',       cat:'copos',    image:'./Copo1.png',     desc:'Açaí cremoso com leite condensado, paçoca, amendoim e frutas frescas.',                                              sizes:[{label:'300ml',price:21},{label:'500ml',price:26},{label:'700ml',price:30}] },
    arthur:  { id:'arthur',  name:'Copo Arthur',      cat:'copos',    image:'./Copo2.png',     desc:'Morango fresco, creme de avelã e leite Ninho em açaí cremoso.',                                                      sizes:[{label:'300ml',price:22},{label:'500ml',price:27},{label:'700ml',price:31}] },
    thaina:  { id:'thaina',  name:'Copo Thaina',      cat:'copos',    image:'./Copo3.png',     desc:'Morango fresco, leite condensado e amendoim crocante em açaí cremoso.',                                              sizes:[{label:'300ml',price:21},{label:'500ml',price:26},{label:'700ml',price:30}] },
    davi:    { id:'davi',    name:'Copo Davi',        cat:'copos',    image:'./Copo4.png',     desc:'Banana fresca, leite condensado e granola crocante em açaí refrescante.',                                            sizes:[{label:'300ml',price:21},{label:'500ml',price:26},{label:'700ml',price:30}] },
    tda:     { id:'tda',     name:'Copo TDA',         cat:'copos',    image:'./Diego max.png', desc:'Uva, banana, leite em pó e creme de avelã — equilíbrio perfeito de sabor.',                                         sizes:[{label:'300ml',price:22},{label:'500ml',price:27},{label:'700ml',price:31}] },
    combo:   { id:'combo',   name:'Combo Família',    cat:'combos',   image:'./4-copos.jpeg',  desc:'4 copos com açaí, frutas frescas, leite condensado, paçoca, creme de avelã e granola.',                             sizes:[{label:'Único',price:69.90}] },
    kitkat:  { id:'kitkat',  name:'Copo Kit Kat',     cat:'copos',    image:'./KitKat.png',    desc:'Açaí tradicional com creme de Kit Kat, morango fresco e leite em pó — o equilíbrio perfeito entre cremosidade e sabor!', sizes:[{label:'300ml',price:22},{label:'500ml',price:27},{label:'700ml',price:32}] },
    garrafa: { id:'garrafa', name:'Açaí na Garrafa',  cat:'garrafas', image:'./garrafa.png',   desc:'Açaí cremoso na garrafa com leite em pó e leite condensado — perfeito para levar e saborear onde quiser.',           sizes:[{label:'300ml',price:16.99}] },
};

const ORDER_STATUSES = {
    pending:   { label:'⏳ Aguardando confirmação', color:'#f59e0b', bg:'#fef3c7' },
    preparing: { label:'👨‍🍳 Em preparo',            color:'#7c3aed', bg:'#ede9fe' },
    delivery:  { label:'🛵 Saiu para entrega',      color:'#2563eb', bg:'#dbeafe' },
    delivered: { label:'✅ Entregue',               color:'#16a34a', bg:'#dcfce7' },
    cancelled: { label:'❌ Cancelado',              color:'#dc2626', bg:'#fee2e2' },
};

// ─────────────────────────────────────────────────────────────
// MONTE SEU AÇAÍ
// ─────────────────────────────────────────────────────────────
const MONTE_TAMANHOS = [
    { id:'300ml', label:'300ml', price:12.99 },
    { id:'500ml', label:'500ml', price:15.99 },
    { id:'700ml', label:'700ml', price:19.99 },
];

let monteTamanhoSelecionado = null;

const ADICIONAIS = [
    { id:'sucrilhos',    name:'Sucrilhos',        price:2.99, emoji:'🌾' },
    { id:'amendoim',     name:'Amendoim',         price:5.99, emoji:'🥜' },
    { id:'aveia',        name:'Aveia',            price:2.99, emoji:'🌿' },
    { id:'leite_po',     name:'Leite em Pó',      price:4.99, emoji:'🥛' },
    { id:'leite_cond',   name:'Leite Condensado', price:3.99, emoji:'🍶' },
    { id:'creme_kitkat', name:'Creme Kit Kat',    price:5.99, emoji:'🍫' },
    { id:'creme_avela',  name:'Creme de Avelã',   price:5.99, emoji:'🍫' },
    { id:'banana',       name:'Banana',           price:2.99, emoji:'🍌' },
    { id:'morango',      name:'Morango',          price:3.99, emoji:'🍓' },
    { id:'granola',      name:'Granola',          price:4.99, emoji:'🌰' },
];

let monteSelecao = {};

// ─────────────────────────────────────────────────────────────
// ESTADO
// ─────────────────────────────────────────────────────────────
let cart        = JSON.parse(localStorage.getItem('tda_cart')     || '[]');
let currentUser = JSON.parse(localStorage.getItem('tda_user')    || 'null');
let settings    = JSON.parse(localStorage.getItem('tda_settings') || 'null');
let adminAuth   = false;
let _selectedProduct = null;
let _selectedSizeIdx = 0;
let _selectedQty     = 1;
let _freteGratis     = false;

if (!settings) {
    settings = { deliveryFee:5, pixKey:'', pixName:'TDA Acai', pixCity:'Mogi Mirim', adminPass:'1234', sheetsUrl:'' };
    saveSettings();
}
function saveSettings() { localStorage.setItem('tda_settings', JSON.stringify(settings)); }

// ─────────────────────────────────────────────────────────────
// TAXA DE ENTREGA
// ─────────────────────────────────────────────────────────────
function getTaxaEntrega() {
    if (_freteGratis) return 0;
    return TAXA_ENTREGA_FIXA > 0 ? TAXA_ENTREGA_FIXA : settings.deliveryFee;
}
function bairroTemFreteGratis(bairro) {
    const b = (bairro || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
    return FRETE_GRATIS_BAIRROS.some(f => {
        const fn = f.normalize('NFD').replace(/[̀-ͯ]/g,'');
        return b.includes(fn) || fn.includes(b);
    });
}
function verificarFreteGratis(bairro) {
    _freteGratis = bairroTemFreteGratis(bairro);
    const cb = document.getElementById('chkManacas');
    if (cb) cb.checked = _freteGratis;
    const aviso = document.getElementById('freteGratisAviso');
    if (aviso) aviso.style.display = _freteGratis ? '' : 'none';
    const chkTotal = document.getElementById('chkTotal');
    if (chkTotal) chkTotal.textContent = formatCurrency(getTotal());
}
function onManacasToggle(checked) {
    _freteGratis = checked;
    const aviso = document.getElementById('freteGratisAviso');
    if (aviso) aviso.style.display = checked ? '' : 'none';
    const chkTotal = document.getElementById('chkTotal');
    if (chkTotal) chkTotal.textContent = formatCurrency(getTotal());
    const entregaEl = document.getElementById('cartDelivery');
    if (entregaEl) entregaEl.textContent = checked ? 'Grátis 🎉' : formatCurrency(getTaxaEntrega());
    updateCartBadge();
    showToast(checked ? '🎉 Frete grátis aplicado!' : 'Frete: ' + formatCurrency(getTaxaEntrega()));
}

// ─────────────────────────────────────────────────────────────
// DOM READY
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    updateUserUI();
    updateCartBadge();
    checkStoreOpen();
    initWhatsApp();
    atualizarTodosOsCards();
    renderPromocoes();
    carregarPrecosDoSheets();
    apCarregarExtras(); // carrega produtos extras e ocultos
    const el = document.getElementById('siTaxaEntrega');
    if (el) el.textContent = formatCurrency(getTaxaEntrega());
    setInterval(checkStoreOpen, 60000);
    iniciarPollingStatus();
    (function() {
        try {
            var url = (SHEETS_URL_FIXO || settings.sheetsUrl || '').trim();
            if (!url) return;
            fetch(url + '?d=' + encodeURIComponent(JSON.stringify({
                tipo: 'visita',
                visita: {
                    pagina:      window.location.pathname || '/',
                    referencia:  document.referrer || 'direto',
                    dispositivo: /Mobi|Android/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
                    navegador:   navigator.userAgent.substring(0, 100),
                    hora:        new Date().toISOString()
                }
            }))).catch(function(){});
        } catch(e) {}
    })();
});

// ─────────────────────────────────────────────────────────────
// STATUS DA LOJA
// ─────────────────────────────────────────────────────────────
function checkStoreOpen() {
    const el = document.getElementById('storeStatus'); if (!el) return;
    const now = new Date(), day = now.getDay(), t = now.getHours()*60+now.getMinutes();
    const horarios = {
        0: { a:13*60, f:18*60 },
        1: { a:13*60, f:22*60 },
        2: { a:13*60, f:22*60 },
        3: { a:13*60, f:18*60 },
        4: { a:13*60, f:22*60 },
        5: { a:13*60, f:17*60 },
        6: { a:18*60, f:22*60 },
    };
    const h    = horarios[day];
    const open = h ? (t >= h.a && t < h.f) : false;
    el.textContent = open ? '● Aberto agora' : '● Fechado';
    el.className   = 'store-status '+(open?'open':'closed');
}
function initWhatsApp() {
    const msg = encodeURIComponent('Olá! Gostaria de fazer um pedido.');
    document.querySelectorAll('a[href*="wa.me"]').forEach(l => { if(!l.href.includes('text=')) l.href+=`?text=${msg}`; });
}

// ─────────────────────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────────────────────
function showToast(msg,type='success') {
    const t=document.getElementById('toast'); t.textContent=msg; t.className=`toast toast--${type} toast--show`; setTimeout(()=>t.classList.remove('toast--show'),3000);
}
function openModal(id)  { document.getElementById(id).classList.add('active');    document.body.style.overflow='hidden'; }
function closeModal(id) { document.getElementById(id).classList.remove('active'); document.body.style.overflow=''; }
function closeAllModals() { document.querySelectorAll('.modal-overlay').forEach(m=>m.classList.remove('active')); document.body.style.overflow=''; }
function closeModalOnOverlay(e,id) { if(e.target.id===id) closeModal(id); }
function formatCurrency(v) { return 'R$ '+parseFloat(v).toFixed(2).replace('.',','); }
function openStoreInfo() { openModal('modalStoreInfo'); }

// ─────────────────────────────────────────────────────────────
// PREÇOS DO GOOGLE SHEETS
// ─────────────────────────────────────────────────────────────
async function carregarPrecosDoSheets() {
    const url = (SHEETS_URL_FIXO || settings.sheetsUrl || '').trim();
    if (!url) return;
    try {
        const res  = await fetch(`${url}?d=${encodeURIComponent(JSON.stringify({tipo:'cardapio'}))}`);
        const json = await res.json();
        if (json.status==='ok' && Array.isArray(json.produtos)) aplicarPrecos(json.produtos);
    } catch(e) { console.warn('Preços do Sheets indisponíveis:',e.message); }
}
function aplicarPrecos(produtos) {
    const mapa = {};
    produtos.forEach(p => {
        const chave = (p.produto+'-'+p.tamanho).toLowerCase().trim();
        mapa[chave] = { preco: p.preco, precoOriginal: p.precoOriginal||0 };
    });
    Object.values(PRODUCTS).forEach(prod => {
        prod.sizes.forEach(size => {
            const chave = (prod.name+'-'+size.label).toLowerCase().trim();
            if (mapa[chave]) {
                const sheets = mapa[chave];
                if (sheets.precoOriginal > 0) {
                    size.price         = sheets.preco;
                    size.originalPrice = sheets.precoOriginal;
                } else if (sheets.preco > 0) {
                    if (!size.originalPrice) size.price = sheets.preco;
                }
            }
        });
    });
    atualizarTodosOsCards();
    renderPromocoes();
}
function atualizarTodosOsCards() {
    document.querySelectorAll('.product-card[data-product]').forEach(card => {
        const prod = PRODUCTS[card.dataset.product]; if (prod) atualizarPrecoCard(card,prod);
    });
}

// ─────────────────────────────────────────────────────────────
// ABA PROMOÇÕES
// ─────────────────────────────────────────────────────────────
function renderPromocoes() {
    const sec  = document.getElementById('sec-promocoes');
    const pill = document.querySelector('.cat-pill[data-cat="promocoes"]');
    const promos = Object.values(PRODUCTS).filter(prod =>
        prod.sizes.some(s => s.originalPrice && s.originalPrice > s.price)
    );
    if (promos.length === 0) {
        if (sec)  sec.style.display  = 'none';
        if (pill) pill.style.display = 'none';
        return;
    }
    if (pill) pill.style.display = '';
    if (!sec) return;
    sec.style.display = '';
    sec.innerHTML = `
        <h2 class="prod-section-title promo-section-title">🔥 Promoções</h2>
        ${promos.map(prod => {
            const sizesComPromo = prod.sizes.filter(s => s.originalPrice && s.originalPrice > s.price);
            const menorPromo    = sizesComPromo.reduce((a,b) => a.price <= b.price ? a : b);
            const precoNovo     = menorPromo.price;
            const precoAntigo   = menorPromo.originalPrice;
            const pct           = Math.round((1 - precoNovo / precoAntigo) * 100);
            const prefixo       = prod.sizes.length > 1 ? 'a partir de ' : '';
            return `
            <div class="product-card promo-destaque" data-product="${prod.id}" onclick="openProductModal('${prod.id}')">
                <div class="product-info">
                    <div class="product-name">${prod.name}<span class="discount-badge">-${pct}%</span></div>
                    <div class="product-desc">${prod.desc}</div>
                    <div class="product-price">
                        <span class="price-old">${formatCurrency(precoAntigo)}</span>
                        <strong class="price-new">${prefixo}${formatCurrency(precoNovo)}</strong>
                    </div>
                </div>
                <div class="product-img-wrap">
                    <img src="${prod.image}" alt="${prod.name}" class="product-img" loading="lazy">
                    <div class="product-add-btn">+</div>
                </div>
            </div>`;
        }).join('')}
    `;
}
function atualizarPrecoCard(card, prod) {
    const priceEl = card.querySelector('.product-price');
    if (!priceEl) return;
    const minPrice    = Math.min(...prod.sizes.map(s => s.price));
    const temPromocao = prod.sizes.some(s => s.originalPrice && s.originalPrice > s.price);
    if (temPromocao) {
        const menorSize = prod.sizes.reduce((a, b) => a.price <= b.price ? a : b);
        const precoOrig = menorSize.originalPrice || Math.max(...prod.sizes.map(s => s.originalPrice || 0));
        const pct       = precoOrig > 0 ? Math.round((1 - minPrice / precoOrig) * 100) : 0;
        const prefixo   = prod.sizes.length > 1 ? 'a partir de ' : '';
        priceEl.innerHTML =
            `<span class="price-old">${formatCurrency(precoOrig)}</span> ` +
            `<strong class="price-new">${prefixo}${formatCurrency(minPrice)}</strong> ` +
            `<span class="discount-badge">-${pct}%</span>`;
    } else {
        priceEl.innerHTML = prod.sizes.length > 1
            ? `A partir de <strong>${formatCurrency(minPrice)}</strong>`
            : `<strong>${formatCurrency(minPrice)}</strong>`;
    }
}

// ─────────────────────────────────────────────────────────────
// MONTE SEU AÇAÍ
// ─────────────────────────────────────────────────────────────
function renderMonteSeuAcai() {
    const sec = document.getElementById('sec-monte');
    if (!sec) return;

    const tamanho = MONTE_TAMANHOS.find(t => t.id === monteTamanhoSelecionado);
    const totalAdicionais = Object.entries(monteSelecao).reduce((sum, [id, qty]) => {
        const item = ADICIONAIS.find(a => a.id === id);
        return sum + (item ? item.price * qty : 0);
    }, 0);
    const totalGeral = (tamanho ? tamanho.price : 0) + totalAdicionais;

    sec.innerHTML = `
        <h2 class="prod-section-title" style="background:linear-gradient(135deg,#f5eeff,#ede9fe);color:#4c1d95;border-left:4px solid #7c3aed;">🍧 Monte seu Açaí</h2>
        <div style="padding:14px 16px 6px;">
            <div style="font-size:.82rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;">1. Escolha o tamanho do copo 🥤</div>
            <div class="monte-tamanhos">
                ${MONTE_TAMANHOS.map(t => `
                <div class="monte-tamanho ${monteTamanhoSelecionado === t.id ? 'monte-tamanho-sel' : ''}" onclick="monteSelecionarTamanho('${t.id}')">
                    <div class="monte-tamanho-label">${t.label}</div>
                    <div class="monte-tamanho-price">${formatCurrency(t.price)}</div>
                </div>`).join('')}
            </div>
        </div>
        <div style="padding:14px 16px 6px;">
            <div style="font-size:.82rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;">2. Escolha os adicionais 🍓</div>
        </div>
        <div class="monte-grid">
            ${ADICIONAIS.map(item => {
                const qty = monteSelecao[item.id] || 0;
                return `
                <div class="monte-card ${qty > 0 ? 'monte-selected' : ''}">
                    <div class="monte-emoji">${item.emoji}</div>
                    <div class="monte-name">${item.name}</div>
                    <div class="monte-price">${formatCurrency(item.price)}</div>
                    <div class="monte-qty-ctrl">
                        <button class="monte-btn-minus" onclick="monteAjustar('${item.id}',-1)" ${qty===0?'disabled':''}>−</button>
                        <span class="monte-qty">${qty}</span>
                        <button class="monte-btn-plus" onclick="monteAjustar('${item.id}',1)">+</button>
                    </div>
                </div>`;
            }).join('')}
        </div>
        ${monteTamanhoSelecionado ? `
        <div class="monte-resumo">
            <div class="monte-resumo-title">📋 Resumo da montagem</div>
            <div class="monte-resumo-row"><span>🥤 Copo Açaí ${tamanho.label}</span><span>${formatCurrency(tamanho.price)}</span></div>
            ${Object.entries(monteSelecao).map(([id, qty]) => {
                const item = ADICIONAIS.find(a => a.id === id);
                return item ? `<div class="monte-resumo-row"><span>${item.emoji} ${item.name} x${qty}</span><span>${formatCurrency(item.price * qty)}</span></div>` : '';
            }).join('')}
            <div class="monte-resumo-total"><span>Total</span><span>${formatCurrency(totalGeral)}</span></div>
            <button class="monte-add-cart" onclick="monteAdicionarCarrinho()">🛒 Adicionar ao Carrinho — ${formatCurrency(totalGeral)}</button>
        </div>` : `
        <div style="text-align:center;padding:16px;color:#9ca3af;font-size:.88rem;">
            👆 Selecione o tamanho do copo para continuar
        </div>`}
    `;
}

function monteSelecionarTamanho(id) { monteTamanhoSelecionado = id; renderMonteSeuAcai(); }

function monteAjustar(id, delta) {
    const atual = monteSelecao[id] || 0;
    const novo  = Math.max(0, atual + delta);
    if (novo === 0) delete monteSelecao[id]; else monteSelecao[id] = novo;
    renderMonteSeuAcai();
}

function monteAdicionarCarrinho() {
    if (!currentUser) { openModal('modalAuth'); showToast('Faça login para adicionar.', 'info'); return; }
    if (!monteTamanhoSelecionado) { showToast('Selecione o tamanho do copo!', 'error'); return; }
    const tamanho = MONTE_TAMANHOS.find(t => t.id === monteTamanhoSelecionado);
    const itens   = Object.entries(monteSelecao);
    const nomes   = itens.map(([id, qty]) => { const item = ADICIONAIS.find(a => a.id === id); return item ? `${item.name} x${qty}` : ''; }).filter(Boolean).join(', ');
    const totalAdicionais = itens.reduce((sum, [id, qty]) => { const item = ADICIONAIS.find(a => a.id === id); return sum + (item ? item.price * qty : 0); }, 0);
    const totalGeral = tamanho.price + totalAdicionais;
    const key = 'monte_' + Date.now();
    cart.push({ key, productId:'monte', productName:'Monte seu Açaí', size:`${tamanho.label}${nomes ? ' · ' + nomes : ''}`, price:totalGeral, qty:1, image:'' });
    saveCart(); updateCartBadge(); monteSelecao = {}; monteTamanhoSelecionado = null; renderMonteSeuAcai();
    showToast('Adicionado ao carrinho! 🛒');
}

// ─────────────────────────────────────────────────────────────
// FILTROS E BUSCA
// ─────────────────────────────────────────────────────────────
function filterCat(cat, btn) {
    document.querySelectorAll('.cat-pill').forEach(p=>p.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const inp = document.getElementById('searchInput'); if (inp) inp.value = '';
    document.querySelectorAll('.product-card').forEach(c=>c.style.display='');
    // restaura ocultos pelo admin
    apGetHidden().forEach(id => {
        document.querySelectorAll(`.product-card[data-product="${id}"]`).forEach(c => c.style.display = 'none');
    });
    document.querySelectorAll('.prod-section').forEach(s => {
        if (s.id === 'sec-monte') return;
        s.classList.toggle('hidden', cat !== 'all' && s.dataset.cat !== cat);
    });
    const secMonte = document.getElementById('sec-monte');
    if (secMonte) {
        const mostrar = cat === 'monte' || cat === 'all';
        secMonte.style.display = mostrar ? '' : 'none';
        secMonte.classList.toggle('hidden', !mostrar);
        if (cat === 'monte') renderMonteSeuAcai();
    }
    document.getElementById('emptySearch').style.display = 'none';
}

function filterSearch(q) {
    q = q.toLowerCase().trim();
    document.querySelectorAll('.cat-pill').forEach((p,i)=>p.classList.toggle('active',i===0));
    if (!q) { filterCat('all', null); return; }
    let any = false;
    document.querySelectorAll('.prod-section').forEach(sec => {
        if (sec.id === 'sec-monte') { sec.style.display = 'none'; sec.classList.add('hidden'); return; }
        let has = false;
        sec.querySelectorAll('.product-card').forEach(card => {
            const m = ((card.querySelector('.product-name')?.textContent||'')+(card.querySelector('.product-desc')?.textContent||'')).toLowerCase().includes(q);
            card.style.display = m ? '' : 'none'; if (m) has = true;
        });
        sec.classList.toggle('hidden', !has); if (has) any = true;
    });
    document.getElementById('emptySearch').style.display = any ? 'none' : '';
}

function clearSearch() { document.getElementById('searchInput').value = ''; filterCat('all', document.querySelector('.cat-pill')); }

// ─────────────────────────────────────────────────────────────
// MODAL DO PRODUTO
// ─────────────────────────────────────────────────────────────
function openProductModal(productId) {
    const product = PRODUCTS[productId]; if (!product) return;
    _selectedProduct = product; _selectedSizeIdx = 0; _selectedQty = 1;
    document.getElementById('prodModalImg').src          = product.image;
    document.getElementById('prodModalName').textContent = product.name;
    document.getElementById('prodModalDesc').textContent = product.desc;
    document.getElementById('prodQtyVal').textContent    = '1';
    const sizesEl = document.getElementById('prodModalSizes');
    document.getElementById('prodSizesTitle').style.display = product.sizes.length > 1 ? '' : 'none';
    sizesEl.innerHTML = product.sizes.map((s,i) => {
        const temPromo = s.originalPrice && s.originalPrice > s.price;
        const pct      = temPromo ? Math.round((1-s.price/s.originalPrice)*100) : 0;
        return `<div class="prod-size-opt ${i===0?'selected':''}" onclick="selectSize(${i})">
            <span class="pso-label">${s.label}${temPromo?` <span class="discount-badge">-${pct}%</span>`:''}</span>
            <div class="pso-prices">${temPromo?`<span class="pso-price-old">${formatCurrency(s.originalPrice)}</span>`:''}<span class="pso-price">${formatCurrency(s.price)}</span></div>
        </div>`;
    }).join('');
    updateProdAddBtn(); openModal('modalProduct');
}
function selectSize(idx) {
    _selectedSizeIdx = idx;
    document.querySelectorAll('.prod-size-opt').forEach((el,i)=>el.classList.toggle('selected',i===idx));
    updateProdAddBtn();
}
function prodQtyChange(delta) {
    _selectedQty = Math.max(1, _selectedQty+delta);
    document.getElementById('prodQtyVal').textContent = _selectedQty;
    updateProdAddBtn();
}
function updateProdAddBtn() {
    if (!_selectedProduct) return;
    document.getElementById('prodAddPrice').textContent = formatCurrency(_selectedProduct.sizes[_selectedSizeIdx].price*_selectedQty);
}
function addSelectedToCart() {
    if (!currentUser) { closeModal('modalProduct'); openModal('modalAuth'); showToast('Faça login para adicionar.','info'); return; }
    const p = _selectedProduct, s = p.sizes[_selectedSizeIdx], key = p.sizes.length>1 ? `${p.id}-${s.label}` : p.id;
    const ex = cart.find(i=>i.key===key);
    if (ex) ex.qty += _selectedQty; else cart.push({key,productId:p.id,productName:p.name,size:p.sizes.length>1?s.label:null,price:s.price,qty:_selectedQty,image:p.image});
    saveCart(); updateCartBadge(); closeModal('modalProduct');
    showToast(`${p.name}${s.label!=='Único'?` (${s.label})`:''} adicionado! 🛒`);
}

// ─────────────────────────────────────────────────────────────
// CARRINHO
// ─────────────────────────────────────────────────────────────
function saveCart()    { localStorage.setItem('tda_cart', JSON.stringify(cart)); }
function getSubtotal() { return cart.reduce((s,i)=>s+i.price*i.qty,0); }
function getTotal()    { return getSubtotal()+getTaxaEntrega(); }
function updateCartBadge() {
    const total = cart.reduce((s,i)=>s+i.qty,0);
    const fc    = document.getElementById('floatingCart'); if (!fc) return;
    fc.style.display = total > 0 ? 'flex' : 'none';
    const e1 = document.getElementById('fcCount'); if (e1) e1.textContent = total;
    const e2 = document.getElementById('fcTotal'); if (e2) e2.textContent = formatCurrency(getTotal());
}
function openCart() { renderCart(); openModal('modalCart'); }
function renderCart() {
    const empty = document.getElementById('cartEmpty'), items = document.getElementById('cartItems'), list = document.getElementById('cartItemsList');
    if (!cart.length) { empty.style.display=''; items.style.display='none'; return; }
    empty.style.display = 'none'; items.style.display = '';
    list.innerHTML = cart.map(item=>`
        <div class="cart-item">
            <img src="${item.image}" alt="${item.productName}" class="cart-item-img" onerror="this.style.background='#f0f0f0'">
            <div class="cart-item-info">
                <div class="cart-item-name">${item.productName}${item.size?` <small>(${item.size})</small>`:''}</div>
                <div class="cart-item-price">${formatCurrency(item.price)}</div>
            </div>
            <div class="cart-item-qty">
                <button onclick="changeQty('${item.key}',-1)">−</button>
                <span>${item.qty}</span>
                <button onclick="changeQty('${item.key}',1)">+</button>
            </div>
            <button class="cart-item-remove" onclick="removeFromCart('${item.key}')">🗑</button>
        </div>`).join('');
    document.getElementById('cartSubtotal').textContent = formatCurrency(getSubtotal());
    document.getElementById('cartDelivery').textContent = formatCurrency(getTaxaEntrega());
    document.getElementById('cartTotal').textContent    = formatCurrency(getTotal());
}
function removeFromCart(key) { cart=cart.filter(i=>i.key!==key); saveCart(); updateCartBadge(); renderCart(); }
function changeQty(key,delta) { const i=cart.find(i=>i.key===key); if(!i)return; i.qty+=delta; if(i.qty<=0){removeFromCart(key);return;} saveCart(); renderCart(); updateCartBadge(); }
function clearCart() { if(!confirm('Esvaziar o carrinho?'))return; cart=[]; saveCart(); updateCartBadge(); renderCart(); }

// ─────────────────────────────────────────────────────────────
// AUTENTICAÇÃO
// ─────────────────────────────────────────────────────────────
function openAuthModal() {
    if (currentUser) { if(confirm(`Sair da conta de ${currentUser.name}?`)){currentUser=null;localStorage.removeItem('tda_user');updateUserUI();showToast('Você saiu da conta.');} return; }
    openModal('modalAuth');
}
function switchTab(tab) {
    document.getElementById('panelLogin').style.display    = tab==='login'    ? '' : 'none';
    document.getElementById('panelCadastro').style.display = tab==='cadastro' ? '' : 'none';
    document.getElementById('tabLogin').classList.toggle('active',   tab==='login');
    document.getElementById('tabCadastro').classList.toggle('active', tab==='cadastro');
}
function doLogin() {
    const phone = document.getElementById('loginPhone').value.trim();
    if (!phone) { showToast('Informe seu telefone.','error'); return; }
    const users = JSON.parse(localStorage.getItem('tda_users')||'{}'), user = users[phone];
    if (!user) { showToast('Não encontrado. Cadastre-se!','error'); switchTab('cadastro'); document.getElementById('regPhone').value=phone; return; }
    currentUser=user; localStorage.setItem('tda_user',JSON.stringify(user)); updateUserUI(); closeModal('modalAuth'); showToast(`Bem-vindo(a), ${user.name}! 🌿`);
    _pollingAtivo=false; iniciarPollingStatus();
}
function doRegister() {
    const g = id => document.getElementById(id).value.trim();
    const [name,phone,street,number,neighborhood,city,complement] = [g('regName'),g('regPhone'),g('regStreet'),g('regNumber'),g('regNeighborhood'),g('regCity'),g('regComplement')];
    if (!name||!phone||!street||!number||!neighborhood||!city) { showToast('Preencha os campos obrigatórios.','error'); return; }
    const user  = {name,phone,street,number,neighborhood,complement,city};
    const users = JSON.parse(localStorage.getItem('tda_users')||'{}');
    users[phone] = user; localStorage.setItem('tda_users',JSON.stringify(users));
    currentUser  = user; localStorage.setItem('tda_user',JSON.stringify(user)); updateUserUI(); closeModal('modalAuth'); showToast(`Bem-vindo(a), ${name}! 🌿`);
    _pollingAtivo=false; iniciarPollingStatus();
}
function updateUserUI() {
    const l = document.getElementById('userLabel'), b = document.getElementById('btnTrack');
    if (l) l.textContent = currentUser ? currentUser.name.split(' ')[0] : 'Entrar';
    if (b) b.style.display = currentUser ? 'block' : 'none';
}

// ─────────────────────────────────────────────────────────────
// CHECKOUT
// ─────────────────────────────────────────────────────────────
function openCheckout() {
    if (!currentUser) { closeModal('modalCart'); openModal('modalAuth'); return; }
    if (!cart.length) { showToast('Carrinho vazio!','error'); return; }
    _freteGratis = false;
    const f = (id,v) => { const el=document.getElementById(id); if(el) el.value=v||''; };
    f('chkStreet',currentUser.street); f('chkNumber',currentUser.number);
    f('chkNeighborhood',currentUser.neighborhood); f('chkComplement',currentUser.complement); f('chkCity',currentUser.city);
    document.getElementById('chkTotal').textContent = formatCurrency(getTotal());
    if (currentUser.neighborhood) verificarFreteGratis(currentUser.neighborhood);
    document.querySelectorAll('input[name="payment"]').forEach(r=>r.checked=false);
    document.getElementById('paymentNoticeCard').style.display  = 'none';
    document.getElementById('paymentNoticeMoney').style.display = 'none';
    closeModal('modalCart'); openModal('modalCheckout');
}
function onPaymentChange(method) {
    document.getElementById('paymentNoticeCard').style.display  = (method==='debito'||method==='credito') ? '' : 'none';
    document.getElementById('paymentNoticeMoney').style.display = method==='dinheiro' ? '' : 'none';
}
function confirmOrder() {
    const g = id => document.getElementById(id).value.trim();
    const street=g('chkStreet'), number=g('chkNumber'), neighborhood=g('chkNeighborhood'), city=g('chkCity');
    const payment = document.querySelector('input[name="payment"]:checked');
    if (!street||!number||!neighborhood||!city) { showToast('Preencha o endereço.','error'); return; }
    if (!payment) { showToast('Escolha a forma de pagamento.','error'); return; }
    const address       = {street,number,neighborhood,complement:g('chkComplement'),city};
    const paymentMethod = payment.value, changeFor = document.getElementById('changeFor')?.value.trim()||'';
    closeModal('modalCheckout');
    window._lastOrderItems  = cart.map(i=>({...i}));
    window._lastSubtotal    = getSubtotal();
    window._lastTotal       = getTotal();
    window._lastFreteGratis = _freteGratis;
    window._lastOrder       = {address,paymentMethod,changeFor};
    saveOrder(address,paymentMethod,changeFor);
    showOrderSummary(address,paymentMethod,changeFor);
}

// ─────────────────────────────────────────────────────────────
// RESUMO DO PEDIDO
// ─────────────────────────────────────────────────────────────
function showOrderSummary(address,paymentMethod,changeFor) {
    const items=window._lastOrderItems||[], subtotal=window._lastSubtotal||0, total=window._lastTotal||0;
    const payL = {pix:'📲 PIX',debito:'💳 Débito',credito:'💳 Crédito',dinheiro:'💵 Dinheiro'};
    const addr = `${address.street}, ${address.number}${address.complement?' – '+address.complement:''}, ${address.neighborhood} – ${address.city}`;
    const itemsHtml   = items.map(i=>`<div class="summary-item"><span>${i.qty}x ${i.productName}${i.size?` (${i.size})`:''}</span><span>${formatCurrency(i.price*i.qty)}</span></div>`).join('');
    const changeNote  = paymentMethod==='dinheiro'&&changeFor ? `<p class="summary-note">💵 Troco para: ${changeFor}</p>` : '';
    const cardNote    = (paymentMethod==='debito'||paymentMethod==='credito') ? `<div class="summary-alert">🛵 Levaremos a maquininha no momento da entrega!</div>` : '';
    const freteLabel  = window._lastFreteGratis ? `<span style="color:#16a34a;font-weight:700">🎉 Grátis (Manacás)</span>` : formatCurrency(getTaxaEntrega());
    document.getElementById('summaryContent').innerHTML=`
        <div class="summary-section"><h4>🛍️ Itens</h4>${itemsHtml}
            <div class="summary-divider"></div>
            <div class="summary-item"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
            <div class="summary-item"><span>Entrega</span><span>${freteLabel}</span></div>
            <div class="summary-item summary-item--total"><span>Total</span><span>${formatCurrency(total)}</span></div>
        </div>
        <div class="summary-section"><h4>📍 Endereço</h4><p class="summary-text">${addr}</p></div>
        <div class="summary-section"><h4>💳 Pagamento</h4><p class="summary-text">${payL[paymentMethod]}</p>${changeNote}${cardNote}</div>`;
    const pixSection = document.getElementById('pixSection');
    if (paymentMethod==='pix') {
        pixSection.style.display = '';
        const pixKey  = PIX_KEY_FIXA    || settings.pixKey;
        const pixNome = PIX_NOME_FIXO   || settings.pixName;
        const pixCid  = PIX_CIDADE_FIXA || settings.pixCity;
        if (!pixKey) { pixSection.querySelector('.pix-box').innerHTML=`<h3>📲 PIX</h3><p style="color:#dc2626">⚠️ Chave PIX não configurada.</p>`; }
        else {
            document.getElementById('pixKeyDisplay').textContent = pixKey;
            document.getElementById('pixAmount').textContent     = formatCurrency(total);
            try { const p=buildPixEMV(pixKey,pixNome,pixCid,total); setTimeout(()=>renderPixQR(p),150); } catch(e) {}
        }
    } else { pixSection.style.display='none'; }
    openModal('modalSummary');
    const btn = document.getElementById('btnFinishOrder');
    if (btn) btn.textContent = paymentMethod==='pix' ? '✓ Já realizei o pagamento PIX' : '✓ Concluir pedido';
}
function copyPixKey() { const k=PIX_KEY_FIXA||settings.pixKey; navigator.clipboard.writeText(k).then(()=>showToast('Chave PIX copiada!')).catch(()=>showToast('Não foi possível copiar.','error')); }
function sendToWhatsApp(autoClose=true) {
    if (!window._lastOrder) return;
    const {address,paymentMethod,changeFor} = window._lastOrder;
    const payL     = {pix:'PIX',debito:'Débito',credito:'Crédito',dinheiro:'Dinheiro'};
    const itemsText = (window._lastOrderItems||[]).map(i=>`• ${i.qty}x ${i.productName}${i.size?` (${i.size})`:''} — ${formatCurrency(i.price*i.qty)}`).join('\n');
    const addrText  = `${address.street}, ${address.number}${address.complement?' – '+address.complement:''}, ${address.neighborhood} – ${address.city}`;
    const taxaStr   = window._lastFreteGratis ? '🎉 GRÁTIS (Manacás)' : formatCurrency(getTaxaEntrega());
    let msg = `🌿 *Novo Pedido — TDA Açaí*\n\n👤 *Cliente:* ${currentUser?.name} (${currentUser?.phone})\n📍 *Endereço:* ${addrText}\n\n🛍️ *Itens:*\n${itemsText}\n\nSubtotal: ${formatCurrency(window._lastSubtotal||0)}\nEntrega:  ${taxaStr}\n*Total:   ${formatCurrency(window._lastTotal||0)}*\n\n💳 *Pagamento:* ${payL[paymentMethod]||paymentMethod}`;
    if (paymentMethod==='dinheiro'&&changeFor) msg += `\n💵 Troco para: ${changeFor}`;
    window.open(`https://wa.me/5519994194916?text=${encodeURIComponent(msg)}`, '_blank');
    if (!autoClose) showToast('WhatsApp aberto! 🎉');
}
function finishOrder() { sendToWhatsApp(false); cart=[]; saveCart(); updateCartBadge(); closeAllModals(); showToast('Pedido concluído! 🌿'); }

// ─────────────────────────────────────────────────────────────
// QR CODE PIX
// ─────────────────────────────────────────────────────────────
function renderPixQR(text) {
    const canvas = document.getElementById('pixQRCode'); if (!canvas) return;
    try {
        if (typeof qrcode !== 'undefined') {
            const qr=qrcode(0,'M'); qr.addData(text,'Alphanumeric'); qr.make();
            const size=200, mod=qr.getModuleCount(), cell=Math.floor(size/mod), off=Math.floor((size-cell*mod)/2);
            canvas.width=size; canvas.height=size; const ctx=canvas.getContext('2d');
            ctx.fillStyle='#f0fdf4'; ctx.fillRect(0,0,size,size); ctx.fillStyle='#166534';
            for(let r=0;r<mod;r++) for(let c=0;c<mod;c++) if(qr.isDark(r,c)) ctx.fillRect(off+c*cell,off+r*cell,cell,cell);
            return;
        }
    } catch(e) {}
    try { const img=document.createElement('img'); img.src=`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}`; img.className='pix-qr-canvas'; canvas.replaceWith(img); } catch(e2) {}
}
function buildPixEMV(k,n,c,a) {
    const f=(id,v)=>`${id}${String(v.length).padStart(2,'0')}${v}`;
    const g=f('00','br.gov.bcb.pix')+f('01',k);
    const p=f('00','01')+f('01','12')+f('26',g)+f('52','0000')+f('53','986')+(a>0?f('54',parseFloat(a).toFixed(2)):'')+f('58','BR')+f('59',(n||'Comercio').substring(0,25))+f('60',(c||'Brasil').substring(0,15))+f('62',f('05','***'))+'6304';
    let crc=0xFFFF; for(let i=0;i<p.length;i++){crc^=p.charCodeAt(i)<<8;for(let j=0;j<8;j++){crc=(crc&0x8000)?(crc<<1)^0x1021:crc<<1;crc&=0xFFFF;}}
    return p+crc.toString(16).toUpperCase().padStart(4,'0');
}

// ─────────────────────────────────────────────────────────────
// PEDIDOS — salvar, rastrear
// ─────────────────────────────────────────────────────────────
function saveOrder(address,paymentMethod,changeFor) {
    const orders = JSON.parse(localStorage.getItem('tda_orders')||'[]');
    const order  = {id:Date.now(),customer:{name:currentUser?.name,phone:currentUser?.phone},items:window._lastOrderItems,address,paymentMethod,changeFor,subtotal:window._lastSubtotal,deliveryFee:getTaxaEntrega(),freteGratis:_freteGratis,total:window._lastTotal,status:'pending',createdAt:new Date().toISOString()};
    orders.unshift(order); localStorage.setItem('tda_orders',JSON.stringify(orders));
    enviarParaSheets(order);
}
function openTracking()  { renderTracking(); openModal('modalTracking'); }
function renderTracking() {
    const el = document.getElementById('trackingContent');
    if (!currentUser) { el.innerHTML='<p>Faça login para ver seus pedidos.</p>'; return; }
    const orders = JSON.parse(localStorage.getItem('tda_orders')||'[]').filter(o=>o.customer?.phone===currentUser.phone);
    if (!orders.length) { el.innerHTML='<div class="tracking-empty"><p>📦</p><p>Nenhum pedido encontrado.</p></div>'; return; }
    const payL = {pix:'PIX',debito:'Débito',credito:'Crédito',dinheiro:'Dinheiro'};
    el.innerHTML = orders.map(o => {
        const st   = ORDER_STATUSES[o.status]||ORDER_STATUSES.pending;
        const date = new Date(o.createdAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
        return `<div class="tracking-card">
            <div class="tracking-card-header"><span class="tracking-date">${date}</span><span class="tracking-status-badge" style="background:${st.bg};color:${st.color}">${st.label}</span></div>
            <div class="tracking-items">${o.items.map(i=>`${i.qty}x ${i.productName}${i.size?` (${i.size})`:''}`).join(', ')}</div>
            <div class="tracking-footer"><span>${formatCurrency(o.total)}</span><span>${o.freteGratis?'🎉 Frete grátis':payL[o.paymentMethod]||o.paymentMethod}</span></div>
            <div class="status-timeline">${renderTimeline(o.status)}</div>
        </div>`;
    }).join('');
}
function renderTimeline(cur) {
    const steps = [{key:'pending',icon:'⏳',label:'Confirmado'},{key:'preparing',icon:'👨‍🍳',label:'Em preparo'},{key:'delivery',icon:'🛵',label:'Saiu'},{key:'delivered',icon:'✅',label:'Entregue'}];
    const idx   = ['pending','preparing','delivery','delivered'].indexOf(cur);
    return steps.map((s,i)=>`<div class="tl-step ${i<=idx?'tl-done':''} ${i===idx?'tl-active':''}"><div class="tl-icon">${s.icon}</div><div class="tl-label">${s.label}</div></div>${i<3?'<div class="tl-line"></div>':''}`).join('');
}

// ─────────────────────────────────────────────────────────────
// NOTIFICAÇÕES DE STATUS
// ─────────────────────────────────────────────────────────────
let _statusCache  = JSON.parse(localStorage.getItem('tda_status_cache')||'{}');
let _pollingAtivo = false;
async function iniciarPollingStatus() {
    if (!currentUser) return;
    if ('Notification' in window && Notification.permission==='default') await Notification.requestPermission();
    if (_pollingAtivo) return;
    _pollingAtivo = true;
    await verificarStatusPedidos();
    setInterval(verificarStatusPedidos, 60000);
}
async function verificarStatusPedidos() {
    const url = (SHEETS_URL_FIXO || settings.sheetsUrl || '').trim();
    if (!url || !currentUser) return;
    try {
        const payload = {tipo:'status_pedidos', telefone:currentUser.phone};
        const res     = await fetch(`${url}?d=${encodeURIComponent(JSON.stringify(payload))}`);
        const json    = await res.json();
        if (json.status!=='ok' || !Array.isArray(json.pedidos)) return;
        json.pedidos.forEach(pedido => {
            const statusAnterior = _statusCache[pedido.id];
            if (statusAnterior && statusAnterior !== pedido.status) dispararNotificacao(pedido);
            _statusCache[pedido.id] = pedido.status;
        });
        localStorage.setItem('tda_status_cache', JSON.stringify(_statusCache));
    } catch(e) {}
}
function dispararNotificacao(pedido) {
    const st  = ORDER_STATUSES[pedido.status] || {label: pedido.statusTexto || pedido.status};
    const msg = `Seu pedido ${pedido.id} está: ${st.label}`;
    showToast(`🔔 ${msg}`, 'info');
    if ('Notification' in window && Notification.permission==='granted') {
        try { new Notification('🌿 TDA Açaí', {body:msg, icon:'./Copo_thaina.png', badge:'./Copo_thaina.png', tag:pedido.id, vibrate:[200,100,200]}); } catch(e) {}
    }
}

// ─────────────────────────────────────────────────────────────
// INTEGRAÇÃO GOOGLE SHEETS
// ─────────────────────────────────────────────────────────────
async function enviarParaSheets(order) {
    const url = (SHEETS_URL_FIXO||settings.sheetsUrl||'').trim(); if (!url) return;
    const payload = {tipo:'pedido',pedido:{cliente:{nome:order.customer?.name||'',telefone:order.customer?.phone||''},endereco:{rua:order.address.street,numero:order.address.number,bairro:order.address.neighborhood,complemento:order.address.complement||'',cidade:order.address.city},itens:order.items,pagamento:order.paymentMethod,troco:order.changeFor||'',subtotal:order.subtotal,taxaEntrega:order.deliveryFee,freteGratis:order.freteGratis||false,total:order.total,status:order.status,criadoEm:order.createdAt}};
    try { const res=await fetch(`${url}?d=${encodeURIComponent(JSON.stringify(payload))}`); const json=await res.json(); if(json.status==='ok') console.log('✅ Pedido salvo no Google Sheets'); } catch(e) { console.warn('Sheets sync error:',e.message); }
}

// ─────────────────────────────────────────────────────────────
// ADMIN (configurações existentes)
// ─────────────────────────────────────────────────────────────
function openAdminModal() { adminAuth=false; document.getElementById('adminLoginPanel').style.display=''; document.getElementById('adminPanel').style.display='none'; document.getElementById('adminPassword').value=''; openModal('modalAdmin'); }
function checkAdminPass() {
    if (document.getElementById('adminPassword').value===settings.adminPass) {
        adminAuth=true;
        document.getElementById('adminLoginPanel').style.display='none';
        document.getElementById('adminPanel').style.display='';
        document.getElementById('adminDeliveryFee').value=settings.deliveryFee;
        document.getElementById('adminPixKey').value=settings.pixKey;
        document.getElementById('adminPixName').value=settings.pixName;
        document.getElementById('adminPixCity').value=settings.pixCity;
        document.getElementById('adminNewPass').value='';
        document.getElementById('adminSheetsUrl').value=settings.sheetsUrl||'';
        atualizarStatusSheets();
    } else { showToast('Senha incorreta!','error'); }
}
function saveAdminSettings() {
    if (!adminAuth) return;
    const fee = parseFloat(document.getElementById('adminDeliveryFee').value);
    if (isNaN(fee)||fee<0) { showToast('Taxa inválida.','error'); return; }
    settings.deliveryFee = fee;
    const k=document.getElementById('adminPixKey').value.trim();  if(k) settings.pixKey=k;
    const n=document.getElementById('adminPixName').value.trim(); if(n) settings.pixName=n;
    const c=document.getElementById('adminPixCity').value.trim(); if(c) settings.pixCity=c;
    const p=document.getElementById('adminNewPass').value.trim(); if(p) settings.adminPass=p;
    settings.sheetsUrl=document.getElementById('adminSheetsUrl').value.trim();
    saveSettings(); closeModal('modalAdmin'); showToast('Configurações salvas! ✓');
}
function atualizarStatusSheets() {
    const el=document.getElementById('sheetsStatus'); if(!el) return;
    const url=settings.sheetsUrl||'';
    el.textContent=url?'🟢 URL configurada':'⚪ Não configurado'; el.style.color=url?'#16a34a':'#9ca3af';
}
async function testarConexaoSheets() {
    const urlInput=document.getElementById('adminSheetsUrl'), el=document.getElementById('sheetsStatus');
    const url=(urlInput?urlInput.value.trim():'');
    if (!url) { showToast('Cole a URL primeiro!','error'); return; }
    if (el) { el.textContent='⏳ Testando...'; el.style.color='#6b7280'; }
    showToast('⏳ Testando...','info');
    try {
        const res=await fetch(`${url}?d=${encodeURIComponent(JSON.stringify({tipo:'teste'}))}`);
        const json=await res.json();
        if (json.status==='ok') { showToast('✅ '+json.msg,'success'); if(el){el.textContent='✅ '+json.msg;el.style.color='#16a34a';} settings.sheetsUrl=url; saveSettings(); }
        else { showToast('⚠️ '+json.msg,'error'); if(el){el.textContent='⚠️ '+json.msg;el.style.color='#f59e0b';} }
    } catch(e) {
        showToast('❌ Não conectou. Verifique a URL e as permissões.','error');
        if(el){el.innerHTML=`❌ ${e.message}<br><small>Verifique: URL correta + "Qualquer pessoa" na implantação</small>`;el.style.color='#dc2626';}
    }
}
function switchAdminTab(tab) {
    const isConfig = tab==='config';
    document.getElementById('adminPanelConfig').style.display=isConfig?'':'none';
    document.getElementById('adminPanelOrders').style.display=isConfig?'none':'';
    document.getElementById('adminTabConfig').classList.toggle('active',isConfig);
    document.getElementById('adminTabOrders').classList.toggle('active',!isConfig);
    if (!isConfig) renderAdminOrders();
}
function renderAdminOrders() {
    const el     = document.getElementById('adminOrdersList');
    const orders = JSON.parse(localStorage.getItem('tda_orders')||'[]');
    if (!orders.length) { el.innerHTML='<p style="color:#888;text-align:center;padding:20px">Nenhum pedido ainda.</p>'; return; }
    const payL = {pix:'PIX',debito:'Débito',credito:'Crédito',dinheiro:'Dinheiro'};
    el.innerHTML = orders.map(o => {
        const st    = ORDER_STATUSES[o.status]||ORDER_STATUSES.pending;
        const date  = new Date(o.createdAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
        const items = o.items.map(i=>`${i.qty}x ${i.productName}${i.size?` (${i.size})`:''}`).join('<br>');
        const addr  = `${o.address?.street}, ${o.address?.number} – ${o.address?.neighborhood}`;
        const opts  = Object.entries(ORDER_STATUSES).map(([k,v])=>`<option value="${k}" ${o.status===k?'selected':''}>${v.label}</option>`).join('');
        const taxaStr = o.freteGratis ? '🎉 Grátis (Manacás)' : formatCurrency(o.deliveryFee||0);
        return `<div class="admin-order-card">
            <div class="admin-order-head"><strong>#${o.id.toString().slice(-5)}</strong><span>${date}</span><span class="tracking-status-badge" style="background:${st.bg};color:${st.color}">${st.label}</span></div>
            <div class="admin-order-info"><p>👤 ${o.customer?.name} — ${o.customer?.phone}</p><p>📍 ${addr}</p><p>🛍️ ${items}</p><p>💳 ${payL[o.paymentMethod]||o.paymentMethod} — <strong>${formatCurrency(o.total)}</strong> | Entrega: ${taxaStr}</p></div>
            <div class="admin-order-status"><label>Atualizar status:</label><select class="form-input" onchange="updateOrderStatus(${o.id},this.value)">${opts}</select></div>
        </div>`;
    }).join('');
}
function updateOrderStatus(orderId,newStatus) {
    const orders=JSON.parse(localStorage.getItem('tda_orders')||'[]');
    const order=orders.find(o=>o.id===orderId); if(!order) return;
    order.status=newStatus; localStorage.setItem('tda_orders',JSON.stringify(orders));
    showToast(`Status: ${ORDER_STATUSES[newStatus].label}`); renderAdminOrders();
}

// ═════════════════════════════════════════════════════════════
// ADMIN PRODUTOS — painel oculto (5 cliques no logo)
// ═════════════════════════════════════════════════════════════

// ── Acesso secreto ──────────────────────────────────────────
let _apClicks = 0, _apTimer;
function contarCliqueAdmin() {
    _apClicks++;
    clearTimeout(_apTimer);
    if (_apClicks >= 5) {
        _apClicks = 0;
        document.getElementById('apSenhaPanel').style.display = '';
        document.getElementById('apPainel').style.display     = 'none';
        document.getElementById('apSenha').value              = '';
        openModal('modalAdminProd');
        setTimeout(() => document.getElementById('apSenha').focus(), 300);
    } else {
        _apTimer = setTimeout(() => { _apClicks = 0; }, 2000);
    }
}

function verificarSenhaAP() {
    if (document.getElementById('apSenha').value === settings.adminPass) {
        document.getElementById('apSenhaPanel').style.display = 'none';
        document.getElementById('apPainel').style.display     = '';
        switchAPTab('produtos');
    } else {
        showToast('Senha incorreta!', 'error');
        document.getElementById('apSenha').value = '';
    }
}

function switchAPTab(tab) {
    document.getElementById('apTabProdutosPanel').style.display   = tab === 'produtos'   ? '' : 'none';
    document.getElementById('apTabAdicionarPanel').style.display  = tab === 'adicionar'  ? '' : 'none';
    document.getElementById('apTabProdutos').classList.toggle('active',  tab === 'produtos');
    document.getElementById('apTabAdicionar').classList.toggle('active', tab === 'adicionar');
    if (tab === 'produtos') apRenderLista();
}

// ── Storage ─────────────────────────────────────────────────
function apGetExtras()       { return JSON.parse(localStorage.getItem('tda_ap_extras')  || '[]'); }
function apSaveExtras(v)     { localStorage.setItem('tda_ap_extras',  JSON.stringify(v)); }
function apGetHidden()       { return JSON.parse(localStorage.getItem('tda_ap_hidden')  || '[]'); }
function apSaveHidden(v)     { localStorage.setItem('tda_ap_hidden',  JSON.stringify(v)); }

// ── Carregar ao iniciar ──────────────────────────────────────
function apCarregarExtras() {
    const hidden = apGetHidden();
    const extras = apGetExtras();

    // Oculta produtos hardcoded marcados como ocultos
    hidden.forEach(id => {
        document.querySelectorAll(`.product-card[data-product="${id}"]`).forEach(c => c.style.display = 'none');
    });

    // Renderiza produtos extras (adicionados pelo admin)
    extras.forEach(prod => {
        PRODUCTS[prod.id] = prod;
        apRenderCard(prod, hidden.includes(prod.id));
    });
}

function apRenderCard(prod, oculto) {
    const sec = document.getElementById('sec-' + prod.cat);
    if (!sec) return;
    if (document.querySelector(`.product-card[data-product="${prod.id}"]`)) return;
    const minPreco = Math.min(...prod.sizes.map(s => s.price));
    const prefixo  = prod.sizes.length > 1 ? 'A partir de ' : '';
    const card     = document.createElement('div');
    card.className       = 'product-card';
    card.dataset.product = prod.id;
    card.style.display   = oculto ? 'none' : '';
    card.onclick         = () => openProductModal(prod.id);
    card.innerHTML = `
        <div class="product-info">
            <div class="product-name">${prod.name}</div>
            <div class="product-desc">${prod.desc}</div>
            <div class="product-price">${prefixo}<strong>${formatCurrency(minPreco)}</strong></div>
        </div>
        <div class="product-img-wrap">
            <img src="${prod.image||''}" alt="${prod.name}" class="product-img" loading="lazy" onerror="this.style.background='#f0f0f0'">
            <div class="product-add-btn">+</div>
        </div>`;
    sec.appendChild(card);
}

// ── Lista de produtos ────────────────────────────────────────
function apRenderLista() {
    const hidden = apGetHidden();
    const extras = apGetExtras();
    const el     = document.getElementById('apListaProdutos');

    el.innerHTML = Object.values(PRODUCTS).map(prod => {
        const isHidden = hidden.includes(prod.id);
        const isExtra  = !!extras.find(e => e.id === prod.id);
        const minPreco = Math.min(...prod.sizes.map(s => s.price));
        return `
        <div style="display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid #e5e7eb;">
            <img src="${prod.image||''}" style="width:48px;height:48px;object-fit:cover;border-radius:8px;background:#f0f0f0;flex-shrink:0;" onerror="this.style.background='#f0f0f0'">
            <div style="flex:1;min-width:0;">
                <div style="font-size:.875rem;font-weight:700;color:#2b2d42;${isHidden?'text-decoration:line-through;opacity:.4':''}">${prod.name}</div>
                <div style="font-size:.75rem;color:#6b7280;">${formatCurrency(minPreco)}${isExtra?' · <span style="color:#6e2c7c;font-weight:600;">extra</span>':''}</div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
                <button onclick="apToggleVisible('${prod.id}')"
                    style="padding:6px 10px;border-radius:8px;border:1.5px solid ${isHidden?'#16a34a':'#6b7280'};background:${isHidden?'#f0fdf4':'#f4f5f7'};color:${isHidden?'#16a34a':'#6b7280'};font-size:.72rem;font-weight:700;cursor:pointer;white-space:nowrap;">
                    ${isHidden ? '👁 Mostrar' : '🙈 Ocultar'}
                </button>
                ${isExtra ? `<button onclick="apDeletar('${prod.id}')" style="padding:6px 10px;border-radius:8px;border:1.5px solid #dc2626;background:#fee2e2;color:#dc2626;font-size:.85rem;font-weight:700;cursor:pointer;">🗑</button>` : ''}
            </div>
        </div>`;
    }).join('');
}

function apToggleVisible(id) {
    const hidden = apGetHidden();
    const idx    = hidden.indexOf(id);
    if (idx >= 0) {
        hidden.splice(idx, 1);
        document.querySelectorAll(`.product-card[data-product="${id}"]`).forEach(c => c.style.display = '');
        showToast('Produto visível! 👁');
    } else {
        hidden.push(id);
        document.querySelectorAll(`.product-card[data-product="${id}"]`).forEach(c => c.style.display = 'none');
        showToast('Produto ocultado! 🙈');
    }
    apSaveHidden(hidden);
    apRenderLista();
}

function apDeletar(id) {
    if (!confirm('Remover este produto do cardápio?')) return;
    apSaveExtras(apGetExtras().filter(p => p.id !== id));
    delete PRODUCTS[id];
    document.querySelectorAll(`.product-card[data-product="${id}"]`).forEach(c => c.remove());
    showToast('Produto removido!');
    apRenderLista();
}

// ── Adicionar produto ────────────────────────────────────────
function apAddRow() {
    const div = document.createElement('div');
    div.className    = 'ap-row';
    div.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;';
    div.innerHTML = `
        <input type="text"   class="form-input" placeholder="500ml"  style="flex:1;">
        <input type="number" class="form-input" placeholder="26.00" min="0" step="0.01" style="width:100px;">
        <button onclick="apRemRow(this)" style="background:#fee2e2;border:none;border-radius:8px;padding:0 10px;color:#dc2626;font-size:1rem;font-weight:700;cursor:pointer;flex-shrink:0;">✕</button>`;
    document.getElementById('apTamanhos').appendChild(div);
}

function apRemRow(btn) {
    const cont = document.getElementById('apTamanhos');
    if (cont.querySelectorAll('.ap-row').length <= 1) { showToast('Precisa de pelo menos 1 tamanho!','error'); return; }
    btn.closest('.ap-row').remove();
}

function apConverterDrive(url) {
    if (!url) return '';
    const m1 = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m1) return `https://lh3.googleusercontent.com/d/${m1[1]}`;
    const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m2) return `https://lh3.googleusercontent.com/d/${m2[1]}`;
    return url;
}

function apSalvar() {
    const nome  = document.getElementById('apNome').value.trim();
    const cat   = document.getElementById('apCat').value;
    const desc  = document.getElementById('apDesc').value.trim();
    const imagem = apConverterDrive(document.getElementById('apImg').value.trim());

    if (!nome) { showToast('Informe o nome do produto!','error'); return; }
    if (!desc) { showToast('Informe a descrição!','error'); return; }

    const rows  = document.getElementById('apTamanhos').querySelectorAll('.ap-row');
    const sizes = [];
    for (let row of rows) {
        const inputs = row.querySelectorAll('input');
        const label  = inputs[0].value.trim();
        const price  = parseFloat(inputs[1].value);
        if (!label || isNaN(price) || price <= 0) { showToast('Preencha todos os tamanhos corretamente!','error'); return; }
        sizes.push({ label, price });
    }

    const id   = 'extra_' + Date.now();
    const prod = { id, name: nome, cat, desc, image: imagem, sizes };

    // Salva
    const extras = apGetExtras();
    extras.push(prod);
    apSaveExtras(extras);
    PRODUCTS[id] = prod;
    apRenderCard(prod, false);

    // Limpa formulário
    document.getElementById('apNome').value = '';
    document.getElementById('apDesc').value = '';
    document.getElementById('apImg').value  = '';
    document.getElementById('apTamanhos').innerHTML = `
        <div class="ap-row" style="display:flex;gap:8px;margin-bottom:8px;">
            <input type="text"   class="form-input" placeholder="300ml"  style="flex:1;">
            <input type="number" class="form-input" placeholder="21.00" min="0" step="0.01" style="width:100px;">
            <button onclick="apRemRow(this)" style="background:#fee2e2;border:none;border-radius:8px;padding:0 10px;color:#dc2626;font-size:1rem;font-weight:700;cursor:pointer;flex-shrink:0;">✕</button>
        </div>`;

    showToast('Produto adicionado! 🎉');
    switchAPTab('produtos');
}
