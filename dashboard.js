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
      <button class="card-act" title="重新命名" onclick="openRenameModal('${id}')">✏️</button>
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

  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  const itinerary = {
    "D0": { title: "D0 (行前準備)", spots: [] }
  };
  const weekMap = ['日', '一', '二', '三', '四', '五', '六'];

  for (let i = 0; i < diffDays; i++) {
    const current = new Date(start);
    current.setDate(start.getDate() + i);

    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    const w = weekMap[current.getDay()];

    const dayKey = `D${i + 1}`;
    itinerary[dayKey] = {
      title: `${dayKey} (${m}/${d} 週${w})`,
      spots: []
    };
  }

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

// ===== 卡片操作：改名 / 複製 / 刪除（皆需管理權限）=====

window.openRenameModal = function(id) {
  const p = window.allProjects[id];
  if (!p) return;
  if (!window.canManageProject(p)) return alert('你沒有權限修改這個專案（僅團主或網站管理員可操作）。');
  document.getElementById('renameProjId').value = id;
  document.getElementById('renameProjTitle').value = p.title || '';
  const modal = document.getElementById('renameProjectModal');
  if (modal) modal.style.display = 'flex';
};

window.closeRenameModal = function() {
  const modal = document.getElementById('renameProjectModal');
  if (modal) modal.style.display = 'none';
};

window.submitRenameProject = function() {
  const id = document.getElementById('renameProjId').value;
  const title = document.getElementById('renameProjTitle').value.trim();
  if (!title) return alert('請輸入專案名稱！');

  const p = window.allProjects[id];
  if (!p || !window.canManageProject(p)) return alert('你沒有權限修改這個專案。');

  if (window.dbUpdate && window.dbRef && window.db) {
    window.dbUpdate(window.dbRef(window.db, `projects/${id}`), { title })
      .then(() => window.closeRenameModal())
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
