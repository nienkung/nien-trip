window.currentUser = null;
window.allProjects = {};
window.activeProjectId = null;
window.activeProjectData = null;

// 網站管理員（super 權限）：可對任何專案做所有操作
window.SUPER_ADMIN_EMAILS = [
  "moneynien@gmail.com"
];

// 匯率（1 單位外幣 = 幾台幣）。此為備援值，載入後會被 /api/rates 的即時匯率覆蓋
window.EXCHANGE_RATES = {
  TWD: 1.0,
  JPY: 0.21,
  USD: 32.0,
  EUR: 34.5,
  GBP: 41.0,
  KRW: 0.023,
  THB: 0.92,
  CNY: 4.5,
  HKD: 4.1,
  SGD: 24.0,
  AUD: 21.0
};

// 支援的幣別（專案幣別設定可從這裡挑）
window.SUPPORTED_CURRENCIES = ['TWD', 'JPY', 'USD', 'EUR', 'GBP', 'KRW', 'THB', 'CNY', 'HKD', 'SGD', 'AUD'];

window.CURRENCY_INFO = {
  TWD: { name: '新台幣', symbol: 'NT$' },
  JPY: { name: '日圓',   symbol: '¥' },
  USD: { name: '美金',   symbol: '$' },
  EUR: { name: '歐元',   symbol: '€' },
  GBP: { name: '英鎊',   symbol: '£' },
  KRW: { name: '韓元',   symbol: '₩' },
  THB: { name: '泰銖',   symbol: '฿' },
  CNY: { name: '人民幣', symbol: '¥' },
  HKD: { name: '港幣',   symbol: 'HK$' },
  SGD: { name: '新加坡幣', symbol: 'S$' },
  AUD: { name: '澳幣',   symbol: 'A$' }
};

// 專案可使用的幣別清單（記帳下拉會讀這個；舊專案未設定時給預設）
window.getProjectCurrencies = function(proj) {
  if (proj && Array.isArray(proj.currencies) && proj.currencies.length) return proj.currencies;
  return ['JPY', 'TWD', 'USD', 'EUR'];
};

// 載入即時匯率（後端每日快取代理 /api/rates），失敗則沿用備援值
window.ratesUpdatedAt = null;
window.loadLiveRates = async function() {
  try {
    const res = await fetch('/api/rates');
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.rates) {
      Object.assign(window.EXCHANGE_RATES, data.rates);
      window.EXCHANGE_RATES.TWD = 1.0;
      window.ratesUpdatedAt = data.updatedAt || Date.now();
      if (window.activeProjectData) {
        if (window.renderExpenses) window.renderExpenses();
        if (window.renderSettlement) window.renderSettlement();
      }
    }
  } catch (e) {
    console.warn('即時匯率載入失敗，改用內建備援匯率：', e);
  }
};

// ===== 成員資料正規化（雙清單：members 有 email / externalPeople 只有名字）=====

// 團員：可登入編輯的協作者，回傳 [{name, email}]；相容舊版字串陣列
window.getMembers = function(proj) {
  if (!proj || !Array.isArray(proj.members)) return [];
  return proj.members.map(x =>
    typeof x === 'string' ? { name: x, email: '' } : { name: (x && x.name) || '', email: (x && x.email) || '' }
  ).filter(m => m.name);
};

// 外部分帳人：只參與分帳、不能登入，回傳 [name]
window.getExternalPeople = function(proj) {
  if (!proj || !Array.isArray(proj.externalPeople)) return [];
  return proj.externalPeople.map(x => typeof x === 'string' ? x : (x && x.name) || '').filter(Boolean);
};

// 所有需要分帳的對象名字（團員 + 外部人，去重）
window.getAllSplitNames = function(proj) {
  const names = window.getMembers(proj).map(m => m.name);
  const ext = window.getExternalPeople(proj);
  const seen = {};
  return names.concat(ext).filter(n => {
    if (!n || seen[n]) return false;
    seen[n] = true;
    return true;
  });
};

// ===== 權限判定 =====

window.isSuperAdmin = function() {
  return !!(window.currentUser && window.SUPER_ADMIN_EMAILS.includes(window.currentUser.email));
};

// 嚴格判定「這是不是我建立的專案」（大廳分區用）
window.isMyProject = function(projData) {
  if (!window.currentUser || !projData) return false;
  const email = (window.currentUser.email || '').toLowerCase();
  if (projData.ownerEmail && projData.ownerEmail.toLowerCase() === email) return true;
  return projData.ownerUid === window.currentUser.uid || projData.ownerName === window.currentUser.name;
};

