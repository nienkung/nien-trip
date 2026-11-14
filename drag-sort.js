// ===== 通用拖曳排序（行程景點、記帳項目共用）=====
// 拖曳時出現一張跟著手指走的「幽靈卡片」，原位置留下半透明占位；
// 放開時才呼叫 reg.onMove 寫入資料。支援：同一列表內上下排序、拖到其他天、靠近邊緣自動捲動。
// 使用方式：DragSort.register({ containerId, itemSel, listSel, skipDay, countItems, canDrag, onMove })
// 須在 itinerary.js、expenses.js 之前載入。

(function () {
  const GAP = 12;   // 與項目之間的間距（需與 CSS 的 margin-top 相同）
  const EDGE = 90;  // 手指靠近視窗上下邊緣多少像素時自動捲動
  const regs = [];
  let st = null;

  function regForHandle(handle) {
    for (const reg of regs) {
      const c = document.getElementById(reg.containerId);
      if (c && c.contains(handle)) return reg;
    }
    return null;
  }

  function clearShifts(reg) {
    const c = document.getElementById(reg.containerId);
    if (c) c.querySelectorAll(reg.itemSel).forEach(el => { if (el.style.transform) el.style.transform = ''; });
    document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
  }

  function shift(el, px) {
    el.style.transform = `translateY(${px}px)`;
  }

  // 依指標位置判斷目標：哪一天、插入到第幾個
  function resolveTarget(reg, x, y) {
    const container = document.getElementById(reg.containerId);
    const el = document.elementFromPoint(x, y);
    const dayCard = el && el.closest ? el.closest('.card[data-day]') : null;
    if (!dayCard || !container || !container.contains(dayCard)) return null;

    const dayKey = dayCard.dataset.day;
    if (reg.skipDay && reg.skipDay(dayKey)) return null;

    const list = dayCard.querySelector(reg.listSel);
    if (!list || !dayCard.classList.contains('open')) {
      // 收合中或沒有項目的天：放到最後
      return { dayKey, dayCard, list: null, cards: [], index: reg.countItems(dayKey) };
    }

    const cards = Array.from(list.querySelectorAll(':scope > ' + reg.itemSel)).filter(c => c !== st.card);
    let index = 0;
    cards.forEach(c => {
      const r = c.getBoundingClientRect();
      if (r.top + r.height / 2 < y) index++;
    });
    return { dayKey, dayCard, list, cards, index };
  }

  function update(x, y) {
    if (!st) return;
    const reg = st.reg;
    st.ghost.style.left = (x - st.offX) + 'px';
    st.ghost.style.top = (y - st.offY) + 'px';

    clearShifts(reg);
    const t = resolveTarget(reg, x, y);
    if (t && t.dayKey !== st.dayKey) t.dayCard.classList.add('drop-target');

    // 來源列表：占位之後的項目往上補位
    if (!t || !t.list || t.list !== st.list) {
      st.cards.forEach((c, i) => { if (i > st.from) shift(c, -st.step); });
    }

    if (t && t.list) {
      if (t.list === st.list) {
        // 同一列表：中間的項目讓位
        const to = t.index;
        st.cards.forEach((c, i) => {
          if (i === st.from) return;
          if (st.from < to && i > st.from && i <= to) shift(c, -st.step);
          if (to < st.from && i >= to && i < st.from) shift(c, st.step);
        });
      } else {
        // 目標列表：插入位置之後的項目往下讓出空間
        t.cards.forEach((c, j) => { if (j >= t.index) shift(c, st.step); });
      }
    }

    st.target = t;
  }

  document.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest && e.target.closest('.drag-handle');
    if (!handle) return;
    const reg = regForHandle(handle);
    if (!reg) return;
    if (reg.canDrag && !reg.canDrag()) return;

    const list = handle.closest(reg.listSel);
    if (!list) return;
    const card = handle.closest(reg.itemSel);
    const cards = Array.from(list.querySelectorAll(':scope > ' + reg.itemSel));
    const from = cards.indexOf(card);
    if (from < 0) return;

    e.preventDefault();
    try { handle.setPointerCapture(e.pointerId); } catch (err) {}

    const rect = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.width = rect.width + 'px';
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    document.body.appendChild(ghost);
    card.classList.add('drag-placeholder');
    document.body.classList.add('dragging-spot');

    st = {
      pid: e.pointerId,
      reg,
      dayKey: list.dataset.day,
      list,
      cards,
      card,
      from,
      ghost,
      offX: e.clientX - rect.left,
      offY: e.clientY - rect.top,
      step: rect.height + GAP,
      target: null,
      x: e.clientX,
      y: e.clientY,
      timer: null
    };

    // 手指靠近邊緣時自動捲動（即使手指沒動也會持續捲）
    st.timer = setInterval(() => {
      if (!st) return;
      let dy = 0;
      if (st.y < EDGE) dy = -14;
      else if (st.y > window.innerHeight - EDGE) dy = 14;
      if (dy) { window.scrollBy(0, dy); update(st.x, st.y); }
    }, 16);
  });

  document.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.pid) return;
    st.x = e.clientX;
    st.y = e.clientY;
    update(st.x, st.y);
  });

  const endDrag = (e) => {
    if (!st || e.pointerId !== st.pid) return;
    const s = st;
    st = null;
    clearInterval(s.timer);
    s.ghost.remove();
    s.card.classList.remove('drag-placeholder');
    document.body.classList.remove('dragging-spot');
    clearShifts(s.reg);

    if (e.type !== 'pointerup' || !s.target) return;
    const t = s.target;
    if (t.dayKey === s.dayKey && t.index === s.from) return; // 位置沒變
    s.reg.onMove(s.dayKey, s.from, t.dayKey, t.index);
  };
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  window.DragSort = {
    register(reg) { regs.push(reg); }
  };
})();
