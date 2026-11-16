/* 推播通知的背景程式：網頁關著的時候，負責接收並顯示通知 */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyC7FTosEOLykTePK-zGDKncK7AuK3bfJ4o',
  authDomain: 'my-pm-e9b70.firebaseapp.com',
  projectId: 'my-pm-e9b70',
  storageBucket: 'my-pm-e9b70.firebasestorage.app',
  messagingSenderId: '931392704452',
  appId: '1:931392704452:web:881d8bd62a062ceb8e1e91',
});

// 伺服器送的是「通知」格式，Firebase 會自動顯示，並在點擊時打開連結
firebase.messaging();
