// Firebase 設定（nien-trip）
// 環境切換：只有正式網址（nien-trip.vercel.app）使用正式資料，
// 其他所有網址（預覽網址、本機）一律使用測試資料，避免誤寫入正式站。

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
import {
  getStorage, ref as sRef, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";

const PROD_HOST = "nien-trip.vercel.app";

// 正式站（不要改動）
const PROD_CONFIG = {
  apiKey: "AIzaSyAa3VDRzsGlWY5NPhWTMpnhLZev5ImJCJA",
  authDomain: "nien-trip.firebaseapp.com",
  databaseURL: "https://nien-trip-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "nien-trip",
  storageBucket: "nien-trip.firebasestorage.app",
  messagingSenderId: "659304143635",
  appId: "1:659304143635:web:9175c6836ba4f985c9d8e6",
  measurementId: "G-L7BC11Q0NG"
};

// 測試站（nien-trip-test 專案）
const TEST_CONFIG = {
  apiKey: "AIzaSyA6poX8iQye3hiWynmMb0mHrgsbbkBFK7Q",
  authDomain: "nien-trip-test.firebaseapp.com",
  databaseURL: "https://nien-trip-test-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "nien-trip-test",
  storageBucket: "nien-trip-test.firebasestorage.app",
  messagingSenderId: "498296274393",
  appId: "1:498296274393:web:87fea48bbb17516ed2edc8"
};

const IS_PROD = window.location.hostname === PROD_HOST;
const firebaseConfig = IS_PROD ? PROD_CONFIG : TEST_CONFIG;
window.APP_ENV = IS_PROD ? "prod" : "test";

// 非正式站：畫面下方顯示提醒，避免把測試站當成正式站
if (!IS_PROD) {
  document.addEventListener("DOMContentLoaded", () => {
    const bar = document.createElement("div");
    bar.textContent = "🧪 測試環境（資料與正式站分開）";
    bar.style.cssText = "position:fixed;bottom:0;left:0;right:0;background:#F6AD55;color:#fff;text-align:center;font-size:12px;font-weight:800;padding:4px;z-index:9999;";
    document.body.appendChild(bar);
  });
}

const app = initializeApp(firebaseConfig);

// 發票／收據圖片（Firebase Storage）
window.storage = getStorage(app);
window.sRef = sRef;
window.uploadBytes = uploadBytes;
window.getDownloadURL = getDownloadURL;
window.deleteObject = deleteObject;

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
