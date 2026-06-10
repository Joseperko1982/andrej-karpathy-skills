// Meta Conversions API (CAPI) client.
// Sends server-side events to graph.facebook.com when META_PIXEL_ID and
// META_ACCESS_TOKEN are set; otherwise logs the payload and no-ops.
const crypto = require('node:crypto');

const PIXEL_ID = process.env.META_PIXEL_ID;
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE;
const API_VERSION = process.env.META_API_VERSION || 'v21.0';

function sha256(value) {
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

// Builds a CAPI event. userData fields (email, phone) are hashed per Meta spec;
// clientIp / userAgent are sent raw as required.
function buildEvent(eventName, { product, value, currency, userData = {}, eventSourceUrl }) {
  const user_data = {};
  if (userData.email) user_data.em = [sha256(userData.email)];
  if (userData.phone) user_data.ph = [sha256(userData.phone)];
  if (userData.clientIp) user_data.client_ip_address = userData.clientIp;
  if (userData.userAgent) user_data.client_user_agent = userData.userAgent;

  return {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: crypto.randomUUID(),
    action_source: 'website',
    event_source_url: eventSourceUrl,
    user_data,
    custom_data: {
      content_type: 'product',
      content_ids: product ? [product.id] : [],
      content_name: product ? product.name : undefined,
      value: value ?? (product ? product.price : undefined),
      currency: currency ?? (product ? product.currency : undefined)
    }
  };
}

async function sendEvent(eventName, details) {
  const event = buildEvent(eventName, details);

  if (!PIXEL_ID || !ACCESS_TOKEN) {
    console.log(`[capi] (dry-run) ${eventName}`, JSON.stringify(event.custom_data));
    return { dryRun: true, event };
  }

  const body = { data: [event] };
  if (TEST_EVENT_CODE) body.test_event_code = TEST_EVENT_CODE;

  const url = `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await res.json();
    if (!res.ok) console.error('[capi] error response:', result);
    return { dryRun: false, event, result };
  } catch (err) {
    console.error('[capi] send failed:', err.message);
    return { dryRun: false, event, error: err.message };
  }
}

module.exports = { sendEvent, buildEvent };
