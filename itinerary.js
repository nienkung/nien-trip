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
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'googleMapsURI', 'photos'] });

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

window.updateSpotThumbPreview = function() {
  const thumbEl = document.getElementById('spotThumbUrl');
  const prev = document.getElementById('spotThumbPreview');
  if (!thumbEl || !prev) return;
  const url = thumbEl.value.trim();
  if (url) {
    prev.src = url;
    prev.style.display = 'block';
  } else {
    prev.style.display = 'none';
  }
};

// ===== 行程渲染 =====

window.renderItineraryFromJSON = function(data) {
  const container = document.getElementById('itineraryContainer');
  if (!container) return;

  const daysList = window.getDynamicProjectDays(window.activeProjectData);
  const canEdit = window.canEditContent(window.activeProjectData);
  let html = '';

  daysList.forEach((dayKey, idx) => {
    const day = (data && data[dayKey]) ? data[dayKey] : { title: dayKey === 'D0' ? 'D0 (行前準備)' : `Day ${dayKey.replace('D','')}`, spots: [] };
    const spots = day.spots || [];

    html += `
      <div class="card ${idx === 1 || dayKey === 'D1' ? 'open' : ''}">
        <div class="card-header" onclick="this.parentElement.classList.toggle('open')">
          <div>
            <div class="card-title">${window.escapeHtml(day.title || dayKey)}</div>
            <div class="card-subtitle">共 ${spots.length} 個景點/事項</div>
          </div>
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke-width="2.5"><path d="M19 9l-7 7-7-7"/></svg>
        </div>
        <div class="card-content">
          ${canEdit ? `
          <div style="display:flex; justify-content:flex-end; margin-bottom:10px;">
            <button class="btn-spot-edit" style="padding:6px 12px; font-size:12px; background:var(--brand-main); color:#fff;" onclick="openSpotModal('${dayKey}', -1)">➕ 新增景點</button>
          </div>` : ''}

          ${spots.length > 0 ? spots.map((spot, spotIdx) => {
            const mapHref = spot.mapUrl ? spot.mapUrl : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.title || '')}`;
            return `
            <div class="spot-card">
              ${canEdit ? `
              <div class="spot-actions">
                <button class="btn-spot-edit" onclick="openSpotModal('${dayKey}', ${spotIdx})">✏️ 修改</button>
                <button class="btn-spot-del" onclick="deleteSpot('${dayKey}', ${spotIdx})">🗑️ 刪除</button>
              </div>` : ''}
              ${spot.thumbUrl ? `<img class="spot-thumb" src="${window.escapeHtml(spot.thumbUrl)}" alt="" onerror="this.style.display='none'">` : ''}
              ${spot.time ? `<span class="spot-time">⏰ ${window.escapeHtml(spot.time)}</span>` : ''}
              <div class="spot-title">${window.escapeHtml(spot.title)}</div>
              ${spot.desc ? `<div class="spot-desc">${window.escapeHtml(spot.desc)}</div>` : ''}
              <div class="btn-group">
                <a href="${window.escapeHtml(mapHref)}" target="_blank" class="map-btn">📍 地圖導航</a>
              </div>
            </div>
          `;
          }).join('') : '<div style="font-size:13px; color:var(--sub-text); text-align:center; padding:12px;">尚無景點，' + (canEdit ? '點擊上方按鈕新增！' : '團員新增後會顯示於此。') + '</div>'}
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
};

// ===== 景點新增 / 編輯彈窗 =====

window.openSpotModal = function(dayKey, index = -1) {
  if (!window.canEditContent(window.activeProjectData)) return alert('你沒有編輯權限（僅團員、團主或管理員可編輯行程）。');

  document.getElementById('spotDayKey').value = dayKey;
  document.getElementById('spotEditIndex').value = index;

  const modalTitle = document.getElementById('spotModalTitle');
  const timeInput = document.getElementById('spotTimeInput');
  const titleInput = document.getElementById('spotTitleInput');
  const mapInput = document.getElementById('spotMapUrl');
  const thumbInput = document.getElementById('spotThumbUrl');
  const descInput = document.getElementById('spotDescInput');

  if (index >= 0) {
    modalTitle.innerText = "✏️ 編輯行程景點";
    const currentSpot = window.activeProjectData.itinerary[dayKey].spots[index];
    timeInput.value = currentSpot.time || '';
    titleInput.value = currentSpot.title || '';
    mapInput.value = currentSpot.mapUrl || '';
    thumbInput.value = currentSpot.thumbUrl || '';
    descInput.value = currentSpot.desc || '';
  } else {
    modalTitle.innerText = "📍 新增行程景點";
    timeInput.value = '';
    titleInput.value = '';
    mapInput.value = '';
    thumbInput.value = '';
    descInput.value = '';
  }

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

  if (index >= 0) {
    window.activeProjectData.itinerary[dayKey].spots[index] = spotData;
  } else {
    window.activeProjectData.itinerary[dayKey].spots.push(spotData);
  }

  if (window.dbSet && window.dbRef && window.db) {
    const targetRef = window.dbRef(window.db, `projects/${window.activeProjectId}/itinerary`);
    window.dbSet(targetRef, window.activeProjectData.itinerary)
      .then(() => {
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

window.switchProjectTab = function(tabName) {
  document.querySelectorAll('#view-project .tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-subcontent').forEach(sub => sub.classList.remove('active'));

  const activeBtn = Array.from(document.querySelectorAll('#view-project .tab-btn')).find(b => b.getAttribute('onclick')?.includes(tabName));
  if (activeBtn) activeBtn.classList.add('active');

  const targetSub = document.getElementById('subtab-' + tabName);
  if (targetSub) targetSub.classList.add('active');
};
