// 記帳與結算數字：僅團員 / 團主 / 網站管理員可看；訪客（非該團成員）只能看行程
window.canViewExpenses = function(proj) {
  return window.canEditContent(proj);
};

function expenseLockedHTML() {
  return `<div style="font-size:13px; color:var(--sub-text); text-align:center; padding:24px 12px;">🔒 記帳與分帳明細僅限團員查看<br>（你目前是訪客，可查看行程）</div>`;
}

window.updateExpenseFormOptions = function() {
  if (!window.activeProjectData) return;
  const proj = window.activeProjectData;
  const daysList = window.getDynamicProjectDays(proj);
  const splitNames = window.getAllSplitNames(proj);
  const names = splitNames.length ? splitNames : ['錢粘'];

  // 依權限顯示/隱藏「新增記帳」表單
  const addCard = document.getElementById('addExpenseCard');
  if (addCard) addCard.style.display = window.canEditContent(proj) ? 'block' : 'none';

  const expDaySelect = document.getElementById('expDay');
  if (expDaySelect) {
    expDaySelect.innerHTML = daysList.map(day => `
      <option value="${day}">${day === 'D0' ? 'D0 (預付/準備)' : 'Day ' + day.replace('D', '')}</option>
    `).join('');
  }

  // 幣別：讀專案設定的幣別清單
  const currencyCodes = window.getProjectCurrencies(proj);
  const expCurrencySelect = document.getElementById('expCurrency');
  if (expCurrencySelect) {
    expCurrencySelect.innerHTML = currencyCodes.map(code => {
      const info = window.CURRENCY_INFO[code] || { name: code, symbol: '' };
      return `<option value="${code}">${info.symbol || ''} ${code} - ${info.name || ''}</option>`;
    }).join('');
  }

  const expPayerSelect = document.getElementById('expPayer');
  if (expPayerSelect) {
    expPayerSelect.innerHTML = names.map(m => `<option value="${window.escapeHtml(m)}">${window.escapeHtml(m)}</option>`).join('');
    if (window.currentUser && names.includes(window.currentUser.name)) {
      expPayerSelect.value = window.currentUser.name;
    }
  }

  const box = document.getElementById('expParticipantsBox');
  if (box) {
    box.innerHTML = names.map(m => `
      <label class="checkbox-label">
        <input type="checkbox" name="expParticipants" value="${window.escapeHtml(m)}" checked> ${window.escapeHtml(m)}
      </label>
    `).join('');
  }
};

// ===== 發票／收據：圖片先縮小再上傳到 Firebase Storage =====

const RECEIPT_MAX_BYTES = 10 * 1024 * 1024; // 原檔上限 10MB
const RECEIPT_MAX_SIDE = 1600;              // 圖片長邊最多 1600px（原圖）
const RECEIPT_THUMB_SIDE = 320;             // 縮圖長邊 320px（列表用）

function receiptStorageReady() {
  return !!(window.storage && window.sRef && window.uploadBytes && window.getDownloadURL && window.deleteObject);
}

function genReceiptId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('無法讀取這張圖片')); };
    img.src = url;
  });
}

// 把圖片縮到指定長邊並輸出 JPEG
function scaleImageToJpeg(img, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
}

// 圖片：原圖縮到長邊 1600px、另產生 320px 縮圖；PDF：原樣上傳，不產生縮圖
async function prepareReceiptFile(file) {
  if (file.size > RECEIPT_MAX_BYTES) throw new Error(`「${file.name}」超過 10MB，請換小一點的檔案。`);
  if (file.type === 'application/pdf') return { blob: file, ext: 'pdf', contentType: 'application/pdf' };
  if (!file.type.startsWith('image/')) throw new Error(`「${file.name}」不是圖片或 PDF。`);

  let img;
  try {
    img = await loadImageFromFile(file);
  } catch (e) {
    // 瀏覽器無法解碼（例如部分 HEIC 格式）→ 直接上傳原檔
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    return { blob: file, ext, contentType: file.type || 'application/octet-stream' };
  }

  const blob = await scaleImageToJpeg(img, RECEIPT_MAX_SIDE, 0.82);
  if (!blob) return { blob: file, ext: 'jpg', contentType: file.type };
  const thumb = await scaleImageToJpeg(img, RECEIPT_THUMB_SIDE, 0.7);
  return { blob, thumb, ext: 'jpg', contentType: 'image/jpeg' };
}

