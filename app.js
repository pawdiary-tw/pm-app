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
  { id: 'editing', name: '剪輯中', bg: '#a3261b', fg: '#ffffff' },
  { id: 'review_op', name: '過片中', bg: '#f7c9b0', fg: '#6e2f12' },
  { id: 'review_ip', name: 'IP👀', bg: '#55308d', fg: '#ffffff' },
  { id: 'revising', name: '修改中', bg: '#f4a340', fg: '#4a2600' },
  { id: 'done', name: '已完成✅', bg: '#2f6e4b', fg: '#e3f6ea' },
];
const ALL_COLS = () => STATUS.map(x => x.id);
const DEFAULT_COLS = {
  edit: ['editing', 'review_op', 'review_ip', 'revising', 'done'],
  shoot: ['approved', 'doing', 'editing', 'review_op', 'review_ip', 'revising', 'done'],
};
const platCols = pl => (pl && Array.isArray(pl.columns) && pl.columns.length) ? STATUS.map(x => x.id).filter(id => pl.columns.includes(id)) : ALL_COLS();
const DEFAULT_NAMES = { shoot: { doing: '拍攝中' } };
const stName = (id, platId) => { const pl = platId && Store.data && Store.data.settings.platforms.find(x => x.id === platId); return (pl && pl.colNames && pl.colNames[id]) || statusName(id); };
const statusPill = (id, platId) => { const st = STATUS.find(x => x.id === id) || { name: id, bg: '#ddd', fg: '#333' }; return `<span class="spill" style="--sb:${st.bg};--sf:${st.fg}">${esc(stName(id, platId))}</span>`; };
const ACTIVE = ['approved', 'doing', 'editing', 'review_op', 'review_ip', 'revising'];
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
  ]);
}
function withCols(list) {
  list.forEach(p => { if (!p.columns) p.columns = (DEFAULT_COLS[p.id] || ALL_COLS()).slice(); if (!p.colNames) p.colNames = Object.assign({}, DEFAULT_NAMES[p.id] || {}); });
  return list;
}

function emptyData() {
  return { version: 1, meta: { addedEdit: true, addedShoot: true, addedCols: true, addedNames: true }, settings: { platforms: defaultPlatforms(), ips: ['自己'] }, ipProfiles: {}, projects: {}, tasks: {} };
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
    if (!this.data || !this.data.settings) { this.data = emptyData(); this.save(); }
    this.data.projects = this.data.projects || {};
    this.data.tasks = this.data.tasks || {};
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
    if (!Array.isArray(this.data.settings.ips)) { this.data.settings.ips = ['自己']; this.save(); }
    this.data.ipProfiles = this.data.ipProfiles || {};
    // 移除舊版留下的範例資料
    if (this.data.meta.sample) {
      Object.values(this.data.tasks).forEach(t => { if (t.sample) delete this.data.tasks[t.id]; });
      Object.values(this.data.projects).forEach(p => { if (p.sample) delete this.data.projects[p.id]; });
      delete this.data.meta.sample; this.save();
    }
  },
  save() { try { localStorage.setItem(DATA_KEY, JSON.stringify(this.data)); } catch (e) { toast('無法儲存：瀏覽器不允許存資料（可能是無痕模式）'); } },
  upsert(col, obj) { obj.updatedAt = Date.now(); this.data[col][obj.id] = obj; this.save(); render(); },
  remove(col, id) { delete this.data[col][id]; this.save(); render(); },
  saveSettings() { this.save(); render(); },
  replace(data) { this.data = data; this.save(); render(); },
};
const DB = () => Store.data;

let UI = { boardPlat: 'all', boardCat: 'all', boardIp: 'all', calMonth: null, calSel: null, repTab: 'week', repWeek: null, repMonth: null };
try { Object.assign(UI, JSON.parse(localStorage.getItem(UI_KEY) || '{}')); } catch (e) { /* 忽略 */ }
const saveUI = () => { try { localStorage.setItem(UI_KEY, JSON.stringify({ boardPlat: UI.boardPlat, boardCat: UI.boardCat, boardIp: UI.boardIp, ipSel: UI.ipSel })); } catch (e) { /* 忽略 */ } };

/* ================= 資料查詢 ================= */
const allTasks = () => Object.values(DB().tasks);
const allProjects = () => Object.values(DB().projects);
const platform = id => DB().settings.platforms.find(p => p.id === id);
const platName = id => (platform(id) || {}).name || '其他';
const platColor = id => (platform(id) || {}).color || '#8a8f9c';
const projOf = t => t.projectId ? DB().projects[t.projectId] : null;
const taskPlatId = t => { const p = projOf(t); return p ? p.platform : null; };

