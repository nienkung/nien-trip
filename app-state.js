window.currentUser = null;
window.allProjects = {};
window.activeProjectId = null;
window.activeProjectData = null;

// 超級管理員清單
window.SUPER_ADMIN_EMAILS = [
  "moneynien@gmail.com",
  "robertcl.kung@ogilvy.com"
];

// 多幣別動態匯率
window.EXCHANGE_RATES = {
  TWD: 1.0,
  JPY: 0.21,
  USD: 32.0,
  EUR: 34.5,
  GBP: 41.0,
  KRW: 0.023,
  THB: 0.92
};

// 權限判斷：是否為專案擁有者或超級管理員
window.isProjectOwner = function(projData) {
  if (!window.currentUser) return false;
  if (window.SUPER_ADMIN_EMAILS.includes(window.currentUser.email)) return true;
  if (!projData) return false;
  return projData.ownerUid === window.currentUser.uid || projData.ownerName === window.currentUser.name;
};

// 動態取得專案天數清單 (D0 ~ DN)
window.getDynamicProjectDays = function(projData) {
  if (!projData || !projData.itinerary) return ['D0', 'D1', 'D2', 'D3', 'D4', 'D5'];
  const keys = Object.keys(projData.itinerary);
  if (!keys.includes('D0')) keys.unshift('D0');
  return keys;
};

// 轉台幣換算
window.convertToTWD = function(amount, currency) {
  const rate = window.EXCHANGE_RATES[currency] || 1.0;
  return amount * rate;
};

// 切換頁面 View
window.switchView = function(viewId) {
  document.querySelectorAll('.page-view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + viewId);
  if (target) target.classList.add('active');
};