// 團主（含管理員 override）
window.isProjectOwner = function(projData) {
  if (!window.currentUser) return false;
  if (window.isSuperAdmin()) return true;
  if (!projData) return false;
  const email = (window.currentUser.email || '').toLowerCase();
  if (projData.ownerEmail && projData.ownerEmail.toLowerCase() === email) return true;
  return projData.ownerUid === window.currentUser.uid || projData.ownerName === window.currentUser.name;
};

// 團員：email 在團員名單中（或團主 / 管理員）
window.isTeamMember = function(projData) {
  if (!window.currentUser || !projData) return false;
  if (window.isProjectOwner(projData)) return true;
  const email = (window.currentUser.email || '').toLowerCase();
  if (!email) return false;
  return window.getMembers(projData).some(m => m.email && m.email.toLowerCase() === email);
};

// 可編輯內容（行程景點、記帳分帳、AI 隨手記）：團員 / 團主 / 管理員
window.canEditContent = function(projData) {
  return window.isSuperAdmin() || window.isProjectOwner(projData) || window.isTeamMember(projData);
};

// 可管理團員（邀請 / 編輯 / 刪除 / 加外部分帳人）：團主 / 管理員
window.canManageMembers = function(projData) {
  return window.isSuperAdmin() || window.isProjectOwner(projData);
};

// 可管理專案（改設定 / 刪除 / 換團主）：團主 / 管理員
window.canManageProject = function(projData) {
  return window.isSuperAdmin() || window.isProjectOwner(projData);
};

// 取得目前使用者在該專案的身份標籤
window.getMyRole = function(projData) {
  if (window.isSuperAdmin()) return 'admin';
  if (window.isProjectOwner(projData)) return 'owner';
  if (window.isTeamMember(projData)) return 'member';
  return 'visitor';
};

// ===== 共用工具 =====

window.getDynamicProjectDays = function(projData) {
  if (!projData || !projData.itinerary) return ['D0', 'D1', 'D2', 'D3', 'D4', 'D5'];
  const keys = Object.keys(projData.itinerary);
  if (!keys.includes('D0')) keys.unshift('D0');
  return keys;
};

window.convertToTWD = function(amount, currency) {
  const rate = window.EXCHANGE_RATES[currency] || 1.0;
  return amount * rate;
};

// 計算專案天數：優先用起迄日期，退而求其次用 itinerary（排除 D0）
window.getProjectDayCount = function(p) {
  if (!p) return 0;
  if (p.startDate && p.endDate) {
    const s = new Date(p.startDate);
    const e = new Date(p.endDate);
    const d = Math.ceil(Math.abs(e - s) / (1000 * 60 * 60 * 24)) + 1;
    if (!isNaN(d) && d > 0) return d;
  }
  if (p.itinerary) {
    return Object.keys(p.itinerary).filter(k => k !== 'D0').length;
  }
  return 0;
};

// 縮圖樣式庫（漸層底 + emoji）
window.TRIP_COVERS = [
  { grad: 'linear-gradient(135deg, #00A896, #0F3D3E)', emoji: '🏯' },
  { grad: 'linear-gradient(135deg, #667EEA, #764BA2)', emoji: '🗼' },
  { grad: 'linear-gradient(135deg, #F6AD55, #DD6B20)', emoji: '🏖️' },
  { grad: 'linear-gradient(135deg, #4FD1C5, #2C7A7B)', emoji: '⛩️' },
  { grad: 'linear-gradient(135deg, #FC8181, #C53030)', emoji: '🗻' },
  { grad: 'linear-gradient(135deg, #63B3ED, #3182CE)', emoji: '✈️' },
  { grad: 'linear-gradient(135deg, #B794F4, #805AD5)', emoji: '🌸' },
  { grad: 'linear-gradient(135deg, #68D391, #2F855A)', emoji: '🚅' }
];

window.getProjectCover = function(p, id) {
  if (p && typeof p.coverIndex === 'number' && window.TRIP_COVERS[p.coverIndex]) {
    return window.TRIP_COVERS[p.coverIndex];
  }
  const key = String(id || '') + String((p && p.title) || '');
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) & 0x7fffffff;
  }
  const idx = hash % window.TRIP_COVERS.length;
  return window.TRIP_COVERS[idx];
};

window.escapeHtml = function(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

window.switchView = function(viewId) {
  document.querySelectorAll('.page-view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + viewId);
  if (target) target.classList.add('active');
};

// 啟動時抓一次即時匯率
window.loadLiveRates();
