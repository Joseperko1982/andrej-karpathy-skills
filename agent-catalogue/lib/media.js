// AI media generation for product images and videos.
// Uses any OpenAI-compatible image endpoint (MEDIA_IMAGE_URL) and a
// Replicate-style video endpoint (MEDIA_VIDEO_URL). Without API keys it
// returns deterministic placeholder URLs so the catalogue still renders.
const IMAGE_URL = process.env.MEDIA_IMAGE_URL || 'https://api.openai.com/v1/images/generations';
const VIDEO_URL = process.env.MEDIA_VIDEO_URL; // e.g. https://api.replicate.com/v1/predictions
const API_KEY = process.env.MEDIA_API_KEY;

function imagePrompt(product) {
  return `Studio product photograph of ${product.name} by ${product.brand}: ${product.description} ` +
    `Clean seamless background, soft key light, e-commerce hero shot, no text.`;
}

function videoPrompt(product) {
  return `Slow 360-degree turntable product video of ${product.name} by ${product.brand}. ` +
    `${product.description} Studio lighting, seamless background, 5 seconds, no text overlays.`;
}

async function generateImage(product) {
  if (!API_KEY) {
    return { url: `https://placehold.co/1024x1024?text=${encodeURIComponent(product.name)}`, dryRun: true };
  }
  const res = await fetch(IMAGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: process.env.MEDIA_IMAGE_MODEL || 'gpt-image-1', prompt: imagePrompt(product), size: '1024x1024' })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`image generation failed: ${JSON.stringify(data)}`);
  return { url: data.data[0].url, dryRun: false };
}

async function generateVideo(product) {
  if (!API_KEY || !VIDEO_URL) {
    return { url: null, dryRun: true, note: 'Set MEDIA_API_KEY and MEDIA_VIDEO_URL to generate product videos.' };
  }
  const res = await fetch(VIDEO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: process.env.MEDIA_VIDEO_MODEL, input: { prompt: videoPrompt(product) } })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`video generation failed: ${JSON.stringify(data)}`);
  // Replicate returns a prediction; the output URL appears when status is "succeeded".
  return { url: data.output || null, prediction: data.id, dryRun: false };
}

module.exports = { generateImage, generateVideo, imagePrompt, videoPrompt };
