/**
 * Servidor de teste que imita a API REST do Supabase (somente as funções RPC
 * usadas pela loja) sobre um PostgreSQL embutido (PGlite) com o schema real.
 * Serve também os arquivos do site, trocando config.js para apontar para cá.
 *
 * Uso: NODE_PATH=<pasta>/node_modules node mock-supabase.js [porta] [qtdeProdutosExtras]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

const PORT = Number(process.argv[2] || 5520);
const EXTRA = Number(process.argv[3] || 0);
const ROOT = __dirname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

(async () => {
    const db = new PGlite();
    await db.exec(`
        create role anon nologin; create role authenticated nologin;
        create schema auth; create table auth.users (id uuid primary key, email text);
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
        grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
        create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
        create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text); alter table storage.objects enable row level security;
        grant usage on schema public, storage to anon, authenticated;
        alter default privileges in schema public grant all on tables to anon, authenticated;
        alter default privileges in schema public grant all on sequences to anon, authenticated;
        alter default privileges in schema public grant all on functions to anon, authenticated;`);
    await db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(ROOT, 'seed.sql'), 'utf8'));
    if (EXTRA) {
        await db.exec(`insert into products (category_id, name, description, flavors, image_url, price, sort_order)
            select c.id, 'Pão de Carga ' || g, 'Produto gerado para teste de desempenho com descrição de tamanho realista.', 'Teste',
                   (select image_url from products order by random() limit 1), 10 + (g % 40), 100 + g
            from generate_series(1, ${EXTRA}) g cross join lateral (select id from categories order by (g % 3) = sort_order desc limit 1) c;`);
    }
    // Simula latência de rede real (Supabase em São Paulo ≈ 40–120 ms)
    const LAT = Number(process.env.LATENCY || 60);

    http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://x');
        const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey, authorization, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
        if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
        const m = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
        if (m) {
            let body = ''; for await (const ch of req) body += ch;
            const args = body ? JSON.parse(body) : {};
            const fn = m[1];
            if (!['get_catalog', 'create_order', 'track_orders'].includes(fn)) { res.writeHead(404, cors); return res.end('{}'); }
            await new Promise(r => setTimeout(r, LAT));
            try {
                await db.exec(`reset role; set role anon;`);
                let r;
                if (fn === 'get_catalog') r = await db.query(`select public.get_catalog() r`);
                if (fn === 'create_order') r = await db.query(`select public.create_order($1::jsonb) r`, [JSON.stringify(args.p)]);
                if (fn === 'track_orders') r = await db.query(`select public.track_orders($1::uuid[]) r`, [args.refs]);
                await db.exec('reset role;');
                res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
                return res.end(JSON.stringify(r.rows[0].r));
            } catch (e) {
                await db.exec('reset role;');
                res.writeHead(400, { ...cors, 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ code: e.code || 'P0001', details: e.detail || null, hint: null, message: e.message }));
            }
        }
        if (url.pathname === '/__admin/sql') {            // apenas para o teste simular alterações do painel
            let body = ''; for await (const ch of req) body += ch;
            try { const r = await db.query(body); res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); return res.end(JSON.stringify(r.rows)); }
            catch (e) { res.writeHead(400, cors); return res.end(e.message); }
        }
        if (url.pathname === '/config.js') {
            res.writeHead(200, { 'Content-Type': TYPES['.js'] });
            return res.end(`window.SP_CONFIG = { SUPABASE_URL: 'http://localhost:${PORT}', SUPABASE_ANON_KEY: 'chave-anon-de-teste' };`);
        }
        let file = path.join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        fs.createReadStream(file).pipe(res);
    }).listen(PORT, () => console.log(`Mock Supabase + site em http://localhost:${PORT} (${EXTRA} produtos extras, latência ${LAT} ms)`));
})();