// 上傳一批檔案到某筆記帳底下，並寫入 expenses/{id}/receipts/{rid}
async function uploadOneReceipt(expId, file) {
  const pid = window.activeProjectId;
  {
    const prepared = await prepareReceiptFile(file);
    const rid = genReceiptId();
    const path = `receipts/${pid}/${expId}/${rid}.${prepared.ext}`;
    const fileRef = window.sRef(window.storage, path);
    await window.uploadBytes(fileRef, prepared.blob, { contentType: prepared.contentType });
    const url = await window.getDownloadURL(fileRef);

    const rec = { url, path, name: file.name, type: prepared.contentType, at: Date.now() };

    // 縮圖：列表用，體積小，可大幅減少下載流量
    if (prepared.thumb) {
      const tPath = `receipts/${pid}/${expId}/${rid}_thumb.jpg`;
      const tRef = window.sRef(window.storage, tPath);
      await window.uploadBytes(tRef, prepared.thumb, { contentType: 'image/jpeg' });
      rec.thumbUrl = await window.getDownloadURL(tRef);
      rec.thumbPath = tPath;
    }
    await window.dbSet(window.dbRef(window.db, `projects/${pid}/expenses/${expId}/receipts/${rid}`), rec);

    // 同步本機資料，畫面馬上能看到
    const exp = window.activeProjectData && window.activeProjectData.expenses && window.activeProjectData.expenses[expId];
    if (exp) {
      if (!exp.receipts) exp.receipts = {};
      exp.receipts[rid] = rec;
    }
  }
}

// 一次上傳多個檔案：每個檔案獨立處理，一個失敗不會影響其他檔案，最後回報結果
async function uploadReceipts(expId, files) {
  if (!receiptStorageReady()) throw new Error('發票上傳功能尚未設定（Firebase Storage）。');
  const failed = [];
  let okCount = 0;
  for (const file of files) {
    try {
      await uploadOneReceipt(expId, file);
      okCount++;
    } catch (err) {
      console.error('發票上傳失敗：', file.name, err);
      failed.push(`${file.name}：${err && err.message ? err.message : err}`);
    }
  }
  if (failed.length) {
    throw new Error(`已上傳 ${okCount} 個，以下檔案未成功：\n` + failed.join('\n'));
  }
}

function receiptsOf(exp) {
  return Object.entries((exp && exp.receipts) || {})
    .filter(([, r]) => r && r.url)
    .sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
}

function isImageReceipt(r) {
  return !!(r && r.type && r.type.startsWith('image/'));
}

// 刪除某張發票的原圖與縮圖（失敗不影響其他流程）
async function deleteReceiptFiles(rec) {
  if (!rec || !receiptStorageReady()) return;
  for (const p of [rec.path, rec.thumbPath]) {
    if (!p) continue;
    try { await window.deleteObject(window.sRef(window.storage, p)); } catch (e) {}
  }
}

// ===== 記帳新增 =====

window.saveExpense = function(e) {
  e.preventDefault();
  if (!window.activeProjectId) return alert('請先選擇專案！');
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限（僅團員、團主或管理員可記帳）。');

  const day = document.getElementById('expDay').value;
  const item = document.getElementById('expItem').value.trim();
  const amount = parseFloat(document.getElementById('expAmount').value);
  const currency = document.getElementById('expCurrency').value;
  const payer = document.getElementById('expPayer').value;

  const pBoxes = document.querySelectorAll('input[name="expParticipants"]:checked');
  const participants = Array.from(pBoxes).map(cb => cb.value);

  if (!item || isNaN(amount)) return alert('請填寫品名與有效金額！');
  if (participants.length === 0) return alert('請至少選擇一位分帳成員！');

  const fileInput = document.getElementById('expReceiptInput');
  const files = fileInput ? Array.from(fileInput.files || []) : [];

  const newExp = {
    day, item, amount, currency, payer, participants, timestamp: Date.now()
  };

  if (window.dbPush && window.dbRef && window.db) {
    const expensesRef = window.dbRef(window.db, `projects/${window.activeProjectId}/expenses`);
    window.dbPush(expensesRef, newExp).then(async (newRef) => {
      document.getElementById('expItem').value = '';
      document.getElementById('expAmount').value = '';
      if (fileInput) fileInput.value = '';

      if (files.length) {
        try {
          await uploadReceipts(newRef.key, files);
        } catch (err) {
          alert('記帳已新增，但發票上傳失敗：' + err.message);
        }
      }
      window.renderExpenses();
      window.renderSettlement();
    });
  }
};

