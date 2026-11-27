// Multiview UI test: real Chromium, real <video>, local media server. Usage: node tools/ui-multiview.js <project-root>
const { chromium } = require('playwright');
const { spawnSync } = require('child_process');
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const root = require('path').resolve(process.argv[2] || '.');
let ff = null;
try {
  const bundled = require('ffmpeg-static');
  if (bundled && fs.existsSync(bundled)) ff = bundled;
} catch {}
if (!ff) ff = ['/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg', 'ffmpeg'].find((p) => p === 'ffmpeg' || fs.existsSync(p));
if (!ff) { console.log('SKIP no ffmpeg executable (ffmpeg-static or PATH)'); process.exit(0); }
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gomiz-mv-'));
  const mk = (args, cwd) => spawnSync(ff, ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8', ...(cwd ? { cwd } : {}) });
  let r = mk(['-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=15', '-f', 'lavfi', '-i', 'sine=frequency=500', '-t', '30', '-c:v', 'libvpx', '-b:v', '200k', '-c:a', 'libvorbis', path.join(tmp, 'a.webm')]);
  if (r.status !== 0) { console.log('SKIP cannot encode webm: ' + r.stderr.slice(0, 120)); process.exit(0); }
  fs.mkdirSync(path.join(tmp, 'h'));
  r = mk(['-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=15', '-t', '20', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'baseline', '-g', '30', '-sc_threshold', '0', '-b:v', '150k', '-an', '-f', 'hls', '-hls_time', '2', '-hls_list_size', '0', '-hls_segment_type', 'fmp4', '-hls_fmp4_init_filename', 'init.mp4', path.join(tmp, 'h', 'index.m3u8')], path.join(tmp, 'h'));
  const hlsOk = r.status === 0;
  const srv = http.createServer((q, res) => {
    const f = q.url.startsWith('/h/') ? path.join(tmp, 'h', path.basename(q.url)) : q.url === '/a.webm' ? path.join(tmp, 'a.webm') : null;
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (!f || !fs.existsSync(f)) { res.writeHead(404, cors); return res.end(); }
    const ext = path.extname(f); const type = { '.webm': 'video/webm', '.m3u8': 'application/vnd.apple.mpegurl', '.m4s': 'video/iso.segment', '.mp4': 'video/mp4' }[ext] || 'application/octet-stream';
    const size = fs.statSync(f).size; const m = /bytes=(\d+)-(\d*)/.exec(q.headers.range || '');
    if (m) { const s = +m[1], e = m[2] ? +m[2] : size - 1; res.writeHead(206, { ...cors, 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${s}-${e}/${size}`, 'Content-Length': e - s + 1 }); return fs.createReadStream(f, { start: s, end: e }).pipe(res); }
    res.writeHead(200, { ...cors, 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': size }); fs.createReadStream(f).pipe(res);
  });
  await new Promise((r2) => srv.listen(0, '127.0.0.1', r2)); const base = 'http://127.0.0.1:' + srv.address().port;

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.addInitScript((b) => {
    window.__ITEMS__ = [
      { key: 'w', name: 'WebM Direct', kind: 'live', group: 'Test', url: b + '/a.webm' },
      { key: 'h', name: 'HLS H.264', kind: 'live', group: 'Test', url: b + '/h/index.m3u8' },
      { key: 'dead', name: 'Dead Channel', kind: 'live', group: 'Test', url: b + '/missing/index.m3u8' },
      { key: 'dead-alt', name: 'Dead Channel HD', kind: 'live', group: 'Test', url: b + '/a.webm' },
      { key: 'x', name: '<img src=x onerror=window.__xss=1>', kind: 'live', group: 'Test', url: b + '/a.webm' }
    ];
  }, base);
  await page.addInitScript(() => {
    const items = window.__ITEMS__;
    const sched = []; window.__calls = [];
    const noop = async () => ({}); const rec = (n, v) => async (...a) => { window.__calls.push([n, a]); return v; };
    window.api = {
      info: async () => ({ version: '2.0.0', platform: 'win32' }), demoPath: async () => '',
      settings: { get: async () => ({ language: 'en', theme: 'dark', consentShown: true, proAutoFailover: true, proHideDead: false, retryCount: 0, onboarded: true, welcomeDone: true }), patch: async (p) => { window.__patches = (window.__patches || []).concat([p]); return ({ language: 'en', theme: 'dark', consentShown: true, onboarded: true, welcomeDone: true, ...p }); } },
      sources: { list: async () => [{ id: 's1', name: 'Main', kind: 'm3u', count: 3 }], items: async () => ({ items, count: 3, groups: { FR: 3 } }), refresh: async () => ({ items, count: 3 }), account: noop, setPassword: noop, add: noop, update: noop, remove: noop },
      library: { get: async () => ({ favorites: [], history: [], liveHistory: [], search: [] }), favorite: noop, history: noop, progress: noop, search: noop, clear: noop },
      profiles: { list: async () => ['default'], create: noop, delete: noop }, epg: { list: async () => [], channels: async () => ({}), add: noop, refresh: noop, remove: noop },
      downloads: { list: async () => [], onChanged: () => () => {}, add: noop, pause: noop, resume: noop, remove: noop, open: noop },
      recording: { status: async () => ({ recording: false }), list: async () => [], start: noop, stop: noop, delete: noop },
      updates: { status: async () => ({ status: 'idle' }), onStatus: () => () => {}, onAvailable: () => () => {}, check: noop, guard: async () => ({}), snapshot: noop, dismissRollback: noop, download: noop, install: noop },
      backup: { list: async () => [], now: noop, export: noop, import: noop }, storage: { stats: async () => ({}), clearCache: noop, resetSettings: noop },
      app: { info: async () => ({ version: '2.0.0' }), demoPath: async () => '', factoryReset: noop }, diagnostics: { export: noop, log: noop, tail: async () => [] },
      files: { readText: noop, readBuffer: noop }, net: { fetchText: noop }, dialog: { openFile: noop }, shell: { showItem: noop, openExternal: noop }, clipboard: { writeText: noop },
      appLock: { verify: async () => ({ ok: true }) }, window: { setAlwaysOnTop: noop, isAlwaysOnTop: async () => false, toggleFullScreen: noop, isFullScreen: async () => false }, capture: { saveScreenshot: noop },
      pro: {
        status: async () => ({ version: '2.0.0' }),
        health: { scan: rec('scan', { started: true, total: 3 }), cancel: rec('cancel', { ok: true }), summary: async () => ({ ok: 1, dead: 1, unknown: 1, lastScanAt: Date.now(), running: false }), setHideDead: rec('hide', { ok: true }), clear: rec('clear', { ok: true }),
          onProgress: (cb) => { window.__progress = cb; return () => {}; }, onDone: (cb) => { window.__done = cb; return () => {}; } },
        dupes: async () => ({ clusters: 1, redundant: 1, live: 3 }),
        alternatives: async (it) => { window.__calls.push(['alt', [it.key]]); return { items: it.key === 'dead' ? [window.__ITEMS__[3]] : [] }; },
        catchupUrl: rec('catchup', { ok: true, url: 'http://h/timeshift/u/p/30/2026-01-01:10-00/1.ts', headers: {} }),
        sched: { list: async () => ({ items: sched }), add: async (e) => { sched.push({ ...e, id: 'z' + sched.length, state: 'scheduled' }); window.__calls.push(['sched.add', [e]]); return { ok: true }; }, remove: async (id) => { sched.splice(0, sched.length); return { ok: true }; } },
        parental: { get: async () => ({ config: { enabled: false, keywords: ['foo'], lockedGroups: [], useDefaults: true }, lockSet: false }), set: rec('parental.set', { ok: true, warning: 'no-pin' }) },
        exportM3U: rec('export', { ok: true, count: 2 })
      }
    };
  });
  await page.goto('file://' + path.join(root, 'src/renderer/index.html'));
  await page.waitForTimeout(1200);
  const checks = {};
  checks['sidebar entry present'] = await page.isVisible('.nav-item[data-route="multiview"]');
  await page.click('.nav-item[data-route="multiview"]'); await page.waitForTimeout(400);
  checks['overlay opens'] = await page.isVisible('.mv-root');
  checks['4 tiles in 2x2'] = (await page.$$('.mv-tile')).length === 4;
  // pick channels through the UI
  const pick = async (tileIdx, query, label) => {
    await page.click(`.mv-tile:nth-child(${tileIdx + 1}) .mv-empty button`); await page.waitForTimeout(150);
    await page.fill('.mv-picker input', query); await page.waitForTimeout(100);
    await page.click(`.mv-picker .mv-item:has-text("${label}")`); await page.waitForTimeout(150);
  };
  await pick(0, 'WebM', 'WebM Direct');
  await pick(1, 'HLS', 'HLS H.264');
  await pick(2, 'Dead', 'Dead Channel');
  await page.click('.mv-tile:nth-child(4) .mv-empty button'); await page.fill('.mv-picker input', 'img');
  checks['xss-named channel listed as text'] = (await page.innerText('.mv-picker .mv-list')).includes('<img src=x'); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  checks['Esc closes picker only'] = !(await page.$('.mv-picker')) && await page.isVisible('.mv-root');
  await page.waitForTimeout(3500);
  const st = () => page.evaluate(() => window.GomizMultiview._tiles().map((t) => ({ k: t.item && t.item.key, paused: t.video.paused, ct: t.video.currentTime, rs: t.video.readyState, muted: t.video.muted, err: !t.overlay.hidden, hls: !!t.hls })));
  let s = await st();
  checks['native tile is playing'] = s[0].k === 'w' && !s[0].paused && s[0].ct > 0.3 && s[0].rs >= 2;
  checks['HLS tile uses hls.js'] = s[1].k === 'h' && s[1].hls === true;
  checks['HLS tile is playing'] = hlsOk ? (s[1].ct > 0.3 && s[1].rs >= 2) : true;
  checks['failed tile switched to backup'] = s[2].k === 'dead-alt' && !s[2].err && s[2].ct > 0.2;
  checks['failover asked the PRO API'] = await page.evaluate(() => window.__calls.some((c) => c[0] === 'alt' && c[1][0] === 'dead'));
  checks['only the last-picked tile has audio'] = s[2].muted === false && s[0].muted === true && s[1].muted === true;
  await page.click('.mv-tile:nth-child(2) video'); await page.waitForTimeout(100);
  s = await st(); checks['click moves audio'] = s[1].muted === false && s[0].muted === true;
  checks['speaker icon follows'] = (await page.innerText('.mv-tile:nth-child(2) .mv-speaker')).includes('🔊') && (await page.innerText('.mv-tile:nth-child(1) .mv-speaker')).trim() === '';
  await page.click('.mv-bar button:has-text("Mute all")'); await page.waitForTimeout(100);
  s = await st(); checks['mute all'] = s.every((t) => t.muted);
  // layout switching keeps channels
  await page.click('.mv-bar button[data-layout="1+3"]'); await page.waitForTimeout(800);
  s = await st(); checks['layout 1+3 keeps channels'] = s.length === 4 && s[0].k === 'w' && s[1].k === 'h';
  await page.click('.mv-bar button[data-layout="1x2"]'); await page.waitForTimeout(500);
  s = await st(); checks['layout 1x2 has 2 tiles'] = s.length === 2;
  await page.click('.mv-bar button[data-layout="3x2"]'); await page.waitForTimeout(500);
  checks['6-stream warning shown'] = await page.isVisible('.mv-bar .mv-hint:has-text("powerful")');
  s = await st(); checks['layout 3x2 has 6 tiles'] = s.length === 6;
  checks['layout persisted'] = await page.evaluate(() => (window.__patches || []).some((p) => p.proMultiview && p.proMultiview.layout === '3x2'));
  await page.screenshot({ path: path.join(os.tmpdir(), 'mv-en.png') });
  // remove a tile
  await page.click('.mv-tile:nth-child(1)'); await page.hover('.mv-tile:nth-child(1)'); await page.click('.mv-tile:nth-child(1) .mv-actions button:has-text("Remove")'); await page.waitForTimeout(150);
  s = await st(); checks['remove empties tile'] = s[0].k === null;
  // Escape closes everything and releases media
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  checks['Esc closes overlay'] = !(await page.$('.mv-root'));
  checks['no leftover video elements'] = (await page.$$('video.mv, .mv-tile video')).length === 0;
  // reopen restores saved channels and Arabic is RTL
  await page.evaluate(() => { window.I18N.lang = 'ar'; });
  await page.evaluate(() => { const last = window.__patches.filter((p) => p.proMultiview).pop(); window.__novaTest.state.settings.proMultiview = last.proMultiview; window.__novaTest.openMultiview(); });
  await page.waitForTimeout(1500);
  checks['reopen restores layout'] = (await page.$$('.mv-tile')).length === 6;
  checks['reopen restores channels'] = await page.evaluate(() => { const k = window.GomizMultiview._tiles().map((t) => t.item && t.item.key); return k[1] === 'h'; });
  checks['channels survive shrinking the layout'] = await page.evaluate(() => (window.__patches.filter((p) => p.proMultiview && p.proMultiview.layout === '1+3').pop() || { proMultiview: { keys: [] } }).proMultiview.keys.filter(Boolean).length >= 2);
  checks['arabic RTL + labels'] = (await page.getAttribute('.mv-root', 'dir')) === 'rtl' && /مشاهدة متعددة/.test(await page.innerText('.mv-bar'));
  await page.screenshot({ path: path.join(os.tmpdir(), 'mv-ar.png') });
  await page.evaluate(() => window.GomizMultiview.close());
  checks['no xss executed'] = await page.evaluate(() => !window.__xss);
  console.log(JSON.stringify(checks, null, 1)); const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  const realErrors = errors.filter((e) => !/net::ERR|Failed to load resource/.test(e));
  console.log('errors:', realErrors.length ? realErrors : 'none'); console.log(bad.length || realErrors.length ? 'MULTIVIEW UI FAILED: ' + bad.join(', ') : 'MULTIVIEW UI PASSED');
  await browser.close(); srv.close(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(bad.length || realErrors.length ? 1 : 0);
})().catch((e) => { console.log('crash', e.stack); process.exit(1); });
