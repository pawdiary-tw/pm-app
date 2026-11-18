/* 個人專案管理｜主程式
   資料目前存在瀏覽器（localStorage）。之後接 Firebase 時，只需要替換 Store 這一段。 */
(() => {
'use strict';

/* ================= 工具 ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
const pad = n => String(n).padStart(2, '0');
const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => fmt(new Date());
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return fmt(d); };
const diffDays = (a, b) => Math.round((parseD(a) - parseD(b)) / 864e5); // a − b
const weekStart = s => { const d = parseD(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return fmt(d); };
const md = s => { const d = parseD(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
const wd = s => '日一二三四五六'[parseD(s).getDay()];
const isoDate = iso => iso ? fmt(new Date(iso)) : null;
const inRange = (d, a, b) => !!d && d >= a && d <= b;
const lastDayOfMonth = ym => { const [y, m] = ym.split('-').map(Number); return fmt(new Date(y, m, 0)); };
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };

const STATUS = [
  { id: 'prep', name: '提案準備', bg: '#e3e5ea', fg: '#3d4352' },
  { id: 'proposed', name: '已提案', bg: '#d6e6f7', fg: '#1d4f86' },
  { id: 'rejected', name: '未通過需調整', bg: '#f6d4d1', fg: '#9b2018' },
  { id: 'approved', name: '已通過可執行', bg: '#cdeee6', fg: '#145c4c' },
  { id: 'doing', name: '執行中', bg: '#dcdcfa', fg: '#2f2f9a' },
  { id: 'booked', name: '已約拍攝', bg: '#fde9a6', fg: '#5c4100' },
  { id: 'footage', name: '過毛片／分類上傳', bg: '#cfeef2', fg: '#0f5560' },
  { id: 'assign', name: '待排剪輯', bg: '#ffe0ec', fg: '#8a1f4d' },
  { id: 'editing', name: '剪輯中', bg: '#a3261b', fg: '#ffffff' },
  { id: 'review_op', name: '過片中', bg: '#f7c9b0', fg: '#6e2f12' },
  { id: 'review_ip', name: 'IP👀', bg: '#55308d', fg: '#ffffff' },
  { id: 'revising', name: '修改中', bg: '#f4a340', fg: '#4a2600' },
  { id: 'done', name: '已完成✅', bg: '#2f6e4b', fg: '#e3f6ea' },
];
const ALL_COLS = () => STATUS.map(x => x.id);
const OPS_COLS = ['approved', 'booked', 'footage', 'assign', 'editing', 'review_ip', 'revising', 'done'];
const DEFAULT_COLS = {
  ops: OPS_COLS,
  edit: ['doing', 'editing', 'review_op', 'review_ip', 'revising', 'done'],
  shoot: ['approved', 'doing', 'editing', 'review_op', 'review_ip', 'revising', 'done'],
};
const platOrder = pl => { const all = ALL_COLS(); if (!pl || !Array.isArray(pl.order)) return all; const o = pl.order.filter(id => all.includes(id)); return o.concat(all.filter(id => !o.includes(id))); };
const platCols = pl => (pl && Array.isArray(pl.columns) && pl.columns.length) ? platOrder(pl).filter(id => pl.columns.includes(id)) : platOrder(pl);
const STATUS_RULE = {
  prep: '逾期看「提案日」',
  booked: '逾期看「拍攝日」',
  proposed: '等待回覆，不算逾期',
  rejected: '⚠️ 拖進這欄會跳出「退件紀錄」，退件次數 +1；逾期看「提案日」',
  revising: '⚠️ 拖進這欄會跳出「修改紀錄」（操盤手／IP）',
  done: '代表完成，會算進週報和月總結',
};
const statusRule = id => STATUS_RULE[id] || '逾期看「截止日」，沒填就看「上傳日」';
const DEFAULT_NAMES = { shoot: { doing: '拍攝中' }, edit: { doing: '初剪中' }, ops: { approved: '待約拍攝', done: 'IP 確認✅' } };
const stName = (id, platId) => { const pl = platId && Store.data && Store.data.settings.platforms.find(x => x.id === platId); return (pl && pl.colNames && pl.colNames[id]) || statusName(id); };
const statusPill = (id, platId) => { const st = STATUS.find(x => x.id === id) || { name: id, bg: '#ddd', fg: '#333' }; return `<span class="spill" style="--sb:${st.bg};--sf:${st.fg}">${esc(stName(id, platId))}</span>`; };
const ACTIVE = ['approved', 'doing', 'booked', 'footage', 'assign', 'editing', 'review_op', 'review_ip', 'revising'];
const statusName = id => (STATUS.find(s => s.id === id) || {}).name || id;
const PRIORITY = [{ id: 'high', name: '高' }, { id: 'mid', name: '中' }, { id: 'low', name: '低' }];
const priName = id => (PRIORITY.find(p => p.id === id) || {}).name || '中';
const priRank = { high: 0, mid: 1, low: 2 };

/* ================= 資料存取 ================= */
const DATA_KEY = 'pm.data.v1';
const UI_KEY = 'pm.ui.v1';

function defaultPlatforms() {
  return withCols([
    { id: 'ig', name: 'IG', color: '#d6336c', categories: ['貼文', 'Reels', '限動', '合作'] },
    { id: 'threads', name: 'Threads', color: '#5b6170', categories: ['貼文', '串文'] },
    { id: 'shopee', name: '蝦皮', color: '#ee4d2d', categories: ['活動', '商品上架', '廣告'] },
    { id: 'web', name: '官網', color: '#1f7fb8', categories: ['頁面更新', '活動頁', '部落格'] },
    { id: 'brand', name: '品牌', color: '#2f9e6e', categories: ['活動討論', '其他'] },
    { id: 'edit', name: '剪輯', color: '#7a4fd0', categories: ['IG Reels', '短影音', '長影片', '廣告素材'] },
    { id: 'shoot', name: '拍攝', color: '#b8611a', categories: ['商品拍攝', '形象拍攝', '短影音拍攝', '活動紀錄'] },
    { id: 'ops', name: '操盤', color: '#b5476b', categories: ['短影音'] },
  ]);
}
function withCols(list) {
  list.forEach(p => { if (!p.columns) p.columns = (DEFAULT_COLS[p.id] || ALL_COLS().filter(id => !['booked', 'footage', 'assign'].includes(id))).slice(); if (p.id === 'ops' && !p.order) p.order = OPS_COLS.concat(ALL_COLS().filter(id => !OPS_COLS.includes(id))); if (!p.colNames) p.colNames = Object.assign({}, DEFAULT_NAMES[p.id] || {}); });
  return list;
}

function emptyData() {
  return { version: 1, meta: { addedEdit: true, addedShoot: true, addedCols: true, addedNames: true, editDoing: true, opsV1: true }, settings: { platforms: defaultPlatforms(), ips: ['自己'] }, ipProfiles: {}, projects: {}, tasks: {}, topics: {} };
}

/* IP 需求的預設欄位（新增 IP 時自動帶入，之後每個 IP 可以各自增減） */
const IP_TEMPLATE = [
  ['剪輯風格', '例如：節奏快、跳剪、少轉場'],
  ['字幕字體', '例如：思源黑體 Bold'],
  ['字幕大小', '例如：主字幕 60、副字幕 40'],
  ['字幕顏色／描邊', '例如：白字＋黑色描邊 4'],
  ['美肌數據', '例如：磨皮 30、美白 10、瘦臉 5'],
  ['濾鏡／調色', '例如：偏暖、LUT 名稱'],
  ['片頭／片尾', '例如：固定片頭 3 秒、片尾放追蹤 CTA'],
  ['背景音樂', '例如：輕快、不要有人聲'],
  ['注意事項／禁忌', '例如：不拍側臉、不用紅色字'],
];
const newProfile = () => ({ fields: IP_TEMPLATE.map(([label, hint]) => ({ id: uid(), label, hint, value: '' })), updatedAt: Date.now() });
function ensureProfile(name) { const d = Store.data; d.ipProfiles = d.ipProfiles || {}; if (!d.ipProfiles[name]) d.ipProfiles[name] = newProfile(); return d.ipProfiles[name]; }

const Store = {
  data: null,
  load() {
    try { const raw = localStorage.getItem(DATA_KEY); if (raw) this.data = JSON.parse(raw); } catch (e) { this.data = null; }
    this.migrate();
  },
  migrate() {
    if (!this.data || !this.data.settings) { this.data = emptyData(); this.save(); }
    this.data.projects = this.data.projects || {};
    this.data.tasks = this.data.tasks || {};
    this.data.topics = this.data.topics || {};
    this.data.meta = this.data.meta || {};
    if (!this.data.meta.addedEdit) {
      if (!this.data.settings.platforms.some(p => p.id === 'edit' || p.name === '剪輯')) this.data.settings.platforms.push(defaultPlatforms().find(p => p.id === 'edit'));
      this.data.meta.addedEdit = true; this.save();
    }
    if (!this.data.meta.addedShoot) {
      const pls = this.data.settings.platforms;
      if (!pls.some(p => p.id === 'shoot' || p.name === '拍攝')) pls.push(defaultPlatforms().find(p => p.id === 'shoot'));
      const brand = pls.find(p => p.id === 'brand'); if (brand) brand.categories = brand.categories.filter(c => c !== '形象拍攝');
      this.data.meta.addedShoot = true; this.save();
    }
    if (!this.data.meta.addedNames) { this.data.settings.platforms.forEach(p => { p.colNames = Object.assign({}, DEFAULT_NAMES[p.id] || {}, p.colNames || {}); }); this.data.meta.addedNames = true; this.save(); }
    if (!this.data.meta.addedCols) { withCols(this.data.settings.platforms); this.data.meta.addedCols = true; this.save(); }
    if (!this.data.meta.editDoing) {
      const e = this.data.settings.platforms.find(p => p.id === 'edit');
      if (e) {
        e.colNames = e.colNames || {}; if (!e.colNames.doing) e.colNames.doing = '初剪中';
        if (Array.isArray(e.columns) && !e.columns.includes('doing')) e.columns.push('doing');
      }
      this.data.meta.editDoing = true; this.save();
    }
    if (!this.data.meta.opsV1) {
      // 「操盤」平台改用新流程；之前借用其他欄位名稱的卡片，依名稱搬到對應的新欄位
      const pls = this.data.settings.platforms;
      let ops = pls.find(p => p.id === 'ops') || pls.find(p => p.name === '操盤');
      if (!ops) { ops = defaultPlatforms().find(p => p.id === 'ops'); pls.push(ops); }
      else {
        const byName = { '排定拍攝日期': 'approved', '待約拍攝': 'approved', '約拍攝': 'approved', '拍攝中': 'booked', '已約拍攝': 'booked',
          '上傳毛片': 'footage', '過毛片': 'footage', '過毛片／分類上傳': 'footage', '待排剪輯': 'assign', '剪輯中': 'editing', '初剪中': 'editing',
          'IP👀': 'review_ip', '修改中': 'revising', '已完成✅': 'done', '已完成／已上傳': 'done', 'IP 確認✅': 'done' };
        let moved = 0;
        Object.values(this.data.projects).forEach(p => {
          if (p.platform !== ops.id) return;
          const shown = (ops.colNames || {})[p.status] || statusName(p.status);
          const to = byName[shown];
          if (to && to !== p.status) { p.status = to; moved++; }
        });
        this.data.meta.opsMoved = moved;
      }
      ops.columns = OPS_COLS.slice();
      ops.order = OPS_COLS.concat(ALL_COLS().filter(id => !OPS_COLS.includes(id)));
      ops.colNames = Object.assign({}, DEFAULT_NAMES.ops);
      this.data.meta.opsV1 = true; this.save();
    }
    if (!Array.isArray(this.data.settings.ips)) { this.data.settings.ips = ['自己']; this.save(); }
    this.data.ipProfiles = this.data.ipProfiles || {};
    // 移除舊版留下的範例資料
    if (this.data.meta.sample) {
      Object.values(this.data.tasks).forEach(t => { if (t.sample) delete this.data.tasks[t.id]; });
      Object.values(this.data.projects).forEach(p => { if (p.sample) delete this.data.projects[p.id]; });
      delete this.data.meta.sample; this.save();
    }
  },
  persistLocal() { try { localStorage.setItem(DATA_KEY, JSON.stringify(this.data)); } catch (e) { toast('無法儲存：瀏覽器不允許存資料（可能是無痕模式）'); } },
  save() { this.persistLocal(); scheduleSync(); },
  upsert(col, obj) { obj.updatedAt = Date.now(); this.data[col][obj.id] = obj; this.save(); render(); },
  remove(col, id) { delete this.data[col][id]; this.save(); render(); },
  saveSettings() { this.save(); render(); },
  replace(data) { this.data = data; this.migrate(); this.save(); render(); },
};
const DB = () => Store.data;

let UI = { boardPlat: 'all', boardCat: 'all', boardIp: 'all', calMonth: null, calSel: null, repTab: 'week', repWeek: null, repMonth: null };
try { Object.assign(UI, JSON.parse(localStorage.getItem(UI_KEY) || '{}')); } catch (e) { /* 忽略 */ }
const saveUI = () => { try { localStorage.setItem(UI_KEY, JSON.stringify({ boardPlat: UI.boardPlat, boardCat: UI.boardCat, boardIp: UI.boardIp, ipSel: UI.ipSel, ipTab: UI.ipTab, hideDoneBatches: UI.hideDoneBatches })); } catch (e) { /* 忽略 */ } };

/* ================= 雲端同步（Firebase） =================
   資料放在 users/{uid}/ 底下：tasks/{id}、projects/{id}、meta/state（設定、IP 需求）。
   每次存檔時比對「上次同步的內容」，只上傳有變動的文件。 */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyC7FTosEOLykTePK-zGDKncK7AuK3bfJ4o',
  authDomain: 'my-pm-e9b70.firebaseapp.com',
  projectId: 'my-pm-e9b70',
  storageBucket: 'my-pm-e9b70.firebasestorage.app',
  messagingSenderId: '931392704452',
  appId: '1:931392704452:web:881d8bd62a062ceb8e1e91',
};
const Sync = { available: false, user: null, db: null, auth: null, ready: false, synced: {}, timer: null, status: 'local', unsubs: [], pendingRender: false };
const SYNC_LABEL = { local: '☁️ 未登入', syncing: '☁️ 同步中…', ok: '☁️ 已同步', offline: '☁️ 離線中', error: '⚠️ 同步失敗' };
const SYNC_TEXT = { local: '尚未登入，資料只存在這台裝置', syncing: '正在同步…', ok: '已同步到雲端', offline: '目前離線，恢復連線後會自動同步', error: '同步失敗，請檢查網路後重新整理' };
function setSyncStatus(st) {
  Sync.status = st;
  const el = $('#syncBadge');
  if (el) { el.hidden = !Sync.available; el.dataset.state = st; el.textContent = SYNC_LABEL[st]; el.title = SYNC_TEXT[st]; }
}
const userRef = () => Sync.db.collection('users').doc(Sync.user.uid);
const plain = o => JSON.parse(JSON.stringify(o));
function currentDocs() {
  const d = Store.data, m = {};
  Object.values(d.tasks).forEach(t => { m['tasks/' + t.id] = t; });
  Object.values(d.topics || {}).forEach(t => { m['topics/' + t.id] = t; });
  Object.values(d.projects).forEach(p => { m['projects/' + p.id] = p; });
  m['meta/state'] = { version: d.version || 1, settings: d.settings, ipProfiles: d.ipProfiles || {}, meta: d.meta || {} };
  return m;
}
function scheduleSync() { if (!Sync.ready) return; clearTimeout(Sync.timer); Sync.timer = setTimeout(pushDiff, 400); }
async function pushDiff() {
  clearTimeout(Sync.timer); Sync.timer = null;
  if (!Sync.ready) return;
  const cur = currentDocs(), ops = [];
  Object.entries(cur).forEach(([k, v]) => { const j = JSON.stringify(v); if (Sync.synced[k] !== j) ops.push({ k, v, j }); });
  Object.keys(Sync.synced).forEach(k => { if (!(k in cur)) ops.push({ k, del: true }); });
  if (!ops.length) return;
  setSyncStatus(navigator.onLine === false ? 'offline' : 'syncing');
  ops.forEach(o => { if (o.del) delete Sync.synced[o.k]; else Sync.synced[o.k] = o.j; });
  try {
    for (let i = 0; i < ops.length; i += 400) {
      const batch = Sync.db.batch();
      ops.slice(i, i + 400).forEach(o => {
        const [col, id] = o.k.split('/');
        const ref = userRef().collection(col).doc(id);
        if (o.del) batch.delete(ref); else batch.set(ref, plain(o.v));
      });
      await batch.commit();
    }
    if (!Sync.timer) setSyncStatus('ok');
  } catch (e) {
    console.error(e);
    ops.forEach(o => { delete Sync.synced[o.k]; });
    setSyncStatus('error'); toast('同步失敗：' + (e.code || e.message));
  }
}
function applyCollection(col, snap) {
  const map = {};
  snap.forEach(doc => { map[doc.id] = doc.data(); });
  Store.data[col] = map;
  Object.keys(Sync.synced).forEach(k => { if (k.indexOf(col + '/') === 0) delete Sync.synced[k]; });
  Object.entries(map).forEach(([id, v]) => { Sync.synced[col + '/' + id] = JSON.stringify(v); });
}
function applyMeta(doc) {
  const v = doc.data();
  Store.data.version = v.version || 1;
  Store.data.settings = v.settings || { platforms: defaultPlatforms(), ips: ['自己'] };
  Store.data.ipProfiles = v.ipProfiles || {};
  Store.data.meta = v.meta || {};
  Sync.synced['meta/state'] = JSON.stringify(currentDocs()['meta/state']);
}
/* 有人正在打字或在回報頁修改文字時，先不要重畫畫面，免得內容被洗掉 */
function renderSafe() {
  const a = document.activeElement;
  const typing = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest('#view') && !(a.id === 'quickInput' && !a.value);
  if (typing || lastRoute === 'report' || $('#modalBg')) { Sync.pendingRender = true; return; }
  Sync.pendingRender = false; render();
}
document.addEventListener('focusout', () => setTimeout(() => { if (Sync.pendingRender && lastRoute !== 'report' && !$('#modalBg')) renderSafe(); }, 50));
async function startSync(user) {
  Sync.user = user; setSyncStatus('syncing');
  try {
    const ref = userRef();
    const metaDoc = await ref.collection('meta').doc('state').get();
    Sync.synced = {};
    if (!metaDoc.exists) {
      // 第一次登入：把這台裝置上的資料上傳
      Sync.ready = true; await pushDiff();
      toast('已開啟同步，這台裝置的資料已上傳到雲端');
    } else {
      // 雲端已有資料：以雲端為準
      const [ts, ps, tp] = await Promise.all([ref.collection('tasks').get(), ref.collection('projects').get(), ref.collection('topics').get()]);
      applyMeta(metaDoc); applyCollection('tasks', ts); applyCollection('projects', ps); applyCollection('topics', tp);
      Store.migrate(); Store.persistLocal();
      Sync.ready = true; render(); pushDiff();
    }
    listenRemote();
    setSyncStatus('ok');
  } catch (e) {
    console.error(e); setSyncStatus('error'); toast('無法連到雲端：' + (e.code || e.message));
  }
}
function listenRemote() {
  const ref = userRef();
  const handle = fn => snap => {
    if (snap.metadata.hasPendingWrites) return; // 自己剛寫入的，不用處理
    if (Sync.timer) { pushDiff(); return; } // 本機還有沒送出的修改，先送出，下一次再接收
    fn(snap); Store.migrate(); Store.persistLocal(); renderSafe();
  };
  const onErr = e => { console.error(e); setSyncStatus('error'); };
  Sync.unsubs.push(ref.collection('tasks').onSnapshot(handle(s => applyCollection('tasks', s)), onErr));
  Sync.unsubs.push(ref.collection('projects').onSnapshot(handle(s => applyCollection('projects', s)), onErr));
  Sync.unsubs.push(ref.collection('topics').onSnapshot(handle(s => applyCollection('topics', s)), onErr));
  Sync.unsubs.push(ref.collection('meta').doc('state').onSnapshot(handle(d => { if (d.exists) applyMeta(d); }), onErr));
}
function stopSync() { Sync.unsubs.forEach(u => u()); Sync.unsubs = []; Sync.ready = false; Sync.user = null; Sync.synced = {}; clearTimeout(Sync.timer); Sync.timer = null; }
function initSync() {
  if (!window.firebase || !FIREBASE_CONFIG.apiKey) { setSyncStatus('local'); return; }
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    Sync.auth = firebase.auth(); Sync.db = firebase.firestore();
    try { Sync.db.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) { /* 不支援離線快取也沒關係 */ }
    Sync.available = true; setSyncStatus('local');
    Sync.auth.getRedirectResult().catch(e => { if (e && e.code) toast('登入失敗：' + e.code); });
    Sync.auth.onAuthStateChanged(u => {
      if (u) { startSync(u); listenForeground(); }
      else { stopSync(); setSyncStatus('local'); render(); }
    });
    window.addEventListener('online', () => { if (Sync.ready) { setSyncStatus('syncing'); pushDiff().then(() => setSyncStatus('ok')); } });
    window.addEventListener('offline', () => { if (Sync.ready) setSyncStatus('offline'); });
  } catch (e) { console.error(e); Sync.available = false; }
}
async function signIn() {
  if (!Sync.available) { toast('這個網址不支援同步，請用正式網址開啟'); return; }
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try { await Sync.auth.signInWithPopup(provider); }
  catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(e.code)) return Sync.auth.signInWithRedirect(provider);
    if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') toast('登入失敗：' + (e.code || e.message));
  }
}
async function signOutSync() { try { await pushDiff(); } catch (e) { /* 忽略 */ } await Sync.auth.signOut(); toast('已登出，之後的修改只會存在這台裝置'); }

