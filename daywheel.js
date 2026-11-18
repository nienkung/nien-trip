// 左側常駐日期滾輪：電腦顯示 5 格、手機 3 格，只顯示窗口內的天數，頭尾不循環。
// 跟著頁面捲動；可拖曳、可用滾輪、可點選。只在「行程規劃」與「旅程記帳」分頁顯示（行前準備不顯示）。
(function () {
  var ITEM = 40;
  var wrap = null, track = null, items = [], labels = [], days = [];
  var pos = 0, target = 0, dragging = false, sY = 0, sP = 0, raf = 0, snapT = null, suppressT = null, suppress = false;

  var st = document.createElement('style');
  st.textContent = '#dayWheel{position:fixed;left:0;top:50%;width:52px;height:' + (ITEM * 5) + 'px;margin-top:-' + (ITEM * 5 / 2) + 'px;background:var(--brand-light);border-right:1px solid var(--brand-border);border-radius:0 12px 12px 0;z-index:80;touch-action:none;user-select:none;cursor:grab;overflow:hidden}' +
    '#dayWheel.wh-3{height:' + (ITEM * 3) + 'px;margin-top:-' + (ITEM * 3 / 2) + 'px}' +
    '#dayWheel .wh-band{position:absolute;left:0;right:0;top:50%;height:' + ITEM + 'px;margin-top:-' + (ITEM / 2) + 'px;background:var(--brand-bg);border-top:1px solid var(--brand-border);border-bottom:1px solid var(--brand-border);pointer-events:none}' +
    '#dayWheel .wh-item{position:absolute;left:0;right:0;top:0;height:' + ITEM + 'px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:ui-monospace,Menlo,monospace;will-change:transform,opacity}' +
    '#dayWheel .wh-lab{font-size:14px;font-weight:700;line-height:1;color:var(--brand-dark)}' +
    '#dayWheel .wh-date{font-size:10px;color:var(--brand-main);margin-top:2px}' +
    'body.wheel-on .main-container{padding-left:64px!important}';
  document.head.appendChild(st);

  function clampI(v) { return Math.max(0, Math.min(days.length - 1, v)); }
  function modalOpen() { return !!document.querySelector('.modal-mask[style*="display: flex"]'); }
  function onListTab() { return window._currentTab === 'itinerary' || window._currentTab === 'expense'; }
  function visible() {
    var proj = window.activeProjectData;
    return window._currentView === 'project' && onListTab() && !!proj && !!proj.startDate && days.length > 0 && !modalOpen();
  }
  // 目前分頁的天數卡片容器（行程或記帳）
  function listId() { return window._currentTab === 'expense' ? 'expenseDayList' : 'itineraryContainer'; }
  // 記帳分頁包含 D0（行前花費）；行程分頁只列 D1 起的行程天（與行程卡片一致）
  function listDays(proj) {
    if (window._currentTab === 'expense') return window.getDynamicProjectDays(proj);
    return window.WX.tripDays(proj);
  }
  function toggleDay(card) {
    if (window._currentTab === 'expense') { if (window.toggleExpDay) window.toggleExpDay(card.querySelector('.card-header')); }
    else if (window.toggleItinDay) window.toggleItinDay(card.querySelector('.card-header'));
  }
  function count() { return window.innerWidth >= 600 ? 5 : 3; }

  function ensure() {
    if (wrap) return;
    wrap = document.createElement('div');
    wrap.id = 'dayWheel';
    wrap.style.display = 'none';
    var band = document.createElement('div');
    band.className = 'wh-band';
    track = document.createElement('div');
    track.style.cssText = 'position:absolute;left:0;right:0;top:0;bottom:0';
    wrap.appendChild(band);
    wrap.appendChild(track);
    document.body.appendChild(wrap);
    wrap.addEventListener('pointerdown', down);
    wrap.addEventListener('pointermove', move);
    wrap.addEventListener('pointerup', up);
    wrap.addEventListener('pointercancel', function () { dragging = false; });
    wrap.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function build(proj) {
    days = listDays(proj);
    track.innerHTML = '';
    items = []; labels = [];
    days.forEach(function (dk) {
      var d = window.WX.dayDate(proj, dk);
      var el = document.createElement('div');
      el.className = 'wh-item';
      var lab = document.createElement('span');
      lab.className = 'wh-lab';
      lab.textContent = dk;
      var dt = document.createElement('span');
      dt.className = 'wh-date';
      dt.textContent = d ? (d.getMonth() + 1) + '/' + d.getDate() : '';
      el.appendChild(lab);
      el.appendChild(dt);
      track.appendChild(el);
      items.push(el);
      labels.push(lab);
    });
  }

  function computeActive() {
    var cont = document.getElementById(listId());
    if (!cont) return 0;
    var lim = window.innerHeight * 0.4, idx = 0;
    cont.querySelectorAll('.card[data-day]').forEach(function (c) {
      if (c.getBoundingClientRect().top <= lim) {
        var j = days.indexOf(c.getAttribute('data-day'));
        if (j >= 0) idx = j;
      }
    });
    return idx;
  }

  function render() {
    var n = count(), half = Math.floor(n / 2);
    var mid = wrap.clientHeight / 2 - ITEM / 2, act = Math.round(pos);
    items.forEach(function (el, i) {
      var d = i - pos, a = Math.abs(d);
      if (a > half + 0.5) { el.style.opacity = '0'; return; }
      el.style.transform = 'translate3d(0,' + (mid + d * ITEM).toFixed(1) + 'px,0)';
      el.style.opacity = Math.max(0.3, 1 - a * 0.35).toFixed(2);
      labels[i].style.color = i === act ? 'var(--brand-main)' : 'var(--brand-dark)';
      labels[i].style.fontWeight = i === act ? '800' : '700';
    });
  }

  function loop() {
    raf = 0;
    if (!wrap || wrap.style.display === 'none') return;
    pos += (target - pos) * 0.2;
    if (Math.abs(target - pos) < 0.002) pos = target;
    render();
    if (Math.abs(target - pos) >= 0.002 || dragging) raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(loop); }

  function suppressSync() {
    suppress = true;
    clearTimeout(suppressT);
    suppressT = setTimeout(function () { suppress = false; }, 800);
  }

  function goto(i) {
    i = clampI(i);
    target = i;
    var cont = document.getElementById(listId());
    var card = cont && cont.querySelector('.card[data-day="' + days[i] + '"]');
    if (!card) return;
    if (!card.classList.contains('open')) toggleDay(card);
    suppressSync();
    var y = card.getBoundingClientRect().top + window.scrollY - 130;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    kick();
  }

  function down(e) {
    dragging = true; sY = e.clientY; sP = target;
    wrap.setPointerCapture(e.pointerId);
  }
  function move(e) {
    if (!dragging) return;
    target = clampI(sP + (sY - e.clientY) / ITEM);
    kick();
  }
  function up(e) {
    if (!dragging) return;
    dragging = false;
    if (Math.abs(e.clientY - sY) < 6) {
      var r = wrap.getBoundingClientRect();
      goto(Math.round(pos + (e.clientY - (r.top + r.height / 2)) / ITEM));
    } else {
      goto(Math.round(target));
    }
  }
  var wheelT = null;
  function onWheel(e) {
    e.preventDefault();
    target = clampI(target + e.deltaY / ITEM);
    kick();
    clearTimeout(wheelT);
    wheelT = setTimeout(function () { goto(Math.round(target)); }, 160);
  }
  function onScroll() {
    if (suppress || dragging || !wrap || wrap.style.display === 'none') return;
    target = computeActive();
    kick();
  }

  window.updateDayWheel = function () {
    ensure();
    var proj = window.activeProjectData;
    if (!proj || !proj.startDate) { wrap.style.display = 'none'; document.body.classList.remove('wheel-on'); return; }
    var fresh = listDays(proj);
    if (!items.length || fresh.join(',') !== days.join(',')) build(proj);
    if (!visible()) {
      wrap.style.display = 'none';
      document.body.classList.remove('wheel-on');
      return;
    }
    var n = count();
    wrap.className = n === 3 ? 'wh-3' : '';
    wrap.style.display = 'block';
    document.body.classList.toggle('wheel-on', window.innerWidth < 700);
    if (!raf && wrap.dataset.ready !== '1') { pos = computeActive(); }
    wrap.dataset.ready = '1';
    target = computeActive();
    render();
  };

  window.addEventListener('resize', function () { if (window.updateDayWheel) window.updateDayWheel(); });
})();
