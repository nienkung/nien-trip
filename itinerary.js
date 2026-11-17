// ===== Google Maps 地點自動搜尋（Places API New）=====
let _placesLibPromise = null;
async function ensurePlacesLib() {
  if (!(window.google && window.google.maps && window.google.maps.importLibrary)) return null;
  try {
    if (!_placesLibPromise) _placesLibPromise = window.google.maps.importLibrary('places');
    return await _placesLibPromise;
  } catch (e) {
    console.warn('Google Places 載入失敗：', e);
    return null;
  }
}

async function mountSpotAutocomplete() {
  const container = document.getElementById('spotPlaceContainer');
  const hint = document.getElementById('spotPlaceHint');
  if (!container) return;
  container.innerHTML = '';

  const lib = await ensurePlacesLib();
  if (!lib || !lib.PlaceAutocompleteElement) {
    if (hint) hint.textContent = '（Google 地點搜尋目前無法使用，可直接手動填寫下方欄位）';
    return;
  }
  if (hint) hint.textContent = '🔍 輸入關鍵字選地標，會自動帶入名稱與地圖連結';

  let pac;
  try {
    pac = new lib.PlaceAutocompleteElement();
  } catch (e) {
    if (hint) hint.textContent = '（Google 地點搜尋初始化失敗，可直接手動填寫）';
    console.warn('PlaceAutocompleteElement 建立失敗：', e);
    return;
  }
  pac.style.width = '100%';
  container.appendChild(pac);

  pac.addEventListener('gmp-select', async (event) => {
    try {
      const pred = event.placePrediction;
      if (!pred) return;
      const place = pred.toPlace();
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'googleMapsURI', 'photos', 'location'] });
      if (place.location) window._pendingGeo = { lat: place.location.lat(), lon: place.location.lng() };

      const titleEl = document.getElementById('spotTitleInput');
      const mapEl = document.getElementById('spotMapUrl');
      const thumbEl = document.getElementById('spotThumbUrl');

      if (titleEl) titleEl.value = place.displayName || place.formattedAddress || titleEl.value || '';
      if (mapEl && place.googleMapsURI) mapEl.value = place.googleMapsURI;
      if (thumbEl && !thumbEl.value && place.photos && place.photos.length) {
        try { thumbEl.value = place.photos[0].getURI({ maxWidthPx: 600 }); } catch (e2) {}
      }
      updateSpotThumbPreview();
    } catch (e) {
      console.warn('取得地點資料失敗：', e);
    }
  });
}

// ===== 縮圖：固定 1:1 裁切；位置由使用者在圖片上拖曳決定 =====

function clampPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

window.updateSpotThumbPreview = function() {
  const thumbEl = document.getElementById('spotThumbUrl');
  const prev = document.getElementById('spotThumbPreview');
  const adjust = document.getElementById('spotThumbAdjust');
  if (!thumbEl || !prev) return;

  const url = thumbEl.value.trim();
  const xEl = document.getElementById('spotThumbX');
  const yEl = document.getElementById('spotThumbY');
  prev.style.objectPosition = `${clampPct(xEl ? xEl.value : 50)}% ${clampPct(yEl ? yEl.value : 50)}%`;

  if (url) {
    if (prev.getAttribute('src') !== url) prev.src = url;
    prev.style.display = 'block';
    if (adjust) adjust.style.display = 'block';
  } else {
    prev.removeAttribute('src');
    prev.style.display = 'none';
    if (adjust) adjust.style.display = 'none';
  }
};

// 在縮圖上按住拖曳（滑鼠或手指皆可）：拖到哪，就露出那一部分
(function () {
  let st = null;
  const readPct = (id) => clampPct((document.getElementById(id) || {}).value);
  const setPos = (x, y) => {
    const xEl = document.getElementById('spotThumbX');
    const yEl = document.getElementById('spotThumbY');
    if (xEl) xEl.value = Math.round(x);
    if (yEl) yEl.value = Math.round(y);
    window.updateSpotThumbPreview();
  };

  document.addEventListener('pointerdown', (e) => {
    const box = e.target.closest && e.target.closest('#spotThumbDrag');
    if (!box) return;
    const img = document.getElementById('spotThumbPreview');
    if (!img || !img.naturalWidth) return;
    e.preventDefault();
    try { box.setPointerCapture(e.pointerId); } catch (err) {}
    st = { box, img, pid: e.pointerId, sx: e.clientX, sy: e.clientY, x0: readPct('spotThumbX'), y0: readPct('spotThumbY') };
    box.classList.add('dragging');
  });

  document.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.pid) return;
    const bw = st.box.clientWidth, bh = st.box.clientHeight;
    const nw = st.img.naturalWidth, nh = st.img.naturalHeight;
    const scale = Math.max(bw / nw, bh / nh);
    const overX = nw * scale - bw; // 圖片超出方框的寬度（像素）
    const overY = nh * scale - bh; // 圖片超出方框的高度（像素）
    let x = st.x0, y = st.y0;
    if (overX > 0) x = Math.max(0, Math.min(100, st.x0 - (e.clientX - st.sx) / overX * 100));
    if (overY > 0) y = Math.max(0, Math.min(100, st.y0 - (e.clientY - st.sy) / overY * 100));
    setPos(x, y);
  });

  const endDrag = (e) => {
    if (!st || e.pointerId !== st.pid) return;
    st.box.classList.remove('dragging');
    st = null;
  };
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);
})();

