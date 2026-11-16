// 推播提醒：由 GitHub Actions 定時執行
// KIND=morning：今日摘要（今天到期、逾期、明天要提案／上傳）
// KIND=weekly ：週日提醒產生週報
// FORCE=1     ：今天已經發過也再發一次（測試用）
import admin from 'firebase-admin';

const SITE = 'https://pawdiary-tw.github.io/pm-app/';
const KIND = process.env.KIND === 'weekly' ? 'weekly' : 'morning';
const FORCE = process.env.FORCE === '1';

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('❌ 找不到伺服器鑰匙：請到 GitHub 專案 Settings → Secrets and variables → Actions，新增名為 FIREBASE_SERVICE_ACCOUNT 的 secret（內容是 Firebase 服務帳戶的 .json 檔）。');
  process.exit(1);
}
let serviceAccount;
try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); }
catch (e) { console.error('❌ FIREBASE_SERVICE_ACCOUNT 的內容不是完整的 .json，請重新複製整個檔案內容（從第一個 { 到最後一個 }）。'); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ---- 日期（一律用台灣時間） ----
const twDate = ms => new Date(ms + 8 * 3600e3).toISOString().slice(0, 10);
const T = twDate(Date.now());
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekStart = s => { const d = new Date(s + 'T00:00:00Z'); const dow = (d.getUTCDay() + 6) % 7; return addDays(s, -dow); };
const isoToTw = iso => iso ? twDate(new Date(iso).getTime()) : null;

// 和網頁相同的逾期判斷
function projKey(p) {
  if (p.status === 'done' || p.status === 'proposed') return null;
  if (p.status === 'prep' || p.status === 'rejected') return p.proposeDate || null;
  return p.dueDate || p.launchDate || null;
}

function morningMessage(tasks, projects) {
  const open = tasks.filter(t => !t.done);
  const late = [...open.filter(t => t.due && t.due < T).map(t => ({ d: t.due, n: t.title })),
    ...projects.map(p => ({ d: projKey(p), n: p.name })).filter(x => x.d && x.d < T)].sort((a, b) => a.d.localeCompare(b.d));
  const due = [...open.filter(t => t.due === T).map(t => ({ n: t.title, pri: t.priority })),
    ...projects.filter(p => projKey(p) === T).map(p => ({ n: p.name, pri: p.priority }))];
  const tm = addDays(T, 1), tomorrow = [];
  projects.filter(p => p.status !== 'done').forEach(p => {
    if (p.proposeDate === tm) tomorrow.push(`提案「${p.name}」`);
    if (p.dueDate === tm) tomorrow.push(`截止「${p.name}」`);
    if (p.launchDate === tm) tomorrow.push(`上傳「${p.name}」`);
  });
  const lines = [];
  if (!late.length && !due.length) lines.push('今天沒有到期的事 🎉');
  else lines.push(`今天到期 ${due.length} 項、逾期 ${late.length} 項`);
  const urgent = late[0] ? `${late[0].n}（已逾期）` : (due.sort((a, b) => ({ high: 0, mid: 1, low: 2 }[a.pri] ?? 1) - ({ high: 0, mid: 1, low: 2 }[b.pri] ?? 1))[0] || {}).n;
  if (urgent) lines.push(`最急：${urgent}`);
  if (tomorrow.length) lines.push(`明天：${tomorrow.slice(0, 3).join('、')}${tomorrow.length > 3 ? ` 等 ${tomorrow.length} 項` : ''}`);
  return { title: '☀️ 今日任務', body: lines.join('\n'), link: SITE + '#today' };
}

function weeklyMessage(tasks, projects) {
  const ws = weekStart(T), we = addDays(ws, 6);
  const inWeek = d => d && d >= ws && d <= we;
  const n = tasks.filter(t => t.done && inWeek(isoToTw(t.completedAt))).length
    + projects.filter(p => p.status === 'done' && inWeek(isoToTw(p.completedAt))).length;
  return { title: '📋 該產生週報了', body: `本週完成 ${n} 項，點開就能一鍵產生週報`, link: SITE + '#report' };
}

const users = await db.collection('users').listDocuments();
let sent = 0;
for (const user of users) {
  const pushDocs = (await user.collection('push').get()).docs;
  if (!pushDocs.length) continue;
  const stateRef = user.collection('notify').doc('state');
  const state = (await stateRef.get()).data() || {};
  if (!FORCE && state[KIND] === T) { console.log(`略過 ${user.id}：今天已經發過 ${KIND}`); continue; }

  const tasks = (await user.collection('tasks').get()).docs.map(d => d.data());
  const projects = (await user.collection('projects').get()).docs.map(d => d.data());
  const msg = KIND === 'weekly' ? weeklyMessage(tasks, projects) : morningMessage(tasks, projects);

  const tokens = pushDocs.map(d => d.data().token);
  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    webpush: {
      notification: { title: msg.title, body: msg.body, icon: SITE + 'icon-192.png', tag: KIND },
      fcmOptions: { link: msg.link },
    },
  });
  // 清掉已失效的裝置
  await Promise.all(res.responses.map((r, i) => {
    const code = r.error && r.error.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') return pushDocs[i].ref.delete();
    if (r.error) console.log('傳送失敗：', code, r.error.message);
    return null;
  }));
  console.log(`${user.id}：成功 ${res.successCount}、失敗 ${res.failureCount}\n${msg.title}\n${msg.body}`);
  if (res.successCount) { await stateRef.set({ [KIND]: T }, { merge: true }); sent += res.successCount; }
}
console.log(`完成，共送出 ${sent} 則（${KIND}，${T}）`);
