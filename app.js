/* 衡学 Study Balance — 页面逻辑
 * 数据全部来自本地服务器（data.json），改动后自动保存。
 */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const VIEWS = ['overview', 'tasks', 'calendar', 'load', 'focus', 'habits', 'me'];
const PALETTE = ['#F0B429', '#E4573D', '#4E7DD1', '#3E7C4F', '#8E6FC1', '#D977A2'];
const RING_C = 728.8; /* 2πr, r=116 */

/* ── 学期与课表（2026-2027 学年第一学期，第一周从 2026-09-07 周一开始） ── */
const SEMESTER_START = '2026-09-07';
const PERIODS = { 1: ['08:00', 100], 3: ['10:00', 100], 5: ['14:00', 100], 7: ['16:05', 100], 9: ['19:00', 95] };
function expandWeeks(text) {
  /* '1-4,6-17' → [1,2,3,4,6..17]；'2-6双,10-16双' → 双周（偶数） */
  const out = [];
  for (const part of String(text).split(/[,，]/)) {
    const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?\s*周?(（双）|\(双\)|双|（单）|\(单\)|单)?$/);
    if (!m) continue;
    const a = +m[1], b = m[2] ? +m[2] : a;
    const par = m[3] || '';
    for (let w = a; w <= b; w++) {
      if (par.includes('双') && w % 2 !== 0) continue;
      if (par.includes('单') && w % 2 !== 1) continue;
      if (!out.includes(w)) out.push(w);
    }
  }
  return out.sort((x, y) => x - y);
}
const TIMETABLE_SPEC = [
  ['概率论与数理统计-10', 1, 3, 'A-518', '杜兰', '1-4,6-17'],
  ['马克思主义基本原理-02', 1, 5, 'A-225', '孙江可', '1-4,6-17'],
  ['线性代数进阶-01', 1, 7, 'A-402', '黄丘林', '1-4,6-9'],
  ['大学英语中级(I)-53', 2, 1, 'E1-201', '吴启瑞', '1-7,9-17'],
  ['大学物理(II)-03', 2, 3, 'B-407', '秦桄阳', '1-7,9-17'],
  ['场论与复变函数-01', 2, 5, 'A-603', '安翔,吕志清', '1-6'],
  ['敦煌学探秘-01', 2, 9, 'A-414', '董永强', '4-7,9-12'],
  ['概率论与数理统计-10', 3, 1, 'A-518', '杜兰', '1-7,9-17'],
  ['电路分析与电子线路BI-02', 3, 3, 'A-423', '李彩彩', '1-7,9-17'],
  ['班级指导-265', 3, 7, 'A-203', '刘婧', '2-6双,10-16双'],
  ['敦煌学探秘-01', 3, 9, 'A-414', '董永强', '4-7,9-12'],
  ['大学物理(II)-03', 4, 1, 'B-407', '秦桄阳', '1-3,5-17'],
  ['大学体育(III)-100 乒乓球俱乐部（上）', 4, 3, '', '苏振阳', '2-3,5-17'],
  ['形势与政策(III)-07', 4, 5, 'B-206', '刘晓红', '11-14'],
  ['马克思主义基本原理-02', 4, 7, 'A-225', '孙江可', '1-3,5-9'],
  ['虚实之间：山水审美与山水艺术-02', 4, 9, 'A-318', '王志清', '5-12'],
  ['场论与复变函数-01', 5, 1, 'A-603', '安翔,吕志清', '1-2,5-16'],
  ['电路分析与电子线路BI-02', 5, 7, 'A-423', '李彩彩', '1-2,5-10'],
  ['从课堂到生活：探寻健康的奥秘-01', 5, 9, 'A-226', '赵彩艳', '5-12']
];
function buildTimetable() {
  return TIMETABLE_SPEC.map((c, i) => ({
    id: 'tt' + String(i + 1).padStart(2, '0'),
    name: c[0], weekday: c[1], kind: '课程',
    start: PERIODS[c[2]][0], minutes: PERIODS[c[2]][1],
    location: c[3], teacher: c[4], weeks: expandWeeks(c[5])
  }));
}
const DEFAULT_EVENTS = [
  { id: 'ev01', name: '中秋节放假', date: '2026-09-25', endDate: '', kind: '假期' },
  { id: 'ev02', name: '国庆节放假（调休安排以学校通知为准）', date: '2026-10-01', endDate: '2026-10-07', kind: '假期' },
  { id: 'ev03', name: '期中考试（预计，以教务通知为准）', date: '2026-11-04', endDate: '2026-11-05', kind: '考试' },
  { id: 'ev04', name: '元旦放假', date: '2027-01-01', endDate: '', kind: '假期' },
  { id: 'ev05', name: '期末考试（预计，共两周）', date: '2027-01-11', endDate: '2027-01-24', kind: '考试' },
  { id: 'ev06', name: '第二学期上课（预计）', date: '2027-03-01', endDate: '', kind: '开学' },
  { id: 'ev07', name: '第二学期期中考试（预计）', date: '2027-04-21', endDate: '2027-04-22', kind: '考试' },
  { id: 'ev08', name: '春季运动会（预计）', date: '2027-04-28', endDate: '2027-04-29', kind: '校历' },
  { id: 'ev09', name: '第二学期期末考试（预计）', date: '2027-06-15', endDate: '2027-06-28', kind: '考试' }
];
function weeksToText(weeks) {
  if (!weeks || !weeks.length) return '每周';
  const ws = weeks.slice().sort((a, b) => a - b);
  const parts = [];
  let i = 0;
  while (i < ws.length) {
    let j = i;
    while (j + 1 < ws.length && ws[j + 1] === ws[j] + 1) j++;
    if (j - i >= 2 && ws[i + 1] - ws[i] === 2) {
      parts.push(`${ws[i]}-${ws[j]}周${ws[i] % 2 === 0 ? '（双）' : '（单）'}`);
    } else if (j > i) {
      parts.push(`${ws[i]}-${ws[j]}周`);
    } else {
      parts.push(`${ws[i]}周`);
    }
    i = j + 1;
  }
  return parts.join(',');
}
function parseWeeksText(text) {
  if (!text || /每周/.test(text)) return null;
  const w = expandWeeks(text);
  return w.length ? w : null;
}
function semesterWeekOf(ds) {
  const start = state.settings && state.settings.semesterStart;
  if (!start) return null;
  return Math.round((new Date(ds + 'T12:00') - new Date(start + 'T12:00')) / 86400000 / 7) + 1;
}

let state = null;
let info = { port: 0, lan: [] };
const MODE = { server: false };  /* true=电脑版(本地发动机) false=网页版(数据存浏览器) */
const LS_KEY = 'hengxue-state-v1';
let currentView = 'overview';
let weekOffset = 0;
let taskFilter = 'all';
let editingTaskId = null;
const courseColors = {};

