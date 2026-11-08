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

// 渲染大廳專案卡片 (含權限 Badge 標籤)
window.renderDashboardProjects = function() {
  const grid = document.getElementById('projectGridList');
  if (!grid) return;
  const entries = Object.entries(window.allProjects || {});
  
  if (entries.length === 0) {
    grid.innerHTML = '<div style="text-align:center; padding:30px; color:var(--sub-text);">目前尚無專案，請點擊上方按鈕建立新專案！</div>';
    return;
  }

  grid.innerHTML = entries.map(([id, p]) => {
    const isOwner = window.isProjectOwner(p);
    const roleBadge = isOwner 
      ? `<span class="role-badge role-owner">👑 專案建立者</span>`
      : `<span class="role-badge role-member">👥 協同成員</span>`;
    
    const membersStr = Array.isArray(p.members) ? p.members.join(', ') : (p.members || '無');

    return `
      <div class="project-card" onclick="enterProject('${id}')">
        <div class="project-header">
          <div>
            <div class="project-name">${p.title}</div>
            <div class="project-dates">📅 ${p.startDate || ''} ~ ${p.endDate || ''}</div>
            ${roleBadge}
          </div>
        </div>
        <div class="project-members">成員：${membersStr}</div>
      </div>
    `;
  }).join('');
};

// 打開建立專案 Modal
window.openNewProjectModal = function() {
  const modal = document.getElementById('createProjectModal');
  if (modal) modal.style.display = 'flex';
};

window.closeNewProjectModal = function() {
  const modal = document.getElementById('createProjectModal');
  if (modal) modal.style.display = 'none';
};

// 提交建立專案（日曆起迄算日 + 自動生成 Day 1~N 格式化標題）
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
