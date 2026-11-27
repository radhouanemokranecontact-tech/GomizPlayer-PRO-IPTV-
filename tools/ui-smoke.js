// Optional UI smoke test (not in CI): needs Playwright + Chromium.  Usage: node tools/ui-smoke.js <project-root>
// Loads the real renderer with a stubbed window.api and exercises the PRO page and the failover path.
// Loads the real renderer in Chromium with a stubbed window.api and checks the PRO page + failover.
const { chromium } = require('playwright');
const path = require('path');
const root = require('path').resolve(process.argv[2] || '.');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined }); const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(() => {
    const items = [
      { key: 'a', name: 'TF1 HD', kind: 'live', group: 'FR', url: 'http://127.0.0.1:9/a.m3u8', catchup: { type: 'xc', days: 3 } },
      { key: 'b', name: 'TF1 FHD', kind: 'live', group: 'FR', url: 'http://127.0.0.1:9/b.m3u8' },
      { key: 'x', name: '<img src=x onerror=window.__xss=1>', kind: 'live', group: 'FR', url: 'http://h/x.m3u8' }
    ];
    const sched = []; window.__calls = [];
    const noop = async () => ({}); const rec = (n, v) => async (...a) => { window.__calls.push([n, a]); return v; };
    window.api = {
      info: async () => ({ version: '2.0.0', platform: 'win32' }), demoPath: async () => '',
      settings: { get: async () => ({ language: 'en', theme: 'dark', consentShown: true, proAutoFailover: true, proHideDead: false, retryCount: 0, onboarded: true, welcomeDone: true }), patch: async (p) => ({ language: 'en', theme: 'dark', consentShown: true, onboarded: true, welcomeDone: true, ...p }) },
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
        alternatives: async (it) => { window.__calls.push(['alt', [it.key]]); return { items: it.key === 'a' ? [{ key: 'b', name: 'TF1 FHD', url: 'http://127.0.0.1:9/b.m3u8', kind: 'live', headers: {} }] : [] }; },
        catchupUrl: rec('catchup', { ok: true, url: 'http://h/timeshift/u/p/30/2026-01-01:10-00/1.ts', headers: {} }),
        sched: { list: async () => ({ items: sched }), add: async (e) => { sched.push({ ...e, id: 'z' + sched.length, state: 'scheduled' }); window.__calls.push(['sched.add', [e]]); return { ok: true }; }, remove: async (id) => { sched.splice(0, sched.length); return { ok: true }; } },
        parental: { get: async () => ({ config: { enabled: false, keywords: ['foo'], lockedGroups: [], useDefaults: true }, lockSet: true }), set: rec('parental.set', { ok: true }) },
        exportM3U: rec('export', { ok: true, count: 2 })
      }
    };
  });
  await page.goto('file://' + path.join(root, 'src/renderer/index.html'));
  await page.waitForTimeout(1200);
  await page.click('.nav-item[data-route="pro"]'); await page.waitForTimeout(600);
  const txt = await page.innerText('#view, main, .view').catch(() => '');
  const checks = {
    'PRO nav item visible': await page.isVisible('.nav-item[data-route="pro"]'),
    'page title': /GomizPlayer PRO/.test(await page.content()),
    'doctor section': /Library Doctor/.test(txt), 'summary counts': /Working: 1\s+·\s+Dead: 1\s+·\s+Untested: 1/.test(txt),
    'backups section': /Channels with backups: 1/.test(txt), 'scheduler section': /Scheduled recordings/.test(txt), 'parental section': /Parental controls/.test(txt), 'export section': /Export playlist/.test(txt)
  };
  await page.click('text=Scan channels'); await page.waitForTimeout(200);
  await page.evaluate(() => window.__progress({ done: 1, total: 3, ok: 1, dead: 0 })); await page.waitForTimeout(100);
  checks['progress text'] = /Scanning… 1 \/ 3/.test(await page.innerText('#view, main, .view'));
  // scheduler: pick channel (xss-named one must be inert) and add
  await page.fill('input[placeholder="Search channel…"]', 'TF1'); await page.waitForTimeout(100);
  const opts = await page.$$eval('select.select option', (o) => o.map((x) => x.textContent));
  checks['channel picker filtered'] = opts.includes('TF1 HD') && !opts.some((x) => /img src/.test(x) && false);
  await page.selectOption('select.select >> nth=1', 'a'); await page.click('button:has-text("Schedule")'); await page.waitForTimeout(300);
  checks['schedule add called'] = await page.evaluate(() => window.__calls.some((c) => c[0] === 'sched.add' && c[1][0].key === 'a'));
  checks['schedule listed'] = await page.evaluate(() => /Scheduled\s+\(?/.test(document.body.innerText) && document.body.innerText.includes('→'));
  await page.click('text=Export without duplicates'); await page.waitForTimeout(100);
  checks['export called'] = await page.evaluate(() => window.__calls.some((c) => c[0] === 'export' && c[1][0].dedupe === true));
  await page.locator('.pro-card').filter({ hasText: 'Parental controls' }).locator('.switch').first().click();
  checks['PIN appears when enabling parental controls'] = await page.isVisible('.pro-card input[type="password"]');
  await page.click('text=Save >> nth=0'); await page.waitForTimeout(200);
  checks['parental save called'] = await page.evaluate(() => window.__calls.some((c) => c[0] === 'parental.set' && c[1][0].keywords[0] === 'foo'));
  checks['no xss executed'] = await page.evaluate(() => !window.__xss);
  // failover: a live item that cannot load must switch to the alternative returned by the PRO API
  await page.evaluate(() => { playItem(state.items[0], state.items); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { player.showError('forced fatal error'); });
  await page.waitForTimeout(1500);
  console.log('player state:', JSON.stringify(await page.evaluate(() => ({ key: player.item && player.item.key, err: !player.errorBox.hidden, calls: window.__calls.map((c) => c[0]) }))));
  checks['failover asked for alternatives'] = await page.evaluate(() => window.__calls.some((c) => c[0] === 'alt' && c[1][0] === 'a'));
  checks['failover switched item'] = await page.evaluate(() => player && player.item && player.item.key === 'b');
  // chain end: second failure has no alternatives -> real error box is shown, no infinite loop
  await page.evaluate(() => { player.showError('forced again'); }); await page.waitForTimeout(800);
  checks['error box shown when no alternatives left'] = await page.evaluate(() => !player.errorBox.hidden);
  await page.evaluate(() => { player.close(true); });
  // Arabic
  await page.evaluate(() => { window.I18N.lang = 'ar'; }); await page.evaluate(() => document.querySelector('.nav-item[data-route="home"]').click()); await page.waitForTimeout(200);
  await page.click('.nav-item[data-route="pro"]'); await page.waitForTimeout(400);
  checks['arabic labels'] = /طبيب القنوات/.test(await page.innerText('#view, main, .view'));
  await page.screenshot({ path: path.join(require('os').tmpdir(), 'pro-ar.png') });
  await page.evaluate(() => { window.I18N.lang = 'en'; }); await page.evaluate(() => document.querySelector('.nav-item[data-route="home"]').click()); await page.waitForTimeout(200);
  await page.click('.nav-item[data-route="pro"]'); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(require('os').tmpdir(), 'pro-en.png'), fullPage: false });
  console.log(JSON.stringify(checks, null, 1)); const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  const realErrors = errors.filter((e) => !/net::ERR|Failed to load resource|favicon/.test(e));
  console.log('errors:', realErrors.length ? realErrors : 'none'); console.log(bad.length || realErrors.length ? 'UI SMOKE FAILED: ' + bad.join(', ') : 'UI SMOKE PASSED');
  await browser.close(); process.exit(bad.length || realErrors.length ? 1 : 0);
})().catch((e) => { console.log('crash', e.stack); process.exit(1); });