let saveTimer = null;

/* ── 小工具 ─────────────────────────── */
function uid() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayStr(off = 0) {
  const d = new Date();
  d.setDate(d.getDate() + off);
  return localDate(d);
}
function weekdayOf(ds) { return new Date(ds + 'T12:00:00').getDay(); } /* 0=周日 */
function cnWeek(n) { return '日一二三四五六'[n] || ''; }
function mondayOf(ds) {
  const d = new Date(ds + 'T12:00:00');
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return localDate(d);
}
function addDays(ds, n) {
  const d = new Date(ds + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return localDate(d);
}
function fmtDateLabel(ds) {
  if (!ds) return '';
  const [, m, d] = ds.split('-');
  return `${+m}/${+d}`;
}
function toMin(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }
function fmtClock(min) {
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
}
function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
function fmtDur(min) {
  min = Math.round(min);
  if (min < 60) return `${min} 分钟`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
}
function fmtH(min) {
  if (!min) return '0';
  if (min < 60) return `${min}m`;
  const h = min / 60;
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}
function colorFor(name) {
  if (!courseColors[name]) courseColors[name] = PALETTE[Object.keys(courseColors).length % PALETTE.length];
  return courseColors[name];
}

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2300);
}

/* ── 数据读写 ───────────────────────── */
/* 网页版的示例数据（和电脑版一致，日期按当天生成） */
function clientSeed() {
  return {
    version: 2,
    settings: { semesterStart: SEMESTER_START, timetableV2: true },
    profile: { name: '符同学' },
    tasks: [
      { id: 't1', title: '完成高等数学第三章习题', course: '高等数学', due: `${todayStr(0)}T23:59`, estimateMin: 90, priority: '高', done: false, doneAt: null },
      { id: 't2', title: '阅读《社会学概论》第五章', course: '社会学概论', due: `${todayStr(-1)}T18:00`, estimateMin: 60, priority: '中', done: false, doneAt: null },
      { id: 't3', title: '准备英语演讲稿', course: '大学英语', due: `${todayStr(2)}T20:00`, estimateMin: 120, priority: '低', done: false, doneAt: null }
    ],
    classes: buildTimetable(),
    blocks: [
      { id: 'b1', name: '深度学习时间', date: todayStr(0), start: '09:30', minutes: 45, kind: '自习' },
      { id: 'b2', name: '整理今日复盘', date: todayStr(0), start: '20:00', minutes: 30, kind: '复盘' }
    ],
    focusLog: { [todayStr(0)]: 150 },
    events: DEFAULT_EVENTS,
    habits: [
      { id: 'h1', name: '背单词 20 个', emoji: '📚' },
      { id: 'h2', name: '晨跑 30 分钟', emoji: '🏃' },
      { id: 'h3', name: '睡前阅读 20 页', emoji: '🌙' }
    ],
    habitLog: { [todayStr(0)]: ['h1'] },
    pomodoroCount: 3
  };
}

function persistLocal() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch (e) {
    toast('本地保存失败：浏览器存储不可用');
  }
}

/* 判断当前是电脑版（有本地发动机）还是网页版 */
async function detectServer() {
  try {
    const r = await fetch('api/info', { headers: { 'Accept': 'application/json' } });
    if (r.ok) {
      const j = await r.json();
      if (j && typeof j.port === 'number') {
        info = j;
        return true;
      }
    }
  } catch (e) { /* 没有发动机 → 网页版 */ }
  return false;
}

async function loadAll() {
  MODE.server = await detectServer();
  if (MODE.server) {
    try {
      state = await fetch('api/state').then(r => r.json());
    } catch (e) {
      MODE.server = false;
    }
  }
  if (!state) {
    try { state = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { state = null; }
  }
  if (!state) state = clientSeed();
  if (!MODE.server) persistLocal();
  state.profile = state.profile || { name: '符同学' };
  state.tasks = state.tasks || [];
  state.classes = state.classes || [];
  state.blocks = state.blocks || [];
  state.focusLog = state.focusLog || {};
  state.exams = state.exams || [];
  state.habits = state.habits || [];
  state.habitLog = state.habitLog || {};
  state.pomodoroCount = state.pomodoroCount || 0;
  state.events = state.events || [];
  if (migrateTimetable()) save();
}

/* 一次性升级：把示例课表换成真实课表，并接入校历日程 */
function migrateTimetable() {
  if (state.settings && state.settings.timetableV2 === true) return false;
  state.settings = { semesterStart: SEMESTER_START, timetableV2: true };
  state.classes = buildTimetable();
  state.events = DEFAULT_EVENTS;
  state.blocks = state.blocks.filter(b => !['深度学习时间', '整理今日复盘'].includes(b.name));
  delete state.exams;
  return true;
}

function save() {
  if (!MODE.server) {
    persistLocal();
    return;
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await fetch('api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
      });
    } catch (e) {
      toast('保存失败，请确认衡学还在运行');
    }
  }, 250);
}

/* ── 派生数据 ───────────────────────── */
function itemsOn(ds) {
  const wk = semesterWeekOf(ds);
  const cls = state.classes.filter(c => weekdayOf(ds) === c.weekday)
    .filter(c => {
      if (wk == null) return true;          /* 没设置学期开始 → 每周都显示 */
      if (wk < 1) return !c.weeks;          /* 开学前：只显示没排周次的课程（一般没有） */
      return !c.weeks || c.weeks.includes(wk);
    })
    .map(c => ({ ...c, date: ds, kind: c.kind || '课程' }));
  const blks = state.blocks.filter(b => b.date === ds);
  return [...cls, ...blks].sort((a, b) => toMin(a.start) - toMin(b.start));
}

function loadInfo() {
  const t = todayStr(), nm = nowMin();
  let rem = 0;
  for (const it of itemsOn(t)) {
    const s = toMin(it.start), e = s + it.minutes;
    if (e > nm) rem += e - Math.max(nm, s);
  }
  const score = Math.min(100, Math.round(rem / 6));
  const zone = score < 35 ? ['轻松', '状态良好', '节奏很合适。']
    : score < 70 ? ['适中', '节奏合适', '注意保持节奏。']
      : ['繁忙', '注意休息', '安排有点满，别硬撑。'];
  return { rem, score, zone };
}