/* ================= 推播通知 ================= */
const VAPID_KEY = 'BJKOQhB-9eqIRctOet0EgD8JsddWhQ62YQavLKn6dVgDRt0ZbwEy1nXNmHjMMi9rCQzh8tedm9NEYIri6WfdDts';
const PUSH_KEY = 'pm.pushToken';
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* 忽略 */ } };
function pushState() {
  if (!Sync.available) return { ok: false, msg: '請用正式網址 pawdiary-tw.github.io/pm-app 開啟。' };
  if (isIOS && !isStandalone()) return { ok: false, ios: true, msg: 'iPhone 要先把網頁「加入主畫面」，再從主畫面的圖示打開，才能開啟通知。' };
  if (!('serviceWorker' in navigator) || !('Notification' in window) || !window.firebase || !firebase.messaging) return { ok: false, msg: '這個瀏覽器不支援推播通知。' };
  if (!VAPID_KEY) return { ok: false, msg: '推播還在設定中，完成後就能開啟。' };
  if (!Sync.user) return { ok: false, msg: '請先登入 Google 帳號。' };
  const on = !!lsGet(PUSH_KEY) && Notification.permission === 'granted';
  if (Notification.permission === 'denied') return { ok: false, msg: '通知權限被關掉了，請到系統設定 → 通知，允許這個網頁傳送通知。' };
  return { ok: true, on };
}
const tokenDocId = t => t.slice(-60).replace(/[^A-Za-z0-9_-]/g, '_');
async function enablePush() {
  const st = pushState(); if (!st.ok) { toast(st.msg); return; }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('沒有取得通知權限'); render(); return; }
    const reg = await navigator.serviceWorker.register('firebase-messaging-sw.js');
    await navigator.serviceWorker.ready;
    const token = await firebase.messaging().getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) throw new Error('沒有拿到裝置代碼');
    const device = isIOS ? 'iPhone／iPad' : /Android/.test(navigator.userAgent) ? 'Android' : '電腦';
    await userRef().collection('push').doc(tokenDocId(token)).set({ token, device, ua: navigator.userAgent.slice(0, 200), createdAt: Date.now() });
    lsSet(PUSH_KEY, token);
    toast('已開啟這台裝置的通知 🔔'); render();
  } catch (e) { console.error(e); toast('開啟通知失敗：' + (e.code || e.message)); }
}
async function disablePush() {
  const token = lsGet(PUSH_KEY);
  try {
    if (token && Sync.user) await userRef().collection('push').doc(tokenDocId(token)).delete();
    if (window.firebase && firebase.messaging) await firebase.messaging().deleteToken().catch(() => {});
  } catch (e) { console.error(e); }
  lsSet(PUSH_KEY, null); toast('已關閉這台裝置的通知'); render();
}
async function testLocalNotice() {
  try {
    const reg = await navigator.serviceWorker.getRegistration('firebase-messaging-sw.js') || await navigator.serviceWorker.ready;
    await reg.showNotification('🔔 測試通知', { body: '看到這則就代表這台裝置可以顯示通知了', icon: 'icon-192.png' });
  } catch (e) { toast('無法顯示通知：' + e.message); }
}
// 網頁開著的時候收到通知：用提示條顯示
function listenForeground() {
  try { firebase.messaging().onMessage(p => { const n = p.notification || {}; toast(`${n.title || '通知'}｜${(n.body || '').split('\n')[0]}`); }); } catch (e) { /* 不支援 */ }
}

/* ================= 資料查詢 ================= */
const allTasks = () => Object.values(DB().tasks);
const allProjects = () => Object.values(DB().projects);
const platform = id => DB().settings.platforms.find(p => p.id === id);
const platName = id => (platform(id) || {}).name || '其他';
const platColor = id => (platform(id) || {}).color || '#8a8f9c';
const projOf = t => t.projectId ? DB().projects[t.projectId] : null;
const taskPlatId = t => { const p = projOf(t); return p ? p.platform : null; };

/* 專案「現在要看哪個日期」判斷逾期 */
const EDIT_STAGES = ['assign', 'editing', 'review_op', 'review_ip', 'revising'];
const isMyEdit = p => ['自己', '我'].includes((p.editor || '').trim());
const noDeadline = p => p.platform === opsId() && EDIT_STAGES.includes(p.status) && !isMyEdit(p);
function projKey(p) {
  if (p.status === 'done' || p.status === 'proposed') return null;
  if (noDeadline(p)) return null;
  if (p.status === 'prep' || p.status === 'rejected') return p.proposeDate ? { date: p.proposeDate, label: '提案日' } : null;
  if (p.status === 'booked' && p.shootDate) return { date: p.shootDate, label: '拍攝日' };
  if (p.dueDate) return { date: p.dueDate, label: '截止日' };
  return p.launchDate ? { date: p.launchDate, label: '上傳日' } : null;
}
function dueBadge(date, T, prefix = '') {
  const n = diffDays(date, T);
  if (n < 0) return { cls: 'late', text: `${prefix}逾期 ${-n} 天` };
  if (n === 0) return { cls: 'warn', text: `${prefix}今天到期` };
  if (n === 1) return { cls: 'idle', text: `${prefix}明天` };
  return { cls: 'idle', text: `${prefix}${md(date)}（${wd(date)}）` };
}
function projBadge(p, T) {
  if (p.status === 'done') return { cls: 'ok', text: '已完成' };
  if (p.status === 'proposed') return { cls: 'info', text: '等老闆回覆' };
  if (noDeadline(p)) return { cls: 'idle', text: p.launchDate ? `預計上傳 ${md(p.launchDate)}` : stName(p.status, p.platform) };
  const k = projKey(p);
  if (!k) return { cls: 'idle', text: (p.status === 'prep' || p.status === 'rejected') ? '未填提案日' : '未填上傳日' };
  return dueBadge(k.date, T, k.label + ' ');
}
const sortTasks = arr => arr.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || priRank[a.priority] - priRank[b.priority]);
const overdueCount = () => {
  const T = today();
  return allTasks().filter(t => !t.done && t.due && t.due < T).length + allProjects().filter(p => { const k = projKey(p); return k && k.date < T; }).length;
};

/* ================= 共用畫面片段 ================= */
const badgeHTML = b => `<span class="badge ${b.cls}">${esc(b.text)}</span>`;
const platChip = (platId, extra) => `<span class="plat" style="--pc:${esc(platColor(platId))}">${esc(platId ? platName(platId) : '其他')}${extra ? '・' + esc(extra) : ''}</span>`;

function taskRow(t, T, opts = {}) {
  const p = projOf(t);
  const meta = [];
  meta.push(p ? platChip(p.platform, p.name) : platChip(null));
  if (t.due && !t.done) meta.push(badgeHTML(dueBadge(t.due, T)));
  else if (t.due) meta.push(`<span>${md(t.due)}</span>`);
  if (!t.done) meta.push(`<span class="pri pri-${t.priority}">${priName(t.priority)}</span>`);
  if (t.starredAt && !t.done) { const n = diffDays(T, t.starredAt); if (n >= 3) meta.push(`<span class="badge warn">已加星 ${n} 天</span>`); }
  const quick = opts.quickDue ? `<span class="quick-due"><button class="btn small" data-act="setDue" data-id="${t.id}" data-val="0">今天</button><button class="btn small" data-act="setDue" data-id="${t.id}" data-val="1">明天</button></span>` : '';
  return `<div class="row ${t.done ? 'done' : ''}" data-act="editTask" data-id="${t.id}">
    <button class="check" data-act="toggleDone" data-id="${t.id}" aria-label="${t.done ? '取消完成' : '標記完成'}">✓</button>
    <div class="row-main"><div class="row-title">${esc(t.title)}</div><div class="row-meta">${meta.join('')}</div></div>
    ${quick}
    ${t.done ? '' : `<button class="star ${t.starredAt ? 'on' : ''}" data-act="toggleStar" data-id="${t.id}" aria-label="${t.starredAt ? '取消今天要做' : '今天要做'}" title="今天要做">★</button>`}
  </div>`;
}
function projRow(p, T, label) {
  const b = label ? { cls: 'idle', text: label } : projBadge(p, T);
  return `<div class="row proj" data-act="editProject" data-id="${p.id}" style="--pc:${esc(platColor(p.platform))}">
    <div class="row-main"><div class="row-title">${esc(p.name)}</div>
    <div class="row-meta"><span class="kind">專案</span>${platChip(p.platform, p.category)}${p.ip ? `<span class="badge info">IP ${esc(p.ip)}</span>` : ''}${statusPill(p.status, p.platform)}${badgeHTML(b)}</div></div>
  </div>`;
}

