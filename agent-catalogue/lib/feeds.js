// Google Merchant Center RSS 2.0 product feed.
// TikTok Catalog Manager and Snap Catalogs ingest this same format, so a
// single feed URL serves all three ad platforms.
const AVAILABILITY = { InStock: 'in stock', OutOfStock: 'out of stock', PreOrder: 'preorder' };

function escXml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

function absUrl(url, baseUrl) {
  return /^https?:\/\//.test(url) ? url : baseUrl + url;
}

function merchantFeedXml(products, baseUrl, siteName) {
  const items = products.map(p => `    <item>
      <g:id>${escXml(p.sku)}</g:id>
      <g:title>${escXml(p.name)}</g:title>
      <g:description>${escXml(p.description)}</g:description>
      <g:link>${escXml(`${baseUrl}/products/${p.id}`)}</g:link>
      <g:image_link>${escXml(absUrl(p.image, baseUrl))}</g:image_link>${p.video ? `
      <g:video_link>${escXml(absUrl(p.video, baseUrl))}</g:video_link>` : ''}
      <g:availability>${AVAILABILITY[p.availability]}</g:availability>
      <g:price>${p.price.toFixed(2)} ${p.currency}</g:price>
      <g:brand>${escXml(p.brand)}</g:brand>
      <g:gtin>${escXml(p.gtin)}</g:gtin>
      <g:condition>new</g:condition>
      <g:product_type>${escXml(p.category)}</g:product_type>
    </item>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${escXml(siteName)}</title>
    <link>${escXml(baseUrl)}</link>
    <description>Product feed for Google Merchant Center, TikTok Catalog, and Snap Catalogs.</description>
${items}
  </channel>
</rss>
`;
}

module.exports = { merchantFeedXml, absUrl };
