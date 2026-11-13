// Markdown 匯入（不呼叫 AI）：複製提示詞 → 使用者貼到自己的 AI 整理 → 貼回 Markdown → 預覽 → 寫入
// 行程與記帳各一組提示詞。AI 隨手記已隱藏（程式碼保留，未使用）。

const MD_DAY_HEADER = /^#{1,6}\s*(D\d+)\b\s*(.*)$/i;
const MD_SPOT_LINE = /^[-*]\s+(?:(\d{1,2}):(\d{2})\s+)?(.+?)(?:\s*\|\s*(.+))?$/;
const MD_EXP_LINE = /^[-*]\s+(.+?)\s+(\d+(?:\.\d+)?)\s*([A-Za-z]{3})?\s*(?:@(\S+))?$/;

function getMdKind() {
  const modal = document.getElementById('mdImportModal');
  return modal ? modal.dataset.kind : 'spot';
}

function getMdDefaultCurrency() {
  const list = window.getProjectCurrencies(window.activeProjectData || {}) || [];
  return (list[0] || 'JPY').toUpperCase();
}

function getMdMemberNames() {
  return window.getAllSplitNames(window.activeProjectData || {}) || [];
}

// ===== 提示詞 =====

function buildMdPrompt(kind) {
  if (kind === 'spot') {
    const n = Number(window.getProjectDayCount(window.activeProjectData || {})) || 0;
    const dayRule = n > 0
      ? '這趟旅程共 ' + n + ' 天，請依序使用 ## D1 到 ## D' + n + '。'
      : '請從 ## D1 開始依序編號每一天。';
    return [
      '你是旅遊行程整理助手。請把我提供的粗略行程，整理成下列固定格式的 Markdown。',
      '只輸出 Markdown 本文，不要任何前言、解釋或結尾。',
      '',
      '格式規則：',
      '1. ' + dayRule + '每一天用 "## D1" 這樣的標題開頭。',
      '2. 每個景點一行，以 "- " 開頭。',
      '3. 有確定時間就寫在景點前面，格式為 24 小時制 HH:MM（例如 09:00、19:30）；不確定的時間就省略，不要猜。',
      '4. 景點名稱接在時間後面。',
      '5. 如果要加說明，在景點名稱後面加一個空格、直線符號 |、再寫說明，例如：- 19:00 京都車站拉麵小路 | 必吃醬油拉麵。沒有說明就不要加 |。',
      '6. 不要使用表格、粗體、巢狀清單或其他符號。',
      '',
      '輸出範例：',
      '## D1',
      '- 09:00 伏見稻荷大社 | 爬千本鳥居約 2 小時',
      '- 19:00 京都車站拉麵小路',
      '',
      '## D2',
      '- 10:00 嵐山竹林',
      '',
      '以下是我的粗略行程：',
      '（請把你的行程草稿貼在這裡）'
    ].join('\n');
  }

  const cur = getMdDefaultCurrency();
  const names = getMdMemberNames().join('、') || '（目前尚無成員名單，可省略 @付款人）';
  return [
    '你是旅遊記帳整理助手。請把我提供的消費明細，整理成下列固定格式的 Markdown。',
    '只輸出 Markdown 本文，不要任何前言、解釋或結尾。',
    '',
    '格式規則：',
    '1. 每一天用 "## D1" 這樣的標題開頭，天數從 D1 開始依序編號。',
    '2. 每筆消費一行，以 "- " 開頭，格式為：品項 金額 幣別 @付款人',
    '3. 金額只寫阿拉伯數字，不要千分位逗號，例如寫 1200，不要寫 1,200。',
    '4. 幣別用三位英文代碼（例如 JPY、TWD、USD）；沒有寫幣別時預設為 ' + cur + '。',
    '5. @付款人 可以省略；要寫的話只能從以下成員名字中選一個：' + names + '。',
    '6. 不要使用表格、粗體、巢狀清單或其他符號。',
    '',
    '輸出範例：',
    '## D1',
    '- 超商零食 1200 JPY @小明',
    '- 晚餐拉麵 3000 JPY',
    '',
    '## D2',
    '- 門票 800 JPY',
    '- 計程車 4500 JPY @小華',
    '',
    '以下是我的消費明細：',
    '（請把你的消費紀錄貼在這裡）'
  ].join('\n');
}

// ===== 解析（純前端，不呼叫任何 API）=====