/* 專案「現在要看哪個日期」判斷逾期 */
function projKey(p) {
  if (p.status === 'done' || p.status === 'proposed') return null;
  if (p.status === 'prep' || p.status === 'rejected') return p.proposeDate ? { date: p.proposeDate, label: '提案日' } : null;
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
function viewBoard() {
  const T = today();
  const plats = DB().settings.platforms;
  if (UI.boardPlat !== 'all' && !platform(UI.boardPlat)) UI.boardPlat = 'all';
  const cur = platform(UI.boardPlat);
  if (!cur || (UI.boardCat !== 'all' && !cur.categories.includes(UI.boardCat))) UI.boardCat = 'all';
  const ips = DB().settings.ips;
  if (UI.boardIp !== 'all' && !ips.includes(UI.boardIp)) UI.boardIp = 'all';
  const list = allProjects().filter(p => (UI.boardPlat === 'all' || p.platform === UI.boardPlat) && (UI.boardCat === 'all' || p.category === UI.boardCat) && (UI.boardIp === 'all' || p.ip === UI.boardIp));
  const ipChips = ips.length > 1 ? `<div class="chips sub"><span class="hint" style="align-self:center">IP：</span>${[`<button class="chip" data-act="boardIp" data-val="all" aria-pressed="${UI.boardIp === 'all'}">全部</button>`]
    .concat(ips.map(n => `<button class="chip" data-act="boardIp" data-val="${esc(n)}" aria-pressed="${UI.boardIp === n}">${esc(n)}</button>`)).join('')}</div>` : '';

  const platChips = [`<button class="chip" data-act="boardPlat" data-val="all" aria-pressed="${UI.boardPlat === 'all'}">全部</button>`]
    .concat(plats.map(p => `<button class="chip" data-act="boardPlat" data-val="${esc(p.id)}" aria-pressed="${UI.boardPlat === p.id}" style="--pc:${esc(p.color)}"><span class="dot"></span>${esc(p.name)}</button>`)).join('');
  const catChips = cur && cur.categories.length ? `<div class="chips sub">${[`<button class="chip" data-act="boardCat" data-val="all" aria-pressed="${UI.boardCat === 'all'}">全部分類</button>`]
    .concat(cur.categories.map(c => `<button class="chip" data-act="boardCat" data-val="${esc(c)}" aria-pressed="${UI.boardCat === c}">${esc(c)}</button>`)).join('')}</div>` : '';

  const want = cur ? platCols(cur) : ALL_COLS();
  const shown = STATUS.filter(s => want.includes(s.id) || list.some(p => p.status === s.id));
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
    <div class="filters"><div class="chips">${platChips}</div>${catChips}${ipChips}</div>
    <div class="board-wrap" id="boardWrap"><div class="board" id="board">${cols}</div></div>
    <p class="hint">電腦：直接拖拉卡片換欄位。手機：按住卡片約半秒，感覺到震動後再拖。也可以點開專案改狀態。</p>
  </div>`;
}
function cardHTML(p, T) {
  const tasks = allTasks().filter(t => t.projectId === p.id);
  const doneN = tasks.filter(t => t.done).length;
  const dates = [];
  if (p.proposeDate) dates.push(`提案 ${md(p.proposeDate)}`);
  if (p.dueDate) dates.push(`截止 ${md(p.dueDate)}`);
  if (p.launchDate) dates.push(`上傳 ${md(p.launchDate)}`);
  const foot = [badgeHTML(projBadge(p, T))];
  if (p.ip) foot.push(`<span class="badge info">IP ${esc(p.ip)}</span>`);
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
    [['proposeDate', '提案'], ['dueDate', '截止'], ['launchDate', '上傳']].forEach(([f, lab]) => { if (inRange(p[f], nws, nwe)) next.push({ d: p[f], s: `・${tagP(p)}${p.name}｜${md(p[f])} ${lab}` }); });
  });
  tasks.filter(t => !t.done && inRange(t.due, nws, nwe)).forEach(t => next.push({ d: t.due, s: `・${tagT(t)}${t.title}｜${md(t.due)} 完成` }));
  next.sort((a, b) => a.d.localeCompare(b.d));
  L.push(...(next.length ? next.map(x => x.s) : ['（下週尚無排定項目，可在這裡補充）']), '');

  const doing = projects.filter(p => ACTIVE.includes(p.status)).length;
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
    if (c('revising')) parts.push(`修改中 ${c('revising')}`);
    if (c('approved')) parts.push(`已通過 ${c('approved')}`);
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
function viewIps() {
  const ips = DB().settings.ips;
  if (!ips.includes(UI.ipSel)) UI.ipSel = ips[0] || null;
  const tabs = ips.map(n => `<button class="chip" data-act="ipSel" data-val="${esc(n)}" aria-pressed="${n === UI.ipSel}">${esc(n)}</button>`).join('');
  let detail = '<div class="empty">還沒有 IP，在上面輸入名字按 Enter 新增。</div>';
  if (UI.ipSel) {
    const n = UI.ipSel, prof = ensureProfile(n);
    const projs = allProjects().filter(p => p.ip === n);
    const active = projs.filter(p => p.status !== 'done');
    detail = `<section class="panel">
      <div class="ip-head">
        <input type="text" class="ip-name" id="ipName" value="${esc(n)}" aria-label="IP 名稱">
        <div class="actions"><button class="btn primary" data-act="ipCopy">複製全部需求</button><button class="btn danger" data-act="ipDel">刪除 IP</button></div>
      </div>
      <p>${projs.length} 個專案（進行中 ${active.length}）。內容會自動儲存。按「複製全部需求」可以直接傳給剪輯師或攝影師。</p>
      <div class="ip-fields">${prof.fields.map(f => `<div class="ip-field">
          <div class="ip-field-h"><input type="text" value="${esc(f.label)}" data-ipf="label" data-id="${f.id}" aria-label="欄位名稱"><button class="icon-btn" data-act="ipDelField" data-id="${f.id}" aria-label="刪除欄位 ${esc(f.label)}">✕</button></div>
          <textarea rows="2" data-ipf="value" data-id="${f.id}" placeholder="${esc(f.hint || '')}" aria-label="${esc(f.label)}">${esc(f.value)}</textarea>
        </div>`).join('')}</div>
      <div><button class="btn" data-act="ipAddField">＋ 新增欄位</button></div>
    </section>
    ${active.length ? `<section class="sec"><div class="sec-h">進行中的專案<span class="n">${active.length}</span></div><div class="list">${active.map(p => projRow(p, today())).join('')}</div></section>` : ''}`;
  }
  return `<div class="page">
    <header class="page-h"><div><h1>IP 需求</h1><p class="sub">記錄每個 IP 的剪輯風格、字幕、美肌數據等規格</p></div></header>
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
      <div class="col-pick"><span class="hint">看板欄位：</span>${STATUS.map(st => `<button class="chip small" data-act="togCol" data-id="${esc(p.id)}" data-val="${st.id}" aria-pressed="${platCols(p).includes(st.id)}">${esc(stName(st.id, p.id))}</button>`).join('')}</div>
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
    <section class="panel"><h2>同步與通知</h2>
      <p>目前資料只存在這台裝置的瀏覽器。下一步設定 Firebase 後，手機和電腦就會同步，也能開啟推播通知。</p>
      <label class="toggle"><input type="checkbox" disabled> 推播通知（設定同步後開啟）</label>
    </section>
    <section class="panel"><h2>備份</h2>
      <p>建議每個月備份一次。備份檔可以用「匯入」還原。</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="exportFile">下載備份檔</button><button class="btn" data-act="exportCopy">複製備份內容</button>
        <label class="btn" style="position:relative">匯入備份<input type="file" id="importFile" accept=".json,application/json" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label></div>
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
        <label class="f"><span>狀態</span><select id="pStatus">${STATUS.map(s => `<option value="${s.id}" ${s.id === p.status ? 'selected' : ''}>${esc(stName(s.id, p.platform))}</option>`).join('')}</select></label>
        <div class="f"><span style="font-size:.82rem;font-weight:500;color:var(--muted)">優先度</span>
          <div class="seg" id="pPri">${PRIORITY.map(x => `<button type="button" data-val="${x.id}" aria-pressed="${p.priority === x.id}">${x.name}</button>`).join('')}</div></div>
      </div>
      <div class="f-row">
        <label class="f"><span>📝 提案日</span><input type="date" id="pPropose" value="${p.proposeDate || ''}"></label>
        <label class="f"><span>🚀 上傳日</span><input type="date" id="pLaunch" value="${p.launchDate || ''}"></label>
        <label class="f"><span>⏳ 截止日（選填）</span><input type="date" id="pDue" value="${p.dueDate || ''}"></label>
      </div>
      <p class="hint" style="margin-top:-6px">截止日適合製作期長的專案（例如拍攝），填了之後，通過後會改看截止日判斷逾期。</p>
      <label class="f"><span>備註</span><textarea id="pNote" rows="2">${esc(p.note)}</textarea></label>

      <div class="sub-h"><span>退件紀錄（${p.revisions.length} 次）</span></div>
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
    $('.sub-h span', $('#modal')).textContent = `退件紀錄（${p.revisions.length} 次）`;
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
  if (route === 'ips') $$('textarea[data-ipf]').forEach(autoGrow);
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
})();
