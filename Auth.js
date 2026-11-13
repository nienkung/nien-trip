// 帳號登入（Firebase Email／密碼）：註冊、登入、忘記密碼、忘記帳號、會員專區
// 需在 dashboard.js 之後載入，會覆寫 initFirebaseAuthListener。

window.authMode = 'login';

const AUTH_ERR = {
  'auth/invalid-email': 'Email 格式不正確',
  'auth/missing-password': '請輸入密碼',
  'auth/weak-password': '密碼至少需要 6 個字元',
  'auth/email-already-in-use': '此 Email 已註冊，請直接登入',
  'auth/invalid-credential': 'Email 或密碼錯誤',
  'auth/wrong-password': 'Email 或密碼錯誤',
  'auth/user-not-found': 'Email 或密碼錯誤',
  'auth/too-many-requests': '嘗試次數過多，請稍後再試',
  'auth/network-request-failed': '網路連線失敗，請檢查網路',
  'auth/requires-recent-login': '為了安全，請登出後重新登入再試'
};

function authErrText(err) {
  return AUTH_ERR[err && err.code] || ('發生錯誤：' + (err && err.message ? err.message : err));
}

function authVal(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function authMsg(text, ok) {
  const el = document.getElementById('authMsg');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = ok ? 'var(--brand-main)' : '#D9534F';
}

function mzMsg(text, ok) {
  const el = document.getElementById('mzMsg');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = ok ? 'var(--brand-main)' : '#D9534F';
}

// 把 Firebase 使用者同步到前端狀態，並寫入 users 索引（忘記帳號用）
window.authSetUser = function(user) {
  if (!user) return;
  const name = user.displayName || (user.email || '').split('@')[0] || '會員';
  window.currentUser = { uid: user.uid, name: name, email: user.email || '' };
  const nameElem = document.getElementById('dashUserName');
  if (nameElem) nameElem.innerText = name;
  // 只有確定有名字時才寫入索引，避免註冊過程中先寫入 email 前綴
  if (user.displayName && window.dbUpdate && window.dbRef && window.db) {
    window.dbUpdate(window.dbRef(window.db, 'users/' + user.uid), {
      name: user.displayName,
      email: user.email || ''
    }).catch(() => {});
  }
};

window.initFirebaseAuthListener = function() {
  if (!window.auth || !window.onAuthStateChanged) return;
  window.onAuthStateChanged(window.auth, (user) => {
    if (user) {
      window.authSetUser(user);
      window.switchView('dashboard');
      window.initFirebaseProjectsSync();
    } else {
      window.currentUser = null;
      window.switchView('login');
    }
  });
};

// ===== 登入頁 =====

window.authSwitchMode = function(mode) {
  window.authMode = mode;
  const isReg = mode === 'register';
  document.getElementById('authNameRow').style.display = isReg ? 'block' : 'none';
  document.getElementById('authSubmitBtn').innerText = isReg ? '註冊並進入' : '登入';
  document.getElementById('authTabLogin').classList.toggle('active', !isReg);
  document.getElementById('authTabRegister').classList.toggle('active', isReg);
  document.getElementById('authPassword').setAttribute('autocomplete', isReg ? 'new-password' : 'current-password');
  authMsg('');
};

window.authSubmit = async function() {
  if (!window.auth) return authMsg('系統載入中，請稍候 2 秒再試');
  const email = authVal('authEmail');
  const pw = document.getElementById('authPassword').value;
  if (!email || !pw) return authMsg('請輸入 Email 與密碼');

  const btn = document.getElementById('authSubmitBtn');
  btn.disabled = true;
  try {
    if (window.authMode === 'register') {
      const name = authVal('authName');
      if (!name) return authMsg('請輸入名字（別人會看到這個名字）');
      if (pw.length < 6) return authMsg('密碼至少需要 6 個字元');
      const cred = await window.createUserWithEmailAndPassword(window.auth, email, pw);
      await window.updateProfile(cred.user, { displayName: name });
      // 註冊時登入狀態會先觸發，這裡補上正確名字
      window.authSetUser(window.auth.currentUser);
    } else {
      await window.signInWithEmailAndPassword(window.auth, email, pw);
    }
    document.getElementById('authPassword').value = '';
    authMsg('');
  } catch (err) {
    authMsg(authErrText(err));
  } finally {
    btn.disabled = false;
  }
};

window.authForgotPassword = async function() {
  const email = authVal('authEmail');
  if (!window.auth) return authMsg('系統載入中，請稍候 2 秒再試');
  if (!email) return authMsg('請先在上方輸入你的 Email，再按「忘記密碼」');
  try {
    await window.sendPasswordResetEmail(window.auth, email);
    authMsg('已寄出重設密碼信到 ' + email + '，請到信箱（含垃圾郵件）點連結設定新密碼', true);
  } catch (err) {
    authMsg(authErrText(err));
  }
};

// ===== 忘記帳號 =====

function maskEmail(email) {
  const parts = String(email).split('@');
  const u = parts[0] || '';
  const d = parts[1] || '';
  const head = u.length <= 2 ? u.slice(0, 1) : u.slice(0, 2);
  return head + '***@' + d;
}

window.openForgotUser = function() {
  document.getElementById('forgotUserName').value = '';
  document.getElementById('forgotUserResult').innerHTML = '';
  document.getElementById('forgotUserModal').style.display = 'flex';
};

window.closeForgotUser = function() {
  document.getElementById('forgotUserModal').style.display = 'none';
};

window.forgotUserSearch = async function() {
  const name = authVal('forgotUserName');
  const out = document.getElementById('forgotUserResult');
  if (!name) { out.textContent = '請輸入註冊時的名字'; return; }
  if (!window.dbGet || !window.db) { out.textContent = '系統載入中，請稍候再試'; return; }
  out.textContent = '查詢中…';
  try {
    const snap = await window.dbGet(window.dbRef(window.db, 'users'));
    const all = snap.val() || {};
    const hits = Object.values(all).filter(u => u && u.name === name && u.email);
    if (!hits.length) {
      out.textContent = '找不到這個名字的帳號，請確認與註冊時的名字相同（需完全一致）';
      return;
    }
    out.innerHTML = hits.map(u => '・' + escapeHtml(maskEmail(u.email))).join('<br>') +
      '<br><span style="color:var(--sub-text)">找到帳號後，可在登入頁按「忘記密碼」重設密碼。</span>';
  } catch (err) {
    out.textContent = '查詢失敗：' + (err.message || err);
  }
};

// ===== 會員專區 =====

window.openMemberZone = function() {
  const u = window.auth && window.auth.currentUser;
  if (!u) return;
  document.getElementById('mzName').value = u.displayName || '';
  document.getElementById('mzEmail').value = u.email || '';
  ['mzCurPw', 'mzNewPw', 'mzNewPw2'].forEach(id => { document.getElementById(id).value = ''; });
  mzMsg('');
  document.getElementById('memberZoneModal').style.display = 'flex';
};

window.closeMemberZone = function() {
  document.getElementById('memberZoneModal').style.display = 'none';
};

window.mzSaveName = async function() {
  const u = window.auth && window.auth.currentUser;
  if (!u) return;
  const name = authVal('mzName');
  if (!name) return mzMsg('名字不能空白');
  try {
    await window.updateProfile(u, { displayName: name });
    window.authSetUser(u);
    mzMsg('✅ 名字已更新', true);
  } catch (err) {
    mzMsg(authErrText(err));
  }
};

window.mzChangePassword = async function() {
  const u = window.auth && window.auth.currentUser;
  if (!u) return;
  const cur = document.getElementById('mzCurPw').value;
  const n1 = document.getElementById('mzNewPw').value;
  const n2 = document.getElementById('mzNewPw2').value;
  if (!cur) return mzMsg('請輸入目前的密碼');
  if (n1.length < 6) return mzMsg('新密碼至少需要 6 個字元');
  if (n1 !== n2) return mzMsg('兩次輸入的新密碼不一致');
  if (n1 === cur) return mzMsg('新密碼不能和目前密碼相同');
  try {
    const cred = window.EmailAuthProvider.credential(u.email, cur);
    await window.reauthenticateWithCredential(u, cred);
    await window.updatePassword(u, n1);
    ['mzCurPw', 'mzNewPw', 'mzNewPw2'].forEach(id => { document.getElementById(id).value = ''; });
    mzMsg('✅ 密碼已更新，下次請用新密碼登入', true);
  } catch (err) {
    if (err && (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password')) {
      mzMsg('目前的密碼不正確');
    } else {
      mzMsg(authErrText(err));
    }
  }
};
