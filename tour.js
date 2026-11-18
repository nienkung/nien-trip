// 新手導覽與範例模式（最後載入）
// 1. 大廳導覽：帳號第一次登入時跳出一次（flag: lobbyDone）
// 2. 專案導覽：帳號第一次進入任何專案時跳出一次（flag: projectDone）
// 3. 範例專案 __demo__：共用、虛構資料，全部保存在記憶體中（重新整理或離開即還原）。
//    所有寫入 projects/__demo 的 dbSet / dbUpdate / dbPush / dbRemove 都在這裡攔截，不會寫進資料庫。
// 4. 練習任務：範例專案內的 7 項小任務，依畫面狀態自動打勾；全部完成寫入 practiceDone。
(function () {
  var DEMO_ID = '__demo__';
  var DEMO_PATH = 'projects/' + DEMO_ID;
  var SAMPLE_MD = '## D2\n- 14:00 嵐山竹林小徑 | 早上人少，適合散步\n- 18:30 河原町晚餐';

  var _demo = null;          // 範例專案（同時也是 window.allProjects[DEMO_ID]）
  var _flags = null;         // users/{uid}/tour 快取
  var _flagsP = null;
  var _practice = null;      // 練習任務開始時的基準值
  var _practiceHidden = false;
  var _panelSig = '';
  var _tourEl = null;
  var _tourPlace = null;

  // ===== 範例資料 =====
  function makeSample() {
    return {
      __demo: true,
      title: '範例：京都三日遊',
      startDate: '2027-04-01',
      endDate: '2027-04-03',
      ownerUid: null,
      ownerName: '範例',
      ownerEmail: null,
      members: [{ name: '小明' }, { name: '小美' }, { name: '阿公' }],
      externalPeople: [],
      currencies: ['JPY', 'TWD'],
      mainCurrency: 'JPY',
      theme: 'bronze',
      coverIndex: 0,
      coverImage: null,
      createdAt: 0,
      itinerary: {
        D0: { title: 'D0 (行前)', spots: [] },
        D1: {
          title: 'D1 (4/1 四)',
          spots: [
            { time: '09:00', title: '伏見稻荷大社', mapUrl: '', thumbUrl: '', desc: '爬千本鳥居約 2 小時' },
            { time: '19:00', title: '京都車站拉麵小路', mapUrl: '', thumbUrl: '', desc: '' }
          ]
        },
        D2: {
          title: 'D2 (4/2 五)',
          spots: [{ time: '10:00', title: '清水寺', mapUrl: '', thumbUrl: '', desc: '注意坡道與人潮' }]
        },
        D3: { title: 'D3 (4/3 六)', spots: [] }
      },
      expenses: {
        demoE1: { day: 'D1', item: '超商零食', amount: 1200, currency: 'JPY', payer: '小明', participants: ['小明', '小美', '阿公'], timestamp: 0 },
        demoE2: { day: 'D1', item: '晚餐拉麵', amount: 3000, currency: 'JPY', payer: '小美', participants: ['小明', '小美', '阿公'], timestamp: 0 }
      },
      settlements: {},
      prepNotes: {},
      prepPinned: {},
      joinRequests: {}
    };
  }

  function resetDemo() {
    _demo = makeSample();
    if (window.allProjects) window.allProjects[DEMO_ID] = _demo;
  }

  // 大廳每次收到資料庫快照後，把範例專案接回 allProjects（同一份物件）
  window.attachDemoProject = function (all) {
    if (!_demo) _demo = makeSample();
    if (all) all[DEMO_ID] = _demo;
  };

  function isDemoProj(p) { return !!(p && p.__demo); }
  function isDemoActive() { return window.activeProjectId === DEMO_ID && window._currentView === 'project'; }

  // ===== 權限：範例專案一律可看、可改（但寫入會被攔截）=====
  function wrapPerm(name, demoVal) {
    var orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function (p) { return isDemoProj(p) ? demoVal : orig.apply(this, arguments); };
  }
  wrapPerm('canEditContent', true);
  wrapPerm('canManageProject', true);
  wrapPerm('canManageMembers', true);
  wrapPerm('canViewExpenses', true);
  (function () {
    var o = window.getMyRole;
    if (typeof o !== 'function') return;
    window.getMyRole = function (p) { return isDemoProj(p) ? 'member' : o.apply(this, arguments); };
  })();

  // ===== 寫入攔截（projects/__demo）=====
  function setAt(root, path, val) {
    var parts = String(path || '').split('/').filter(Boolean);
    if (!parts.length) {
      if (val && typeof val === 'object') Object.keys(val).forEach(function (k) { root[k] = val[k]; });
      return;
    }
    var cur = root;
    for (var i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    var last = parts[parts.length - 1];
    if (val == null) delete cur[last];
    else cur[last] = val;
  }
  function delAt(root, path) { setAt(root, path, null); }
  function clone(v) { return v === undefined || v === null ? null : JSON.parse(JSON.stringify(v)); }
  function joinPath(a, b) { return a ? a + '/' + b : b; }
  function genKey() { return 'demo' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // 範例專案寫入後：若正在看範例，套用可能被改動的配色
  function afterDemoWrite() {
    if (isDemoActive() && typeof window.applyTheme === 'function') window.applyTheme(_demo.theme);
  }

  function installWrappers() {
    if (window._tourWrapsInstalled) return;
    if (!window.dbRef || !window.dbSet || !window.dbUpdate || !window.dbRemove || !window.dbPush) return;
    window._tourWrapsInstalled = true;

    var origRef = window.dbRef;
    window.dbRef = function (db, path) {
      if (typeof path === 'string' && (path === DEMO_PATH || path.indexOf(DEMO_PATH + '/') === 0)) {
        return { _ntDemo: path.slice(DEMO_PATH.length).replace(/^\//, '') };
      }
      return origRef.apply(this, arguments);
    };

    var origSet = window.dbSet, origUpdate = window.dbUpdate, origRemove = window.dbRemove, origPush = window.dbPush;

    window.dbSet = function (ref) {
      if (ref && ref._ntDemo !== undefined) { setAt(_demo, ref._ntDemo, clone(arguments[1])); afterDemoWrite(); return Promise.resolve(); }
      return origSet.apply(this, arguments);
    };
    window.dbUpdate = function (ref, val) {
      if (ref && ref._ntDemo !== undefined) {
        Object.keys(val || {}).forEach(function (k) { setAt(_demo, joinPath(ref._ntDemo, k), clone(val[k])); });
        afterDemoWrite();
        return Promise.resolve();
      }
      return origUpdate.apply(this, arguments);
    };
    window.dbRemove = function (ref) {
      if (ref && ref._ntDemo !== undefined) { delAt(_demo, ref._ntDemo); afterDemoWrite(); return Promise.resolve(); }
      return origRemove.apply(this, arguments);
    };
    window.dbPush = function (ref, val) {
      if (ref && ref._ntDemo !== undefined) {
        var key = genKey();
        setAt(_demo, joinPath(ref._ntDemo, key), clone(val));
        afterDemoWrite();
        return Promise.resolve({ key: key });
      }
      return origPush.apply(this, arguments);
    };

    // 範例專案不上傳檔案到 Storage
    var origUpload = window.uploadBytes;
    if (typeof origUpload === 'function') {
      window.uploadBytes = function (ref) {
        if (ref && typeof ref.fullPath === 'string' && ref.fullPath.indexOf('receipts/' + DEMO_ID + '/') === 0) {
          return Promise.reject(new Error('範例模式不支援上傳發票，請到自己的專案試試看。'));
        }
        return origUpload.apply(this, arguments);
      };
    }
  }

  // ===== 進入 / 離開 / 切換視圖的掛鉤 =====
  var origEnter = window.enterProject;
  window.enterProject = function (id) {
    if (id === DEMO_ID) {
      window.attachDemoProject(window.allProjects);
      startPractice();
    }
    return origEnter.apply(this, arguments);
  };

  var origNav = window.navigateToDashboard;
  window.navigateToDashboard = function () {
    if (window.activeProjectId === DEMO_ID) { resetDemo(); _practice = null; }
    return origNav.apply(this, arguments);
  };

  var origSwitch = window.switchView;
  window.switchView = function (viewId) {
    var r = origSwitch.apply(this, arguments);
    onViewChange(viewId);
    return r;
  };

  var origOpenMZ = window.openMemberZone;
  if (typeof origOpenMZ === 'function') {
    window.openMemberZone = function () { window._tourSawMZ = true; return origOpenMZ.apply(this, arguments); };
  }

  function onViewChange(viewId) {
    if (viewId === 'dashboard') maybeLobbyTour();
    if (viewId === 'project' && window.activeProjectId !== DEMO_ID) maybeProjectTour();
    tick();
  }

  // ===== 使用者旗標（users/{uid}/tour）=====
  function flagsRef() {
    var u = window.currentUser;
    return (u && u.uid && window.dbRef && window.db) ? window.dbRef(window.db, 'users/' + u.uid + '/tour') : null;
  }
  function loadFlags() {
    if (_flags) return Promise.resolve(_flags);
    if (_flagsP) return _flagsP;
    var ref = flagsRef();
    if (!ref || !window.dbGet) return Promise.resolve(null);
    _flagsP = window.dbGet(ref)
      .then(function (s) { _flags = s.val() || {}; return _flags; })
      .catch(function () { _flagsP = null; return null; });
    return _flagsP;
  }
  function markFlag(key) {
    if (_flags) _flags[key] = true;
    var ref = flagsRef();
    if (ref && window.dbUpdate) {
      var o = {}; o[key] = true;
      window.dbUpdate(ref, o).catch(function () {});
    }
  }

  // ===== 導覽引擎 =====
  function findVisible(sel) {
    var el = document.querySelector(sel);
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return (r.width > 0 && r.height > 0) ? el : null;
  }

  function clearTour() {
    if (_tourEl) _tourEl.remove();
    _tourEl = null;
    if (_tourPlace) {
      window.removeEventListener('resize', _tourPlace);
      window.removeEventListener('scroll', _tourPlace);
    }
    _tourPlace = null;
  }

  function runTour(steps, flagKey) {
    clearTour();
    var idx = 0;
    var box = document.createElement('div');
    box.className = 'nt-tour';
    box.innerHTML =
      '<div class="nt-spot"></div>' +
      '<div class="nt-tip">' +
        '<div class="nt-step"></div><div class="nt-title"></div><div class="nt-text"></div>' +
        '<div class="nt-btns">' +
          '<button class="nt-btn nt-ghost nt-skip">略過</button><span class="nt-sp"></span>' +
          '<button class="nt-btn nt-cta" hidden></button>' +
          '<button class="nt-btn nt-next">下一步</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(box);
    _tourEl = box;
    var spot = box.querySelector('.nt-spot');
    var tip = box.querySelector('.nt-tip');
    var cta = box.querySelector('.nt-cta');
    var next = box.querySelector('.nt-next');
    var cur = null;

    function finish() { clearTour(); markFlag(flagKey); }

    function place() {
      if (!cur || !cur.isConnected) return;
      var r = cur.getBoundingClientRect();
      spot.style.top = (r.top - 6) + 'px';
      spot.style.left = (r.left - 6) + 'px';
      spot.style.width = (r.width + 12) + 'px';
      spot.style.height = (r.height + 12) + 'px';
      var tw = Math.min(320, window.innerWidth - 16);
      tip.style.width = tw + 'px';
      var th = tip.offsetHeight;
      var top = r.bottom + 14;
      if (top + th > window.innerHeight - 8) top = Math.max(8, r.top - th - 14);
      var left = Math.min(Math.max(8, r.left + r.width / 2 - tw / 2), window.innerWidth - tw - 8);
      tip.style.top = top + 'px';
      tip.style.left = left + 'px';
    }
    _tourPlace = place;
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { passive: true });

    function show() {
      while (idx < steps.length && !findVisible(steps[idx].sel)) idx++;
      if (idx >= steps.length) { finish(); return; }
      var s = steps[idx];
      cur = findVisible(s.sel);
      var isLast = steps.slice(idx + 1).every(function (x) { return !findVisible(x.sel); });
      box.querySelector('.nt-step').textContent = '導覽 ' + (idx + 1) + ' / ' + steps.length;
      box.querySelector('.nt-title').textContent = s.title;
      box.querySelector('.nt-text').textContent = s.text;
      next.textContent = isLast ? '完成' : '下一步';
      if (s.cta) {
        cta.hidden = false;
        cta.textContent = s.cta.label;
        cta.onclick = function () { finish(); s.cta.fn(); };
      } else {
        cta.hidden = true;
        cta.onclick = null;
      }
      if (cur.scrollIntoView) cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
      place();
      setTimeout(place, 350);
    }

    next.onclick = function () {
      if (idx >= steps.length - 1 || steps.slice(idx + 1).every(function (x) { return !findVisible(x.sel); })) { finish(); return; }
      idx++;
      show();
    };
    box.querySelector('.nt-skip').onclick = finish;
    show();
  }

  var LOBBY_STEPS = [
    { sel: '.btn-add-project', title: '建立新專案', text: '點這裡建立旅行專案，填好日期後，每一天的行程會自動產生。' },
    { sel: '#demoProjectCard', title: '範例專案', text: '這是共用的範例，可以隨時點開看，內容不會被儲存。' },
    { sel: 'button[onclick="openMemberZone()"]', title: '會員專區', text: '在這裡修改顯示名字與密碼。' }
  ];

  var PROJECT_STEPS = [
    { sel: 'button[onclick="switchProjectTab(\'prep\')"]', title: '📋 行前準備', text: '出發前的倒數、天氣與重要資訊都在這裡。' },
    { sel: 'button[onclick="switchProjectTab(\'itinerary\')"]', title: '📍 行程規劃', text: '每天的景點安排在這裡，可以拖曳調整順序；左側滾輪可以快速跳天。' },
    { sel: 'button[onclick="switchProjectTab(\'expense\')"]', title: '📝 旅程記帳', text: '花費記在這裡，可以附發票，自動換算台幣。' },
    {
      sel: 'button[onclick="switchProjectTab(\'settlement\')"]', title: '⚖️ 結算拆帳', text: '最後在這裡看誰該付給誰多少錢。',
      cta: { label: '想自己試試看？進入範例', fn: function () { window.enterProject(DEMO_ID); } }
    }
  ];

  function maybeLobbyTour() {
    if (window._lobbyChecked) return;
    loadFlags().then(function (f) {
      if (!f || f.lobbyDone || window._lobbyChecked) return;
      window._lobbyChecked = true;
      setTimeout(function () {
        if (window._currentView === 'dashboard') runTour(LOBBY_STEPS, 'lobbyDone');
      }, 700);
    });
  }

  function maybeProjectTour() {
    if (window._projChecked) return;
    loadFlags().then(function (f) {
      if (!f || f.projectDone || window._projChecked) return;
      window._projChecked = true;
      setTimeout(function () {
        if (window._currentView === 'project' && window.activeProjectId !== DEMO_ID) runTour(PROJECT_STEPS, 'projectDone');
      }, 700);
    });
  }

  // ===== 練習任務（範例專案）=====
  function countSpots(p) {
    var n = 0;
    Object.keys(p.itinerary || {}).forEach(function (k) {
      var s = (p.itinerary[k] || {}).spots;
      if (Array.isArray(s)) n += s.length;
      else if (s) n += Object.keys(s).length;
    });
    return n;
  }
  function countExp(p) { return Object.keys(p.expenses || {}).length; }
  function allSpots(p) {
    var out = [];
    Object.keys(p.itinerary || {}).forEach(function (k) {
      var s = (p.itinerary[k] || {}).spots;
      out = out.concat(Array.isArray(s) ? s : Object.values(s || {}));
    });
    return out;
  }

  var TASKS = [
    { t: '點右下角「＋景點」，新增一個景點，時間填 10:00', ok: function (p, b) { return countSpots(p) > b.spots; } },
    { t: '點日期下方的「主軸」，填一個主軸', ok: function (p) { return Object.keys(p.itinerary || {}).some(function (k) { return p.itinerary[k] && p.itinerary[k].theme; }); } },
    { t: '點「📝 Markdown 匯入」，把下方範例貼進去並確認匯入', ok: function (p) { return allSpots(p).some(function (x) { return x && x.title === '嵐山竹林小徑'; }); } },
    { t: '點右下角「＋記帳」，新增一筆，選付款人並勾選分帳成員', ok: function (p, b) { return countExp(p) > b.exp; } },
    { t: '打開「專案設定」，換一個配色並儲存', ok: function (p, b) { return p.theme !== b.theme; } },
    { t: '打開「會員專區」，看看自己的名字與帳號', ok: function () { return !!window._tourSawMZ; } },
    { t: '到「⚖️結算拆帳」，把其中一筆轉帳打勾', ok: function () { return !!document.querySelector('#settlementDetails .transfer-row.done'); } }
  ];

  function startPractice() {
    _practice = { spots: countSpots(_demo), exp: countExp(_demo), theme: _demo.theme };
    _practiceHidden = false;
    window._tourSawMZ = false;
    _panelSig = '';
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    var ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
    return Promise.resolve();
  }

  var banner = null, panel = null;
  function ensureUI() {
    if (banner) return;
    var css = document.createElement('style');
    css.textContent =
      '.nt-tour{position:fixed;inset:0;z-index:2000;pointer-events:none}' +
      '.nt-spot{position:fixed;border-radius:12px;box-shadow:0 0 0 9999px rgba(0,0,0,.55);transition:all .3s;pointer-events:none}' +
      '.nt-tip{position:fixed;background:#fff;border:2px solid var(--brand-main);border-radius:16px;padding:14px 16px;box-shadow:var(--shadow-lg);pointer-events:auto;color:var(--brand-dark)}' +
      '.nt-step{font-size:11px;font-weight:800;color:var(--brand-main)}' +
      '.nt-title{font-size:16px;font-weight:900;margin-top:2px}' +
      '.nt-text{font-size:14px;color:var(--sub-text);font-weight:600;margin-top:6px;line-height:1.6}' +
      '.nt-btns{display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap}' +
      '.nt-btn{border:none;border-radius:10px;padding:8px 12px;font-size:13px;font-weight:800;cursor:pointer}' +
      '.nt-btn[hidden]{display:none}' +
      '.nt-next,.nt-cta{background:var(--brand-main);color:#fff}' +
      '.nt-ghost{background:transparent;color:var(--sub-text)}' +
      '.nt-sp{flex:1}' +
      '.nt-banner{display:none;align-items:center;gap:8px;justify-content:space-between;flex-wrap:wrap;background:#FFF7E6;border:1.5px solid #F6AD55;color:#7B4A00;border-radius:12px;padding:8px 12px;margin-bottom:12px;font-size:13px;font-weight:700}' +
      '.nt-banner button{border:none;border-radius:8px;padding:5px 10px;font-size:12px;font-weight:800;background:#ED8936;color:#fff;cursor:pointer}' +
      '.nt-panel{position:fixed;left:12px;bottom:16px;width:min(300px,calc(100vw - 24px));background:#fff;border:1.5px solid var(--brand-border);border-radius:16px;box-shadow:var(--shadow-lg);padding:12px 14px;z-index:600;display:none;max-height:60vh;overflow:auto;color:var(--brand-dark)}' +
      '.nt-panel-h{display:flex;justify-content:space-between;align-items:center;font-size:14px;font-weight:900}' +
      '.nt-panel-h button{border:none;background:none;font-size:16px;cursor:pointer;color:var(--sub-text)}' +
      '.nt-task{font-size:13px;font-weight:700;padding:5px 0;color:var(--brand-dark)}' +
      '.nt-task.ok{color:var(--sub-text);text-decoration:line-through}' +
      '.nt-pre{font-size:12px;background:var(--brand-light);border-radius:8px;padding:8px;white-space:pre-wrap;margin-top:8px;font-family:ui-monospace,Menlo,monospace}' +
      '.nt-panel-b{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}' +
      '.nt-panel-b button{border:1px solid var(--brand-border);background:#fff;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:800;color:var(--brand-main);cursor:pointer}';
    document.head.appendChild(css);

    banner = document.createElement('div');
    banner.className = 'nt-banner';
    banner.innerHTML = '<span>🧪 範例模式：修改只會暫時顯示，重新整理或離開後會還原。</span><button type="button" id="ntShowPanel">📋 練習任務</button>';
    var mc = document.querySelector('#view-project .main-container');
    var sticky = mc && mc.querySelector('.tabbar-sticky');
    if (mc && sticky) mc.insertBefore(banner, sticky);
    banner.querySelector('#ntShowPanel').onclick = function () { _practiceHidden = false; _panelSig = ''; tick(); };

    panel = document.createElement('div');
    panel.className = 'nt-panel';
    document.body.appendChild(panel);
  }

  function renderPanel(doneArr) {
    var n = doneArr.filter(Boolean).length;
    var allDone = n === TASKS.length;
    var html = '<div class="nt-panel-h"><span>📋 練習任務 ' + n + '/' + TASKS.length + '</span><button type="button" data-act="min">－</button></div>';
    TASKS.forEach(function (t, i) {
      html += '<div class="nt-task' + (doneArr[i] ? ' ok' : '') + '">' + (doneArr[i] ? '✅ ' : '⬜ ') + (i + 1) + '. ' + t.t + '</div>';
      if (i === 2) html += '<div class="nt-pre">' + SAMPLE_MD.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</div>';
    });
    if (allDone) html += '<div class="nt-task ok">🎉 全部完成！你已經會用這個網站了。</div>';
    html += '<div class="nt-panel-b"><button type="button" data-act="copy">📋 複製範例</button><button type="button" data-act="hide">略過練習</button></div>';
    panel.innerHTML = html;
    panel.querySelector('[data-act="min"]').onclick = function () { _practiceHidden = true; tick(); };
    panel.querySelector('[data-act="hide"]').onclick = function () { _practiceHidden = true; tick(); };
    panel.querySelector('[data-act="copy"]').onclick = function () { copyText(SAMPLE_MD); };
  }

  function tick() {
    if (!document.body) return;
    ensureUI();
    var active = isDemoActive();
    banner.style.display = active ? 'flex' : 'none';
    if (!active) {
      panel.style.display = 'none';
      return;
    }
    if (!_practice) startPractice();
    var done = TASKS.map(function (t) { return !!t.ok(_demo, _practice); });
    var sig = done.map(function (d) { return d ? 1 : 0; }).join('') + (_practiceHidden ? 'h' : 'v');
    if (sig !== _panelSig) {
      _panelSig = sig;
      renderPanel(done);
      panel.style.display = _practiceHidden ? 'none' : 'block';
    }
    if (done.every(Boolean) && !window._practiceMarked) {
      window._practiceMarked = true;
      markFlag('practiceDone');
    }
  }

  // 每秒檢查一次練習進度（只在範例專案時做事）
  setInterval(function () {
    if (!window._tourWrapsInstalled) installWrappers();
    tick();
  }, 1000);

  // 範例專案的初始資料（大廳收到快照前也能使用）
  if (!_demo) _demo = makeSample();
})();
