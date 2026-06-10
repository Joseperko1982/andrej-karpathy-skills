// HTML rendering with schema.org JSON-LD and Open Graph tags on every page.
const { absUrl } = require('./feeds');

const SITE_NAME = 'Meta Product Catalogue';

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function page({ title, description, jsonLd, og = {}, body, baseUrl, path }) {
  const url = baseUrl + path;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — ${SITE_NAME}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<link rel="stylesheet" href="/style.css">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(og.title || title)}">
<meta property="og:description" content="${esc(og.description || description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:type" content="${esc(og.type || 'website')}">
${og.image ? `<meta property="og:image" content="${esc(og.image)}">` : ''}
${og.video ? `<meta property="og:video" content="${esc(og.video)}">` : ''}
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<header class="site-header">
  <a class="brand" href="/">${SITE_NAME}</a>
  <nav>
    <a href="/api/catalog.json">JSON feed</a>
    <a href="/feeds/google-merchant.xml">Merchant feed</a>
    <a href="/llms.txt">llms.txt</a>
  </nav>
</header>
<main>${body}</main>
<footer class="site-footer">
  <p><strong>Agent-first commerce.</strong> Every page ships JSON-LD; every resource has a JSON twin.</p>
  <p class="footer-links">
    <a href="/sitemap.xml">sitemap</a> ·
    <a href="/.well-known/agent-catalog.json">agent manifest</a> ·
    <a href="/feeds/google-merchant.xml">product feed</a>
  </p>
</footer>
</body>
</html>`;
}

function availabilityBadge(availability) {
  const labels = { InStock: 'In stock', OutOfStock: 'Out of stock', PreOrder: 'Pre-order' };
  return `<span class="badge badge-${availability.toLowerCase()}">${labels[availability] || availability}</span>`;
}

function productJsonLd(product, reviews, baseUrl) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${baseUrl}/products/${product.id}`,
    name: product.name,
    description: product.description,
    sku: product.sku,
    gtin13: product.gtin,
    brand: { '@type': 'Brand', name: product.brand },
    image: absUrl(product.image, baseUrl),
    offers: {
      '@type': 'Offer',
      url: `${baseUrl}/products/${product.id}`,
      price: product.price.toFixed(2),
      priceCurrency: product.currency,
      availability: `https://schema.org/${product.availability}`
    }
  };
  if (product.video) {
    ld.subjectOf = { '@type': 'VideoObject', name: `${product.name} product video`, contentUrl: absUrl(product.video, baseUrl), description: product.description, uploadDate: new Date().toISOString().slice(0, 10), thumbnailUrl: absUrl(product.image, baseUrl) };
  }
  if (reviews.length) {
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    ld.aggregateRating = { '@type': 'AggregateRating', ratingValue: avg.toFixed(1), reviewCount: reviews.length };
    ld.review = reviews.slice(0, 10).map(r => ({
      '@type': 'Review',
      reviewRating: { '@type': 'Rating', ratingValue: r.rating },
      author: { '@type': r.authorType === 'agent' ? 'SoftwareApplication' : 'Person', name: r.author },
      reviewBody: r.body,
      datePublished: r.createdAt.slice(0, 10)
    }));
  }
  return ld;
}

function productPage(product, reviews, baseUrl) {
  const attrs = Object.entries(product.attributes)
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
  const reviewList = reviews.map(r => `
    <li class="review">
      <div class="review-meta">
        <strong>${esc(r.author)}</strong>
        <span class="badge badge-${r.authorType}">${r.authorType}</span>
        <span class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
      </div>
      <p>${esc(r.body)}</p>
    </li>`).join('') || '<li class="review review-empty">No reviews yet.</li>';
  const body = `
<article class="product">
  <div class="product-layout">
    <div class="product-media">
      <img src="${esc(product.image)}" alt="${esc(product.name)}">
      ${product.video ? `<video src="${esc(product.video)}" controls></video>` : ''}
    </div>
    <div class="product-info">
      <p class="eyebrow">${esc(product.brand)} · ${esc(product.category)}</p>
      <h1>${esc(product.name)}</h1>
      <p class="price">${esc(product.currency)} ${product.price.toFixed(2)} ${availabilityBadge(product.availability)}</p>
      <p class="description">${esc(product.description)}</p>
      <table class="specs">${attrs}</table>
      <p class="machine-link"><a href="/api/products/${esc(product.id)}.json">Machine-readable version (JSON-LD)</a></p>
    </div>
  </div>
  <section class="reviews">
    <h2>Reviews</h2>
    <ul>${reviewList}</ul>
    <p class="hint">Agents: <code>POST {author, authorType, rating, body}</code> to <code>/api/products/${esc(product.id)}/reviews</code></p>
  </section>
</article>`;
  return page({
    title: product.name,
    description: product.description,
    jsonLd: productJsonLd(product, reviews, baseUrl),
    og: { type: 'product', image: absUrl(product.image, baseUrl), video: product.video ? absUrl(product.video, baseUrl) : undefined },
    body,
    baseUrl,
    path: `/products/${product.id}`
  });
}

function homePage(products, baseUrl) {
  const cards = products.map(p => `
<li class="card">
  <a href="/products/${esc(p.id)}">
    <div class="card-media"><img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy"></div>
    <div class="card-body">
      <p class="eyebrow">${esc(p.brand)}</p>
      <h2>${esc(p.name)}</h2>
      <p class="card-description">${esc(p.description)}</p>
      <p class="price">${esc(p.currency)} ${p.price.toFixed(2)} ${availabilityBadge(p.availability)}</p>
    </div>
  </a>
</li>`).join('');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: SITE_NAME,
    itemListElement: products.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${baseUrl}/products/${p.id}` }))
  };
  const body = `
<section class="hero">
  <h1>Commerce, built for agents.</h1>
  <p>A product catalogue that AI agents and ad platforms read natively — structured data on every page, one feed for every channel, server-side conversion events out of the box.</p>
  <p class="integrations">
    <span class="chip">Google Merchant</span>
    <span class="chip">Meta CAPI</span>
    <span class="chip">TikTok Events</span>
    <span class="chip">Snap CAPI</span>
    <span class="chip">schema.org</span>
    <span class="chip">llms.txt</span>
  </p>
</section>
<ul class="grid">${cards}</ul>`;
  return page({ title: 'Home', description: 'Agent-first product catalogue with structured data, unified ad-platform feeds, and server-side conversion tracking.', jsonLd, body, baseUrl, path: '/' });
}

module.exports = { homePage, productPage, productJsonLd, SITE_NAME };
