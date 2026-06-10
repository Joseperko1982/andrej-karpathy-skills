// Unified server-side conversion tracking.
// One canonical event (ViewContent | AddToCart | Purchase) fans out to every
// configured ad platform: Meta CAPI, TikTok Events API v1.3, Snap CAPI v3.
// PII is normalized and SHA-256 hashed once, centrally. Platforms without
// credentials log a dry run, so the pipeline works in any environment.
const crypto = require('node:crypto');

function sha256(value) {
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

// Normalize once; adapters only reshape.
function normalize(eventName, { product, value, currency, userData = {}, eventSourceUrl }) {
  return {
    name: eventName,
    id: crypto.randomUUID(),
    time: Math.floor(Date.now() / 1000),
    url: eventSourceUrl,
    value: value ?? (product ? product.price : undefined),
    currency: currency ?? (product ? product.currency : undefined),
    contentId: product ? product.id : undefined,
    contentName: product ? product.name : undefined,
    email: userData.email ? sha256(userData.email) : undefined,
    phone: userData.phone ? sha256(userData.phone) : undefined,
    ip: userData.clientIp,
    userAgent: userData.userAgent
  };
}

const meta = {
  name: 'meta',
  enabled: () => !!(process.env.META_PIXEL_ID && process.env.META_ACCESS_TOKEN),
  request(e) {
    const user_data = {};
    if (e.email) user_data.em = [e.email];
    if (e.phone) user_data.ph = [e.phone];
    if (e.ip) user_data.client_ip_address = e.ip;
    if (e.userAgent) user_data.client_user_agent = e.userAgent;
    const body = {
      data: [{
        event_name: e.name,
        event_time: e.time,
        event_id: e.id,
        action_source: 'website',
        event_source_url: e.url,
        user_data,
        custom_data: { content_type: 'product', content_ids: e.contentId ? [e.contentId] : [], content_name: e.contentName, value: e.value, currency: e.currency }
      }]
    };
    if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;
    const version = process.env.META_API_VERSION || 'v21.0';
    return { url: `https://graph.facebook.com/${version}/${process.env.META_PIXEL_ID}/events?access_token=${process.env.META_ACCESS_TOKEN}`, body };
  }
};

const TIKTOK_EVENTS = { Purchase: 'CompletePayment' }; // others map 1:1
const tiktok = {
  name: 'tiktok',
  enabled: () => !!(process.env.TIKTOK_PIXEL_CODE && process.env.TIKTOK_ACCESS_TOKEN),
  request(e) {
    const body = {
      event_source: 'web',
      event_source_id: process.env.TIKTOK_PIXEL_CODE,
      data: [{
        event: TIKTOK_EVENTS[e.name] || e.name,
        event_time: e.time,
        event_id: e.id,
        user: { email: e.email, phone: e.phone, ip: e.ip, user_agent: e.userAgent },
        properties: {
          content_type: 'product',
          contents: e.contentId ? [{ content_id: e.contentId, content_name: e.contentName, price: e.value }] : [],
          value: e.value,
          currency: e.currency
        },
        page: { url: e.url }
      }]
    };
    if (process.env.TIKTOK_TEST_EVENT_CODE) body.test_event_code = process.env.TIKTOK_TEST_EVENT_CODE;
    return { url: 'https://business-api.tiktok.com/open_api/v1.3/event/track/', headers: { 'Access-Token': process.env.TIKTOK_ACCESS_TOKEN }, body };
  }
};

const SNAP_EVENTS = { ViewContent: 'VIEW_CONTENT', AddToCart: 'ADD_CART', Purchase: 'PURCHASE' };
const snap = {
  name: 'snap',
  enabled: () => !!(process.env.SNAP_PIXEL_ID && process.env.SNAP_ACCESS_TOKEN),
  request(e) {
    const user_data = {};
    if (e.email) user_data.em = [e.email];
    if (e.phone) user_data.ph = [e.phone];
    if (e.ip) user_data.client_ip_address = e.ip;
    if (e.userAgent) user_data.client_user_agent = e.userAgent;
    const body = {
      data: [{
        event_name: SNAP_EVENTS[e.name] || e.name,
        action_source: 'WEB',
        event_time: e.time * 1000, // Snap expects milliseconds
        event_source_url: e.url,
        user_data,
        custom_data: { content_ids: e.contentId ? [e.contentId] : [], value: e.value, currency: e.currency }
      }]
    };
    return { url: `https://tr.snapchat.com/v3/${process.env.SNAP_PIXEL_ID}/events?access_token=${process.env.SNAP_ACCESS_TOKEN}`, body };
  }
};

const PLATFORMS = [meta, tiktok, snap];

async function deliver(platform, event) {
  if (!platform.enabled()) {
    console.log(`[track] ${platform.name} (dry-run) ${event.name} ${event.contentId || ''}`);
    return { platform: platform.name, dryRun: true };
  }
  const { url, headers = {}, body } = platform.request(event);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body)
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) console.error(`[track] ${platform.name} error:`, result);
    return { platform: platform.name, dryRun: false, status: res.status };
  } catch (err) {
    console.error(`[track] ${platform.name} send failed:`, err.message);
    return { platform: platform.name, dryRun: false, error: err.message };
  }
}

// Fires the event to all platforms concurrently; one platform failing never
// blocks the others (or the HTTP response that triggered the event).
async function sendEvent(eventName, details) {
  const event = normalize(eventName, details);
  const results = await Promise.all(PLATFORMS.map(p => deliver(p, event)));
  return { eventId: event.id, platforms: results };
}

module.exports = { sendEvent, normalize };
