// /api/geocode — 地名轉座標（Open-Meteo 地理編碼，免金鑰），快取 7 天。
const cache = new Map();
const TTL = 1000 * 60 * 60 * 24 * 7;

export default async function handler(req, res) {
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (!q) return res.status(400).json({ error: '缺少地名' });
  const now = Date.now();
  const hit = cache.get(q);
  if (hit && now - hit.ts < TTL) return res.status(200).json(hit.data);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const url = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q) + '&count=1&language=zh&format=json';
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const hitRes = j && Array.isArray(j.results) && j.results[0];
    const data = hitRes ? { lat: hitRes.latitude, lon: hitRes.longitude, city: hitRes.name || '' } : { lat: null, lon: null, city: '' };
    if (hitRes) cache.set(q, { data, ts: now });
    return res.status(200).json(data);
  } catch (e) {
    console.error('geocode API error:', e);
    return res.status(502).json({ error: '地名查詢暫時無法使用' });
  }
}
