'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'events.jsonl');
const MAX_BODY = 256 * 1024;
const MAX_EVENTS_READ = 50000;
const MAX_BATCH = 100;
const AUTH_TOKEN = String(process.env.TELEMETRY_TOKEN || '').trim();
const DASH_USER = String(process.env.DASH_USER || '').trim();
const DASH_PASS = String(process.env.DASH_PASS || '');
const SSL_KEY = process.env.SSL_KEY;
const SSL_CERT = process.env.SSL_CERT;

function isLocalBindHost(host) {
  const h = String(host || '').toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]';
}
if (!isLocalBindHost(HOST) && !AUTH_TOKEN) {
  console.error('[telemetry-server] refusing to start on non-local HOST without TELEMETRY_TOKEN');
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });

const rate = new Map();
function allowReq(req) {
  const ip = (req.socket && req.socket.remoteAddress) || 'unknown';
  const now = Date.now();
  const bucket = rate.get(ip) || { ts: now, count: 0 };
  if (now - bucket.ts > 60000) { bucket.ts = now; bucket.count = 0; }
  bucket.count++;
  rate.set(ip, bucket);
  if (rate.size > 5000) rate.clear();
  return bucket.count <= 240;
}

function truncateVal(v, max) {
  if (typeof v === 'string') return v.length > max ? v.slice(0, max) : v;
  return v;
}

function sanitizeEvent(ev) {
  const src = (ev && typeof ev === 'object' && !Array.isArray(ev)) ? ev : {};
  const out = {};
  const allow = ['event','type','kind','installId','sessionId','version','platform','arch','locale','electron','node','ts','reason','message','stack','firstRun','exitCode'];
  for (const k of allow) {
    if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
    let v = src[k];
    if (k === 'message') v = truncateVal(String(v || ''), 2000);
    else if (k === 'stack') v = truncateVal(String(v || ''), 8000);
    else if (typeof v === 'string') v = truncateVal(v, 500);
    else if (typeof v === 'number') v = Number.isFinite(v) ? v : 0;
    else if (typeof v === 'boolean') v = !!v;
    else continue;
    out[k] = v;
  }
  return out;
}

function readEvents() {
  if (!fs.existsSync(DATA_FILE)) return [];
  let text = '';
  try { text = fs.readFileSync(DATA_FILE, 'utf8'); } catch (_) { return []; }
  const lines = text.split(/\r?\n/).filter(Boolean);
  const slice = lines.length > MAX_EVENTS_READ ? lines.slice(-MAX_EVENTS_READ) : lines;
  const out = [];
  for (const line of slice) {
    try { out.push(JSON.parse(line)); } catch (_) {}
  }
  return out;
}

function appendEvent(ev) {
  const rec = Object.assign({ receivedAt: Date.now() }, sanitizeEvent(ev));
  try {
    try {
      const st = fs.statSync(DATA_FILE);
      if (st.size > 10 * 1024 * 1024) {
        const lines = fs.readFileSync(DATA_FILE, 'utf8').split(/\r?\n/).filter(Boolean);
        const keep = lines.slice(-20000);
        fs.writeFileSync(DATA_FILE, keep.join('\n') + '\n', 'utf8');
      }
    } catch (_) {}
    fs.appendFileSync(DATA_FILE, JSON.stringify(rec) + '\n', 'utf8');
  } catch (_) {}
  return rec;
}

function isErrorEvent(e) {
  const event = String(e.event || e.type || '');
  return event === 'uncaughtException' || event === 'unhandledRejection' || event === 'render-process-gone' || event === 'child-process-gone' || e.kind === 'error';
}

function inRange(ts, from, to) {
  return (!from || ts >= from) && (!to || ts <= to);
}

