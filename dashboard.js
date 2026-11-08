window.addEventListener('DOMContentLoaded', () => {
  const checkAuthTimer = setInterval(() => {
    if (window.auth && window.onAuthStateChanged) {
      clearInterval(checkAuthTimer);
      window.initFirebaseAuthListener();
    }
  }, 100);
});

window.initFirebaseAuthListener = function() {
  try {
    window.onAuthStateChanged(window.auth, (user) => {
      if (user) {
        window.currentUser = { uid: user.uid, name: user.displayName || '錢粘', email: user.email };
        const nameElem = document.getElementById('dashUserName');
        if (nameElem) nameElem.innerText = window.currentUser.name;

        window.switchView('dashboard');
        window.initFirebaseProjectsSync();
      } else {
        window.currentUser = null;
        window.switchView('login');
      }
    });
  } catch (err) {
    console.error("Auth 監聽初始化失敗:", err);
  }
};

window.handleGoogleLogin = function() {
  if (!window.auth || !window.googleProvider || !window.signInWithPopup) {
    return alert('系統登入模組載入中，請稍候 2 秒再試一次！');
  }
  window.signInWithPopup(window.auth, window.googleProvider)
    .then((result) => {
      const user = result.user;
      window.currentUser = { uid: user.uid, name: user.displayName || '錢粘', email: user.email };
      const nameElem = document.getElementById('dashUserName');
      if (nameElem) nameElem.innerText = window.currentUser.name;

      window.switchView('dashboard');
      window.initFirebaseProjectsSync();
    })
    .catch((err) => {
      console.error("Google 登入失敗:", err);
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
        alert('登入視窗已被瀏覽器阻擋！請使用 Safari / Chrome 開啟本頁。');
      } else {
        alert('登入失敗: ' + err.message);
      }
    });
};

window.handleLogout = function() {
  if (window.auth && window.signOut) {
    window.signOut(window.auth).then(() => window.switchView('login'));
  }
};

window.initFirebaseProjectsSync = function() {
  if (!window.db || !window.dbRef || !window.dbOnValue) return;
  const projRef = window.dbRef(window.db, 'projects');
  window.dbOnValue(projRef, (snapshot) => {
    window.allProjects = snapshot.val() || {};
    window.renderDashboardProjects();
  });
};

// ===== 大廳渲染：搜尋 + 排序 + 「我的 / 他人」雙分區 =====

function dashEmptyState(msg) {
  return `<div class="dash-empty">📭<div class="dash-empty-text">${window.escapeHtml(msg)}</div></div>`;
}

function dashProjectCardHTML(id, p) {
  const cover = window.getProjectCover(p, id);
  const coverStyle = p.coverImage
    ? `background-image:url('${window.escapeHtml(p.coverImage)}'); background-size:cover; background-position:center;`
    : `background:${cover.grad};`;

  const dayCount = window.getProjectDayCount(p);
  const members = Array.isArray(p.members) ? p.members : (p.members ? [p.members] : []);

  const mine = window.isMyProject(p);
  const canManage = window.canManageProject(p);

  let badge;
  if (mine) {
    badge = `<span class="role-badge role-owner">👑 團主</span>`;
  } else if (window.isSuperAdmin()) {
    badge = `<span class="role-badge role-admin">🛡️ 網站管理員</span>`;
  } else {
    badge = `<span class="role-badge role-viewer">👀 訪客</span>`;
  }

  const memberChips = members.length
    ? members.map(m => `<span class="member-chip">${window.escapeHtml(m)}</span>`).join('')
    : `<span class="member-chip member-chip-empty">無成員</span>`;

  const actions = canManage ? `
    <div class="card-actions" onclick="event.stopPropagation()">
      <button class="card-act" title="編輯專案" onclick="openEditProjectModal('${id}')">✏️</button>
      <button class="card-act" title="複製專案" onclick="copyProject('${id}')">📄</button>
      <button class="card-act card-act-danger" title="刪除專案" onclick="deleteProject('${id}')">🗑️</button>
    </div>` : '';

  return `
    <div class="project-card" onclick="enterProject('${id}')">
      <div class="project-cover" style="${coverStyle}">
        ${p.coverImage ? '' : `<span class="cover-emoji">${cover.emoji}</span>`}
        <span class="cover-days">🗓️ ${dayCount} 天</span>
        ${actions}
      </div>
      <div class="project-body">
        <div class="project-name">${window.escapeHtml(p.title || '未命名專案')}</div>
        <div class="project-dates">📅 ${window.escapeHtml(p.startDate || '?')} ~ ${window.escapeHtml(p.endDate || '?')}</div>
        <div style="margin-top:6px;">${badge}</div>
        <div class="member-chips">${memberChips}</div>
      </div>
    </div>`;
}

