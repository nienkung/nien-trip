// /api/weather — Open-Meteo 天氣預報代理（16 天每日資料），以座標為快取鍵，3 小時快取。
const cache = new Map();
const TTL = 1000 * 60 * 60 * 3;

export default async function handler(req, res) {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return res.status(400).json({ error: '座標錯誤' });
  }
  const key = lat.toFixed(2) + ',' + lon.toFixed(2);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.ts < TTL) {
    res.setHeader('Cache-Control', 's-maxage=10800, stale-while-revalidate=86400');
    return res.status(200).json(hit.data);
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat.toFixed(2) + '&longitude=' + lon.toFixed(2) +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16';
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const d = j.daily || {};
    const out = {
      timezone: j.timezone || '',
      daily: {
        time: d.time || [],
        code: d.weather_code || [],
        hi: d.temperature_2m_max || [],
        lo: d.temperature_2m_min || [],
        rain: d.precipitation_probability_max || []
      },
      fetchedAt: now
    };
    cache.set(key, { data: out, ts: now });
    res.setHeader('Cache-Control', 's-maxage=10800, stale-while-revalidate=86400');
    return res.status(200).json(out);
  } catch (e) {
    console.error('weather API error:', e);
    if (hit) return res.status(200).json(hit.data);
    return res.status(502).json({ error: '天氣服務暫時無法使用' });
  }
}