function summarize(events, opts = {}) {
  const now = Date.now();
  const range = String(opts.range || 'all');
  let from = 0;
  if (range === '24h') from = now - 24 * 60 * 60 * 1000;
  else if (range === '7d') from = now - 7 * 24 * 60 * 60 * 1000;
  else if (range === '30d') from = now - 30 * 24 * 60 * 60 * 1000;
  const q = String(opts.q || '').toLowerCase().trim();

  const filtered = events.filter((e) => {
    const ts = Number(e.ts || e.receivedAt || 0);
    if (!inRange(ts, from, now)) return false;
    if (q) {
      const blob = [e.event, e.type, e.installId, e.sessionId, e.version, e.platform, e.message, e.stack].join(' ').toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  const installs = new Set();
  const active24h = new Set();
  const active7d = new Set();
  const installLastSeen = new Map();
  const byEvent = new Map();
  let launches = 0;
  let firstRuns = 0;
  let heartbeats = 0;
  let crashes = 0;
  const errors = [];
  const errorGroups = new Map();
  const byDay = new Map();
  const byHour = new Map();
  const versions = new Map();
  const platforms = new Map();

  for (const e of filtered) {
    const ts = Number(e.ts || e.receivedAt || 0);
    const id = e.installId ? String(e.installId) : '';
    const event = String(e.event || e.type || 'unknown');
    byEvent.set(event, (byEvent.get(event) || 0) + 1);
    if (id) {
      installs.add(id);
      installLastSeen.set(id, Math.max(installLastSeen.get(id) || 0, ts));
      if (ts >= now - 24 * 60 * 60 * 1000) active24h.add(id);
      if (ts >= now - 7 * 24 * 60 * 60 * 1000) active7d.add(id);
    }
    if (event === 'app_start' || event === 'session_start' || event === 'launch') launches++;
    if (event === 'first_run') firstRuns++;
    if (event === 'heartbeat') heartbeats++;
    if (isErrorEvent(e)) {
      crashes++;
      const msg = String(e.message || 'unknown');
      const key = event + '|' + msg.slice(0, 120);
      const g = errorGroups.get(key) || { event, message: msg, count: 0, lastTs: 0, version: e.version || '', platform: e.platform || '', stack: e.stack || '' };
      g.count += 1;
      if (ts >= g.lastTs) { g.lastTs = ts; g.version = e.version || g.version; g.platform = e.platform || g.platform; g.stack = e.stack || g.stack; }
      errorGroups.set(key, g);
      errors.push({ ts, event, installId: id, sessionId: e.sessionId || '', version: e.version || '', platform: e.platform || '', message: msg, stack: e.stack || '' });
    }
    const day = ts ? new Date(ts).toISOString().slice(0, 10) : 'unknown';
    const hour = ts ? new Date(ts).toISOString().slice(0, 13) + ':00' : 'unknown';
    byDay.set(day, (byDay.get(day) || 0) + 1);
    byHour.set(hour, (byHour.get(hour) || 0) + 1);
    if (e.version) versions.set(String(e.version), (versions.get(String(e.version)) || 0) + 1);
    if (e.platform) platforms.set(String(e.platform), (platforms.get(String(e.platform)) || 0) + 1);
  }

  errors.sort((a, b) => b.ts - a.ts);
  const groupedErrors = Array.from(errorGroups.values()).sort((a, b) => b.count - a.count || b.lastTs - a.lastTs).slice(0, 50);
  const recentErrors = errors.slice(0, 100);
  const recentEvents = filtered.slice(-120).reverse().map(e => ({
    ts: Number(e.ts || e.receivedAt || 0),
    event: String(e.event || e.type || 'unknown'),
    installId: e.installId ? String(e.installId) : '',
    sessionId: e.sessionId ? String(e.sessionId) : '',
    version: e.version || '',
    platform: e.platform || '',
    kind: e.kind || ''
  }));
  const days = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-30);
  const hours = Array.from(byHour.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-24 * 7);
  const topInstalls = Array.from(installLastSeen.entries())
    .map(([id, lastTs]) => ({ installId: id, lastTs, recent: lastTs >= now - 24 * 60 * 60 * 1000 }))
    .sort((a, b) => b.lastTs - a.lastTs)
    .slice(0, 50);

  // alert: error spike in last hour vs previous 23h avg/hour
  const last1h = now - 60 * 60 * 1000;
  const last24hStart = now - 24 * 60 * 60 * 1000;
  let errorsLast1h = 0, errorsPrev23h = 0;
  for (const e of events) {
    if (!isErrorEvent(e)) continue;
    const ts = Number(e.ts || e.receivedAt || 0);
    if (ts >= last1h) errorsLast1h++;
    else if (ts >= last24hStart && ts < last1h) errorsPrev23h++;
  }
  const prevAvg = errorsPrev23h / 23;
  const spike = errorsLast1h >= 5 && (errorsPrev23h === 0 ? errorsLast1h >= 5 : errorsLast1h >= Math.max(5, prevAvg * 3));

  return {
    range, generatedAt: now,
    totals: { events: filtered.length, allEvents: events.length, uniqueInstalls: installs.size, active24h: active24h.size, active7d: active7d.size, launches, firstRuns, heartbeats, crashes },
    alerts: spike ? [{ type: 'error_spike', level: 'warning', message: `ارتفاع في الأخطاء: ${errorsLast1h} خلال آخر ساعة (متوسط سابق ~${prevAvg.toFixed(1)}/ساعة)`, errorsLast1h, prevAvg: Number(prevAvg.toFixed(2)) }] : [],
    byEvent: Array.from(byEvent.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20),
    versions: Array.from(versions.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10),
    platforms: Array.from(platforms.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10),
    days, hours, groupedErrors, recentErrors, recentEvents, topInstalls
  };
}

function installDetails(events, installId) {
  const id = String(installId || '');
  const evs = events.filter(e => String(e.installId || '') === id).sort((a,b)=>Number(a.ts||a.receivedAt||0)-Number(b.ts||b.receivedAt||0));
  const sessions = new Map();
  for (const e of evs) {
    const sid = String(e.sessionId || 'unknown');
    if (!sessions.has(sid)) sessions.set(sid, []);
    sessions.get(sid).push(e);
  }
  return {
    installId: id,
    totals: { events: evs.length, errors: evs.filter(isErrorEvent).length },
    firstSeen: evs.length ? Number(evs[0].ts||evs[0].receivedAt||0) : 0,
    lastSeen: evs.length ? Number(evs[evs.length-1].ts||evs[evs.length-1].receivedAt||0) : 0,
    sessions: Array.from(sessions.entries()).map(([sid, items]) => ({ sessionId: sid, count: items.length, firstTs: Number(items[0].ts||items[0].receivedAt||0), lastTs: Number(items[items.length-1].ts||items[items.length-1].receivedAt||0) })),
    events: evs.slice(-300).reverse()
  };
}

function toCsv(rows, cols) {
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ba, bb); } catch (_) { return false; }
}