/* ================= 今日任務 ================= */
function viewToday() {
  const T = today();
  const dateLabel = `${parseD(T).getMonth() + 1} 月 ${parseD(T).getDate()} 日　星期${wd(T)}`;
  const tasks = allTasks(), projects = allProjects();
  const open = tasks.filter(t => !t.done);
  const weekEnd = parseD(T).getDay() === 0 ? addDays(T, 7) : addDays(weekStart(T), 6);

  const lateT = sortTasks(open.filter(t => t.due && t.due < T));
  const todayT = sortTasks(open.filter(t => t.due === T));
  const starT = sortTasks(open.filter(t => t.starredAt && !(t.due && t.due <= T)));
  const weekT = sortTasks(open.filter(t => t.due && t.due > T && t.due <= weekEnd && !t.starredAt));
  const backlog = open.filter(t => !t.due && !t.starredAt).sort((a, b) => priRank[a.priority] - priRank[b.priority]);
  const doneToday = tasks.filter(t => t.done && isoDate(t.completedAt) === T);

  const pk = projects.map(p => ({ p, k: projKey(p) })).filter(x => x.k);
  const lateP = pk.filter(x => x.k.date < T).sort((a, b) => a.k.date.localeCompare(b.k.date));
  const todayP = pk.filter(x => x.k.date === T);
  const weekP = pk.filter(x => x.k.date > T && x.k.date <= weekEnd).sort((a, b) => a.k.date.localeCompare(b.k.date));

  const lateN = lateT.length + lateP.length;
  const banners = [];
  if (Sync.available && !Sync.user) banners.push(`<div class="banner info"><span>☁️ 登入 Google 帳號，手機和電腦就會同步</span><button class="btn small primary" data-act="signIn">用 Google 登入</button></div>`);
  { const st = Sync.user ? pushState() : null;
    if (st && !lsGet('pm.pushAskOff') && ((st.ok && !st.on) || st.ios)) banners.push(`<div class="banner info"><span>🔔 ${st.ios ? '把網頁加入主畫面後，就能每天早上收到今日任務通知' : '開啟通知，每天早上提醒今天要做的事和逾期項目'}</span><span style="display:flex;gap:6px">${st.ios ? '<button class="btn small primary" data-act="howInstall">怎麼加入主畫面</button>' : '<button class="btn small primary" data-act="pushOn">開啟通知</button>'}<button class="btn small ghost" data-act="pushAskOff">不用</button></span></div>`); }
  if (lateN) banners.push(`<div class="banner late"><span>⚠️ 你有 ${lateN} 項逾期</span></div>`);
  if (parseD(T).getDay() === 0) banners.push(`<div class="banner info"><span>📋 今天週日，要產生本週週報嗎？</span><button class="btn small primary" data-act="goWeekly">產生週報</button></div>`);

  const sec = (cls, title, rows, empty) => `<section class="sec ${cls}"><div class="sec-h">${title}<span class="n">${rows.length}</span></div>
    <div class="list">${rows.length ? rows.join('') : `<div class="empty">${empty}</div>`}</div></section>`;

  const lateRows = [...lateP.map(x => projRow(x.p, T)), ...lateT.map(t => taskRow(t, T))];
  const todayRows = [...todayP.map(x => projRow(x.p, T)), ...todayT.map(t => taskRow(t, T))];
  const weekRows = [...weekP.map(x => projRow(x.p, T)), ...weekT.map(t => taskRow(t, T))];

  return `<div class="page">
    <header class="page-h"><div><h1>今日任務</h1><p class="sub">${dateLabel}</p></div></header>
    ${banners.join('')}
    <form class="quick" id="quickForm" autocomplete="off">
      <input id="quickInput" type="text" placeholder="新增任務，輸入後按 Enter" aria-label="新增任務">
      <select id="quickWhen" aria-label="日期">${[['0', '今天'], ['1', '明天'], ['2', '後天'], ['pick', '選日期…'], ['none', '不設日期']].map(([v, n]) => `<option value="${v}" ${UI.qWhen === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <input type="date" id="quickDate" aria-label="選擇日期" value="${UI.qDate || T}" ${UI.qWhen === 'pick' ? '' : 'hidden'}>
      <select id="quickProj" aria-label="所屬專案">${projectOptions(UI.qProj && DB().projects[UI.qProj] ? UI.qProj : '')}</select>
      <button class="btn primary" type="submit">新增</button>
    </form>
    <div style="margin-top:-10px;text-align:right"><button class="btn ghost small" data-act="newTask">＋ 開啟完整表單（優先度、備註…）</button></div>
    ${!tasks.length && !projects.length ? '<div class="banner soft"><span>👋 歡迎！在上面輸入第一個任務，或到「看板」新增專案。</span></div>' : ''}
    ${lateRows.length ? sec('late', '🔴 逾期', lateRows, '') : ''}
    ${sec('today', '📅 今天到期', todayRows, '今天沒有到期的事')}
    ${sec('star', '⭐ 今天要做', starT.map(t => taskRow(t, T)), '點任務右邊的星號，就會放到這裡')}
    ${sec('', parseD(T).getDay() === 0 ? '下週' : '本週稍後', weekRows, '本週沒有其他到期項目')}
    <details class="sec" ${backlog.length && backlog.length <= 3 ? '' : ''}><summary><div class="sec-h">📥 待排程（沒有日期）<span class="n">${backlog.length}</span></div></summary>
      <div class="list" style="margin-top:6px">${backlog.length ? backlog.map(t => taskRow(t, T, { quickDue: true })).join('') : '<div class="empty">沒有待排程的任務</div>'}</div></details>
    ${doneToday.length ? `<details class="sec"><summary><div class="sec-h">✅ 今天完成<span class="n">${doneToday.length}</span></div></summary>
      <div class="list" style="margin-top:6px">${doneToday.map(t => taskRow(t, T)).join('')}</div></details>` : ''}
  </div>`;
}

/* ================= 專案看板 ================= */
/* 操盤進度：每個 IP、每一批目前在哪個階段 */
function opsProgress(ipFilter) {
  const pid = opsId(), pl = platform(pid);
  const ps = allProjects().filter(p => p.platform === pid && (!ipFilter || ipFilter === 'all' || p.ip === ipFilter));
  const groups = {};
  ps.forEach(p => { const k = `${p.ip || '未指定 IP'}|${p.batch || '未分批'}`; (groups[k] = groups[k] || []).push(p); });
  const order = platCols(pl);
  return Object.keys(groups).sort().map(k => {
    const [ip, batch] = k.split('|'), list = groups[k];
    const counts = {};
    list.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });
    const stages = order.concat(Object.keys(counts).filter(id => !order.includes(id))).filter(id => counts[id]).map(id => ({ id, name: stName(id, pid), n: counts[id] }));
    const done = counts.done || 0;
    return { key: `${ip}|${batch}`, ip, batch, total: list.length, done, stages, allDone: done === list.length };
  });
}
function opsProgressText(ipFilter) {
  const rows = opsProgress(ipFilter).filter(r => !r.allDone);
  if (!rows.length) return null;
  return rows.map(r => `【${r.ip}】${r.batch}　完成 ${r.done}/${r.total}\n　${r.stages.filter(x => x.id !== 'done').map(x => `${x.name} ${x.n}`).join('、')}`).join('\n');
}
function opsProgressHTML() {
  const rows = opsProgress(UI.boardIp);
  if (!rows.length) return '';
  const hideDone = UI.hideDoneBatches !== false;
  const shown = hideDone ? rows.filter(r => !r.allDone) : rows;
  const doneN = rows.filter(r => r.allDone).length;
  const pid = opsId();
  return `<section class="prog">
    <div class="prog-h"><h2>📊 操盤進度</h2><span class="hint">${hideDone && doneN ? `另有 ${doneN} 批已全部完成` : ''}</span><button class="btn small" data-act="progCopy" style="margin-left:auto">複製進度</button></div>
    ${shown.length ? shown.map(r => `<div class="prog-row">
      <button class="prog-name" data-act="boardBatch" data-val="${esc(r.key)}" title="只看這一批">${esc(r.ip)}・${esc(r.batch)}</button>
      <div class="bar"><i style="width:${Math.round(r.done / r.total * 100)}%"></i></div><span class="prog-n">${r.done}/${r.total}</span>
      <div class="prog-stages">${r.stages.map(x => `<span class="prog-st">${statusPill(x.id, pid)}<b>${x.n}</b></span>`).join('')}</div>
    </div>`).join('') : '<div class="empty" style="padding:6px 0;text-align:left">目前的批次都完成了 🎉</div>'}
  </section>`;
}

function viewBoard() {
  const T = today();
  const plats = DB().settings.platforms;
  if (UI.boardPlat !== 'all' && !platform(UI.boardPlat)) UI.boardPlat = 'all';
  const cur = platform(UI.boardPlat);
  if (!cur || (UI.boardCat !== 'all' && !cur.categories.includes(UI.boardCat))) UI.boardCat = 'all';
  const ips = DB().settings.ips;
  if (UI.boardIp !== 'all' && !ips.includes(UI.boardIp)) UI.boardIp = 'all';
  let list = allProjects().filter(p => (UI.boardPlat === 'all' || p.platform === UI.boardPlat) && (UI.boardCat === 'all' || p.category === UI.boardCat) && (UI.boardIp === 'all' || p.ip === UI.boardIp));
  // 批次＝同一個 IP 的同一批；整批都到最後一欄就算完成
  const bkey = p => p.batch ? `${p.ip || ''}|${p.batch}` : null;
  const groups = {};
  list.forEach(p => { const k = bkey(p); if (k) (groups[k] = groups[k] || []).push(p); });
  const keys = Object.keys(groups).sort();
  const multiIp = new Set(keys.map(k => k.split('|')[0])).size > 1;
  const bLabel = k => { const [ip, b] = k.split('|'); return multiIp ? `${ip}・${b}` : b; };
  const doneKeys = keys.filter(k => groups[k].every(p => p.status === 'done'));
  if (!UI.boardBatch || (UI.boardBatch !== 'all' && !keys.includes(UI.boardBatch))) UI.boardBatch = 'all';
  const hideDone = UI.hideDoneBatches !== false;
  let hiddenN = 0;
  if (UI.boardBatch !== 'all') list = list.filter(p => bkey(p) === UI.boardBatch);
  else if (hideDone && doneKeys.length) { const before = list.length; list = list.filter(p => !doneKeys.includes(bkey(p))); hiddenN = before - list.length; }
  const batchChips = keys.length ? `<div class="chips sub"><span class="hint" style="align-self:center">批次：</span>${[`<button class="chip" data-act="boardBatch" data-val="all" aria-pressed="${UI.boardBatch === 'all'}">全部</button>`]
    .concat(keys.map(k => `<button class="chip" data-act="boardBatch" data-val="${esc(k)}" aria-pressed="${UI.boardBatch === k}">${doneKeys.includes(k) ? '✅ ' : ''}${esc(bLabel(k))}</button>`)).join('')}
    <label class="toggle small" style="margin-left:8px"><input type="checkbox" id="hideDoneB" ${hideDone ? 'checked' : ''}> 隱藏已完成的批次</label>
    ${hiddenN ? `<span class="hint" style="align-self:center">（已收起 ${doneKeys.length} 批、${hiddenN} 張，點批次名稱可以單獨查看）</span>` : ''}</div>` : '';
  const ipChips = ips.length > 1 ? `<div class="chips sub"><span class="hint" style="align-self:center">IP：</span>${[`<button class="chip" data-act="boardIp" data-val="all" aria-pressed="${UI.boardIp === 'all'}">全部</button>`]
    .concat(ips.map(n => `<button class="chip" data-act="boardIp" data-val="${esc(n)}" aria-pressed="${UI.boardIp === n}">${esc(n)}</button>`)).join('')}</div>` : '';

  const platChips = [`<button class="chip" data-act="boardPlat" data-val="all" aria-pressed="${UI.boardPlat === 'all'}">全部</button>`]
    .concat(plats.map(p => `<button class="chip" data-act="boardPlat" data-val="${esc(p.id)}" aria-pressed="${UI.boardPlat === p.id}" style="--pc:${esc(p.color)}"><span class="dot"></span>${esc(p.name)}</button>`)).join('');
  const catChips = cur && cur.categories.length ? `<div class="chips sub">${[`<button class="chip" data-act="boardCat" data-val="all" aria-pressed="${UI.boardCat === 'all'}">全部分類</button>`]
    .concat(cur.categories.map(c => `<button class="chip" data-act="boardCat" data-val="${esc(c)}" aria-pressed="${UI.boardCat === c}">${esc(c)}</button>`)).join('')}</div>` : '';

  const want = cur ? platCols(cur) : ALL_COLS();
  const shown = (cur ? platOrder(cur) : ALL_COLS()).map(id => STATUS.find(x => x.id === id)).filter(s => want.includes(s.id) || list.some(p => p.status === s.id));
  const firstCol = shown[0] ? shown[0].id : 'prep';
  const cols = shown.map(s => {
    let items = list.filter(p => p.status === s.id);
    if (s.id === 'done') items.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
    else items.sort((a, b) => priRank[a.priority] - priRank[b.priority] || ((projKey(a) || {}).date || '9999').localeCompare((projKey(b) || {}).date || '9999'));
    return `<div class="col" data-status="${s.id}">
      <div class="col-h"><span>${statusPill(s.id, cur ? cur.id : null)}<span class="n">${items.length}</span></span>${s.id === firstCol ? `<button class="icon-btn" data-act="newProject" data-val="${s.id}" aria-label="新增專案" title="新增專案">＋</button>` : ''}</div>
      <div class="cards">${items.map(p => cardHTML(p, T)).join('')}</div></div>`;
  }).join('');

  return `<div class="page wide">
    <header class="page-h"><div><h1>專案看板</h1><p class="sub">共 ${list.length} 個專案</p></div><button class="btn primary" data-act="newProject">＋ 新增專案</button></header>
    <div class="filters"><div class="chips">${platChips}</div>${catChips}${ipChips}${batchChips}</div>
    ${cur && cur.id === opsId() ? opsProgressHTML() : ''}
    <div class="board-wrap" id="boardWrap"><div class="board" id="board">${cols}</div></div>
    <p class="hint">電腦：直接拖拉卡片換欄位。手機：按住卡片約半秒，感覺到震動後再拖。也可以點開專案改狀態。</p>
  </div>`;
}
function cardHTML(p, T) {
  const tasks = allTasks().filter(t => t.projectId === p.id);
  const doneN = tasks.filter(t => t.done).length;
  const dates = [];
  if (p.proposeDate) dates.push(`提案 ${md(p.proposeDate)}`);
  if (p.shootDate) dates.push(`拍攝 ${md(p.shootDate)}`);
  if (p.dueDate) dates.push(`截止 ${md(p.dueDate)}`);
  if (p.launchDate) dates.push(`上傳 ${md(p.launchDate)}`);
  const foot = [badgeHTML(projBadge(p, T))];
  if (p.ip) foot.push(`<span class="badge info">IP ${esc(p.ip)}</span>`);
  if (p.batch) foot.push(`<span class="badge idle">🎬 ${esc(p.batch)}</span>`);
  if (p.footage && p.footage.length) { const d = p.footage.filter(x => x.done).length; foot.push(`<span class="badge ${d === p.footage.length ? 'ok' : 'warn'}">🎞 毛片 ${d}/${p.footage.length}</span>`); }
  if (p.editor) foot.push(`<span class="badge idle">✂️ ${esc(p.editor)}</span>`);
  if (p.revisions.length) foot.push(`<span class="badge late">退件 ${p.revisions.length}</span>`);
  if (editsOf(p).length) foot.push(`<span class="badge warn">修改 ${editsOf(p).length}</span>`);
  if (tasks.length) foot.push(`<span class="badge idle">任務 ${doneN}/${tasks.length}</span>`);
  return `<article class="card" data-id="${p.id}" style="--pc:${esc(platColor(p.platform))}" tabindex="0">
    <div class="card-top">${platChip(p.platform, p.category)}${p.status !== 'done' ? `<span class="pri pri-${p.priority}">${priName(p.priority)}</span>` : ''}</div>
    <div class="card-title">${esc(p.name)}</div>
    ${dates.length ? `<div class="card-dates">${dates.join('<span>·</span>')}</div>` : ''}
    <div class="card-foot">${foot.join('')}</div>
  </article>`;
}

/* 拖拉（滑鼠＋手機長按） */
const drag = { s: null, suppressClick: false };
function onBoardPointerDown(e) {
  const card = e.target.closest('.card');
  if (!card || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const s = drag.s = { card, id: card.dataset.id, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, active: false, touch: e.pointerType !== 'mouse' };
  if (s.touch) s.timer = setTimeout(() => { if (drag.s === s) beginDrag(); }, 380);
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragUp);
  window.addEventListener('pointercancel', onDragCancel);
}
function beginDrag() {
  const s = drag.s; if (!s) return;
  s.active = true;
  const r = s.card.getBoundingClientRect();
  s.offX = s.x0 - r.left; s.offY = s.y0 - r.top;
  s.ghost = s.card.cloneNode(true); s.ghost.classList.add('ghost'); s.ghost.style.width = r.width + 'px';
  document.body.appendChild(s.ghost);
  s.card.classList.add('dragging');
  if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { /* 忽略 */ } }
  placeGhost();
  const loop = () => { if (drag.s !== s || !s.active) return; autoScroll(); s.raf = requestAnimationFrame(loop); };
  s.raf = requestAnimationFrame(loop);
}
function placeGhost() {
  const s = drag.s; if (!s || !s.ghost) return;
  s.ghost.style.left = (s.x - s.offX) + 'px'; s.ghost.style.top = (s.y - s.offY) + 'px';
  const col = colAt(s.x, s.y);
  $$('.col.over').forEach(c => { if (c !== col) c.classList.remove('over'); });
  if (col) col.classList.add('over');
}
function autoScroll() {
  const s = drag.s, wrap = $('#boardWrap'); if (!s || !wrap) return;
  const r = wrap.getBoundingClientRect(), edge = 48;
  if (s.x < r.left + edge) wrap.scrollLeft -= 12; else if (s.x > r.right - edge) wrap.scrollLeft += 12;
  if (s.y < 80) window.scrollBy(0, -10); else if (s.y > window.innerHeight - 90) window.scrollBy(0, 10);
  placeGhost();
}
function colAt(x, y) { const el = document.elementFromPoint(x, y); return el ? el.closest('.col') : null; }
function onDragMove(e) {
  const s = drag.s; if (!s) return;
  s.x = e.clientX; s.y = e.clientY;
  if (!s.active) {
    const dist = Math.hypot(s.x - s.x0, s.y - s.y0);
    if (s.touch) { if (dist > 10) endDrag(); return; }
    if (dist > 6) beginDrag(); else return;
  }
  placeGhost();
}
function onDragUp() {
  const s = drag.s; if (!s) return;
  if (s.active) {
    const col = colAt(s.x, s.y);
    const to = col && col.dataset.status;
    drag.suppressClick = true; setTimeout(() => { drag.suppressClick = false; }, 60);
    endDrag();
    const p = DB().projects[s.id];
    if (p && to && to !== p.status) changeStatus(p, to);
    return;
  }
  endDrag();
}
function onDragCancel() { endDrag(); }
function endDrag() {
  const s = drag.s; if (!s) return;
  clearTimeout(s.timer); if (s.raf) cancelAnimationFrame(s.raf);
  if (s.ghost) s.ghost.remove();
  s.card.classList.remove('dragging');
  $$('.col.over').forEach(c => c.classList.remove('over'));
  drag.s = null;
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragUp);
  window.removeEventListener('pointercancel', onDragCancel);
}
document.addEventListener('touchmove', e => { if (drag.s && drag.s.active) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('.card')) e.preventDefault(); });

/* 狀態變更（含退件） */
function applyStatus(p, to) {
  if (to === 'done' && p.status !== 'done') p.completedAt = new Date().toISOString();
  if (to !== 'done') p.completedAt = null;
  p.status = to;
}
function changeStatus(p, to) {
  if (to === 'rejected' && p.status !== 'rejected') { askRejection(p); return; }
  if (to === 'revising' && p.status !== 'revising') { askEdit(p); return; }
  applyStatus(p, to);
  Store.upsert('projects', p);
  toast(`「${p.name}」→ ${stName(to, p.platform)}`);
}
function askRejection(p, afterSave) {
  const n = p.revisions.length + 1;
  openModal(`<div class="modal-h"><h2>退件紀錄｜第 ${n} 次</h2><button class="icon-btn" data-act="closeModal" aria-label="關閉">✕</button></div>
    <div class="modal-b">
      <p class="sub" style="margin:0">「${esc(p.name)}」移到「未通過需調整」，請記下老闆的修改意見。</p>
      <label class="f"><span>退件日期</span><input type="date" id="rjDate" value="${today()}"></label>
      <label class="f"><span>修改意見</span><textarea id="rjNote" rows="4" placeholder="例如：語氣太硬，要更生活化"></textarea></label>
    </div>
    <div class="modal-f"><div class="r"><button class="btn" data-act="closeModal">取消</button><button class="btn primary" id="rjSave">記錄並移動</button></div></div>`);
  $('#rjNote').focus();
  $('#rjSave').onclick = () => {
    const note = $('#rjNote').value.trim();
    p.revisions.push({ id: uid(), date: $('#rjDate').value || today(), note: note || '（未填寫意見）' });
    applyStatus(p, 'rejected');
    closeModal();
    Store.upsert('projects', p);
    toast(`已記錄退件第 ${p.revisions.length} 次`);
    if (afterSave) afterSave();
  };
}

/* 修改紀錄（剪輯完成後的審核意見） */
const REVIEWERS = { op: '操盤手', ip: 'IP' };
const reviewerName = (by, p) => by === 'ip' ? `IP${p && p.ip ? ' ' + p.ip : ''}` : '操盤手';
const editsOf = p => p.edits || [];
function askEdit(p) {
  const n = editsOf(p).length + 1;
  openModal(`<div class="modal-h"><h2>修改紀錄｜第 ${n} 次</h2><button class="icon-btn" data-act="closeModal" aria-label="關閉">✕</button></div>
    <div class="modal-b">
      <p class="sub" style="margin:0">「${esc(p.name)}」移到「修改中」，請記下是誰要求修改、改什麼。</p>
      <div class="f"><span style="font-size:.82rem;font-weight:500;color:var(--muted)">誰的審核意見</span>
        <div class="seg" id="edBy"><button type="button" data-val="op" aria-pressed="${p.status !== 'review_ip'}">操盤手過審</button><button type="button" data-val="ip" aria-pressed="${p.status === 'review_ip'}">IP 過審${p.ip ? `（${esc(p.ip)}）` : ''}</button></div></div>
      <label class="f"><span>日期</span><input type="date" id="edDate" value="${today()}"></label>
      <label class="f"><span>修改意見</span><textarea id="edNote" rows="4" placeholder="例如：字幕太小、第 2 段節奏放慢"></textarea></label>
    </div>
    <div class="modal-f"><div class="r"><button class="btn" data-act="closeModal">取消</button><button class="btn primary" id="edSave">記錄並移動</button></div></div>`);
  $$('#edBy button').forEach(b => b.onclick = () => $$('#edBy button').forEach(x => x.setAttribute('aria-pressed', x === b)));
  $('#edNote').focus();
  $('#edSave').onclick = () => {
    const by = $('#edBy [aria-pressed="true"]').dataset.val;
    p.edits = editsOf(p).concat([{ id: uid(), date: $('#edDate').value || today(), note: $('#edNote').value.trim() || '（未填寫意見）', by }]);
    applyStatus(p, 'revising');
    closeModal();
    Store.upsert('projects', p);
    toast(`已記錄修改第 ${p.edits.length} 次（${REVIEWERS[by]}）`);
  };
}

/* ================= 日曆 ================= */
function calendarEvents() {
  const map = {};
  const add = (d, ev) => { if (!d) return; (map[d] = map[d] || []).push(ev); };
  const T = today();
  allTasks().forEach(t => { if (t.due) add(t.due, { kind: 'task', t, plat: taskPlatId(t), text: t.title, done: t.done, late: !t.done && t.due < T }); });
  allProjects().forEach(p => {
    const done = p.status === 'done';
    add(p.proposeDate, { kind: 'proj', p, plat: p.platform, text: '提案・' + p.name, label: '提案日', done });
    add(p.shootDate, { kind: 'proj', p, plat: p.platform, text: '拍攝・' + p.name, label: '拍攝日', done });
    add(p.dueDate, { kind: 'proj', p, plat: p.platform, text: '截止・' + p.name, label: '截止日', done });
    add(p.launchDate, { kind: 'proj', p, plat: p.platform, text: '上傳・' + p.name, label: '上傳日', done });
  });
  return map;
}
function viewCalendar() {
  const T = today();
  if (!UI.calMonth) UI.calMonth = T.slice(0, 7);
  if (!UI.calSel) UI.calSel = T;
  const [y, m] = UI.calMonth.split('-').map(Number);
  const first = `${UI.calMonth}-01`;
  const start = weekStart(first);
  const evs = calendarEvents();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    if (i >= 35 && d.slice(0, 7) !== UI.calMonth) break;
    const list = evs[d] || [];
    const shown = list.slice(0, 3).map(e => `<span class="ev ${e.done ? 'done' : ''} ${e.late ? 'late' : ''}" style="--pc:${esc(platColor(e.plat))}">${esc(e.text)}</span>`).join('');
    const dots = list.slice(0, 5).map(e => `<i style="--pc:${esc(platColor(e.plat))}"></i>`).join('');
    cells.push(`<button class="day ${d.slice(0, 7) !== UI.calMonth ? 'out' : ''} ${d === T ? 'is-today' : ''} ${d === UI.calSel ? 'sel' : ''}" data-act="pickDay" data-val="${d}" aria-label="${md(d)}，${list.length} 個項目">
      <span class="dn">${parseD(d).getDate()}</span>${shown}${list.length > 3 ? `<span class="more">還有 ${list.length - 3} 項</span>` : ''}<span class="dots">${dots}</span></button>`);
  }
  const sel = evs[UI.calSel] || [];
  const selRows = sel.map(e => e.kind === 'task' ? taskRow(e.t, T) : projRow(e.p, T, e.label)).join('');
  const legend = DB().settings.platforms.map(p => `<span class="plat" style="--pc:${esc(p.color)}">${esc(p.name)}</span>`).join('') + `<span class="plat" style="--pc:#8a8f9c">其他任務</span>`;
  return `<div class="page wide">
    <header class="page-h"><h1>日曆</h1>
      <div class="cal-h"><button class="btn small" data-act="calMove" data-val="-1" aria-label="上個月">‹</button><h2>${y} 年 ${m} 月</h2><button class="btn small" data-act="calMove" data-val="1" aria-label="下個月">›</button><button class="btn small" data-act="calToday">今天</button></div></header>
    <div class="legend">${legend}</div>
    <div class="cal">${'一二三四五六日'.split('').map(c => `<div class="dow">${c}</div>`).join('')}${cells.join('')}</div>
    <section class="sec"><div class="sec-h">${md(UI.calSel)}（${wd(UI.calSel)}）<span class="n">${sel.length}</span></div>
      <div class="list">${selRows || '<div class="empty">這天沒有到期項目</div>'}</div></section>
  </div>`;
}

/* ================= 回報 ================= */
const tagP = p => `【${platName(p.platform)}${p.ip && p.ip !== '自己' ? '｜' + p.ip : ''}】`;
const tagT = t => { const p = projOf(t); return p ? tagP(p) : '【其他】'; };

function genWeekly(ws) {
  const T = today();
  const we = addDays(ws, 6), nws = addDays(ws, 7), nwe = addDays(ws, 13);
  const ref = T < we ? T : addDays(we, 1); // 本週看今天；過去的週看週末結束時
  const tasks = allTasks(), projects = allProjects();
  const L = [];
  L.push(`📋 週報｜${md(ws)}（一）– ${md(we)}（日）`, '');

  const doneP = projects.filter(p => p.status === 'done' && inRange(isoDate(p.completedAt), ws, we));
  const doneT = tasks.filter(t => t.done && inRange(isoDate(t.completedAt), ws, we));
  L.push(`✅ 本週完成（${doneP.length + doneT.length}）`);
  doneP.forEach(p => L.push(`${tagP(p)}${p.name} 已完成／已上傳`));
  doneT.forEach(t => { const p = projOf(t); L.push(`${tagT(t)}${t.title}${p ? `（${p.name}）` : ''}`); });
  if (!doneP.length && !doneT.length) L.push('（本週沒有完成項目）');
  L.push('');

  L.push('⚠️ 需注意／調整');
  const att = [];
  let revN = 0;
  projects.forEach(p => {
    const inWeek = p.revisions.filter(r => inRange(r.date, ws, we));
    if (!inWeek.length) return;
    revN += inWeek.length;
    const last = inWeek[inWeek.length - 1];
    att.push(`・${tagP(p)}${p.name}｜退件第 ${p.revisions.indexOf(last) + 1} 次\n　修改意見：${last.note}`);
  });
  let editN = 0;
  projects.forEach(p => {
    const inWeek = editsOf(p).filter(r => inRange(r.date, ws, we));
    if (!inWeek.length) return;
    editN += inWeek.length;
    const last = inWeek[inWeek.length - 1];
    const wo = inWeek.filter(r => r.by !== 'ip').length;
    att.push(`・${tagP(p)}${p.name}｜本週修改 ${inWeek.length} 次（操盤手 ${wo}、IP ${inWeek.length - wo}），累計 ${editsOf(p).length} 次\n　最新意見（${reviewerName(last.by, p)}）：${last.note}`);
  });
  const lateItems = [];
  tasks.forEach(t => {
    if (!t.due || t.due >= ref) return;
    const c = isoDate(t.completedAt);
    if (t.done && c && c < ref) return;
    lateItems.push({ d: t.due, s: `・${tagT(t)}${t.title}｜逾期 ${diffDays(ref, t.due)} 天（原定 ${md(t.due)}）` });
  });
  projects.forEach(p => { const k = projKey(p); if (k && k.date < ref) lateItems.push({ d: k.date, s: `・${tagP(p)}${p.name}｜${k.label}逾期 ${diffDays(ref, k.date)} 天（原定 ${md(k.date)}）` }); });
  lateItems.sort((a, b) => a.d.localeCompare(b.d)).forEach(x => att.push(x.s));
  L.push(...(att.length ? att : ['（無）']), '');

  L.push(`📅 下週預計（${md(nws)} – ${md(nwe)}）`);
  const next = [];
  projects.filter(p => p.status !== 'done').forEach(p => {
    [['proposeDate', '提案'], ['shootDate', '拍攝'], ['dueDate', '截止'], ['launchDate', '上傳']].forEach(([f, lab]) => { if (inRange(p[f], nws, nwe)) next.push({ d: p[f], s: `・${tagP(p)}${p.name}｜${md(p[f])} ${lab}` }); });
  });
  tasks.filter(t => !t.done && inRange(t.due, nws, nwe)).forEach(t => next.push({ d: t.due, s: `・${tagT(t)}${t.title}｜${md(t.due)} 完成` }));
  next.sort((a, b) => a.d.localeCompare(b.d));
  L.push(...(next.length ? next.map(x => x.s) : ['（下週尚無排定項目，可在這裡補充）']), '');

  const doing = projects.filter(p => ACTIVE.includes(p.status)).length;
  const opsTxt = opsProgressText('all');
  if (opsTxt) L.push('🎬 操盤進度', opsTxt, '');
  L.push(`📊 本週數據：完成 ${doneP.length + doneT.length}｜進行中專案 ${doing}｜退件 ${revN}｜修改 ${editN}｜逾期 ${lateItems.length}`);
  return L.join('\n');
}

function genMonthly(ym) {
  const T = today();
  const ms = `${ym}-01`, me = lastDayOfMonth(ym);
  const [y, m] = ym.split('-').map(Number);
  const tasks = allTasks(), projects = allProjects(), plats = DB().settings.platforms;
  const L = [];
  L.push(`📊 ${m} 月總結（${y}/${m}/1 – ${m}/${parseD(me).getDate()}）`, '');

  const doneP = projects.filter(p => p.status === 'done' && inRange(isoDate(p.completedAt), ms, me));
  const doneT = tasks.filter(t => t.done && inRange(isoDate(t.completedAt), ms, me));
  L.push(`✅ 完成：專案 ${doneP.length} 個／任務 ${doneT.length} 項`);

  const revByPlat = {};
  let revN = 0;
  projects.forEach(p => p.revisions.forEach(r => { if (inRange(r.date, ms, me)) { revN++; revByPlat[p.platform] = (revByPlat[p.platform] || 0) + 1; } }));
  const revDetail = Object.entries(revByPlat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${platName(k)} ${v}`).join('、');
  L.push(`🔁 退件：共 ${revN} 次${revDetail ? `（${revDetail}）` : ''}`);
  const edM = projects.flatMap(p => editsOf(p).filter(r => inRange(r.date, ms, me)));
  const edOp = edM.filter(r => r.by !== 'ip').length, edIp = edM.length - edOp;
  L.push(`✏️ 修改：共 ${edM.length} 次（操盤手 ${edOp}、IP ${edIp}）`);

  let fixed = 0, open = 0;
  const end = me < T ? me : addDays(T, -1);
  tasks.forEach(t => {
    if (!inRange(t.due, ms, end)) return;
    const c = isoDate(t.completedAt);
    if (t.done && c && c <= t.due) return;
    if (t.done) fixed++; else open++;
  });
  projects.forEach(p => {
    const d = p.dueDate || p.launchDate;
    if (!inRange(d, ms, end)) return;
    const c = isoDate(p.completedAt);
    if (p.status === 'done' && c && c <= d) return;
    if (p.status === 'done') fixed++; else open++;
  });
  L.push(`⏰ 逾期：${fixed + open} 項（已補完 ${fixed}、未完成 ${open}）`, '');

  L.push('📍 各平台進度');
  plats.forEach(pl => {
    const mine = projects.filter(p => p.platform === pl.id);
    const parts = [];
    const dn = doneP.filter(p => p.platform === pl.id).length;
    if (dn) parts.push(`完成 ${dn}`);
    const c = id => mine.filter(p => p.status === id).length;
    if (c('doing')) parts.push(`${stName('doing', pl.id)} ${c('doing')}`);
    if (c('editing')) parts.push(`剪輯中 ${c('editing')}`);
    if (c('review_op')) parts.push(`過片中 ${c('review_op')}`);
    if (c('review_ip')) parts.push(`IP 審核中 ${c('review_ip')}`);
    ['booked', 'footage', 'assign'].forEach(id => { if (c(id)) parts.push(`${stName(id, pl.id)} ${c(id)}`); });
    if (c('revising')) parts.push(`修改中 ${c('revising')}`);
    if (c('approved')) parts.push(`${stName('approved', pl.id) === '已通過可執行' ? '已通過' : stName('approved', pl.id)} ${c('approved')}`);
    if (c('prep') + c('proposed')) parts.push(`提案中 ${c('prep') + c('proposed')}`);
    if (c('rejected')) parts.push(`需調整 ${c('rejected')}`);
    L.push(`${pl.name}：${parts.length ? parts.join('｜') : '本月無進行中專案'}`);
  });
  L.push('');

  const ipNames = [...new Set(projects.map(p => p.ip).filter(Boolean))];
  if (ipNames.length) {
    L.push('👤 各 IP 進度');
    ipNames.forEach(n => {
      const mine = projects.filter(p => p.ip === n);
      const dn = doneP.filter(p => p.ip === n).length;
      const act = mine.filter(p => p.status !== 'done').length;
      const rv = mine.reduce((a, p) => a + p.revisions.filter(r => inRange(r.date, ms, me)).length, 0);
      const eds = mine.flatMap(p => editsOf(p).filter(r => inRange(r.date, ms, me)));
      const eo = eds.filter(r => r.by !== 'ip').length, ei = eds.length - eo;
      const doneMine = doneP.filter(p => p.ip === n);
      const avg = doneMine.length ? `｜平均每支修改 ${(doneMine.reduce((a, p) => a + editsOf(p).length, 0) / doneMine.length).toFixed(1)} 次` : '';
      const ct = (DB().ipProfiles[n] || {}).contract;
      if (ct && ct.total) { const fin = mine.filter(p => p.status === 'done' && p.platform === opsId()).length; L.push(`${n}：合約 ${ct.total} 支，已完成 ${fin} 支（${Math.round(fin / ct.total * 100)}%）`); }
      L.push(`${n}：完成 ${dn}｜進行中 ${act}${rv ? `｜退件 ${rv}` : ''}${eds.length ? `｜修改 ${eds.length}（操盤手 ${eo}、IP ${ei}）` : ''}${avg}`);
    });
    L.push('');
  }
  if (doneP.length) { L.push('🏁 本月完成的專案'); doneP.forEach(p => L.push(`・${tagP(p)}${p.name}`)); L.push(''); }

  const nm = addMonths(ym, 1), nms = `${nm}-01`, nme = lastDayOfMonth(nm);
  L.push('🗓 下月重點');
  const nx = projects.filter(p => p.status !== 'done' && inRange(p.launchDate, nms, nme)).sort((a, b) => a.launchDate.localeCompare(b.launchDate));
  L.push(...(nx.length ? nx.map(p => `・${tagP(p)}${p.name}｜${md(p.launchDate)} 上傳`) : ['（請補充下月重點）']));
  return L.join('\n');
}

