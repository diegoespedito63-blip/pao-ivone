-- ════════════════════════════════════════════════════════════════════
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

  insert into public.categories (slug, name, description, image_url, sort_order) values ('tradicionais', 'Pães Tradicionais', 'Os clássicos de todo dia, feitos com carinho.', 'https://images.unsplash.com/photo-1598373182133-52452f7691ef', 1) on conflict (slug) do nothing;
  insert into public.categories (slug, name, description, image_url, sort_order) values ('recheados', 'Pães Recheados e Especiais', 'Recheios generosos para lanches e encontros.', 'https://images.unsplash.com/photo-1788619227437-f8de539a54c4', 2) on conflict (slug) do nothing;
  insert into public.categories (slug, name, description, image_url, sort_order) values ('doces', 'Pães Doces, Roscas e Cucas', 'Docinhos para adoçar o café da tarde.', 'https://images.unsplash.com/photo-1775172258063-8f20e384503c', 3) on conflict (slug) do nothing;

  insert into public.products (category_id, name, description, flavors, image_url, price_mode, price, promo_price, unit, weight_label, variants, addons, featured, active, sort_order)
    select id, 'Pão Tradicional', 'Massa macia e casquinha dourada, do jeitinho caseiro. Perfeito para o café da manhã e o lanche da tarde.', '', 'https://images.unsplash.com/photo-1598373182133-52452f7691ef', 'fixed', 17.00, null, 'unidade', '', '[]'::jsonb, '[]'::jsonb, false, true, 1
    from public.categories where slug = 'tradicionais';
  insert into public.products (category_id, name, description, flavors, image_url, price_mode, price, promo_price, unit, weight_label, variants, addons, featured, active, sort_order)
    select id, 'Pão de Leite', 'Massa fofinha e levemente adocicada, preparada com leite. Ideal para o café em família.', '', 'https://images.unsplash.com/photo-1620921568790-c1cf8984624c', 'fixed', 19.00, null, 'unidade', '', '[]'::jsonb, '[]'::jsonb, false, true, 2
    from public.categories where slug = 'tradicionais';
  insert into public.products (category_id, name, description, flavors, image_url, price_mode, price, promo_price, unit, weight_label, variants, addons, featured, active, sort_order)
    select id, 'Pão de Cebola', 'Pão macio com o sabor marcante da cebola. Ótimo para lanches e para acompanhar refeições.', 'Cebola', 'https://images.unsplash.com/photo-1552056413-b8b5eed0170b', 'fixed', 18.00, null, 'unidade', '', '[]'::jsonb, '[]'::jsonb, false, true, 3
    from public.categories where slug = 'tradicionais';
  insert into public.products (category_id, name, description, flavors, image_url, price_mode, price, promo_price, unit, weight_label, variants, addons, featured, active, sort_order)
    select id, 'Pão de Milho', 'Massa macia com o sabor e a cor dourada do milho. Uma delícia com manteiga e café.', 'Milho', 'https://images.unsplash.com/photo-1724079908191-5f7fb8d34c6f', 'fixed', 19.00, null, 'unidade', '', '[]'::jsonb, '[]'::jsonb, false, true, 4
    from public.categories where slug = 'tradicionais';
  insert into public.products (category_id, name, description, flavors, image_url, price_mode, price, promo_price, unit, weight_label, variants, addons, featured, active, sort_order)
    select id, 'Pão Integral', 'Preparado com farinha integral, de sabor rústico e textura macia.', '', 'https://images.unsplash.com/photo-1549931319-a545dcf3bc73', 'fixed', 19.00, null, 'unidade', '', '[]'::jsonb, '[]'::jsonb, false, true, 5
    from public.categories where slug = 'tradicionais';
  insert into public.products (category_id, name, description, flavors, image_url, price_mode, price, promo_price, unit, weight_label, variants, addons, featured, active, sort_order)
    select id, 'Pão Recheado de Frango com Requeijão', 'Pão macio recheado com frango e requeijão cremoso.', 'Frango, Requeijão', 'https://images.unsplash.com/photo-1788619227437-f8de539a54c4', 'fixed', 29.00, null, 'unidade', '', '[]'::jsonb, '[]'::jsonb, false, true, 6
    from public.categories where slug = 'recheados';
  insert into public.products (category_id, name, description, flavors, image_url, price_mode, price, promo_price, unit, weight_label, variants, addons, featured, active, sort_order)
    select id, 'Enroladão 3 Queijos', 'Massa enrolada e recheada com três queijos.', '3 queijos', 'https://images.unsplash.com/photo-1693893139747-2824ce88515a', 'fixed', 32.00, null, 'unidade', '', '[]'::jsonb, '[]'::jsonb, true, true, 7
    from public.categories where slug = 'recheados';
  insert into public.products (category_id, name, description, flavors, image_url, price_mode, price, promo_price, unit, weight_label, variants, addons, featured, active, sort_order)
    select id, 'Pão Recheado Napolitano', 'Pão macio com recheio no estilo napolitano.', 'Napolitano', 'https://images.unsplash.com/photo-1619535860434-ba1d8fa12536', 'fixed', 29.00, null, 'unidade', '', '[]'::jsonb, '[]'::jsonb, false, true, 8
    from public.categories where slug = 'recheados';
  insert into public.products (category_id, name, description, flavors, image_url, price_mode, price, promo_price, unit, weight_label, variants, addons, featured, active, sort_order)
    select id, 'Pão de Frango com Requeijão e Mussarela', 'Pão recheado com frango, requeijão e mussarela.', 'Frango, Requeijão, Mussarela', 'https://images.unsplash.com/photo-1788619227437-f8de539a54c4', 'fixed', 32.00, null, 'unidade', '', '[]'::jsonb, '[]'::jsonb, false, true, 9
    from public.categories where slug = 'recheados';
  insert into public.products (category_id, name, description, flavors, image_url, price_mode, price, promo_price, unit, weight_label, variants, addons, featured, active, sort_order)
    select id, 'Pão de Frango com Requeijão e Palmito', 'Pão recheado com frango, requeijão e palmito.', 'Frango, Requeijão, Palmito', 'https://images.unsplash.com/photo-1619531040576-f9416740661b', 'fixed', 32.00, null, 'unidade', '', '[]'::jsonb, '[]'::jsonb, false, true, 10
    from public.categories where slug = 'recheados';
  insert into public.products (category_id, name, description, flavors, image_url, price_mode, price, promo_price, unit, weight_label, variants, addons, featured, active, sort_order)
    select id, 'Pão Recheado Vegetariano', 'Pão recheado na versão vegetariana, sem carne.', 'Vegetariano', 'https://images.unsplash.com/photo-1581339399838-2a120c18bba3', 'fixed', 32.00, null, 'unidade', '', '[]'::jsonb, '[]'::jsonb, false, true, 11
    from public.categories where slug = 'recheados';
  insert into public.products (category_id, name, description, flavors, image_url, price_mode, price, promo_price, unit, weight_label, variants, addons, featured, active, sort_order)
    select id, 'Pão Recheado 5 Queijos', 'Pão recheado com cinco queijos.', '5 queijos', 'https://images.unsplash.com/photo-1693893139747-2824ce88515a', 'fixed', 32.00, null, 'unidade', '', '[]'::jsonb, '[]'::jsonb, false, true, 12
    from public.categories where slug = 'recheados';
  insert into public.products (category_id, name, description, flavors, image_url, price_mode, price, promo_price, unit, weight_label, variants, addons, featured, active, sort_order)
    select id, 'Sabor Tudo 700 gramas', 'O pão recheado Sabor Tudo, no tamanho de 700 gramas.', 'Sabor Tudo', 'https://images.unsplash.com/photo-1581339399838-2a120c18bba3', 'fixed', 38.00, null, 'unidade', '700 g', '[]'::jsonb, '[]'::jsonb, false, true, 13
    from public.categories where slug = 'recheados';
  insert into public.products (category_id, name, description, flavors, image_url, price_mode, price, promo_price, unit, weight_label, variants, addons, featured, active, sort_order)
    select id, 'Sabor Tudo 1 quilo', 'O pão recheado Sabor Tudo, no tamanho de 1 quilo.', 'Sabor Tudo', 'https://images.unsplash.com/photo-1581339399838-2a120c18bba3', 'fixed', 48.00, null, 'unidade', '1 kg', '[]'::jsonb, '[]'::jsonb, true, true, 14
    from public.categories where slug = 'recheados';
  insert into public.products (category_id, name, description, flavors, image_url, price_mode, price, promo_price, unit, weight_label, variants, addons, featured, active, sort_order)
    select id, 'Recheio do Seu Jeito — Seu Pãozinho', 'Monte o pãozinho com o recheio que você quiser. Conte sua ideia e consultamos valor e disponibilidade.', 'Personalizado', 'https://images.unsplash.com/photo-1776099536340-780ba11e159d', 'quote', null, null, 'unidade', '', '[]'::jsonb, '[]'::jsonb, false, true, 15
    from public.categories where slug = 'recheados';
  insert into public.products (category_id, name, description, flavors, image_url, price_mode, price, promo_price, unit, weight_label, variants, addons, featured, active, sort_order)
    select id, 'Rosca de Goiabada', 'Rosca macia recheada com goiabada.', 'Goiabada', 'https://images.unsplash.com/photo-1775172258063-8f20e384503c', 'fixed', 19.00, null, 'unidade', '', '[]'::jsonb, '[]'::jsonb, false, true, 16
    from public.categories where slug = 'doces';
  insert into public.products (category_id, name, description, flavors, image_url, price_mode, price, promo_price, unit, weight_label, variants, addons, featured, active, sort_order)
    select id, 'Rosca de Coco com Leite Condensado', 'Rosca macia com coco e leite condensado.', 'Coco, Leite condensado', 'https://images.unsplash.com/photo-1624772423353-342e62547cd8', 'fixed', 25.00, null, 'unidade', '', '[]'::jsonb, '[]'::jsonb, false, true, 17
    from public.categories where slug = 'doces';
  insert into public.products (category_id, name, description, flavors, image_url, price_mode, price, promo_price, unit, weight_label, variants, addons, featured, active, sort_order)
    select id, 'Rosca Húngara', 'A tradicional rosca húngara, macia e caprichada.', '', 'https://images.unsplash.com/photo-1767065887025-6ead723287ef', 'fixed', 38.00, null, 'unidade', '', '[]'::jsonb, '[]'::jsonb, true, true, 18
    from public.categories where slug = 'doces';
  insert into public.products (category_id, name, description, flavors, image_url, price_mode, price, promo_price, unit, weight_label, variants, addons, featured, active, sort_order)
    select id, 'Cuca de Doce de Leite', 'Cuca macia com doce de leite e farofinha doce por cima.', 'Doce de leite', 'https://images.unsplash.com/photo-1773399159452-0b9b205c751f', 'fixed', 33.00, null, 'unidade', '', '[]'::jsonb, '[]'::jsonb, true, true, 19
    from public.categories where slug = 'doces';
  insert into public.products (category_id, name, description, flavors, image_url, price_mode, price, promo_price, unit, weight_label, variants, addons, featured, active, sort_order)
    select id, 'Cuca de Goiabada', 'Cuca macia com goiabada e farofinha doce por cima.', 'Goiabada', 'https://images.unsplash.com/photo-1610119978638-f41a63e0f84c', 'fixed', 31.00, null, 'unidade', '', '[]'::jsonb, '[]'::jsonb, false, true, 20
    from public.categories where slug = 'doces';

  -- Configurações iniciais (só preenche chaves que ainda não existem)
  update public.settings set data = '{"business_name":"Sabor de Pão","tagline":"Pães artesanais","logo_url":"","whatsapp":"19999485767","instagram":"","facebook":"","address":"","city":"","maps_url":"","hours":[],"hours_note":"","delivery_enabled":false,"delivery_fee":null,"delivery_info":"","pickup_enabled":true,"pickup_info":"","orders_info":"","pix_key":"","pix_holder":"IVANE VOLPONI DA CUNHA","pix_city":"","hero_title":"Um sabor especial em cada pedaço!","hero_subtitle":"Pães artesanais preparados com carinho para deixar seus momentos ainda mais especiais.","hero_cta":"FAÇA SUA ENCOMENDA","hero_image":"https://images.unsplash.com/photo-1608198093002-ad4e005484ec","announcement":"","verse":"O Senhor é o meu Pastor e nada me faltará.","verse_ref":"Salmos 23:1","quote":"Você é a parte visível de Deus."}'::jsonb || data where id = 1;
end $$;
