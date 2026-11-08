// 更新新增與修改記帳表單中的選項 (天數、幣別、付款人、分帳成員)
window.updateExpenseFormOptions = function() {
  if (!window.activeProjectData) return;
  const proj = window.activeProjectData;
  const daysList = window.getDynamicProjectDays(proj);
  const members = Array.isArray(proj.members) ? proj.members : ['錢粘'];

  // 1. 天數選單
  const expDaySelect = document.getElementById('expDay');
  if (expDaySelect) {
    expDaySelect.innerHTML = daysList.map(day => `
      <option value="${day}">${day === 'D0' ? 'D0 (預付/準備)' : 'Day ' + day.replace('D', '')}</option>
    `).join('');
  }

  // 2. 幣別選單
  const currencies = [
    { code: 'JPY', name: '💴 JPY - 日圓' },
    { code: 'TWD', name: 'NT$ TWD - 新台幣' },
    { code: 'USD', name: '💵 USD - 美金' },
    { code: 'EUR', name: '💶 EUR - 歐元' }
  ];
  const expCurrencySelect = document.getElementById('expCurrency');
  if (expCurrencySelect) {
    expCurrencySelect.innerHTML = currencies.map(c => `<option value="${c.code}">${c.name}</option>`).join('');
  }

  // 3. 付款人選單
  const expPayerSelect = document.getElementById('expPayer');
  if (expPayerSelect) {
    expPayerSelect.innerHTML = members.map(m => `<option value="${m}">${m}</option>`).join('');
    if (window.currentUser && members.includes(window.currentUser.name)) {
      expPayerSelect.value = window.currentUser.name;
    }
  }

  // 4. 參與分帳成員勾選框 (預設全選)
  const box = document.getElementById('expParticipantsBox');
  if (box) {
    box.innerHTML = members.map(m => `
      <label class="checkbox-label">
        <input type="checkbox" name="expParticipants" value="${m}" checked> ${m}
      </label>
    `).join('');
  }
};

// 儲存新增記帳
window.saveExpense = function(e) {
  e.preventDefault();
  if (!window.activeProjectId) return alert('請先選擇專案！');

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

// 渲染記帳列表 (含編輯與刪除按鈕)
window.renderExpenses = function() {
  const container = document.getElementById('expenseDayList');
  if (!container || !window.activeProjectData) return;

  const expenses = window.activeProjectData.expenses || {};
  const daysList = window.getDynamicProjectDays(window.activeProjectData);

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
                  <div class="expense-title">${data.item}</div>
                  <div class="expense-meta">💳 付款：${payer} ｜ 👥 分帳：${parts}</div>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                  <div class="expense-amount">${data.currency === 'JPY' ? '¥' : '$'}${data.amount} ${data.currency}</div>
                  <button class="btn-spot-edit" onclick="openEditExpenseModal('${id}')">✏️</button>
                  <button class="btn-delete" onclick="deleteExpense('${id}')">🗑️</button>
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

// 打開編輯記帳 Modal
window.openEditExpenseModal = function(expId) {
  const exp = window.activeProjectData.expenses[expId];
  if (!exp) return;

  document.getElementById('editExpId').value = expId;

  const daysList = window.getDynamicProjectDays(window.activeProjectData);
  const members = Array.isArray(window.activeProjectData.members) ? window.activeProjectData.members : ['錢粘'];

  document.getElementById('editExpDay').innerHTML = daysList.map(d => `<option value="${d}">${d}</option>`).join('');
  document.getElementById('editExpDay').value = exp.day || 'D1';

  document.getElementById('editExpItem').value = exp.item || '';
  document.getElementById('editExpAmount').value = exp.amount || '';

  const currencies = ['JPY', 'TWD', 'USD', 'EUR'];
  document.getElementById('editExpCurrency').innerHTML = currencies.map(c => `<option value="${c}">${c}</option>`).join('');
  document.getElementById('editExpCurrency').value = exp.currency || 'JPY';

  document.getElementById('editExpPayer').innerHTML = members.map(m => `<option value="${m}">${m}</option>`).join('');
  document.getElementById('editExpPayer').value = exp.payer || members[0];

  const currentParts = Array.isArray(exp.participants) ? exp.participants : members;
  document.getElementById('editExpParticipantsBox').innerHTML = members.map(m => `
    <label class="checkbox-label">
      <input type="checkbox" name="editExpParticipants" value="${m}" ${currentParts.includes(m) ? 'checked' : ''}> ${m}
    </label>
  `).join('');

  const modal = document.getElementById('editExpenseModal');
  if (modal) modal.style.display = 'flex';
};

window.closeEditExpenseModal = function() {
  const modal = document.getElementById('editExpenseModal');
  if (modal) modal.style.display = 'none';
};

// 提交編輯記帳
window.submitUpdateExpense = function() {
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

// 刪除記帳項目
window.deleteExpense = function(expId) {
  if (!confirm('確定要刪除這筆記帳嗎？')) return;
  if (window.dbRemove && window.dbRef && window.db) {
    const targetRef = window.dbRef(window.db, `projects/${window.activeProjectId}/expenses/${expId}`);
    window.dbRemove(targetRef).then(() => {
      window.renderExpenses();
      window.renderSettlement();
    });
  }
};

// ⚖️ 智慧拆帳計算與渲染
window.renderSettlement = function() {
  const container = document.getElementById('settlementDetails');
  if (!container || !window.activeProjectData) return;

  const expenses = window.activeProjectData.expenses || {};
  const members = Array.isArray(window.activeProjectData.members) ? window.activeProjectData.members : ['錢粘'];

  const paidMap = {};
  const shouldPayMap = {};
  members.forEach(m => { paidMap[m] = 0; shouldPayMap[m] = 0; });

  Object.values(expenses).forEach(exp => {
    const twd = window.convertToTWD(exp.amount || 0, exp.currency || 'JPY');
    const payer = exp.payer || members[0];
    const parts = Array.isArray(exp.participants) && exp.participants.length > 0 ? exp.participants : members;

    if (paidMap[payer] !== undefined) paidMap[payer] += twd;

    const perPerson = twd / parts.length;
    parts.forEach(p => {
      if (shouldPayMap[p] !== undefined) shouldPayMap[p] += perPerson;
    });
  });

  const netMap = {};
  members.forEach(m => {
    netMap[m] = paidMap[m] - shouldPayMap[m];
  });

  let html = `
    <div class="card open" style="margin-top:14px;">
      <div class="card-header"><div class="card-title">📊 成員收支總覽 (TWD)</div></div>
      <div class="card-content">
        ${members.map(m => {
          const net = Math.round(netMap[m]);
          const isGain = net >= 0;
          return `
            <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--brand-border);">
              <div><strong>${m}</strong>（已付 $${Math.round(paidMap[m]).toLocaleString()} / 應付 $${Math.round(shouldPayMap[m]).toLocaleString()}）</div>
              <div style="font-weight:800; color:${isGain ? 'var(--brand-main)' : 'var(--danger)'};">
                ${isGain ? `應收 +$${net.toLocaleString()}` : `應付 -$${Math.abs(net).toLocaleString()}`}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  // 最佳化找零結算建議
  const debtors = [];
  const creditors = [];

  members.forEach(m => {
    const net = Math.round(netMap[m]);
    if (net < -1) debtors.push({ name: m, amount: Math.abs(net) });
    else if (net > 1) creditors.push({ name: m, amount: net });
  });

  const transfers = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    transfers.push(`💳 <strong>${debtors[i].name}</strong> 應轉給 <strong>${creditors[j].name}</strong> <strong>NT$ ${Math.round(pay).toLocaleString()}</strong>`);

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
