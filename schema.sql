-- ════════════════════════════════════════════════════════════════════
--  SABOR DE PÃO — Banco de dados (Supabase / PostgreSQL)
--  Execute no Supabase: SQL Editor → New query → cole tudo → Run.
--  É seguro executar novamente: nada é apagado (create ... if not exists /
--  create or replace / drop policy if exists).
--  Depois execute seed.sql UMA vez para carregar o cardápio inicial.
-- ════════════════════════════════════════════════════════════════════

-- ── Administradores ─────────────────────────────────────────────────
-- Usuários do Supabase Auth que podem alterar a loja.
create table if not exists public.admins (
    user_id    uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ── Versão do catálogo (invalidação de cache) ───────────────────────
create table if not exists public.store_meta (
    id smallint primary key default 1 check (id = 1),
    catalog_version bigint not null default 1,
    updated_at timestamptz not null default now()
);
insert into public.store_meta (id) values (1) on conflict do nothing;

create or replace function public.bump_catalog_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    update public.store_meta set catalog_version = catalog_version + 1, updated_at = now() where id = 1;
    return null;
end $$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ── Categorias ──────────────────────────────────────────────────────
create table if not exists public.categories (
    id          uuid primary key default gen_random_uuid(),
    slug        text unique,
    name        text not null check (char_length(name) between 1 and 80),
    description text not null default '',
    image_url   text not null default '',
    sort_order  integer not null default 0,
    active      boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index if not exists categories_sort_idx on public.categories (active, sort_order);

-- ── Produtos ────────────────────────────────────────────────────────
-- variants: [{id, name, price, promo_price, weight_label, active}]  (tamanhos, variações, sabores)
-- addons:   [{id, name, price, active}]                              (adicionais opcionais)
create table if not exists public.products (
    id           uuid primary key default gen_random_uuid(),
    category_id  uuid references public.categories(id) on delete set null,
    name         text not null check (char_length(name) between 1 and 120),
    description  text not null default '' check (char_length(description) <= 1000),
    flavors      text not null default '' check (char_length(flavors) <= 200),
    image_url    text not null default '',
    image_path   text,
    thumb_url    text not null default '',
    thumb_path   text,
    price_mode   text not null default 'fixed' check (price_mode in ('fixed', 'quote')),
    price        numeric(10,2) check (price is null or price > 0),
    promo_price  numeric(10,2) check (promo_price is null or promo_price > 0),
    unit         text not null default 'unidade' check (char_length(unit) between 1 and 30),
    weight_label text not null default '' check (char_length(weight_label) <= 30),
    variants     jsonb not null default '[]'::jsonb check (jsonb_typeof(variants) = 'array'),
    addons       jsonb not null default '[]'::jsonb check (jsonb_typeof(addons) = 'array'),
    featured     boolean not null default false,
    active       boolean not null default true,
    sort_order   integer not null default 0,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    -- produto de preço fixo precisa de preço (no produto ou nas variações)
    constraint products_price_required check (
        price_mode = 'quote' or price is not null or jsonb_array_length(variants) > 0
    )
);
create index if not exists products_catalog_idx  on public.products (active, sort_order);
create index if not exists products_category_idx on public.products (category_id, sort_order);

-- Valida variações e adicionais (preços positivos, ids e nomes presentes)
create or replace function public.validate_product() returns trigger
language plpgsql as $$
declare v jsonb;
begin
    for v in select * from jsonb_array_elements(new.variants) loop
        if coalesce(v->>'id', '') = '' or coalesce(trim(v->>'name'), '') = '' then
            raise exception 'INVALID_VARIANT: id e nome são obrigatórios';
        end if;
        if new.price_mode = 'fixed' and (jsonb_typeof(v->'price') <> 'number' or (v->>'price')::numeric <= 0) then
            raise exception 'INVALID_VARIANT: preço da variação "%" deve ser maior que zero', v->>'name';
        end if;
        if v ? 'promo_price' and jsonb_typeof(v->'promo_price') not in ('number', 'null') then
            raise exception 'INVALID_VARIANT: preço promocional inválido';
        end if;
    end loop;
    for v in select * from jsonb_array_elements(new.addons) loop
        if coalesce(v->>'id', '') = '' or coalesce(trim(v->>'name'), '') = ''
           or jsonb_typeof(v->'price') <> 'number' or (v->>'price')::numeric < 0 then
            raise exception 'INVALID_ADDON: adicional "%" inválido', coalesce(v->>'name', '');
        end if;
    end loop;
    if new.price_mode = 'quote' then new.promo_price := null; end if;
    return new;
end $$;

-- ── Configurações da loja (um único registro) ───────────────────────
create table if not exists public.settings (
    id         smallint primary key default 1 check (id = 1),
    data       jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
    updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict do nothing;

create or replace function public.validate_settings() returns trigger
language plpgsql as $$
begin
    if new.data ? 'delivery_fee' and jsonb_typeof(new.data->'delivery_fee') not in ('number', 'null') then
        raise exception 'INVALID_SETTINGS: taxa de entrega deve ser numérica';
    end if;
    if jsonb_typeof(new.data->'delivery_fee') = 'number' and (new.data->>'delivery_fee')::numeric < 0 then
        raise exception 'INVALID_SETTINGS: taxa de entrega negativa';
    end if;
    return new;
end $$;

-- ── Pedidos ─────────────────────────────────────────────────────────
create sequence if not exists public.order_code_seq start 1001;

create table if not exists public.orders (
    id               uuid primary key default gen_random_uuid(),
    code             text not null unique default ('SP' || nextval('public.order_code_seq')::text),
    client_ref       uuid not null unique,          -- chave de idempotência (evita duplicação)
    kind             text not null default 'normal' check (kind in ('normal', 'personalizado')),
    status           text not null default 'pendente' check (status in
                     ('aguardando_orcamento','pendente','confirmado','em_preparo','pronto','saiu_entrega','concluido','cancelado')),
    customer_name    text not null check (char_length(customer_name) between 2 and 100),
    customer_phone   text not null check (customer_phone ~ '^[0-9]{10,13}$'),
    fulfillment      text check (fulfillment in ('entrega', 'retirada')),
    address          jsonb,
    scheduled_for    date,
    payment_method   text check (payment_method in ('pix', 'dinheiro', 'debito', 'credito')),
    change_for       text not null default '',
    notes            text not null default '' check (char_length(notes) <= 1000),
    items            jsonb not null check (jsonb_typeof(items) = 'array'),
    subtotal         numeric(10,2),
    delivery_fee     numeric(10,2),
    delivery_pending boolean not null default false,
    total            numeric(10,2),
    status_history   jsonb not null default '[]'::jsonb,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    -- pedido comum sempre tem total válido; personalizado só depois do orçamento
    constraint orders_total_valid check (
        (status = 'aguardando_orcamento') or (status = 'cancelado') or (total is not null and total > 0)
    )
);
create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists orders_status_idx  on public.orders (status, created_at desc);
create index if not exists orders_phone_idx   on public.orders (customer_phone, created_at desc);

-- ── Triggers ────────────────────────────────────────────────────────
drop trigger if exists categories_touch on public.categories;
create trigger categories_touch before update on public.categories for each row execute function public.touch_updated_at();
drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();
drop trigger if exists products_validate on public.products;
create trigger products_validate before insert or update on public.products for each row execute function public.validate_product();
drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings for each row execute function public.touch_updated_at();
drop trigger if exists settings_validate on public.settings;
create trigger settings_validate before insert or update on public.settings for each row execute function public.validate_settings();
drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

drop trigger if exists categories_bump on public.categories;
create trigger categories_bump after insert or update or delete on public.categories for each statement execute function public.bump_catalog_version();
drop trigger if exists products_bump on public.products;
create trigger products_bump after insert or update or delete on public.products for each statement execute function public.bump_catalog_version();
drop trigger if exists settings_bump on public.settings;
create trigger settings_bump after insert or update or delete on public.settings for each statement execute function public.bump_catalog_version();

-- ════════════════════════════════════════════════════════════════════
--  FUNÇÕES PÚBLICAS (chamadas pela loja)
-- ════════════════════════════════════════════════════════════════════

-- Catálogo completo em UMA consulta: configurações, categorias, produtos e mais vendidos.
create or replace function public.get_catalog() returns jsonb
language sql stable security definer set search_path = public as $$
    select jsonb_build_object(
        'version',    (select catalog_version from public.store_meta where id = 1),
        'settings',   (select data from public.settings where id = 1),
        'categories', coalesce((
            select jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'description', c.description,
                                                'image_url', c.image_url, 'sort_order', c.sort_order) order by c.sort_order, c.name)
            from public.categories c where c.active), '[]'::jsonb),
        'products', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', p.id, 'category_id', p.category_id, 'name', p.name, 'description', p.description, 'flavors', p.flavors,
                'image_url', p.image_url, 'thumb_url', p.thumb_url, 'price_mode', p.price_mode, 'price', p.price,
                'promo_price', p.promo_price, 'unit', p.unit, 'weight_label', p.weight_label,
                'variants', (select coalesce(jsonb_agg(v), '[]'::jsonb) from jsonb_array_elements(p.variants) v where coalesce((v->>'active')::boolean, true)),
                'addons',   (select coalesce(jsonb_agg(a), '[]'::jsonb) from jsonb_array_elements(p.addons) a where coalesce((a->>'active')::boolean, true)),
                'featured', p.featured, 'sort_order', p.sort_order) order by c.sort_order, p.sort_order, p.name)
            from public.products p join public.categories c on c.id = p.category_id
            where p.active and c.active), '[]'::jsonb),
        'best_sellers', coalesce((
            select jsonb_agg(t.pid order by t.q desc) from (
                select i->>'product_id' as pid, sum((i->>'qty')::int) as q
                from public.orders o cross join lateral jsonb_array_elements(o.items) i
                where o.kind = 'normal' and o.status not in ('cancelado')
                  and o.created_at > now() - interval '120 days'
                group by 1 order by 2 desc limit 6) t), '[]'::jsonb)
    );