function viewReport() {
  const T = today();
  if (!UI.repWeek) UI.repWeek = weekStart(T);
  if (!UI.repMonth) UI.repMonth = T.slice(0, 7);
  const isWeek = UI.repTab === 'week';
  const label = isWeek ? `${md(UI.repWeek)}（一）– ${md(addDays(UI.repWeek, 6))}（日）${UI.repWeek === weekStart(T) ? '　本週' : ''}`
    : `${UI.repMonth.replace('-', ' 年 ')} 月${UI.repMonth === T.slice(0, 7) ? '　本月' : ''}`;
  const text = isWeek ? genWeekly(UI.repWeek) : genMonthly(UI.repMonth);
  return `<div class="page">
    <header class="page-h"><h1>回報</h1>
      <div class="tabs" role="tablist"><button role="tab" aria-selected="${isWeek}" data-act="repTab" data-val="week">週報</button><button role="tab" aria-selected="${!isWeek}" data-act="repTab" data-val="month">月總結</button></div></header>
    <div class="period"><button class="btn small" data-act="repMove" data-val="-1" aria-label="上一期">‹</button><strong>${label}</strong><button class="btn small" data-act="repMove" data-val="1" aria-label="下一期">›</button></div>
    <textarea id="reportText" class="report" spellcheck="false" aria-label="回報內容">${esc(text)}</textarea>
    <div class="actions"><button class="btn" data-act="repRegen">重新產生</button><button class="btn primary" data-act="repCopy">一鍵複製</button></div>
    <p class="hint">內容可以直接修改，改完再按「一鍵複製」貼到 LINE 或 Email。按「重新產生」會清掉你的修改。</p>
  </div>`;
}