window.renderDashboardProjects = function() {
  const myGrid = document.getElementById('myProjectGrid');
  const othersGrid = document.getElementById('othersProjectGrid');
  if (!myGrid || !othersGrid) return;

  const q = (document.getElementById('projectSearchInput')?.value || '').trim().toLowerCase();
  let entries = Object.entries(window.allProjects || {});

  // 搜尋：專案名稱 or 成員暱稱
  if (q) {
    entries = entries.filter(([id, p]) => {
      const inTitle = (p.title || '').toLowerCase().includes(q);
      const membersStr = Array.isArray(p.members) ? p.members.join(',') : (p.members || '');
      const inMembers = membersStr.toLowerCase().includes(q);
      return inTitle || inMembers;
    });
  }

  // 依出發日期排序（新到舊）
  entries.sort((a, b) => String(b[1].startDate || '').localeCompare(String(a[1].startDate || '')));

  const mine = entries.filter(([id, p]) => window.isMyProject(p));
  const others = entries.filter(([id, p]) => !window.isMyProject(p));

  const mineCount = document.getElementById('mineCount');
  const othersCount = document.getElementById('othersCount');
  if (mineCount) mineCount.innerText = mine.length;
  if (othersCount) othersCount.innerText = others.length;

  myGrid.innerHTML = mine.length
    ? mine.map(([id, p]) => dashProjectCardHTML(id, p)).join('')
    : dashEmptyState(q ? '找不到符合的專案' : '你還沒有建立專案，點右上角「＋ 建立新專案」開始吧！');

  othersGrid.innerHTML = others.length
    ? others.map(([id, p]) => dashProjectCardHTML(id, p)).join('')
    : dashEmptyState(q ? '找不到符合的專案' : '目前沒有其他人的公開專案');
};

// 區塊收納
window.toggleDashSection = function(key) {
  const headerMap = { mine: 'mineSection', others: 'othersSection' };
  const section = document.getElementById(headerMap[key]);
  if (section) section.classList.toggle('collapsed');
};

// ===== 建立新專案 =====

window.openNewProjectModal = function() {
  const modal = document.getElementById('createProjectModal');
  if (modal) modal.style.display = 'flex';
};

window.closeNewProjectModal = function() {
  const modal = document.getElementById('createProjectModal');
  if (modal) modal.style.display = 'none';
};

// 依起迄日期產生行程天數骨架；oldItin 存在時保留既有景點（含 D0）
function buildItineraryForDates(startStr, endStr, oldItin) {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;
  const weekMap = ['日', '一', '二', '三', '四', '五', '六'];
  const old = oldItin || {};

  const newItin = {};
  newItin['D0'] = (old['D0'] && Array.isArray(old['D0'].spots))
    ? { title: old['D0'].title || 'D0 (行前準備)', spots: old['D0'].spots }
    : { title: 'D0 (行前準備)', spots: [] };

  for (let i = 0; i < diffDays; i++) {
    const cur = new Date(start);
    cur.setDate(start.getDate() + i);
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    const w = weekMap[cur.getDay()];
    const key = `D${i + 1}`;
    const prevSpots = (old[key] && Array.isArray(old[key].spots)) ? old[key].spots : [];
    newItin[key] = { title: `${key} (${m}/${d} 週${w})`, spots: prevSpots };
  }
  return { itinerary: newItin, diffDays };
}

// 找出縮短後會被孤立（超出新天數且仍有景點）的日期
function findOrphanDays(oldItin, newDiffDays) {
  const orphans = [];
  Object.keys(oldItin || {}).forEach(k => {
    if (k === 'D0') return;
    const n = parseInt(k.replace('D', ''), 10);
    if (!isNaN(n) && n > newDiffDays && oldItin[k] && Array.isArray(oldItin[k].spots) && oldItin[k].spots.length > 0) {
      orphans.push(k);
    }
  });
  return orphans;
}