function corsHeaders(protectedRoute) {
  // No wildcard CORS on protected dashboard/API endpoints
  if (protectedRoute) return { 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Telemetry-Token', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Telemetry-Token', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
}

function send(res, code, body, headers, protectedRoute) {
  res.writeHead(code, Object.assign(corsHeaders(!!protectedRoute), headers || {}));
  res.end(body);
}
function sendJson(res, code, obj, protectedRoute) { send(res, code, JSON.stringify(obj, null, 2), { 'Content-Type': 'application/json; charset=utf-8' }, protectedRoute); }

function unauthorized(res, protectedRoute) {
  res.writeHead(401, Object.assign({ 'WWW-Authenticate': 'Basic realm="GomizPlayer IPTV Telemetry"', 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders(!!protectedRoute)));
  res.end(JSON.stringify({ error: 'unauthorized' }));
}

function checkAuth(req) {
  if (!AUTH_TOKEN && !DASH_USER) return true;
  const auth = String(req.headers.authorization || '');
  if (AUTH_TOKEN) {
    if (auth.startsWith('Bearer ')) {
      if (safeEqual(auth.slice(7), AUTH_TOKEN)) return true;
    }
    const hdr = String(req.headers['x-telemetry-token'] || '');
    if (hdr && safeEqual(hdr, AUTH_TOKEN)) return true;
  }
  if (DASH_USER) {
    if (auth.startsWith('Basic ')) {
      const raw = Buffer.from(auth.slice(6), 'base64').toString('utf8');
      const idx = raw.indexOf(':');
      const u = idx >= 0 ? raw.slice(0, idx) : raw;
      const p = idx >= 0 ? raw.slice(idx + 1) : '';
      if (safeEqual(u, DASH_USER) && safeEqual(p, DASH_PASS)) return true;
    }
  }
  return false;
}

function htmlPage() {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GomizPlayer IPTV Telemetry Dashboard</title>
<style>
:root{--bg:#0b1020;--card:#141b2d;--line:#22304a;--text:#e8ecf3;--muted:#9aa7bd;--accent:#5b8cff;--ok:#34d399;--warn:#f59e0b;--bad:#f87171}
*{box-sizing:border-box} body{font-family:system-ui,Segoe UI,Arial,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:18px}
h1{margin:0 0 4px;font-size:24px} h2{margin:0 0 10px;font-size:16px} h3{margin:0 0 8px;font-size:14px} .muted{color:var(--muted)}
.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:14px 0}
select,input,button,a.btn{background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:inherit;text-decoration:none}
button,.btn{cursor:pointer} button.primary{background:#1d2b45;border-color:#35507a}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:10px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px}
.k{font-size:12px;color:var(--muted)} .v{font-size:24px;font-weight:700;margin-top:4px}
.section{margin-top:18px} .cols{display:grid;grid-template-columns:1.2fr 1fr;gap:12px}
table{width:100%;border-collapse:collapse;font-size:12.5px} th,td{border-bottom:1px solid var(--line);padding:7px 6px;vertical-align:top;text-align:right}
th{color:var(--muted);font-weight:600;position:sticky;top:0;background:var(--card)}
.wrap{overflow:auto;max-height:420px;border:1px solid var(--line);border-radius:10px}
pre{white-space:pre-wrap;max-height:110px;overflow:auto;background:#0b1020;padding:6px;border-radius:8px;margin:6px 0 0;color:#c9d4e5}
.msg{font-weight:600} .pill{display:inline-block;padding:2px 8px;border-radius:999px;background:#1d2b45;color:#cfe0ff;font-size:11px}
.bar{height:10px;background:#1a2438;border-radius:999px;overflow:hidden} .bar > i{display:block;height:100%;background:linear-gradient(90deg,#4f7cff,#6ee7b7)}
.list{display:flex;flex-direction:column;gap:8px} .item{display:grid;grid-template-columns:140px 1fr 50px;gap:8px;align-items:center;font-size:12px}
.small{font-size:12px} .alert{background:#3a1d1d;border:1px solid #7f2d2d;color:#fecaca;padding:10px 12px;border-radius:10px;margin:10px 0}
.heat{display:grid;grid-template-columns:repeat(24,1fr);gap:3px} .cell{height:14px;border-radius:3px;background:#1a2438} .legend{display:flex;gap:6px;align-items:center;margin-top:6px}
.pager{display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap}
.click{color:#8ab4ff;cursor:pointer;text-decoration:underline}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;padding:20px;z-index:50}
.modal.on{display:flex} .modal .box{background:var(--card);border:1px solid var(--line);border-radius:12px;max-width:1100px;width:100%;max-height:85vh;overflow:auto;padding:14px}
@media (max-width:900px){.cols{grid-template-columns:1fr}.item{grid-template-columns:110px 1fr 40px}}
</style></head><body>
<h1>GomizPlayer IPTV — لوحة القياس والتقارير</h1>
<div class="muted">تحليلات، أعطال، تنبيهات، وتفاصيل لكل تثبيت/جلسة (محلي).</div>
<div id="alerts"></div>
<div class="toolbar">
  <label>النطاق <select id="range"><option value="24h">24 ساعة</option><option value="7d" selected>7 أيام</option><option value="30d">30 يوماً</option><option value="all">الكل</option></select></label>
  <label>تحديث تلقائي <select id="refresh"><option value="0">إيقاف</option><option value="10000">10 ث</option><option value="30000" selected>30 ث</option><option value="60000">60 ث</option></select></label>
  <input id="q" placeholder="بحث (installId، رسالة، حدث...)" style="min-width:240px;flex:1">
  <button id="reload" class="primary">تحديث</button>
  <button id="savePrefs">حفظ الفلاتر</button>
  <button id="exportJson">تصدير JSON</button>
  <a id="exportErrCsv" class="btn" href="#">CSV أخطاء</a>
  <a id="exportEvCsv" class="btn" href="#">CSV أحداث</a>
  <a id="reportLink" class="btn" href="#" target="_blank">تقرير دوري</a>
  <span id="status" class="muted small"></span>
</div>
<div class="grid" id="cards"></div>
<div class="cols section">
  <div class="card"><h2>الأحداث حسب اليوم</h2><div id="days" class="list"></div></div>
  <div class="card"><h2>توزيع الأحداث / الإصدارات / المنصات</h2><div id="breakdown" class="list"></div></div>
</div>
<div class="section card"><h2>خريطة النشاط الساعي (آخر بيانات النطاق)</h2><div id="heat" class="heat"></div><div class="legend small muted"><span>أقل</span><span class="cell" style="background:#1a2438;width:14px"></span><span class="cell" style="background:#27406e;width:14px"></span><span class="cell" style="background:#3b6bd6;width:14px"></span><span class="cell" style="background:#6ee7b7;width:14px"></span><span>أكثر</span></div></div>
<div class="cols section">
  <div class="card"><h2>أكثر الأخطاء تكراراً</h2><div class="wrap"><table><thead><tr><th>العدد</th><th>آخر ظهور</th><th>الحدث</th><th>الإصدار/المنصة</th><th>الرسالة</th></tr></thead><tbody id="groupedErrors"></tbody></table></div></div>
  <div class="card"><h2>آخر التثبيتات النشطة (اضغط للتفاصيل)</h2><div class="wrap"><table><thead><tr><th>Install ID</th><th>آخر ظهور</th><th>الحالة</th></tr></thead><tbody id="installs"></tbody></table></div></div>
</div>
<div class="section card"><h2>الأخطاء الأخيرة (تفصيلي)</h2><div class="wrap"><table><thead><tr><th>الوقت</th><th>الحدث</th><th>Install ID</th><th>الإصدار</th><th>المنصة</th><th>التفاصيل</th></tr></thead><tbody id="errors"></tbody></table></div><div class="pager"><button id="errPrev">السابق</button><span id="errPage" class="small muted"></span><button id="errNext">التالي</button></div></div>
<div class="section card"><h2>آخر الأحداث</h2><div class="wrap"><table><thead><tr><th>الوقت</th><th>الحدث</th><th>Install ID</th><th>Session</th><th>الإصدار</th><th>المنصة</th></tr></thead><tbody id="events"></tbody></table></div><div class="pager"><button id="evPrev">السابق</button><span id="evPage" class="small muted"></span><button id="evNext">التالي</button></div></div>
<div class="section muted small">نقطة الاستقبال: <code>POST /ingest</code>. اضبط "عنوان خدمة الإحصاءات" في GomizPlayer IPTV إلى <code id="ingestUrl"></code>. للنشر الآمن فعّل <code>TELEMETRY_TOKEN</code> أو <code>DASH_USER/DASH_PASS</code> وHTTPS عبر <code>SSL_KEY/SSL_CERT</code>.</div>
<div id="modal" class="modal"><div class="box"><div class="row" style="justify-content:space-between"><h2 id="mTitle">تفاصيل التثبيت</h2><button id="mClose">إغلاق</button></div><div id="mBody" class="small"></div></div></div>
<script>
let lastSummary=null,timer=null,errPage=0,evPage=0; const PAGE=20; const $=id=>document.getElementById(id);
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function fmt(ts){return ts?new Date(ts).toLocaleString():'—'}
function short(id){id=String(id||'');return id.length>14?id.slice(0,8)+'…'+id.slice(-4):(id||'—')}
function match(q,obj){if(!q)return true; q=q.toLowerCase(); return JSON.stringify(obj).toLowerCase().includes(q)}
function barList(rows,max){max=max||1;return rows.map(r=>'<div class="item"><div>'+esc(r[0])+'</div><div class="bar"><i style="width:'+Math.max(2,Math.round((r[1]/max)*100))+'%"></i></div><div>'+esc(r[1])+'</div></div>').join('')||'<div class="muted">لا توجد بيانات</div>'}
function slicePage(arr,p){const total=Math.max(1,Math.ceil(arr.length/PAGE)); p=Math.min(Math.max(0,p),total-1); return {items:arr.slice(p*PAGE,p*PAGE+PAGE),page:p,total}}
async function load(){
  const range=$('range').value; const q=$('q').value.trim(); $('status').textContent='...';
  try{
    const res=await fetch('/api/summary?range='+encodeURIComponent(range)+'&q='+encodeURIComponent(q),{cache:'no-store'});
    if(res.status===401){$('status').textContent='غير مصرح - أدخل بيانات الدخول'; return}
    const s=await res.json(); lastSummary=s; errPage=0; evPage=0; render(s);
    $('status').textContent='آخر تحديث: '+new Date(s.generatedAt).toLocaleTimeString();
  }catch(e){$('status').textContent='تعذر التحميل';}
}
function render(s){
  const t=s.totals||{}; const q=$('q').value.trim();
  $('alerts').innerHTML=(s.alerts||[]).map(a=>'<div class="alert">تنبيه: '+esc(a.message)+'</div>').join('');
  const cards=[['إجمالي الأحداث',t.events],['تثبيتات فريدة',t.uniqueInstalls],['نشط 24 ساعة',t.active24h],['نشط 7 أيام',t.active7d],['مرات التشغيل',t.launches],['أول تشغيل',t.firstRuns],['نبضات النشاط',t.heartbeats],['أخطاء/أعطال',t.crashes]];
  $('cards').innerHTML=cards.map(c=>'<div class="card"><div class="k">'+esc(c[0])+'</div><div class="v">'+esc(c[1]??0)+'</div></div>').join('');
  const days=s.days||[]; $('days').innerHTML=barList(days,Math.max(1,...days.map(d=>d[1])));
  const mix=[...(s.byEvent||[]).slice(0,6),...(s.versions||[]).slice(0,4).map(x=>['v:'+x[0],x[1]]),...(s.platforms||[]).slice(0,4).map(x=>['p:'+x[0],x[1]])];
  $('breakdown').innerHTML=barList(mix,Math.max(1,...mix.map(x=>x[1])));
  const hrs=(s.hours||[]).slice(-168); const hmax=Math.max(1,...hrs.map(h=>h[1]));
  $('heat').innerHTML=hrs.map(h=>{const r=h[1]/hmax; const c=r===0?'#1a2438':r<.25?'#27406e':r<.6?'#3b6bd6':'#6ee7b7'; return '<div class="cell" title="'+esc(h[0]+' : '+h[1])+'" style="background:'+c+'"></div>'}).join('')||'<div class="muted">لا توجد بيانات</div>';
  $('groupedErrors').innerHTML=(s.groupedErrors||[]).map(e=>'<tr><td><span class="pill">'+esc(e.count)+'</span></td><td>'+esc(fmt(e.lastTs))+'</td><td>'+esc(e.event)+'</td><td>'+esc((e.version||'')+' / '+(e.platform||''))+'</td><td><div class="msg">'+esc(e.message)+'</div></td></tr>').join('')||'<tr><td colspan="5" class="muted">لا توجد أخطاء</td></tr>';
  $('installs').innerHTML=(s.topInstalls||[]).map(i=>'<tr><td><span class="click" data-id="'+esc(i.installId)+'" title="'+esc(i.installId)+'">'+esc(short(i.installId))+'</span></td><td>'+esc(fmt(i.lastTs))+'</td><td>'+(i.recent?'<span class="pill">نشط</span>':'<span class="muted">قديم</span>')+'</td></tr>').join('')||'<tr><td colspan="3" class="muted">لا توجد بيانات</td></tr>';
  renderPaged('errors', (s.recentErrors||[]), errPage, (arr,p)=>{const pg=slicePage(arr,p); errPage=pg.page; $('errPage').textContent=(pg.page+1)+' / '+pg.total; $('errors').innerHTML=pg.items.map(e=>'<tr><td>'+esc(fmt(e.ts))+'</td><td>'+esc(e.event)+'</td><td><span class="click" data-id="'+esc(e.installId)+'">'+esc(short(e.installId))+'</span></td><td>'+esc(e.version)+'</td><td>'+esc(e.platform)+'</td><td><div class="msg">'+esc(e.message)+'</div><pre>'+esc((e.stack||'').slice(0,1200))+'</pre></td></tr>').join('')||'<tr><td colspan="6" class="muted">لا توجد أخطاء</td></tr>';});
  renderPaged('events', (s.recentEvents||[]), evPage, (arr,p)=>{const pg=slicePage(arr,p); evPage=pg.page; $('evPage').textContent=(pg.page+1)+' / '+pg.total; $('events').innerHTML=pg.items.map(e=>'<tr><td>'+esc(fmt(e.ts))+'</td><td>'+esc(e.event)+'</td><td><span class="click" data-id="'+esc(e.installId)+'">'+esc(short(e.installId))+'</span></td><td title="'+esc(e.sessionId)+'">'+esc(short(e.sessionId))+'</td><td>'+esc(e.version)+'</td><td>'+esc(e.platform)+'</td></tr>').join('')||'<tr><td colspan="6" class="muted">لا توجد أحداث</td></tr>';});
  document.querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>openInstall(el.getAttribute('data-id')));
}
function renderPaged(key,arr,p,fn){fn(arr,p)}
async function openInstall(id){ if(!id) return; $('modal').classList.add('on'); $('mTitle').textContent='تفاصيل التثبيت: '+short(id); $('mBody').innerHTML='...';
  try{ const r=await fetch('/api/install?id='+encodeURIComponent(id)); const d=await r.json();
    const sess=(d.sessions||[]).map(s=>'<tr><td>'+esc(short(s.sessionId))+'</td><td>'+esc(s.count)+'</td><td>'+esc(fmt(s.firstTs))+'</td><td>'+esc(fmt(s.lastTs))+'</td></tr>').join('')||'<tr><td colspan="4">—</td></tr>';
    const evs=(d.events||[]).slice(0,120).map(e=>'<tr><td>'+esc(fmt(e.ts||e.receivedAt))+'</td><td>'+esc(e.event||e.type)+'</td><td>'+esc(short(e.sessionId))+'</td><td>'+esc(e.version||'')+'</td><td><div class="msg">'+esc(e.message||'')+'</div>'+(e.stack?'<pre>'+esc(String(e.stack).slice(0,800))+'</pre>':'')+'</td></tr>').join('');
    $('mBody').innerHTML='<div class="grid"><div class="card"><div class="k">الأحداث</div><div class="v">'+esc(d.totals?.events||0)+'</div></div><div class="card"><div class="k">الأخطاء</div><div class="v">'+esc(d.totals?.errors||0)+'</div></div><div class="card"><div class="k">أول ظهور</div><div class="v" style="font-size:14px">'+esc(fmt(d.firstSeen))+'</div></div><div class="card"><div class="k">آخر ظهور</div><div class="v" style="font-size:14px">'+esc(fmt(d.lastSeen))+'</div></div></div><h3>الجلسات</h3><div class="wrap"><table><thead><tr><th>Session</th><th>عدد</th><th>أول</th><th>آخر</th></tr></thead><tbody>'+sess+'</tbody></table></div><h3 style="margin-top:10px">الأحداث (الأحدث أولاً)</h3><div class="wrap"><table><thead><tr><th>الوقت</th><th>الحدث</th><th>Session</th><th>الإصدار</th><th>تفاصيل</th></tr></thead><tbody>'+evs+'</tbody></table></div>';
  }catch(e){$('mBody').textContent='تعذر تحميل التفاصيل';}
}
function setTimer(){if(timer)clearInterval(timer); const ms=Number($('refresh').value||0); if(ms>0) timer=setInterval(load,ms)}
function savePrefs(){const p={range:$('range').value,refresh:$('refresh').value,q:$('q').value}; localStorage.setItem('np_tel_prefs',JSON.stringify(p)); $('status').textContent='تم حفظ الفلاتر'}
function loadPrefs(){try{const p=JSON.parse(localStorage.getItem('np_tel_prefs')||'null'); if(!p)return; if(p.range)$('range').value=p.range; if(p.refresh)$('refresh').value=p.refresh; if(p.q!=null)$('q').value=p.q;}catch(_){}} 
function setLinks(){const r=$('range').value; $('exportErrCsv').href='/api/export/errors.csv?range='+encodeURIComponent(r); $('exportEvCsv').href='/api/export/events.csv?range='+encodeURIComponent(r); $('reportLink').href='/api/report?range='+encodeURIComponent(r)}
$('reload').onclick=load; $('range').onchange=()=>{setLinks();load()}; $('refresh').onchange=setTimer; $('q').oninput=()=>{if(lastSummary)render(lastSummary)}; $('savePrefs').onclick=savePrefs;
$('exportJson').onclick=()=>{if(!lastSummary)return; const b=new Blob([JSON.stringify(lastSummary,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='gomizplayer-telemetry-summary.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
$('errPrev').onclick=()=>{errPage--; if(lastSummary)render(lastSummary)}; $('errNext').onclick=()=>{errPage++; if(lastSummary)render(lastSummary)};
$('evPrev').onclick=()=>{evPage--; if(lastSummary)render(lastSummary)}; $('evNext').onclick=()=>{evPage++; if(lastSummary)render(lastSummary)};
$('mClose').onclick=()=>{$('modal').classList.remove('on')}; $('modal').onclick=(e)=>{if(e.target.id==='modal')$('modal').classList.remove('on')};
$('ingestUrl').textContent=location.origin+'/ingest'; loadPrefs(); setLinks(); setTimer(); load();
</script></body></html>`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; if (data.length > MAX_BODY) { reject(new Error('too_large')); req.destroy(); } });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function handle(req, res) {
  (async () => {
    try {
      if (req.method === 'OPTIONS') return send(res, 204, '');
      const url = new URL(req.url || '/', 'http://localhost');
      const isIngest = req.method === 'POST' && (url.pathname === '/' || url.pathname === '/ingest' || url.pathname === '/event');
      const isPublic = url.pathname === '/health';
      const protectedRoute = !isPublic; // dashboard/api/ingest are not public in wildcard-CORS sense
      // allow ingest with token auth checked separately; protect dashboard/api if configured
      if (!isPublic && !isIngest) {
        if (!checkAuth(req)) return unauthorized(res, protectedRoute);
      } else if (isIngest && AUTH_TOKEN) {
        const auth = String(req.headers.authorization || '');
        const hdr = String(req.headers['x-telemetry-token'] || '');
        const bearerOk = auth.startsWith('Bearer ') && safeEqual(auth.slice(7), AUTH_TOKEN);
        const hdrOk = !!hdr && safeEqual(hdr, AUTH_TOKEN);
        if (!(bearerOk || hdrOk || checkAuth(req))) return unauthorized(res, protectedRoute);
      }

      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/dashboard')) {
        return send(res, 200, htmlPage(), { 'Content-Type': 'text/html; charset=utf-8' }, protectedRoute);
      }
      if (req.method === 'GET' && url.pathname === '/api/summary') {
        return sendJson(res, 200, summarize(readEvents(), { range: String(url.searchParams.get('range') || 'all'), q: url.searchParams.get('q') || '' }), protectedRoute);
      }
      if (req.method === 'GET' && url.pathname === '/api/install') {
        return sendJson(res, 200, installDetails(readEvents(), url.searchParams.get('id') || ''), protectedRoute);
      }
      if (req.method === 'GET' && url.pathname === '/api/events') {
        return sendJson(res, 200, { events: readEvents().slice(-1000).reverse() }, protectedRoute);
      }
      if (req.method === 'GET' && url.pathname === '/api/export/errors.csv') {
        const s = summarize(readEvents(), { range: String(url.searchParams.get('range') || 'all') });
        const csv = toCsv(s.recentErrors, ['ts','event','installId','sessionId','version','platform','message','stack']);
        return send(res, 200, csv, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="errors.csv"' }, protectedRoute);
      }
      if (req.method === 'GET' && url.pathname === '/api/export/events.csv') {
        const s = summarize(readEvents(), { range: String(url.searchParams.get('range') || 'all') });
        const csv = toCsv(s.recentEvents, ['ts','event','installId','sessionId','version','platform','kind']);
        return send(res, 200, csv, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="events.csv"' }, protectedRoute);
      }
      if (req.method === 'GET' && url.pathname === '/api/report') {
        const range = String(url.searchParams.get('range') || '7d');
        const s = summarize(readEvents(), { range });
        const report = { title: 'GomizPlayer IPTV Telemetry Report', range, generatedAt: s.generatedAt, totals: s.totals, alerts: s.alerts, topErrors: s.groupedErrors.slice(0,10), topVersions: s.versions, platforms: s.platforms, days: s.days };
        return sendJson(res, 200, report, protectedRoute);
      }
      if (req.method === 'GET' && url.pathname === '/health') {
        return sendJson(res, 200, { ok: true, auth: !!(AUTH_TOKEN || DASH_USER), https: !!(SSL_KEY && SSL_CERT) });
      }

      if (isIngest) {
        if (!allowReq(req)) return sendJson(res, 429, { ok: false, error: 'rate_limited' }, protectedRoute);
        const raw = await readBody(req);
        let payload = {};
        try { payload = raw ? JSON.parse(raw) : {}; } catch (_) { payload = { event: 'invalid' }; }
        if (Array.isArray(payload.events)) {
          const batch = payload.events.slice(0, MAX_BATCH);
          for (const e of batch) appendEvent(e);
          return sendJson(res, 200, { ok: true, received: batch.length }, protectedRoute);
        }
        appendEvent(payload);
        return sendJson(res, 200, { ok: true, received: 1 }, protectedRoute);
      }

      return sendJson(res, 404, { error: 'not_found' }, protectedRoute);
    } catch (err) {
      return sendJson(res, 500, { error: err && err.message ? err.message : 'error' });
    }
  })();
}

let server;
if (SSL_KEY && SSL_CERT) {
  try {
    server = https.createServer({ key: fs.readFileSync(SSL_KEY), cert: fs.readFileSync(SSL_CERT) }, handle);
  } catch (e) {
    console.error('[telemetry-server] HTTPS init failed, falling back to HTTP:', e.message);
    server = http.createServer(handle);
  }
} else {
  server = http.createServer(handle);
}

server.listen(PORT, HOST, () => {
  const proto = (SSL_KEY && SSL_CERT) ? 'https' : 'http';
  console.log(`[telemetry-server] listening on ${proto}://${HOST}:${PORT}`);
  console.log(`[telemetry-server] dashboard: ${proto}://localhost:${PORT}/`);
  console.log(`[telemetry-server] ingest:    POST ${proto}://localhost:${PORT}/ingest`);
  console.log(`[telemetry-server] data:      ${DATA_FILE}`);
  if (AUTH_TOKEN || DASH_USER) console.log('[telemetry-server] auth:      enabled');
});


