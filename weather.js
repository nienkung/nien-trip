// 天氣模組（前端）：預報快取、地名查座標、每日摘要、行李提醒。
// 景點座標優先用 Google 地點搜尋存下的 lat/lon；沒有座標的景點，用景點名稱查詢並快取在本機。
(function () {
  var DAY = 864e5;
  var WMO = {
    0: ['ti-sun', '晴'], 1: ['ti-sun', '晴'], 2: ['ti-cloud-sun', '晴時多雲'], 3: ['ti-cloud', '陰'],
    45: ['ti-cloud-fog', '霧'], 48: ['ti-cloud-fog', '霧'],
    51: ['ti-cloud-rain', '毛毛雨'], 53: ['ti-cloud-rain', '毛毛雨'], 55: ['ti-cloud-rain', '毛毛雨'],
    56: ['ti-cloud-rain', '凍雨'], 57: ['ti-cloud-rain', '凍雨'],
    61: ['ti-cloud-rain', '小雨'], 63: ['ti-cloud-rain', '雨'], 65: ['ti-cloud-rain', '大雨'],
    66: ['ti-cloud-rain', '凍雨'], 67: ['ti-cloud-rain', '凍雨'],
    71: ['ti-snowflake', '小雪'], 73: ['ti-snowflake', '雪'], 75: ['ti-snowflake', '大雪'], 77: ['ti-snowflake', '雪'],
    80: ['ti-cloud-rain', '陣雨'], 81: ['ti-cloud-rain', '陣雨'], 82: ['ti-cloud-rain', '大陣雨'],
    85: ['ti-snowflake', '陣雪'], 86: ['ti-snowflake', '陣雪'],
    95: ['ti-cloud-storm', '雷雨'], 96: ['ti-cloud-storm', '雷雨'], 99: ['ti-cloud-storm', '雷雨']
  };
  var LUGGAGE = [
    { icon: 'ti-sunglasses', text: '太陽刺眼', test: function (s) { return s.code <= 1 && s.hi >= 25; } },
    { icon: 'ti-umbrella', text: '記得帶傘', test: function (s) { return s.rain >= 50; } },
    { icon: 'ti-temperature-minus', text: '注意保暖', test: function (s) { return s.lo <= 10; } },
    { icon: 'ti-sun', text: '建議防曬', test: function (s) { return s.hi >= 30; } }
  ];
  var geoStore = {};
  try { geoStore = JSON.parse(localStorage.getItem('nt_geo') || '{}'); } catch (e) { geoStore = {}; }
  var geoMem = {}, fcMem = {}, memo = { sig: '', data: null };

  var st = document.createElement('style');
  st.textContent = '.wx-chip{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;color:var(--brand-dark);background:var(--brand-light);border:1px solid var(--brand-border);border-radius:999px;padding:2px 8px;margin-top:6px;white-space:nowrap}' +
    '.wx-chip i{color:var(--brand-main);font-size:14px}.wx-muted{color:var(--sub-text);font-weight:600}.wx-spot{margin-top:6px}';
  document.head.appendChild(st);

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
  function saveGeo() { try { localStorage.setItem('nt_geo', JSON.stringify(geoStore)); } catch (e) {} }

  function geocode(name) {
    var key = String(name || '').trim();
    if (!key) return Promise.resolve(null);
    if (geoStore[key]) return Promise.resolve(geoStore[key]);
    if (!(key in geoMem)) {
      geoMem[key] = fetch('/api/geocode?q=' + encodeURIComponent(key))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          var v = j && typeof j.lat === 'number' ? { lat: j.lat, lon: j.lon, city: j.city || '' } : null;
          if (v) { geoStore[key] = v; saveGeo(); }
          return v;
        })
        .catch(function () { return null; });
    }
    return geoMem[key];
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

  function spotCoord(spot) {
    if (spot && typeof spot.lat === 'number' && typeof spot.lon === 'number') {
      return Promise.resolve({ lat: spot.lat, lon: spot.lon, city: '' });
    }
    return geocode(spot && spot.title);
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

  function summaryOf(fc, date) {
    if (!fc || !fc.daily || !date) return null;
    var i = fc.daily.time.indexOf(fmtDate(date));
    if (i < 0) return null;
    var w = WMO[fc.daily.code[i]] || ['ti-cloud', '—'];
    return {
      code: fc.daily.code[i], icon: w[0], label: w[1],
      hi: Math.round(fc.daily.hi[i]), lo: Math.round(fc.daily.lo[i]), rain: Math.round(fc.daily.rain[i] || 0)
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
        var titled = coords.map(function (c, i) { return c ? { lat: c.lat, lon: c.lon, city: c.city, title: spots[i].title } : null; });
        var main = dayMain(titled);
        var date = dayDate(proj, dk);
        var mainFc = main ? forecast(main.lat, main.lon) : Promise.resolve(null);
        var spotFcs = titled.map(function (c) {
          return c && main && dist(c, main) > 0.3 ? forecast(c.lat, c.lon) : Promise.resolve(null);
        });
        return Promise.all([mainFc, Promise.all(spotFcs)]).then(function (r) {
          var mainSum = r[0] ? summaryOf(r[0], date) : null;
          return {
            date: date,
            main: main,
            mainSum: mainSum,
            outOfRange: !!r[0] && !mainSum,
            noForecast: !r[0] && !!main,
            spots: titled.map(function (c, i) {
              var differs = !!c && !!main && dist(c, main) > 0.3;
              return { coord: c, differs: differs, sum: differs && r[1][i] ? summaryOf(r[1][i], date) : null };
            })
          };
        });
      });
    })).then(function (list) {
      var res = {};
      days.forEach(function (dk, i) { res[dk] = list[i]; });
      memo = { sig: sig, data: res };
      return res;
    });
  };

  function chipHTML(s, cls) {
    return '<span class="wx-chip ' + (cls || '') + '"><i class="ti ' + s.icon + '" aria-hidden="true"></i>' + s.label + ' ' + s.hi + '°/' + s.lo + '°</span>';
  }
  function dayChipHTML(d) {
    if (!d) return '';
    if (d.outOfRange) return '<span class="wx-chip wx-muted">尚未開放預報</span>';
    if (!d.mainSum) return '';
    return chipHTML(d.mainSum) + ' <span class="wx-chip wx-muted">降雨 ' + d.mainSum.rain + '%</span>';
  }

  window.hydrateItineraryWeather = function () {
    var proj = window.activeProjectData, pid = window.activeProjectId;
    if (!proj || !proj.startDate) return;
    window.loadTripWeather(proj).then(function (res) {
      if (!res || window.activeProjectId !== pid) return;
      document.querySelectorAll('#itineraryContainer .wx-day-slot').forEach(function (el) {
        el.innerHTML = dayChipHTML(res[el.dataset.day]);
      });
      document.querySelectorAll('#itineraryContainer .wx-spot-slot').forEach(function (el) {
        var d = res[el.dataset.day];
        var s = d && d.spots[+el.dataset.idx];
        el.innerHTML = s && s.differs && s.sum ? chipHTML(s.sum, 'wx-spot') : '';
      });
    });
  };

  window.WX = { WMO: WMO, LUGGAGE: LUGGAGE, dayDate: dayDate, tripDays: tripDays, fmtDate: fmtDate, luggageOf: luggageOf, summaryOf: summaryOf };
})();