window.submitCreateProject = async function() {
  const title = document.getElementById('newProjTitle').value.trim();
  const startDateStr = document.getElementById('newProjStartDate').value;
  const endDateStr = document.getElementById('newProjEndDate').value;
  const membersRaw = document.getElementById('newProjMembers').value.trim();

  if (!title || !startDateStr || !endDateStr) {
    return alert('請填寫完整專案名稱與起迄日期！');
  }

  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  if (start > end) {
    return alert('結束日期不能早於出發日期！');
  }

  const membersArr = membersRaw ? membersRaw.split(',').map(m => m.trim()).filter(Boolean) : ['錢粘'];
  if (window.currentUser && !membersArr.includes(window.currentUser.name)) {
    membersArr.unshift(window.currentUser.name);
  }

  const { itinerary } = buildItineraryForDates(startDateStr, endDateStr, null);

  const newProjData = {
    title: title,
    startDate: startDateStr,
    endDate: endDateStr,
    ownerUid: window.currentUser ? window.currentUser.uid : 'anonymous',
    ownerName: window.currentUser ? window.currentUser.name : '錢粘',
    members: membersArr,
    itinerary: itinerary,
    expenses: {},
    createdAt: Date.now()
  };

  if (window.dbPush && window.dbRef && window.db) {
    try {
      const projectsRef = window.dbRef(window.db, 'projects');
      const newRef = await window.dbPush(projectsRef, newProjData);
      alert('🎉 專案建立成功！日曆天數與成員名單已自動初始化！');
      window.closeNewProjectModal();
      window.enterProject(newRef.key);
    } catch (err) {
      alert('建立失敗：' + err.message);
    }
  } else {
    alert('Firebase 未妥善初始化！');
  }
};

// ===== 卡片操作：編輯（名稱/日期/縮圖/團主）/ 複製 / 刪除（皆需管理權限）=====

// 縮圖樣式選擇器
function renderCoverPicker(selectedIndex) {
  const box = document.getElementById('editCoverPicker');
  if (!box) return;
  const autoSelected = (selectedIndex === undefined || selectedIndex === null || selectedIndex < 0);
  let html = `<div class="cover-swatch ${autoSelected ? 'selected' : ''}" onclick="selectCover(-1)" style="background:linear-gradient(135deg,#CBD5E0,#718096);" title="自動">🎲</div>`;
  window.TRIP_COVERS.forEach((c, i) => {
    html += `<div class="cover-swatch ${selectedIndex === i ? 'selected' : ''}" onclick="selectCover(${i})" style="background:${c.grad};">${c.emoji}</div>`;
  });
  box.innerHTML = html;
}

window.selectCover = function(idx) {
  const hidden = document.getElementById('editCoverIndex');
  if (hidden) hidden.value = idx;
  renderCoverPicker(idx);
};

window.openEditProjectModal = function(id) {
  const p = window.allProjects[id];
  if (!p) return;
  if (!window.canManageProject(p)) return alert('你沒有權限修改這個專案（僅團主或網站管理員可操作）。');

  document.getElementById('editProjId').value = id;
  document.getElementById('editProjTitle').value = p.title || '';
  document.getElementById('editProjStartDate').value = p.startDate || '';
  document.getElementById('editProjEndDate').value = p.endDate || '';
  document.getElementById('editProjCoverImage').value = p.coverImage || '';

  const coverIndex = (typeof p.coverIndex === 'number') ? p.coverIndex : -1;
  document.getElementById('editCoverIndex').value = coverIndex;
  renderCoverPicker(coverIndex);

  // 網站管理員才顯示「重新指定團主」
  const ownerSection = document.getElementById('editOwnerSection');
  const ownerSelect = document.getElementById('editProjOwner');
  if (window.isSuperAdmin() && ownerSection && ownerSelect) {
    ownerSection.style.display = 'block';
    const members = Array.isArray(p.members) ? p.members.slice() : [];
    if (p.ownerName && !members.includes(p.ownerName)) members.unshift(p.ownerName);
    ownerSelect.innerHTML = members.map(m => `<option value="${window.escapeHtml(m)}">${window.escapeHtml(m)}</option>`).join('');
    ownerSelect.value = p.ownerName || (members[0] || '');
  } else if (ownerSection) {
    ownerSection.style.display = 'none';
  }

  const modal = document.getElementById('editProjectModal');
  if (modal) modal.style.display = 'flex';
};

window.closeEditProjectModal = function() {
  const modal = document.getElementById('editProjectModal');
  if (modal) modal.style.display = 'none';
};

