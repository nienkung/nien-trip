// 第二階段：身份以 Firebase uid 判斷（覆寫 app-state.js / dashboard.js 內與身份有關的函式）
// 載入順序：app-state.js → dashboard.js → auth.js → members.js → join.js → identity.js
// 注意：app-state.js 內的同名函式已被本檔覆寫，之後可合併清理。
// email 僅用於「舊資料自動綁定」（lazy bind）：對方登入後，若其 email 符合舊團員，會補上 uid。
// 綁定後 email 仍保留在資料中，待第三階段搭配資料庫規則再清除。

(function () {
  function myUid() {
    return (window.currentUser && window.currentUser.uid) || '';
  }

  function myEmail() {
    return ((window.currentUser && window.currentUser.email) || '').toLowerCase();
  }

  // ===== 團員資料（含 uid）=====

  window.getMembers = function (proj) {
    if (!proj || !Array.isArray(proj.members)) return [];
    return proj.members.map(x =>
      typeof x === 'string'
        ? { name: x, email: '', uid: '' }
        : { name: (x && x.name) || '', email: (x && x.email) || '', uid: (x && x.uid) || '' }
    ).filter(m => m.name);
  };

  // 這一列團員是不是目前登入的人
  window.isMemberMe = function (m) {
    return !!(m && m.uid && myUid() && m.uid === myUid());
  };

  // ===== 權限判定（以 uid 為準）=====

  window.isProjectOwner = function (proj) {
    if (!window.currentUser) return false;
    if (window.isSuperAdmin()) return true;
    return !!(proj && proj.ownerUid && proj.ownerUid === myUid());
  };

  window.isMyProject = function (proj) {
    return !!(window.currentUser && proj && proj.ownerUid && proj.ownerUid === myUid());
  };

  window.isTeamMember = function (proj) {
    if (!window.currentUser || !proj) return false;
    if (window.isProjectOwner(proj)) return true;
    return window.getMembers(proj).some(m => m.uid && m.uid === myUid());
  };

  // ===== 舊資料自動綁定（lazy bind）=====
  // 登入者的 email 若符合某位「尚未綁定 uid」的舊團員，就補上 uid；
  // 若專案缺 ownerUid，也依 ownerEmail 或 ownerName 補上。冪等，綁定過就不再寫入。

  function bindLegacy(projectId, proj) {
    const uid = myUid();
    const email = myEmail();
    if (!uid || !proj || !window.dbUpdate || !window.dbRef || !window.db) return;

    const members = window.getMembers(proj);
    let changed = false;
    const next = members.map(m => {
      if (!m.uid && email && m.email && m.email.toLowerCase() === email) {
        changed = true;
        return { name: m.name, email: m.email, uid: uid };
      }
      return m;
    });

    const updates = {};
    if (changed) updates.members = next;

    if (!proj.ownerUid) {
      if (email && proj.ownerEmail && proj.ownerEmail.toLowerCase() === email) {
        updates.ownerUid = uid;
      } else if (proj.ownerName) {
        const om = next.find(m => m.uid && m.name === proj.ownerName);
        if (om) updates.ownerUid = om.uid;
      }
    }

    if (!Object.keys(updates).length) return;
    window.dbUpdate(window.dbRef(window.db, `projects/${projectId}`), updates).catch(() => {});
  }

  function bindLegacyAll() {
    Object.entries(window.allProjects || {}).forEach(([id, p]) => { if (!(p && p.__demo)) bindLegacy(id, p); });
  }

  // ===== 加入團員（以 uid 寫入；可認領同名的未綁定團員）=====

  window.addMemberByUid = function (projectId, proj, uid, name) {
    if (!uid) return Promise.reject(new Error('缺少帳號識別'));
    if (!window.dbUpdate || !window.dbRef || !window.db) return Promise.reject(new Error('系統載入中'));

    const members = window.getMembers(proj).slice();
    if (members.some(m => m.uid === uid)) return Promise.resolve();

    // 認領：團主先建立的「只有暱稱、尚未綁定」團員，若名字相同就直接綁定
    const claimIdx = members.findIndex(m => !m.uid && !m.email && m.name === name);
    if (claimIdx >= 0) {
      members[claimIdx] = { name: name, uid: uid };
    } else {
      members.push({ name: name, uid: uid });
    }
    return window.dbUpdate(window.dbRef(window.db, `projects/${projectId}`), { members: members })
      .then(() => {
        // 先同步本機資料，讓剛加入的人馬上可以進入專案（不必等資料庫回傳）
        if (window.allProjects && window.allProjects[projectId]) {
          window.allProjects[projectId].members = members;
        }
      });
  };

  // 邀請連結：覆寫 dashboard.js 的 processPendingInvite（改用 uid）
  window.processPendingInvite = function () {
    const inviteId = window.pendingInvite;
    if (!inviteId || !window.currentUser || !window.allProjects[inviteId]) return;
    window.pendingInvite = null; // 只處理一次

    const proj = window.allProjects[inviteId];
    const finish = () => {
      try { history.replaceState(null, '', window.location.pathname); } catch (e) {}
      window.enterProject(inviteId);
    };

    if (window.isTeamMember(proj)) { finish(); return; }

    window.addMemberByUid(inviteId, proj, window.currentUser.uid, window.currentUser.name || '新成員')
      .then(() => { alert('🎉 已透過邀請連結加入專案，你現在是團員！'); finish(); })
      .catch(() => finish());
  };

  // ===== 大廳渲染前先做舊資料綁定 =====

  const prevRenderDashboard = window.renderDashboardProjects;
  window.renderDashboardProjects = function () {
    bindLegacyAll();
    prevRenderDashboard();
  };
})();