// ===== 記帳列表（依天分組；每天可展開／收合，狀態會保留）=====

window._expProjId = null;
window._expOpen = null;

function expOpenMap() {
  if (window._expProjId !== window.activeProjectId || !window._expOpen) {
    window._expProjId = window.activeProjectId;
    window._expOpen = {};
  }
  return window._expOpen;
}

window.toggleExpDay = function(headerEl) {
  const card = headerEl.parentElement;
  card.classList.toggle('open');
  expOpenMap()[card.dataset.day] = card.classList.contains('open');
};

// 全部展開 / 全部收合所有天數
window.setAllExpDays = function(open) {
  if (!window.activeProjectData) return;
  const daysList = window.getDynamicProjectDays(window.activeProjectData);
  const map = expOpenMap();
  daysList.forEach(d => { map[d] = !!open; });
  window.renderExpenses();
};

// 同一天內的排序：有 order 的依 order；沒有的依建立時間放在後面
function sortedExpenseIds(dayKey) {
  const all = (window.activeProjectData && window.activeProjectData.expenses) || {};
  return Object.entries(all)
    .filter(([, d]) => d && d.day === dayKey)
    .sort(([, a], [, b]) => {
      const oa = typeof a.order === 'number' ? a.order : Infinity;
      const ob = typeof b.order === 'number' ? b.order : Infinity;
      if (oa !== ob) return oa - ob;
      return (a.timestamp || 0) - (b.timestamp || 0);
    })
    .map(([id]) => id);
}

function expenseItemHTML(id, data, canEdit) {
  const payer = data.payer || '錢粘';
  const parts = Array.isArray(data.participants) ? data.participants.join(', ') : '全員';
  const recs = receiptsOf(data);
  const strip = recs.length ? `
    <div class="receipt-strip">
      ${recs.map(([, r]) => isImageReceipt(r)
        ? `<a href="${window.escapeHtml(r.url)}" target="_blank"><img class="receipt-thumb-sm" src="${window.escapeHtml(r.thumbUrl || r.url)}" alt="" loading="lazy"></a>`
        : `<a class="receipt-file-sm" href="${window.escapeHtml(r.url)}" target="_blank">📄 ${window.escapeHtml(r.name || '檔案')}</a>`
      ).join('')}
    </div>` : '';

  return `
    <div class="expense-item ${canEdit ? 'can-drag' : ''}">
      ${canEdit ? `<span class="drag-handle" title="按住上下拖曳：調整順序，或拖到其他天">⠿</span>` : ''}
      ${canEdit ? `
      <div class="expense-actions">
        <button class="btn-spot-edit" onclick="openEditExpenseModal('${id}')">✏️ 修改</button>
        <button class="btn-delete" onclick="deleteExpense('${id}')">🗑️ 刪除</button>
      </div>` : ''}
      <div class="expense-body">
        <div class="expense-info">
          <div class="expense-title">${window.escapeHtml(data.item)}</div>
          <div class="expense-meta">💳 付款：${window.escapeHtml(payer)} ｜ 👥 分帳：${window.escapeHtml(parts)}</div>
          ${strip}
        </div>
        <div class="expense-amount">${data.currency === 'JPY' ? '¥' : '$'}${data.amount} ${data.currency}</div>
      </div>
    </div>`;
}

