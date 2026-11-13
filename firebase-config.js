// Firebase 設定（nien-trip 專案）
// 注意：databaseURL 請到 Firebase Console → Realtime Database 頁面確認，
// 網址和下面不一樣的話，改成頁面上顯示的那一個。

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
  apiKey: "AIzaSyAa3VDRzsGlWY5NPhWTMpnhLZev5ImJCJA",
  authDomain: "nien-trip.firebaseapp.com",
  databaseURL: "https://nien-trip-default-rtdb.firebaseio.com",
  projectId: "nien-trip",
  storageBucket: "nien-trip.firebasestorage.app",
  messagingSenderId: "659304143635",
  appId: "1:659304143635:web:9175c6836ba4f985c9d8e6",
  measurementId: "G-L7BC11Q0NG"
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
