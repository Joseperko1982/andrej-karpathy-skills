# Agent Catalogue

A purpose-built, **agent-first e-commerce catalogue platform**: AI agents and ad platforms read it natively, and it plugs into Google, Meta, TikTok, and Snap ad systems out of the box — while rendering a clean, professional human-facing storefront.

Zero dependencies. Node 18+ only.

```bash
node server.js
# → http://localhost:3000
```

## How the backend works

```
                ┌──────────────────────────────────────────────┐
   HTTP ──────► │ server.js — router                           │
                │   HTML pages ──► lib/render.js (JSON-LD, OG) │
                │   feeds ───────► lib/feeds.js (Merchant XML) │
                │   conversions ─► lib/track.js                │
                └──────────────────────┬───────────────────────┘
                                       │ one canonical event
                          ┌────────────┼────────────┐
                          ▼            ▼            ▼
                      Meta CAPI   TikTok Events  Snap CAPI
```

Three principles:

1. **One source of truth.** `data/products.json` drives the HTML pages, the JSON-LD, the catalog API, the merchant feed, llms.txt, and the sitemap. Change a price once, every surface updates.
2. **One canonical event, many platforms.** `lib/track.js` normalizes an event (`ViewContent` | `AddToCart` | `Purchase`) and hashes PII centrally, then platform adapters reshape it for each ad API. Delivery is concurrent (`Promise.all`) and a failing platform never blocks the others or the page response. Unconfigured platforms log dry runs, so the pipeline runs identically in dev and prod.
3. **Every human surface has a machine twin.** Each HTML page maps 1:1 to a JSON-LD endpoint; the manifest at `/.well-known/agent-catalog.json` declares every contract so agents don't have to scrape.

## Ad platform integrations

### Product feeds (Google, TikTok, Snap)

`GET /feeds/google-merchant.xml` serves a Google Merchant Center RSS 2.0 feed (`g:` namespace: id, title, price, availability, gtin, brand, image_link, video_link). **TikTok Catalog Manager and Snap Catalogs ingest this same format**, so one feed URL registers the catalogue with all three ad systems — paste it into:

- Google Merchant Center → Products → Add products via feed
- TikTok Ads Manager → Catalog Manager → Data feed URL
- Snap Ads Manager → Catalogs → Product feed URL

### Server-side conversion tracking (Meta, TikTok, Snap)

No client-side pixels required. `ViewContent` fires automatically on every product page view; any event can be relayed via the API:

```bash
curl -X POST http://localhost:3000/api/track \
  -H 'Content-Type: application/json' \
  -d '{"eventName":"Purchase","productId":"aurora-desk-lamp","email":"buyer@example.com"}'
# → {"ok":true,"eventId":"...","platforms":[{"platform":"meta",...},{"platform":"tiktok",...},{"platform":"snap",...}]}
```

Canonical event names are mapped per platform (`Purchase` → TikTok `CompletePayment`, Snap `PURCHASE`). Email/phone are SHA-256 hashed per spec before sending. Configure any subset:

| Platform | Env vars |
|---|---|
| Meta CAPI | `META_PIXEL_ID`, `META_ACCESS_TOKEN`, optional `META_TEST_EVENT_CODE` |
| TikTok Events API | `TIKTOK_PIXEL_CODE`, `TIKTOK_ACCESS_TOKEN`, optional `TIKTOK_TEST_EVENT_CODE` |
| Snap CAPI | `SNAP_PIXEL_ID`, `SNAP_ACCESS_TOKEN` |

## Agent discovery (AI-driven search)

| Surface | Path | Purpose |
|---|---|---|
| llms.txt | `/llms.txt` | Markdown index of the catalogue for LLM crawlers |
| Agent manifest | `/.well-known/agent-catalog.json` | Declares every machine endpoint and its contract |
| Catalog feed | `/api/catalog.json` | Full catalogue as schema.org `ItemList` of `Product` JSON-LD |
| Merchant feed | `/feeds/google-merchant.xml` | Google/TikTok/Snap product feed |
| Product JSON twin | `/api/products/{id}.json` | 1:1 JSON-LD equivalent of every HTML page |
| Sitemap / robots | `/sitemap.xml`, `/robots.txt` | Classic crawler plumbing |

Every HTML page embeds schema.org `Product` JSON-LD (`Offer`, `Brand`, `AggregateRating`, `Review`, `VideoObject`) for rich results / AI Overviews eligibility, plus Open Graph tags including `og:video`.

## Agent social interaction

Agents can read **and write** reviews. Agent-authored reviews are attributed as `SoftwareApplication` in the JSON-LD (humans as `Person`) and feed the `aggregateRating`, so agent interaction directly improves search-facing signals.

```bash
curl -X POST http://localhost:3000/api/products/aurora-desk-lamp/reviews \
  -H 'Content-Type: application/json' \
  -d '{"author":"shopping-agent-v2","authorType":"agent","rating":5,"body":"Verified spec sheet matches listing."}'
```

## AI image & video generation

`scripts/generate-media.js` generates a hero image and a 360° turntable product video per product, writing URLs back into `data/products.json`. Generated videos surface as `VideoObject` structured data, `og:video`, and `g:video_link` in the merchant feed.

```bash
export MEDIA_API_KEY=sk-...
node scripts/generate-media.js            # images (OpenAI-compatible endpoint)
export MEDIA_VIDEO_URL=https://api.replicate.com/v1/predictions
export MEDIA_VIDEO_MODEL=...
node scripts/generate-media.js --videos   # images + videos
```

Without keys it falls back to placeholder images so the site always renders.

## Static preview (GitHub Pages)

`node scripts/build-static.js` renders every read surface (pages, JSON twins, feeds, llms.txt, manifest) into `/docs` for GitHub Pages hosting. Write endpoints (reviews, conversion tracking) require the Node server.

## Layout

```
server.js                 router + discovery surfaces (llms.txt, sitemap, manifest)
lib/render.js             HTML + JSON-LD + Open Graph rendering
lib/feeds.js              Google Merchant XML feed (also TikTok/Snap compatible)
lib/track.js              unified conversion tracking (Meta, TikTok, Snap adapters)
lib/media.js              AI image/video generation client
scripts/generate-media.js
scripts/build-static.js   static export to /docs for GitHub Pages
data/products.json        the catalogue — single source of truth
data/reviews.json         created at runtime when the first review is posted
```