window.submitEditProject = function() {
  const id = document.getElementById('editProjId').value;
  const p = window.allProjects[id];
  if (!p || !window.canManageProject(p)) return alert('你沒有權限修改這個專案。');

  const title = document.getElementById('editProjTitle').value.trim();
  const startDateStr = document.getElementById('editProjStartDate').value;
  const endDateStr = document.getElementById('editProjEndDate').value;
  const coverIndex = parseInt(document.getElementById('editCoverIndex').value, 10);
  const coverImage = document.getElementById('editProjCoverImage').value.trim();

  if (!title) return alert('請輸入專案名稱！');
  if (!startDateStr || !endDateStr) return alert('請選擇出發與結束日期！');
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  if (start > end) return alert('結束日期不能早於出發日期！');

  const updates = {
    title,
    startDate: startDateStr,
    endDate: endDateStr,
    coverImage: coverImage || null,
    coverIndex: (isNaN(coverIndex) || coverIndex < 0) ? null : coverIndex
  };

  // 日期有變 → 重建行程天數骨架，保留既有景點
  const dateChanged = (startDateStr !== p.startDate) || (endDateStr !== p.endDate);
  if (dateChanged) {
    const { itinerary: newItin, diffDays } = buildItineraryForDates(startDateStr, endDateStr, p.itinerary);
    const orphans = findOrphanDays(p.itinerary, diffDays);
    if (orphans.length > 0) {
      if (!confirm(`縮短天數後，${orphans.join('、')} 已排入的行程景點將會被刪除。\n確定要繼續嗎？`)) return;
    }
    updates.itinerary = newItin;
  }

  // 網站管理員：重新指定團主（以名稱接手，待新團主登入後由專案內部功能綁定 uid/email）
  if (window.isSuperAdmin()) {
    const ownerSelect = document.getElementById('editProjOwner');
    if (ownerSelect && ownerSelect.value && ownerSelect.value !== (p.ownerName || '')) {
      updates.ownerName = ownerSelect.value;
      updates.ownerUid = '';
    }
  }

  if (window.dbUpdate && window.dbRef && window.db) {
    window.dbUpdate(window.dbRef(window.db, `projects/${id}`), updates)
      .then(() => window.closeEditProjectModal())
      .catch(err => alert('更新失敗：' + err.message));
  }
};

window.copyProject = function(id) {
  const p = window.allProjects[id];
  if (!p) return;
  if (!window.canManageProject(p)) return alert('你沒有權限複製這個專案。');
  if (!confirm(`要複製「${p.title}」為一個新專案嗎？\n（你將成為新專案的團主，行程會保留、記帳會清空重算）`)) return;

  const copy = JSON.parse(JSON.stringify(p));
  copy.title = (p.title || '未命名') + '（副本）';
  copy.ownerUid = window.currentUser ? window.currentUser.uid : 'anonymous';
  copy.ownerName = window.currentUser ? window.currentUser.name : '錢粘';
  copy.createdAt = Date.now();
  copy.expenses = {};

  if (window.dbPush && window.dbRef && window.db) {
    window.dbPush(window.dbRef(window.db, 'projects'), copy)
      .then(() => alert('✅ 已複製為新專案，你是這個副本的團主！'))
      .catch(err => alert('複製失敗：' + err.message));
  }
};

window.deleteProject = function(id) {
  const p = window.allProjects[id];
  if (!p) return;
  if (!window.canManageProject(p)) return alert('你沒有權限刪除這個專案（僅團主或網站管理員可操作）。');
  if (!confirm(`確定要刪除專案「${p.title}」嗎？\n⚠️ 此動作無法復原，該專案的所有行程與記帳都會一併刪除！`)) return;

  if (window.dbRemove && window.dbRef && window.db) {
    window.dbRemove(window.dbRef(window.db, `projects/${id}`))
      .catch(err => alert('刪除失敗：' + err.message));
    // 刪除成功後 onValue 監聽會自動重繪大廳
  }
};

// ===== 進入 / 離開專案 =====

window.enterProject = function(projectId) {
  window.activeProjectId = projectId;
  window.activeProjectData = window.allProjects[projectId];
  if (!window.activeProjectData) return;

  const titleElem = document.getElementById('activeProjectTitle');
  if (titleElem) titleElem.innerText = window.activeProjectData.title;

  if (window.renderItineraryFromJSON) window.renderItineraryFromJSON(window.activeProjectData.itinerary);
  if (window.updateExpenseFormOptions) window.updateExpenseFormOptions();
  if (window.renderExpenses) window.renderExpenses();
  if (window.renderSettlement) window.renderSettlement();

  window.switchView('project');
};

window.navigateToDashboard = function() {
  window.activeProjectId = null;
  window.switchView('dashboard');
};
