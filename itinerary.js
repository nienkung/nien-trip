// 渲染行程列表 (含手動新增/修改/刪除按鈕與權限判斷)
window.renderItineraryFromJSON = function(data) {
  const container = document.getElementById('itineraryContainer');
  if (!container) return;

  const daysList = window.getDynamicProjectDays(window.activeProjectData);
  const canEdit = window.isProjectOwner(window.activeProjectData);
  let html = '';

  daysList.forEach((dayKey, idx) => {
    const day = (data && data[dayKey]) ? data[dayKey] : { title: dayKey === 'D0' ? 'D0 (行前準備)' : `Day ${dayKey.replace('D','')}`, spots: [] };
    const spots = day.spots || [];

    html += `
      <div class="card ${idx === 1 || dayKey === 'D1' ? 'open' : ''}">
        <div class="card-header" onclick="this.parentElement.classList.toggle('open')">
          <div>
            <div class="card-title">${day.title || dayKey}</div>
            <div class="card-subtitle">共 ${spots.length} 個景點/事項</div>
          </div>
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke-width="2.5"><path d="M19 9l-7 7-7-7"/></svg>
        </div>
        <div class="card-content">
          <div style="display:flex; justify-content:flex-end; margin-bottom:10px;">
            <button class="btn-spot-edit" style="padding:6px 12px; font-size:12px; background:var(--brand-main); color:#fff;" onclick="openSpotModal('${dayKey}', -1)">➕ 新增景點</button>
          </div>

          ${spots.length > 0 ? spots.map((spot, spotIdx) => `
            <div class="spot-card">
              <div class="spot-actions">
                <button class="btn-spot-edit" onclick="openSpotModal('${dayKey}', ${spotIdx})">✏️ 修改</button>
                <button class="btn-spot-del" onclick="deleteSpot('${dayKey}', ${spotIdx})">🗑️ 刪除</button>
              </div>
              ${spot.time ? `<span class="spot-time">⏰ ${spot.time}</span>` : ''}
              <div class="spot-title">${spot.title}</div>
              ${spot.desc ? `<div class="spot-desc">${spot.desc}</div>` : ''}
              <div class="btn-group">
                <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.title)}" target="_blank" class="map-btn">📍 地圖導航</a>
              </div>
            </div>
          `).join('') : '<div style="font-size:13px; color:var(--sub-text); text-align:center; padding:12px;">尚無景點，點擊上方按鈕新增！</div>'}
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
};

// 打開景點新增/編輯 Modal
window.openSpotModal = function(dayKey, index = -1) {
  document.getElementById('spotDayKey').value = dayKey;
  document.getElementById('spotEditIndex').value = index;

  const modalTitle = document.getElementById('spotModalTitle');
  const timeInput = document.getElementById('spotTimeInput');
  const titleInput = document.getElementById('spotTitleInput');
  const descInput = document.getElementById('spotDescInput');

  if (index >= 0) {
    modalTitle.innerText = "✏️ 編輯行程景點";
    const currentSpot = window.activeProjectData.itinerary[dayKey].spots[index];
    timeInput.value = currentSpot.time || '';
    titleInput.value = currentSpot.title || '';
    descInput.value = currentSpot.desc || '';
  } else {
    modalTitle.innerText = "📍 新增行程景點";
    timeInput.value = '';
    titleInput.value = '';
    descInput.value = '';
  }

  const modal = document.getElementById('spotModal');
  if (modal) modal.style.display = 'flex';
};

window.closeSpotModal = function() {
  const modal = document.getElementById('spotModal');
  if (modal) modal.style.display = 'none';
};

// 儲存景點（新增或修改）並同步至 Firebase
window.saveSpotFromModal = function() {
  const dayKey = document.getElementById('spotDayKey').value;
  const index = parseInt(document.getElementById('spotEditIndex').value, 10);

  const time = document.getElementById('spotTimeInput').value.trim();
  const title = document.getElementById('spotTitleInput').value.trim();
  const desc = document.getElementById('spotDescInput').value.trim();

  if (!title) return alert('請輸入景點/活動名稱！');

  if (!window.activeProjectData.itinerary) window.activeProjectData.itinerary = {};
  if (!window.activeProjectData.itinerary[dayKey]) {
    window.activeProjectData.itinerary[dayKey] = { title: dayKey, spots: [] };
  }
  if (!window.activeProjectData.itinerary[dayKey].spots) {
    window.activeProjectData.itinerary[dayKey].spots = [];
  }

  const spotData = { time, title, desc };

  if (index >= 0) {
    window.activeProjectData.itinerary[dayKey].spots[index] = spotData;
  } else {
    window.activeProjectData.itinerary[dayKey].spots.push(spotData);
  }

  // 寫入 Firebase
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

// 刪除景點
window.deleteSpot = function(dayKey, index) {
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

// 切換 Tab
window.switchProjectTab = function(tabName) {
  document.querySelectorAll('#view-project .tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-subcontent').forEach(sub => sub.classList.remove('active'));

  const activeBtn = Array.from(document.querySelectorAll('#view-project .tab-btn')).find(b => b.getAttribute('onclick')?.includes(tabName));
  if (activeBtn) activeBtn.classList.add('active');

  const targetSub = document.getElementById('subtab-' + tabName);
  if (targetSub) targetSub.classList.add('active');
};
