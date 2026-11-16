// 行前準備頁：倒數（置頂）、旅遊天氣總覽（可收合，圖例在區塊內置頂）、行前準備清單（置頂卡片＋可拖曳備註）。
// 資料：projects/{id}/prepPinned/{passport|fx} = { title, body, by, updatedAt }；projects/{id}/prepNotes/{key} 另有 order 欄位。
(function () {
  var DAY = 864e5;
  var PIN_DEFAULT = { passport: { title: '護照簽證資訊', body: '' }, fx: { title: '換匯資訊', body: '' } };
  var prepWxOpen = true;
  var pdrag = null;

  var st = document.createElement('style');
  st.textContent =
    '#prepCountdown{position:sticky;top:var(--prep-top,120px);z-index:60;background:var(--brand-bg);border:1px solid var(--brand-border);border-radius:14px;padding:10px 12px;margin-bottom:10px}' +
    '.prep-cd-head{font-size:12px;font-weight:800;color:var(--brand-main);margin-bottom:6px}' +
    '.prep-cd-cells{display:flex;gap:6px;align-items:flex-start}' +
    '.prep-cell{flex:1;text-align:center;min-width:0;font-family:ui-monospace,Menlo,monospace}' +
    '.prep-cell-icon{height:14px;font-size:12px;color:var(--brand-main)}' +
    '.prep-cell-date{font-size:12px;color:var(--brand-main);font-weight:500;line-height:1.2}' +
    '.prep-cell-date.emph{font-size:16px;font-weight:800;color:var(--brand-dark)}' +
    '.prep-cell-wk{font-size:10px;color:var(--brand-main);opacity:.8}' +
    '.prep-sec{margin-bottom:14px;overflow:visible}' +
    '.prep-sec-head{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;cursor:pointer;font-size:15px;font-weight:800;color:var(--brand-dark)}' +
    '.prep-legend{position:sticky;top:calc(var(--prep-top,120px) + var(--prep-cd-h,80px));z-index:40;display:flex;flex-wrap:wrap;gap:6px 12px;padding:8px 14px;background:var(--brand-light);border-top:1px solid var(--brand-border);border-bottom:1px solid var(--brand-border);font-size:12px;color:var(--brand-dark)}' +
    '.prep-legend i{color:var(--brand-main)}' +
    '.prep-wx-row{display:grid;grid-template-columns:56px 1fr auto;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--brand-border)}' +
    '.prep-wx-row.today{background:var(--brand-light)}' +
    '.prep-wx-date{font-family:ui-monospace,Menlo,monospace;font-size:13px;font-weight:800;color:var(--brand-dark)}' +
    '.prep-wx-date small{display:block;font-size:10px;color:var(--brand-main);font-weight:500}' +
    '.prep-wx-place{font-size:14px;font-weight:700;color:var(--brand-dark);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.prep-wx-sub{font-size:12px;color:var(--brand-dark);display:flex;gap:6px;align-items:center;margin-top:2px;flex-wrap:wrap}' +
    '.prep-wx-sub i{color:var(--brand-main);font-size:15px}' +
    '.prep-wx-temp{text-align:right;font-family:ui-monospace,Menlo,monospace;font-size:13px;color:var(--brand-dark)}' +
    '.prep-wx-temp .lug{font-size:12px;color:var(--brand-main);display:flex;gap:4px;justify-content:flex-end;margin-top:2px}' +
    '.prep-list{padding:0 12px 4px}' +
    '.prep-card{display:flex;gap:8px;align-items:flex-start;padding:12px;margin-top:8px;border:1px solid var(--brand-border);border-radius:12px;background:#fff}' +
    '.prep-card.pinned{background:var(--brand-light)}' +
    '.prep-card.dragging{opacity:.6}' +
    '.prep-card-body{flex:1;min-width:0}' +
    '.prep-card-title{font-size:14px;font-weight:800;color:var(--brand-dark)}' +
    '.prep-card-text{font-size:12px;color:var(--brand-dark);opacity:.8;margin-top:2px;white-space:pre-wrap;overflow-wrap:anywhere}' +
    '.prep-grip{color:var(--brand-main);font-size:16px;cursor:grab;touch-action:none;padding:4px;margin-top:2px}' +
    '.prep-act{background:none;border:none;color:var(--brand-main);cursor:pointer;font-size:15px;padding:2px 4px}' +
    '.prep-add{display:flex;justify-content:center;padding:6px 0 16px}' +
    '.prep-add button{width:40px;height:40px;border-radius:50%;border:1px dashed var(--brand-main);background:transparent;color:var(--brand-main);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px}';
  document.head.appendChild(st);
  var st2 = document.createElement('style');
  st2.textContent =
    '.prep-card-head{display:flex;align-items:center;gap:8px;cursor:pointer}' +
    '.prep-card-head .prep-card-title{flex:1;min-width:0}' +
    '.prep-chev{color:var(--brand-main);font-size:14px;padding:0 4px}' +
    '.prep-grip{color:var(--brand-main);font-size:18px;cursor:grab;touch-action:none;padding:0 4px;line-height:1}' +
    '.prep-lock{font-size:14px}' +
    '.prep-card-detail{padding-top:8px}' +
    '.prep-card-acts{display:flex;gap:8px;margin-top:10px}' +
    '.prep-btn{font-size:12px;font-weight:700;padding:5px 12px;border-radius:999px;border:1px solid var(--brand-border);background:#fff;color:var(--brand-dark);cursor:pointer}' +
    '.prep-btn.danger{color:#c0392b;border-color:#f0c4bd}';
  document.head.appendChild(st2);

  function esc(s) { return window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function md(t) { var d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate(); }
  function wk(t) { return ['日', '一', '二', '三', '四', '五', '六'][new Date(t).getDay()]; }
  function midnight(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  function genKey() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function pinnedOf(proj) {
    var p = proj.prepPinned || {};
    return {
      passport: Object.assign({}, PIN_DEFAULT.passport, p.passport || {}),
      fx: Object.assign({}, PIN_DEFAULT.fx, p.fx || {})
    };
  }
  function notesOf(proj) {
    return Object.entries(proj.prepNotes || {})
      .filter(function (e) { return e[1] && typeof e[1] === 'object'; })
      .sort(function (a, b) {
        var oa = typeof a[1].order === 'number' ? a[1].order : Infinity;
        var ob = typeof b[1].order === 'number' ? b[1].order : Infinity;
        if (oa !== ob) return oa - ob;
        return (a[1].createdAt || 0) - (b[1].createdAt || 0);
      });
  }

  function setVars() {
    var nav = document.querySelector('.navbar');
    var tb = document.querySelector('.tabbar-sticky');
    var top = (nav ? nav.offsetHeight : 60) + (tb ? tb.offsetHeight : 0);
    document.documentElement.style.setProperty('--prep-top', top + 'px');
    var cd = document.getElementById('prepCountdown');
    if (cd) document.documentElement.style.setProperty('--prep-cd-h', (cd.offsetHeight + 10) + 'px');
  }

  function cdCell(t, icon, emph, label) {
    return '<div class="prep-cell"><div class="prep-cell-icon">' + (icon || '') + '</div>' +
      '<div class="prep-cell-date' + (emph ? ' emph' : '') + '">' + (label || md(t)) + '</div>' +
      '<div class="prep-cell-wk">' + (label ? '' : wk(t)) + '</div></div>';
  }

  function countdownInner(proj) {
    var days = window.WX.tripDays(proj);
    if (!days.length) return '<div class="prep-cd-head">尚無行程天數</div>';
    var S = midnight(window.WX.dayDate(proj, days[0]));
    var E = midnight(window.WX.dayDate(proj, days[days.length - 1]));
    var T = midnight(new Date());
    if (T > E) return '<div class="prep-cd-head">旅程已結束</div>';
    var head = '', cells = '';
    if (T < S) {
      var r = Math.round((S - T) / DAY);
      head = '距離出發還有 ' + r + ' 天';
      if (r + 1 <= 5) {
        for (var t = T; t <= S; t += DAY) cells += cdCell(t, t === S ? '🧳' : '', t === T || t === S);
      } else {
        cells = cdCell(T, '', true) + cdCell(T + DAY, '', false) + cdCell(0, '', false, '…') + cdCell(S - DAY, '', false) + cdCell(S, '🧳', true);
      }
    } else {
      head = '旅行中';
      for (var u = T, n = 0; u <= E && n < 5; u += DAY, n++) {
        cells += cdCell(u, u === T ? '🧳' : (u === E ? '✈️' : ''), u === T || u === E);
      }
    }
    return '<div class="prep-cd-head">' + head + '</div><div class="prep-cd-cells">' + cells + '</div>';
  }

  function wxRowsHTML(proj, res) {
    var days = window.WX.tripDays(proj);
    var today = midnight(new Date());
    return days.map(function (dk) {
      var d = res ? res[dk] : null;
      var date = window.WX.dayDate(proj, dk);
      var isToday = date && midnight(date) === today;
      var place = d && d.main ? (d.main.city || d.main.title) : '尚未設定地點';
      var sub, temp = '';
      if (!res) sub = '<span>查詢中…</span>';
      else if (!d || !d.main) sub = '<span>' + (d && d.count ? '景點查不到地點，請用地點搜尋重新加入' : '這天還沒有景點，加入後會顯示天氣') + '</span>';
      else if (d.noForecast) sub = '<span>天氣暫時無法取得</span>';
      else if (d.outOfRange) sub = '<span>尚未開放預報（16 天內才有）</span>';
      else if (d.mainSum) {
        var s = d.mainSum;
        sub = '<span>' + s.icon + ' ' + s.label + ' · 降雨 ' + s.rain + '%</span>';
        temp = '<div>' + s.hi + '° / ' + s.lo + '°</div><div class="lug">' +
          window.WX.luggageOf(s).map(function (r) { return '<span title="' + r.text + '">' + r.icon + '</span>'; }).join('') + '</div>';
      }
      return '<div class="prep-wx-row' + (isToday ? ' today' : '') + '">' +
        '<div class="prep-wx-date">' + (date ? md(date) : '') + '<small>' + (date ? wk(date) : '') + ' · ' + dk + '</small></div>' +
        '<div style="min-width:0"><div class="prep-wx-place">' + esc(place) + '</div><div class="prep-wx-sub">' + sub + '</div></div>' +
        '<div class="prep-wx-temp">' + temp + '</div></div>';
    }).join('');
  }

  var openSet = {};
  function cardHTML(key, item, pinned, canEdit) {
    var isOpen = !!openSet[key];
    var lead = pinned
      ? '<span class="prep-lock" title="固定項目" aria-label="固定項目">🔒</span>'
      : (canEdit ? '<span class="prep-grip" title="拖曳排序" aria-label="拖曳排序">⠿</span>' : '');
    var text = item.body
      ? '<div class="prep-card-text">' + esc(item.body) + '</div>'
      : '<div class="prep-card-text" style="opacity:.5">尚未填寫，點下方「編輯」新增內容</div>';
    var acts = canEdit
      ? '<div class="prep-card-acts"><button class="prep-btn" onclick="openPrepNoteModal(\'' + key + '\')">✏️ 編輯</button>' +
        (pinned ? '' : '<button class="prep-btn danger" onclick="deletePrepNote(\'' + key + '\')">🗑️ 刪除</button>') + '</div>'
      : '';
    return '<div class="prep-card' + (pinned ? ' pinned' : '') + '"' + (pinned ? '' : ' data-note="' + key + '"') + ' data-key="' + key + '">' +
      '<div class="prep-card-head">' + lead + '<div class="prep-card-title">' + esc(item.title) + '</div>' +
      '<span class="prep-chev">' + (isOpen ? '▴' : '▾') + '</span></div>' +
      '<div class="prep-card-detail" style="display:' + (isOpen ? 'block' : 'none') + '">' + text + acts + '</div></div>';
  }

  function legacyHTML(proj) {
    var spots = (proj.itinerary && proj.itinerary.D0 && proj.itinerary.D0.spots) || [];
    if (!spots.length) return '';
    return '<div style="margin-top:14px;font-size:12px;color:var(--sub-text);font-weight:700;padding:0 2px">舊版 D0 景點（僅供參考）</div>' +
      spots.map(function (s) {
        var href = s.mapUrl || ('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.title || ''));
        return '<div class="prep-card"><div class="prep-card-body"><div class="prep-card-title">' + esc(s.title) + '</div>' +
          (s.desc ? '<div class="prep-card-text">' + esc(s.desc) + '</div>' : '') +
          '</div><a href="' + esc(href) + '" target="_blank" rel="noopener" class="prep-act" aria-label="地圖">📍</a></div>';
      }).join('');
  }

  window.renderPrep = function () {
    var box = document.getElementById('prepContainer');
    if (!box) return;
    var proj = window.activeProjectData;
    if (!proj) { box.innerHTML = ''; return; }
    var canEdit = window.canEditContent(proj);
    var pid = window.activeProjectId;

    var cd = proj.startDate
      ? '<div id="prepCountdown">' + countdownInner(proj) + '</div>'
      : '<div class="card" style="padding:12px;font-size:13px;color:var(--sub-text)">請先在專案設定填寫出發日期，就會顯示倒數與天氣。</div>';
    var wx = proj.startDate
      ? '<div class="card prep-sec open"><div class="prep-sec-head" onclick="togglePrepWx()"><span>🌤 旅遊天氣總覽</span>' +
        '<span id="prepWxChev" style="font-size:16px;color:var(--brand-main);transition:transform .25s;display:inline-block;transform:' + (prepWxOpen ? 'rotate(0deg)' : 'rotate(-90deg)') + '">▾</span></div>' +
        '<div id="prepWxBody" style="display:' + (prepWxOpen ? 'block' : 'none') + '">' +
        '<div class="prep-legend"><span>🕶️ 太陽刺眼</span><span>☂️ 記得帶傘</span><span>🧥 注意保暖</span><span>🧴 建議防曬</span></div>' +
        '<div id="prepWxRows">' + wxRowsHTML(proj, null) + '</div></div></div>'
      : '';

    var pin = pinnedOf(proj);
    var notes = notesOf(proj);
    var list = '<div class="prep-list" id="prepList">' +
      cardHTML('pin:passport', pin.passport, true, canEdit) +
      cardHTML('pin:fx', pin.fx, true, canEdit) +
      notes.map(function (e) { return cardHTML(e[0], e[1], false, canEdit); }).join('') +
      '</div>' +
      (canEdit ? '<div class="prep-add"><button onclick="openPrepNoteModal(\'\')" aria-label="新增備註" title="新增備註">+</button></div>' : '');

    box.innerHTML = cd + wx +
      '<div class="card prep-sec open"><div class="prep-sec-head"><span>📋 行前準備清單</span></div>' + list + legacyHTML(proj) + '</div>';
    setVars();

    if (proj.startDate) {
      window.loadTripWeather(proj).then(function (res) {
        if (window.activeProjectId !== pid) return;
        var rows = document.getElementById('prepWxRows');
        if (rows) rows.innerHTML = wxRowsHTML(window.activeProjectData, res);
      });
    }
    bindDrag();
  };

  window.togglePrepWx = function () {
    prepWxOpen = !prepWxOpen;
    var body = document.getElementById('prepWxBody');
    var chev = document.getElementById('prepWxChev');
    if (body) body.style.display = prepWxOpen ? 'block' : 'none';
    if (chev) chev.style.transform = prepWxOpen ? 'rotate(0deg)' : 'rotate(-90deg)';
  };

  window.openPrepNoteModal = function (key) {
    if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限。');
    var proj = window.activeProjectData || {};
    var isPin = !!key && key.indexOf('pin:') === 0;
    var title = '', body = '';
    if (isPin) {
      var p = pinnedOf(proj)[key.slice(4)];
      title = p.title; body = p.body;
      document.getElementById('prepNoteModalTitle').innerText = '✏️ 編輯卡片';
    } else {
      var note = key && proj.prepNotes ? proj.prepNotes[key] : null;
      title = note ? (note.title || '') : '';
      body = note ? (note.body || '') : '';
      document.getElementById('prepNoteModalTitle').innerText = note ? '✏️ 編輯備註' : '📝 新增備註';
    }
    document.getElementById('prepNoteKey').value = key || '';
    document.getElementById('prepNoteTitle').value = title;
    document.getElementById('prepNoteBody').value = body;
    document.getElementById('prepNoteModal').style.display = 'flex';
  };

  window.savePrepNote = function () {
    if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限。');
    if (!(window.dbSet && window.dbRef && window.db)) return alert('系統載入中，請稍後再試。');
    var title = document.getElementById('prepNoteTitle').value.trim();
    var body = document.getElementById('prepNoteBody').value.trim();
    var key = document.getElementById('prepNoteKey').value || '';
    var proj = window.activeProjectData;
    var pid = window.activeProjectId;
    var by = (window.currentUser && window.currentUser.name) || '團員';

    if (key.indexOf('pin:') === 0) {
      var name = key.slice(4);
      var pinNote = { title: title || PIN_DEFAULT[name].title, body: body, by: by, updatedAt: Date.now() };
      return window.dbSet(window.dbRef(window.db, 'projects/' + pid + '/prepPinned/' + name), pinNote)
        .then(function () {
          if (!proj.prepPinned) proj.prepPinned = {};
          proj.prepPinned[name] = pinNote;
          window.closePrepNoteModal();
          window.renderPrep();
        })
        .catch(function (err) { alert('儲存失敗：' + err.message); });
    }

    if (!title && !body) return alert('請輸入標題或內容！');
    var existing = key && proj.prepNotes ? proj.prepNotes[key] : null;
    if (!key) key = genKey();
    var now = Date.now();
    var note = {
      title: title || '（未命名）', body: body, by: by,
      createdAt: existing ? (existing.createdAt || now) : now,
      updatedAt: now
    };
    if (existing && typeof existing.order === 'number') note.order = existing.order;
    return window.dbSet(window.dbRef(window.db, 'projects/' + pid + '/prepNotes/' + key), note)
      .then(function () {
        if (!proj.prepNotes) proj.prepNotes = {};
        proj.prepNotes[key] = note;
        window.closePrepNoteModal();
        window.renderPrep();
      })
      .catch(function (err) { alert('儲存失敗：' + err.message); });
  };

  window.deletePrepNote = function (key) {
    if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限。');
    if (!confirm('確定要刪除這則備註嗎？')) return;
    if (!(window.dbRemove && window.dbRef && window.db)) return alert('系統載入中，請稍後再試。');
    var proj = window.activeProjectData;
    window.dbRemove(window.dbRef(window.db, 'projects/' + window.activeProjectId + '/prepNotes/' + key))
      .then(function () {
        if (proj.prepNotes) delete proj.prepNotes[key];
        window.renderPrep();
      })
      .catch(function (err) { alert('刪除失敗：' + err.message); });
  };

  function bindDrag() {
    var list = document.getElementById('prepList');
    if (!list || list.dataset.bound === '1') return;
    list.dataset.bound = '1';
    list.addEventListener('click', function (e) {
      if (e.target.closest('.prep-grip') || e.target.closest('.prep-card-acts')) return;
      var h = e.target.closest('.prep-card-head');
      if (!h) return;
      var card = h.parentNode;
      var k = card.getAttribute('data-key');
      openSet[k] = !openSet[k];
      card.querySelector('.prep-card-detail').style.display = openSet[k] ? 'block' : 'none';
      h.querySelector('.prep-chev').textContent = openSet[k] ? '▴' : '▾';
    });
    list.addEventListener('pointerdown', function (e) {
      var g = e.target.closest('.prep-grip');
      if (!g || !window.canEditContent(window.activeProjectData)) return;
      var card = g.closest('.prep-card');
      pdrag = { card: card, key: card.getAttribute('data-note'), before: noteOrderDOM(list) };
      card.classList.add('dragging');
      g.setPointerCapture(e.pointerId);
    });
    list.addEventListener('pointermove', function (e) {
      if (!pdrag) return;
      var others = Array.prototype.filter.call(list.querySelectorAll('.prep-card[data-note]'), function (c) { return c !== pdrag.card; });
      var idx = 0;
      others.forEach(function (c) {
        var r = c.getBoundingClientRect();
        if (r.top + r.height / 2 < e.clientY) idx++;
      });
      if (idx < others.length) {
        if (others[idx] !== pdrag.card.nextElementSibling) list.insertBefore(pdrag.card, others[idx]);
      } else if (pdrag.card !== list.lastElementChild) {
        list.appendChild(pdrag.card);
      }
    });
    function end() {
      if (!pdrag) return;
      var d = pdrag;
      pdrag = null;
      d.card.classList.remove('dragging');
      var after = noteOrderDOM(list);
      if (after.join('|') === d.before.join('|')) return;
      var proj = window.activeProjectData;
      var updates = {};
      after.forEach(function (k, i) {
        updates[k + '/order'] = i;
        if (proj.prepNotes && proj.prepNotes[k]) proj.prepNotes[k].order = i;
      });
      if (window.dbUpdate && window.dbRef && window.db) {
        window.dbUpdate(window.dbRef(window.db, 'projects/' + window.activeProjectId + '/prepNotes'), updates)
          .catch(function (err) { alert('排序儲存失敗：' + err.message); });
      }
    }
    list.addEventListener('pointerup', end);
    list.addEventListener('pointercancel', end);
  }
  function noteOrderDOM(list) {
    return Array.prototype.map.call(list.querySelectorAll('.prep-card[data-note]'), function (c) { return c.getAttribute('data-note'); });
  }

  var prevHook = window.onProjectTabChange;
  window.onProjectTabChange = function (tab) {
    if (prevHook) prevHook(tab);
    if (tab === 'prep') window.renderPrep();
    if (window.updateDayWheel) window.updateDayWheel();
  };
})();
