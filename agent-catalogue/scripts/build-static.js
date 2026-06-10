// Builds a static export of the catalogue into <repo-root>/docs for GitHub
// Pages. POST endpoints (reviews, /api/track) are server-only and excluded.
// Run: node scripts/build-static.js  (override site URL with BASE_URL)
const fs = require('node:fs');
const path = require('node:path');
const { homePage, productPage, productJsonLd, SITE_NAME } = require('../lib/render');

const BASE_URL = process.env.BASE_URL || 'https://joseperko1982.github.io/andrej-karpathy-skills';
const OUT = path.join(__dirname, '..', '..', 'docs');

const products = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'products.json'), 'utf8'));

// Rewrite root-relative links/assets so pages work under the /docs subpath.
function rebase(html) {
  return html.replace(/(href|src)="\//g, `$1="${BASE_URL}/`);
}

function write(rel, content) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log('wrote', path.relative(OUT, file));
}

fs.rmSync(OUT, { recursive: true, force: true });

write('index.html', rebase(homePage(products, BASE_URL)));
write('style.css', fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8'));
write('.nojekyll', '');
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${BASE_URL}/sitemap.xml\n`);

const urls = ['/', ...products.map(p => `/products/${p.id}`)]
  .map(u => `  <url><loc>${BASE_URL}${u}</loc></url>`).join('\n');
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`);

for (const product of products) {
  write(`products/${product.id}/index.html`, rebase(productPage(product, [], BASE_URL)));
  write(`api/products/${product.id}.json`, JSON.stringify(productJsonLd(product, [], BASE_URL), null, 2));
}

write('api/catalog.json', JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: SITE_NAME,
  itemListElement: products.map(p => productJsonLd(p, [], BASE_URL))
}, null, 2));

const llmsLines = products.map(p =>
  `- [${p.name}](${BASE_URL}/products/${p.id}): ${p.description} (JSON: ${BASE_URL}/api/products/${p.id}.json)`);
write('llms.txt', `# ${SITE_NAME}

> An agent-first product catalogue (static preview). Every product page has a
> JSON twin and full schema.org Product JSON-LD.

## Products

${llmsLines.join('\n')}

## API

- [Full catalog feed](${BASE_URL}/api/catalog.json): all products as JSON
- [Agent manifest](${BASE_URL}/.well-known/agent-catalog.json): capabilities and endpoints
`);

write('.well-known/agent-catalog.json', JSON.stringify({
  name: SITE_NAME,
  description: 'Agent-first product catalogue (static preview — write endpoints require the Node server).',
  version: '1.0',
  catalog_feed: `${BASE_URL}/api/catalog.json`,
  llms_txt: `${BASE_URL}/llms.txt`,
  sitemap: `${BASE_URL}/sitemap.xml`,
  endpoints: [
    { method: 'GET', path: '/api/catalog.json', description: 'All products with offers and media' },
    { method: 'GET', path: '/api/products/{id}.json', description: 'Single product as schema.org JSON-LD' }
  ]
}, null, 2));

console.log(`\nStatic site built in ${OUT} for ${BASE_URL}`);
