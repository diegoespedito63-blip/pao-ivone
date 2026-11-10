// Resume relatórios JSON do Lighthouse: node lighthouse-summary.js a.json b.json ...
const fs = require('fs');
for (const f of process.argv.slice(2)) {
    const r = JSON.parse(fs.readFileSync(f, 'utf8'));
    const a = r.audits, c = r.categories;
    const ms = k => a[k] ? (a[k].numericValue / 1000).toFixed(2) + ' s' : '-';
    console.log(`\n${f.split(/[\\/]/).pop()}  (${r.finalDisplayedUrl})`);
    console.log(`  Desempenho ${Math.round(c.performance.score * 100)} | Acessibilidade ${Math.round(c.accessibility.score * 100)} | Boas práticas ${Math.round(c['best-practices'].score * 100)} | SEO ${Math.round(c.seo.score * 100)}`);
    console.log(`  FCP ${ms('first-contentful-paint')} | LCP ${ms('largest-contentful-paint')} | Speed Index ${ms('speed-index')} | TBT ${Math.round(a['total-blocking-time'].numericValue)} ms | CLS ${a['cumulative-layout-shift'].numericValue.toFixed(3)}`);
    console.log(`  Transferido ${(a['total-byte-weight'].numericValue / 1024).toFixed(0)} KB em ${a['network-requests'].details.items.length} requisições`);
    const fails = Object.values(a).filter(x => x.score !== null && x.score < 0.9 && x.scoreDisplayMode === 'binary').map(x => x.id);
    if (fails.length) console.log('  Itens a melhorar:', fails.join(', '));
}