// ===== 行程展開狀態：新增／刪除後保留原本開著的天數 =====

window._itinProjId = null;
window._itinOpen = null;

function itinOpenState() {
  if (window._itinProjId !== window.activeProjectId || !window._itinOpen) {
    window._itinProjId = window.activeProjectId;
    window._itinOpen = { D1: true }; // 切換專案時的預設：只開 D1
  }
  return window._itinOpen;
}

window.toggleItinDay = function(headerEl) {
  const card = headerEl.parentElement;
  card.classList.toggle('open');
  itinOpenState()[card.dataset.day] = card.classList.contains('open');
};

// 全部展開 / 全部收合所有天數
window.setAllItinDays = function(open) {
  const proj = window.activeProjectData || {};
  const daysList = window.getDynamicProjectDays(proj);
  const map = itinOpenState();
  daysList.forEach(d => { map[d] = !!open; });
  window.renderItineraryFromJSON(proj.itinerary || {});
};

function fmtNoteTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// 把說明文字裡的網址轉成可點擊的超連結（先 escape 再處理，避免 XSS）
function linkifyText(text) {
  const escaped = window.escapeHtml(text == null ? '' : String(text));
  return escaped.replace(/(https?:\/\/[^\s]+)/g, (m) => {
    let url = m;
    let trail = '';
    // 去掉網址尾端常見的標點（不屬於網址的部分）
    const tm = url.match(/[)\]}>.,;!?，。、）】！？」』]+$/);
    if (tm) { trail = tm[0]; url = url.slice(0, -trail.length); }
    if (!url) return m;
    return `<a href="${url}" target="_blank" rel="noopener" class="desc-link">${url}</a>${trail}`;
  });
}

