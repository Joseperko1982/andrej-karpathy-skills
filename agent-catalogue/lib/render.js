// HTML rendering with schema.org JSON-LD and Open Graph tags on every page.
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
<header><a href="/">${SITE_NAME}</a><nav><a href="/api/catalog.json">JSON feed</a> <a href="/llms.txt">llms.txt</a></nav></header>
<main>${body}</main>
<footer>Built agent-first: every page ships JSON-LD, every resource has a JSON twin.</footer>
</body>
</html>`;
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
    image: baseUrl + product.image,
    offers: {
      '@type': 'Offer',
      url: `${baseUrl}/products/${product.id}`,
      price: product.price.toFixed(2),
      priceCurrency: product.currency,
      availability: `https://schema.org/${product.availability}`
    }
  };
  if (product.video) {
    ld.subjectOf = { '@type': 'VideoObject', name: `${product.name} product video`, contentUrl: baseUrl + product.video, description: product.description, uploadDate: new Date().toISOString().slice(0, 10), thumbnailUrl: baseUrl + product.image };
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
  const reviewList = reviews.map(r =>
    `<li><strong>${esc(r.author)}</strong> (${r.authorType}) — ${'★'.repeat(r.rating)}<br>${esc(r.body)}</li>`).join('') || '<li>No reviews yet.</li>';
  const body = `
<article>
  <h1>${esc(product.name)}</h1>
  <img src="${esc(product.image)}" alt="${esc(product.name)}" width="480">
  ${product.video ? `<video src="${esc(product.video)}" controls width="480"></video>` : ''}
  <p>${esc(product.description)}</p>
  <p class="price">${esc(product.currency)} ${product.price.toFixed(2)} — ${esc(product.availability)}</p>
  <table>${attrs}</table>
  <p><a href="/api/products/${esc(product.id)}.json">Machine-readable version (JSON)</a></p>
  <section>
    <h2>Reviews</h2>
    <ul>${reviewList}</ul>
    <p>Agents: POST JSON {author, authorType, rating, body} to <code>/api/products/${esc(product.id)}/reviews</code></p>
  </section>
</article>`;
  return page({
    title: product.name,
    description: product.description,
    jsonLd: productJsonLd(product, reviews, baseUrl),
    og: { type: 'product', image: baseUrl + product.image, video: product.video ? baseUrl + product.video : undefined },
    body,
    baseUrl,
    path: `/products/${product.id}`
  });
}

function homePage(products, baseUrl) {
  const cards = products.map(p => `
<li class="card">
  <a href="/products/${esc(p.id)}">
    <img src="${esc(p.image)}" alt="${esc(p.name)}" width="240">
    <h2>${esc(p.name)}</h2>
  </a>
  <p>${esc(p.description)}</p>
  <p class="price">${esc(p.currency)} ${p.price.toFixed(2)}</p>
</li>`).join('');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: SITE_NAME,
    itemListElement: products.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${baseUrl}/products/${p.id}` }))
  };
  const body = `<h1>${SITE_NAME}</h1>
<p>A product catalogue built agent-first. Discovery surfaces: <a href="/llms.txt">/llms.txt</a>, <a href="/api/catalog.json">/api/catalog.json</a>, <a href="/sitemap.xml">/sitemap.xml</a>, <a href="/.well-known/agent-catalog.json">/.well-known/agent-catalog.json</a>.</p>
<ul class="grid">${cards}</ul>`;
  return page({ title: 'Home', description: 'Agent-first product catalogue with structured data, JSON feeds, and Meta CAPI.', jsonLd, body, baseUrl, path: '/' });
}

module.exports = { homePage, productPage, productJsonLd, SITE_NAME };
