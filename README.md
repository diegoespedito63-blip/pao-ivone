# Sabor de Pão — Cardápio e encomendas

Loja no estilo do TDA Açaí (somente retirada no local) + painel administrativo.
Todos os arquivos ficam nesta mesma pasta, sem subpastas.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html`, `style.css`, `store.js` | Loja: cardápio, carrinho, finalização, pedido personalizado |
| `admin.html`, `admin.css`, `admin.js` | Painel: pedidos, produtos, categorias, fotos, configurações |
| `core.js` | Regras de preço, WhatsApp e PIX (usadas pela loja, painel e testes) |
| `api.js` | Conexão com o Supabase (ou modo demonstração local) |
| `config.js` | **Onde colar a URL e a chave anon do Supabase** |
| `seed.js` | Cardápio inicial com os preços oficiais (usado no modo demonstração) |
| `schema.sql` | Banco: tabelas, índices, segurança (RLS), Storage e funções do servidor |
| `seed.sql` | Cardápio inicial para o banco (gerado de `seed.js` por `build-seed-sql.js`) |
| `core.test.js`, `db.test.js`, `mock-supabase.js`, `lighthouse-summary.js`, `build-seed-sql.js` | Testes e ferramentas (não precisam ir para o site) |
| `tda-original-*` | Cópia do site antigo do TDA Açaí, só para consulta — **não envie para o site** |

## Enviar para o GitHub Pages

Envie somente: `index.html`, `admin.html`, `style.css`, `admin.css`, `store.js`, `admin.js`,
`core.js`, `api.js`, `config.js`, `seed.js`.

## Ligar o banco de dados (uma vez)

1. Crie um projeto em <https://supabase.com> (região São Paulo).
2. **SQL Editor** → cole e execute `schema.sql`. Depois execute `seed.sql`.
3. **Authentication → Users → Add user**: crie o usuário da administradora (e-mail + senha forte).
4. No SQL Editor, autorize esse usuário:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'EMAIL-DA-ADMINISTRADORA';
   ```
5. **Project Settings → API**: copie *Project URL* e a chave *anon public* para `config.js`.
   (Nunca use a chave `service_role` no site.)
6. Em **Authentication → Providers → Email**, desative "Allow new users to sign up".
7. Entre em `admin.html` → **Ajustes** e cadastre: chave PIX, cidade do titular, endereço de retirada,
   horários e redes sociais. Troque as fotos ilustrativas pelas reais.

Enquanto `config.js` estiver vazio, o site roda em **modo demonstração** (faixa amarela no topo):
tudo funciona, mas os dados ficam só no navegador. Senha do painel nesse modo: `1234`.

## Segurança

- O navegador envia só ids e quantidades; o preço final é calculado no banco (`create_order`).
  Se o preço mudou, o pedido é recusado e a tela se atualiza.
- Cliques repetidos não duplicam pedidos.
- Clientes não leem pedidos de outras pessoas nem alteram produtos (RLS).
- "Recheio do Seu Jeito" nunca é vendido com preço zero: fica "aguardando orçamento" até o valor ser confirmado no painel.

## Testes

```bash
node core.test.js
```

```bash
npm i @electric-sql/pglite@0.2.17 --prefix ../pglite-teste
```

```bash
NODE_PATH=../pglite-teste/node_modules node db.test.js
```
