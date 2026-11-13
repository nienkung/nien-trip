// 團員管理彈窗：所有人可看名單；團員可改自己暱稱；團主/管理員可完整編輯

window.openMembersModal = function() {
  if (!window.activeProjectData) return alert('請先進入專案！');
  window.renderMembersModal();
  const modal = document.getElementById('membersModal');
  if (modal) modal.style.display = 'flex';
};

window.closeMembersModal = function() {
  const modal = document.getElementById('membersModal');
  if (modal) modal.style.display = 'none';
};

// 複製專案專屬邀請連結（線下分享給想邀請的人）
window.copyInviteLink = async function() {
  if (!window.activeProjectId) return alert('請先進入專案！');
  const url = `${window.location.origin}/?invite=${window.activeProjectId}`;
  const msg = '✅ 邀請連結已複製！貼給想邀請的人，對方用帳號登入（尚未有帳號請先註冊）即可加入本專案成為團員。';
  try {
    await navigator.clipboard.writeText(url);
    alert(msg);
  } catch (e) {
    // 某些瀏覽器不支援 clipboard API，退回手動複製
    window.prompt('複製下方邀請連結貼給對方：', url);
  }
};

function roleBadgeFor(proj, member) {
  // 團主：ownerEmail 或 ownerName 相符
  const isOwner = (proj.ownerEmail && member.email && proj.ownerEmail.toLowerCase() === member.email.toLowerCase())
    || (proj.ownerName && member.name === proj.ownerName);
  if (isOwner) return `<span class="role-badge role-owner">👑 團主</span>`;
  if (member.email) return `<span class="role-badge role-member">👥 團員</span>`;
  return `<span class="role-badge role-viewer">✉️ 未綁定</span>`;
}

window.renderMembersModal = function() {
  const proj = window.activeProjectData;
  const body = document.getElementById('membersModalBody');
  if (!proj || !body) return;

  const canManage = window.canManageMembers(proj);
  const members = window.getMembers(proj);
  const externals = window.getExternalPeople(proj);
  const myEmail = (window.currentUser && window.currentUser.email || '').toLowerCase();

  let html = '';

  // ---- 邀請連結（團員以上可複製）----
  if (window.canEditContent(proj)) {
    html += `<button class="mem-add-btn" style="margin-bottom:14px; background:var(--brand-main); color:#fff; border:none;" onclick="copyInviteLink()">🔗 複製專案邀請連結</button>`;
  }

  // ---- 團員名單 ----
  html += `<div class="mem-section-label">👥 團員（可登入協作）</div>`;

  if (canManage) {
    // 管理者：可編輯每一列
    html += `<div id="memberEditList">`;
    members.forEach((m, i) => {
      html += memberEditRow(i, m);
    });
    html += `</div>`;
    html += `<button class="mem-add-btn" onclick="addMemberRow()">➕ 新增團員</button>`;
  } else {
    // 一般團員 / 訪客：唯讀，但自己那列的暱稱可改
    members.forEach(m => {
      const isMe = m.email && m.email.toLowerCase() === myEmail;
      html += `
        <div class="mem-row">
          <div class="mem-row-main">
            ${isMe
              ? `<input type="text" class="form-control mem-self-input" id="memSelfName" value="${window.escapeHtml(m.name)}" placeholder="你的暱稱">`
              : `<span class="mem-name">${window.escapeHtml(m.name)}</span>`}
            <div class="mem-email">${m.email ? window.escapeHtml(m.email) : '—'}</div>
          </div>
          <div class="mem-row-side">${roleBadgeFor(proj, m)}${isMe ? '<span class="mem-you">你</span>' : ''}</div>
        </div>`;
    });
    // 自己是團員 → 顯示儲存暱稱按鈕
    const iAmMember = members.some(m => m.email && m.email.toLowerCase() === myEmail);
    if (iAmMember) {
      html += `<button class="mem-add-btn" onclick="saveMyNickname()">💾 儲存我的暱稱</button>`;
    }
  }

  // ---- 外部分帳人 ----
  html += `<div class="mem-section-label" style="margin-top:18px;">🧾 外部分帳人（只參與分帳、不能登入）</div>`;
  if (canManage) {
    html += `<div id="externalEditList">`;
    externals.forEach((name, i) => {
      html += externalEditRow(i, name);
    });
    html += `</div>`;
    html += `<button class="mem-add-btn" onclick="addExternalRow()">➕ 新增外部分帳人</button>`;
  } else {
    if (externals.length) {
      externals.forEach(name => {
        html += `<div class="mem-row"><div class="mem-row-main"><span class="mem-name">${window.escapeHtml(name)}</span></div><div class="mem-row-side"><span class="role-badge role-viewer">🧾 外部</span></div></div>`;
      });
    } else {
      html += `<div class="mem-empty">目前沒有外部分帳人</div>`;
    }
  }

  if (canManage) {
    html += `<button class="btn-submit" style="margin-top:18px;" onclick="saveMembers()">儲存團員設定</button>`;
  }

  body.innerHTML = html;
};