window.renderExpenses = function() {
  const container = document.getElementById('expenseDayList');
  if (!container || !window.activeProjectData) return;

  // 訪客：不渲染任何金額明細
  if (!window.canViewExpenses(window.activeProjectData)) {
    container.innerHTML = expenseLockedHTML();
    const lockedTotal = document.getElementById('totalGroupExpense');
    if (lockedTotal) lockedTotal.innerText = '🔒';
    return;
  }

  const expenses = window.activeProjectData.expenses || {};
  const daysList = window.getDynamicProjectDays(window.activeProjectData);
  const canEdit = window.canEditContent(window.activeProjectData);
  const openMap = expOpenMap();

  let html = '';
  let totalGroupTWD = 0;

  daysList.forEach(day => {
    const ids = sortedExpenseIds(day);
    let dayTotalTWD = 0;
    ids.forEach(id => {
      const data = expenses[id];
      const twd = window.convertToTWD(data.amount || 0, data.currency || 'JPY');
      dayTotalTWD += twd;
      totalGroupTWD += twd;
    });

    const isOpen = openMap[day] !== undefined ? openMap[day] : ids.length > 0;

    html += `
      <div class="card ${isOpen ? 'open' : ''}" data-day="${day}">
        <div class="card-header" onclick="toggleExpDay(this)">
          <div>
            <div class="card-title">${day === 'D0' ? 'D0 預付/準備' : day + ' 明細'}</div>
            <div class="card-subtitle">當日小計：約 TWD $${Math.round(dayTotalTWD).toLocaleString()}</div>
          </div>
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke-width="2.5"><path d="M19 9l-7 7-7-7"/></svg>
        </div>
        <div class="card-content">
          ${ids.length > 0
            ? `<div class="expense-list" data-day="${day}">${ids.map(id => expenseItemHTML(id, expenses[id], canEdit)).join('')}</div>`
            : '<div class="no-items">本日無記帳紀錄</div>'}
        </div>
      </div>`;
  });

  container.innerHTML = html;
  const totalElem = document.getElementById('totalGroupExpense');
  if (totalElem) totalElem.innerText = `TWD $${Math.round(totalGroupTWD).toLocaleString()}`;
};

// ===== 記帳拖曳排序：移到其他天（會改變天數）或同一天內調整順序 =====

function moveExpenseTo(fromDay, from, toDay, to) {
  if (!window.canEditContent(window.activeProjectData)) return;
  const proj = window.activeProjectData;

  const srcIds = sortedExpenseIds(fromDay);
  const id = srcIds[from];
  if (!id || !proj.expenses || !proj.expenses[id]) return;

  // 目標天的順序（不含被拖的這筆），插入到指定位置
  const dstIds = sortedExpenseIds(toDay).filter(x => x !== id);
  const newDst = dstIds.slice(0, to).concat([id], dstIds.slice(to));

  const updates = {};
  newDst.forEach((eid, i) => { updates[`${eid}/order`] = i; });
  if (fromDay !== toDay) {
    updates[`${id}/day`] = toDay;
    srcIds.filter(x => x !== id).forEach((eid, i) => { updates[`${eid}/order`] = i; });
  }

  // 先套用到本機，畫面立即更新
  Object.entries(updates).forEach(([path, val]) => {
    const slash = path.indexOf('/');
    const eid = path.slice(0, slash);
    const field = path.slice(slash + 1);
    if (proj.expenses[eid]) proj.expenses[eid][field] = val;
  });
  expOpenMap()[toDay] = true;
  window.renderExpenses();

  if (window.dbUpdate && window.dbRef && window.db) {
    window.dbUpdate(window.dbRef(window.db, `projects/${window.activeProjectId}/expenses`), updates)
      .catch(err => alert('排序儲存失敗：' + err.message));
  }
}

if (window.DragSort) {
  window.DragSort.register({
    containerId: 'expenseDayList',
    itemSel: '.expense-item',
    listSel: '.expense-list',
    skipDay: null,
    countItems: (dayKey) => sortedExpenseIds(dayKey).length,
    canDrag: () => window.canEditContent(window.activeProjectData),
    onMove: (fromDay, from, toDay, to) => moveExpenseTo(fromDay, from, toDay, to)
  });
}

// ===== 記帳修改 =====

