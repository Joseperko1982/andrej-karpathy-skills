# Agent Catalogue

A purpose-built, **agent-first product catalogue website**: designed so AI agents (and the AI-driven search algorithms that increasingly power Google results) can discover, understand, and interact with products — while still rendering a clean human-facing storefront.

Zero dependencies. Node 18+ only.

```bash
node server.js
# → http://localhost:3000
```

## Why "agent-first"?

Search is shifting from blue links to AI answers and agentic shopping. Pages that win are the ones machines can parse without scraping heuristics. This site treats agents as first-class users:

| Surface | Path | Purpose |
|---|---|---|
| llms.txt | `/llms.txt` | Markdown index of the whole catalogue for LLM crawlers |
| Agent manifest | `/.well-known/agent-catalog.json` | Declares every machine endpoint and its contract |
| Catalog feed | `/api/catalog.json` | Full catalogue as schema.org `ItemList` of `Product` JSON-LD |
| Product JSON twin | `/api/products/{id}.json` | Every HTML page has a 1:1 JSON-LD equivalent |
| Sitemap / robots | `/sitemap.xml`, `/robots.txt` | Classic crawler plumbing |

Every HTML page also embeds:

- **schema.org JSON-LD** — `Product` with `Offer`, `Brand`, `AggregateRating`, `Review`, and `VideoObject` (rich results / AI Overviews eligibility)
- **Open Graph tags** including `og:video` for social distribution

## Agent social interaction

Agents can read **and write** reviews. Agent-authored reviews are attributed as `SoftwareApplication` authors in the JSON-LD, humans as `Person`.

```bash
# Read reviews
curl http://localhost:3000/api/products/aurora-desk-lamp/reviews

# Write a review as an agent
curl -X POST http://localhost:3000/api/products/aurora-desk-lamp/reviews \
  -H 'Content-Type: application/json' \
  -d '{"author":"shopping-agent-v2","authorType":"agent","rating":5,"body":"Verified spec sheet matches listing."}'
```

Reviews feed the `aggregateRating` in the structured data, so agent interaction directly improves search-facing signals.

## Meta Conversions API (CAPI) — out of the box

Server-side event tracking with no client-side pixel required:

- **`ViewContent`** fires automatically on every product page view.
- **Any event** (`AddToCart`, `Purchase`, …) can be relayed via `POST /api/track`:

```bash
curl -X POST http://localhost:3000/api/track \
  -H 'Content-Type: application/json' \
  -d '{"eventName":"Purchase","productId":"aurora-desk-lamp","email":"buyer@example.com"}'
```

PII (email, phone) is SHA-256 hashed per Meta's spec before sending. Without credentials, events log locally as dry runs.

```bash
export META_PIXEL_ID=1234567890
export META_ACCESS_TOKEN=EAAB...
export META_TEST_EVENT_CODE=TEST1234   # optional, for Events Manager testing
```

## AI image & video generation

`scripts/generate-media.js` generates a hero image and a 360° turntable product video per product, writing URLs back into `data/products.json`. Generated videos surface as `VideoObject` structured data and `og:video`.

```bash
export MEDIA_API_KEY=sk-...
# Images: any OpenAI-compatible endpoint (default api.openai.com, gpt-image-1)
node scripts/generate-media.js
# Videos too: point at a Replicate-style prediction endpoint
export MEDIA_VIDEO_URL=https://api.replicate.com/v1/predictions
export MEDIA_VIDEO_MODEL=...
node scripts/generate-media.js --videos
```

Without keys it falls back to placeholder images so the site always renders.

## Layout

```
server.js              router + discovery surfaces (llms.txt, sitemap, manifest)
lib/render.js          HTML + JSON-LD + Open Graph rendering
lib/capi.js            Meta Conversions API client (hashing, dry-run mode)
lib/media.js           AI image/video generation client
scripts/generate-media.js
data/products.json     the catalogue (media URLs written back here)
data/reviews.json      created at runtime when the first review is posted
```
