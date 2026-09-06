/* 衡学 Study Balance — 页面逻辑
 * 数据全部来自本地服务器（data.json），改动后自动保存。
 */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const VIEWS = ['overview', 'tasks', 'calendar', 'load', 'focus', 'me'];
const PALETTE = ['#F0B429', '#E4573D', '#4E7DD1', '#3E7C4F', '#8E6FC1', '#D977A2'];
const RING_C = 728.8; /* 2πr, r=116 */

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
    version: 1,
    profile: { name: '符同学' },
    tasks: [
      { id: 't1', title: '完成高等数学第三章习题', course: '高等数学', due: `${todayStr(0)}T23:59`, estimateMin: 90, priority: '高', done: false, doneAt: null },
      { id: 't2', title: '阅读《社会学概论》第五章', course: '社会学概论', due: `${todayStr(-1)}T18:00`, estimateMin: 60, priority: '中', done: false, doneAt: null },
      { id: 't3', title: '准备英语演讲稿', course: '大学英语', due: `${todayStr(2)}T20:00`, estimateMin: 120, priority: '低', done: false, doneAt: null }
    ],
    classes: [
      { id: 'c1', name: '数据结构', weekday: 3, start: '14:00', minutes: 100, location: '教三 204' },
      { id: 'c2', name: '高等数学', weekday: 1, start: '08:00', minutes: 100, location: '教一 101' },
      { id: 'c3', name: '大学英语', weekday: 5, start: '10:00', minutes: 90, location: '外语楼 302' }
    ],
    blocks: [
      { id: 'b1', name: '深度学习时间', date: todayStr(0), start: '09:30', minutes: 45, kind: '自习' },
      { id: 'b2', name: '整理今日复盘', date: todayStr(0), start: '20:00', minutes: 30, kind: '复盘' }
    ],
    focusLog: { [todayStr(0)]: 150 }
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
  const cls = state.classes.filter(c => weekdayOf(ds) === c.weekday)
    .map(c => ({ ...c, date: ds, kind: '课程' }));
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
  let list = state.tasks.slice().sort((a, b) =>
    ((a.done ? 1 : 0) - (b.done ? 1 : 0)) || (a.due || '').localeCompare(b.due || ''));
  if (taskFilter === 'open') list = list.filter(x => !x.done);
  if (taskFilter === 'done') list = list.filter(x => x.done);
  $('#taskList').innerHTML = list.length
    ? list.map(taskRowHTML).join('')
    : '<p class="hint">这里空空的。点右上角「＋ 新建任务」开始规划。</p>';
}

function renderCalendar() {
  const base = addDays(mondayOf(todayStr()), weekOffset * 7);
  $('#wkLabel').textContent = `${fmtDateLabel(base)} – ${fmtDateLabel(addDays(base, 6))}`;
  const grid = $('#weekGrid');
  grid.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const ds = addDays(base, i);
    const col = document.createElement('div');
    col.className = 'day-col' + (ds === todayStr() ? ' today' : '');
    const chips = itemsOn(ds).map(it => `
      <button class="chip chip-${esc(it.kind || '其他')}" data-del-item="${it.id}" data-kind="${esc(it.kind || '')}" data-name="${esc(it.name)}">
        <span class="chip-time">${it.start}–${fmtClock(toMin(it.start) + it.minutes)}</span>
        <b>${esc(it.name)}</b>
        ${it.location ? `<span>${esc(it.location)}</span>` : ''}
      </button>`).join('');
    col.innerHTML = `<div class="day-head"><b>${fmtDateLabel(ds)}</b><span>周${cnWeek(weekdayOf(ds))}</span></div>${chips || '<div class="day-empty">—</div>'}`;
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

function renderFocus() {
  const sel = $('#focusTask');
  const cur = sel.value;
  sel.innerHTML = '<option value="">随便专注一下（不关联任务）</option>' +
    state.tasks.filter(t => !t.done).map(t => `<option value="${t.id}">${esc(t.title)}</option>`).join('');
  if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
  updateFocusUI();
}

function updateFocusUI() {
  $('#focusTime').textContent =
    String(Math.floor(F.left / 60)).padStart(2, '0') + ':' + String(F.left % 60).padStart(2, '0');
  $('#ringFill').style.strokeDashoffset = RING_C * (1 - F.left / F.total);
  $('#focusState').textContent = F.running ? '专注中…' : F.left === F.total ? '准备开始' : '已暂停';
  $('#btnStart').textContent = F.running ? '暂停' : F.left === F.total ? '开始专注' : '继续';
  $$('#focusDurs button').forEach(b =>
    b.classList.toggle('active', +b.dataset.min * 60 === F.total));
}

function startPause() {
  if (F.running) {
    clearInterval(F.timer);
    F.running = false;
  } else {
    F.running = true;
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
  if (natural) {
    recordFocus(Math.max(1, Math.round(F.total / 60)));
    beep();
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
  else if (v === 'calendar') renderCalendar();
  else if (v === 'load') renderLoad();
  else if (v === 'focus') renderFocus();
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
  $('#btnAddBlock').addEventListener('click', () => {
    const f = $('#blockForm');
    f.reset();
    f.date.value = todayStr();
    $('#blockDialog').showModal();
  });
  $('#wkPrev').addEventListener('click', () => { weekOffset -= 1; renderCalendar(); });
  $('#wkNext').addEventListener('click', () => { weekOffset += 1; renderCalendar(); });
  $('#wkToday').addEventListener('click', () => { weekOffset = 0; renderCalendar(); });
  $('#weekGrid').addEventListener('click', e => {
    const chip = e.target.closest('[data-del-item]');
    if (!chip) return;
    const id = chip.dataset.delItem;
    const kind = chip.dataset.kind;
    const name = chip.dataset.name;
    if (!confirm(`删除安排「${name}」？${kind === '课程' ? '\n（这是每周课表的一项，删了每周都没了）' : ''}`)) return;
    if (kind === '课程') state.classes = state.classes.filter(c => c.id !== id);
    else state.blocks = state.blocks.filter(b => b.id !== id);
    save();
    refresh();
    toast('已删除');
  });

  /* 专注 */
  $('#btnStart').addEventListener('click', startPause);
  $('#btnReset').addEventListener('click', resetFocus);
  $('#focusDurs').addEventListener('click', e => {
    const b = e.target.closest('button[data-min]');
    if (!b) return;
    if (F.running) return toast('专注进行中，先暂停再调整时长');
    F.total = +b.dataset.min * 60;
    F.left = F.total;
    updateFocusUI();
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
        state.profile = state.profile || { name: '同学' };
        state.classes = state.classes || [];
        state.blocks = state.blocks || [];
        state.focusLog = state.focusLog || {};
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
  $('#blockForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    const name = f.name.value.trim();
    if (!name) return toast('请填写名称');
    const date = f.date.value || todayStr();
    const start = f.start.value || '19:00';
    const minutes = +f.minutes.value || 60;
    const kind = f.kind.value;
    if (f.repeat.checked) {
      state.classes.push({ id: uid(), name, weekday: weekdayOf(date), start, minutes, location: '' });
      toast('已加入每周课表');
    } else {
      state.blocks.push({ id: uid(), name, date, start, minutes, kind });
      toast('已添加安排');
    }
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
