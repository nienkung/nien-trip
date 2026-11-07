// 打開/關閉 AI 隨手記彈窗
window.openAiImportModal = function() {
  const modal = document.getElementById('aiImportModal');
  if (modal) modal.style.display = 'flex';
};

window.closeAiImportModal = function() {
  const modal = document.getElementById('aiImportModal');
  if (modal) modal.style.display = 'none';
};

// 切換「📍 行程」與「📝 記帳」雙分頁
window.switchAiTab = function(type) {
  const btnSpot = document.getElementById('tabBtnSpot');
  const btnExp = document.getElementById('tabBtnExp');
  const secSpot = document.getElementById('aiSectionSpot');
  const secExp = document.getElementById('aiSectionExp');

  if (type === 'spot') {
    if (btnSpot) btnSpot.classList.add('active');
    if (btnExp) btnExp.classList.remove('active');
    if (secSpot) secSpot.style.display = 'block';
    if (secExp) secExp.style.display = 'none';
  } else {
    if (btnExp) btnExp.classList.add('active');
    if (btnSpot) btnSpot.classList.remove('active');
    if (secExp) secExp.style.display = 'block';
    if (secSpot) secSpot.style.display = 'none';
  }
};

// 📍 解析行程並【自動寫入 Firebase】
window.processSpotAiImport = async function() {
  const inputElem = document.getElementById('spotAiInput');
  const rawText = inputElem ? inputElem.value.trim() : '';

  if (!rawText) return alert('請輸入口語行程內容或貼上網頁文字！');
  if (!window.activeProjectId || !window.activeProjectData) return alert('請先進入公開專案！');

  const submitBtn = document.getElementById('spotAiBtn');
  if (submitBtn) {
    submitBtn.innerText = '🧠 Gemini AI 分析寫入中...';
    submitBtn.disabled = true;
  }

  try {
    // 呼叫後端 Vercel Serverless Function
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawText: rawText,
        type: 'spot',
        currentDay: window.currentActiveDay || 'D1'
      })
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || '解析失敗');
    }

    const parsed = result.data;
    let spotCount = 0;

    if (parsed.spots && parsed.spots.length > 0) {
      if (!window.activeProjectData.itinerary) window.activeProjectData.itinerary = {};

      parsed.spots.forEach(spot => {
        const dKey = spot.day || 'D1';
        if (!window.activeProjectData.itinerary[dKey]) {
          window.activeProjectData.itinerary[dKey] = { title: dKey, spots: [] };
        }
        if (!window.activeProjectData.itinerary[dKey].spots) {
          window.activeProjectData.itinerary[dKey].spots = [];
        }
        window.activeProjectData.itinerary[dKey].spots.push({
          time: spot.time || '',
          title: spot.title || '景點',
          desc: spot.desc || ''
        });