function nextUp() {
  const nm = nowMin(), t = todayStr();
  const todays = itemsOn(t).filter(it => toMin(it.start) + it.minutes > nm);
  if (todays.length) {
    const it = todays[0];
    const s = toMin(it.start);
    return {
      label: it.kind === '课程' ? '下一节课' : '下一个安排',
      name: it.name,
      meta: `${it.start} – ${fmtClock(s + it.minutes)}${it.location ? ' · ' + it.location : ''}`
    };
  }
  for (let i = 1; i <= 7; i++) {
    const ds = todayStr(i);
    const its = itemsOn(ds);
    if (its.length) {
      const it = its[0];
      return {
        label: i === 1 ? '明天' : `周${cnWeek(weekdayOf(ds))}`,
        name: it.name,
        meta: `${fmtDateLabel(ds)} ${it.start}${it.location ? ' · ' + it.location : ''}`
      };
    }
  }
  return { label: '下一节课', name: '暂无安排', meta: '去「智能日历」添加吧' };
}

function dueTasksUpToToday() {
  const t = todayStr();
  return state.tasks.filter(x => (x.due || '').slice(0, 10) && (x.due || '').slice(0, 10) <= t);
}

function overviewStats() {
  const t = todayStr();
  const due = dueTasksUpToToday();
  const doneToday = due.filter(x => x.done && (x.doneAt || '').slice(0, 10) === t).length;
  const undone = due.filter(x => !x.done).length;
  const rate = due.length ? Math.round(doneToday / due.length * 100) : 0;
  const focusMin = state.focusLog[t] || 0;
  return { planned: due.length, undone, doneToday, rate, focusMin };
}

function momentum() {
  const t = todayStr();
  const rel = state.tasks.filter(x => {
    const d = (x.due || '').slice(0, 10);
    return d && d <= t && d >= todayStr(-7);
  });
  const done = rel.filter(x => x.done).length;
  const rate = rel.length ? done / rel.length : 0.5;
  const hiDone = state.tasks.some(x => x.done && x.priority === '高' && (x.doneAt || '').slice(0, 10) === t);
  const score = Math.max(5, Math.min(98, Math.round(30 + 55 * rate + (hiDone ? 12 : 0))));
  let hint;
  if (state.tasks.some(x => !x.done && x.priority === '高' && (x.due || '').slice(0, 10) <= t)) {
    hint = '完成一项高优先级任务，势能会明显提升。';
  } else if (rate >= 0.7) {
    hint = '势头很好，保持这个节奏！';
  } else {
    hint = '从一件小任务开始，势能就会慢慢积累。';
  }
  return { score, hint };
}

/* ── 顶栏 / 侧栏 ────────────────────── */
function updateChrome() {
  const h = new Date().getHours();
  const g = h < 11 ? '早上好' : h < 13 ? '中午好' : h < 18 ? '下午好' : '晚上好';
  $('#greeting').textContent = `${g}，${state.profile.name}`;
  const short = state.profile.name.replace(/同学$/, '') || '学';
  $('#avatar').textContent = short[0];
  $('#topbarDate').textContent = `${+todayStr().slice(5, 7)}/${+todayStr().slice(8, 10)} 星期${cnWeek(new Date().getDay())}`;
}

/* ── 任务行 ─────────────────────────── */
function taskRowHTML(t) {
  const course = t.course || '未分类';
  const col = colorFor(course);
  const dueDate = (t.due || '').slice(0, 10);
  const dueTime = (t.due || '').slice(11, 16) || '';
  const t0 = todayStr();
  const dateLabel = dueDate === t0 ? '今天' : dueDate === todayStr(-1) ? '昨天' : fmtDateLabel(dueDate);
  const overdue = !t.done && dueDate && dueDate < t0;
  const pClass = t.priority === '高' ? 'pill-hi' : t.priority === '低' ? 'pill-lo' : 'pill-mid';
  return `<div class="task-row ${t.done ? 'done' : ''}" data-id="${t.id}" style="--course-color:${col}">
    <button class="ck" data-act="toggle" title="完成 / 取消完成">
      <svg viewBox="0 0 24 24"><path d="M4.5 12.5l5 5 10-11" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <div class="task-main">
      <span class="task-title">${esc(t.title)}</span>
      <span class="task-meta">${esc(course)} · ${dateLabel} ${dueTime} · ${fmtDur(t.estimateMin || 0)}${overdue ? ' · <b class="overdue">已逾期</b>' : ''}</span>
    </div>
    <div class="task-ops">
      <span class="pill ${pClass}">${esc(t.priority || '中')}</span>
      <button class="icon-btn" data-act="edit" title="编辑"><svg><use href="#i-edit"/></svg></button>
      <button class="icon-btn" data-act="del" title="删除"><svg><use href="#i-trash"/></svg></button>
    </div>
  </div>`;
}

function bindTaskList(container) {
  container.addEventListener('click', e => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    const actEl = e.target.closest('[data-act]');
    if (!actEl) return;
    const act = actEl.dataset.act;
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    if (act === 'toggle') {
      if (t.done) {
        t.done = false;
        t.doneAt = null;
      } else {
        t.done = true;
        t.doneAt = new Date().toISOString();
        toast('完成一项，学习势能 +1 ⚡');
      }
      save();
      refresh();
    } else if (act === 'edit') {
      openTaskDialog(t);
    } else if (act === 'del') {
      if (confirm(`删除任务「${t.title}」？`)) {
        state.tasks = state.tasks.filter(x => x.id !== id);
        save();
        refresh();
        toast('已删除');
      }
    }
  });
}

