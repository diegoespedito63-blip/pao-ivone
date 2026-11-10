/**
 * Testes do banco (schema.sql + seed.sql) em PostgreSQL real embutido (PGlite).
 * Simula o Supabase: papéis anon/authenticated, auth.uid(), storage e RLS.
 *
 * Uso:  npm i @electric-sql/pglite@0.2.17   (em qualquer pasta)
 *       NODE_PATH=<pasta>/node_modules node db.test.js
 */
const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

const root = __dirname;
const schema = fs.readFileSync(path.join(root, 'schema.sql'), 'utf8');
const seed = fs.readFileSync(path.join(root, 'seed.sql'), 'utf8');

const ADMIN = '11111111-1111-1111-1111-111111111111';
const STRANGER = '22222222-2222-2222-2222-222222222222';
let passed = 0, failed = 0;
const ok = (cond, msg) => { if (cond) { passed++; console.log('  ✔', msg); } else { failed++; console.log('  ✘', msg); } };
const uuid = () => require('crypto').randomUUID();

(async () => {
    const db = new PGlite();
    const q = (s, p) => db.query(s, p);
    const as = async (role, sub) => {
        await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub || ''}', false);`);
        if (role) await db.exec(`set role ${role};`);
    };
    const rpc = async (fn, arg) => (await q(`select public.${fn}($1::jsonb) as r`, [JSON.stringify(arg)])).rows[0].r;
    const err = async (fnc) => { try { await fnc(); return null; } catch (e) { return e.message; } };

    // ── Ambiente "Supabase" mínimo ────────────────────────────────────
    await db.exec(`
        create role anon nologin; create role authenticated nologin;
        create schema auth;
        create table auth.users (id uuid primary key, email text);
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
        grant usage on schema auth to anon, authenticated;
        grant execute on function auth.uid() to anon, authenticated;
        create schema storage;
        create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
        create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
        alter table storage.objects enable row level security;
        grant usage on schema public, storage to anon, authenticated;
        alter default privileges in schema public grant all on tables to anon, authenticated;
        alter default privileges in schema public grant all on sequences to anon, authenticated;
        alter default privileges in schema public grant all on functions to anon, authenticated;
        insert into auth.users values ('${ADMIN}', 'dona@sabordepao.com'), ('${STRANGER}', 'outro@x.com');
    `);

    console.log('\n1. Estrutura');
    await db.exec(schema);
    ok(true, 'schema.sql executa sem erros');
    await db.exec(schema);
    ok(true, 'schema.sql pode ser executado novamente (idempotente)');
    await db.exec(seed);
    const cnt = (await q(`select (select count(*) from products)::int p, (select count(*) from categories)::int c`)).rows[0];
    ok(cnt.p === 20 && cnt.c === 3, `seed: ${cnt.p} produtos e ${cnt.c} categorias`);
    await db.exec(seed);
    ok((await q(`select count(*)::int n from products`)).rows[0].n === 20, 'seed não duplica ao rodar de novo');
    await db.exec(`insert into public.admins values ('${ADMIN}')`);

    console.log('\n2. Catálogo público (anon)');
    await as('anon');
    let cat = (await q(`select public.get_catalog() c`)).rows[0].c;
    const byName = n => cat.products.find(p => p.name === n);
    ok(cat.products.length === 20, 'get_catalog retorna os 20 produtos ativos');
    const official = { 'Pão Tradicional': 17, 'Pão de Leite': 19, 'Pão de Cebola': 18, 'Pão de Milho': 19, 'Pão Integral': 19,
        'Pão Recheado de Frango com Requeijão': 29, 'Enroladão 3 Queijos': 32, 'Pão Recheado Napolitano': 29,
        'Pão de Frango com Requeijão e Mussarela': 32, 'Pão de Frango com Requeijão e Palmito': 32, 'Pão Recheado Vegetariano': 32,
        'Pão Recheado 5 Queijos': 32, 'Sabor Tudo 700 gramas': 38, 'Sabor Tudo 1 quilo': 48, 'Rosca de Goiabada': 19,
        'Rosca de Coco com Leite Condensado': 25, 'Rosca Húngara': 38, 'Cuca de Doce de Leite': 33, 'Cuca de Goiabada': 31 };
    const wrong = Object.entries(official).filter(([n, v]) => !byName(n) || Number(byName(n).price) !== v);
    ok(wrong.length === 0, 'todos os preços oficiais conferem' + (wrong.length ? ' — divergentes: ' + wrong.map(w => w[0]).join(', ') : ''));
    const custom = byName('Recheio do Seu Jeito — Seu Pãozinho');
    ok(custom && custom.price_mode === 'quote' && custom.price === null, 'Recheio do Seu Jeito é "consultar", sem preço');
    ok(byName('Sabor Tudo 700 gramas').weight_label === '700 g' && byName('Sabor Tudo 1 quilo').weight_label === '1 kg', 'pesos 700 g e 1 kg cadastrados');
    ok(cat.settings.pix_holder === 'IVANE VOLPONI DA CUNHA' && cat.settings.pix_key === '', 'PIX: titular cadastrado, chave vazia (não inventada)');

    console.log('\n3. Pedido com validação no servidor');
    const trad = byName('Pão Tradicional'), st1 = byName('Sabor Tudo 1 quilo');
    const base = (extra) => Object.assign({
        client_ref: uuid(), customer: { name: 'Maria Teste', phone: '(19) 98888-7777' }, fulfillment: 'retirada',
        payment_method: 'pix', notes: 'sem pressa',
        items: [{ product_id: trad.id, qty: 2, unit_price: 0.01 }, { product_id: st1.id, qty: 1 }],
    }, extra);
    const p1 = base({ expected_total: 82 });
    let o = await rpc('create_order', p1);
    ok(o.code && o.status === 'pendente' && Number(o.total) === 82, `pedido ${o.code} registrado: total R$ 82,00 (2×17 + 48)`);
    ok(Number(o.items[0].unit_price) === 17, 'preço enviado pelo navegador (0,01) é ignorado — vale o do banco');
    let dup = await rpc('create_order', p1);
    ok(dup.duplicate === true && dup.id === o.id, 'clique repetido (mesmo client_ref) não duplica o pedido');
    await as(null);
    ok((await q(`select count(*)::int n from orders`)).rows[0].n === 1, 'apenas 1 pedido gravado');
    await as('anon');
    let e = await err(() => rpc('create_order', base({ expected_total: 50 })));
    ok(e && e.includes('PRICE_CHANGED'), 'total divergente → PRICE_CHANGED (não registra)');
    e = await err(() => rpc('create_order', base({ items: [{ product_id: custom.id, qty: 1 }] })));
    ok(e && e.includes('QUOTE_PRODUCT'), 'produto "consultar" não entra no carrinho');
    e = await err(() => rpc('create_order', base({ items: [{ product_id: trad.id, qty: 0 }] })));
    ok(e && e.includes('INVALID_ITEM'), 'quantidade 0 rejeitada');
    e = await err(() => rpc('create_order', base({ items: [{ product_id: trad.id, qty: 1000 }] })));
    ok(e && e.includes('INVALID_ITEM'), 'quantidade absurda rejeitada');
    e = await err(() => rpc('create_order', base({ items: [] })));
    ok(e && e.includes('EMPTY_ORDER'), 'pedido vazio rejeitado');
    e = await err(() => rpc('create_order', base({ customer: { name: 'A', phone: '12' } })));
    ok(e && e.includes('INVALID_CUSTOMER'), 'cliente sem nome/telefone válido rejeitado');
    const addr0 = { street: 'Rua das Flores', number: '10', district: 'Centro', city: 'Cidade' };
    e = await err(() => rpc('create_order', base({ fulfillment: 'entrega', address: addr0 })));
    ok(e && e.includes('INVALID_FULFILLMENT'), 'padrão "só retirada": pedido com entrega é recusado');
    await as(null); await db.exec(`update settings set data = data || '{"delivery_enabled": true}'::jsonb`); await as('anon');
    e = await err(() => rpc('create_order', base({ fulfillment: 'entrega' })));
    ok(e && e.includes('INVALID_ADDRESS'), '(entrega ligada no painel) entrega sem endereço rejeitada');
    e = await err(() => rpc('create_order', base({ payment_method: 'bitcoin' })));
    ok(e && e.includes('INVALID_PAYMENT'), 'forma de pagamento inválida rejeitada');
    e = await err(() => rpc('create_order', base({ scheduled_for: '2000-01-01' })));
    ok(e && e.includes('INVALID_DATE'), 'data no passado rejeitada');

    const addr = { street: 'Rua das Flores', number: '10', district: 'Centro', city: 'Cidade' };
    o = await rpc('create_order', base({ fulfillment: 'entrega', address: addr, phone: undefined }));
    ok(o.delivery_pending === true && o.delivery_fee === null && Number(o.total) === 82, 'entrega sem taxa configurada → "a combinar"');

    console.log('\n4. Segurança (RLS)');
    ok((await q(`select count(*)::int n from orders`)).rows[0].n === 0, 'anon não lê pedidos');
    e = await err(() => q(`insert into orders (client_ref, customer_name, customer_phone, items, total) values (gen_random_uuid(), 'X', '19999999999', '[]', 1)`));
    ok(!!e, 'anon não insere pedido direto na tabela');
    let r = await q(`update products set price = 1 where name = 'Pão Tradicional'`);
    ok(r.affectedRows === 0, 'anon não altera preços');
    r = await q(`delete from products`);
    ok(r.affectedRows === 0, 'anon não exclui produtos');
    e = await err(() => q(`select public.admin_set_status($1, 'concluido')`, [o.id]));
    ok(!!e, 'anon não muda status de pedido');
    await as('authenticated', STRANGER);
    r = await q(`update products set price = 1 where name = 'Pão Tradicional'`);
    ok(r.affectedRows === 0, 'usuário logado que não é admin não altera preços');
    ok((await q(`select count(*)::int n from orders`)).rows[0].n === 0, 'usuário não-admin não lê pedidos');
    e = await err(() => q(`select public.admin_set_quote($1, 10)`, [o.id]));
    ok(e && e.includes('NOT_ADMIN'), 'não-admin não confirma orçamento');

    console.log('\n5. Painel (admin)');
    await as('authenticated', ADMIN);
    const v0 = (await q(`select catalog_version v from store_meta`)).rows[0].v;
    r = await q(`update products set price = 18.50 where name = 'Pão Tradicional'`);
    ok(r.affectedRows === 1, 'admin altera preço');
    const v1 = (await q(`select catalog_version v from store_meta`)).rows[0].v;
    ok(Number(v1) > Number(v0), 'versão do catálogo incrementa (invalida cache)');
    await as('anon');
    cat = (await q(`select public.get_catalog() c`)).rows[0].c;
    ok(Number(byName('Pão Tradicional').price) === 18.5, 'novo preço aparece no catálogo');
    e = await err(() => rpc('create_order', base({ expected_total: 82 })));
    ok(e && e.includes('PRICE_CHANGED'), 'carrinho com preço antigo é barrado');
    o = await rpc('create_order', base({ expected_total: 85 }));
    ok(Number(o.total) === 85, 'pedido com novo preço: 2×18,50 + 48 = 85');

    await as('authenticated', ADMIN);
    await q(`update products set promo_price = 15 where name = 'Pão Tradicional'`);
    await q(`update settings set data = data || '{"delivery_fee": 6.5}'::jsonb`);
    await as('anon');
    o = await rpc('create_order', base({ fulfillment: 'entrega', address: addr, items: [{ product_id: trad.id, qty: 2 }], expected_total: 36.5 }));
    ok(Number(o.subtotal) === 30 && Number(o.delivery_fee) === 6.5 && Number(o.total) === 36.5, 'preço promocional + taxa de entrega: 2×15 + 6,50 = 36,50');

    await as('authenticated', ADMIN);
    e = await err(() => q(`update settings set data = data || '{"delivery_fee": "abc"}'::jsonb`));
    ok(e && e.includes('INVALID_SETTINGS'), 'taxa de entrega inválida é rejeitada');
    e = await err(() => q(`insert into products (category_id, name, variants) select id, 'X', '[{"id":"a","name":"P","price":0}]' from categories limit 1`));
    ok(e && e.includes('INVALID_VARIANT'), 'variação com preço zero é rejeitada');
    e = await err(() => q(`insert into products (category_id, name) select id, 'Sem preço' from categories limit 1`));
    ok(!!e, 'produto de preço fixo sem preço é rejeitado');
    e = await err(() => q(`update products set price = 0 where name = 'Pão de Leite'`));
    ok(!!e, 'preço zero é rejeitado');
    await q(`insert into categories (name, sort_order) values ('Salgados de Teste', 9)`);
    const catId = (await q(`select id from categories where name = 'Salgados de Teste'`)).rows[0].id;
    await q(`insert into products (category_id, name, price_mode, variants, addons) values ($1, 'Pão Teste Tamanhos', 'fixed',
        '[{"id":"p","name":"Pequeno","price":10,"weight_label":"400 g"},{"id":"g","name":"Grande","price":20,"promo_price":17,"weight_label":"800 g"},{"id":"x","name":"Desativado","price":5,"active":false}]',
        '[{"id":"q","name":"Queijo extra","price":3.5}]')`, [catId]);
    ok(true, 'admin cria categoria e produto com tamanhos, peso e adicionais');
    await as('anon');
    cat = (await q(`select public.get_catalog() c`)).rows[0].c;
    const pt = byName('Pão Teste Tamanhos');
    ok(pt && pt.variants.length === 2, 'variação desativada não aparece na loja');
    o = await rpc('create_order', base({ items: [{ product_id: pt.id, variant_id: 'g', addon_ids: ['q'], qty: 2 }], expected_total: 41 }));
    ok(Number(o.total) === 41 && o.items[0].weight_label === '800 g', 'variação promocional + adicional: 2×(17+3,50) = 41, peso 800 g');
    e = await err(() => rpc('create_order', base({ items: [{ product_id: pt.id, variant_id: 'x', qty: 1 }] })));
    ok(e && e.includes('INVALID_ITEM'), 'variação desativada não pode ser comprada');
    e = await err(() => rpc('create_order', base({ items: [{ product_id: pt.id, qty: 1 }] })));
    ok(e && e.includes('INVALID_ITEM'), 'produto com tamanhos exige escolha do tamanho');

    await as('authenticated', ADMIN);
    await q(`update products set active = false where name = 'Pão de Milho'`);
    await as('anon');
    cat = (await q(`select public.get_catalog() c`)).rows[0].c;
    ok(!byName('Pão de Milho'), 'produto desativado some da loja');
    await as(null);
    const milho = (await q(`select id from products where name = 'Pão de Milho'`)).rows[0].id;
    await as('anon');
    e = await err(() => rpc('create_order', base({ items: [{ product_id: milho, qty: 1 }] })));
    ok(e && e.includes('INVALID_ITEM'), 'produto desativado não pode ser pedido');

    console.log('\n6. Encomenda personalizada');
    const cref = uuid();
    let c = await rpc('create_order', { client_ref: cref, kind: 'personalizado', customer: { name: 'João Cliente', phone: '19977776666' },
        custom: { product_id: custom.id, filling: 'Calabresa com catupiry', ingredients: 'calabresa, catupiry', notes: 'bem recheado', qty: 3 } });
    ok(c.status === 'aguardando_orcamento' && c.total === null && c.items[0].unit_price === null, 'fica "aguardando orçamento", sem preço');
    await as('authenticated', ADMIN);
    e = await err(() => q(`select public.admin_set_status($1, 'em_preparo')`, [c.id]));
    ok(e && e.includes('QUOTE_REQUIRED'), 'não avança sem o valor confirmado');
    e = await err(() => q(`select public.admin_set_quote($1, 0)`, [c.id]));
    ok(!!e, 'valor zero é recusado');
    c = (await q(`select public.admin_set_quote($1, 12.5, 4) r`, [c.id])).rows[0].r;
    ok(c.status === 'confirmado' && Number(c.subtotal) === 37.5 && Number(c.total) === 41.5, 'admin confirma R$ 12,50 × 3 + R$ 4 entrega = R$ 41,50');
    c = (await q(`select public.admin_set_status($1, 'em_preparo', 'forno às 7h') r`, [c.id])).rows[0].r;
    ok(c.status === 'em_preparo' && c.status_history.length === 3, 'status atualizado e histórico registrado');
    c = (await q(`select public.admin_set_status($1, 'cancelado') r`, [c.id])).rows[0].r;
    ok(c.status === 'cancelado', 'pedido cancelado');

    console.log('\n7. Acompanhamento do cliente');
    await as('anon');
    const tr = (await q(`select public.track_orders($1::uuid[]) r`, [[p1.client_ref, cref]])).rows[0].r;
    ok(tr.length === 2 && !('customer_phone' in tr[0]), 'cliente vê só os próprios pedidos, sem dados pessoais');
    const none = (await q(`select public.track_orders($1::uuid[]) r`, [[uuid()]])).rows[0].r;
    ok(none.length === 0, 'referência desconhecida não retorna nada');

    console.log('\n8. Proteção contra abuso');
    let blocked = false;
    for (let i = 0; i < 8; i++) {
        const m = await err(() => rpc('create_order', base({ customer: { name: 'Robô', phone: '11900000000' } })));
        if (m && m.includes('TOO_MANY_ORDERS')) { blocked = true; break; }
    }
    ok(blocked, 'muitos pedidos seguidos do mesmo telefone são bloqueados');

    console.log('\n9. Desempenho com muitos produtos');
    await as(null);
    await db.exec(`insert into products (category_id, name, description, price, sort_order)
        select (select id from categories order by sort_order limit 1), 'Pão carga ' || g, repeat('descrição ', 8), 10 + (g % 30), 100 + g
        from generate_series(1, 1000) g;`);
    await as('anon');
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) cat = (await q(`select public.get_catalog() c`)).rows[0].c;
    const ms = (Date.now() - t0) / 5;
    const kb = Buffer.byteLength(JSON.stringify(cat)) / 1024;
    ok(cat.products.length > 1000, `catálogo com ${cat.products.length} produtos em ${ms.toFixed(1)} ms por consulta (PGlite/WASM), ${kb.toFixed(0)} KB`);
    const explain = (await q(`explain select * from products where active order by sort_order limit 20`)).rows.map(r => r['QUERY PLAN']).join(' ');
    console.log('    plano:', explain.slice(0, 120));

    console.log(`\n${passed} passaram, ${failed} falharam`);
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
