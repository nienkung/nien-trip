// 申請加入（app 內審核）：訪客送出申請，團主在 app 內同意或拒絕
// 第二階段：申請以 uid 記錄，不再存 email
// 需在 dashboard.js、members.js 之後載入；identity.js 需在本檔之後載入（提供 addMemberByUid）
// 申請紀錄：projects/{id}/joinRequests/{uid} = { name, uid, at }

(function () {
  function requestsOf(proj) {
    const r = proj && proj.joinRequests;
    return r && typeof r === 'object' ? r : {};
  }

  function myRequestPending(proj) {
    const uid = window.currentUser && window.currentUser.uid;
    if (!proj || !uid) return false;
    return !!requestsOf(proj)[uid];
  }

  const BTN_STYLE = 'margin-top:6px; background:var(--brand-main); color:#fff; border:none; border-radius:8px; padding:6px 10px; font-size:12px; font-weight:700; cursor:pointer;';
  const BTN_PENDING_STYLE = 'margin-top:6px; background:#CBD5E0; color:#4A5568; border:none; border-radius:8px; padding:6px 10px; font-size:12px; font-weight:700; cursor:default;';
  const BTN_REJECT_STYLE = 'margin-top:6px; background:#FFF5F5; color:#E53E3E; border:1px solid #FEB2B2; border-radius:8px; padding:6px 10px; font-size:12px; font-weight:700; cursor:pointer;';

  // 訪客送出申請
  window.requestJoinProject = function (projectId, ev) {
    if (ev) ev.stopPropagation();
    const proj = window.allProjects[projectId];
    if (!proj) return alert('找不到這個專案。');
    if (!window.currentUser || !window.currentUser.uid) return alert('請先登入。');
    if (window.isTeamMember(proj)) return alert('你已經是這個專案的團員了。');
    if (myRequestPending(proj)) return alert('你已送出申請，請等待團主審核。');
    if (!window.dbSet || !window.dbRef || !window.db) return alert('系統載入中，請稍後再試。');

    const req = {
      name: window.currentUser.name || '新成員',
      uid: window.currentUser.uid,
      at: Date.now()
    };
    window.dbSet(window.dbRef(window.db, `projects/${projectId}/joinRequests/${window.currentUser.uid}`), req)
      .then(() => alert('✅ 已送出加入申請，團主同意後你就能查看完整內容。'))
      .catch(err => alert('申請失敗：' + err.message));
  };

  // 團主同意：加入團員（以 uid），再移除申請
  window.approveJoinRequest = function (projectId, uid) {
    const proj = window.allProjects[projectId];
    if (!proj || !window.canManageMembers(proj)) return alert('只有團主可以審核申請。');
    const req = requestsOf(proj)[uid];
    if (!req) return alert('這筆申請已不存在。');
    if (!req.uid) return alert('這是舊版格式的申請，請對方重新申請（或直接拒絕）。');
    if (!window.addMemberByUid) return alert('系統載入中，請稍後再試。');

    window.addMemberByUid(projectId, proj, req.uid, req.name || '新成員')
      .then(() => window.dbRemove(window.dbRef(window.db, `projects/${projectId}/joinRequests/${uid}`)))
      .then(() => alert(`✅ 已同意 ${req.name || '新成員'} 加入！`))
      .catch(err => alert('同意失敗：' + err.message));
  };

  // 團主拒絕：僅移除申請
  window.rejectJoinRequest = function (projectId, uid) {
    const proj = window.allProjects[projectId];
    if (!proj || !window.canManageMembers(proj)) return alert('只有團主可以審核申請。');
    if (!window.dbRemove || !window.dbRef || !window.db) return alert('系統載入中，請稍後再試。');
    if (!confirm('確定要拒絕這筆申請嗎？')) return;
    window.dbRemove(window.dbRef(window.db, `projects/${projectId}/joinRequests/${uid}`))
      .catch(err => alert('拒絕失敗：' + err.message));
  };

  // ---- 包裝大廳：非團員的專案卡片加上「申請加入」按鈕 ----
  const origRenderDashboard = window.renderDashboardProjects;
  window.renderDashboardProjects = function () {
    origRenderDashboard();
    const othersGrid = document.getElementById('othersProjectGrid');
    if (!othersGrid) return;

    othersGrid.querySelectorAll('.project-card').forEach(card => {
      const m = (card.getAttribute('onclick') || '').match(/enterProject\('([^']+)'\)/);
      if (!m) return;
      const id = m[1];
      const proj = window.allProjects[id];
      if (!proj || window.isTeamMember(proj)) return;
      const body = card.querySelector('.project-body');
      if (!body || body.querySelector('.join-btn')) return;

      const pending = myRequestPending(proj);
      const btn = document.createElement('button');
      btn.className = 'join-btn';
      btn.textContent = pending ? '⏳ 已申請，等待團主審核' : '🙋 申請加入';
      btn.setAttribute('style', pending ? BTN_PENDING_STYLE : BTN_STYLE);
      if (!pending) {
        btn.onclick = (ev) => window.requestJoinProject(id, ev);
      } else {
        btn.onclick = (ev) => ev.stopPropagation();
      }
      body.appendChild(btn);
    });
  };

  // ---- 包裝團員彈窗：訪客顯示申請按鈕；團主顯示待審核清單 ----
  const origRenderMembers = window.renderMembersModal;
  window.renderMembersModal = function () {
    origRenderMembers();
    const proj = window.activeProjectData;
    const body = document.getElementById('membersModalBody');
    if (!proj || !body || !window.activeProjectId) return;

    if (window.canManageMembers(proj)) {
      const reqs = requestsOf(proj);
      const uids = Object.keys(reqs);
      if (!uids.length) return;
      const pid = window.activeProjectId;
      let html = `<div class="mem-section-label" style="margin-top:4px;">📬 待審核的加入申請（${uids.length}）</div>`;
      uids.forEach(uid => {
        const r = reqs[uid] || {};
        html += `
          <div class="mem-row">
            <div class="mem-row-main"><span class="mem-name">${window.escapeHtml(r.name || '新成員')}</span></div>
            <div class="mem-row-side">
              <button style="${BTN_STYLE}" onclick="approveJoinRequest('${pid}','${uid}')">同意</button>
              <button style="${BTN_REJECT_STYLE}" onclick="rejectJoinRequest('${pid}','${uid}')">拒絕</button>
            </div>
          </div>`;
      });
      body.insertAdjacentHTML('afterbegin', html);
    } else if (!window.isTeamMember(proj)) {
      const pending = myRequestPending(proj);
      const pid = window.activeProjectId;
      const html = `
        <div style="margin-bottom:14px;">
          <button style="${pending ? BTN_PENDING_STYLE : BTN_STYLE}" ${pending ? 'disabled' : `onclick="requestJoinProject('${pid}')"`}>
            ${pending ? '⏳ 已申請，等待團主審核' : '🙋 申請加入這個專案'}
          </button>
        </div>`;
      body.insertAdjacentHTML('afterbegin', html);
    }
  };
})();