/* ── 各页面渲染 ─────────────────────── */
function renderOverview() {
  /* 学习负载 */
  const L = loadInfo();
  $('#loadScore').textContent = L.score;
  $('#loadStrip').style.width = L.score + '%';
  $('#loadFill').style.width = L.score + '%';
  $('#loadBadge').textContent = L.zone[1];
  $('#loadSummary').textContent = L.rem <= 0
    ? '今天的安排都完成啦，好好休息！'
    : `今天还有 ${fmtDur(L.rem)} 的学习安排，${L.zone[2]}`;

  /* 下一节课 */
  const N = nextUp();
  $('#nextWhen').textContent = N.label;
  $('#nextName').textContent = N.name;
  $('#nextMeta').innerHTML = `<svg><use href="#i-clock"/></svg>${esc(N.meta)}`;

  /* 三个统计 */
  const S = overviewStats();
  $('#statTasks').textContent = S.undone;
  $('#statTasksSub').textContent = `共 ${S.planned} 项计划`;
  $('#statFocus').textContent = fmtH(S.focusMin);
  $('#statFocusSub').textContent = S.focusMin ? `来自专注模式记录` : '去专注模式打卡吧';
  $('#statRate').textContent = S.rate + '%';
  $('#statRateSub').textContent = S.doneToday ? `${S.doneToday} 项已完成` : '还没完成，加油';

  /* 今日节奏 */
  const t = todayStr(), nm = nowMin();
  const its = itemsOn(t);
  $('#rhythmList').innerHTML = its.length ? its.map(it => {
    const s = toMin(it.start), e = s + it.minutes;
    const isNow = nm >= s && nm < e;
    const past = e <= nm;
    const bar = it.kind === '课程' ? '#4E7DD1' : it.kind === '复盘' ? '#3E7C4F' : '#F0B429';
    const stage = isNow ? '当前阶段' : past ? '已结束' : '待开始';
    return `<div class="rhythm-item ${isNow ? 'now' : ''} ${past ? 'past' : ''}">
      <span class="r-time">${it.start}</span><i class="r-bar" style="background:${bar}"></i>
      <div class="r-main"><b>${esc(it.name)}</b><span>${it.minutes} 分钟 · ${stage}${it.location ? ' · ' + esc(it.location) : ''}</span></div>
      ${isNow ? '<span class="pill pill-now">NOW</span>' : ''}
    </div>`;
  }).join('') : '<p class="hint" style="margin-top:4px">今天没有安排，去「智能日历」添加吧。</p>';

  /* 学习势能 */
  const M = momentum();
  $('#momScore').textContent = M.score;
  $('#momFill').style.width = M.score + '%';
  $('#momHint').textContent = M.hint;

  /* 考试倒计时（取校历日程里最近的考试） */
  const todayNow = todayStr();
  const nextExam = (state.events || [])
    .filter(ev => ev.kind === '考试' && (ev.endDate || ev.date) >= todayNow)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (nextExam) {
    const days = Math.round((new Date(nextExam.date + 'T12:00') - new Date(todayNow + 'T12:00')) / 86400000);
    const range = nextExam.endDate && nextExam.endDate !== nextExam.date ? ` – ${fmtDateLabel(nextExam.endDate)}` : '';
    $('#examBody').innerHTML = `
      <div class="exam-days"><b class="${days === 0 ? 'today' : ''}">${days === 0 ? '今天' : days}</b>${days === 0 ? '' : '<span>天后</span>'}</div>
      <div class="exam-name">${esc(nextExam.name)}</div>
      <div class="exam-date">${fmtDateLabel(nextExam.date)}${range} 周${cnWeek(weekdayOf(nextExam.date))}${days === 0 ? '，加油！' : ''}</div>`;
  } else {
    $('#examBody').innerHTML = '<p class="exam-empty">还没有考试安排，<button class="linklike" data-goto="calendar">去添加</button></p>';
  }

  /* 今天的任务 */
  const t0 = todayStr();
  const list = dueTasksUpToToday().filter(x => !x.done || (x.doneAt || '').slice(0, 10) === t0)
    .sort((a, b) => (a.done - b.done) || (a.due || '').localeCompare(b.due || ''));
  $('#ttCount').textContent = `${list.filter(x => x.done).length}/${list.length}`;
  $('#todayList').innerHTML = list.length
    ? list.map(taskRowHTML).join('')
    : '<p class="hint" style="margin-top:4px">今天没有待办，去「任务清单」计划点什么吧。</p>';
}

function renderTasks() {
  const t = todayStr();
  const all = state.tasks.slice().sort((a, b) =>
    ((a.done ? 1 : 0) - (b.done ? 1 : 0)) || (a.due || '').localeCompare(b.due || ''));

  if (taskFilter === 'done') {
    const done = all.filter(x => x.done);
    $('#taskList').innerHTML = done.length
      ? done.map(taskRowHTML).join('')
      : '<p class="hint">还没有已完成的任务。</p>';
    return;
  }

  const open = all.filter(x => !x.done);
  const groups = [
    ['已逾期', 'overdue', open.filter(x => (x.due || '').slice(0, 10) && (x.due || '').slice(0, 10) < t)],
    ['今天', '', open.filter(x => (x.due || '').slice(0, 10) === t)],
    ['以后', '', open.filter(x => !(x.due || '').slice(0, 10) || (x.due || '').slice(0, 10) > t)]
  ];
  let html = '';
  for (const [name, cls, arr] of groups) {
    if (arr.length) {
      html += `<div class="group-head ${cls}">${name} · ${arr.length}</div>` + arr.map(taskRowHTML).join('');
    }
  }
  if (!html) html = '<p class="hint">这里空空的。点右上角「＋ 新建任务」开始规划。</p>';
  if (taskFilter === 'all') {
    const done = all.filter(x => x.done);
    if (done.length) html += `<div class="group-head">已完成 · ${done.length}</div>` + done.map(taskRowHTML).join('');
  }
  $('#taskList').innerHTML = html;
}

/* ── 习惯打卡 ───────────────────────── */
function habitStreak(h) {
  const done = (ds) => (state.habitLog[ds] || []).includes(h.id);
  let streak = 0;
  let i = done(todayStr()) ? 0 : 1; /* 今天还没打，则从昨天开始往回数 */
  while (i <= 3660) {
    if (done(todayStr(-i))) { streak++; i++; }
    else break;
  }
  return streak;
}

function renderHabits() {
  const t = todayStr();
  const doneIds = state.habitLog[t] || [];
  $('#habitCount').textContent = `${doneIds.length}/${state.habits.length}`;
  $('#habitStreakPill').textContent = state.habits.length && doneIds.length >= state.habits.length
    ? '今日全勤 ✓'
    : `已打 ${doneIds.length}/${state.habits.length}`;

  $('#habitToday').innerHTML = state.habits.length ? state.habits.map(h => {
    const on = doneIds.includes(h.id);
    const s = habitStreak(h);
    return `<div class="habit-row ${on ? 'done' : ''}" data-habit="${h.id}">
      <button class="ck" data-act="habit-toggle" title="打卡 / 取消打卡">
        <svg viewBox="0 0 24 24"><path d="M4.5 12.5l5 5 10-11" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <span class="habit-emoji">${esc(h.emoji || '📌')}</span>
      <div class="habit-main"><b>${esc(h.name)}</b><span>${s > 0 ? `已坚持 ${s} 天` : '今天还没打卡'}</span></div>
      <span class="streak-pill">🔥 ${s}</span>
    </div>`;
  }).join('') : '<p class="exam-empty">还没有习惯，在右边添加第一个吧。</p>';

  $('#habitManage').innerHTML = state.habits.map(h => `
    <div class="habit-row" data-habit="${h.id}">
      <span class="habit-emoji">${esc(h.emoji || '📌')}</span>
      <div class="habit-main"><b>${esc(h.name)}</b></div>
      <button class="icon-btn" data-act="habit-del" title="删除习惯"><svg><use href="#i-trash"/></svg></button>
    </div>`).join('') || '<p class="exam-empty">还没有习惯。</p>';

  const days = Array.from({ length: 14 }, (_, i) => todayStr(-13 + i));
  $('#habitHeat').innerHTML = state.habits.length
    ? state.habits.map(h => `
      <div class="habit-heat-row">
        <div class="habit-heat-name">${esc(h.emoji || '')} ${esc(h.name)}</div>
        <div class="heat-cells">${days.map(ds => `<i class="heat-cell ${(state.habitLog[ds] || []).includes(h.id) ? 'on' : ''} ${ds === t ? 'today' : ''}" title="${ds}"></i>`).join('')}</div>
      </div>`).join('') +
      `<div class="heat-legend"><i class="heat-cell"></i> 未打卡&nbsp;&nbsp;<i class="heat-cell on"></i> 已打卡&nbsp;&nbsp;（最右是今天）</div>`
    : '<p class="exam-empty">添加习惯后，这里会显示最近 14 天的打卡记录。</p>';
}