/* ================= IP 需求 ================= */
/* IP 操盤心智圖：8 個面向 × 5 題 */
const IP_PLAN = [
  { id: 'aud', no: '①', name: '目標受眾', group: 'st', qs: [
    ['誰在看？', '年齡／身分／生活情境'], ['最痛的 1–3 個問題？', ''], ['看完想得到什麼？', ''], ['什麼時候、在哪滑到？', ''], ['為什麼要追蹤這個 IP？', '']] },
  { id: 'per', no: '②', name: '人設定位', group: 'st', qs: [
    ['一句話定位？', '我是＿＿，幫＿＿解決＿＿'], ['專業／身分背書？', ''], ['個性標籤 3 個＋口頭禪？', ''], ['視覺符號？', '服裝／場景／字卡'], ['人設底線？', '絕對不做的事']] },
  { id: 'ben', no: '③', name: '對標分析', group: 'st', qs: [
    ['對標帳號 3–5 個？', '大／中／小各找'], ['他們的爆款公式？', ''], ['留言區都在問什麼？', ''], ['可以借的？要避開的？', ''], ['我們的差異化在哪？', '']] },
  { id: 'mon', no: '④', name: '變現路徑', group: 'st', qs: [
    ['收入來源？', '業配／商品／導購／服務'], ['轉換漏斗怎麼走？', '曝光→追蹤→信任→下單'], ['第一個要賣什麼？', ''], ['價格帶對得上受眾嗎？', ''], ['多久要看到第一筆收入？', '']] },
  { id: 'pil', no: '⑤', name: '內容支柱', group: 'ex', qs: [
    ['專業乾貨拍什麼？', '建立信任'], ['生活人設拍什麼？', '建立連結'], ['熱點娛樂拍什麼？', '擴大觸及'], ['轉換內容拍什麼？', '帶產品／服務'], ['四種內容比例？', '＿：＿：＿：＿']] },
  { id: 'fmt', no: '⑥', name: '形式與平台', group: 'ex', qs: [
    ['主要格式？', '口播／對話／vlog／圖文'], ['固定系列＋開場鉤子？', ''], ['平台怎麼分工？', 'IG／Threads／TikTok'], ['發文頻率？', '做得到的才算'], ['單支製作時間與成本？', '']] },
  { id: 'kpi', no: '⑦', name: '數據指標', group: 'ex', qs: [
    ['觸及目標？', '觀看數、非粉絲比例'], ['留存目標？', '3 秒留存、完播率'], ['互動目標？', '留言、分享、收藏'], ['轉換目標？', '追蹤、私訊、下單'], ['多久檢視一次？', '每週／每月']] },
  { id: 'val', no: '⑧', name: '驗證與風險', group: 'ex', qs: [
    ['最大的假設是什麼？', ''], ['用哪 10 支影片驗證？', ''], ['成功標準？', '先定好數字'], ['人設／爭議風險？', ''], ['停損點？', '沒效先調哪一格']] },
];
const PLAN_GROUPS = { st: { name: '策略：先想清楚（①–④）', color: 'green' }, ex: { name: '執行：做出來（⑤–⑧）', color: 'blue' } };
const planOf = n => { const p = ensureProfile(n); p.plan = p.plan || {}; return p.plan; };
const filled = v => !!(v && String(v).trim());
const branchDone = (plan, b) => b.qs.filter((_, i) => filled(plan[b.id + i])).length;
const planDone = plan => IP_PLAN.reduce((a, b) => a + branchDone(plan, b), 0) + (filled(plan.oneLine) ? 0 : 0);
function viewIpPlan(n) {
  const plan = planOf(n);
  const total = IP_PLAN.length * 5, done = planDone(plan);
  const overview = IP_PLAN.map(b => `<a class="mm-node mm-${b.group}" href="#ips" data-act="planJump" data-val="${b.id}"><b>${b.no} ${esc(b.name)}</b><span class="mm-n" id="pn-${b.id}">${branchDone(plan, b)}/5</span></a>`);
  const groups = ['st', 'ex'].map(g => `<section class="mm-group mm-${g}">
      <h3>${PLAN_GROUPS[g].name}</h3>
      ${IP_PLAN.filter(b => b.group === g).map(b => `<div class="mm-branch" id="pb-${b.id}">
        <div class="mm-pill"><b>${b.no} ${esc(b.name)}</b><span class="mm-n" id="pn2-${b.id}">${branchDone(plan, b)}/5</span></div>
        <div class="mm-qs">${b.qs.map(([q, hint], i) => `<label class="mm-q ${filled(plan[b.id + i]) ? 'done' : ''}">
            <span class="mm-qt">${esc(q)}</span>${hint && !hint.includes('＿') ? `<span class="mm-hint">${esc(hint)}</span>` : ''}
            <textarea rows="2" data-ipq="${b.id + i}" placeholder="${esc(hint.includes('＿') ? hint : '＿＿＿＿＿＿＿＿')}" aria-label="${esc(q)}">${esc(plan[b.id + i] || '')}</textarea>
          </label>`).join('')}</div>
      </div>`).join('')}
    </section>`).join('');
  return `<div class="mm">
    <div class="mm-top">
      <div class="mm-center"><span class="mm-ip">${esc(n)}</span>
        <input type="text" data-ipq="oneLine" value="${esc(plan.oneLine || '')}" placeholder="一句話：＿＿＿" aria-label="一句話介紹這個 IP"></div>
      <div class="mm-overview">${overview.join('')}</div>
    </div>
    <div class="mm-progress"><div class="bar"><i id="planBar" style="width:${Math.round(done / total * 100)}%"></i></div><span id="planCount">已回答 ${done} / ${total} 題</span>
      <span class="actions" style="margin-left:auto"><button class="btn primary" data-act="planCopy">複製心智圖</button></span></div>
    <p class="hint">填寫順序 ①→⑧，一格一題。策略（①–④）沒想清楚，執行（⑤–⑧）拍再多都是在賭；⑧ 的停損點跑完，就回頭修正對應那一格。內容會自動儲存。</p>
    ${groups}
  </div>`;
}
function ipPlanText(n) {
  const plan = planOf(n);
  const L = [`【${n}】IP 操盤心智圖`];
  if (filled(plan.oneLine)) L.push(`一句話：${plan.oneLine.trim()}`);
  ['st', 'ex'].forEach(g => {
    L.push('', `■ ${PLAN_GROUPS[g].name}`);
    IP_PLAN.filter(b => b.group === g).forEach(b => {
      L.push(`${b.no} ${b.name}`);
      b.qs.forEach(([q], i) => { const v = plan[b.id + i]; L.push(`・${q}${filled(v) ? '\n　' + String(v).trim().split('\n').join('\n　') : '（未填）'}`); });
    });
  });
  return L.join('\n');
}
document.addEventListener('input', e => {
  if (e.target.id === 'topicInput') autoGrow(e.target);
  const t = e.target; if (!t.dataset || !t.dataset.ipq || !UI.ipSel) return;
  const plan = planOf(UI.ipSel);
  plan[t.dataset.ipq] = t.value; ensureProfile(UI.ipSel).updatedAt = Date.now();
  if (t.tagName === 'TEXTAREA') { autoGrow(t); const box = t.closest('.mm-q'); if (box) box.classList.toggle('done', filled(t.value)); }
  IP_PLAN.forEach(b => { const c = branchDone(plan, b) + '/5'; ['pn-', 'pn2-'].forEach(p => { const el = document.getElementById(p + b.id); if (el) el.textContent = c; }); });
  const done = planDone(plan), total = IP_PLAN.length * 5;
  const bar = $('#planBar'); if (bar) bar.style.width = Math.round(done / total * 100) + '%';
  const cnt = $('#planCount'); if (cnt) cnt.textContent = `已回答 ${done} / ${total} 題`;
  const tn = $('#planTabN'); if (tn) tn.textContent = `${done}/${total}`;
  clearTimeout(ipSaveTimer); ipSaveTimer = setTimeout(() => Store.save(), 400);
});

/* ================= 選題池（每個 IP 一份） ================= */
const TOPIC_ST = [
  { id: 'idea', name: '構思中', cls: 'idle' },
  { id: 'boss', name: '老闆確認中', cls: 'info' },
  { id: 'boss_rej', name: '老闆退回', cls: 'late' },
  { id: 'ip', name: '給 IP 挑選', cls: 'warn' },
  { id: 'picked', name: 'IP 選中', cls: 'ok' },
  { id: 'spare', name: '備用', cls: 'idle' },
  { id: 'drop', name: '不用', cls: 'idle' },
];
const topicStName = id => (TOPIC_ST.find(x => x.id === id) || {}).name || id;
const opsId = () => { const pls = DB().settings.platforms; return ((pls.find(p => p.id === 'ops') || pls.find(p => p.name === '操盤')) || {}).id || 'ops'; };
const topicsOf = n => Object.values(DB().topics || {}).filter(t => t.ip === n).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
const topicSel = new Set();
function viewTopics(n) {
  const all = topicsOf(n);
  if (!UI.topicFilter) UI.topicFilter = 'all';
  const shown = UI.topicFilter === 'all' ? all : all.filter(t => t.status === UI.topicFilter);
  [...topicSel].forEach(id => { if (!all.some(t => t.id === id)) topicSel.delete(id); });
  const prof = ensureProfile(n), ct = prof.contract || {};
  const vids = allProjects().filter(p => p.ip === n && p.platform === opsId());
  const fin = vids.filter(p => p.status === 'done').length;
  const total = Number(ct.total) || 0;
  const batches = {};
  vids.forEach(p => { const k = p.batch || '未分批'; (batches[k] = batches[k] || []).push(p); });
  const batchRows = Object.entries(batches).sort((a, b) => a[0].localeCompare(b[0])).map(([k, ps]) => {
    const sd = ps.map(p => p.shootDate).filter(Boolean).sort()[0];
    return `<div class="batch-row"><b>🎬 ${esc(k)}</b><span>${sd ? `拍攝 ${md(sd)}（${wd(sd)}）` : '還沒排拍攝日'}</span><span>${ps.length} 支</span><span class="badge ${ps.every(p => p.status === 'done') ? 'ok' : 'idle'}">完成 ${ps.filter(p => p.status === 'done').length}/${ps.length}</span><button class="btn small ghost" data-act="goBatch" data-val="${esc(k === '未分批' ? '' : k)}">看板 →</button></div>`;
  }).join('');
  const chips = [`<button class="chip" data-act="topicFilter" data-val="all" aria-pressed="${UI.topicFilter === 'all'}">全部 ${all.length}</button>`]
    .concat(TOPIC_ST.map(st => { const c = all.filter(t => t.status === st.id).length; return c || UI.topicFilter === st.id ? `<button class="chip" data-act="topicFilter" data-val="${st.id}" aria-pressed="${UI.topicFilter === st.id}">${st.name} ${c}</button>` : ''; })).join('');
  const rows = shown.map(t => {
    const last = (t.revisions || []).slice(-1)[0];
    const proj = t.projectId && DB().projects[t.projectId];
    return `<div class="trow" data-tid="${t.id}">
      <input type="checkbox" data-tsel="${t.id}" ${topicSel.has(t.id) ? 'checked' : ''} aria-label="勾選">
      <div class="trow-main"><input type="text" class="ttitle" data-tfield="title" data-id="${t.id}" value="${esc(t.title)}" aria-label="選題名稱">
        ${last ? `<span class="hint">💬 老闆意見（${md(last.date)}）：${esc(last.note)}${t.revisions.length > 1 ? `　共退回 ${t.revisions.length} 次` : ''}</span>` : ''}
        ${proj ? `<span class="hint">🎬 已建卡：${esc(proj.batch || '')}・${esc(stName(proj.status, proj.platform))}</span>` : ''}</div>
      <select data-tfield="status" data-id="${t.id}" class="tstatus st-${t.status}" aria-label="狀態">${TOPIC_ST.map(st => `<option value="${st.id}" ${st.id === t.status ? 'selected' : ''}>${st.name}</option>`).join('')}</select>
      <button class="icon-btn" data-act="topicDel" data-id="${t.id}" aria-label="刪除選題">✕</button>
    </div>`;
  }).join('');
  const nSel = topicSel.size;
  return `<div class="topics">
    <div class="contract">
      <label class="ct-total">合約 <input type="number" min="0" id="ctTotal" value="${total || ''}" placeholder="30"> 支</label>
      <div class="bar"><i style="width:${total ? Math.min(100, Math.round(fin / total * 100)) : 0}%"></i></div>
      <span>已建卡 <b>${vids.length}</b>　已完成 <b>${fin}</b>${total ? `　剩 <b>${Math.max(0, total - fin)}</b> 支` : ''}</span>
    </div>
    ${batchRows ? `<div class="batches">${batchRows}</div>` : ''}
    <form class="quick" id="topicForm" autocomplete="off"><textarea id="topicInput" rows="1" placeholder="新增選題，按 Enter 送出（可一次貼上多行，一行一個）" aria-label="新增選題"></textarea><button class="btn primary" type="submit">新增</button></form>
    <div class="chips">${chips}</div>
    <div class="tbar">
      <label class="toggle small"><input type="checkbox" id="topicAll" ${shown.length && shown.every(t => topicSel.has(t.id)) ? 'checked' : ''}> 全選</label>
      <span class="hint">已勾選 ${nSel} 個</span>
      <select id="topicBulk" aria-label="改成狀態" ${nSel ? '' : 'disabled'}><option value="">把勾選的改成…</option>${TOPIC_ST.filter(x => x.id !== 'boss_rej').map(st => `<option value="${st.id}">${st.name}</option>`).join('')}</select>
      <button class="btn small primary" data-act="topicBatch" ${nSel ? '' : 'disabled'}>🎬 用勾選的建立拍攝批次</button>
      <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap"><button class="btn small" data-act="topicCopy" data-val="boss">複製給老闆確認</button><button class="btn small" data-act="topicCopy" data-val="ip">複製給 IP 挑選</button></span>
    </div>
    <div class="list">${rows || `<div class="empty">${all.length ? '這個分類沒有選題' : '還沒有選題。在上面輸入題目，按 Enter 新增。'}</div>`}</div>
    <p class="hint">流程：構思中 → 老闆確認中（退回會記錄意見）→ 給 IP 挑選 → IP 選中 → 勾選後建立拍攝批次，每個選題會變成「操盤」看板上的一張影片卡。沒選中的改成「備用」，下次可以再用。</p>
  </div>`;
}
function topicListText(n, st) {
  const ts = topicsOf(n).filter(t => t.status === st);
  const list = ts.length ? ts : topicsOf(n).filter(t => topicSel.has(t.id));
  if (!list.length) return null;
  const head = st === 'ip' ? `【${n}】選題清單，請挑選想拍的（共 ${list.length} 個）` : `【${n}】選題，請幫忙確認（共 ${list.length} 個）`;
  return head + '\n' + list.map((t, i) => `${i + 1}. ${t.title}`).join('\n');
}
function setTopicStatus(t, to) {
  if (to === 'boss_rej' && t.status !== 'boss_rej') { askTopicReject(t); return false; }
  t.status = to; t.updatedAt = Date.now(); return true;
}
function askTopicReject(t) {
  openModal(`<div class="modal-h"><h2>老闆退回｜第 ${(t.revisions || []).length + 1} 次</h2><button class="icon-btn" data-act="closeModal" aria-label="關閉">✕</button></div>
    <div class="modal-b"><p class="sub" style="margin:0">「${esc(t.title)}」</p>
      <label class="f"><span>日期</span><input type="date" id="trDate" value="${today()}"></label>
      <label class="f"><span>老闆的意見</span><textarea id="trNote" rows="3" placeholder="例如：角度太普通，改成上班族視角"></textarea></label></div>
    <div class="modal-f"><div class="r"><button class="btn" data-act="closeModal">取消</button><button class="btn primary" id="trSave">記錄</button></div></div>`);
  $('#trNote').focus();
  $('#trSave').onclick = () => {
    t.revisions = (t.revisions || []).concat([{ id: uid(), date: $('#trDate').value || today(), note: $('#trNote').value.trim() || '（未填寫意見）' }]);
    t.status = 'boss_rej'; t.updatedAt = Date.now();
    closeModal(); Store.upsert('topics', t); toast(`已記錄退回第 ${t.revisions.length} 次`);
  };
}
function openBatchModal(n) {
  const ts = topicsOf(n).filter(t => topicSel.has(t.id));
  const already = ts.filter(t => t.projectId && DB().projects[t.projectId]);
  const todo = ts.filter(t => !already.includes(t));
  if (!todo.length) { toast('勾選的選題都已經建立過影片卡了'); return; }
  const existing = new Set(allProjects().filter(p => p.ip === n && p.batch).map(p => p.batch));
  let k = existing.size + 1; while (existing.has(`第${k}批`)) k++;
  openModal(`<div class="modal-h"><h2>建立拍攝批次</h2><button class="icon-btn" data-act="closeModal" aria-label="關閉">✕</button></div>
    <div class="modal-b">
      <div class="f-row"><label class="f"><span>批次名稱</span><input type="text" id="bName" value="第${k}批"></label>
        <label class="f"><span>🎥 拍攝日</span><input type="date" id="bDate"></label></div>
      <p class="hint" style="margin:0">有填拍攝日，卡片會放在「已約拍攝」；還沒約好就放在「待約拍攝」。</p>
      <div class="sub-h"><span>會建立 ${todo.length} 張影片卡</span></div>
      <div class="mini-list">${todo.map(t => `<div class="row" style="cursor:default"><div class="row-main"><div class="row-title">${esc(n)}｜${esc(t.title)}</div></div></div>`).join('')}</div>
      ${already.length ? `<p class="hint">另外 ${already.length} 個已經建過卡，會略過。</p>` : ''}
    </div>
    <div class="modal-f"><div class="r"><button class="btn" data-act="closeModal">取消</button><button class="btn primary" id="bSave">建立 ${todo.length} 張影片卡</button></div></div>`);
  $('#bSave').onclick = () => {
    const batch = $('#bName').value.trim() || `第${k}批`, shootDate = $('#bDate').value || null;
    const pid = opsId(), now = Date.now();
    todo.forEach((t, i) => {
      const p = { id: uid(), name: `${n}｜${t.title}`, ip: n, platform: pid, category: '', status: shootDate ? 'booked' : 'approved', priority: 'mid',
        proposeDate: null, launchDate: null, dueDate: null, shootDate, batch, editor: '', topicId: t.id, revisions: [], edits: [], completedAt: null, note: '', createdAt: now + i, updatedAt: now };
      DB().projects[p.id] = p;
      t.projectId = p.id; t.batch = batch; t.status = 'picked'; t.updatedAt = now;
    });
    topicSel.clear(); closeModal(); Store.save(); render();
    toast(`已建立 ${todo.length} 張影片卡（${batch}）`, { label: '到看板', fn: () => { UI.boardPlat = pid; UI.boardCat = 'all'; UI.boardIp = n; UI.boardBatch = `${n}|${batch}`; saveUI(); location.hash = 'board'; } });
  };
}
function addTopics(text) {
  const n = UI.ipSel; if (!n) return 0;
  const lines = text.split(/\r?\n/).map(x => x.replace(/^\s*(\d+[.、)）]|[-・•*])\s*/, '').trim()).filter(Boolean);
  const now = Date.now();
  lines.forEach((title, i) => { const t = { id: uid(), ip: n, title, status: 'idea', revisions: [], projectId: null, batch: '', createdAt: now + i, updatedAt: now }; DB().topics[t.id] = t; });
  if (lines.length) { Store.save(); render(); }
  return lines.length;
}