function parseSpotMd(text) {
  const items = [];
  const warnings = [];
  const dayTitles = {};
  let day = null;

  String(text || '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || /^```/.test(line)) return;

    const h = line.match(MD_DAY_HEADER);
    if (h) {
      day = h[1].toUpperCase();
      if (h[2]) dayTitles[day] = h[2].trim();
      return;
    }

    const m = line.match(MD_SPOT_LINE);
    if (!m) return;
    if (!day) {
      warnings.push('第 ' + (i + 1) + ' 行前面沒有 ## D1 這類天數標題，已略過');
      return;
    }
    items.push({
      day: day,
      time: m[1] ? m[1].padStart(2, '0') + ':' + m[2] : '',
      title: m[3].trim(),
      desc: (m[4] || '').trim()
    });
  });

  return { items: items, warnings: warnings, dayTitles: dayTitles };
}

function parseExpMd(text, defaultCur, names) {
  const items = [];
  const warnings = [];
  const me = window.currentUser ? window.currentUser.name : '';
  let day = null;

  String(text || '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || /^```/.test(line)) return;

    const h = line.match(MD_DAY_HEADER);
    if (h) { day = h[1].toUpperCase(); return; }

    if (!/^[-*]\s/.test(line)) return;
    const m = line.match(MD_EXP_LINE);
    if (!m) {
      warnings.push('第 ' + (i + 1) + ' 行無法辨識（格式：- 品項 金額 幣別 @付款人）：' + line);
      return;
    }
    if (!day) {
      warnings.push('第 ' + (i + 1) + ' 行前面沒有 ## D1 這類天數標題，已略過');
      return;
    }

    let payer = me;
    if (m[4]) {
      if (names.indexOf(m[4]) !== -1) payer = m[4];
      else warnings.push('付款人「' + m[4] + '」不在成員名單，已改為你本人');
    }

    items.push({
      day: day,
      item: m[1].trim(),
      amount: parseFloat(m[2]) || 0,
      currency: (m[3] || defaultCur).toUpperCase(),
      payer: payer
    });
  });

  return { items: items, warnings: warnings };
}

// ===== 彈窗 =====

window.closeMdImportModal = function() {
  const modal = document.getElementById('mdImportModal');
  if (modal) modal.style.display = 'none';
};
// 舊程式碼相容
window.closeAiImportModal = window.closeMdImportModal;

function openMdModal(kind) {
  if (!window.canEditContent(window.activeProjectData)) {
    return alert('你沒有編輯權限（僅團員、團主或管理員可匯入）。');
  }
  const modal = document.getElementById('mdImportModal');
  modal.dataset.kind = kind;
  document.getElementById('mdModalTitle').innerText =
    kind === 'spot' ? '📝 Markdown 匯入行程' : '📝 Markdown 匯入記帳';
  document.getElementById('mdHint').innerText = kind === 'spot'
    ? '① 複製下方提示詞，貼到你常用的 AI（ChatGPT、Gemini、Claude 等），並把你粗略的行程貼在提示詞最後。② 把 AI 回覆的 Markdown 貼到下方，確認預覽後匯入。'
    : '① 複製下方提示詞，貼到你常用的 AI，並把消費明細貼在提示詞最後。② 把 AI 回覆的 Markdown 貼到下方，確認預覽後匯入。';
  document.getElementById('mdPromptBox').value = buildMdPrompt(kind);
  document.getElementById('mdInput').value = '';
  document.getElementById('mdPreview').innerHTML = '';
  document.getElementById('mdImportBtn').disabled = true;
  modal.style.display = 'flex';
}

// 保留原本的呼叫名稱（按鈕 onclick 仍使用），mode 參數已不影響行為
window.openSpotAiModal = function() { openMdModal('spot'); };
window.openExpAiModal = function() { openMdModal('exp'); };

window.mdCopyPrompt = function() {
  const text = document.getElementById('mdPromptBox').value;
  const btn = document.getElementById('mdCopyBtn');
  const flash = (msg) => {
    btn.innerText = msg;
    setTimeout(() => { btn.innerText = '📋 複製提示詞'; }, 1800);
  };
  const fallback = () => {
    const ta = document.getElementById('mdPromptBox');
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    flash(ok ? '✅ 已複製，貼到你的 AI 吧！' : '請手動全選複製');
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => flash('✅ 已複製，貼到你的 AI 吧！'))
      .catch(fallback);
  } else {
    fallback();
  }
};

