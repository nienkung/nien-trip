// 團員管理彈窗（第二階段）：團員以 uid 辨識；名單不顯示 email
// 團主新增團員時只填暱稱（未綁定），對方透過邀請連結或申請加入後會自動認領同名的未綁定團員。
// 舊資料的 email 僅保留在資料中，供登入後自動綁定使用（第三階段再清除）。
// 團員管理現已內嵌於「專案設定」彈窗的「團員管理」分頁；以下開關函式導向該彈窗。

window.openMembersModal = function() {
  if (!window.activeProjectData) return alert('請先進入專案！');
  if (window.openProjectSettingsModal) {
    const canManage = window.canManageProject(window.activeProjectData);
    window.openProjectSettingsModal(window.activeProjectId, { showInfo: canManage, showMembers: true, initialTab: 'members' });
  }
};

window.closeMembersModal = function() {
  const modal = document.getElementById('editProjectModal');
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

function membersEsc(s) {
  return window.escapeHtml(s == null ? '' : s);
}

function roleBadgeFor(proj, m) {
  if (m.uid && proj.ownerUid && m.uid === proj.ownerUid) return `<span class="role-badge role-owner">👑 團主</span>`;
  if (m.uid) return `<span class="role-badge role-member">👥 團員</span>`;
  if (m.email) return `<span class="role-badge role-viewer">⏳ 待登入綁定</span>`;
  return `<span class="role-badge role-viewer">✉️ 未綁定</span>`;
}

window.renderMembersModal = function() {
  const proj = window.activeProjectData;
  const body = document.getElementById('membersModalBody');
  if (!proj || !body) return;

  const canManage = window.canManageMembers(proj);
  const members = window.getMembers(proj);
  const externals = window.getExternalPeople(proj);

  // 團主編輯時用來對照原始資料（避免把 email 放進 DOM）
  window._membersSnapshot = members;

  let html = '';

  // ---- 邀請連結（團員以上可複製）----
  if (window.canEditContent(proj)) {
    html += `<button class="mem-add-btn" style="margin-bottom:14px; background:var(--brand-main); color:#fff; border:none;" onclick="copyInviteLink()">🔗 複製專案邀請連結</button>`;
  }

  // ---- 團員名單 ----
  html += `<div class="mem-section-label">👥 團員（可登入協作）</div>`;

  if (canManage) {
    html += `<div id="memberEditList">`;
    members.forEach((m, i) => {
      html += memberEditRow(i, m);
    });
    html += `</div>`;
    html += `<button class="mem-add-btn" onclick="addMemberRow()">➕ 新增團員（只填暱稱，對方加入後會自動綁定）</button>`;
  } else {
    members.forEach(m => {
      const isMe = window.isMemberMe(m);
      html += `
        <div class="mem-row">
          <div class="mem-row-main">
            ${isMe
              ? `<input type="text" class="form-control mem-self-input" id="memSelfName" value="${membersEsc(m.name)}" placeholder="你的暱稱">`
              : `<span class="mem-name">${membersEsc(m.name)}</span>`}
          </div>
          <div class="mem-row-side">${roleBadgeFor(proj, m)}${isMe ? '<span class="mem-you">你</span>' : ''}</div>
        </div>`;
    });
    const iAmMember = members.some(m => window.isMemberMe(m));
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
        html += `<div class="mem-row"><div class="mem-row-main"><span class="mem-name">${membersEsc(name)}</span></div><div class="mem-row-side"><span class="role-badge role-viewer">🧾 外部</span></div></div>`;
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

// 團主編輯列：只顯示暱稱與綁定狀態；idx 為 null 代表新增列
function memberEditRow(idx, m) {
  const status = m.uid ? '✅ 已綁定' : (m.email ? '⏳ 待登入綁定' : '未綁定');
  const idxAttr = idx === null ? '' : ` data-idx="${idx}"`;
  return `
    <div class="mem-edit-row"${idxAttr}>
      <input type="text" class="form-control mem-in-name" value="${membersEsc(m ? m.name : '')}" placeholder="暱稱">
      <span class="mem-bind-status" style="font-size:11px; color:var(--sub-text); white-space:nowrap;">${status}</span>
      <button class="mem-del-btn" onclick="this.closest('.mem-edit-row').remove()">🗑️</button>
    </div>`;
}

function externalEditRow(i, name) {
  return `
    <div class="ext-edit-row" data-idx="${i}">
      <input type="text" class="form-control ext-in-name" value="${membersEsc(name)}" placeholder="外部分帳人暱稱">
      <button class="mem-del-btn" onclick="this.closest('.ext-edit-row').remove()">🗑️</button>
    </div>`;
}

window.addMemberRow = function() {
  const list = document.getElementById('memberEditList');
  if (!list) return;
  const div = document.createElement('div');
  div.innerHTML = memberEditRow(null, { name: '' });
  list.appendChild(div.firstElementChild);
};

window.addExternalRow = function() {
  const list = document.getElementById('externalEditList');
  if (!list) return;
  const div = document.createElement('div');
  div.innerHTML = externalEditRow(list.children.length, '');
  list.appendChild(div.firstElementChild);
};

// 一般團員：只改自己的暱稱（以 uid 找到自己）
window.saveMyNickname = function() {
  const input = document.getElementById('memSelfName');
  if (!input) return;
  const newName = input.value.trim();
  if (!newName) return alert('暱稱不能空白！');

  const proj = window.activeProjectData;
  const members = window.getMembers(proj);
  const idx = members.findIndex(m => window.isMemberMe(m));
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

// 團主 / 管理員：整批儲存團員與外部分帳人（uid 與舊 email 依原列對照保留）
window.saveMembers = function() {
  const proj = window.activeProjectData;
  if (!window.canManageMembers(proj)) return alert('你沒有權限管理團員。');

  const snap = window._membersSnapshot || [];
  const members = [];
  document.querySelectorAll('#memberEditList .mem-edit-row').forEach(row => {
    const name = row.querySelector('.mem-in-name').value.trim();
    if (!name) return;
    const idxAttr = row.getAttribute('data-idx');
    const orig = idxAttr !== null ? snap[Number(idxAttr)] : null;
    const m = { name: name };
    if (orig && orig.uid) m.uid = orig.uid;
    if (orig && orig.email) m.email = orig.email;
    members.push(m);
  });

  const externalPeople = [];
  document.querySelectorAll('#externalEditList .ext-edit-row').forEach(row => {
    const name = row.querySelector('.ext-in-name').value.trim();
    if (name) externalPeople.push(name);
  });

  if (members.length === 0) return alert('至少要保留一位團員！');

  if (window.dbUpdate && window.dbRef && window.db) {
    window.dbUpdate(window.dbRef(window.db, `projects/${window.activeProjectId}`), { members, externalPeople })
      .then(() => {
        window.activeProjectData.members = members;
        window.activeProjectData.externalPeople = externalPeople;
        alert('✅ 團員設定已儲存！');
        window.closeMembersModal();
        if (window.updateExpenseFormOptions) window.updateExpenseFormOptions();
        if (window.renderExpenses) window.renderExpenses();
        if (window.renderSettlement) window.renderSettlement();
      })
      .catch(err => alert('儲存失敗：' + err.message));
  }
};