/* ── 校历日程（考试 / 假期 / 开学） ──── */
function renderEvents() {
  const t = todayStr();
  const list = (state.events || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const rowHtml = (ev, isPast) => {
    const end = ev.endDate || ev.date;
    const days = Math.round((new Date(ev.date + 'T12:00') - new Date(t + 'T12:00')) / 86400000);
    let label;
    if (isPast) label = '已结束';
    else if (days === 0) label = '今天开始！';
    else if (days === 1) label = '明天开始';
    else label = `还有 ${days} 天`;
    const range = ev.endDate && ev.endDate !== ev.date ? ` – ${fmtDateLabel(ev.endDate)}` : '';
    return `<div class="exam-row" data-event="${ev.id}">
      <div class="exam-title"><b>${esc(ev.name)}</b><span>${fmtDateLabel(ev.date)}${range} 周${cnWeek(weekdayOf(ev.date))}</span></div>
      <span class="pill ${ev.kind === '考试' ? 'pill-hi' : isPast ? 'pill-lo' : 'pill-mid'}">${esc(ev.kind)} · ${label}</span>
      <button class="icon-btn" data-act="event-del" title="删除"><svg><use href="#i-trash"/></svg></button>
    </div>`;
  };
  const upcoming = list.filter(x => (x.endDate || x.date) >= t).map(x => rowHtml(x, false)).join('');
  const past = list.filter(x => (x.endDate || x.date) < t).map(x => rowHtml(x, true)).join('');
  $('#examList').innerHTML = (upcoming + past) || '<p class="exam-empty">还没有日程，在下面添加吧。</p>';
}

function renderCalendar() {
  const base = addDays(mondayOf(todayStr()), weekOffset * 7);
  const wk = semesterWeekOf(base);
  $('#wkLabel').textContent = `${fmtDateLabel(base)} – ${fmtDateLabel(addDays(base, 6))}` +
    (wk && wk >= 1 ? ` · 第 ${wk} 周` : (wk != null ? ' · 假期中' : ''));
  const grid = $('#weekGrid');
  grid.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const ds = addDays(base, i);
    const col = document.createElement('div');
    col.className = 'day-col' + (ds === todayStr() ? ' today' : '');
    const evs = (state.events || []).filter(ev => ds >= ev.date && ds <= (ev.endDate || ev.date));
    const evHtml = evs.map(ev =>
      `<div class="chip chip-${esc(ev.kind)}"><b>📅 ${esc(ev.name)}</b></div>`).join('');
    const chips = itemsOn(ds).map(it => `
      <button class="chip chip-${esc(it.kind || '其他')}" data-del-item="${it.id}" data-kind="${esc(it.kind || '')}" data-name="${esc(it.name)}">
        <span class="chip-time">${it.start}–${fmtClock(toMin(it.start) + it.minutes)}</span>
        <b>${esc(it.name)}</b>
        ${it.location ? `<span>📍 ${esc(it.location)}</span>` : ''}
        ${it.teacher ? `<span>👨‍🏫 ${esc(it.teacher)}</span>` : ''}
      </button>`).join('');
    col.innerHTML = `<div class="day-head"><b>${fmtDateLabel(ds)}</b><span>周${cnWeek(weekdayOf(ds))}</span></div>${evHtml + chips || '<div class="day-empty">—</div>'}`;
    grid.appendChild(col);
  }
}

function renderLoad() {
  const t = todayStr();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const ds = todayStr(i);
    const planned = itemsOn(ds).reduce((s, it) => s + it.minutes, 0)
      + state.tasks.filter(x => !x.done && (x.due || '').slice(0, 10) === ds)
        .reduce((s, x) => s + (x.estimateMin || 0), 0);
    days.push({ ds, planned });
  }
  const max = Math.max(60, ...days.map(d => d.planned));
  $('#weekChart').innerHTML = days.map(d => `
    <div class="wc-col${d.ds === t ? ' today' : ''}">
      <span class="wc-val">${d.planned ? fmtH(d.planned) : ''}</span>
      <div class="wc-bar" style="height:${Math.max(4, Math.round(d.planned / max * 200))}px"></div>
      <div class="wc-day">${d.ds === t ? '今天' : '周' + cnWeek(weekdayOf(d.ds))}<small>${fmtDateLabel(d.ds)}</small></div>
    </div>`).join('');

  const S = overviewStats();
  const overdue = state.tasks.filter(x => !x.done && (x.due || '').slice(0, 10) && (x.due || '').slice(0, 10) < t).length;
  const weekFocus = Object.entries(state.focusLog)
    .filter(([d]) => d >= todayStr(-6) && d <= t)
    .reduce((s, [, m]) => s + m, 0);
  const rows = [
    ['今日安排学习量', fmtDur(itemsOn(t).reduce((s, it) => s + it.minutes, 0)), ''],
    ['今日已专注', fmtDur(S.focusMin), S.focusMin > 0 ? 'up' : ''],
    ['今日完成率', S.rate + '%', S.rate >= 50 ? 'up' : ''],
    ['逾期未完成', overdue + ' 项', overdue > 0 ? 'down' : ''],
    ['近 7 天累计专注', fmtDur(weekFocus), 'up']
  ];
  $('#loadSummaryBox').innerHTML = rows.map(([k, v, cls]) =>
    `<div class="summary-item"><span>${k}</span><b class="${cls}">${v}</b></div>`).join('');
}

/* ── 专注模式 ───────────────────────── */
const F = { total: 25 * 60, left: 25 * 60, running: false, timer: null };

let noiseNodes = null;
function setNoise(on) {
  if (on) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!noiseNodes) noiseNodes = {};
      if (!noiseNodes.ctx) noiseNodes.ctx = new Ctx();
      const ctx = noiseNodes.ctx;
      if (ctx.state === 'suspended') ctx.resume();
      if (noiseNodes.src) return; /* 已经在响 */
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02; /* 棕噪声，听起来像稳定雨声 */
        d[i] = last * 3.5;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0.1;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start();
      noiseNodes.src = src;
    } catch (e) { /* 浏览器不支持就算了 */ }
  } else if (noiseNodes && noiseNodes.src) {
    try { noiseNodes.src.stop(); } catch (e) {}
    noiseNodes.src = null;
  }
}

