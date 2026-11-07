export default async function handler(req, res) {
  // 僅允許 POST 請求
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

    // 依據類型定義不同的 System Prompt
    let systemPrompt = "";
    if (type === 'spot') {
      systemPrompt = `你是一個專業旅遊行程隨手筆記解析器。請閱讀使用者的輸入並解析出【景點行程 (spots)】。
如果文字中未提及第幾天，請預設使用 "${currentDay}"。
請嚴格輸出 JSON 格式：
{
  "spots": [
    { "day": "D1", "time": "19:00", "title": "景點名稱", "desc": "描述說明" }
  ]
}`;
    } else if (type === 'exp') {
      systemPrompt = `你是一個專業旅遊消費記帳解析器。請閱讀使用者的輸入並解析出【記帳明細 (expenses)】。
如果文字中未提及第幾天，請預設使用 "${currentDay}"。
如果未提及幣別，請預設使用 "${defaultCurrency}"（如 JPY, TWD, USD 等大寫字串）。
金額請轉為純數字。
請嚴格輸出 JSON 格式：
{
  "expenses": [
    { "day": "D1", "item": "品名", "amount": 1000, "currency": "JPY" }
  ]
}`;
    } else {
      return res.status(400).json({ error: '無效的解析類型 (type)' });
    }

    // 後端呼叫最新 gemini-3.8-flash 模型 API
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: systemPrompt },
              { text: `以下是使用者輸入的內容：\n${rawText}` }
            ]
          }
        ]
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: `Gemini API 回應錯誤 (${data.error.code}): ${data.error.message}` });
    }

    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      return res.status(500).json({ error: 'Gemini 未能產生有效的分析結果' });
    }

    let replyText = data.candidates[0].content.parts[0].text.trim();
    // 清理 markdown codeblock 標記
    replyText = replyText.replace(/```json/gi, '').replace(/```/g, '').trim();

    const parsedData = JSON.parse(replyText);
    res.status(200).json({ success: true, data: parsedData });

  } catch (error) {
    console.error("Vercel Serverless API Error:", error);
    res.status(500).json({ error: '伺服器內部發生錯誤', details: error.message });
  }
}