// 景點卡片：左側為拖曳手柄（與卡片等高）；右上角為修改／刪除；有縮圖時左圖（1:1）右文字
function spotCardHTML(dayKey, spot, spotIdx, canEdit) {
  const mapHref = spot.mapUrl ? spot.mapUrl : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.title || '')}`;
  const posX = clampPct(spot.thumbX);
  const posY = clampPct(spot.thumbY);
  const hasThumb = !!spot.thumbUrl;
  return `
    <div class="spot-card ${canEdit ? 'can-drag' : ''}">
      ${canEdit ? `<span class="drag-handle" title="按住上下拖曳：調整順序，或拖到其他天">⠿</span>` : ''}
      ${canEdit ? `
      <div class="spot-actions">
        <button class="btn-spot-edit" onclick="openSpotModal('${dayKey}', ${spotIdx})">✏️ 修改</button>
        <button class="btn-spot-del" onclick="deleteSpot('${dayKey}', ${spotIdx})">🗑️ 刪除</button>
      </div>` : ''}
      <div class="spot-body ${hasThumb ? 'has-thumb' : ''}">
        ${hasThumb ? `
        <div class="spot-thumb-wrap">
          <img class="spot-thumb" src="${window.escapeHtml(spot.thumbUrl)}" alt="" style="object-position:${posX}% ${posY}%" onerror="this.style.display='none'">
        </div>` : ''}
        <div class="spot-text">
          ${spot.time ? `<span class="spot-time">⏰ ${window.escapeHtml(spot.time)}</span>` : ''}
          <div class="spot-title">${window.escapeHtml(spot.title)}</div>
          ${spot.desc ? `<div class="spot-desc">${linkifyText(spot.desc)}</div>` : ''}
          <div class="wx-spot-slot" data-day="${dayKey}" data-idx="${spotIdx}"></div>
          <div class="btn-group">
            <a href="${window.escapeHtml(mapHref)}" target="_blank" class="map-btn">📍 地圖導航</a>
          </div>
        </div>
      </div>
    </div>`;
}

function spotListHTML(dayKey, spots, canEdit) {
  return `<div class="spot-list" data-day="${dayKey}">${spots.map((s, i) => spotCardHTML(dayKey, s, i, canEdit)).join('')}</div>`;
}

function prepNotesHTML(notes, canEdit) {
  const list = Object.entries(notes || {})
    .filter(([, n]) => n && typeof n === 'object')
    .sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));

  const cards = list.map(([key, n]) => `
    <div class="prep-note ${canEdit ? 'can-edit' : ''}">
      ${canEdit ? `
      <div class="spot-actions">
        <button class="btn-spot-edit" onclick="openPrepNoteModal('${key}')">✏️ 修改</button>
        <button class="btn-spot-del" onclick="deletePrepNote('${key}')">🗑️ 刪除</button>
      </div>` : ''}
      <div class="prep-note-title">${window.escapeHtml(n.title || '（未命名）')}</div>
      ${n.body ? `<div class="prep-note-body">${linkifyText(n.body)}</div>` : ''}
      <div class="prep-note-meta">✍️ ${window.escapeHtml(n.by || '團員')} · ${fmtNoteTime(n.updatedAt || n.createdAt)}</div>
    </div>`).join('');

  const empty = `<div style="font-size:13px; color:var(--sub-text); text-align:center; padding:12px;">${canEdit ? '還沒有備註，點上方按鈕新增（護照、機票、保險、住宿、要帶的東西⋯⋯都可以）。' : '團員新增備註後會顯示於此。'}</div>`;

  const addBtn = canEdit ? `
    <div style="display:flex; justify-content:flex-end; margin-bottom:10px;">
      <button class="btn-spot-edit" style="padding:6px 12px; font-size:12px; background:var(--brand-main); color:#fff;" onclick="openPrepNoteModal('')">➕ 新增備註</button>
    </div>` : '';

  return addBtn + (cards || empty);
}

// ===== 行程渲染 =====

window.renderItineraryFromJSON = function(data) {
  const container = document.getElementById('itineraryContainer');
  if (!container) return;

  const proj = window.activeProjectData || {};
  const sameProject = window._itinProjId === window.activeProjectId;
  const scrollY = window.scrollY;

  const daysList = window.getDynamicProjectDays(proj).filter(d => d !== 'D0');
  const canEdit = window.canEditContent(proj);
  const openMap = itinOpenState();
  let html = '';

  daysList.forEach((dayKey) => {
    const isPrep = dayKey === 'D0';
    const day = (data && data[dayKey]) ? data[dayKey] : { title: `Day ${dayKey.replace('D', '')}`, spots: [] };
    const spots = day.spots || [];
    const title = isPrep ? 'D0（行前注意備忘錄）' : (day.title || dayKey);
    const subtitle = isPrep
      ? `共 ${Object.keys(proj.prepNotes || {}).length} 則備註${spots.length ? `・${spots.length} 個舊景點` : ''}`
      : `共 ${spots.length} 個景點/事項`;

    let body = '';
    if (isPrep) {
      body += prepNotesHTML(proj.prepNotes, canEdit);
      if (spots.length) body += spotListHTML(dayKey, spots, canEdit);
    } else {
      body += cityEditorHTML(dayKey, day.cities || [], canEdit);
      if (canEdit) {
        body += `
          <div style="display:flex; justify-content:flex-end; margin-bottom:10px;">
            <button class="btn-spot-edit" style="padding:6px 12px; font-size:12px; background:var(--brand-main); color:#fff;" onclick="openSpotModal('${dayKey}', -1)">➕ 新增景點</button>
          </div>`;
      }
      body += spots.length > 0
        ? spotListHTML(dayKey, spots, canEdit)
        : `<div style="font-size:13px; color:var(--sub-text); text-align:center; padding:12px;">尚無景點，${canEdit ? '點擊上方按鈕新增！' : '團員新增後會顯示於此。'}</div>`;
    }

    html += `
      <div class="card ${openMap[dayKey] ? 'open' : ''}" data-day="${dayKey}">
        <div class="card-header" onclick="toggleItinDay(this)">
          <div>
            <div class="card-title">${window.escapeHtml(title)}</div>
            <div class="card-subtitle">${subtitle}</div>
            ${isPrep ? '' : themeBlockHTML(dayKey, day.theme, canEdit) + (timeOrderBroken(spots) ? '<div><span class="order-warn">⚠ 景點時間與順序不一致，請確認</span></div>' : '')}
          <div class="wx-day-slot" data-day="${dayKey}"></div>
          </div>
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke-width="2.5"><path d="M19 9l-7 7-7-7"/></svg>
        </div>
        <div class="card-content">${body}</div>
      </div>`;
  });

  container.innerHTML = html;
  if (window.hydrateItineraryWeather) window.hydrateItineraryWeather();
  if (window.renderPrep) window.renderPrep();
  if (window.updateDayWheel) window.updateDayWheel();
  // 同一個專案內的操作（新增／刪除／修改／排序）保留捲動位置
  if (sameProject) window.scrollTo(0, scrollY);
};

// ===== 景點拖曳排序：註冊到共用模組 drag-sort.js =====
if (window.DragSort) {
  window.DragSort.register({
    containerId: 'itineraryContainer',
    itemSel: '.spot-card',
    listSel: '.spot-list',
    skipDay: (dayKey) => dayKey === 'D0',
    countItems: (dayKey) => {
      const it = (window.activeProjectData && window.activeProjectData.itinerary) || {};
      return (it[dayKey] && it[dayKey].spots) ? it[dayKey].spots.length : 0;
    },
    canDrag: () => window.canEditContent(window.activeProjectData),
    onMove: (fromDay, from, toDay, to) => moveSpotTo(fromDay, from, toDay, to)
  });
}

// 把景點從 fromDay 的 from 位置移到 toDay 的 to 位置（同一天或不同天皆可）
function moveSpotTo(fromDay, from, toDay, to) {
  if (!window.canEditContent(window.activeProjectData)) return;
  const proj = window.activeProjectData;
  const it = proj.itinerary || (proj.itinerary = {});

  const src = it[fromDay] && it[fromDay].spots;
  if (!src || from < 0 || from >= src.length) return;

  if (!it[toDay]) it[toDay] = { title: toDay, spots: [] };
  if (!it[toDay].spots) it[toDay].spots = [];

  const [item] = src.splice(from, 1);
  const dst = it[toDay].spots;
  dst.splice(Math.max(0, Math.min(to, dst.length)), 0, item);

  // 放入的那一天自動展開，讓使用者看到結果
  itinOpenState()[toDay] = true;
  window.renderItineraryFromJSON(it);

  if (window.dbSet && window.dbRef && window.db) {
    window.dbSet(window.dbRef(window.db, `projects/${window.activeProjectId}/itinerary`), it)
      .catch(err => alert('排序儲存失敗：' + err.message));
  }
}

// ===== 景點新增 / 編輯彈窗 =====

window.openSpotModal = function(dayKey, index = -1) {
  window._pendingGeo = null;
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限（僅團員、團主或管理員可編輯行程）。');

  const proj = window.activeProjectData || {};
  // 天數下拉：排除 D0（行前備忘錄不放景點）
  const days = window.getDynamicProjectDays(proj).filter(d => d !== 'D0');
  const daySelect = document.getElementById('spotDayKey');
  if (daySelect) {
    daySelect.innerHTML = days.map(d => {
      const t = (proj.itinerary && proj.itinerary[d] && proj.itinerary[d].title) ? proj.itinerary[d].title : d;
      return `<option value="${d}">${window.escapeHtml(t)}</option>`;
    }).join('');
    let selDay = dayKey;
    if (!selDay || !days.includes(selDay)) selDay = days[0] || 'D1';
    daySelect.value = selDay;
    // 編輯既有景點時鎖定天數（避免索引錯位，要搬移可用拖曳）；新增可自由選天
    daySelect.disabled = index >= 0;
  }
  dayKey = daySelect ? daySelect.value : dayKey;

  document.getElementById('spotEditIndex').value = index;

  const modalTitle = document.getElementById('spotModalTitle');
  const timeInput = document.getElementById('spotTimeInput');
  const titleInput = document.getElementById('spotTitleInput');
  const mapInput = document.getElementById('spotMapUrl');
  const thumbInput = document.getElementById('spotThumbUrl');
  const descInput = document.getElementById('spotDescInput');
  const xInput = document.getElementById('spotThumbX');
  const yInput = document.getElementById('spotThumbY');

  const spot = index >= 0 ? ((proj.itinerary && proj.itinerary[dayKey] && proj.itinerary[dayKey].spots[index]) || {}) : null;
  modalTitle.innerText = spot ? '✏️ 編輯行程景點' : '📍 新增行程景點';
  timeInput.value = spot ? (spot.time || '') : '';
  titleInput.value = spot ? (spot.title || '') : '';
  mapInput.value = spot ? (spot.mapUrl || '') : '';
  thumbInput.value = spot ? (spot.thumbUrl || '') : '';
  descInput.value = spot ? (spot.desc || '') : '';
  xInput.value = clampPct(spot ? spot.thumbX : 50);
  yInput.value = clampPct(spot ? spot.thumbY : 50);

  window.updateSpotThumbPreview();

  const modal = document.getElementById('spotModal');
  if (modal) modal.style.display = 'flex';

  // 掛載 Google 地點自動搜尋（非同步，失敗不影響手動填寫）
  mountSpotAutocomplete();
};

window.closeSpotModal = function() {
  const modal = document.getElementById('spotModal');
  if (modal) modal.style.display = 'none';
  const container = document.getElementById('spotPlaceContainer');
  if (container) container.innerHTML = '';
};

window.saveSpotFromModal = function() {
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限。');
  const dayKey = document.getElementById('spotDayKey').value;
  const index = parseInt(document.getElementById('spotEditIndex').value, 10);

  const time = document.getElementById('spotTimeInput').value.trim();
  const title = document.getElementById('spotTitleInput').value.trim();
  const mapUrl = document.getElementById('spotMapUrl').value.trim();
  const thumbUrl = document.getElementById('spotThumbUrl').value.trim();
  const desc = document.getElementById('spotDescInput').value.trim();

  if (!title) return alert('請輸入地點 / 景點名稱！');

  if (!window.activeProjectData.itinerary) window.activeProjectData.itinerary = {};
  if (!window.activeProjectData.itinerary[dayKey]) {
    window.activeProjectData.itinerary[dayKey] = { title: dayKey, spots: [] };
  }
  if (!window.activeProjectData.itinerary[dayKey].spots) {
    window.activeProjectData.itinerary[dayKey].spots = [];
  }

  const spotData = { time, title, mapUrl, thumbUrl, desc };
  const prevSpot = (index >= 0 && window.activeProjectData.itinerary[dayKey] && window.activeProjectData.itinerary[dayKey].spots[index]) || null;
  if (window._pendingGeo) {
    spotData.lat = window._pendingGeo.lat;
    spotData.lon = window._pendingGeo.lon;
  } else if (prevSpot && prevSpot.title === title && typeof prevSpot.lat === 'number') {
    spotData.lat = prevSpot.lat;
    spotData.lon = prevSpot.lon;
  }
  window._pendingGeo = null;
  if (thumbUrl) {
    spotData.thumbX = clampPct(document.getElementById('spotThumbX').value);
    spotData.thumbY = clampPct(document.getElementById('spotThumbY').value);
  }

  const spotList = window.activeProjectData.itinerary[dayKey].spots;
  const timeChanged = index >= 0 && normTime(prevSpot && prevSpot.time) !== normTime(time);
  if (index >= 0 && !timeChanged) {
    spotList[index] = spotData;
  } else {
    if (index >= 0) spotList.splice(index, 1);
    insertSpotByTime(spotList, spotData);
  }

  if (window.dbSet && window.dbRef && window.db) {
    const targetRef = window.dbRef(window.db, `projects/${window.activeProjectId}/itinerary`);
    window.dbSet(targetRef, window.activeProjectData.itinerary)
      .then(() => {
        itinOpenState()[dayKey] = true; // 展開該天，讓剛新增/修改的景點看得到
        window.closeSpotModal();
        window.renderItineraryFromJSON(window.activeProjectData.itinerary);
      })
      .catch(err => alert('儲存失敗：' + err.message));
  }
};

window.deleteSpot = function(dayKey, index) {
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限。');
  if (!confirm('確定要刪除這個景點嗎？')) return;

  if (window.activeProjectData.itinerary && window.activeProjectData.itinerary[dayKey] && window.activeProjectData.itinerary[dayKey].spots) {
    window.activeProjectData.itinerary[dayKey].spots.splice(index, 1);

    if (window.dbSet && window.dbRef && window.db) {
      const targetRef = window.dbRef(window.db, `projects/${window.activeProjectId}/itinerary`);
      window.dbSet(targetRef, window.activeProjectData.itinerary)
        .then(() => {
          window.renderItineraryFromJSON(window.activeProjectData.itinerary);
        })
        .catch(err => alert('刪除失敗：' + err.message));
    }
  }
};

// ===== 行前注意備忘錄（D0）：自由新增／編輯／刪除備註卡片 =====
// 資料位置：projects/{id}/prepNotes/{key} = { title, body, by, createdAt, updatedAt }

function genNoteKey() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

window.openPrepNoteModal = function(key) {
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限。');
  const notes = (window.activeProjectData && window.activeProjectData.prepNotes) || {};
  const note = key && notes[key] ? notes[key] : null;

  document.getElementById('prepNoteKey').value = note ? key : '';
  document.getElementById('prepNoteModalTitle').innerText = note ? '✏️ 編輯備註' : '📝 新增備註';
  document.getElementById('prepNoteTitle').value = note ? (note.title || '') : '';
  document.getElementById('prepNoteBody').value = note ? (note.body || '') : '';
  document.getElementById('prepNoteModal').style.display = 'flex';
};

window.closePrepNoteModal = function() {
  const modal = document.getElementById('prepNoteModal');
  if (modal) modal.style.display = 'none';
};

window.savePrepNote = function() {
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限。');
  if (!(window.dbSet && window.dbRef && window.db)) return alert('系統載入中，請稍後再試。');

  const title = document.getElementById('prepNoteTitle').value.trim();
  const body = document.getElementById('prepNoteBody').value.trim();
  if (!title && !body) return alert('請輸入標題或內容！');

  const proj = window.activeProjectData;
  let key = document.getElementById('prepNoteKey').value;
  const existing = key && proj.prepNotes ? proj.prepNotes[key] : null;
  if (!key) key = genNoteKey();

  const now = Date.now();
  const note = {
    title: title || '（未命名）',
    body: body,
    by: (window.currentUser && window.currentUser.name) || '團員',
    createdAt: existing ? (existing.createdAt || now) : now,
    updatedAt: now
  };

  window.dbSet(window.dbRef(window.db, `projects/${window.activeProjectId}/prepNotes/${key}`), note)
    .then(() => {
      if (!proj.prepNotes) proj.prepNotes = {};
      proj.prepNotes[key] = note;
      window.closePrepNoteModal();
      window.renderItineraryFromJSON(proj.itinerary);
    })
    .catch(err => alert('儲存失敗：' + err.message));
};

window.deletePrepNote = function(key) {
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限。');
  if (!confirm('確定要刪除這則備註嗎？')) return;
  if (!(window.dbRemove && window.dbRef && window.db)) return alert('系統載入中，請稍後再試。');

  const proj = window.activeProjectData;
  window.dbRemove(window.dbRef(window.db, `projects/${window.activeProjectId}/prepNotes/${key}`))
    .then(() => {
      if (proj.prepNotes) delete proj.prepNotes[key];
      window.renderItineraryFromJSON(proj.itinerary);
    })
    .catch(err => alert('刪除失敗：' + err.message));
};

window.switchProjectTab = function(tabName) {
  window._currentTab = tabName;
  if (window.saveViewState) window.saveViewState();
  document.querySelectorAll('#view-project .tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-subcontent').forEach(sub => sub.classList.remove('active'));

  const activeBtn = Array.from(document.querySelectorAll('#view-project .tab-btn')).find(b => b.getAttribute('onclick')?.includes(tabName));
  if (activeBtn) activeBtn.classList.add('active');

  const targetSub = document.getElementById('subtab-' + tabName);
  if (targetSub) targetSub.classList.add('active');

  window.updateProjectFabs();
  if (window.onProjectTabChange) window.onProjectTabChange(tabName);
};

// 依目前分頁與編輯權限，顯示對應的懸浮動作鈕（記帳 / 景點），同一時間只會有一個
window.updateProjectFabs = function() {
  const tab = window._currentTab || 'itinerary';
  const inProject = window._currentView === 'project'; // 離開專案頁（大廳／登入）一律隱藏
  const canEdit = window.activeProjectData && window.canEditContent(window.activeProjectData);
  const showExp = inProject && tab === 'expense' && canEdit;
  const showSpot = inProject && tab === 'itinerary' && canEdit;
  const expFab = document.getElementById('addExpenseFab');
  const spotFab = document.getElementById('addSpotFab');
  if (expFab) expFab.style.display = showExp ? 'flex' : 'none';
  if (spotFab) spotFab.style.display = showSpot ? 'flex' : 'none';
  document.body.classList.toggle('has-fab', !!(showExp || showSpot));
};


// ===== 時間排序、每日主軸、每日主要城市 =====
(function () {
  const st = document.createElement('style');
  st.textContent =
    '.day-theme-input{display:block;width:100%;max-width:360px;margin-top:6px;padding:4px 8px;font-size:13px;border:1px dashed var(--brand-border);border-radius:8px;background:#fff;color:var(--brand-dark)}' +
    '.city-editor{margin-bottom:12px;padding:10px;border:1px solid var(--brand-border);border-radius:12px;background:#fff}' +
    '.city-editor-title{font-size:12px;font-weight:800;color:var(--brand-main);margin-bottom:8px}' +
    '.city-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}' +
    '.city-chip{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;background:var(--brand-light);border:1px solid var(--brand-border);font-size:13px;font-weight:700;color:var(--brand-dark)}' +
    '.city-chip button{background:none;border:none;color:var(--brand-main);cursor:pointer;font-size:14px;padding:0 0 0 2px}' +
    '.city-add{padding:4px 12px;border-radius:999px;border:1px dashed var(--brand-main);background:transparent;color:var(--brand-main);font-size:13px;font-weight:700;cursor:pointer}' +
    '.order-warn{display:inline-block;margin-top:6px;font-size:11px;font-weight:700;color:#9a6700;background:#fff4d6;border:1px solid #f1d28a;border-radius:999px;padding:2px 8px}';
  document.head.appendChild(st);
})();

function normTime(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
  return m ? m[1].padStart(2, '0') + ':' + m[2] : '';
}

// 有時間的景點若出現在較早時間的景點之前，回傳 true（只提示，不阻擋）
function timeOrderBroken(spots) {
  let max = '';
  for (const s of spots || []) {
    const t = normTime(s.time);
    if (!t) continue;
    if (max && t < max) return true;
    if (t > max) max = t;
  }
  return false;
}

// 新景點依時間插入到第一個時間更晚的景點前面；沒有時間的放最後
function insertSpotByTime(list, item) {
  const t = normTime(item.time);
  if (t) {
    const idx = list.findIndex(s => { const st = normTime(s.time); return st && st > t; });
    if (idx >= 0) { list.splice(idx, 0, item); return; }
  }
  list.push(item);
}

// 主軸：淡色細框，點擊開編輯視窗
function themeBlockHTML(dayKey, theme, canEdit) {
  if (!canEdit && !theme) return '';
  const attr = canEdit ? `onclick="event.stopPropagation(); openThemeModal('${dayKey}')"` : '';
  const text = theme ? `<span>${window.escapeHtml(theme)}</span>` : '<span class="day-theme-blank">點擊設定當日主軸</span>';
  return `<div class="day-theme-box" ${attr}>${text}</div>`;
}

// 城市：淡色細框，點擊開城市編輯視窗
function cityEditorHTML(dayKey, cities, canEdit) {
  const list = cities || [];
  const chips = list.map(c => `<span class="city-chip">📍${window.escapeHtml(c.name)}</span>`).join('');
  const blank = list.length ? '' : `<span class="city-blank">${canEdit ? '點擊新增主要城市（最多 3 個，天氣依此查詢）' : '團員尚未設定城市'}</span>`;
  const attr = canEdit ? `onclick="openCityModal('${dayKey}')"` : '';
  return `<div class="city-editor" ${attr}><div class="city-editor-title">📍 今天主要會待的城市</div><div class="city-chips">${chips}${blank}</div></div>`;
}

window.openThemeModal = function (dayKey) {
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限。');
  window._themeDay = dayKey;
  const it = window.activeProjectData.itinerary || {};
  document.getElementById('themeModalInput').value = (it[dayKey] && it[dayKey].theme) || '';
  document.getElementById('themeModal').style.display = 'flex';
  setTimeout(() => { const el = document.getElementById('themeModalInput'); if (el) el.focus(); }, 50);
};

window.closeThemeModal = function () {
  const m = document.getElementById('themeModal');
  if (m) m.style.display = 'none';
};

window.saveThemeFromModal = function () {
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限。');
  const dayKey = window._themeDay;
  const it = window.activeProjectData.itinerary || (window.activeProjectData.itinerary = {});
  if (!it[dayKey]) it[dayKey] = { title: dayKey, spots: [] };
  it[dayKey].theme = document.getElementById('themeModalInput').value.trim().slice(0, 40);
  closeThemeModal();
  persistItinerary(dayKey);
};

function persistItinerary(dayKey) {
  const proj = window.activeProjectData;
  if (!proj) return;
  itinOpenState()[dayKey] = true;
  if (window.dbSet && window.dbRef && window.db) {
    window.dbSet(window.dbRef(window.db, `projects/${window.activeProjectId}/itinerary`), proj.itinerary)
      .then(() => {
        window.renderItineraryFromJSON(proj.itinerary);
        const modal = document.getElementById('cityModal');
        if (window._cityDay === dayKey && modal && modal.style.display === 'flex') renderCityList(dayKey);
      })
      .catch(err => alert('儲存失敗：' + err.message));
  }
}

window.openCityModal = function (dayKey) {
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限。');
  window._cityDay = dayKey;
  document.getElementById('cityModal').style.display = 'flex';
  renderCityList(dayKey);
  mountCityAutocomplete();
};

// 城市編輯視窗內：列出已選城市（可移除），滿 3 個就隱藏搜尋
function renderCityList(dayKey) {
  const box = document.getElementById('cityListBox');
  const addGroup = document.getElementById('cityAddGroup');
  if (!box) return;
  const day = ((window.activeProjectData || {}).itinerary || {})[dayKey] || {};
  const list = day.cities || [];
  box.innerHTML = list.length
    ? `<div class="city-chips">${list.map((c, i) => `<span class="city-chip">📍${window.escapeHtml(c.name)}<button onclick="removeDayCity('${dayKey}', ${i})" aria-label="移除">✕</button></span>`).join('')}</div>`
    : '<p style="font-size:12px; color:var(--sub-text); margin:0 0 8px;">還沒有城市，請用下方搜尋加入</p>';
  if (addGroup) addGroup.style.display = list.length >= 3 ? 'none' : '';
}

window.closeCityModal = function () {
  const m = document.getElementById('cityModal');
  if (m) m.style.display = 'none';
};

async function mountCityAutocomplete() {
  const container = document.getElementById('cityPlaceContainer');
  const hint = document.getElementById('cityPlaceHint');
  if (!container) return;
  container.innerHTML = '';
  if (hint) hint.textContent = '';
  const lib = await ensurePlacesLib();
  if (!lib || !lib.PlaceAutocompleteElement) {
    if (hint) hint.textContent = '（Google 地點搜尋目前無法使用）';
    return;
  }
  let pac;
  try { pac = new lib.PlaceAutocompleteElement(); } catch (e) {
    if (hint) hint.textContent = '（Google 地點搜尋初始化失敗）';
    return;
  }
  pac.style.width = '100%';
  container.appendChild(pac);
  pac.addEventListener('gmp-select', async (event) => {
    try {
      const pred = event.placePrediction;
      if (!pred) return;
      const place = pred.toPlace();
      await place.fetchFields({ fields: ['displayName', 'location', 'formattedAddress'] });
      if (!place.location) { if (hint) hint.textContent = '這個結果沒有座標，請換一個'; return; }
      addDayCity(window._cityDay, {
        name: place.displayName || place.formattedAddress || '',
        lat: place.location.lat(),
        lon: place.location.lng()
      });
    } catch (e) { console.warn('城市取得失敗：', e); }
  });
}

function addDayCity(dayKey, city) {
  const proj = window.activeProjectData;
  if (!proj || !city.name) return;
  const it = proj.itinerary || (proj.itinerary = {});
  if (!it[dayKey]) it[dayKey] = { title: dayKey, spots: [] };
  const list = it[dayKey].cities || (it[dayKey].cities = []);
  if (list.length >= 3) return alert('每天最多 3 個城市');
  if (list.some(c => c.name === city.name)) return alert('這個城市已加入');
  list.push(city);
  persistItinerary(dayKey);
}

window.removeDayCity = function (dayKey, i) {
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限。');
  if (!confirm('確定要移除這個城市嗎？')) return;
  const list = window.activeProjectData.itinerary[dayKey].cities || [];
  list.splice(i, 1);
  persistItinerary(dayKey);
};

(function () {
  const st = document.createElement('style');
  st.textContent =
    '.day-theme-box{margin-top:8px;padding:8px 12px;max-width:360px;border-radius:10px;background:var(--brand-light);border:1.5px solid var(--brand-border);font-size:14px;font-weight:800;color:var(--brand-dark);display:flex;justify-content:space-between;align-items:center;gap:8px}' +
    '.day-theme-empty{margin-top:8px;padding:6px 12px;border-radius:10px;border:1px dashed var(--brand-border);background:transparent;color:var(--brand-main);font-size:12px;font-weight:700;cursor:pointer}' +
    '.mini-edit{background:none;border:none;color:var(--brand-main);cursor:pointer;font-size:12px;font-weight:700;padding:2px 6px;white-space:nowrap}' +
    '.city-editor{border:1.5px solid var(--brand-border)}' +
    '.city-editor-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}';
  document.head.appendChild(st);
})();

(function () {
  const st = document.createElement('style');
  st.textContent =
    '.day-theme-box{margin-top:8px;padding:6px 12px;max-width:360px;border-radius:10px;border:1px solid var(--brand-border);background:transparent;font-size:14px;font-weight:600;color:var(--brand-dark);cursor:pointer}' +
    '.day-theme-blank{font-size:12px;font-weight:500;color:var(--sub-text)}' +
    '.city-editor{margin-bottom:12px;padding:8px 10px;border:1px solid var(--brand-border);border-radius:12px;background:transparent;cursor:pointer}' +
    '.city-editor-title{font-size:11px;font-weight:600;color:var(--sub-text);margin-bottom:6px}' +
    '.city-blank{font-size:12px;color:var(--sub-text)}';
  document.head.appendChild(st);
})();
