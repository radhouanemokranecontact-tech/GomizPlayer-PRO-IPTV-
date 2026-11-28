// Real renderer channel-navigation regression (Playwright).
// Usage: node tools/test-navigation.js <project-root>
// Verifies focus ownership, next/prev, keyboard navigation, drawer focus and
// completion stability without building or contacting GitHub.
const { chromium } = require('playwright');
const path = require('path');
const root = path.resolve(process.argv[2] || '.');
let failed = 0;
const t = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' :: ' + JSON.stringify(extra))); if (!cond) failed++; };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_UNSAFE_PORT|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });

  await page.addInitScript(() => {
    const items = [
      { key: 'a', name: 'Channel A', kind: 'live', group: 'FR', url: 'http://127.0.0.1:9/a.m3u8' },
      { key: 'b', name: 'Channel B', kind: 'live', group: 'FR', url: 'http://127.0.0.1:9/b.m3u8' },
      { key: 'c', name: 'Channel C', kind: 'live', group: 'FR', url: 'http://127.0.0.1:9/c.m3u8' },
      { key: 'd', name: 'Channel D', kind: 'live', group: 'FR', url: 'http://127.0.0.1:9/d.m3u8' }
    ];
    window.__items = items;
    const noop = async () => ({});
    const rec = (n, v) => async (...a) => { (window.__calls || (window.__calls = [])).push([n, a]); return v; };
    window.__calls = [];
    window.api = {
      info: async () => ({ version: '2.0.4', platform: 'win32' }), demoPath: async () => '',
      settings: { get: async () => ({ language: 'en', theme: 'dark', consentShown: true, onboarded: true, welcomeDone: true, autoNext: false }), patch: async (p) => ({ language: 'en', theme: 'dark', consentShown: true, onboarded: true, welcomeDone: true, ...p }) },
      sources: { list: async () => [{ id: 's1', name: 'Main', kind: 'm3u', count: 4 }], items: async () => ({ items, count: 4, groups: { FR: 4 } }), refresh: async () => ({ items, count: 4 }), account: noop, setPassword: noop, add: noop, update: noop, remove: noop },
      library: { get: async () => ({ favorites: [], history: [], liveHistory: [], search: [] }), favorite: noop, history: noop, progress: noop, search: noop, clear: noop },
      profiles: { list: async () => ['default'], create: noop, delete: noop },
      epg: { list: async () => [], channels: async () => ({}), add: noop, refresh: noop, remove: noop },
      downloads: { list: async () => [], onChanged: () => () => {}, add: noop, pause: noop, resume: noop, remove: noop, open: noop },
      recording: { status: async () => ({ recording: false }), list: async () => [], start: noop, stop: noop, delete: noop },
      updates: { status: async () => ({ status: 'idle' }), onStatus: () => () => {}, onAvailable: () => () => {}, check: noop, guard: async () => ({}), snapshot: noop, dismissRollback: noop, download: noop, install: noop },
      backup: { list: async () => [], now: noop, export: noop, import: noop },
      storage: { stats: async () => ({}), clearCache: noop, resetSettings: noop },
      app: { info: async () => ({ version: '2.0.4' }), demoPath: async () => '', factoryReset: noop },
      diagnostics: { export: noop, log: noop, tail: async () => [] },
      files: { readText: noop, readBuffer: noop }, net: { fetchText: noop }, dialog: { openFile: noop },
      shell: { showItem: noop, openExternal: noop }, clipboard: { writeText: noop },
      appLock: { verify: async () => ({ ok: true }), set: async () => ({ ok: true }) },
      window: { setAlwaysOnTop: noop, isAlwaysOnTop: async () => false, toggleFullScreen: noop, isFullScreen: async () => false },
      capture: { saveScreenshot: noop },
      pro: {
        status: async () => ({ version: '2.0.4' }),
        health: { scan: noop, cancel: noop, summary: async () => ({ ok: 0, dead: 0, unknown: 0 }), setHideDead: noop, clear: noop, onProgress: () => () => {}, onDone: () => () => {} },
        dupes: async () => ({ live: 0 }), alternatives: async () => ({ items: [] }), catchupUrl: async () => ({ ok: false }),
        sched: { list: async () => ({ items: [] }), add: noop, remove: noop },
        parental: { get: async () => ({ config: { enabled: false, keywords: [], lockedGroups: [], useDefaults: true }, pinSet: false }), set: noop, setPin: noop, verifyPin: async () => ({ ok: true }) },
        exportM3U: noop
      }
    };
  });

  await page.goto('file://' + path.join(root, 'src/renderer/index.html'));
  await page.waitForFunction(() => window.__novaReady === true, null, { timeout: 20000 });
  const snap = () => page.evaluate(() => ({
    key: window.__novaTest.player().item && window.__novaTest.player().item.key,
    active: document.activeElement && (document.activeElement.id || document.activeElement.className || document.activeElement.tagName),
    drawerOpen: document.getElementById('channelDrawer').classList.contains('open'),
    search: document.getElementById('drawerSearch').value
  }));

  await page.evaluate(() => playItem(window.__items[0], window.__items));
  await page.waitForTimeout(300);
  let s = await snap();
  t('open focuses the player root', s.key === 'a' && s.active === 'playerRoot', s);

  await page.click('#nextCh'); await page.waitForTimeout(120); s = await snap();
  t('next button advances one channel', s.key === 'b', s);
  t('next button does not keep focus', s.active === 'playerRoot', s);
  await page.click('#nextCh'); await page.waitForTimeout(120); s = await snap();
  t('second next advances again', s.key === 'c', s);
  await page.click('#prevCh'); await page.waitForTimeout(120); s = await snap();
  t('prev button goes back one channel', s.key === 'b', s);
  t('prev button does not keep focus', s.active === 'playerRoot', s);

  await page.keyboard.press('Enter'); await page.waitForTimeout(120); s = await snap();
  t('Enter does not re-trigger the focused nav button', s.key === 'b' && s.active === 'playerRoot', s);
  await page.keyboard.press('Space'); await page.waitForTimeout(120); s = await snap();
  t('Space does not change channel', s.key === 'b', s);

  await page.keyboard.press('PageDown'); await page.waitForTimeout(120); s = await snap();
  t('PageDown goes to next channel', s.key === 'c', s);
  await page.keyboard.press('PageUp'); await page.waitForTimeout(120); s = await snap();
  t('PageUp goes to previous channel', s.key === 'b', s);
  await page.keyboard.press('Control+ArrowRight'); await page.waitForTimeout(120); s = await snap();
  t('Ctrl+Right goes to next channel', s.key === 'c', s);
  await page.keyboard.press('Control+ArrowLeft'); await page.waitForTimeout(120); s = await snap();
  t('Ctrl+Left goes to previous channel', s.key === 'b', s);

  await page.keyboard.press('d'); await page.waitForTimeout(250); s = await snap();
  t('d opens the drawer and focuses search', s.drawerOpen && s.active === 'drawerSearch', s);
  t('opening drawer with d does not type into search', s.search === '', s);
  const count = await page.$$eval('#drawerList .drawer-item', (els) => els.length);
  t('all four channels are listed', count === 4, count);

  await page.keyboard.press('Escape'); await page.waitForTimeout(250); s = await snap();
  t('Escape in drawer search closes drawer and restores focus', !s.drawerOpen && s.active === 'playerRoot', s);

  await page.click('#drawerBtn'); await page.waitForTimeout(250); s = await snap();
  t('clicking drawer button focuses search', s.drawerOpen && s.active === 'drawerSearch', s);
  await page.click('#drawerList .drawer-item >> nth=2'); await page.waitForTimeout(250); s = await snap();
  t('picking a channel closes drawer and keeps focus on player', s.key === 'c' && !s.drawerOpen && s.active === 'playerRoot', s);

  // An item outside the active playlist must not jump to first/last.
  await page.evaluate(() => playItem({ key: 'solo', name: 'Solo', kind: 'live', url: 'http://127.0.0.1:9/solo.m3u8' }, []));
  await page.waitForTimeout(150);
  await page.keyboard.press('PageDown'); await page.waitForTimeout(120); s = await snap();
  t('no playlist: navigation is a no-op, not a random jump', s.key === 'solo', s);

  // styles.css is not valid UTF-8; read as latin1 so the ASCII rules are intact.
  const css = require('fs').readFileSync(path.join(root, 'src/renderer/styles.css'), 'latin1');
  t('visible keyboard focus styling exists', /\.ctrl:focus-visible/.test(css));

  t('no JavaScript errors', errors.length === 0, errors);
  console.log(failed ? 'NAVIGATION TESTS FAILED (' + failed + ')' : 'ALL NAVIGATION TESTS PASSED');
  await browser.close();
  process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error('NAVIGATION_TEST_FAIL', e); process.exitCode = 1; });