function noiseWanted() { return $('#noiseToggle').checked; }

function renderGarden() {
  const n = state.pomodoroCount || 0;
  $('#focusGarden').innerHTML = n === 0
    ? '<span class="sprout">完成第一个番茄钟，种下第一棵树 🌱</span>'
    : '🌳'.repeat(Math.min(n, 12)) + (n > 12 ? ` <span class="sprout">…已经种了 ${n} 棵</span>` : '');
}

function renderFocus() {
  const sel = $('#focusTask');
  const cur = sel.value;
  sel.innerHTML = '<option value="">随便专注一下（不关联任务）</option>' +
    state.tasks.filter(t => !t.done).map(t => `<option value="${t.id}">${esc(t.title)}</option>`).join('');
  if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
  renderGarden();
  updateFocusUI();
}

function updateFocusUI() {
  $('#focusTime').textContent =
    String(Math.floor(F.left / 60)).padStart(2, '0') + ':' + String(F.left % 60).padStart(2, '0');
  $('#ringFill').style.strokeDashoffset = RING_C * (1 - F.left / F.total);
  $('#focusState').textContent = F.running ? '专注中…' : F.left === F.total ? '准备开始' : '已暂停';
  $('#btnStart').textContent = F.running ? '暂停' : F.left === F.total ? '开始专注' : '继续';
  const isPreset = [25, 45, 60].includes(F.total / 60);
  $$('#focusDurs button').forEach(b => {
    b.classList.toggle('active', b.dataset.min === 'custom' ? !isPreset : +b.dataset.min * 60 === F.total);
  });
  $('#focusCustom').classList.toggle('hidden', isPreset);
}

function startPause() {
  if (F.running) {
    clearInterval(F.timer);
    F.running = false;
    setNoise(false);
  } else {
    F.running = true;
    setNoise(noiseWanted());
    F.timer = setInterval(focusTick, 1000);
  }
  updateFocusUI();
}

function focusTick() {
  F.left -= 1;
  if (F.left <= 0) {
    finishFocus(true);
    return;
  }
  updateFocusUI();
}

function recordFocus(mins) {
  const t = todayStr();
  state.focusLog[t] = (state.focusLog[t] || 0) + mins;
  save();
  updateChrome();
  toast(`已记录 ${mins} 分钟专注 💪`);
}

function finishFocus(natural) {
  clearInterval(F.timer);
  F.running = false;
  setNoise(false);
  if (natural) {
    state.pomodoroCount = (state.pomodoroCount || 0) + 1;
    recordFocus(Math.max(1, Math.round(F.total / 60)));
    beep();
    if (currentView === 'focus') renderGarden();
  }
  F.left = F.total;
  if (currentView === 'focus') renderFocus();
}

function resetFocus() {
  const elapsedMin = Math.floor((F.total - F.left) / 60);
  if (!F.running && F.left === F.total) return;
  if (elapsedMin >= 1) {
    if (confirm(`这次专注了约 ${elapsedMin} 分钟，记录下来吗？（确定=记录，取消=放弃）`)) recordFocus(elapsedMin);
  }
  clearInterval(F.timer);
  F.running = false;
  setNoise(false);
  F.left = F.total;
  if (currentView === 'focus') renderFocus();
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 660].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f;
      o.connect(g);
      g.connect(ctx.destination);
      const t0 = ctx.currentTime + i * 0.3;
      g.gain.setValueAtTime(0.07, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.24);
      o.start(t0);
      o.stop(t0 + 0.26);
    });
  } catch (e) { /* 无声也罢 */ }
}

/* ── 我的空间 ───────────────────────── */
function renderMe() {
  $('#nameInput').value = state.profile.name;
  $('#semesterStart').value = (state.settings && state.settings.semesterStart) || '';
  $('#lanCard').classList.toggle('hidden', !MODE.server);
  $('#standaloneCard').classList.toggle('hidden', MODE.server);
  $('#dataSub2').textContent = MODE.server
    ? '所有数据只存在这台电脑的 data.json 文件里'
    : '数据保存在此设备的浏览器里，用下面的备份功能在设备间搬家';
  if (!MODE.server) return;
  const lan = info.lan || [];
  $('#lanUrls').innerHTML = lan.length
    ? lan.map(u => `<div class="lan-row"><span>${u}</span><button data-copy="${u}">复制</button></div>`).join('')
    : '<p class="hint" style="margin-top:0">没检测到局域网地址——确认电脑已连上 Wi-Fi，然后重启一次衡学。</p>';
}

/* ── 路由 ───────────────────────────── */
function go(v) {
  if (!VIEWS.includes(v)) v = 'overview';
  location.hash = '#/' + v;
}

function route() {
  let v = location.hash.replace('#/', '') || 'overview';
  if (!VIEWS.includes(v)) v = 'overview';
  currentView = v;
  $$('.view').forEach(x => x.classList.add('hidden'));
  const el = $('#view-' + v);
  if (el) el.classList.remove('hidden');
  $$('.nav-btn, .bn-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  if (v === 'overview') renderOverview();
  else if (v === 'tasks') renderTasks();
  else if (v === 'calendar') { renderCalendar(); renderEvents(); }
  else if (v === 'load') renderLoad();
  else if (v === 'focus') renderFocus();
  else if (v === 'habits') renderHabits();
  else if (v === 'me') renderMe();
  closeSearch();
}

function refresh() {
  route();
  updateChrome();
}

/* ── 搜索 ───────────────────────────── */
function closeSearch() {
  const d = $('#searchDrop');
  d.classList.remove('open');
  d.innerHTML = '';
}

function bindSearch() {
  const si = $('#searchInput');
  si.addEventListener('input', () => {
    const q = si.value.trim().toLowerCase();
    const drop = $('#searchDrop');
    if (!q) return closeSearch();
    const res = state.tasks
      .filter(t => (t.title + ' ' + (t.course || '')).toLowerCase().includes(q))
      .slice(0, 6);
    drop.innerHTML = res.length
      ? res.map(t => `<button class="sd-item" data-id="${t.id}"><b>${esc(t.title)}</b><span>${esc(t.course || '未分类')} · ${t.done ? '已完成' : '未完成'}</span></button>`).join('')
      : '<div class="sd-empty">没有找到相关任务</div>';
    drop.classList.add('open');
  });
  si.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const first = $('#searchDrop .sd-item');
      if (first) first.click();
    }
    if (e.key === 'Escape') { closeSearch(); si.blur(); }
  });
  $('#searchDrop').addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    const id = b.dataset.id;
    si.value = '';
    go('tasks');
    setTimeout(() => {
      const row = $(`#taskList [data-id="${id}"]`);
      if (row) {
        row.classList.add('flash');
        row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(() => row.classList.remove('flash'), 3000);
      }
    }, 80);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.searchbox')) closeSearch();
  });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      si.focus();
    }
  });
}

