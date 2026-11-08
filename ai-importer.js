// AI 隨手記 / Markdown 匯入：依頁籤情境開啟，行程對應行程、記帳對應記帳，皆送同一支 Gemini API

window.closeAiImportModal = function() {
  const modal = document.getElementById('aiImportModal');
  if (modal) modal.style.display = 'none';
};

function showAiModal(which, title) {
  document.getElementById('aiModalTitle').innerText = title;
  document.getElementById('aiSectionSpot').style.display = (which === 'spot') ? 'block' : 'none';
  document.getElementById('aiSectionExp').style.display = (which === 'exp') ? 'block' : 'none';
  const modal = document.getElementById('aiImportModal');
  if (modal) modal.style.display = 'flex';
}

// 行程匯入（mode: 'ai' 隨手口語 / 'md' Markdown 批次）
window.openSpotAiModal = function(mode) {
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限（僅團員、團主或管理員可匯入）。');
  const hint = document.getElementById('aiSpotHint');
  const ta = document.getElementById('spotAiInput');
  if (mode === 'md') {
    hint.textContent = '貼上 Markdown 或整理好的清單（可一次多天），AI 會批次解析成行程景點。';
    ta.placeholder = '## D1\n- 19:00 京都車站拉麵小路\n- 清水寺看夜楓\n\n## D2\n- 09:00 伏見稻荷大社';
    showAiModal('spot', '📝 Markdown 匯入行程');
  } else {
    hint.textContent = '用口語隨手寫或貼上文章，AI 自動判斷天數、時間與景點。';
    ta.placeholder = '例如：第一天晚上七點去京都車站拉麵小路吃拉麵，吃完去清水寺看夜楓';
    showAiModal('spot', '🤖 AI 隨手記（行程）');
  }
};

// 記帳匯入
window.openExpAiModal = function(mode) {
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限（僅團員、團主或管理員可匯入）。');
  const hint = document.getElementById('aiExpHint');
  const ta = document.getElementById('expAiInput');
  if (mode === 'md') {
    hint.textContent = '貼上 Markdown 或整理好的消費清單，AI 會批次解析成記帳。';
    ta.placeholder = '## D1\n- 超商零食 1200 JPY\n- 晚餐拉麵 3000 JPY\n\n## D2\n- 門票 800 JPY';
    showAiModal('exp', '📝 Markdown 匯入記帳');
  } else {
    hint.textContent = '用口語隨手寫或貼上明細，AI 自動判斷天數、品名、金額與幣別。';
    ta.placeholder = '例如：第一天買了超商零食 1200 日圓，晚上拉麵 3000 日圓';
    showAiModal('exp', '🤖 AI 隨手記（記帳）');
  }
};

window.processSpotAiImport = async function() {
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限。');
  const inputElem = document.getElementById('spotAiInput');
  const rawText = inputElem ? inputElem.value.trim() : '';

  if (!rawText) return alert('請輸入內容或貼上文字！');
  if (!window.activeProjectId || !window.activeProjectData) return alert('請先進入公開專案！');

  const submitBtn = document.getElementById('spotAiBtn');
  if (submitBtn) {
    submitBtn.innerText = '🧠 Gemini AI 分析寫入中...';
    submitBtn.disabled = true;
  }

  try {
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
          mapUrl: '',
          thumbUrl: '',
          desc: spot.desc || ''
        });
        spotCount++;
      });

      if (window.dbSet && window.dbRef) {
        window.dbSet(window.dbRef(window.db, `projects/${window.activeProjectId}/itinerary`), window.activeProjectData.itinerary);
      }
    }

    alert(`🎉 AI 解析成功！已自動寫入 ${spotCount} 個行程景點！`);
    if (inputElem) inputElem.value = '';
    window.closeAiImportModal();

    if (typeof window.renderItineraryFromJSON === 'function') {
      window.renderItineraryFromJSON(window.activeProjectData.itinerary);
    }

  } catch (err) {
    console.error("行程 AI 解析錯誤:", err);
    alert('解析失敗：' + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.innerText = '📍 智慧理解並寫入行程';
      submitBtn.disabled = false;
    }
  }
};

window.processExpAiImport = async function() {
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限。');
  const inputElem = document.getElementById('expAiInput');
  const rawText = inputElem ? inputElem.value.trim() : '';

  if (!rawText) return alert('請輸入內容或貼上明細！');
  if (!window.activeProjectId) return alert('請先進入公開專案！');

  const submitBtn = document.getElementById('expAiBtn');
  if (submitBtn) {
    submitBtn.innerText = '🧠 Gemini AI 分析寫入中...';
    submitBtn.disabled = true;
  }

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawText: rawText,
        type: 'exp',
        currentDay: window.currentActiveDay || 'D1',
        defaultCurrency: 'JPY'
      })
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || '解析失敗');
    }

    const parsed = result.data;
    let expCount = 0;

    if (parsed.expenses && parsed.expenses.length > 0) {
      parsed.expenses.forEach(exp => {
        if (window.dbPush && window.dbRef) {
          const expensesRef = window.dbRef(window.db, `projects/${window.activeProjectId}/expenses`);
          window.dbPush(expensesRef, {
            day: exp.day || 'D1',
            item: exp.item || '消費品項',
            amount: parseFloat(exp.amount) || 0,
            currency: exp.currency || 'JPY',
            payer: window.currentUser ? window.currentUser.name : '錢粘',
            timestamp: Date.now()
          });
          expCount++;
        }
      });
    }

    alert(`🎉 AI 解析成功！已自動寫入 ${expCount} 筆消費記帳！`);
    if (inputElem) inputElem.value = '';
    window.closeAiImportModal();

    if (typeof window.renderExpenses === 'function') {
      window.renderExpenses();
    }

  } catch (err) {
    console.error("記帳 AI 解析錯誤:", err);
    alert('解析失敗：' + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.innerText = '📝 智慧理解並寫入記帳';
      submitBtn.disabled = false;
    }
  }
};