function memberEditRow(i, m) {
  return `
    <div class="mem-edit-row" data-idx="${i}">
      <input type="text" class="form-control mem-in-name" value="${window.escapeHtml(m.name)}" placeholder="暱稱">
      <input type="email" class="form-control mem-in-email" value="${window.escapeHtml(m.email)}" placeholder="email（填了才能登入編輯）">
      <button class="mem-del-btn" onclick="this.closest('.mem-edit-row').remove()">🗑️</button>
    </div>`;
}

function externalEditRow(i, name) {
  return `
    <div class="ext-edit-row" data-idx="${i}">
      <input type="text" class="form-control ext-in-name" value="${window.escapeHtml(name)}" placeholder="外部分帳人暱稱">
      <button class="mem-del-btn" onclick="this.closest('.ext-edit-row').remove()">🗑️</button>
    </div>`;
}

window.addMemberRow = function() {
  const list = document.getElementById('memberEditList');
  if (!list) return;
  const div = document.createElement('div');
  div.innerHTML = memberEditRow(list.children.length, { name: '', email: '' });
  list.appendChild(div.firstElementChild);
};

window.addExternalRow = function() {
  const list = document.getElementById('externalEditList');
  if (!list) return;
  const div = document.createElement('div');
  div.innerHTML = externalEditRow(list.children.length, '');
  list.appendChild(div.firstElementChild);
};

// 一般團員：只改自己的暱稱
window.saveMyNickname = function() {
  const input = document.getElementById('memSelfName');
  if (!input) return;
  const newName = input.value.trim();
  if (!newName) return alert('暱稱不能空白！');

  const proj = window.activeProjectData;
  const myEmail = (window.currentUser && window.currentUser.email || '').toLowerCase();
  const members = window.getMembers(proj);
  const idx = members.findIndex(m => m.email && m.email.toLowerCase() === myEmail);
  if (idx < 0) return alert('找不到你的團員身份。');

  members[idx].name = newName;
  if (window.dbUpdate && window.dbRef && window.db) {
    window.dbUpdate(window.dbRef(window.db, `projects/${window.activeProjectId}`), { members })
      .then(() => {
        window.activeProjectData.members = members;
        alert('✅ 暱稱已更新！');
        window.closeMembersModal();
        if (window.updateExpenseFormOptions) window.updateExpenseFormOptions();
        if (window.renderExpenses) window.renderExpenses();
        if (window.renderSettlement) window.renderSettlement();
      })
      .catch(err => alert('更新失敗：' + err.message));
  }
};

// 團主 / 管理員：整批儲存團員與外部分帳人
window.saveMembers = function() {
  const proj = window.activeProjectData;
  if (!window.canManageMembers(proj)) return alert('你沒有權限管理團員。');

  const members = [];
  document.querySelectorAll('#memberEditList .mem-edit-row').forEach(row => {
    const name = row.querySelector('.mem-in-name').value.trim();
    const email = row.querySelector('.mem-in-email').value.trim();
    if (name) members.push({ name, email });
  });

  const externalPeople = [];
  document.querySelectorAll('#externalEditList .ext-edit-row').forEach(row => {
    const name = row.querySelector('.ext-in-name').value.trim();
    if (name) externalPeople.push(name);
  });

  if (members.length === 0) return alert('至少要保留一位團員！');

  // 檢查 email 格式（有填才檢查）
  const badEmail = members.find(m => m.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email));
  if (badEmail) return alert(`email 格式有誤：${badEmail.email}`);

  const updates = { members, externalPeople };

  // 若團主自己沒綁 ownerEmail，順手補上
  if (!proj.ownerEmail && window.isProjectOwner(proj) && window.currentUser && window.currentUser.email) {
    updates.ownerEmail = window.currentUser.email;
  }

  if (window.dbUpdate && window.dbRef && window.db) {
    window.dbUpdate(window.dbRef(window.db, `projects/${window.activeProjectId}`), updates)
      .then(() => {
        window.activeProjectData.members = members;
        window.activeProjectData.externalPeople = externalPeople;
        if (updates.ownerEmail) window.activeProjectData.ownerEmail = updates.ownerEmail;
        alert('✅ 團員設定已儲存！');
        window.closeMembersModal();
        // 連動刷新記帳表單（分帳勾選、付款人）與結算
        if (window.updateExpenseFormOptions) window.updateExpenseFormOptions();
        if (window.renderExpenses) window.renderExpenses();
        if (window.renderSettlement) window.renderSettlement();
      })
      .catch(err => alert('儲存失敗：' + err.message));
  }
};