/* ── 弹窗：任务 ─────────────────────── */
function openTaskDialog(t) {
  const dlg = $('#taskDialog');
  const f = $('#taskForm');
  editingTaskId = t ? t.id : null;
  $('#taskDlgTitle').textContent = t ? '编辑任务' : '新建任务';
  /* 课程名自动补全：来自已有任务 + 每周课表 */
  $('#courseList').innerHTML = [...new Set([
    ...state.tasks.map(x => x.course).filter(Boolean),
    ...state.classes.map(c => c.name)
  ])].map(c => `<option value="${esc(c)}">`).join('');
  f.reset();
  f.dueDate.value = t ? (t.due || '').slice(0, 10) || todayStr() : todayStr();
  f.dueTime.value = t ? ((t.due || '').slice(11, 16) || '23:59') : '23:59';
  if (t) {
    f.title.value = t.title;
    f.course.value = t.course || '';
    f.estimateMin.value = String(t.estimateMin || 60);
    f.priority.value = t.priority || '中';
  }
  dlg.showModal();
  f.title.focus();
}

/* ── 弹窗：安排（新建 / 编辑） ──────── */
let blockEdit = null; /* null=新建；{kind:'block'|'class', id}=编辑 */

function openBlockDialog() {
  const f = $('#blockForm');
  blockEdit = null;
  f.reset();
  $('#blockDateRow').classList.remove('hidden');
  $('#blockWeekRow').classList.add('hidden');
  $('#blockClassRow').classList.add('hidden');
  $('#blockRepeatRow').classList.remove('hidden');
  $('#blockDelete').classList.add('hidden');
  f.date.value = todayStr();
  $('#blockDialog').showModal();
  f.name.focus();
}

function openBlockEdit(kind, id) {
  const f = $('#blockForm');
  blockEdit = { kind, id };
  f.reset();
  if (kind === 'class') {
    const c = state.classes.find(x => x.id === id);
    if (!c) return;
    $('#blockDateRow').classList.add('hidden');
    $('#blockWeekRow').classList.remove('hidden');
    $('#blockClassRow').classList.remove('hidden');
    $('#blockRepeatRow').classList.add('hidden');
    f.name.value = c.name;
    f.start.value = c.start;
    f.minutes.value = String(c.minutes);
    f.location.value = c.location || '';
    f.teacher.value = c.teacher || '';
    f.weeksText.value = weeksToText(c.weeks);
    f.weekday.value = String(c.weekday);
  } else {
    const b = state.blocks.find(x => x.id === id);
    if (!b) return;
    $('#blockDateRow').classList.remove('hidden');
    $('#blockWeekRow').classList.add('hidden');
    $('#blockRepeatRow').classList.add('hidden');
    f.name.value = b.name;
    f.date.value = b.date;
    f.start.value = b.start;
    f.minutes.value = String(b.minutes);
    f.kind.value = b.kind || '自习';
  }
  $('#blockDelete').classList.remove('hidden');
  $('#blockDialog').showModal();
  f.name.focus();
}