function renderEditReceipts(expId) {
  const box = document.getElementById('editExpReceipts');
  if (!box) return;
  const exp = window.activeProjectData && window.activeProjectData.expenses && window.activeProjectData.expenses[expId];
  const recs = receiptsOf(exp);
  box.innerHTML = recs.length ? recs.map(([rid, r]) => `
    <div class="receipt-row">
      ${isImageReceipt(r)
        ? `<a href="${window.escapeHtml(r.url)}" target="_blank"><img class="receipt-thumb" src="${window.escapeHtml(r.thumbUrl || r.url)}" alt="" loading="lazy"></a>`
        : '<span class="receipt-pdf">📄</span>'}
      <a href="${window.escapeHtml(r.url)}" target="_blank" class="receipt-name">${window.escapeHtml(r.name || '檔案')}</a>
      <button class="btn-delete" onclick="deleteReceipt('${expId}','${rid}')">🗑️</button>
    </div>`).join('')
    : '<div class="receipt-empty">尚未上傳發票／收據</div>';
}

window.addReceiptsToExpense = async function() {
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限。');
  const expId = document.getElementById('editExpId').value;
  const input = document.getElementById('editExpReceiptInput');
  const files = input ? Array.from(input.files || []) : [];
  if (!files.length) return;

  try {
    await uploadReceipts(expId, files);
  } catch (err) {
    alert('上傳失敗：' + err.message);
  }
  if (input) input.value = '';
  renderEditReceipts(expId);
  window.renderExpenses();
};

window.deleteReceipt = async function(expId, rid) {
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限。');
  if (!confirm('確定要刪除這張發票／收據嗎？')) return;

  const exp = window.activeProjectData.expenses && window.activeProjectData.expenses[expId];
  const rec = exp && exp.receipts ? exp.receipts[rid] : null;
  try {
    if (rec) await deleteReceiptFiles(rec);
    await window.dbRemove(window.dbRef(window.db, `projects/${window.activeProjectId}/expenses/${expId}/receipts/${rid}`));
    if (exp && exp.receipts) delete exp.receipts[rid];
    renderEditReceipts(expId);
    window.renderExpenses();
  } catch (err) {
    alert('刪除失敗：' + err.message);
  }
};

window.openEditExpenseModal = function(expId) {
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限。');
  const exp = window.activeProjectData.expenses[expId];
  if (!exp) return;

  document.getElementById('editExpId').value = expId;

  const daysList = window.getDynamicProjectDays(window.activeProjectData);
  const names = window.getAllSplitNames(window.activeProjectData);
  const splitNames = names.length ? names : ['錢粘'];

  document.getElementById('editExpDay').innerHTML = daysList.map(d => `<option value="${d}">${d}</option>`).join('');
  document.getElementById('editExpDay').value = exp.day || 'D1';

  document.getElementById('editExpItem').value = exp.item || '';
  document.getElementById('editExpAmount').value = exp.amount || '';

  const currencyCodes = window.getProjectCurrencies(window.activeProjectData);
  // 保險：若此筆舊幣別不在清單中，也補進選項避免遺失
  const editCodes = currencyCodes.includes(exp.currency) || !exp.currency ? currencyCodes.slice() : [exp.currency, ...currencyCodes];
  document.getElementById('editExpCurrency').innerHTML = editCodes.map(c => {
    const info = window.CURRENCY_INFO[c] || { name: c, symbol: '' };
    return `<option value="${c}">${info.symbol || ''} ${c} - ${info.name || ''}</option>`;
  }).join('');
  document.getElementById('editExpCurrency').value = exp.currency || editCodes[0] || 'JPY';

  document.getElementById('editExpPayer').innerHTML = splitNames.map(m => `<option value="${window.escapeHtml(m)}">${window.escapeHtml(m)}</option>`).join('');
  document.getElementById('editExpPayer').value = exp.payer || splitNames[0];

  const currentParts = Array.isArray(exp.participants) ? exp.participants : splitNames;
  document.getElementById('editExpParticipantsBox').innerHTML = splitNames.map(m => `
    <label class="checkbox-label">
      <input type="checkbox" name="editExpParticipants" value="${window.escapeHtml(m)}" ${currentParts.includes(m) ? 'checked' : ''}> ${window.escapeHtml(m)}
    </label>
  `).join('');

  renderEditReceipts(expId);

  const modal = document.getElementById('editExpenseModal');
  if (modal) modal.style.display = 'flex';
};

window.closeEditExpenseModal = function() {
  const modal = document.getElementById('editExpenseModal');
  if (modal) modal.style.display = 'none';
};

