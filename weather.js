// 天氣模組（前端）：預報快取、地名查座標、每日摘要、行李提醒。
// 景點座標優先用 Google 地點搜尋存下的 lat/lon；沒有座標的景點，用景點名稱查詢並快取在本機。
(function () {
  var DAY = 864e5;
  var WMO = {
    0: ['☀️', '晴'], 1: ['☀️', '晴'], 2: ['⛅', '晴時多雲'], 3: ['☁️', '陰'],
    45: ['🌫️', '霧'], 48: ['🌫️', '霧'],
    51: ['🌧️', '毛毛雨'], 53: ['🌧️', '毛毛雨'], 55: ['🌧️', '毛毛雨'],
    56: ['🌧️', '凍雨'], 57: ['🌧️', '凍雨'],
    61: ['🌧️', '小雨'], 63: ['🌧️', '雨'], 65: ['🌧️', '大雨'],
    66: ['🌧️', '凍雨'], 67: ['🌧️', '凍雨'],
    71: ['❄️', '小雪'], 73: ['❄️', '雪'], 75: ['❄️', '大雪'], 77: ['❄️', '雪'],
    80: ['🌧️', '陣雨'], 81: ['🌧️', '陣雨'], 82: ['🌧️', '大陣雨'],
    85: ['❄️', '陣雪'], 86: ['❄️', '陣雪'],
    95: ['⛈️', '雷雨'], 96: ['⛈️', '雷雨'], 99: ['⛈️', '雷雨']
  };
  var LUGGAGE = [
    { icon: '🕶️', text: '太陽刺眼', test: function (s) { return s.code <= 1 && s.hi >= 25; } },
    { icon: '☂️', text: '記得帶傘', test: function (s) { return s.rain >= 50; } },
    { icon: '🧥', text: '注意保暖', test: function (s) { return s.lo <= 10; } },
    { icon: '🧴', text: '建議防曬', test: function (s) { return s.hi >= 30; } }
  ];
  var fcMem = {}, memo = { sig: '', data: null };

  var st = document.createElement('style');
  st.textContent = '.wx-chip{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;color:var(--brand-dark);background:var(--brand-light);border:1px solid var(--brand-border);border-radius:999px;padding:2px 8px;margin-top:6px;white-space:nowrap}' +
    '.wx-chip i{color:var(--brand-main);font-size:14px}.wx-muted{color:var(--sub-text);font-weight:600}.wx-spot{margin-top:6px}';
  document.head.appendChild(st);

  function esc(s) { return window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dayNumber(dk) { var m = /^D(\d+)$/.exec(dk || ''); return m ? +m[1] : 0; }
  function dayDate(proj, dk) {
    var n = dayNumber(dk);
    if (!proj || !proj.startDate || !n) return null;
    var s = new Date(proj.startDate + 'T00:00:00');
    return new Date(s.getTime() + (n - 1) * DAY);
  }
  function tripDays(proj) {
    if (!proj) return [];
    return window.getDynamicProjectDays(proj).filter(function (dk) { return dayNumber(dk) > 0; });
  }
  function forecast(lat, lon) {
    var k = lat.toFixed(2) + ',' + lon.toFixed(2);
    if (!fcMem[k]) {
      fcMem[k] = fetch('/api/weather?lat=' + lat.toFixed(2) + '&lon=' + lon.toFixed(2))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (!j) delete fcMem[k]; return j; })
        .catch(function () { delete fcMem[k]; return null; });
    }
    return fcMem[k];
  }

  // 只使用 Google 地點搜尋存下的座標（spot.lat / spot.lon），不用景點名稱猜座標
  function spotCoord(spot) {
    if (spot && typeof spot.lat === 'number' && typeof spot.lon === 'number') {
      return Promise.resolve({ lat: spot.lat, lon: spot.lon, city: '' });
    }
    return Promise.resolve(null);
  }

  function dist(a, b) { return Math.hypot(a.lat - b.lat, a.lon - b.lon); }

  function dayMain(titled) {
    var list = titled.filter(Boolean);
    if (!list.length) return null;
    function key(c) { return c.lat.toFixed(1) + ',' + c.lon.toFixed(1); }
    var count = {};
    list.forEach(function (c) { count[key(c)] = (count[key(c)] || 0) + 1; });
    var best = list[0];
    list.forEach(function (c) { if (count[key(c)] > count[key(best)]) best = c; });
    return best;
  }

  function hasDate(fc, date) {
    return !!(fc && fc.daily && date && fc.daily.time.indexOf(fmtDate(date)) >= 0);
  }
  function summaryOf(fc, date) {
    if (!hasDate(fc, date)) return null;
    var i = fc.daily.time.indexOf(fmtDate(date));
    var hi = fc.daily.hi[i], lo = fc.daily.lo[i], code = fc.daily.code[i];
    if (hi == null || lo == null) return null;
    var wx = WMO[code] || ['☁️', '—'];
    return {
      code: code, icon: wx[0], label: wx[1],
      hi: Math.round(hi), lo: Math.round(lo), rain: Math.round(fc.daily.rain[i] || 0)
    };
  }

  function luggageOf(s) { return s ? LUGGAGE.filter(function (r) { return r.test(s); }) : []; }

  window.loadTripWeather = function (proj) {
    if (!proj || !proj.startDate) return Promise.resolve(null);
    var days = tripDays(proj), it = proj.itinerary || {};
    var sig = JSON.stringify([proj.startDate, days.map(function (dk) {
      return ((it[dk] && it[dk].spots) || []).map(function (s) { return [s.title, s.lat, s.lon]; });
    })]);
    if (memo.sig === sig && memo.data) return Promise.resolve(memo.data);
    return Promise.all(days.map(function (dk) {
      var spots = (it[dk] && it[dk].spots) || [];
      return Promise.all(spots.map(spotCoord)).then(function (coords) {
        return {
          dk: dk, count: spots.length, spots: spots,
          coords: coords.map(function (c, i) { return c ? { lat: c.lat, lon: c.lon, city: c.city, title: spots[i].title } : null; })
        };
      });
    })).then(function (all) {
      return Promise.all(all.map(function (d) {
        var date = dayDate(proj, d.dk);
        // 依景點出現順序分城市：距離 30 公里內視為同一城市，每個城市各一組天氣
        var groups = [];
        d.coords.forEach(function (c) {
          if (!c) return;
          var g = null;
          for (var k = 0; k < groups.length; k++) { if (dist(groups[k].rep, c) <= 0.3) { g = groups[k]; break; } }
          if (g) g.count++; else groups.push({ rep: c, count: 1 });
        });
        return Promise.all(groups.map(function (g) { return forecast(g.rep.lat, g.rep.lon); })).then(function (frs) {
          return {
            date: date, count: d.count,
            cities: groups.map(function (g, i) {
              var fc = frs[i];
              return {
                label: g.rep.title || g.rep.city || '',
                sum: fc ? summaryOf(fc, date) : null,
                outOfRange: !!fc && !hasDate(fc, date),
                noForecast: !fc
              };
            })
          };
        });
      }));
    }).then(function (list) {
      var res = {};
      days.forEach(function (dk, i) { res[dk] = list[i]; });
      memo = { sig: sig, data: res };
      return res;
    });
  };

  function chipHTML(s, cls) {
    return '<span class="wx-chip ' + (cls || '') + '">' + s.icon + '' + s.label + ' ' + s.hi + '°/' + s.lo + '°</span>';
  }
  function dayChipHTML(d) {
    if (!d) return '';
    if (!d.cities || !d.cities.length) return d.count ? '<span class="wx-chip wx-muted">景點缺少 Google 座標</span>' : '';
    return d.cities.map(function (c) {
      if (c.outOfRange) return '<div style="margin-top:4px"><span class="wx-chip wx-muted">' + esc(c.label) + '：尚未開放預報</span></div>';
      if (!c.sum) return '';
      return '<div style="margin-top:4px"><span class="wx-chip wx-muted">' + esc(c.label) + '</span> ' + chipHTML(c.sum) + ' <span class="wx-chip wx-muted">降雨 ' + c.sum.rain + '%</span></div>';
    }).join('');
  }

  window.hydrateItineraryWeather = function () {
    var proj = window.activeProjectData, pid = window.activeProjectId;
    if (!proj || !proj.startDate) return;
    window.loadTripWeather(proj).then(function (res) {
      if (!res || window.activeProjectId !== pid) return;
      document.querySelectorAll('#itineraryContainer .wx-day-slot').forEach(function (el) {
        el.innerHTML = dayChipHTML(res[el.dataset.day]);
      });
      document.querySelectorAll('#itineraryContainer .wx-spot-slot').forEach(function (el) { el.innerHTML = ''; });
    });
  };

  window.WX = { WMO: WMO, LUGGAGE: LUGGAGE, dayDate: dayDate, tripDays: tripDays, fmtDate: fmtDate, luggageOf: luggageOf, summaryOf: summaryOf };
})();
