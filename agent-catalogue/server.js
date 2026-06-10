// Agent-first product catalogue server. Zero dependencies (node >= 18).
// Run: node server.js  (PORT and BASE_URL configurable via env)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { homePage, productPage, productJsonLd, SITE_NAME } = require('./lib/render');
const { merchantFeedXml } = require('./lib/feeds');
const track = require('./lib/track');

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const DATA_DIR = path.join(__dirname, 'data');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');

const products = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'products.json'), 'utf8'));
let reviews = fs.existsSync(REVIEWS_FILE) ? JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf8')) : [];

function saveReviews() {
  fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviews, null, 2));
}

function reviewsFor(id) {
  return reviews.filter(r => r.productId === id);
}

function send(res, status, body, type = 'application/json') {
  const data = type === 'application/json' ? JSON.stringify(body, null, 2) : body;
  res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8` });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// --- Agent discovery surfaces ---

function llmsTxt() {
  const lines = products.map(p =>
    `- [${p.name}](${BASE_URL}/products/${p.id}): ${p.description} (JSON: ${BASE_URL}/api/products/${p.id}.json)`);
  return `# ${SITE_NAME}

> An agent-first product catalogue. Every product page has a JSON twin and full
> schema.org Product JSON-LD. Agents may read and write reviews via the API.

## Products

${lines.join('\n')}

## API

- [Full catalog feed](${BASE_URL}/api/catalog.json): all products as JSON
- [Merchant feed](${BASE_URL}/feeds/google-merchant.xml): Google Merchant / TikTok Catalog / Snap Catalogs XML feed
- [Agent manifest](${BASE_URL}/.well-known/agent-catalog.json): capabilities and endpoints
- Reviews: GET/POST ${BASE_URL}/api/products/{id}/reviews
- Conversion tracking relay (Meta CAPI, TikTok Events API, Snap CAPI): POST ${BASE_URL}/api/track
`;
}

function agentManifest() {
  return {
    name: SITE_NAME,
    description: 'Agent-first product catalogue with structured data and a read/write review API.',
    version: '1.0',
    catalog_feed: `${BASE_URL}/api/catalog.json`,
    merchant_feed: `${BASE_URL}/feeds/google-merchant.xml`,
    llms_txt: `${BASE_URL}/llms.txt`,
    sitemap: `${BASE_URL}/sitemap.xml`,
    endpoints: [
      { method: 'GET', path: '/api/catalog.json', description: 'All products with offers and media' },
      { method: 'GET', path: '/feeds/google-merchant.xml', description: 'Product feed for Google Merchant Center, TikTok Catalog, and Snap Catalogs' },
      { method: 'GET', path: '/api/products/{id}.json', description: 'Single product as schema.org JSON-LD' },
      { method: 'GET', path: '/api/products/{id}/reviews', description: 'Reviews for a product' },
      { method: 'POST', path: '/api/products/{id}/reviews', description: 'Submit a review: {author, authorType: "agent"|"human", rating: 1-5, body}' },
      { method: 'POST', path: '/api/track', description: 'Relay a conversion event to Meta CAPI, TikTok Events API, and Snap CAPI: {eventName: "ViewContent"|"AddToCart"|"Purchase", productId, email?}' }
    ]
  };
}

function sitemapXml() {
  const urls = ['/', ...products.map(p => `/products/${p.id}`)]
    .map(u => `  <url><loc>${BASE_URL}${u}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

const robotsTxt = `User-agent: *\nAllow: /\n\nSitemap: ${BASE_URL}/sitemap.xml\n`;

// --- Router ---

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE_URL);
  const p = url.pathname;

  try {
    if (req.method === 'GET') {
      if (p === '/') return send(res, 200, homePage(products, BASE_URL), 'text/html');
      if (p === '/llms.txt') return send(res, 200, llmsTxt(), 'text/plain');
      if (p === '/robots.txt') return send(res, 200, robotsTxt, 'text/plain');
      if (p === '/sitemap.xml') return send(res, 200, sitemapXml(), 'application/xml');
      if (p === '/feeds/google-merchant.xml') return send(res, 200, merchantFeedXml(products, BASE_URL, SITE_NAME), 'application/xml');
      if (p === '/.well-known/agent-catalog.json') return send(res, 200, agentManifest());
      if (p === '/style.css') return send(res, 200, fs.readFileSync(path.join(__dirname, 'public', 'style.css'), 'utf8'), 'text/css');

      if (p === '/api/catalog.json') {
        return send(res, 200, {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: SITE_NAME,
          itemListElement: products.map(prod => productJsonLd(prod, reviewsFor(prod.id), BASE_URL))
        });
      }

      let m = p.match(/^\/api\/products\/([\w-]+)\.json$/);
      if (m) {
        const prod = products.find(x => x.id === m[1]);
        if (!prod) return send(res, 404, { error: 'product not found' });
        return send(res, 200, productJsonLd(prod, reviewsFor(prod.id), BASE_URL));
      }

      m = p.match(/^\/api\/products\/([\w-]+)\/reviews$/);
      if (m) return send(res, 200, reviewsFor(m[1]));

      m = p.match(/^\/products\/([\w-]+)$/);
      if (m) {
        const prod = products.find(x => x.id === m[1]);
        if (!prod) return send(res, 404, '<h1>Not found</h1>', 'text/html');
        // Server-side ViewContent to all ad platforms — no client JS needed.
        track.sendEvent('ViewContent', {
          product: prod,
          eventSourceUrl: BASE_URL + p,
          userData: { clientIp: req.socket.remoteAddress, userAgent: req.headers['user-agent'] }
        });
        return send(res, 200, productPage(prod, reviewsFor(prod.id), BASE_URL), 'text/html');
      }
    }

    if (req.method === 'POST') {
      const m = p.match(/^\/api\/products\/([\w-]+)\/reviews$/);
      if (m) {
        const prod = products.find(x => x.id === m[1]);
        if (!prod) return send(res, 404, { error: 'product not found' });
        let body;
        try { body = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: 'invalid JSON' }); }
        const rating = Number(body.rating);
        if (!body.author || !body.body || !(rating >= 1 && rating <= 5)) {
          return send(res, 400, { error: 'required: author, body, rating (1-5)' });
        }
        const review = {
          id: Date.now().toString(36),
          productId: prod.id,
          author: String(body.author).slice(0, 80),
          authorType: body.authorType === 'agent' ? 'agent' : 'human',
          rating: Math.round(rating),
          body: String(body.body).slice(0, 2000),
          createdAt: new Date().toISOString()
        };
        reviews.push(review);
        saveReviews();
        return send(res, 201, review);
      }

      if (p === '/api/track') {
        let body;
        try { body = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: 'invalid JSON' }); }
        const prod = products.find(x => x.id === body.productId);
        if (!body.eventName || !prod) return send(res, 400, { error: 'required: eventName, valid productId' });
        const result = await track.sendEvent(body.eventName, {
          product: prod,
          eventSourceUrl: `${BASE_URL}/products/${prod.id}`,
          userData: { email: body.email, clientIp: req.socket.remoteAddress, userAgent: req.headers['user-agent'] }
        });
        return send(res, 200, { ok: true, eventId: result.eventId, platforms: result.platforms });
      }
    }

    send(res, 404, { error: 'not found' });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: 'internal error' });
  }
});

server.listen(PORT, () => console.log(`${SITE_NAME} running at ${BASE_URL}`));