$$;

-- Representação do pedido devolvida ao cliente/painel
create or replace function public.order_json(o public.orders) returns jsonb
language sql stable as $$
    select jsonb_build_object(
        'id', o.id, 'code', o.code, 'client_ref', o.client_ref, 'kind', o.kind, 'status', o.status,
        'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
        'fulfillment', o.fulfillment, 'address', o.address, 'scheduled_for', o.scheduled_for,
        'payment_method', o.payment_method, 'change_for', o.change_for, 'notes', o.notes,
        'items', o.items, 'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee,
        'delivery_pending', o.delivery_pending, 'total', o.total,
        'status_history', o.status_history, 'created_at', o.created_at, 'updated_at', o.updated_at);
$$;

-- Registro do pedido com VALIDAÇÃO DE PREÇOS NO SERVIDOR.
-- O navegador envia apenas ids e quantidades; os valores vêm do banco.
create or replace function public.create_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_ref       uuid;
    v_existing  public.orders;
    v_order     public.orders;
    v_settings  jsonb;
    v_kind      text := coalesce(p->>'kind', 'normal');
    v_name      text := trim(coalesce(p #>> '{customer,name}', ''));
    v_phone     text := regexp_replace(coalesce(p #>> '{customer,phone}', ''), '\D', '', 'g');
    v_fulfill   text := p->>'fulfillment';
    v_pay       text := p->>'payment_method';
    v_address   jsonb;
    v_sched     date;
    v_today     date := (now() at time zone 'America/Sao_Paulo')::date;
    v_items     jsonb := '[]'::jsonb;
    v_it        jsonb;
    v_prod      public.products;
    v_variant   jsonb;
    v_addon     jsonb;
    v_addon_id  text;
    v_addons    jsonb;
    v_unit      numeric;
    v_qty       int;
    v_sub       numeric := 0;
    v_fee       numeric;
    v_pending   boolean := false;
    v_total     numeric;
    v_expected  numeric;
    v_custom    jsonb;
    v_status    text;
begin
    -- Idempotência: o mesmo client_ref nunca gera dois pedidos
    begin
        v_ref := (p->>'client_ref')::uuid;
    exception when others then
        raise exception 'INVALID_REQUEST: client_ref';
    end;
    if v_ref is null then raise exception 'INVALID_REQUEST: client_ref'; end if;
    select * into v_existing from public.orders where client_ref = v_ref;
    if found then return public.order_json(v_existing) || jsonb_build_object('duplicate', true); end if;

    -- Cliente
    if char_length(v_name) < 2 or char_length(v_name) > 100 or char_length(v_phone) not between 10 and 13 then
        raise exception 'INVALID_CUSTOMER';
    end if;
    -- Limite simples contra abuso: até 6 pedidos por telefone a cada 10 minutos
    if (select count(*) from public.orders where customer_phone = v_phone and created_at > now() - interval '10 minutes') >= 6 then
        raise exception 'TOO_MANY_ORDERS';
    end if;

    select data into v_settings from public.settings where id = 1;
    v_settings := coalesce(v_settings, '{}'::jsonb);

    if p ? 'scheduled_for' and coalesce(p->>'scheduled_for', '') <> '' then
        begin
            v_sched := (p->>'scheduled_for')::date;
        exception when others then
            raise exception 'INVALID_DATE';
        end;
        if v_sched < v_today or v_sched > v_today + 120 then raise exception 'INVALID_DATE'; end if;
    end if;

    -- ── Encomenda personalizada (Recheio do Seu Jeito) ──────────────
    if v_kind = 'personalizado' then
        select * into v_prod from public.products
         where id = (p #>> '{custom,product_id}')::uuid and active and price_mode = 'quote';
        if not found then raise exception 'INVALID_ITEM'; end if;
        v_qty := coalesce((p #>> '{custom,qty}')::int, 0);
        if v_qty < 1 or v_qty > 500 then raise exception 'INVALID_ITEM: quantidade'; end if;
        v_custom := jsonb_build_object(
            'filling',     left(trim(coalesce(p #>> '{custom,filling}', '')), 300),
            'ingredients', left(trim(coalesce(p #>> '{custom,ingredients}', '')), 500),
            'notes',       left(trim(coalesce(p #>> '{custom,notes}', '')), 500));
        if char_length(v_custom->>'filling') < 2 then raise exception 'INVALID_ITEM: recheio'; end if;
        v_items := jsonb_build_array(jsonb_build_object(
            'product_id', v_prod.id, 'name', v_prod.name, 'variant_id', null, 'variant_name', null,
            'weight_label', v_prod.weight_label, 'addons', '[]'::jsonb, 'qty', v_qty,
            'unit_price', null, 'total', null, 'custom', v_custom));
        insert into public.orders (client_ref, kind, status, customer_name, customer_phone, fulfillment,
                                   scheduled_for, notes, items, status_history)
        values (v_ref, 'personalizado', 'aguardando_orcamento', v_name, v_phone,
                case when v_fulfill in ('entrega', 'retirada') then v_fulfill end,
                v_sched, left(coalesce(p->>'notes', ''), 1000), v_items,
                jsonb_build_array(jsonb_build_object('status', 'aguardando_orcamento', 'at', now())))
        on conflict (client_ref) do nothing
        returning * into v_order;
        if v_order.id is null then select * into v_order from public.orders where client_ref = v_ref; end if;
        return public.order_json(v_order);
    end if;

    if v_kind <> 'normal' then raise exception 'INVALID_REQUEST: kind'; end if;

    -- ── Pedido comum ────────────────────────────────────────────────
    if v_fulfill not in ('entrega', 'retirada') then raise exception 'INVALID_FULFILLMENT'; end if;
    if v_fulfill = 'entrega' and coalesce((v_settings->>'delivery_enabled')::boolean, true) = false then raise exception 'INVALID_FULFILLMENT'; end if;
    if v_fulfill = 'retirada' and coalesce((v_settings->>'pickup_enabled')::boolean, true) = false then raise exception 'INVALID_FULFILLMENT'; end if;
    if v_pay not in ('pix', 'dinheiro', 'debito', 'credito') then raise exception 'INVALID_PAYMENT'; end if;

    if v_fulfill = 'entrega' then
        v_address := jsonb_build_object(
            'street',     left(trim(coalesce(p #>> '{address,street}', '')), 150),
            'number',     left(trim(coalesce(p #>> '{address,number}', '')), 20),
            'complement', left(trim(coalesce(p #>> '{address,complement}', '')), 100),
            'district',   left(trim(coalesce(p #>> '{address,district}', '')), 100),
            'city',       left(trim(coalesce(p #>> '{address,city}', '')), 100),
            'reference',  left(trim(coalesce(p #>> '{address,reference}', '')), 150));
        if v_address->>'street' = '' or v_address->>'number' = '' or v_address->>'district' = '' or v_address->>'city' = '' then
            raise exception 'INVALID_ADDRESS';
        end if;
        if jsonb_typeof(v_settings->'delivery_fee') = 'number' then
            v_fee := round((v_settings->>'delivery_fee')::numeric, 2);
        else
            v_fee := null; v_pending := true;      -- taxa ainda não configurada: "a combinar"
        end if;
    else
        v_fee := 0;
    end if;

    if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') = 0 then raise exception 'EMPTY_ORDER'; end if;
    if jsonb_array_length(p->'items') > 50 then raise exception 'INVALID_REQUEST: itens demais'; end if;

    for v_it in select * from jsonb_array_elements(p->'items') loop
        begin
            v_qty := (v_it->>'qty')::int;
        exception when others then
            raise exception 'INVALID_ITEM: quantidade';
        end;
        if v_qty is null or v_qty < 1 or v_qty > 99 then raise exception 'INVALID_ITEM: quantidade'; end if;

        select pr.* into v_prod from public.products pr join public.categories c on c.id = pr.category_id
         where pr.id::text = (v_it->>'product_id') and pr.active and c.active;
        if not found then raise exception 'INVALID_ITEM'; end if;
        if v_prod.price_mode = 'quote' then raise exception 'QUOTE_PRODUCT'; end if;

        v_variant := null;
        if exists (select 1 from jsonb_array_elements(v_prod.variants) x where coalesce((x->>'active')::boolean, true)) then
            select x into v_variant from jsonb_array_elements(v_prod.variants) x
             where x->>'id' = v_it->>'variant_id' and coalesce((x->>'active')::boolean, true) limit 1;
            if v_variant is null then raise exception 'INVALID_ITEM: variação'; end if;
            v_unit := (v_variant->>'price')::numeric;
            if jsonb_typeof(v_variant->'promo_price') = 'number' and (v_variant->>'promo_price')::numeric > 0
               and (v_variant->>'promo_price')::numeric < v_unit then
                v_unit := (v_variant->>'promo_price')::numeric;
            end if;
        else
            v_unit := v_prod.price;
            if v_prod.promo_price is not null and v_prod.promo_price < v_unit then v_unit := v_prod.promo_price; end if;
        end if;
        if v_unit is null or v_unit <= 0 then raise exception 'INVALID_ITEM: preço'; end if;

        v_addons := '[]'::jsonb;
        if jsonb_typeof(v_it->'addon_ids') = 'array' then
            for v_addon_id in select jsonb_array_elements_text(v_it->'addon_ids') loop
                select a into v_addon from jsonb_array_elements(v_prod.addons) a
                 where a->>'id' = v_addon_id and coalesce((a->>'active')::boolean, true) limit 1;
                if v_addon is null then raise exception 'INVALID_ITEM: adicional'; end if;
                v_unit := v_unit + (v_addon->>'price')::numeric;
                v_addons := v_addons || jsonb_build_array(jsonb_build_object('id', v_addon->>'id', 'name', v_addon->>'name', 'price', (v_addon->>'price')::numeric));
                v_addon := null;
            end loop;
        end if;

        v_unit := round(v_unit, 2);
        v_sub := v_sub + v_unit * v_qty;
        v_items := v_items || jsonb_build_array(jsonb_build_object(
            'product_id', v_prod.id, 'name', v_prod.name,
            'variant_id', v_variant->>'id', 'variant_name', v_variant->>'name',
            'weight_label', coalesce(nullif(v_variant->>'weight_label', ''), v_prod.weight_label),
            'unit', v_prod.unit, 'addons', v_addons, 'qty', v_qty,
            'unit_price', v_unit, 'total', round(v_unit * v_qty, 2)));
    end loop;

    v_sub := round(v_sub, 2);
    v_total := v_sub + coalesce(v_fee, 0);

    -- O cliente envia o total que está vendo; se o preço mudou, não registra.
    if p ? 'expected_total' and jsonb_typeof(p->'expected_total') = 'number' then
        v_expected := (p->>'expected_total')::numeric;
        if abs(v_expected - v_total) > 0.009 then
            raise exception 'PRICE_CHANGED' using detail = jsonb_build_object('subtotal', v_sub, 'delivery_fee', v_fee, 'total', v_total)::text;
        end if;
    end if;

    v_status := 'pendente';
    insert into public.orders (client_ref, kind, status, customer_name, customer_phone, fulfillment, address,
                               scheduled_for, payment_method, change_for, notes, items, subtotal,
                               delivery_fee, delivery_pending, total, status_history)
    values (v_ref, 'normal', v_status, v_name, v_phone, v_fulfill, v_address, v_sched, v_pay,
            case when v_pay = 'dinheiro' then left(coalesce(p->>'change_for', ''), 30) else '' end,
            left(coalesce(p->>'notes', ''), 1000), v_items, v_sub, v_fee, v_pending, v_total,
            jsonb_build_array(jsonb_build_object('status', v_status, 'at', now())))
    on conflict (client_ref) do nothing
    returning * into v_order;
    if v_order.id is null then
        select * into v_order from public.orders where client_ref = v_ref;
        return public.order_json(v_order) || jsonb_build_object('duplicate', true);
    end if;
    return public.order_json(v_order);
end $$;

-- Acompanhamento: o cliente só enxerga pedidos cujo client_ref (aleatório) ele possui.
create or replace function public.track_orders(refs uuid[]) returns jsonb
language sql stable security definer set search_path = public as $$
    select coalesce(jsonb_agg(jsonb_build_object(
        'client_ref', o.client_ref, 'code', o.code, 'kind', o.kind, 'status', o.status,
        'fulfillment', o.fulfillment, 'scheduled_for', o.scheduled_for, 'total', o.total,
        'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee, 'delivery_pending', o.delivery_pending,
        'items', (select jsonb_agg(jsonb_build_object('name', i->>'name', 'variant_name', i->>'variant_name', 'qty', (i->>'qty')::int,
                                                      'unit_price', i->'unit_price', 'total', i->'total'))
                  from jsonb_array_elements(o.items) i),
        'created_at', o.created_at, 'updated_at', o.updated_at) order by o.created_at desc), '[]'::jsonb)
    from public.orders o
    where o.client_ref = any(refs[1:30]);
$$;

-- ════════════════════════════════════════════════════════════════════
--  FUNÇÕES DO PAINEL (somente administradores)
-- ════════════════════════════════════════════════════════════════════
create or replace function public.admin_set_status(p_order uuid, p_status text, p_note text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.orders;
begin
    if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
    if p_status not in ('aguardando_orcamento','pendente','confirmado','em_preparo','pronto','saiu_entrega','concluido','cancelado') then
        raise exception 'INVALID_REQUEST: status';
    end if;
    select * into v from public.orders where id = p_order for update;
    if not found then raise exception 'INVALID_REQUEST: pedido'; end if;
    if p_status not in ('cancelado', 'aguardando_orcamento') and v.total is null then raise exception 'QUOTE_REQUIRED'; end if;
    update public.orders set status = p_status,
        status_history = status_history || jsonb_build_array(jsonb_build_object('status', p_status, 'at', now(), 'note', left(coalesce(p_note, ''), 300)))
    where id = p_order returning * into v;
    return public.order_json(v);
end $$;

-- Confirma o preço de uma encomenda personalizada (nunca aceita zero).
create or replace function public.admin_set_quote(p_order uuid, p_unit_price numeric, p_delivery_fee numeric default 0, p_note text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.orders; v_item jsonb; v_sub numeric; v_fee numeric := round(coalesce(p_delivery_fee, 0), 2);
begin
    if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
    if p_unit_price is null or p_unit_price <= 0 then raise exception 'INVALID_REQUEST: valor deve ser maior que zero'; end if;
    if v_fee < 0 then raise exception 'INVALID_REQUEST: taxa'; end if;
    select * into v from public.orders where id = p_order for update;
    if not found or v.kind <> 'personalizado' then raise exception 'INVALID_REQUEST: pedido'; end if;
    if v.status in ('cancelado', 'concluido') then raise exception 'INVALID_REQUEST: pedido encerrado'; end if;
    v_item := v.items->0;
    v_sub := round(round(p_unit_price, 2) * (v_item->>'qty')::int, 2);
    v_item := v_item || jsonb_build_object('unit_price', round(p_unit_price, 2), 'total', v_sub);
    update public.orders set
        items = jsonb_build_array(v_item), subtotal = v_sub, delivery_fee = v_fee, delivery_pending = false,
        total = v_sub + v_fee,
        status = case when status = 'aguardando_orcamento' then 'confirmado' else status end,
        status_history = status_history || jsonb_build_array(jsonb_build_object('status', 'confirmado', 'at', now(),
                         'note', 'Valor confirmado: ' || to_char(round(p_unit_price, 2), 'FM999990.00') || coalesce(' — ' || nullif(p_note, ''), '')))
    where id = p_order returning * into v;
    return public.order_json(v);
end $$;

-- ════════════════════════════════════════════════════════════════════
--  SEGURANÇA — Row Level Security
-- ════════════════════════════════════════════════════════════════════
alter table public.admins     enable row level security;
alter table public.store_meta enable row level security;
alter table public.categories enable row level security;
alter table public.products   enable row level security;
alter table public.settings   enable row level security;
alter table public.orders     enable row level security;

drop policy if exists admins_self_read on public.admins;
create policy admins_self_read on public.admins for select to authenticated using (user_id = auth.uid());

drop policy if exists store_meta_read on public.store_meta;
create policy store_meta_read on public.store_meta for select to anon, authenticated using (true);

drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories for select to anon, authenticated using (active or public.is_admin());
drop policy if exists categories_admin on public.categories;
create policy categories_admin on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists products_read on public.products;
create policy products_read on public.products for select to anon, authenticated using (active or public.is_admin());
drop policy if exists products_admin on public.products;
create policy products_admin on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select to anon, authenticated using (true);
drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Pedidos: ninguém lê/insere diretamente. Clientes usam create_order/track_orders.
drop policy if exists orders_admin_read on public.orders;
create policy orders_admin_read on public.orders for select to authenticated using (public.is_admin());
drop policy if exists orders_admin_update on public.orders;
create policy orders_admin_update on public.orders for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists orders_admin_delete on public.orders;
create policy orders_admin_delete on public.orders for delete to authenticated using (public.is_admin());

revoke insert, update, delete on public.orders from anon;
revoke all on public.admins from anon;
revoke execute on function public.admin_set_status(uuid, text, text) from anon, public;
revoke execute on function public.admin_set_quote(uuid, numeric, numeric, text) from anon, public;
grant execute on function public.admin_set_status(uuid, text, text) to authenticated;
grant execute on function public.admin_set_quote(uuid, numeric, numeric, text) to authenticated;
grant execute on function public.get_catalog() to anon, authenticated;
grant execute on function public.create_order(jsonb) to anon, authenticated;
grant execute on function public.track_orders(uuid[]) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════
--  STORAGE — fotos dos produtos (bucket público para leitura)
-- ════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('imagens', 'imagens', true, 5242880, array['image/webp', 'image/jpeg', 'image/png', 'image/avif'])
on conflict (id) do nothing;

drop policy if exists imagens_admin_select on storage.objects;
create policy imagens_admin_select on storage.objects for select to authenticated using (bucket_id = 'imagens' and public.is_admin());
drop policy if exists imagens_admin_insert on storage.objects;
create policy imagens_admin_insert on storage.objects for insert to authenticated with check (bucket_id = 'imagens' and public.is_admin());
drop policy if exists imagens_admin_update on storage.objects;
create policy imagens_admin_update on storage.objects for update to authenticated using (bucket_id = 'imagens' and public.is_admin());
drop policy if exists imagens_admin_delete on storage.objects;
create policy imagens_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'imagens' and public.is_admin());
