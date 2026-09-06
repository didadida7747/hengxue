/* 衡学 Study Balance — 本地小服务器
 * 它只做三件事：
 *   1. 把网页发给浏览器（电脑 / 手机都算）
 *   2. 提供一个数据接口，把学习数据存进本机的 data.json
 *   3. 告诉你手机该访问哪个地址
 * 不依赖任何第三方库，Node.js 自带能力即可运行。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_FILE = path.join(ROOT, 'data.json');
const PORT_FROM = 3000;
const PORT_TO = 3020;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* 2026-2027 学年第一学期真实课表（第一周 2026-09-07 周一开始） */
const SEMESTER_START = '2026-09-07';
const PERIODS = { 1: ['08:00', 100], 3: ['10:00', 100], 5: ['14:00', 100], 7: ['16:05', 100], 9: ['19:00', 95] };
function expandWeeks(text) {
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

/* 第一次使用时的示例数据（日期随当天自动生成，保证打开就有内容可看） */
function seedState() {
  const now = new Date();
  const shift = (n) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return localDateStr(d);
  };
  const today = shift(0);
  return {
    version: 2,
    settings: { semesterStart: SEMESTER_START, timetableV2: true },
    profile: { name: '符同学' },
    tasks: [
      { id: 't1', title: '完成高等数学第三章习题', course: '高等数学', due: `${today}T23:59`, estimateMin: 90, priority: '高', done: false, doneAt: null },
      { id: 't2', title: '阅读《社会学概论》第五章', course: '社会学概论', due: `${shift(-1)}T18:00`, estimateMin: 60, priority: '中', done: false, doneAt: null },
      { id: 't3', title: '准备英语演讲稿', course: '大学英语', due: `${shift(2)}T20:00`, estimateMin: 120, priority: '低', done: false, doneAt: null },
      { id: 't4', title: '背 20 个单词', course: '大学英语', repeat: 'daily', due: '', estimateMin: 20, priority: '中', doneDates: [today] }
    ],
    classes: buildTimetable(),
    blocks: [],
    focusLog: { [today]: 150 },
    focusSessions: [
      { date: today, start: '09:30', minutes: 40, task: '深度学习' },
      { date: today, start: '14:05', minutes: 60, task: '概率论习题' },
      { date: today, start: '20:10', minutes: 50, task: '阅读' }
    ],
    events: DEFAULT_EVENTS,
    habits: [
      { id: 'h1', name: '背单词 20 个', emoji: '📚' },
      { id: 'h2', name: '晨跑 30 分钟', emoji: '🏃' },
      { id: 'h3', name: '睡前阅读 20 页', emoji: '🌙' }
    ],
    habitLog: { [today]: ['h1'] },
    pomodoroCount: 3
  };
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    /* 文件不存在 → 正常首次使用，写入示例数据；
       文件损坏 → 先把坏文件留档，绝不用示例数据静默覆盖用户数据 */
    if (fs.existsSync(DATA_FILE)) {
      const keep = `${DATA_FILE}.corrupt-${Date.now()}`;
      try { fs.renameSync(DATA_FILE, keep); console.error('  [警告] data.json 无法解析，已留档为', keep); } catch (e2) {}
      const seeded = seedState();
      writeState(seeded);
      return seeded;
    }
    const seeded = seedState();
    writeState(seeded);
    return seeded;
  }
}

function writeState(s) {
  /* 每次覆盖前留一份上一次的备份，给数据上双保险 */
  try {
    if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, DATA_FILE + '.backup');
  } catch (e) {}
  /* 临时文件名带时间戳，避免并发保存时互相覆盖 */
  const tmp = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

function lanUrls(port) {
  const urls = [];
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal &&
          /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address)) {
        urls.push(`http://${n.address}:${port}`);
      }
    }
  }
  return [...new Set(urls)];
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (p === '/api/state' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(readState()));
  }

  if (p === '/api/state' && req.method === 'PUT') {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 2e6) req.destroy();
    });
    req.on('end', () => {
      try {
        const s = JSON.parse(body);
        if (!s || typeof s !== 'object' || !Array.isArray(s.tasks)) throw new Error('bad state');
        writeState(s);
        console.log(`  [保存] 任务 ${s.tasks.length} 项 / 安排 ${s.blocks.length} 项 / 课程 ${s.classes.length} 项`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end('{"ok":false}');
      }
    });
    return;
  }

  if (p === '/api/seed' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(seedState()));
  }

  if (p === '/api/info' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ port, lan: lanUrls(port) }));
  }

  /* 静态文件 */
  let file = p === '/' ? '/index.html' : p;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(PUBLIC_DIR, file);
  if (!full.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(full, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not Found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  });
});

let port = PORT_FROM;

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && port < PORT_TO) {
    port += 1;
    server.listen(port, '0.0.0.0');
  } else {
    console.error('启动失败：', e.message);
    process.exit(1);
  }
});

server.listen(port, '0.0.0.0', () => {
  const urls = lanUrls(port);
  console.log('');
  console.log('  ============================================');
  console.log('   衡学 Study Balance 已启动');
  console.log('  --------------------------------------------');
  console.log(`   电脑访问:  http://localhost:${port}`);
  if (urls.length) {
    urls.forEach((u) => console.log(`   手机访问:  ${u}   （需与电脑连同一个 Wi-Fi）`));
  } else {
    console.log('   手机访问:  未检测到局域网地址（检查 Wi-Fi 连接）');
  }
  console.log('   使用期间请保持本窗口开启；关闭窗口即停止。');
  console.log('   数据保存在本目录的 data.json 文件里。');
  console.log('  ============================================');
  console.log('');
  if (process.env.HENGXUE_NO_OPEN !== '1' && process.platform === 'win32') {
    exec(`start "" http://localhost:${port}`);
  }
});
