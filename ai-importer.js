window.openAiImportModal = function() {
  const modal = document.getElementById('aiImportModal');
  if (modal) modal.style.display = 'flex';
};

window.closeAiImportModal = function() {
  const modal = document.getElementById('aiImportModal');
  if (modal) modal.style.display = 'none';
};

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

window.processSpotAiImport = async function() {
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限（僅團員、團主或管理員可使用 AI 隨手記）。');
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
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限（僅團員、團主或管理員可使用 AI 隨手記）。');
  const inputElem = document.getElementById('expAiInput');
  const rawText = inputElem ? inputElem.value.trim() : '';

  if (!rawText) return alert('請輸入口語消費內容或貼上明細！');
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
