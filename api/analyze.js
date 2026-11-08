import fs from 'fs';
import path from 'path';

// 內建備援（萬一部署時 md 檔未被打包，仍可運作）
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { rawText, type, currentDay = 'D1', defaultCurrency = 'JPY' } = req.body;

    if (!rawText) {
      return res.status(400).json({ error: '請提供欲解析的內容！' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: '伺服器端尚未設定 GEMINI_API_KEY 環境變數！' });
    }

    let systemPrompt = '';
    if (type === 'spot') {
      systemPrompt = loadPrompt('spot.md', { currentDay });
    } else if (type === 'exp') {
      systemPrompt = loadPrompt('expense.md', { currentDay, defaultCurrency });
    } else {
      return res.status(400).json({ error: '無效的解析類型 (type)' });
    }

    const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: systemPrompt },
              { text: `以下是使用者輸入的內容：\n${rawText}` }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json'
        }
      })
    });

    clearTimeout(timeoutId);

    const resData = await response.json();

    if (resData.error) {
      return res.status(400).json({ error: `Gemini API 回應錯誤 (${resData.error.code}): ${resData.error.message}` });
    }

    if (!resData.candidates || !resData.candidates[0] || !resData.candidates[0].content) {
      return res.status(500).json({ error: 'Gemini 未能產生有效的分析結果' });
    }

    let replyText = resData.candidates[0].content.parts[0].text.trim();
    replyText = replyText.replace(/```json/gi, '').replace(/```/g, '').trim();

    const parsedData = JSON.parse(replyText);
    return res.status(200).json({ success: true, data: parsedData });

  } catch (error) {
    console.error('Vercel Serverless API Error:', error);
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Gemini 回應超時（25 秒），請再試一次！' });
    }
    return res.status(500).json({ error: '伺服器內部發生錯誤', details: error.message });
  }
}