window.submitUpdateExpense = function() {
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限。');
  const expId = document.getElementById('editExpId').value;
  const day = document.getElementById('editExpDay').value;
  const item = document.getElementById('editExpItem').value.trim();
  const amount = parseFloat(document.getElementById('editExpAmount').value);
  const currency = document.getElementById('editExpCurrency').value;
  const payer = document.getElementById('editExpPayer').value;

  const pBoxes = document.querySelectorAll('input[name="editExpParticipants"]:checked');
  const participants = Array.from(pBoxes).map(cb => cb.value);

  if (!item || isNaN(amount)) return alert('請填寫品名與有效金額！');
  if (participants.length === 0) return alert('請至少選擇一位分帳成員！');

  // 保留排序與發票（整筆覆寫時不能把這些資料清掉）
  const prev = (window.activeProjectData.expenses && window.activeProjectData.expenses[expId]) || {};
  const updatedExp = {
    day, item, amount, currency, payer, participants, timestamp: Date.now()
  };
  if (typeof prev.order === 'number') updatedExp.order = prev.order;
  if (prev.receipts) updatedExp.receipts = prev.receipts;

  if (window.dbSet && window.dbRef && window.db) {
    const targetRef = window.dbRef(window.db, `projects/${window.activeProjectId}/expenses/${expId}`);
    window.dbSet(targetRef, updatedExp).then(() => {
      window.closeEditExpenseModal();
      window.renderExpenses();
      window.renderSettlement();
    });
  }
};

window.deleteExpense = async function(expId) {
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限。');
  if (!confirm('確定要刪除這筆記帳嗎？')) return;

  // 一併刪除附加的發票檔案（失敗不影響刪除記帳本身）
  const exp = window.activeProjectData.expenses && window.activeProjectData.expenses[expId];
  if (exp && exp.receipts) {
    for (const rec of Object.values(exp.receipts)) await deleteReceiptFiles(rec);
  }

  if (window.dbRemove && window.dbRef && window.db) {
    const targetRef = window.dbRef(window.db, `projects/${window.activeProjectId}/expenses/${expId}`);
    window.dbRemove(targetRef).then(() => {
      window.renderExpenses();
      window.renderSettlement();
    });
  }
};

// ===== 結算 =====

