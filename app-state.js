window.currentUser = null;
window.allProjects = {};
window.activeProjectId = null;
window.activeProjectData = null;

// 網站管理員（super 權限）：可對任何專案做所有操作，含重新指定團主
window.SUPER_ADMIN_EMAILS = [
  "moneynien@gmail.com"
];

window.EXCHANGE_RATES = {
  TWD: 1.0,
  JPY: 0.21,
  USD: 32.0,
  EUR: 34.5,
  GBP: 41.0,
  KRW: 0.023,
  THB: 0.92
};

// ===== 權限判定 =====

// 網站管理員（super）：email 在白名單中
window.isSuperAdmin = function() {
  return !!(window.currentUser && window.SUPER_ADMIN_EMAILS.includes(window.currentUser.email));
};

// 嚴格判定「這是不是我建立的專案」（不含管理員 override），用於大廳的「我的 / 他人」分區
window.isMyProject = function(projData) {
  if (!window.currentUser || !projData) return false;
  return projData.ownerUid === window.currentUser.uid || projData.ownerName === window.currentUser.name;
};

// 是否可管理（修改 / 刪除 / 改名 / 複製 / 重新指定團主）：團主本人或網站管理員
window.canManageProject = function(projData) {
  return window.isSuperAdmin() || window.isMyProject(projData);
};

// 舊函式保留相容（部分頁面可能仍引用）
window.isProjectOwner = function(projData) {
  if (!window.currentUser) return false;
  if (window.isSuperAdmin()) return true;
  if (!projData) return false;
  return projData.ownerUid === window.currentUser.uid || projData.ownerName === window.currentUser.name;
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

// 計算專案天數：優先用起迄日期，退而求其次用 itinerary（排除 D0 行前準備）
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

// 取得專案縮圖樣式：優先用手動指定的 coverIndex，否則依 id+標題決定性雜湊
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

// 防 XSS / 避免標題含特殊字元破版
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
