// ===== 整天對調：拖曳天的標題列把手，放到另一天即交換「行程內容」=====
// 交換內容：景點（spots）、當日主軸（theme）、主要城市（cities）。
// 天標題（含日期）留在原位置；記帳（expenses）不動，仍留在原日期。D0 不參與。
// 載入位置：itinerary.js 之後。會包住 window.renderItineraryFromJSON，在每張天卡片標題列加上把手。
// 依賴 itinerary.js 的全域：itinOpenState()、window.renderItineraryFromJSON、window.canEditContent、window.dbUpdate / dbRef / db。

(function () {
  const EDGE = 90;        // 手指靠近視窗上下邊緣多少像素時自動捲動
  let st = null;          // 目前拖曳的狀態
  let suppressClick = false;

  const style = document.createElement('style');
  style.textContent =
    '.day-drag-handle{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;margin-right:6px;border-radius:8px;color:var(--brand-main);font-size:16px;cursor:grab;touch-action:none;user-select:none;flex-shrink:0}' +
    '.day-drag-handle:active{cursor:grabbing;background:var(--brand-light)}' +
    '.card.day-dragging{opacity:.5}' +
    '.card.day-drop-target{outline:2px dashed var(--brand-main);outline-offset:3px}';
  document.head.appendChild(style);

  // 在每張天卡片（D0 除外）的標題列最前面加上把手；沒有編輯權限時移除
  function addHandles() {
    const container = document.getElementById('itineraryContainer');
    if (!container) return;
    const canEdit = !!(window.canEditContent && window.canEditContent(window.activeProjectData));
    container.querySelectorAll('.card[data-day]').forEach((card) => {
      const day = card.dataset.day;
      const header = card.querySelector('.card-header');
      if (!header) return;
      let h = header.querySelector('.day-drag-handle');
      if (day === 'D0' || !canEdit) {
        if (h) h.remove();
        return;
      }
      if (!h) {
        h = document.createElement('span');
        h.className = 'day-drag-handle';
        h.title = '按住拖到另一天：整天行程對調（記帳不動）';
        h.textContent = '⠿';
        header.insertBefore(h, header.firstChild);
      }
    });
  }

  // 包住原本的渲染函式：每次重繪後補上把手
  const origRender = window.renderItineraryFromJSON;
  window.renderItineraryFromJSON = function () {
    const ret = origRender.apply(this, arguments);
    addHandles();
    return ret;
  };

  // 依指標位置找出要放上去的天（只取行程容器內的天卡片，排除來源天與 D0）
  function targetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const c = el && el.closest ? el.closest('#itineraryContainer .card[data-day]') : null;
    if (!c) return null;
    const day = c.dataset.day;
    if (day === 'D0' || day === st.from) return null;
    return { day, card: c };
  }

  function hover(x, y) {
    if (!st) return;
    document.querySelectorAll('.card.day-drop-target').forEach((el) => el.classList.remove('day-drop-target'));
    const t = targetAt(x, y);
    st.target = t ? t.day : null;
    if (t) t.card.classList.add('day-drop-target');
  }

  document.addEventListener('pointerdown', (e) => {
    const h = e.target.closest && e.target.closest('.day-drag-handle');
    if (!h) return;
    if (!window.canEditContent || !window.canEditContent(window.activeProjectData)) return;
    const card = h.closest('.card[data-day]');
    if (!card) return;

    e.preventDefault();
    try { h.setPointerCapture(e.pointerId); } catch (err) {}

    st = {
      pid: e.pointerId,
      from: card.dataset.day,
      card,
      target: null,
      moved: false,
      x: e.clientX,
      y: e.clientY,
      timer: null
    };
    card.classList.add('day-dragging');

    // 手指靠近邊緣時自動捲動（即使手指沒動也會持續捲）
    st.timer = setInterval(() => {
      if (!st) return;
      let dy = 0;
      if (st.y < EDGE) dy = -14;
      else if (st.y > window.innerHeight - EDGE) dy = 14;
      if (dy) {
        window.scrollBy(0, dy);
        hover(st.x, st.y);
      }
    }, 16);
  }, true);

  document.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.pid) return;
    st.x = e.clientX;
    st.y = e.clientY;
    st.moved = true;
    hover(st.x, st.y);
  });

  const endDrag = (e) => {
    if (!st || e.pointerId !== st.pid) return;
    const s = st;
    st = null;
    clearInterval(s.timer);
    s.card.classList.remove('day-dragging');
    document.querySelectorAll('.card.day-drop-target').forEach((el) => el.classList.remove('day-drop-target'));

    // 拖曳過程中放開時，瀏覽器可能會接著觸發 click（會誤觸收合／展開），這裡攔截掉
    if (s.moved) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 300);
    }

    if (e.type !== 'pointerup' || !s.target) return;
    swapDays(s.from, s.target);
  };
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  document.addEventListener('click', (e) => {
    if (!suppressClick) return;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  // 交換兩天的行程內容；天標題（含日期）留在原位置；只寫入這兩天，不動其他天與記帳
  function swapDays(a, b) {
    if (!window.canEditContent || !window.canEditContent(window.activeProjectData)) return;
    if (!(window.dbUpdate && window.dbRef && window.db)) return alert('系統載入中，請稍後再試。');

    const proj = window.activeProjectData;
    const it = proj.itinerary || {};
    const dA = it[a] || { title: a, spots: [] };
    const dB = it[b] || { title: b, spots: [] };

    // 只取內容欄位（空值不寫入，避免 Firebase 留下空物件）
    const contentOf = (d) => {
      const c = { spots: Array.isArray(d.spots) ? d.spots : [] };
      if (d.theme) c.theme = d.theme;
      if (Array.isArray(d.cities) && d.cities.length) c.cities = d.cities;
      return c;
    };

    const newA = Object.assign(contentOf(dB), { title: dA.title || a });
    const newB = Object.assign(contentOf(dA), { title: dB.title || b });

    const ref = window.dbRef(window.db, `projects/${window.activeProjectId}/itinerary`);
    window.dbUpdate(ref, { [a]: newA, [b]: newB })
      .then(() => {
        proj.itinerary = proj.itinerary || {};
        proj.itinerary[a] = newA;
        proj.itinerary[b] = newB;
        if (typeof itinOpenState === 'function') {
          const open = itinOpenState();
          open[a] = true;
          open[b] = true;
        }
        window.renderItineraryFromJSON(proj.itinerary);
      })
      .catch((err) => alert('換天失敗：' + err.message));
  }

  // 初次載入若行程已經畫好，補上把手
  addHandles();
})();
