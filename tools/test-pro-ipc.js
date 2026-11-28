'use strict';
// Integration test of src/main/pro/ipc.js with a faked Electron surface and a real local HTTP server.
const path = require('path'); const http = require('http'); const fs = require('fs'); const os = require('os');
const ipcMod = require(path.join(__dirname, '..', 'src', 'main', 'pro', 'ipc.js'));
const { assertSafeUrl } = require(path.join(__dirname, '..', 'src', 'main', 'net-guard.js'));
let failed = 0; const t = (n, c, x) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' :: ' + (x || ''))); if (!c) failed++; };

(async () => {
  const ts = Buffer.alloc(188 * 3); for (let i = 0; i < 3; i++) ts[i * 188] = 0x47;
  const srv = http.createServer((q, r) => { if (q.url.startsWith('/ok')) { r.writeHead(200, { 'content-type': 'video/mp2t' }); return r.end(ts); } r.writeHead(404); r.end(); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const B = 'http://127.0.0.1:' + srv.address().port;

  const caches = {}; const handlers = {}; const sent = [];
  const settings = { proParental: { enabled: false, keywords: [], lockedGroups: [], useDefaults: true }, proHideDead: false, appLockHash: '' };
  const store = { data: { schedules: [] }, settings, sources: () => [{ id: 's1' }, { id: 's2' }], save() {}, patchSettings(p) { Object.assign(settings, p); return settings; } };
  const mk = (key, name, url, extra) => Object.assign({ key, name, url, kind: 'live', group: 'G', hidden: false, headers: {} }, extra);
  caches['source-s1'] = { items: [mk('a', 'TF1 HD', B + '/ok1'), mk('b', 'TF1 FHD', B + '/dead1'), mk('c', 'Night XXX', B + '/ok2', { group: 'Adults' }), mk('d', 'Old', B + '/ok3', { hidden: true })] };
  caches['source-s2'] = { items: [mk('e', 'TF1', B + '/ok4'), mk('m', 'A Movie', B + '/ok5', { kind: 'movie' })] };
  let pinOk = true; let exported = null; let recState = { file: null }; const startCalls = [];
  const fakeWin = { isDestroyed: () => false, webContents: { send: (c, p) => sent.push([c, p]) } };
  const api = ipcMod.register({
    ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; } },
    dialog: { showSaveDialog: async () => ({ canceled: false, filePath: path.join(os.tmpdir(), 'gomiz-test-export.m3u') }) },
    getWin: () => fakeWin, assertTrustedSender: (e) => { if (e && e.untrusted) throw new Error('Untrusted sender'); },
    store, readCache: (n) => caches[n] || null, writeCache: (n, v) => { caches[n] = JSON.parse(JSON.stringify(v)); },
    verifyAppLockPin: async () => ({ ok: pinOk }), assertSafeUrl, appVersion: () => '2.0.0',
    startRecording: async (p, o) => { startCalls.push([p, o]); recState.file = '/rec/x.ts'; return { ok: true, path: '/rec/x.ts' }; },
    stopRecording: async () => ({ ok: true }), isRecording: (f) => recState.file === f
  });
  const call = (ch, p, ev) => handlers[ch](ev || {}, p);

  t('all pro channels registered', ['pro:status', 'pro:health:scan', 'pro:alternatives', 'pro:parental:get', 'pro:parental:set', 'pro:parental:pin:set', 'pro:parental:pin:verify', 'pro:export:m3u', 'pro:sched:add', 'pro:catchup:url'].every((c) => handlers[c]));
  let threw = false; try { await call('pro:status', {}, { untrusted: true }); } catch (_) { threw = true; } t('untrusted sender rejected', threw);

  // alternatives (before any health data): hidden item excluded, parental off
  const alts = await call('pro:alternatives', { key: 'a' });
  t('alternatives found across sources', alts.items.map((x) => x.key).sort().join() === 'b,e', JSON.stringify(alts.items.map((x) => x.key)));
  const dsum = await call('pro:dupes:summary');
  t('dupes summary', dsum.clusters === 1 && dsum.redundant === 2, JSON.stringify(dsum));

  // health scan
  const started = await call('pro:health:scan', { sourceId: 'all', concurrency: 4, timeoutMs: 2000 });
  t('scan started', started.started && started.total === 4, JSON.stringify(started)); // a,b,c,e (d hidden base, m movie)
  const again = await call('pro:health:scan', { sourceId: 'all' }); t('second scan while running is refused', again.error === 'busy');
  await new Promise((r) => { const iv = setInterval(() => { if (sent.find((x) => x[0] === 'pro:health:done')) { clearInterval(iv); r(); } }, 50); });
  const done = sent.find((x) => x[0] === 'pro:health:done')[1];
  t('scan done stats', done.total === 4 && done.ok === 3 && done.dead === 1, JSON.stringify(done));
  t('progress events sent', sent.some((x) => x[0] === 'pro:health:progress'));
  const sum = await call('pro:health:summary', { sourceId: 'all' }); t('summary counts', sum.ok === 3 && sum.dead === 1 && sum.unknown === 0, JSON.stringify(sum));
  const alts2 = await call('pro:alternatives', { key: 'a' }); t('dead alternative dropped after scan', alts2.items.map((x) => x.key).join() === 'e', JSON.stringify(alts2.items.map((x) => x.key)));

  // hide dead
  await call('pro:health:setHideDead', { on: true });
  const b = caches['source-s1'].items.find((x) => x.key === 'b'); t('dead item hidden in cache', b.hidden === true && b.dead === true);
  t('group counts exclude hidden', caches['source-s1'].groups && caches['source-s1'].groups.G === 1 && caches['source-s1'].groups.Adults === 1, JSON.stringify(caches['source-s1'].groups));
  await call('pro:health:setHideDead', { on: false });
  t('dead item restored when off', caches['source-s1'].items.find((x) => x.key === 'b').hidden === false);
  t('base-hidden item stays hidden', caches['source-s1'].items.find((x) => x.key === 'd').hidden === true);

  // parental + its OWN PIN (independent of the Settings app lock)
  let r = await call('pro:parental:set', { enabled: true, keywords: ['tf1'] });
  t('parental enable without a parental PIN is rejected', !r.ok && r.error === 'pin-required');
  t('rejected parental enable leaves filters unchanged', !settings.proParental.enabled && caches['source-s1'].items.find((x) => x.key === 'a').hidden === false);

  // A set app lock must NOT satisfy or affect the parental PIN requirement.
  settings.appLockHash = 'x';
  r = await call('pro:parental:pin:set', { pin: '1234' });
  t('parental PIN can be set without any app lock', r.ok && r.pinSet === true);
  let v = await call('pro:parental:pin:verify', { pin: '1234' });
  t('parental PIN verifies', v.ok === true);
  v = await call('pro:parental:pin:verify', { pin: 'bad' });
  t('wrong parental PIN rejected', v.ok === false);
  r = await call('pro:parental:pin:set', { pin: '9999', currentPin: 'bad' });
  t('changing parental PIN needs current PIN', !r.ok && r.error === 'pin' && settings.proParentalPinHash);

  r = await call('pro:parental:set', { enabled: true, keywords: ['tf1'], pin: '1234' });
  t('parental enable with its own PIN succeeds', r.ok && settings.proParental.enabled);
  t('parental hides adult + keyword items', caches['source-s1'].items.find((x) => x.key === 'c').hidden === true && caches['source-s1'].items.find((x) => x.key === 'a').hidden === true);
  r = await call('pro:parental:set', { enabled: false, pin: 'bad' });
  t('disabling needs correct parental PIN', r.ok === false && r.error === 'pin' && settings.proParental.enabled === true);
  r = await call('pro:parental:set', { enabled: false, pin: '1234' });
  t('correct PIN disables and restores', r.ok && caches['source-s1'].items.find((x) => x.key === 'c').hidden === false && caches['source-s1'].items.find((x) => x.key === 'd').hidden === true);

  r = await call('pro:parental:pin:set', { pin: '', currentPin: '1234' });
  t('parental PIN can be cleared with current PIN', r.ok && r.pinSet === false && !settings.proParentalPinHash);
  settings.appLockHash = '';

  // export
  const exp = await call('pro:export:m3u', { sourceId: 'all', dedupe: true });
  const text = fs.readFileSync(exp.path, 'utf8');
  t('export dedupes and skips hidden', exp.ok && /^#EXTM3U/.test(text) && !/Old/.test(text) && (text.match(/TF1/g) || []).length === 1, text);
  const strict = await call('pro:export:m3u', { sourceId: 'all', strict: true });
  t('strict export only keeps verified-alive live channels', !/dead1/.test(fs.readFileSync(strict.path, 'utf8')));

  // catch-up
  const cu = await call('pro:catchup:url', { item: { url: 'http://h/live/u/p/9.ts', catchup: { type: 'xc' } }, start: Date.now() - 7200e3, end: Date.now() - 3600e3 });
  t('catchup url via ipc', cu.ok && /\/timeshift\/u\/p\/60\//.test(cu.url), JSON.stringify(cu));
  t('catchup rejects non-http result', !(await call('pro:catchup:url', { item: { url: 'file:///x', catchup: { type: 'default' } }, start: Date.now() - 7200e3, end: Date.now() - 3600e3 })).ok);

  // scheduler via ipc
  const now = Date.now();
  const ad = await call('pro:sched:add', { name: 'Show', url: B + '/ok1', startAt: now + 60000, endAt: now + 120000 });
  t('schedule add', ad.ok && (await call('pro:sched:list')).items.length === 1);
  t('schedule rejects file: url', (await call('pro:sched:add', { name: 'x', url: 'file:///etc/passwd', startAt: now + 1000, endAt: now + 5000 })).ok === false);
  t('schedule remove', (await call('pro:sched:remove', { id: ad.entry.id })).ok);

  api.shutdown(); srv.close();
  console.log(failed ? 'PRO IPC TESTS FAILED (' + failed + ')' : 'ALL PRO IPC TESTS PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL crash ' + e.stack); process.exit(1); });