window.renderSettlement = function() {
  const container = document.getElementById('settlementDetails');
  if (!container || !window.activeProjectData) return;

  // 訪客：不渲染任何收支與轉帳資訊
  if (!window.canViewExpenses(window.activeProjectData)) {
    container.innerHTML = expenseLockedHTML();
    return;
  }

  const expenses = window.activeProjectData.expenses || {};
  const members = window.getAllSplitNames(window.activeProjectData);
  const people = members.length ? members : ['錢粘'];

  const paidMap = {};
  const shouldPayMap = {};
  people.forEach(m => { paidMap[m] = 0; shouldPayMap[m] = 0; });

  Object.values(expenses).forEach(exp => {
    const twd = window.convertToTWD(exp.amount || 0, exp.currency || 'JPY');
    const payer = exp.payer || people[0];
    const parts = Array.isArray(exp.participants) && exp.participants.length > 0 ? exp.participants : people;

    if (paidMap[payer] !== undefined) paidMap[payer] += twd;

    const perPerson = twd / parts.length;
    parts.forEach(p => {
      if (shouldPayMap[p] !== undefined) shouldPayMap[p] += perPerson;
    });
  });

  const netMap = {};
  people.forEach(m => {
    netMap[m] = paidMap[m] - shouldPayMap[m];
  });

  const rateNote = window.ratesUpdatedAt
    ? `<div style="font-size:11px; color:var(--sub-text); text-align:center; margin:4px 0 10px;">💱 即時匯率（更新於 ${new Date(window.ratesUpdatedAt).toLocaleString('zh-TW')}）</div>`
    : `<div style="font-size:11px; color:var(--sub-text); text-align:center; margin:4px 0 10px;">💱 使用內建備援匯率</div>`;

  let html = `<div style="font-size:11px; color:var(--sub-text); text-align:center; margin-bottom:4px;">🔒 本頁為結算總覽（唯讀），僅可勾選轉帳完成狀態</div>` + rateNote + `
    <div class="card open" style="margin-top:4px;">
      <div class="card-header"><div class="card-title">📊 成員收支總覽 (TWD)</div></div>
      <div class="card-content">
        ${people.map(m => {
          const net = Math.round(netMap[m]);
          const isGain = net >= 0;
          return `
            <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--brand-border);">
              <div><strong>${window.escapeHtml(m)}</strong>（已付 $${Math.round(paidMap[m]).toLocaleString()} / 應付 $${Math.round(shouldPayMap[m]).toLocaleString()}）</div>
              <div style="font-weight:800; color:${isGain ? 'var(--brand-main)' : 'var(--danger)'};">
                ${isGain ? `應收 +$${net.toLocaleString()}` : `應付 -$${Math.abs(net).toLocaleString()}`}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  const debtors = [];
  const creditors = [];

  people.forEach(m => {
    const net = Math.round(netMap[m]);
    if (net < -1) debtors.push({ name: m, amount: Math.abs(net) });
    else if (net > 1) creditors.push({ name: m, amount: net });
  });

  const transfers = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    transfers.push({ from: debtors[i].name, to: creditors[j].name, amount: Math.round(pay) });
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount <= 1) i++;
    if (creditors[j].amount <= 1) j++;
  }

  const settlements = window.activeProjectData.settlements || {};
  const canToggle = window.canEditContent(window.activeProjectData);
  window._transferMap = {};

  const transferHtml = transfers.length > 0 ? transfers.map(t => {
    const key = settlementTransferKey(t.from, t.to);
    window._transferMap[key] = { from: t.from, to: t.to, amount: t.amount };
    const rec = settlements[key];
    const done = !!(rec && rec.done);
    const atStr = (done && rec.at) ? new Date(rec.at).toLocaleString('zh-TW') : '';
    return `
      <div class="transfer-row${done ? ' done' : ''}">
        <input type="checkbox" class="transfer-check" ${done ? 'checked' : ''} ${canToggle ? '' : 'disabled'} onchange="toggleTransferDone('${key}')">
        <div class="transfer-main">
          <div class="transfer-line">💳 <strong>${window.escapeHtml(t.from)}</strong> → <strong>${window.escapeHtml(t.to)}</strong>　NT$ ${t.amount.toLocaleString()}</div>
          ${done ? `<div class="transfer-done-at">✅ 已轉帳 · ${atStr}</div>` : ''}
        </div>
      </div>`;
  }).join('') : '<div style="font-size:13px; color:var(--sub-text);">已結清，無須轉帳！</div>';

  html += `
    <div class="card open">
      <div class="card-header"><div class="card-title">💡 建議轉帳方案</div></div>
      <div class="card-content">
        ${transferHtml}
        ${transfers.length > 0 ? `<div style="font-size:11px; color:var(--sub-text); margin-top:10px;">完成轉帳後勾選左側方塊，會記錄打勾時間。${canToggle ? '' : '（僅團員以上可勾選）'}</div>` : ''}
      </div>
    </div>
  `;

  container.innerHTML = html;
};

function settlementTransferKey(from, to) {
  const s = x => String(x).replace(/[.#$\[\]\/\s]/g, '_');
  return s(from) + '__' + s(to);
}

// 勾選/取消「已轉帳」，寫入 Firebase 並記錄時間
window.toggleTransferDone = function(key) {
  if (!window.canEditContent(window.activeProjectData)) return;
  const info = window._transferMap ? window._transferMap[key] : null;
  if (!info) return;
  if (!window.activeProjectData.settlements) window.activeProjectData.settlements = {};

  const ref = window.dbRef(window.db, `projects/${window.activeProjectId}/settlements/${key}`);
  const cur = window.activeProjectData.settlements[key];

  if (cur && cur.done) {
    window.dbRemove(ref)
      .then(() => { delete window.activeProjectData.settlements[key]; window.renderSettlement(); })
      .catch(err => alert('更新失敗：' + err.message));
  } else {
    const rec = { from: info.from, to: info.to, amount: info.amount, done: true, at: Date.now() };
    window.dbSet(ref, rec)
      .then(() => { window.activeProjectData.settlements[key] = rec; window.renderSettlement(); })
      .catch(err => alert('更新失敗：' + err.message));
  }
};
