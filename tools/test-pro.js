'use strict';
const path = require('path');
const http = require('http');
const P = (f) => require(path.join(__dirname, '..', 'src', 'main', 'pro', f));
const dd = P('dedupe.js'), cu = P('catchup.js'), pa = P('parental.js'), ex = P('export.js'), he = P('health.js'), sc = P('scheduler.js');
let failed = 0;
const t = (n, c, extra) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' :: ' + (extra || ''))); if (!c) failed++; };

(async () => {
  /* ---------- dedupe ---------- */
  t('normalize strips prefix/tags', dd.normalizeName('AR| beIN Sports 1 HD [BACKUP]') === dd.normalizeName('bein sports 1 FHD'), dd.normalizeName('AR| beIN Sports 1 HD [BACKUP]'));
  t('normalize keeps distinguishing digits', dd.normalizeName('Sport 1') !== dd.normalizeName('Sport 2'));
  t('normalize handles arabic diacritics', dd.normalizeName('قناة الجزيرة') === dd.normalizeName('قَناة الجزيرة'));
  t('quality ranking', dd.qualityScore('X 4K') > dd.qualityScore('X FHD') && dd.qualityScore('X FHD') > dd.qualityScore('X HD') && dd.qualityScore('X HD') > dd.qualityScore('X') && dd.qualityScore('X') > dd.qualityScore('X SD'));
  const items = [
    { key: 'a', name: 'FR| TF1 HD', url: 'http://a/1', kind: 'live', sourceId: 's1' },
    { key: 'b', name: 'TF1 FHD', url: 'http://b/1', kind: 'live', sourceId: 's2' },
    { key: 'c', name: 'TF1 SD', url: 'http://c/1', kind: 'live', sourceId: 's1' },
    { key: 'd', name: 'Arte', url: 'http://d/1', kind: 'live', sourceId: 's1' },
    { key: 'e', name: 'TF1 FHD', url: 'http://b/1', kind: 'live', sourceId: 's3' }, // same URL
    { key: 'f', name: 'Some Movie', url: 'http://m/1', kind: 'movie', sourceId: 's1' },
    { key: 'g', name: 'Whatever', tvgId: 'tf1.fr', url: 'http://g/1', kind: 'live', sourceId: 's3' }
  ];
  const idx = dd.buildIndex(items, { sourceOrder: ['s1', 's2', 's3'] });
  t('one cluster for TF1 (+tvgId separate)', idx.clusters.length === 1 && idx.clusters[0].length === 3, JSON.stringify(idx.clusters.map((c) => c.map((x) => x.key))));
  t('best is highest quality', idx.clusters[0][0].key === 'b');
  t('identical URLs are not alternatives', idx.clusters[0].filter((x) => x.url === 'http://b/1').length === 1);
  t('alternatives exclude self', dd.alternativesFor(idx, items[0]).every((x) => x.key !== 'a') && dd.alternativesFor(idx, items[0]).length === 2);
  const health = { b: { ok: false } };
  t('dead alternatives are deprioritised/excluded', dd.alternativesFor(dd.buildIndex(items, { health }), items[0], health).every((x) => x.key !== 'b'));
  t('movies are not deduped by default', !idx.byKey.has('f'));
  t('dedupeItems keeps one per cluster', dd.dedupeItems(items, { sourceOrder: ['s1', 's2', 's3'] }).filter((x) => /TF1/.test(x.name)).length === 1);

  /* ---------- catchup ---------- */
  const now = Date.UTC(2026, 10, 24, 12, 0, 0);
  const st = now - 3600e3, en = now - 1800e3;
  const xc = { url: 'http://host:8080/live/usr/pw/1234.ts', catchup: { type: 'xc', days: 3 } };
  const r1 = cu.buildCatchupUrl(xc, st, en, now);
  t('xtream timeshift url', r1.ok && /^http:\/\/host:8080\/timeshift\/usr\/pw\/30\/\d{4}-\d{2}-\d{2}:\d{2}-\d{2}\/1234\.ts$/.test(r1.url), r1.url);
  t('xtream without /live/ prefix', cu.buildCatchupUrl({ url: 'http://h/usr/pw/55', catchup: { type: 'xc' } }, st, en, now).url.includes('/timeshift/usr/pw/30/'));
  const ap = cu.buildCatchupUrl({ url: 'http://h/ch1.m3u8', catchup: { type: 'append', source: '?utc=${start}&lutc=${timestamp}&dur=${duration}' } }, st, en, now);
  t('append template', ap.ok && ap.url === 'http://h/ch1.m3u8?utc=' + (st / 1000) + '&lutc=' + (st / 1000) + '&dur=1800', ap.url);
  const abs = cu.buildCatchupUrl({ url: 'http://h/x', catchup: { type: 'default', source: 'http://c/{utc}/{utcend}.m3u8' } }, st, en, now);
  t('absolute template', abs.ok && abs.url === 'http://c/' + (st / 1000) + '/' + (en / 1000) + '.m3u8', abs.url);
  const sh = cu.buildCatchupUrl({ url: 'http://h/x.m3u8?a=1', catchup: { type: 'shift' } }, st, en, now);
  t('shift appends utc/lutc', sh.ok && sh.url === 'http://h/x.m3u8?a=1&utc=' + (st / 1000) + '&lutc=' + (now / 1000), sh.url);
  const fl = cu.buildCatchupUrl({ url: 'http://h/ch/index.m3u8', catchup: { type: 'flussonic' } }, st, en, now);
  t('flussonic rewrite', fl.ok && fl.url === 'http://h/ch/timeshift_abs-' + (st / 1000) + '.m3u8', fl.url);
  t('future rejected', cu.buildCatchupUrl(xc, now + 1000, now + 5000, now).reason === 'future');
  t('outside window rejected', cu.buildCatchupUrl(xc, now - 5 * 86400e3, now - 5 * 86400e3 + 1800e3, now).reason === 'outside-window');
  t('bad times rejected', !cu.buildCatchupUrl(xc, en, st, now).ok);
  t('plain url without catchup unsupported', cu.buildCatchupUrl({ url: 'http://h/a.m3u8' }, st, en, now).reason === 'unsupported');
  const ca = cu.parseCatchupAttrs({ 'catchup': 'append', 'catchup-source': '?x=${start}', 'catchup-days': '7' });
  t('parse attrs', ca && ca.type === 'append' && ca.days === 7 && ca.source === '?x=${start}');
  t('parse attrs none', cu.parseCatchupAttrs({}) === null);

  /* ---------- parental ---------- */
  const cfg = { enabled: true, keywords: ['kids-secret'], lockedGroups: ['Movies 18'] };
  const mk = (name, group) => ({ name, group, key: name });
  t('parental default keyword', pa.isRestricted(mk('Night XXX TV', 'Live'), cfg));
  t('parental arabic keyword', pa.isRestricted(mk('قناة', 'قنوات للكبار'), cfg));
  t('parental custom keyword', pa.isRestricted(mk('My kids-secret', 'Live'), cfg));
  t('parental locked group', pa.isRestricted(mk('A', 'movies 18'), cfg));
  t('parental clean item passes', !pa.isRestricted(mk('BBC One', 'UK'), cfg));
  t('parental disabled passes all', !pa.isRestricted(mk('XXX', 'adult'), { enabled: false }));
  const applied = pa.applyParental([mk('XXX', 'a'), mk('BBC', 'b')], cfg);
  t('applyParental hides', applied[0].hidden === true && !applied[1].hidden);
  const unapplied = pa.applyParental(applied, { enabled: false });
  t('applyParental restores', unapplied[0].hidden === false && !unapplied[0].parental);
  t('applyParental never unhides other hidden', pa.applyParental([{ name: 'x', group: 'y', hidden: true }], { enabled: false })[0].hidden === true);
  t('config is sanitised', pa.normalizeConfig({ enabled: 1, keywords: 'nope', lockedGroups: [1, '', 'x'.repeat(500)] }).lockedGroups.every((g) => g.length <= 80));

  /* ---------- export ---------- */
  const m3u = ex.buildM3U([{ name: 'A "x"\nB', url: 'http://h/1', group: 'G', tvgId: 'id1', logo: 'http://l/x.png', headers: { 'User-Agent': 'UA', Referer: 'http://r/' }, catchup: { type: 'append', source: '?x=${start}', days: 3 } }, { name: 'hidden', url: 'http://h/2', hidden: true }], { skipHidden: true });
  t('export format', /^#EXTM3U\n#EXTINF:-1 tvg-id="id1" tvg-logo="http:\/\/l\/x.png" group-title="G" catchup="append" catchup-source="\?x=\$\{start\}" catchup-days="3",A x B\n#EXTVLCOPT:http-user-agent=UA\n#EXTVLCOPT:http-referrer=http:\/\/r\/\nhttp:\/\/h\/1\n$/.test(m3u), JSON.stringify(m3u));
  const rt = require(path.join(__dirname, '..', 'src', 'main', 'm3u.js')).parseM3U(m3u);
  t('export round-trips through the parser', rt.length === 1 && rt[0].url === 'http://h/1' && rt[0].headers['User-Agent'] === 'UA' && rt[0].catchup && rt[0].catchup.days === 3, JSON.stringify(rt[0]));

  /* ---------- health ---------- */
  const ts = Buffer.alloc(188 * 4, 0); for (let i = 0; i < 4; i++) ts[i * 188] = 0x47;
  const srv = http.createServer((q, r) => {
    if (q.url === '/hls') { r.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' }); return r.end('#EXTM3U\n#EXT-X-VERSION:3\n'); }
    if (q.url === '/ts') { r.writeHead(200, { 'content-type': 'video/mp2t' }); return r.end(ts); }
    if (q.url === '/html') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end('<html>error</html>'); }
    if (q.url === '/404') { r.writeHead(404); return r.end('no'); }
    if (q.url === '/empty') { r.writeHead(200); return r.end(); }
    if (q.url === '/slow') { r.writeHead(200, { 'content-type': 'video/mp2t' }); return; /* never sends */ }
    r.writeHead(500); r.end();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const pr = async (p) => he.probe({ key: p, url: base + p }, { timeoutMs: 1200 });
  t('probe hls ok', (await pr('/hls')).ok === true);
  t('probe ts ok', (await pr('/ts')).kind === 'ts');
  t('probe html is dead', (await pr('/html')).reason === 'html-response');
  t('probe 404 dead', (await pr('/404')).reason === 'http-404');
  t('probe empty dead', (await pr('/empty')).ok === false);
  t('probe timeout dead', (await pr('/slow')).reason === 'timeout');
  t('probe unsupported scheme unknown', (await he.probe({ url: 'rtmp://x/y' })).ok === null);
  const scan = await he.scanItems(['/hls', '/ts', '/404', '/html'].map((p) => ({ key: p, url: base + p })), { concurrency: 2, timeoutMs: 1200 });
  t('scan stats', scan.stats.total === 4 && scan.stats.ok === 2 && scan.stats.dead === 2, JSON.stringify(scan.stats));
  const ac = new AbortController(); let seen = 0;
  const sc2 = await he.scanItems(Array.from({ length: 20 }, (_, i) => ({ key: 'k' + i, url: base + '/hls' })), { concurrency: 1, signal: ac.signal, probeFn: async () => { seen++; if (seen === 3) ac.abort(); return { ok: true }; } });
  t('scan is cancellable', sc2.stats.cancelled && sc2.stats.done === 3, JSON.stringify(sc2.stats));
  srv.close();

  /* ---------- scheduler ---------- */
  let store = []; let clock = 1000; const started = [], stopped = [];
  const s = new sc.Scheduler({ load: () => store, save: (x) => { store = x; }, now: () => clock,
    startFn: async (e) => { started.push(e.id); return { ok: true, path: '/rec/' + e.id + '.ts' }; }, stopFn: async (e) => { stopped.push(e.id); } });
  const e1 = s.add({ name: 'A', url: 'http://h/a', startAt: 2000, endAt: 5000 });
  const e2 = s.add({ name: 'B', url: 'http://h/b', startAt: 3000, endAt: 6000 });
  for (const bad of [{ url: 'file:///x', startAt: 2000, endAt: 3000 }, { url: 'http://h', startAt: 3000, endAt: 2000 }, { url: 'http://h', startAt: 1, endAt: 500 }, { url: 'http://h', startAt: 2000, endAt: 2000 + 13 * 3600e3 }]) {
    let threw = false; try { s.add(bad); } catch (_) { threw = true; } t('scheduler rejects ' + JSON.stringify(bad).slice(0, 50), threw);
  }
  await s.tick(); t('nothing starts early', started.length === 0);
  clock = 2500; await s.tick(); t('starts at start time', started.join() === e1.id && s.list()[0].state === 'recording');
  clock = 3500; await s.tick(); t('overlap becomes conflict', s.list().find((x) => x.id === e2.id).state === 'failed' && s.list().find((x) => x.id === e2.id).error === 'conflict');
  clock = 5000; await s.tick(); t('stops at end time', stopped.join() === e1.id && s.list().find((x) => x.id === e1.id).state === 'done');
  const e3 = s.add({ name: 'C', url: 'http://h/c', startAt: 6000, endAt: 7000 }); clock = 8000; await s.tick();
  t('missed when app was closed', s.list().find((x) => x.id === e3.id).state === 'missed');
  const e4 = s.add({ name: 'D', url: 'http://h/d', startAt: 9000, endAt: 12000 }); clock = 10000; await s.tick();
  t('late start inside window', s.list().find((x) => x.id === e4.id).state === 'recording');
  t('remove stops active', s.remove(e4.id) && stopped.includes(e4.id));
  // early-exit detection frees the slot
  store = []; clock = 100; let alive = true; const s2 = new sc.Scheduler({ load: () => store, save: (x) => { store = x; }, now: () => clock, startFn: async () => ({ ok: true, path: '/r/x.ts' }), stopFn: async () => {}, isActive: () => alive });
  const q1 = s2.add({ name: 'Q1', url: 'http://h/q', startAt: 200, endAt: 900 }); const q2 = s2.add({ name: 'Q2', url: 'http://h/q2', startAt: 400, endAt: 900 });
  clock = 250; await s2.tick(); alive = false; clock = 450; await s2.tick(); alive = true;
  t('early exit marks failed and frees slot', s2.list().find((x) => x.id === q1.id).error === 'stopped-early');
  clock = 460; await s2.tick(); t('next entry can start after early exit', s2.list().find((x) => x.id === q2.id).state === 'recording');
  store = [{ id: 'z', state: 'recording', endAt: 99999, startAt: 1, url: 'http://h' }]; clock = 5000; s.recoverAfterRestart();
  t('recover after restart re-queues', store[0].state === 'scheduled');

  console.log(failed ? 'PRO TESTS FAILED (' + failed + ')' : 'ALL PRO TESTS PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL crash ' + e.stack); process.exit(1); });
