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
    version: 1,
    profile: { name: '符同学' },
    tasks: [
      { id: 't1', title: '完成高等数学第三章习题', course: '高等数学', due: `${today}T23:59`, estimateMin: 90, priority: '高', done: false, doneAt: null },
      { id: 't2', title: '阅读《社会学概论》第五章', course: '社会学概论', due: `${shift(-1)}T18:00`, estimateMin: 60, priority: '中', done: false, doneAt: null },
      { id: 't3', title: '准备英语演讲稿', course: '大学英语', due: `${shift(2)}T20:00`, estimateMin: 120, priority: '低', done: false, doneAt: null }
    ],
    classes: [
      { id: 'c1', name: '数据结构', weekday: 3, start: '14:00', minutes: 100, location: '教三 204' },
      { id: 'c2', name: '高等数学', weekday: 1, start: '08:00', minutes: 100, location: '教一 101' },
      { id: 'c3', name: '大学英语', weekday: 5, start: '10:00', minutes: 90, location: '外语楼 302' }
    ],
    blocks: [
      { id: 'b1', name: '深度学习时间', date: today, start: '09:30', minutes: 45, kind: '自习' },
      { id: 'b2', name: '整理今日复盘', date: today, start: '20:00', minutes: 30, kind: '复盘' }
    ],
    focusLog: { [today]: 150 }
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
