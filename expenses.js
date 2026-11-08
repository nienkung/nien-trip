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

  const newExp = {
    day, item, amount, currency, payer, participants, timestamp: Date.now()
  };

  if (window.dbPush && window.dbRef && window.db) {
    const expensesRef = window.dbRef(window.db, `projects/${window.activeProjectId}/expenses`);
    window.dbPush(expensesRef, newExp).then(() => {
      document.getElementById('expItem').value = '';
      document.getElementById('expAmount').value = '';
      window.renderExpenses();
      window.renderSettlement();
    });
  }
};

window.renderExpenses = function() {
  const container = document.getElementById('expenseDayList');
  if (!container || !window.activeProjectData) return;

  const expenses = window.activeProjectData.expenses || {};
  const daysList = window.getDynamicProjectDays(window.activeProjectData);
  const canEdit = window.canEditContent(window.activeProjectData);

  let html = '';
  let totalGroupTWD = 0;

  daysList.forEach(day => {
    const items = Object.entries(expenses).filter(([id, data]) => data.day === day);
    let dayTotalTWD = 0;

    items.forEach(([id, data]) => {
      const twd = window.convertToTWD(data.amount || 0, data.currency || 'JPY');
      dayTotalTWD += twd;
      totalGroupTWD += twd;
    });

    html += `
      <div class="card ${items.length > 0 ? 'open' : ''}">
        <div class="card-header" onclick="this.parentElement.classList.toggle('open')">
          <div>
            <div class="card-title">${day === 'D0' ? 'D0 預付/準備' : day + ' 明細'}</div>
            <div class="card-subtitle">當日小計：約 TWD $${Math.round(dayTotalTWD).toLocaleString()}</div>
          </div>
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke-width="2.5"><path d="M19 9l-7 7-7-7"/></svg>
        </div>
        <div class="card-content">
          ${items.length > 0 ? items.map(([id, data]) => {
            const payer = data.payer || '錢粘';
            const parts = Array.isArray(data.participants) ? data.participants.join(', ') : '全員';
            return `
              <div class="expense-item">
                <div class="expense-info">
                  <div class="expense-title">${window.escapeHtml(data.item)}</div>
                  <div class="expense-meta">💳 付款：${window.escapeHtml(payer)} ｜ 👥 分帳：${window.escapeHtml(parts)}</div>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                  <div class="expense-amount">${data.currency === 'JPY' ? '¥' : '$'}${data.amount} ${data.currency}</div>
                  ${canEdit ? `
                    <button class="btn-spot-edit" onclick="openEditExpenseModal('${id}')">✏️</button>
                    <button class="btn-delete" onclick="deleteExpense('${id}')">🗑️</button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('') : '<div style="font-size:13px; color:var(--sub-text); text-align:center; padding:8px;">本日無記帳紀錄</div>'}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  const totalElem = document.getElementById('totalGroupExpense');
  if (totalElem) totalElem.innerText = `TWD $${Math.round(totalGroupTWD).toLocaleString()}`;
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

  const updatedExp = {
    day, item, amount, currency, payer, participants, timestamp: Date.now()
  };

  if (window.dbSet && window.dbRef && window.db) {
    const targetRef = window.dbRef(window.db, `projects/${window.activeProjectId}/expenses/${expId}`);
    window.dbSet(targetRef, updatedExp).then(() => {
      window.closeEditExpenseModal();
      window.renderExpenses();
      window.renderSettlement();
    });
  }
};

window.deleteExpense = function(expId) {
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限。');
  if (!confirm('確定要刪除這筆記帳嗎？')) return;
  if (window.dbRemove && window.dbRef && window.db) {
    const targetRef = window.dbRef(window.db, `projects/${window.activeProjectId}/expenses/${expId}`);
    window.dbRemove(targetRef).then(() => {
      window.renderExpenses();
      window.renderSettlement();
    });
  }
};

window.renderSettlement = function() {
  const container = document.getElementById('settlementDetails');
  if (!container || !window.activeProjectData) return;

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

  let html = rateNote + `
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
    transfers.push(`💳 <strong>${window.escapeHtml(debtors[i].name)}</strong> 應轉給 <strong>${window.escapeHtml(creditors[j].name)}</strong> <strong>NT$ ${Math.round(pay).toLocaleString()}</strong>`);

    debtors[i].amount -= pay;
    creditors[j].amount -= pay;

    if (debtors[i].amount <= 1) i++;
    if (creditors[j].amount <= 1) j++;
  }

  html += `
    <div class="card open">
      <div class="card-header"><div class="card-title">💡 建議轉帳方案</div></div>
      <div class="card-content">
        ${transfers.length > 0 ? transfers.map(t => `<div style="padding:8px 0; font-size:14px;">${t}</div>`).join('') : '<div style="font-size:13px; color:var(--sub-text);">已結清，無須轉帳！</div>'}
      </div>
    </div>
  `;

  container.innerHTML = html;
};
