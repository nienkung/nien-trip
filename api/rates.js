// /api/rates — 即時匯率代理（每日快取）
// 來源：open.er-api.com（免費、免金鑰）。回傳「1 單位外幣 = 幾台幣」的 rates 表。

let cache = { data: null, ts: 0 };
const TTL = 1000 * 60 * 60 * 6; // 6 小時

export default async function handler(req, res) {
  const now = Date.now();

  // 命中快取（warm instance）
  if (cache.data && (now - cache.ts) < TTL) {
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
    return res.status(200).json(cache.data);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const r = await fetch('https://open.er-api.com/v6/latest/USD', { signal: controller.signal });
    clearTimeout(timeoutId);

    const j = await r.json();

    if (!j || j.result !== 'success' || !j.rates || !j.rates.TWD) {
      if (cache.data) return res.status(200).json(cache.data);
      return res.status(502).json({ error: '匯率來源無有效回應' });
    }

    const usdRates = j.rates;        // usdRates[C] = 1 美元可兌換多少 C
    const twdPerUsd = usdRates.TWD;  // 1 美元 = 幾台幣

    const out = {
      base: 'TWD',
      rates: {},
      updatedAt: j.time_last_update_unix ? j.time_last_update_unix * 1000 : now,
      source: 'open.er-api.com'
    };

    // 1 單位 C = (twdPerUsd / usdRates[C]) 台幣
    Object.keys(usdRates).forEach(code => {
      if (usdRates[code]) out.rates[code] = twdPerUsd / usdRates[code];
    });
    out.rates.TWD = 1.0;

    cache = { data: out, ts: now };
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
    return res.status(200).json(out);

  } catch (e) {
    console.error('rates API error:', e);
    if (cache.data) return res.status(200).json(cache.data);
    return res.status(500).json({ error: '匯率服務暫時無法使用', details: e.message });
  }
}
