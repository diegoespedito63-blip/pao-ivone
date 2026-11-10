// Testes da lógica compartilhada (core.js) — uso: node core.test.js
const SP = require('./core.js');
const SEED = require('./seed.js');
let ok = 0, bad = 0;
const t = (c, m) => { if (c) { ok++; console.log('  ✔', m); } else { bad++; console.log('  ✘', m); } };

console.log('\nFormatação');
t(SP.money(17) === 'R$ 17,00', 'R$ 17,00');
t(SP.money(1234.5) === 'R$ 1.234,50', 'milhar: R$ 1.234,50');
t(SP.money(0.1 + 0.2) === 'R$ 0,30', 'arredondamento de ponto flutuante');
t(SP.phoneMask('19999485767') === '(19) 99948-5767', 'máscara do WhatsApp comercial');
t(SP.waLink('(19) 99948-5767', 'oi') === 'https://wa.me/5519999485767?text=oi', 'link wa.me com DDI 55');
t(SP.esc('<b>"x"</b>') === '&lt;b&gt;&quot;x&quot;&lt;/b&gt;', 'escape de HTML (evita injeção)');

console.log('\nPreços');
const trad = { id: 'a', price: 17, price_mode: 'fixed' };
t(SP.priceLine(trad, { qty: 3 }).total === 51, '3 × Pão Tradicional = 51');
t(!SP.priceLine(trad, { qty: 0 }).ok && !SP.priceLine(trad, { qty: 100 }).ok, 'quantidade 0 e 100 rejeitadas');
t(SP.priceLine({ ...trad, promo_price: 15 }, { qty: 2 }).total === 30, 'promoção aplicada');
t(SP.priceLine({ ...trad, promo_price: 20 }, { qty: 1 }).total === 17, 'promoção maior que o preço é ignorada');
const quote = SEED.products.find(p => p.price_mode === 'quote');
t(!SP.priceLine(quote, { qty: 1 }).ok, '"Recheio do Seu Jeito" nunca entra no carrinho com preço');
t(SP.displayPrice(quote) === null, '"Recheio do Seu Jeito" exibido como sob consulta');
const v = { price_mode: 'fixed', variants: [{ id: 'p', name: 'P', price: 10 }, { id: 'g', name: 'G', price: 20, promo_price: 17 }, { id: 'x', name: 'X', price: 1, active: false }], addons: [{ id: 'q', name: 'Queijo', price: 3.5 }] };
t(SP.priceLine(v, { variant_id: 'g', addon_ids: ['q'], qty: 2 }).total === 41, 'variação promocional + adicional = 41');
t(!SP.priceLine(v, { variant_id: 'x', qty: 1 }).ok, 'variação desativada rejeitada');
t(!SP.priceLine(v, { qty: 1 }).ok, 'sem escolher variação → rejeitado');
t(SP.displayPrice(v).price === 10 && SP.displayPrice(v).from, '"a partir de R$ 10,00"');
const byId = { a: trad };
const c1 = SP.computeCart(byId, [{ product_id: 'a', qty: 2 }], { delivery_fee: 7 }, 'entrega');
t(c1.subtotal === 34 && c1.fee === 7 && c1.total === 41, 'carrinho com entrega: 34 + 7 = 41');
const c2 = SP.computeCart(byId, [{ product_id: 'a', qty: 2 }], { delivery_fee: null }, 'entrega');
t(c2.feePending && c2.total === 34, 'taxa não configurada → "a combinar"');
t(SP.computeCart(byId, [{ product_id: 'a', qty: 2 }], { delivery_fee: 7 }, 'retirada').total === 34, 'retirada sem taxa');

console.log('\nCardápio oficial (carga inicial)');
const off = { 'Pão Tradicional': 17, 'Pão de Leite': 19, 'Pão de Cebola': 18, 'Pão de Milho': 19, 'Pão Integral': 19, 'Pão Recheado de Frango com Requeijão': 29, 'Enroladão 3 Queijos': 32, 'Pão Recheado Napolitano': 29, 'Pão de Frango com Requeijão e Mussarela': 32, 'Pão de Frango com Requeijão e Palmito': 32, 'Pão Recheado Vegetariano': 32, 'Pão Recheado 5 Queijos': 32, 'Sabor Tudo 700 gramas': 38, 'Sabor Tudo 1 quilo': 48, 'Rosca de Goiabada': 19, 'Rosca de Coco com Leite Condensado': 25, 'Rosca Húngara': 38, 'Cuca de Doce de Leite': 33, 'Cuca de Goiabada': 31 };
t(Object.entries(off).every(([n, p]) => SEED.products.find(x => x.name === n && x.price === p)), '19 preços oficiais exatos');
t(SEED.products.length === 20 && SEED.products.every(p => !/a[çc]a[íi]/i.test(JSON.stringify(p))), '20 produtos, nenhum resquício do açaí');
t(SEED.settings.pix_key === '' && SEED.settings.pix_holder === 'IVANE VOLPONI DA CUNHA', 'chave PIX não inventada; titular correto');
t(SEED.settings.whatsapp === '19999485767', 'WhatsApp (19) 99948-5767');

console.log('\nMensagens e PIX');
const msg = SP.orderMessage({ code: 'SP1', customer_name: 'Ana', customer_phone: '19988887777', items: [{ name: 'Pão de Leite', qty: 2, unit_price: 19, total: 38, addons: [] }], subtotal: 38, delivery_fee: 7, total: 45, fulfillment: 'entrega', address: { street: 'Rua A', number: '1', district: 'Centro', city: 'X' }, payment_method: 'dinheiro', change_for: '50', notes: 'sem pressa' }, {});
['Ana', '2x Pão de Leite', 'R$ 19,00 cada', 'Subtotal: R$ 38,00', 'Taxa de entrega: R$ 7,00', 'Total: R$ 45,00', 'Dinheiro', 'troco para 50', 'Rua A, 1', 'sem pressa'].forEach(s => t(msg.includes(s), `mensagem contém "${s}"`));
const cm = SP.customMessage({ filling: 'Calabresa', qty: 2, notes: 'x' });
t(cm.startsWith('Olá! Gostaria de encomendar um pãozinho personalizado.') && cm.includes('Meu recheio desejado é: Calabresa.') && cm.includes('Poderiam me informar o valor e a disponibilidade?'), 'mensagem do personalizado segue o modelo sugerido');
const pix = SP.pixPayload('chave@exemplo.com', 'IVANE VOLPONI DA CUNHA', 'São Paulo', 45);
t(pix.includes('br.gov.bcb.pix') && pix.includes('540545.00') && pix.includes('5913IVANE VOLPONI') || pix.includes('5922IVANE VOLPONI DA CUNHA'), 'PIX copia-e-cola com chave, valor e titular');
const crc = s => { let c = 0xFFFF; for (let i = 0; i < s.length; i++) { c ^= s.charCodeAt(i) << 8; for (let j = 0; j < 8; j++) { c = (c & 0x8000) ? (c << 1) ^ 0x1021 : c << 1; c &= 0xFFFF; } } return c.toString(16).toUpperCase().padStart(4, '0'); };
t(crc(pix.slice(0, -4)) === pix.slice(-4) && pix.includes('6009SAO PAULO'), 'CRC16 válido e cidade sem acento');

console.log(`\n${ok} passaram, ${bad} falharam`);
process.exit(bad ? 1 : 0);
