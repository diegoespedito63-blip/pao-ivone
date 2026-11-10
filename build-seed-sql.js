// Gera seed.sql a partir de seed.js
// Uso: node build-seed-sql.js
const fs = require('fs');
const path = require('path');
const SEED = require('./seed.js');

const q = v => v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const n = v => v === null || v === undefined ? 'null' : Number(v).toFixed(2);
const j = v => `${q(JSON.stringify(v))}::jsonb`;

let sql = `-- ════════════════════════════════════════════════════════════════════
--  SABOR DE PÃO — Carga inicial do cardápio (gerado por build-seed-sql.js)
--  Execute UMA vez, depois do schema.sql. Só insere se ainda não houver produtos,
--  então não sobrescreve nada que já tenha sido editado no painel.
-- ════════════════════════════════════════════════════════════════════
do $$
begin
  if exists (select 1 from public.products) then
    raise notice 'Cardápio já existe — carga inicial ignorada.';
    return;
  end if;

`;
for (const c of SEED.categories) {
    sql += `  insert into public.categories (slug, name, description, image_url, sort_order) values (${q(c.slug)}, ${q(c.name)}, ${q(c.description)}, ${q(c.image_url)}, ${c.sort_order}) on conflict (slug) do nothing;\n`;
}
sql += '\n';
for (const p of SEED.products) {
    sql += `  insert into public.products (category_id, name, description, flavors, image_url, price_mode, price, promo_price, unit, weight_label, variants, addons, featured, active, sort_order)
    select id, ${q(p.name)}, ${q(p.description)}, ${q(p.flavors)}, ${q(p.image_url)}, ${q(p.price_mode)}, ${n(p.price)}, ${n(p.promo_price)}, ${q(p.unit)}, ${q(p.weight_label)}, ${j(p.variants)}, ${j(p.addons)}, ${p.featured}, ${p.active}, ${p.sort_order}
    from public.categories where slug = ${q(p.category)};\n`;
}
sql += `
  -- Configurações iniciais (só preenche chaves que ainda não existem)
  update public.settings set data = ${j(SEED.settings)} || data where id = 1;
end $$;
`;
const out = path.join(__dirname, 'seed.sql');
fs.writeFileSync(out, sql, 'utf8');
console.log('Gerado:', out, `(${SEED.products.length} produtos, ${SEED.categories.length} categorias)`);