function viewIps() {
  const ips = DB().settings.ips;
  if (!ips.includes(UI.ipSel)) UI.ipSel = ips[0] || null;
  const tabs = ips.map(n => `<button class="chip" data-act="ipSel" data-val="${esc(n)}" aria-pressed="${n === UI.ipSel}">${esc(n)}</button>`).join('');
  let detail = '<div class="empty">還沒有 IP，在上面輸入名字按 Enter 新增。</div>';
  if (UI.ipSel) {
    const n = UI.ipSel, prof = ensureProfile(n);
    const projs = allProjects().filter(p => p.ip === n);
    const active = projs.filter(p => p.status !== 'done');
    const isPlan = UI.ipTab === 'plan';
    const isTopics = UI.ipTab === 'topics';
    const tabsHtml = `<div class="tabs" role="tablist"><button role="tab" aria-selected="${!isPlan && !isTopics}" data-act="ipTab" data-val="spec">製作需求</button><button role="tab" aria-selected="${isTopics}" data-act="ipTab" data-val="topics">選題池 <span class="mm-n">${topicsOf(n).length}</span></button><button role="tab" aria-selected="${isPlan}" data-act="ipTab" data-val="plan">操盤心智圖 <span class="mm-n" id="planTabN">${planDone(planOf(n))}/40</span></button></div>`;
    if (isTopics) {
      detail = `<section class="panel">
      <div class="ip-head">
        <input type="text" class="ip-name" id="ipName" value="${esc(n)}" aria-label="IP 名稱">
        ${tabsHtml}
      </div>
      ${viewTopics(n)}
    </section>`;
    } else if (isPlan) {
      detail = `<section class="panel">
      <div class="ip-head">
        <input type="text" class="ip-name" id="ipName" value="${esc(n)}" aria-label="IP 名稱">
        ${tabsHtml}
      </div>
      ${viewIpPlan(n)}
    </section>`;
    } else detail = `<section class="panel">
      <div class="ip-head">
        <input type="text" class="ip-name" id="ipName" value="${esc(n)}" aria-label="IP 名稱">
        ${tabsHtml}
      </div>
      <div class="actions"><button class="btn primary" data-act="ipCopy">複製全部需求</button><button class="btn danger" data-act="ipDel">刪除 IP</button></div>
      <p>${projs.length} 個專案（進行中 ${active.length}）。內容會自動儲存。按「複製全部需求」可以直接傳給剪輯師或攝影師。</p>
      <div class="ip-fields">${prof.fields.map(f => `<div class="ip-field">
          <div class="ip-field-h"><input type="text" value="${esc(f.label)}" data-ipf="label" data-id="${f.id}" aria-label="欄位名稱"><button class="icon-btn" data-act="ipDelField" data-id="${f.id}" aria-label="刪除欄位 ${esc(f.label)}">✕</button></div>
          <textarea rows="2" data-ipf="value" data-id="${f.id}" placeholder="${esc(f.hint || '')}" aria-label="${esc(f.label)}">${esc(f.value)}</textarea>
        </div>`).join('')}</div>
      <div><button class="btn" data-act="ipAddField">＋ 新增欄位</button></div>
    </section>
    ${active.length ? `<section class="sec"><div class="sec-h">進行中的專案<span class="n">${active.length}</span></div><div class="list">${active.map(p => projRow(p, today())).join('')}</div></section>` : ''}`;
  }
  return `<div class="page ${UI.ipTab === 'plan' || UI.ipTab === 'topics' ? 'wide' : ''}">
    <header class="page-h"><div><h1>IP 需求</h1><p class="sub">每個 IP 的製作規格、選題池和操盤心智圖</p></div></header>
    <div class="chips">${tabs}<input type="text" class="cat-add" placeholder="＋ 新增 IP" data-enter="addIp" aria-label="新增 IP"></div>
    ${detail}
  </div>`;
}
function ipSpecText(n) {
  const prof = ensureProfile(n);
  const lines = prof.fields.filter(f => f.value.trim()).map(f => `・${f.label}：${f.value.trim().includes('\n') ? '\n　' + f.value.trim().split('\n').join('\n　') : f.value.trim()}`);
  return `【${n}】製作需求\n` + (lines.length ? lines.join('\n') : '（尚未填寫）');
}
let ipSaveTimer;
document.addEventListener('input', e => {
  const t = e.target; if (!t.dataset || !t.dataset.ipf || !UI.ipSel) return;
  const f = ensureProfile(UI.ipSel).fields.find(x => x.id === t.dataset.id); if (!f) return;
  f[t.dataset.ipf] = t.value; ensureProfile(UI.ipSel).updatedAt = Date.now();
  if (t.tagName === 'TEXTAREA') autoGrow(t);
  clearTimeout(ipSaveTimer); ipSaveTimer = setTimeout(() => Store.save(), 400);
});
function autoGrow(t) { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; }
function renameIp(oldN, newN) {
  const d = DB();
  if (!newN || newN === oldN) return;
  if (d.settings.ips.includes(newN)) { toast(`已經有「${newN}」了`); render(); return; }
  d.settings.ips[d.settings.ips.indexOf(oldN)] = newN;
  d.ipProfiles[newN] = ensureProfile(oldN); delete d.ipProfiles[oldN];
  allProjects().forEach(p => { if (p.ip === oldN) p.ip = newN; });
  Object.values(d.topics || {}).forEach(t => { if (t.ip === oldN) t.ip = newN; });
  UI.ipSel = newN; saveUI(); Store.save(); render(); toast(`已改名為「${newN}」，相關專案也一起更新`);
}

/* ================= 設定 ================= */
function viewPrefs() {
  const plats = DB().settings.platforms;
  const rows = plats.map(p => `<div class="plat-row" data-plat="${esc(p.id)}">
      <div class="plat-line">
        <input type="color" value="${esc(p.color)}" data-change="platColor" data-id="${esc(p.id)}" aria-label="${esc(p.name)} 顏色">
        <input type="text" value="${esc(p.name)}" data-change="platName" data-id="${esc(p.id)}" aria-label="平台名稱">
        <button class="btn small danger" data-act="delPlat" data-id="${esc(p.id)}">刪除</button>
      </div>
      <div class="col-pick"><span class="hint">看板欄位：</span><button class="btn small ghost" data-act="renameCols" data-id="${esc(p.id)}">✏️ 欄位名稱／順序</button>${platOrder(p).map(id => STATUS.find(x => x.id === id)).map(st => `<button class="chip small" data-act="togCol" data-id="${esc(p.id)}" data-val="${st.id}" aria-pressed="${platCols(p).includes(st.id)}">${esc(stName(st.id, p.id))}</button>`).join('')}</div>
      <div class="chips">${p.categories.map((c, i) => `<span class="cat-chip">${esc(c)}<button data-act="delCat" data-id="${esc(p.id)}" data-val="${i}" aria-label="刪除分類 ${esc(c)}">✕</button></span>`).join('')}
        <input type="text" class="cat-add" placeholder="＋ 分類" data-enter="addCat" data-id="${esc(p.id)}" aria-label="新增分類"></div>
    </div>`).join('');
  return `<div class="page">
    <header class="page-h"><h1>設定</h1></header>
    <section class="panel"><h2>平台與分類</h2><p>改名字、顏色會立刻套用。分類輸入後按 Enter 新增。</p>
      ${rows}
      <div style="display:flex;gap:8px"><input type="text" id="newPlat" placeholder="新增平台，例如 YouTube"><button class="btn" data-act="addPlat">新增</button></div>
    </section>
    <section class="panel"><h2>IP 名單</h2><p>IP 的新增、改名和需求規格，請到上方的「IP」頁管理。</p><div><a class="btn" href="#ips">前往 IP 頁</a></div></section>
    <section class="panel"><h2>推播通知</h2>
      ${(() => { const st = pushState();
        const sched = '<p>會在這些時間通知你：<br>・每天約 8:15～8:50：今天到期、逾期，以及明天要提案／上傳的項目<br>・週日約 19:15～19:50：提醒產生週報</p>';
        if (!st.ok) return `<p>${esc(st.msg)}</p>${st.ios ? '<div><button class="btn" data-act="howInstall">怎麼加入主畫面</button></div>' : ''}${sched}`;
        return st.on ? `<p>✅ 這台裝置已開啟通知。</p>${sched}<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="pushTest">顯示測試通知</button><button class="btn danger" data-act="pushOff">關閉這台裝置的通知</button></div>`
          : `<p>這台裝置還沒開啟通知。手機和電腦要各自開啟一次。</p>${sched}<div><button class="btn primary" data-act="pushOn">開啟這台裝置的通知</button></div>`;
      })()}
    </section>
    <section class="panel"><h2>同步</h2>
      ${!Sync.available ? '<p>這個網址不支援同步（預覽頁）。請到正式網址 pawdiary-tw.github.io/pm-app 使用。</p>'
        : Sync.user ? `<p>已登入：<b>${esc(Sync.user.email || Sync.user.displayName || '')}</b>。${esc(SYNC_TEXT[Sync.status])}。</p><div><button class="btn" data-act="signOut">登出</button></div>`
        : '<p>尚未登入，資料只存在這台裝置。登入後，手機和電腦會自動同步。</p><div><button class="btn primary" data-act="signIn">用 Google 登入</button></div>'}
    </section>
    <section class="panel"><h2>備份</h2>
      <p>建議每個月備份一次。備份檔可以用「匯入」還原。</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="exportFile">下載備份檔</button><button class="btn" data-act="exportCopy">複製備份內容</button>
        <label class="btn" style="position:relative">匯入備份檔<input type="file" id="importFile" accept=".json,application/json" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label></div>
      <details><summary class="hint" style="cursor:pointer">用貼上的方式匯入（從預覽頁搬資料時用）</summary>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px"><textarea id="importText" rows="4" placeholder="把「複製備份內容」得到的文字貼在這裡"></textarea>
        <div><button class="btn" data-act="importPaste">匯入貼上的內容</button></div><p>注意：匯入會取代目前所有資料。</p></div></details>
    </section>
    <section class="panel"><h2>資料</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn danger" data-act="wipeAll">清空所有資料</button></div>
    </section>
  </div>`;
}

/* ================= 任務編輯 ================= */
function projectOptions(sel) {
  const groups = DB().settings.platforms.map(pl => {
    const ps = allProjects().filter(p => p.platform === pl.id && p.status !== 'done').sort((a, b) => a.name.localeCompare(b.name));
    const cur = sel && DB().projects[sel];
    if (cur && cur.platform === pl.id && cur.status === 'done') ps.push(cur);
    return ps.length ? `<optgroup label="${esc(pl.name)}">${ps.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>` : '';
  }).join('');
  return `<option value="">（不屬於專案）</option>${groups}`;
}
function openTask(id, preset = {}) {
  const isNew = !id;
  const t = isNew ? Object.assign({ id: uid(), title: '', projectId: null, due: null, priority: 'mid', done: false, completedAt: null, starredAt: null, note: '', createdAt: Date.now() }, preset) : { ...DB().tasks[id] };
  const T = today();
  openModal(`<div class="modal-h"><h2>${isNew ? '新增任務' : '編輯任務'}</h2><button class="icon-btn" data-act="closeModal" aria-label="關閉">✕</button></div>
    <div class="modal-b">
      <label class="f"><span>標題</span><input type="text" id="tTitle" value="${esc(t.title)}"></label>
      <label class="f"><span>所屬專案</span><select id="tProj">${projectOptions(t.projectId)}</select></label>
      <div class="f-row">
        <label class="f"><span>截止日</span><input type="date" id="tDue" value="${t.due || ''}"></label>
        <div class="f"><span style="font-size:.82rem;font-weight:500;color:var(--muted)">快速設定</span><div style="display:flex;gap:6px">
          <button class="btn small" type="button" data-setdue="${T}">今天</button><button class="btn small" type="button" data-setdue="${addDays(T, 1)}">明天</button><button class="btn small" type="button" data-setdue="">清除</button></div></div>
      </div>
      <div class="f"><span style="font-size:.82rem;font-weight:500;color:var(--muted)">優先度</span>
        <div class="seg" id="tPri">${PRIORITY.map(p => `<button type="button" data-val="${p.id}" aria-pressed="${t.priority === p.id}">${p.name}</button>`).join('')}</div></div>
      <div style="display:flex;gap:20px;flex-wrap:wrap">
        <label class="toggle"><input type="checkbox" id="tStar" ${t.starredAt ? 'checked' : ''}> ⭐ 今天要做</label>
        <label class="toggle"><input type="checkbox" id="tDone" ${t.done ? 'checked' : ''}> 已完成</label>
      </div>
      <label class="f"><span>備註</span><textarea id="tNote" rows="3">${esc(t.note)}</textarea></label>
    </div>
    <div class="modal-f">${isNew ? '' : '<button class="btn danger" id="tDel">刪除</button>'}<div class="r"><button class="btn" data-act="closeModal">取消</button><button class="btn primary" id="tSave">儲存</button></div></div>`);
  if (isNew) $('#tTitle').focus();
  $$('[data-setdue]').forEach(b => b.onclick = () => { $('#tDue').value = b.dataset.setdue; });
  $$('#tPri button').forEach(b => b.onclick = () => $$('#tPri button').forEach(x => x.setAttribute('aria-pressed', x === b)));
  const del = $('#tDel');
  if (del) del.onclick = () => { if (!arm(del, '確定刪除？')) return; closeModal(); Store.remove('tasks', t.id); toast('已刪除任務'); };
  $('#tSave').onclick = () => {
    const title = $('#tTitle').value.trim();
    if (!title) { $('#tTitle').focus(); toast('請輸入標題'); return; }
    t.title = title;
    t.projectId = $('#tProj').value || null;
    t.due = $('#tDue').value || null;
    t.priority = ($('#tPri [aria-pressed="true"]') || {}).dataset?.val || 'mid';
    t.note = $('#tNote').value;
    const star = $('#tStar').checked; t.starredAt = star ? (t.starredAt || today()) : null;
    const done = $('#tDone').checked;
    if (done && !t.done) { t.completedAt = new Date().toISOString(); t.starredAt = null; }
    if (!done) t.completedAt = null;
    t.done = done;
    closeModal();
    Store.upsert('tasks', t);
    if (preset.__after) preset.__after();
  };
  $('#tTitle').addEventListener('keydown', e => { if (e.key === 'Enter') $('#tSave').click(); });
}