/* ── 事件绑定 ───────────────────────── */
function bindEvents() {
  $$('.nav-btn, .bn-btn').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-goto]');
    if (g) go(g.dataset.goto);
  });

  bindSearch();
  bindTaskList($('#todayList'));
  bindTaskList($('#taskList'));

  /* 任务页 */
  $('#btnAddTask').addEventListener('click', () => openTaskDialog(null));
  $('#taskFilter').addEventListener('click', e => {
    const b = e.target.closest('button[data-f]');
    if (!b) return;
    taskFilter = b.dataset.f;
    $$('#taskFilter button').forEach(x => x.classList.toggle('active', x === b));
    renderTasks();
  });

  /* 日历 */
  $('#btnAddBlock').addEventListener('click', () => openBlockDialog());
  $('#wkPrev').addEventListener('click', () => { weekOffset -= 1; renderCalendar(); });
  $('#wkNext').addEventListener('click', () => { weekOffset += 1; renderCalendar(); });
  $('#wkToday').addEventListener('click', () => { weekOffset = 0; renderCalendar(); });
  $('#weekGrid').addEventListener('click', e => {
    const chip = e.target.closest('[data-del-item]');
    if (!chip) return;
    openBlockEdit(chip.dataset.kind === '课程' ? 'class' : 'block', chip.dataset.delItem);
  });

  /* 校历日程（考试 / 假期 / 开学） */
  $('#btnAddExam').addEventListener('click', () => {
    const name = $('#examName').value.trim();
    const date = $('#examDate').value;
    if (!name) return toast('请填写名称');
    if (!date) return toast('请选择日期');
    state.events.push({
      id: uid(), name, date,
      endDate: $('#eventEnd').value || '',
      kind: $('#eventKind').value
    });
    $('#examName').value = '';
    save();
    renderEvents();
    toast('已添加日程');
  });
  $('#examList').addEventListener('click', e => {
    const btn = e.target.closest('[data-act="event-del"]');
    if (!btn) return;
    const id = btn.closest('[data-event]').dataset.event;
    const ev = (state.events || []).find(x => x.id === id);
    if (!ev) return;
    if (!confirm(`删除日程「${ev.name}」？`)) return;
    state.events = state.events.filter(x => x.id !== id);
    save();
    renderEvents();
    toast('已删除');
  });

  /* 习惯打卡 */
  $('#btnAddHabit').addEventListener('click', () => {
    const name = $('#habitName').value.trim();
    if (!name) return toast('请填写习惯名');
    state.habits.push({ id: uid(), name, emoji: '📌' });
    $('#habitName').value = '';
    save();
    renderHabits();
    toast('已添加习惯');
  });
  $('#habitToday').addEventListener('click', e => {
    const row = e.target.closest('[data-habit]');
    if (!row || !e.target.closest('[data-act="habit-toggle"]')) return;
    const id = row.dataset.habit;
    const t = todayStr();
    const arr = state.habitLog[t] = state.habitLog[t] || [];
    if (arr.includes(id)) {
      state.habitLog[t] = arr.filter(x => x !== id);
    } else {
      arr.push(id);
      toast('打卡成功，继续保持 🔥');
    }
    save();
    renderHabits();
  });
  $('#habitManage').addEventListener('click', e => {
    const btn = e.target.closest('[data-act="habit-del"]');
    if (!btn) return;
    const id = btn.closest('[data-habit]').dataset.habit;
    const h = state.habits.find(x => x.id === id);
    if (!h) return;
    if (!confirm(`删除习惯「${h.name}」？（打卡记录会保留）`)) return;
    state.habits = state.habits.filter(x => x.id !== id);
    save();
    renderHabits();
  });

  /* 专注 */
  $('#btnStart').addEventListener('click', startPause);
  $('#btnReset').addEventListener('click', resetFocus);
  $('#focusDurs').addEventListener('click', e => {
    const b = e.target.closest('button[data-min]');
    if (!b) return;
    if (F.running) return toast('专注进行中，先暂停再调整时长');
    if (b.dataset.min === 'custom') {
      F.total = $('#focusCustom').value * 60 || F.total;
      F.left = F.total;
      updateFocusUI();
      $('#focusCustom').focus();
      return;
    }
    F.total = +b.dataset.min * 60;
    F.left = F.total;
    updateFocusUI();
  });
  $('#focusCustom').addEventListener('change', e => {
    let v = Math.round(+e.target.value || 25);
    v = Math.max(5, Math.min(180, v));
    e.target.value = v;
    if (F.running) return toast('专注进行中，先暂停再调整时长');
    F.total = v * 60;
    F.left = F.total;
    updateFocusUI();
  });
  $('#noiseToggle').addEventListener('change', e => {
    if (e.target.checked && !F.running) { e.target.checked = false; return toast('点「开始专注」后才会播放'); }
    setNoise(F.running && e.target.checked);
  });

  /* 我的空间 */
  $('#btnSaveName').addEventListener('click', () => {
    const v = $('#nameInput').value.trim();
    state.profile.name = v || '同学';
    save();
    updateChrome();
    toast('已保存');
  });
  $('#lanUrls').addEventListener('click', e => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    navigator.clipboard.writeText(b.dataset.copy)
      .then(() => toast('已复制，去手机浏览器粘贴打开'))
      .catch(() => toast('复制失败，请手动选择地址复制'));
  });
  $('#btnSaveSemester').addEventListener('click', () => {
    const v = $('#semesterStart').value;
    if (!v) return toast('请先选择第一周周一的日期');
    state.settings = state.settings || {};
    state.settings.semesterStart = v;
    save();
    toast('已保存，课表按新学期时间推算');
  });
  $('#btnExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hengxue-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('备份文件已下载');
  });
  $('#btnImport').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.tasks)) throw new Error('bad');
        state = data;
        state.profile = state.profile || { name: '符同学' };
        state.classes = state.classes || [];
        state.blocks = state.blocks || [];
        state.focusLog = state.focusLog || {};
        state.exams = state.exams || [];
        state.habits = state.habits || [];
        state.habitLog = state.habitLog || {};
        state.pomodoroCount = state.pomodoroCount || 0;
        save();
        refresh();
        toast('已导入备份');
      } catch (err) {
        toast('这个文件不是有效的衡学备份');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
  $('#btnReset').addEventListener('click', async () => {
    if (!confirm('确定重置为示例数据吗？你现在的所有记录会被清空。')) return;
    if (MODE.server) {
      try {
        state = await fetch('api/seed').then(r => r.json());
      } catch (e) {
        return toast('重置失败，请确认衡学在运行');
      }
    } else {
      state = clientSeed();
    }
    save();
    refresh();
    toast('已重置为示例数据');
  });

  /* 弹窗 */
  $('#taskCancel').addEventListener('click', () => $('#taskDialog').close());
  $('#blockCancel').addEventListener('click', () => $('#blockDialog').close());
  $('#blockDelete').addEventListener('click', () => {
    if (!blockEdit) return;
    const { kind, id } = blockEdit;
    if (!confirm('删除这个安排？')) return;
    if (kind === 'class') state.classes = state.classes.filter(x => x.id !== id);
    else state.blocks = state.blocks.filter(x => x.id !== id);
    blockEdit = null;
    $('#blockDialog').close();
    save();
    refresh();
    toast('已删除');
  });
  $('#taskForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    const title = f.title.value.trim();
    if (!title) return toast('请填写任务名称');
    const data = {
      title,
      course: f.course.value.trim() || '未分类',
      due: (f.dueDate.value || todayStr()) + 'T' + (f.dueTime.value || '23:59'),
      estimateMin: +f.estimateMin.value || 60,
      priority: f.priority.value
    };
    if (editingTaskId) {
      const t = state.tasks.find(x => x.id === editingTaskId);
      Object.assign(t, data);
      toast('已更新任务');
    } else {
      state.tasks.unshift({ id: uid(), done: false, doneAt: null, ...data });
      toast('已添加任务');
    }
    editingTaskId = null;
    $('#taskDialog').close();
    save();
    refresh();
  });
  $('#blockForm').addEventListener('change', e => {
    if (e.target.name === 'repeat' && !blockEdit) {
      $('#blockClassRow').classList.toggle('hidden', !e.target.checked);
    }
  });
  $('#blockForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    const name = f.name.value.trim();
    if (!name) return toast('请填写名称');
    const start = f.start.value || '19:00';
    const minutes = +f.minutes.value || 60;
    if (blockEdit) {
      if (blockEdit.kind === 'class') {
        const c = state.classes.find(x => x.id === blockEdit.id);
        Object.assign(c, {
          name, start, minutes,
          weekday: +f.weekday.value,
          location: f.location.value.trim(),
          teacher: f.teacher.value.trim(),
          weeks: parseWeeksText(f.weeksText.value)
        });
      } else {
        const b = state.blocks.find(x => x.id === blockEdit.id);
        Object.assign(b, { name, date: f.date.value || todayStr(), start, minutes, kind: f.kind.value });
      }
      toast('已更新安排');
    } else {
      const date = f.date.value || todayStr();
      const kind = f.kind.value;
      if (f.repeat.checked) {
        state.classes.push({
          id: uid(), name, weekday: weekdayOf(date), start, minutes,
          location: f.location.value.trim(),
          teacher: f.teacher.value.trim(),
          weeks: parseWeeksText(f.weeksText.value)
        });
        toast('已加入每周课表');
      } else {
        state.blocks.push({ id: uid(), name, date, start, minutes, kind });
        toast('已添加安排');
      }
    }
    blockEdit = null;
    $('#blockDialog').close();
    save();
    refresh();
  });

  window.addEventListener('hashchange', route);
}

/* ── 启动 ───────────────────────────── */
(async function init() {
  await loadAll();
  bindEvents();
  updateChrome();
  route();
  /* 每分钟刷新一次「NOW」标记和时间相关的展示 */
  setInterval(() => {
    updateChrome();
    if (currentView === 'overview') renderOverview();
    if (currentView === 'load') renderLoad();
  }, 60000);
})();
