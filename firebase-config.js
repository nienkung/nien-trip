// Firebase 設定（新專案）
// 到 Firebase Console → 專案設定 → 一般 → 你的應用程式 → 「SDK 設定和組態」，
// 把 firebaseConfig 整段複製，取代下方的 PLACEHOLDER 值。
// 另外請到 Authentication → Sign-in method，啟用「電子郵件／密碼」。

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import {
  getDatabase, ref, push, set, get, update, remove, onValue
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";
import {
  getAuth, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, updatePassword, updateProfile,
  reauthenticateWithCredential, EmailAuthProvider,
  GoogleAuthProvider, signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "PLACEHOLDER_API_KEY",
  authDomain: "PLACEHOLDER.firebaseapp.com",
  databaseURL: "https://PLACEHOLDER-default-rtdb.firebaseio.com",
  projectId: "PLACEHOLDER",
  storageBucket: "PLACEHOLDER.appspot.com",
  messagingSenderId: "PLACEHOLDER",
  appId: "PLACEHOLDER"
};

const app = initializeApp(firebaseConfig);

// 資料庫
const db = getDatabase(app);
window.db = db;
window.dbRef = ref;
window.dbPush = push;
window.dbSet = set;
window.dbGet = get;
window.dbUpdate = update;
window.dbRemove = remove;
window.dbOnValue = onValue;

// 帳號（Email／密碼）
const auth = getAuth(app);
auth.languageCode = 'zh-TW'; // 重設密碼信改用繁體中文
window.auth = auth;
window.onAuthStateChanged = onAuthStateChanged;
window.signOut = signOut;
window.createUserWithEmailAndPassword = createUserWithEmailAndPassword;
window.signInWithEmailAndPassword = signInWithEmailAndPassword;
window.sendPasswordResetEmail = sendPasswordResetEmail;
window.updatePassword = updatePassword;
window.updateProfile = updateProfile;
window.reauthenticateWithCredential = reauthenticateWithCredential;
window.EmailAuthProvider = EmailAuthProvider;

// Google 登入（已隱藏，保留程式碼以備日後使用）
window.googleProvider = new GoogleAuthProvider();
window.signInWithPopup = signInWithPopup;