/* ================= 專案編輯 ================= */
function openProject(id, preset = {}) {
  const isNew = !id;
  const firstPlat = UI.boardPlat !== 'all' && platform(UI.boardPlat) ? UI.boardPlat : DB().settings.platforms[0]?.id;
  const src = isNew ? Object.assign({ id: uid(), name: '', ip: UI.boardIp !== 'all' ? UI.boardIp : (DB().settings.ips[0] || ''), platform: firstPlat, category: '', status: platCols(platform(firstPlat))[0] || 'prep', priority: 'mid', proposeDate: null, launchDate: null, dueDate: null, revisions: [], completedAt: null, note: '', createdAt: Date.now() }, preset) : DB().projects[id];
  const p = JSON.parse(JSON.stringify(src)); // 草稿，按儲存才寫入
  const catOptions = (platId, sel) => { const pl = platform(platId); const cats = pl ? pl.categories.slice() : []; if (sel && !cats.includes(sel)) cats.push(sel); return `<option value="">（未分類）</option>` + cats.map(c => `<option ${c === sel ? 'selected' : ''}>${esc(c)}</option>`).join(''); };

  openModal(`<div class="modal-h"><h2>${isNew ? '新增專案' : '專案內容'}</h2><button class="icon-btn" data-act="closeModal" aria-label="關閉">✕</button></div>
    <div class="modal-b">
      <label class="f"><span>專案名稱</span><input type="text" id="pName" value="${esc(p.name)}" placeholder="例如：雙11 倒數系列"></label>
      <div class="f-row">
        <label class="f"><span>平台</span><select id="pPlat">${DB().settings.platforms.map(pl => `<option value="${esc(pl.id)}" ${pl.id === p.platform ? 'selected' : ''}>${esc(pl.name)}</option>`).join('')}</select></label>
        <label class="f"><span>分類</span><select id="pCat">${catOptions(p.platform, p.category)}</select></label>
      </div>
      <label class="f"><span>IP（是誰的內容）</span><input type="text" id="pIp" list="ipList" value="${esc(p.ip || '')}" placeholder="例如：自己">
        <datalist id="ipList">${DB().settings.ips.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist></label>
      ${p.ip && DB().settings.ips.includes(p.ip) ? `<div style="margin-top:-8px"><button class="btn small ghost" type="button" data-act="openIp" data-val="${esc(p.ip)}">📋 查看「${esc(p.ip)}」的製作需求</button></div>` : ''}
      <div class="f-row">
        <label class="f"><span>狀態</span><select id="pStatus">${platOrder(platform(p.platform)).map(id => STATUS.find(x => x.id === id)).map(s => `<option value="${s.id}" ${s.id === p.status ? 'selected' : ''}>${esc(stName(s.id, p.platform))}</option>`).join('')}</select></label>
        <div class="f"><span style="font-size:.82rem;font-weight:500;color:var(--muted)">優先度</span>
          <div class="seg" id="pPri">${PRIORITY.map(x => `<button type="button" data-val="${x.id}" aria-pressed="${p.priority === x.id}">${x.name}</button>`).join('')}</div></div>
      </div>
      <div class="f-row">
        <label class="f"><span>📝 提案日</span><input type="date" id="pPropose" value="${p.proposeDate || ''}"></label>
        <label class="f"><span>🚀 上傳日</span><input type="date" id="pLaunch" value="${p.launchDate || ''}"></label>
        <label class="f"><span>⏳ 截止日（選填）</span><input type="date" id="pDue" value="${p.dueDate || ''}"></label>
        <label class="f"><span>🎥 拍攝日（選填）</span><input type="date" id="pShoot" value="${p.shootDate || ''}"></label>
      </div>
      <div class="f-row">
        <label class="f"><span>✂️ 剪輯師（選填）</span><input type="text" id="pEditor" list="editorList" value="${esc(p.editor || '')}" placeholder="老闆排給誰剪；自己剪就填「自己」">
          <datalist id="editorList">${[...new Set(['自己'].concat(allProjects().map(x => x.editor).filter(Boolean)))].map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist></label>
        <label class="f"><span>🎬 批次（選填）</span><input type="text" id="pBatch" value="${esc(p.batch || '')}" placeholder="例如：第1批"></label>
      </div>
      <p class="hint" style="margin-top:-6px">截止日適合製作期長的專案（例如拍攝），填了之後，通過後會改看截止日判斷逾期。</p>
      <label class="f"><span>備註</span><textarea id="pNote" rows="2">${esc(p.note)}</textarea></label>

      <div class="sub-h"><span id="ftHead"></span><button class="btn small ghost" type="button" id="ftAll">全部勾選</button></div>
      <div id="pFootage"></div>
      <form id="ftAdd" class="quick" style="box-shadow:none" autocomplete="off"><textarea id="ftInput" rows="1" placeholder="輸入毛片名稱，按 Enter 新增（可一次貼上多行）" aria-label="新增毛片"></textarea><button class="btn small" type="submit">新增</button></form>

      <div class="sub-h"><span id="rvHead">退件紀錄（${p.revisions.length} 次）</span></div>
      <div id="pRevs"></div>
      <div class="inline-add"><input type="date" id="rvDate" value="${today()}" aria-label="退件日期"><input type="text" id="rvNote" placeholder="補記一筆修改意見（不會改變狀態）" aria-label="修改意見"><button class="btn small" type="button" id="rvAdd">加入</button></div>

      <div class="sub-h"><span id="edHead"></span></div>
      <div id="pEdits"></div>
      <div class="inline-add ed-add"><input type="date" id="eaDate" value="${today()}" aria-label="修改日期"><select id="eaBy" aria-label="誰的意見"><option value="op">操盤手</option><option value="ip">IP</option></select><input type="text" id="eaNote" placeholder="補記一筆修改意見（不會改變狀態）" aria-label="修改意見"><button class="btn small" type="button" id="eaAdd">加入</button></div>

      ${isNew ? '' : `<div class="sub-h"><span>專案任務</span></div><div id="pTasks"></div>
      <form id="ptAdd" class="quick" style="box-shadow:none"><input type="text" id="ptTitle" placeholder="新增這個專案的任務，按 Enter" aria-label="新增專案任務"></form>`}
    </div>
    <div class="modal-f">${isNew ? '' : '<button class="btn danger" id="pDel">刪除專案</button>'}<div class="r"><button class="btn" data-act="closeModal">取消</button><button class="btn primary" id="pSave">儲存</button></div></div>`);

  const renderRevs = () => {
    $('#rvHead').textContent = `退件紀錄（${p.revisions.length} 次）`;
    $('#pRevs').innerHTML = p.revisions.length ? `<div class="timeline">${p.revisions.map((r, i) => ({ r, i })).reverse().map(({ r, i }) => `<div class="tl-item"><div class="d">第 ${i + 1} 次・${md(r.date)}（${wd(r.date)}）<button class="icon-btn" type="button" data-rv="${r.id}" aria-label="刪除這筆">✕</button></div><p>${esc(r.note)}</p></div>`).join('')}</div>`
      : '<div class="empty" style="padding:4px 0;text-align:left">還沒有退件紀錄。把卡片拖到「未通過需調整」就會自動記錄。</div>';
    $$('[data-rv]', $('#pRevs')).forEach(b => b.onclick = () => { if (!arm(b, '確定？')) return; p.revisions = p.revisions.filter(r => r.id !== b.dataset.rv); renderRevs(); });
  };
  renderRevs();
  p.edits = editsOf(p);
  const renderEdits = () => {
    const op = p.edits.filter(r => r.by !== 'ip').length;
    $('#edHead').textContent = `修改紀錄（${p.edits.length} 次：操盤手 ${op}、IP ${p.edits.length - op}）`;
    $('#pEdits').innerHTML = p.edits.length ? `<div class="timeline edits">${p.edits.map((r, i) => ({ r, i })).reverse().map(({ r, i }) => `<div class="tl-item"><div class="d">第 ${i + 1} 次・${md(r.date)}（${wd(r.date)}）<span class="badge ${r.by === 'ip' ? 'info' : 'idle'}">${esc(reviewerName(r.by, p))}</span><button class="icon-btn" type="button" data-ed="${r.id}" aria-label="刪除這筆">✕</button></div><p>${esc(r.note)}</p></div>`).join('')}</div>`
      : '<div class="empty" style="padding:4px 0;text-align:left">還沒有修改紀錄。把卡片拖到「修改中」就會自動記錄。</div>';
    $$('[data-ed]', $('#pEdits')).forEach(b => b.onclick = () => { if (!arm(b, '確定？')) return; p.edits = p.edits.filter(r => r.id !== b.dataset.ed); renderEdits(); });
  };
  renderEdits();
  p.footage = (p.footage || []).slice();
  const saveFootage = () => {
    if (!isNew && DB().projects[p.id]) { DB().projects[p.id].footage = JSON.parse(JSON.stringify(p.footage)); DB().projects[p.id].updatedAt = Date.now(); Store.save(); render(); }
  };
  const renderFootage = () => {
    const n = p.footage.length, d = p.footage.filter(x => x.done).length;
    $('#ftHead').textContent = n ? `🎞 毛片清單（已上傳 ${d} / ${n}）` : '🎞 毛片清單';
    $('#ftAll').hidden = !n || d === n;
    $('#pFootage').innerHTML = n ? `<div class="mini-list ft-list">${p.footage.map(x => `<div class="ft-row ${x.done ? 'done' : ''}" data-fid="${x.id}">
        <input type="checkbox" data-ft="done" ${x.done ? 'checked' : ''} aria-label="已上傳">
        <input type="text" class="ttitle" data-ft="name" value="${esc(x.name)}" aria-label="毛片名稱">
        ${x.done && x.at ? `<span class="hint">${md(isoDate(x.at))} 上傳</span>` : ''}
        <button class="icon-btn" type="button" data-ft="del" aria-label="刪除">✕</button></div>`).join('')}</div>`
      : '<div class="empty" style="padding:4px 0;text-align:left">還沒有毛片。拍攝完把這支影片的毛片列出來，上傳一個勾一個。</div>';
  };
  const afterCheck = () => {
    const n = p.footage.length, d = p.footage.filter(x => x.done).length;
    if (n && d === n && !isNew && p.status === 'footage') {
      toast('毛片都上傳完了！', { label: '移到待排剪輯', fn: () => { const real = DB().projects[p.id]; if (!real) return; applyStatus(real, 'assign'); Store.upsert('projects', real); p.status = 'assign'; const sel = $('#pStatus'); if (sel) sel.value = 'assign'; } });
    }
  };
  renderFootage();
  $('#pFootage').addEventListener('change', e => {
    const row = e.target.closest('[data-fid]'); if (!row) return;
    const x = p.footage.find(y => y.id === row.dataset.fid); if (!x) return;
    if (e.target.dataset.ft === 'done') { x.done = e.target.checked; x.at = x.done ? new Date().toISOString() : null; renderFootage(); saveFootage(); afterCheck(); }
    if (e.target.dataset.ft === 'name') { const v = e.target.value.trim(); if (v) { x.name = v; saveFootage(); } }
  });
  $('#pFootage').addEventListener('click', e => {
    const b = e.target.closest('[data-ft="del"]'); if (!b) return;
    if (!arm(b, '刪?')) return;
    const row = b.closest('[data-fid]'); p.footage = p.footage.filter(y => y.id !== row.dataset.fid); renderFootage(); saveFootage();
  });
  $('#ftAll').onclick = () => { const now = new Date().toISOString(); p.footage.forEach(x => { if (!x.done) { x.done = true; x.at = now; } }); renderFootage(); saveFootage(); afterCheck(); };
  $('#ftAdd').onsubmit = e => {
    e.preventDefault();
    const lines = $('#ftInput').value.split(/\r?\n/).map(x => x.replace(/^\s*(\d+[.、)）]|[-・•*])\s*/, '').trim()).filter(Boolean);
    if (!lines.length) return;
    lines.forEach(name => p.footage.push({ id: uid(), name, done: false, at: null }));
    $('#ftInput').value = ''; $('#ftInput').style.height = ''; renderFootage(); saveFootage();
  };
  $('#ftInput').addEventListener('input', e => autoGrow(e.target));
  $('#eaAdd').onclick = () => { const note = $('#eaNote').value.trim(); if (!note) { $('#eaNote').focus(); return; } p.edits.push({ id: uid(), date: $('#eaDate').value || today(), note, by: $('#eaBy').value }); p.edits.sort((a, b) => a.date.localeCompare(b.date)); $('#eaNote').value = ''; renderEdits(); };
  $('#rvAdd').onclick = () => { const note = $('#rvNote').value.trim(); if (!note) { $('#rvNote').focus(); return; } p.revisions.push({ id: uid(), date: $('#rvDate').value || today(), note }); p.revisions.sort((a, b) => a.date.localeCompare(b.date)); $('#rvNote').value = ''; renderRevs(); };

  const renderPTasks = () => {
    const box = $('#pTasks'); if (!box) return;
    const ts = sortTasks(allTasks().filter(t => t.projectId === p.id));
    box.innerHTML = ts.length ? `<div class="mini-list">${ts.map(t => taskRow(t, today())).join('')}</div>` : '<div class="empty" style="padding:4px 0;text-align:left">還沒有任務</div>';
  };
  renderPTasks();
  openProject.refresh = renderPTasks;
  const ptAdd = $('#ptAdd');
  if (ptAdd) ptAdd.onsubmit = e => { e.preventDefault(); const v = $('#ptTitle').value.trim(); if (!v) return; const t = { id: uid(), title: v, projectId: p.id, due: null, priority: 'mid', done: false, completedAt: null, starredAt: null, note: '', createdAt: Date.now() }; Store.upsert('tasks', t); $('#ptTitle').value = ''; renderPTasks(); };

  $('#pPlat').onchange = () => {
    $('#pCat').innerHTML = catOptions($('#pPlat').value, '');
    const pid = $('#pPlat').value, keep = $('#pStatus').value;
    $$('#pStatus option').forEach(o => { o.textContent = stName(o.value, pid); });
    $('#pStatus').value = isNew ? (platCols(platform(pid))[0] || 'prep') : keep;
  };
  $$('#pPri button').forEach(b => b.onclick = () => $$('#pPri button').forEach(x => x.setAttribute('aria-pressed', x === b)));
  const del = $('#pDel');
  if (del) del.onclick = () => {
    if (!arm(del, '確定刪除？任務會保留')) return;
    allTasks().filter(t => t.projectId === p.id).forEach(t => { t.projectId = null; });
    closeModal(); Store.remove('projects', p.id); toast('已刪除專案');
  };
  if (isNew) $('#pName').focus();
  $('#pSave').onclick = () => {
    const name = $('#pName').value.trim();
    if (!name) { $('#pName').focus(); toast('請輸入專案名稱'); return; }
    p.name = name; p.platform = $('#pPlat').value; p.category = $('#pCat').value;
    p.ip = $('#pIp').value.trim();
    if (p.ip && !DB().settings.ips.includes(p.ip)) DB().settings.ips.push(p.ip);
    p.priority = ($('#pPri [aria-pressed="true"]') || {}).dataset?.val || 'mid';
    p.proposeDate = $('#pPropose').value || null; p.launchDate = $('#pLaunch').value || null; p.dueDate = $('#pDue').value || null;
    p.shootDate = $('#pShoot').value || null; p.editor = $('#pEditor').value.trim(); p.batch = $('#pBatch').value.trim();
    p.note = $('#pNote').value;
    const to = $('#pStatus').value;
    closeModal();
    if (to === 'rejected' && src.status !== 'rejected') {
      if (isNew) p.status = 'proposed';
      askRejection(p);
      return;
    }
    if (to === 'revising' && src.status !== 'revising') {
      if (isNew) p.status = 'editing';
      askEdit(p);
      return;
    }
    applyStatus(p, to);
    Store.upsert('projects', p);
    if (isNew) toast(`已新增專案「${p.name}」`);
  };
}

/* ================= 對話框／提示 ================= */
function openModal(html) {
  closeModal();
  const bg = document.createElement('div');
  bg.className = 'modal-bg'; bg.id = 'modalBg';
  bg.innerHTML = `<div class="modal" id="modal" role="dialog" aria-modal="true">${html}</div>`;
  bg.addEventListener('mousedown', e => { if (e.target === bg) closeModal(); });
  document.body.appendChild(bg);
  document.body.style.overflow = 'hidden';
}
function closeModal() { const m = $('#modalBg'); if (m) m.remove(); document.body.style.overflow = ''; openProject.refresh = null; }
let toastTimer;
function toast(msg, action) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { action.fn(); el.hidden = true; };
  el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, action ? 5000 : 2400);
}
/* 兩段式確認：第一次按會變成「確定？」，3 秒內再按一次才執行 */
function arm(btn, text) {
  if (btn.dataset.armed) return true;
  btn.dataset.armed = '1'; const old = btn.textContent; btn.textContent = text;
  setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = old; } }, 3000);
  return false;
}
async function copyText(text, fallbackEl) {
  try { await navigator.clipboard.writeText(text); toast('已複製，可以貼到 LINE 或 Email'); }
  catch (e) {
    if (fallbackEl) { fallbackEl.focus(); fallbackEl.select(); }
    let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { /* 忽略 */ }
    toast(ok ? '已複製' : '已全選文字，請按「複製」');
  }
}

