import fs from 'fs';
import path from 'path';

const FALLBACK = {
  'spot.md': `你是一個專業旅遊行程隨手筆記解析器。請閱讀使用者的輸入並解析出【景點行程 (spots)】。
如果文字中未提及第幾天，請預設使用 "{{currentDay}}"。
請嚴格僅輸出標準 JSON 格式（不要包含 markdown）：
{
  "spots": [
    { "day": "D1", "time": "19:00", "title": "景點名稱", "desc": "描述說明" }
  ]
}`,
  'expense.md': `你是一個專業旅遊消費記帳解析器。請閱讀使用者的輸入並解析出【記帳明細 (expenses)】。
如果文字中未提及第幾天，請預設使用 "{{currentDay}}"。
如果未提及幣別，請預設使用 "{{defaultCurrency}}"（大寫字串，如 JPY, TWD, USD）。金額請轉為純數字。
請嚴格僅輸出標準 JSON 格式（不要包含 markdown）：
{
  "expenses": [
    { "day": "D1", "item": "品名", "amount": 1000, "currency": "JPY" }
  ]
}`
};

function loadPrompt(fileName, vars) {
  let tpl;
  try {
    tpl = fs.readFileSync(path.join(process.cwd(), 'api', 'prompts', fileName), 'utf8');
  } catch (e) {
    tpl = FALLBACK[fileName] || '';
  }
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
}

// 先試超快的 lite，失敗再換 flash-latest。不加 thinkingConfig / responseMimeType 以確保相容
const MODELS = ['gemini-2.5-flash-lite', 'gemini-flash-latest'];

async function callGemini(model, apiKey, systemPrompt, rawText) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 13000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [ { text: systemPrompt }, { text: `以下是使用者輸入的內容：\n${rawText}` } ] }
        ]
      })
    });
    clearTimeout(timeoutId);

    const resData = await response.json();

    if (resData.error) {
      return { ok: false, error: `(${model}) ${resData.error.message || resData.error.code}` };
    }

    const cand = resData.candidates && resData.candidates[0];
    if (!cand || !cand.content || !cand.content.parts) {
      return { ok: false, error: `(${model}) 無有效內容 finishReason=${cand && cand.finishReason}` };
    }

    // 串接所有 text 段落（思考型模型答案可能不在第 0 段）
    let text = cand.content.parts.map(p => (p && p.text) || '').join('').trim();
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

    if (!text) return { ok: false, error: `(${model}) 空白輸出 finishReason=${cand.finishReason}` };

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) { try { data = JSON.parse(m[0]); } catch (e2) {} }
      if (!data) return { ok: false, error: `(${model}) JSON 解析失敗` };
    }
    return { ok: true, data };

  } catch (e) {
    clearTimeout(timeoutId);
    return { ok: false, error: `(${model}) ${e.name === 'AbortError' ? '逾時' : e.message}`, timeout: e.name === 'AbortError' };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { rawText, type, currentDay = 'D1', defaultCurrency = 'JPY' } = req.body;

    if (!rawText) return res.status(400).json({ error: '請提供欲解析的內容！' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: '伺服器端尚未設定 GEMINI_API_KEY 環境變數！' });

    let systemPrompt = '';
    if (type === 'spot') {
      systemPrompt = loadPrompt('spot.md', { currentDay });
    } else if (type === 'exp') {
      systemPrompt = loadPrompt('expense.md', { currentDay, defaultCurrency });
    } else {
      return res.status(400).json({ error: '無效的解析類型 (type)' });
    }

    let lastError = '解析失敗';
    for (const model of MODELS) {
      const out = await callGemini(model, apiKey, systemPrompt, rawText);
      if (out.ok) return res.status(200).json({ success: true, data: out.data, model });
      lastError = out.error;
      if (out.timeout) break;
    }

    return res.status(502).json({ error: 'AI 解析失敗：' + lastError });

  } catch (error) {
    console.error('Vercel Serverless API Error:', error);
    return res.status(500).json({ error: '伺服器內部發生錯誤', details: error.message });
  }
}
