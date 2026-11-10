/**
 * Sabor de Pão — CARGA INICIAL do cardápio.
 *
 * Este arquivo NÃO é usado pela loja em produção. Ele serve apenas para:
 *  1) gerar o seed.sql (node build-seed-sql.js);
 *  2) popular o modo demonstração (sem Supabase configurado), uma única vez.
 * Depois da carga, tudo é editado pelo painel administrativo (admin.html).
 *
 * Preços oficiais informados pela proprietária. Fotos são ilustrativas
 * (Unsplash, licença livre) e devem ser trocadas pelas fotos reais no painel.
 */
(function (root) {
    const U = id => `https://images.unsplash.com/photo-${id}`;
    const IMG = {
        hero: U('1608198093002-ad4e005484ec'),
        tradicional: U('1598373182133-52452f7691ef'),
        leite: U('1620921568790-c1cf8984624c'),
        cebola: U('1552056413-b8b5eed0170b'),
        milho: U('1724079908191-5f7fb8d34c6f'),
        integral: U('1549931319-a545dcf3bc73'),
        recheadoA: U('1788619227437-f8de539a54c4'),
        recheadoB: U('1693893139747-2824ce88515a'),
        recheadoC: U('1619535860434-ba1d8fa12536'),
        recheadoD: U('1619531040576-f9416740661b'),
        recheadoE: U('1581339399838-2a120c18bba3'),
        pezinhos: U('1776099536340-780ba11e159d'),
        rosca: U('1775172258063-8f20e384503c'),
        roscaCoco: U('1624772423353-342e62547cd8'),
        hungara: U('1767065887025-6ead723287ef'),
        cuca: U('1773399159452-0b9b205c751f'),
        cucaB: U('1610119978638-f41a63e0f84c'),
    };

    const categories = [
        { slug: 'tradicionais', name: 'Pães Tradicionais', description: 'Os clássicos de todo dia, feitos com carinho.', image_url: IMG.tradicional, sort_order: 1 },
        { slug: 'recheados', name: 'Pães Recheados e Especiais', description: 'Recheios generosos para lanches e encontros.', image_url: IMG.recheadoA, sort_order: 2 },
        { slug: 'doces', name: 'Pães Doces, Roscas e Cucas', description: 'Docinhos para adoçar o café da tarde.', image_url: IMG.rosca, sort_order: 3 },
    ];

    let n = 0;
    const P = (cat, name, price, extra) => Object.assign({
        category: cat, name, price, price_mode: 'fixed', promo_price: null,
        description: '', flavors: '', unit: 'unidade', weight_label: '',
        image_url: '', variants: [], addons: [], featured: false, active: true,
        sort_order: (n += 1),
    }, extra);

    const products = [
        // PÃES TRADICIONAIS
        P('tradicionais', 'Pão Tradicional', 17.00, { image_url: IMG.tradicional, description: 'Massa macia e casquinha dourada, do jeitinho caseiro. Perfeito para o café da manhã e o lanche da tarde.' }),
        P('tradicionais', 'Pão de Leite', 19.00, { image_url: IMG.leite, description: 'Massa fofinha e levemente adocicada, preparada com leite. Ideal para o café em família.' }),
        P('tradicionais', 'Pão de Cebola', 18.00, { image_url: IMG.cebola, flavors: 'Cebola', description: 'Pão macio com o sabor marcante da cebola. Ótimo para lanches e para acompanhar refeições.' }),
        P('tradicionais', 'Pão de Milho', 19.00, { image_url: IMG.milho, flavors: 'Milho', description: 'Massa macia com o sabor e a cor dourada do milho. Uma delícia com manteiga e café.' }),
        P('tradicionais', 'Pão Integral', 19.00, { image_url: IMG.integral, description: 'Preparado com farinha integral, de sabor rústico e textura macia.' }),

        // PÃES RECHEADOS E ESPECIAIS
        P('recheados', 'Pão Recheado de Frango com Requeijão', 29.00, { image_url: IMG.recheadoA, flavors: 'Frango, Requeijão', description: 'Pão macio recheado com frango e requeijão cremoso.' }),
        P('recheados', 'Enroladão 3 Queijos', 32.00, { image_url: IMG.recheadoB, flavors: '3 queijos', featured: true, description: 'Massa enrolada e recheada com três queijos.' }),
        P('recheados', 'Pão Recheado Napolitano', 29.00, { image_url: IMG.recheadoC, flavors: 'Napolitano', description: 'Pão macio com recheio no estilo napolitano.' }),
        P('recheados', 'Pão de Frango com Requeijão e Mussarela', 32.00, { image_url: IMG.recheadoA, flavors: 'Frango, Requeijão, Mussarela', description: 'Pão recheado com frango, requeijão e mussarela.' }),
        P('recheados', 'Pão de Frango com Requeijão e Palmito', 32.00, { image_url: IMG.recheadoD, flavors: 'Frango, Requeijão, Palmito', description: 'Pão recheado com frango, requeijão e palmito.' }),
        P('recheados', 'Pão Recheado Vegetariano', 32.00, { image_url: IMG.recheadoE, flavors: 'Vegetariano', description: 'Pão recheado na versão vegetariana, sem carne.' }),
        P('recheados', 'Pão Recheado 5 Queijos', 32.00, { image_url: IMG.recheadoB, flavors: '5 queijos', description: 'Pão recheado com cinco queijos.' }),
        P('recheados', 'Sabor Tudo 700 gramas', 38.00, { image_url: IMG.recheadoE, weight_label: '700 g', flavors: 'Sabor Tudo', description: 'O pão recheado Sabor Tudo, no tamanho de 700 gramas.' }),
        P('recheados', 'Sabor Tudo 1 quilo', 48.00, { image_url: IMG.recheadoE, weight_label: '1 kg', flavors: 'Sabor Tudo', featured: true, description: 'O pão recheado Sabor Tudo, no tamanho de 1 quilo.' }),
        P('recheados', 'Recheio do Seu Jeito — Seu Pãozinho', null, { price_mode: 'quote', image_url: IMG.pezinhos, flavors: 'Personalizado', description: 'Monte o pãozinho com o recheio que você quiser. Conte sua ideia e consultamos valor e disponibilidade.' }),

        // PÃES DOCES, ROSCAS E CUCAS
        P('doces', 'Rosca de Goiabada', 19.00, { image_url: IMG.rosca, flavors: 'Goiabada', description: 'Rosca macia recheada com goiabada.' }),
        P('doces', 'Rosca de Coco com Leite Condensado', 25.00, { image_url: IMG.roscaCoco, flavors: 'Coco, Leite condensado', description: 'Rosca macia com coco e leite condensado.' }),
        P('doces', 'Rosca Húngara', 38.00, { image_url: IMG.hungara, featured: true, description: 'A tradicional rosca húngara, macia e caprichada.' }),
        P('doces', 'Cuca de Doce de Leite', 33.00, { image_url: IMG.cuca, flavors: 'Doce de leite', featured: true, description: 'Cuca macia com doce de leite e farofinha doce por cima.' }),
        P('doces', 'Cuca de Goiabada', 31.00, { image_url: IMG.cucaB, flavors: 'Goiabada', description: 'Cuca macia com goiabada e farofinha doce por cima.' }),
    ];

    const settings = {
        business_name: 'Sabor de Pão',
        tagline: 'Pães artesanais',
        logo_url: '',
        whatsapp: '19999485767',
        instagram: '',
        facebook: '',
        address: '',
        city: '',
        maps_url: '',
        hours: [],
        hours_note: '',
        delivery_enabled: false,     // a loja trabalha só com retirada (pode ligar no painel)
        delivery_fee: null,          // null = "a combinar" até a proprietária definir
        delivery_info: '',
        pickup_enabled: true,
        pickup_info: '',
        orders_info: '',
        pix_key: '+5511943093536',   // chave PIX (celular) informada pela proprietária
        pix_holder: 'IVANE VOLPONI DA CUNHA',
        pix_city: '',
        hero_title: 'Um sabor especial em cada pedaço!',
        hero_subtitle: 'Pães artesanais preparados com carinho para deixar seus momentos ainda mais especiais.',
        hero_cta: 'FAÇA SUA ENCOMENDA',
        hero_image: IMG.hero,
        announcement: '',
        verse: 'O Senhor é o meu Pastor e nada me faltará.',
        verse_ref: 'Salmos 23:1',
        quote: 'Você é a parte visível de Deus.',
    };

    const SEED = { categories, products, settings };
    root.SP_SEED = SEED;
    if (typeof module !== 'undefined' && module.exports) module.exports = SEED;
})(typeof window !== 'undefined' ? window : globalThis);