/* ================= 動作 ================= */
const ACTIONS = {
  closeModal: () => closeModal(),
  editTask: el => { openTask(el.dataset.id); },
  editProject: el => openProject(el.dataset.id),
  newProject: el => openProject(null, el && el.dataset.val ? { status: el.dataset.val } : {}),
  newTask: () => openTask(null),
  toggleDone: el => {
    const t = DB().tasks[el.dataset.id]; if (!t) return;
    const was = { done: t.done, completedAt: t.completedAt, starredAt: t.starredAt };
    t.done = !t.done;
    if (t.done) { t.completedAt = new Date().toISOString(); t.starredAt = null; } else t.completedAt = null;
    Store.upsert('tasks', t);
    if (openProject.refresh) openProject.refresh();
    if (t.done) toast(`已完成「${t.title}」`, { label: '復原', fn: () => { Object.assign(t, was); Store.upsert('tasks', t); if (openProject.refresh) openProject.refresh(); } });
  },
  toggleStar: el => { const t = DB().tasks[el.dataset.id]; if (!t) return; t.starredAt = t.starredAt ? null : today(); Store.upsert('tasks', t); if (openProject.refresh) openProject.refresh(); },
  setDue: el => { const t = DB().tasks[el.dataset.id]; if (!t) return; t.due = addDays(today(), Number(el.dataset.val)); Store.upsert('tasks', t); toast(`已排到${el.dataset.val === '0' ? '今天' : '明天'}`); },
  goWeekly: () => { UI.repTab = 'week'; UI.repWeek = weekStart(today()); location.hash = 'report'; },
  boardPlat: el => { UI.boardPlat = el.dataset.val; UI.boardCat = 'all'; saveUI(); render(); },
  boardCat: el => { UI.boardCat = el.dataset.val; saveUI(); render(); },
  boardIp: el => { UI.boardIp = el.dataset.val; saveUI(); render(); },
  boardBatch: el => { UI.boardBatch = el.dataset.val; render(); },
  progCopy: () => { const t = opsProgressText(UI.boardIp); if (!t) { toast('目前沒有進行中的批次'); return; } copyText(`🎬 操盤進度（${md(today())}）\n` + t); },
  goBatch: el => { UI.boardPlat = opsId(); UI.boardCat = 'all'; UI.boardIp = UI.ipSel; UI.boardBatch = el.dataset.val ? `${UI.ipSel}|${el.dataset.val}` : 'all'; saveUI(); location.hash = 'board'; },
  topicFilter: el => { UI.topicFilter = el.dataset.val; render(); },
  topicDel: el => { if (!arm(el, '刪?')) return; const t = DB().topics[el.dataset.id]; topicSel.delete(el.dataset.id); Store.remove('topics', el.dataset.id); toast(`已刪除「${t ? t.title : ''}」`); },
  topicBatch: () => openBatchModal(UI.ipSel),
  topicCopy: el => { const txt = topicListText(UI.ipSel, el.dataset.val); if (!txt) { toast(`沒有「${topicStName(el.dataset.val)}」的選題，也沒有勾選任何選題`); return; } copyText(txt); },
  pickDay: el => { UI.calSel = el.dataset.val; render(); },
  calMove: el => { UI.calMonth = addMonths(UI.calMonth, Number(el.dataset.val)); render(); },
  calToday: () => { UI.calMonth = today().slice(0, 7); UI.calSel = today(); render(); },
  repTab: el => { UI.repTab = el.dataset.val; render(); },
  repMove: el => { const n = Number(el.dataset.val); if (UI.repTab === 'week') UI.repWeek = addDays(UI.repWeek, 7 * n); else UI.repMonth = addMonths(UI.repMonth, n); render(); },
  repRegen: el => { if (!arm(el, '確定？會清掉修改')) return; render(); toast('已重新產生'); },
  repCopy: () => { const ta = $('#reportText'); copyText(ta.value, ta); },
  addPlat: () => {
    const v = $('#newPlat').value.trim(); if (!v) { $('#newPlat').focus(); return; }
    const colors = ['#7a4fd0', '#c2410c', '#0f766e', '#a21caf', '#b45309', '#0369a1'];
    DB().settings.platforms.push({ id: 'p' + Date.now().toString(36), name: v, color: colors[DB().settings.platforms.length % colors.length], categories: [], columns: ALL_COLS() });
    Store.saveSettings(); toast(`已新增平台「${v}」`);
  },
  delPlat: el => {
    const id = el.dataset.id, used = allProjects().filter(p => p.platform === id).length;
    if (used) { toast(`還有 ${used} 個專案屬於這個平台，請先移動或刪除`); return; }
    if (!arm(el, '確定？')) return;
    DB().settings.platforms = DB().settings.platforms.filter(p => p.id !== id); Store.saveSettings();
  },
  ipSel: el => { UI.ipSel = el.dataset.val; saveUI(); render(); },
  ipCopy: () => copyText(ipSpecText(UI.ipSel)),
  ipTab: el => { UI.ipTab = el.dataset.val; saveUI(); render(); },
  planCopy: () => copyText(ipPlanText(UI.ipSel)),
  planJump: el => { const t = document.getElementById('pb-' + el.dataset.val); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  ipAddField: () => { ensureProfile(UI.ipSel).fields.push({ id: uid(), label: '新欄位', hint: '', value: '' }); Store.save(); render(); const ins = $$('[data-ipf="label"]'); const last = ins[ins.length - 1]; if (last) { last.focus(); last.select(); } },
  ipDelField: el => { if (!arm(el, '刪?')) return; const prof = ensureProfile(UI.ipSel); prof.fields = prof.fields.filter(f => f.id !== el.dataset.id); Store.save(); render(); },
  ipDel: el => {
    const n = UI.ipSel, used = allProjects().filter(p => p.ip === n).length;
    if (!arm(el, used ? `有 ${used} 個專案使用，確定刪除？` : '確定刪除？')) return;
    const d = DB(); d.settings.ips = d.settings.ips.filter(x => x !== n); delete d.ipProfiles[n];
    UI.ipSel = d.settings.ips[0] || null; Store.save(); render(); toast(`已刪除「${n}」（專案上的標記會保留）`);
  },
  openIp: el => { closeModal(); UI.ipSel = el.dataset.val; location.hash = 'ips'; },
  delIp: el => {
    const n = DB().settings.ips[Number(el.dataset.val)];
    const used = allProjects().filter(p => p.ip === n).length;
    if (used && !arm(el, '✓')) { toast(`有 ${used} 個專案標記「${n}」，再按一次確定刪除（專案的標記會保留）`); return; }
    DB().settings.ips.splice(Number(el.dataset.val), 1); Store.saveSettings();
  },
  renameCols: el => {
    const pl = platform(el.dataset.id), vis = platCols(pl);
    const row = id => { const st = STATUS.find(x => x.id === id); return `<div class="colrow" data-cid="${id}">
        <div class="colrow-move"><button class="icon-btn" type="button" data-mv="-1" aria-label="往上移">▲</button><button class="icon-btn" type="button" data-mv="1" aria-label="往下移">▼</button></div>
        <div class="colrow-main"><div class="colrow-h">${statusPill(id)}<label class="toggle small"><input type="checkbox" data-vis ${vis.includes(id) ? 'checked' : ''}> 顯示</label></div>
          <input type="text" data-col="${id}" value="${esc((pl.colNames || {})[id] || '')}" placeholder="${esc(st.name)}" aria-label="${esc(st.name)} 的顯示名稱">
          <span class="hint">${esc(statusRule(id))}</span></div></div>`; };
    openModal(`<div class="modal-h"><h2>${esc(pl.name)}｜看板欄位</h2><button class="icon-btn" data-act="closeModal" aria-label="關閉">✕</button></div>
      <div class="modal-b"><p class="sub" style="margin:0">用 ▲▼ 調整順序，看板會照這個順序由左到右排列。名稱留空就用預設名稱。只影響「${esc(pl.name)}」。</p>
        <div id="colList" class="collist">${platOrder(pl).map(row).join('')}</div></div>
      <div class="modal-f"><button class="btn" id="rcReset" type="button">恢復預設順序</button><div class="r"><button class="btn" data-act="closeModal">取消</button><button class="btn primary" id="rcSave">儲存</button></div></div>`);
    const list = $('#colList');
    list.addEventListener('click', e => {
      const b = e.target.closest('[data-mv]'); if (!b) return;
      const r = b.closest('.colrow'), dir = Number(b.dataset.mv);
      if (dir < 0 && r.previousElementSibling) list.insertBefore(r, r.previousElementSibling);
      if (dir > 0 && r.nextElementSibling) list.insertBefore(r.nextElementSibling, r);
      b.focus();
    });
    $('#rcReset').onclick = () => { ALL_COLS().forEach(id => list.appendChild(list.querySelector(`[data-cid="${id}"]`))); };
    $('#rcSave').onclick = () => {
      const names = {}, order = [], cols = [];
      $$('.colrow', list).forEach(r => {
        const id = r.dataset.cid; order.push(id);
        if ($('[data-vis]', r).checked) cols.push(id);
        const v = $('[data-col]', r).value.trim(); if (v) names[id] = v;
      });
      if (!cols.length) { toast('至少要顯示一個欄位'); return; }
      pl.colNames = names; pl.order = order; pl.columns = cols;
      closeModal(); Store.saveSettings(); toast(`已更新「${pl.name}」的看板欄位`);
    };
  },
  togCol: el => {
    const pl = platform(el.dataset.id); let cols = platCols(pl).slice(); const id = el.dataset.val;
    if (cols.includes(id)) { if (cols.length === 1) { toast('至少要留一個欄位'); return; } cols = cols.filter(x => x !== id); } else cols.push(id);
    pl.columns = cols; Store.saveSettings();
  },
  delCat: el => { const pl = platform(el.dataset.id); pl.categories.splice(Number(el.dataset.val), 1); Store.saveSettings(); },
  exportFile: () => {
    const blob = new Blob([JSON.stringify(DB(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `專案管理備份-${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('已下載備份檔（如果沒有反應，請改用「複製備份內容」）');
  },
  exportCopy: () => copyText(JSON.stringify(DB())),
  importPaste: el => {
    let d; try { d = JSON.parse($('#importText').value); } catch (e) { toast('內容格式不對，請重新複製一次'); return; }
    if (!d || !d.settings || !d.tasks || !d.projects) { toast('這不是正確的備份內容'); return; }
    if (!arm(el, '會取代目前資料，確定？')) return;
    Store.replace(d); toast(`已匯入：${Object.keys(d.projects).length} 個專案、${Object.keys(d.tasks).length} 個任務`);
  },
  signIn: () => signIn(),
  pushOn: () => enablePush(),
  pushOff: el => { if (!arm(el, '確定關閉？')) return; disablePush(); },
  pushTest: () => testLocalNotice(),
  pushAskOff: () => { lsSet('pm.pushAskOff', '1'); render(); },
  howInstall: () => openModal(`<div class="modal-h"><h2>加入主畫面（iPhone）</h2><button class="icon-btn" data-act="closeModal" aria-label="關閉">✕</button></div>
    <div class="modal-b"><ol style="margin:0;padding-left:1.2em;display:flex;flex-direction:column;gap:8px;line-height:1.7">
      <li>用 <b>Safari</b> 打開 pawdiary-tw.github.io/pm-app</li>
      <li>點下方的 <b>分享</b> 按鈕（方框加向上箭頭）</li>
      <li>往下滑，點 <b>加入主畫面</b> → 右上角 <b>加入</b></li>
      <li>回到手機桌面，點新的「專案管理」圖示打開</li>
      <li>登入 Google 帳號 → 設定 → <b>開啟這台裝置的通知</b> → 允許</li></ol>
      <p class="hint">iPhone 需要 iOS 16.4 以上。從主畫面打開的版本和 Safari 裡的是分開的，要在主畫面版本裡登入一次。</p></div>
    <div class="modal-f"><div class="r"><button class="btn primary" data-act="closeModal">知道了</button></div></div>`),
  goPrefsSync: () => { location.hash = 'prefs'; },
  signOut: el => { if (!arm(el, '確定登出？')) return; signOutSync(); },
  wipeAll: el => {
    if (!arm(el, '真的全部清空？')) return;
    Store.replace(emptyData());
    toast('已清空所有資料');
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && ACTIONS[el.dataset.act]) {
    if (drag.suppressClick) return;
    if (el.tagName === 'SUMMARY') return;
    e.preventDefault(); e.stopPropagation();
    ACTIONS[el.dataset.act](el, e);
    return;
  }
  const card = e.target.closest('.card');
  if (card && !drag.suppressClick) openProject(card.dataset.id);
});
document.addEventListener('keydown', e => {
  if (e.target.id === 'ftInput' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.target.form.requestSubmit(); return; }
  if (e.target.id === 'topicInput' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.target.form.requestSubmit(); return; }
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('card')) openProject(e.target.dataset.id);
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.enter === 'addIp') {
    const v = e.target.value.trim(); if (!v) return;
    if (!DB().settings.ips.includes(v)) DB().settings.ips.push(v);
    ensureProfile(v); UI.ipSel = v; saveUI();
    Store.saveSettings(); toast(`已新增 IP「${v}」，可以開始填需求`);
  }
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.enter === 'addCat') {
    const v = e.target.value.trim(); if (!v) return;
    const pl = platform(e.target.dataset.id); if (!pl.categories.includes(v)) pl.categories.push(v);
    Store.saveSettings();
    const again = $(`[data-enter="addCat"][data-id="${CSS.escape(pl.id)}"]`); if (again) again.focus();
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'ipName') { renameIp(UI.ipSel, t.value.trim()); return; }
  if (t.id === 'hideDoneB') { UI.hideDoneBatches = t.checked; saveUI(); render(); return; }
  if (t.dataset && t.dataset.tsel) { if (t.checked) topicSel.add(t.dataset.tsel); else topicSel.delete(t.dataset.tsel); render(); return; }
  if (t.id === 'topicAll') { const n = UI.ipSel; const shown = topicsOf(n).filter(x => UI.topicFilter === 'all' || !UI.topicFilter || x.status === UI.topicFilter); shown.forEach(x => { if (t.checked) topicSel.add(x.id); else topicSel.delete(x.id); }); render(); return; }
  if (t.id === 'topicBulk' && t.value) { const ids = [...topicSel]; ids.forEach(id => { const x = DB().topics[id]; if (x) { x.status = t.value; x.updatedAt = Date.now(); } }); Store.save(); toast(`已把 ${ids.length} 個選題改成「${topicStName(t.value)}」`); render(); return; }
  if (t.id === 'ctTotal') { const prof = ensureProfile(UI.ipSel); prof.contract = Object.assign({}, prof.contract, { total: Math.max(0, parseInt(t.value, 10) || 0) }); Store.saveSettings(); return; }
  if (t.dataset && t.dataset.tfield) {
    const x = DB().topics[t.dataset.id]; if (!x) return;
    if (t.dataset.tfield === 'title') { const v = t.value.trim(); if (v) { x.title = v; x.updatedAt = Date.now(); Store.save(); } return; }
    if (t.dataset.tfield === 'status') { if (setTopicStatus(x, t.value)) Store.upsert('topics', x); else t.value = x.status; return; }
  }
  if (t.id === 'quickWhen') { UI.qWhen = t.value; $('#quickDate').hidden = t.value !== 'pick'; if (t.value === 'pick') $('#quickDate').focus(); }
  if (t.id === 'quickDate') UI.qDate = t.value;
  if (t.id === 'quickProj') UI.qProj = t.value;
  if (t.dataset && t.dataset.change === 'platColor') { platform(t.dataset.id).color = t.value; Store.saveSettings(); }
  if (t.dataset && t.dataset.change === 'platName') { const v = t.value.trim(); if (v) { platform(t.dataset.id).name = v; Store.saveSettings(); } }
  if (t.id === 'importFile' && t.files[0]) {
    const r = new FileReader();
    r.onload = () => {
      try { const d = JSON.parse(r.result); if (!d.settings || !d.tasks || !d.projects) throw new Error(); Store.replace(d); toast('已匯入備份'); }
      catch (err) { toast('這不是正確的備份檔'); }
    };
    r.readAsText(t.files[0]);
  }
});
document.addEventListener('submit', e => {
  if (e.target.id === 'topicForm') {
    e.preventDefault();
    const n = addTopics($('#topicInput').value);
    if (n) { toast(`已新增 ${n} 個選題`); const i = $('#topicInput'); if (i) i.focus(); }
    return;
  }
  if (e.target.id !== 'quickForm') return;
  e.preventDefault();
  const inp = $('#quickInput'), v = inp.value.trim(); if (!v) return;
  const when = $('#quickWhen').value, pick = $('#quickDate').value, proj = $('#quickProj').value || null;
  UI.qWhen = when; UI.qDate = pick; UI.qProj = proj;
  const due = when === 'none' ? null : when === 'pick' ? (pick || null) : addDays(today(), Number(when));
  const t = { id: uid(), title: v, projectId: proj, due, priority: 'mid', done: false, completedAt: null, starredAt: null, note: '', createdAt: Date.now() };
  Store.upsert('tasks', t);
  const again = $('#quickInput'); if (again) { again.focus(); }
  toast(`已新增「${v}」${due ? `（${md(due)}）` : '（待排程）'}`, { label: '補資料', fn: () => openTask(t.id) });
});

/* ================= 路由與繪製 ================= */
const ROUTES = { today: viewToday, board: viewBoard, calendar: viewCalendar, report: viewReport, ips: viewIps, prefs: viewPrefs };
let lastRoute = null;
function render() {
  const r = (location.hash || '#today').slice(1);
  const route = ROUTES[r] ? r : 'today';
  const main = $('#view');
  const keepScroll = route === lastRoute;
  const boardScroll = $('#boardWrap') ? $('#boardWrap').scrollLeft : 0;
  const y = window.scrollY;
  const focusedId = document.activeElement && document.activeElement.id;
  main.innerHTML = ROUTES[route]();
  $$('.nav a').forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === '#' + route ? 'page' : 'false'));
  const n = overdueCount(), badge = $('#navLate');
  if (badge) { badge.textContent = n; badge.hidden = !n; }
  if (route === 'board') { const w = $('#boardWrap'); if (keepScroll) w.scrollLeft = boardScroll; $('#board').addEventListener('pointerdown', onBoardPointerDown); }
  if (route === 'ips') $$('textarea[data-ipf], textarea[data-ipq]').forEach(autoGrow);
  if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
  if (keepScroll && focusedId === 'quickInput' && $('#quickInput')) $('#quickInput').focus();
  lastRoute = route;
}
window.addEventListener('hashchange', render);
// 跨日自動更新（例如過了午夜）
let lastDay = today();
setInterval(() => { if (today() !== lastDay) { lastDay = today(); render(); } }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && today() !== lastDay) { lastDay = today(); render(); } });

Store.load();
render();
initSync();
})();