window.mdPreviewInput = function() {
  const kind = getMdKind();
  const text = document.getElementById('mdInput').value;
  const box = document.getElementById('mdPreview');
  const btn = document.getElementById('mdImportBtn');

  if (!text.trim()) {
    box.innerHTML = '';
    btn.disabled = true;
    return;
  }

  let html = '';
  let count = 0;
  let warnings = [];

  if (kind === 'spot') {
    const r = parseSpotMd(text);
    count = r.items.length;
    warnings = r.warnings;
    const byDay = {};
    r.items.forEach(it => { (byDay[it.day] = byDay[it.day] || []).push(it); });
    html += '<div style="font-weight:800; margin-bottom:6px;">預覽：共 ' + count + ' 個景點</div>';
    Object.keys(byDay).forEach(d => {
      html += '<div style="font-weight:700; margin-top:6px;">' + escapeHtml(d) + '</div>';
      byDay[d].forEach(it => {
        html += '<div>・' + (it.time ? escapeHtml(it.time) + ' ' : '') + escapeHtml(it.title) +
          (it.desc ? ' <span style="color:var(--sub-text)">｜' + escapeHtml(it.desc) + '</span>' : '') + '</div>';
      });
    });
  } else {
    const r = parseExpMd(text, getMdDefaultCurrency(), getMdMemberNames());
    count = r.items.length;
    warnings = r.warnings;
    html += '<div style="font-weight:800; margin-bottom:6px;">預覽：共 ' + count + ' 筆消費</div>';
    r.items.forEach(it => {
      html += '<div>・' + escapeHtml(it.day) + '　' + escapeHtml(it.item) + '　' +
        escapeHtml(String(it.amount)) + ' ' + escapeHtml(it.currency) +
        ' <span style="color:var(--sub-text)">付款：' + escapeHtml(it.payer) + '</span></div>';
    });
  }

  warnings.forEach(w => {
    html += '<div style="color:#D9534F; margin-top:4px;">⚠️ ' + escapeHtml(w) + '</div>';
  });

  box.innerHTML = html;
  btn.disabled = count === 0;
};

window.mdConfirmImport = async function() {
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限。');
  if (!window.activeProjectId) return alert('請先進入專案！');
  if (!window.dbRef || !window.db) return alert('系統載入中，請稍候再試');

  const kind = getMdKind();
  const text = document.getElementById('mdInput').value;
  const btn = document.getElementById('mdImportBtn');
  const projPath = 'projects/' + window.activeProjectId;

  btn.disabled = true;
  try {
    if (kind === 'spot') {
      const r = parseSpotMd(text);
      if (!r.items.length) return alert('沒有可匯入的景點');

      const itin = JSON.parse(JSON.stringify(window.activeProjectData.itinerary || {}));
      r.items.forEach(it => {
        if (!itin[it.day]) {
          itin[it.day] = { title: r.dayTitles[it.day] || it.day, spots: [] };
        }
        const cur = itin[it.day].spots;
        const spots = Array.isArray(cur) ? cur : Object.values(cur || {});
        spots.push({ time: it.time, title: it.title, mapUrl: '', thumbUrl: '', desc: it.desc });
        itin[it.day].spots = spots;
      });

      await window.dbSet(window.dbRef(window.db, projPath + '/itinerary'), itin);
      window.activeProjectData.itinerary = itin;

      alert('🎉 已匯入 ' + r.items.length + ' 個行程景點！');
      document.getElementById('mdInput').value = '';
      window.closeMdImportModal();
      if (typeof window.renderItineraryFromJSON === 'function') {
        window.renderItineraryFromJSON(itin);
      }
    } else {
      const r = parseExpMd(text, getMdDefaultCurrency(), getMdMemberNames());
      if (!r.items.length) return alert('沒有可匯入的消費');

      const names = getMdMemberNames();
      const expRef = window.dbRef(window.db, projPath + '/expenses');
      for (const it of r.items) {
        await window.dbPush(expRef, {
          day: it.day,
          item: it.item,
          amount: it.amount,
          currency: it.currency,
          payer: it.payer,
          participants: names,
          timestamp: Date.now()
        });
      }

      alert('🎉 已匯入 ' + r.items.length + ' 筆消費！');
      document.getElementById('mdInput').value = '';
      window.closeMdImportModal();
      if (typeof window.renderExpenses === 'function') window.renderExpenses();
    }
  } catch (err) {
    console.error('Markdown 匯入失敗:', err);
    alert('匯入失敗：' + (err.message || err));
  } finally {
    btn.disabled = false;
  }
};
