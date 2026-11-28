'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const classification = require('../src/shared/classification');
const { parseM3U } = require('../src/main/m3u');

function test(name, fn) {
  try {
    fn();
    console.log('PASS', name);
    return true;
  } catch (err) {
    console.error('FAIL', name);
    console.error(err && err.stack ? err.stack : err);
    return false;
  }
}

function eq(actual, expected, msg) {
  assert.strictEqual(actual, expected, msg || `expected ${expected} got ${actual}`);
}

let ok = true;

// Helper: classify by object
const C = (item) => classification.classifyMedia(item);

// --- Core rule: never Live solely because .m3u8 or .ts ---
ok &= test('no-live-by-m3u8-alone', () => {
  eq(C({ url: 'http://x/y/stream.m3u8' }), 'unknown');
});
ok &= test('no-live-by-ts-alone', () => {
  eq(C({ url: 'http://x/y/stream.ts' }), 'unknown');
});

// --- Live TV ---
ok &= test('live-m3u8-explicit-live-path', () => {
  eq(C({ url: 'http://host/live/user/pass/1.m3u8' }), 'live');
});
ok &= test('live-ts-explicit-live-path', () => {
  eq(C({ url: 'http://host/live/user/pass/2.ts' }), 'live');
});
ok &= test('live-stream-type-param', () => {
  eq(C({ url: 'http://host/get.php?stream_type=live&id=1&ext=m3u8' }), 'live');
});
ok &= test('live-group-m3u8', () => {
  eq(C({ group: 'Live TV', url: 'http://x/c1.m3u8', name: 'News' }), 'live');
});
ok &= test('live-group-ts', () => {
  eq(C({ group: 'قنوات', url: 'http://x/c1.ts', name: 'Canal' }), 'live');
});

// --- Movies ---
ok &= test('movie-mp4', () => { eq(C({ group: 'Movies', url: 'http://x/a.mp4' }), 'movie'); });
ok &= test('movie-m3u8-in-movies-group', () => { eq(C({ group: 'Movies', url: 'http://x/a.m3u8', name: 'Big Buck Bunny' }), 'movie'); });
ok &= test('movie-ts-in-movies-group', () => { eq(C({ group: 'VOD Movies', url: 'http://x/a.ts' }), 'movie'); });
ok &= test('movie-explicit-movie-path-m3u8', () => { eq(C({ url: 'http://host/movie/u/p/10.m3u8' }), 'movie'); });
ok &= test('movie-explicit-vod-path-ts', () => { eq(C({ url: 'http://host/vod/u/p/10.ts' }), 'movie'); });
ok &= test('movie-stream-type-param', () => { eq(C({ url: 'http://host/play?stream_type=movie&id=1&ext=m3u8' }), 'movie'); });

// --- Series ---
ok &= test('series-mp4', () => { eq(C({ group: 'Series', url: 'http://x/e1.mp4' }), 'series'); });
ok &= test('series-m3u8-in-series-group', () => { eq(C({ group: 'Series', url: 'http://x/e1.m3u8' }), 'series'); });
ok &= test('series-ts-in-series-group', () => { eq(C({ group: 'TV Series', url: 'http://x/e1.ts' }), 'series'); });
ok &= test('series-explicit-path-m3u8', () => { eq(C({ url: 'http://host/series/u/p/10.m3u8' }), 'series'); });
ok &= test('series-stream-type-param', () => { eq(C({ url: 'http://host/play?stream_type=series&id=1&ext=m3u8' }), 'series'); });

// --- Xtream styles ---
ok &= test('xtream-live-url', () => { eq(C({ url: 'http://portal/live/user/pass/12345.ts' }), 'live'); });
ok &= test('xtream-vod-url', () => { eq(C({ url: 'http://portal/movie/user/pass/12345.mkv' }), 'movie'); });
ok &= test('xtream-series-url', () => { eq(C({ url: 'http://portal/series/user/pass/12345.mp4' }), 'series'); });
ok &= test('xtream-vod-stream-type', () => { eq(C({ url: 'http://portal/get.php?username=u&password=p&type=m3u_plus&output=ts', stream_type: 'movie' }), 'movie'); });
ok &= test('xtream-series-stored-type', () => { eq(C({ url: 'http://x/unknown', contentType: 'series' }), 'series'); });

// --- Arabic / French / English categories & variations ---
ok &= test('arabic-movie-group', () => { eq(C({ group: 'أفلام أجنبية', url: 'http://x/a.m3u8' }), 'movie'); });
ok &= test('arabic-series-group', () => { eq(C({ group: 'مسلسلات تركية', url: 'http://x/s.m3u8' }), 'series'); });
ok &= test('arabic-live-group', () => { eq(C({ group: 'قنوات رياضية', url: 'http://x/l.ts' }), 'live'); });
ok &= test('french-movie-group', () => { eq(C({ group: 'Films', url: 'http://x/a.m3u8' }), 'movie'); });
ok &= test('french-series-group', () => { eq(C({ group: 'Séries', url: 'http://x/s.m3u8' }), 'series'); });
ok &= test('french-live-group', () => { eq(C({ group: 'Chaînes en direct', url: 'http://x/l.m3u8' }), 'live'); });
ok &= test('english-variations-vod', () => { eq(C({ group: 'VOD | Cinema', url: 'http://x/a.m3u8' }), 'movie'); });
ok &= test('english-series-variation', () => { eq(C({ group: 'TV Shows', url: 'http://x/s.m3u8' }), 'series'); });
ok &= test('episode-pattern-in-name', () => { eq(C({ group: 'Misc', name: 'Show S01E02', url: 'http://x/x.m3u8' }), 'series'); });

// --- Missing metadata ---
ok &= test('missing-group-tvgname-vod-ext', () => { eq(C({ url: 'http://x/movie.mp4' }), 'movie'); });
ok &= test('missing-all-but-explicit-path', () => { eq(C({ url: 'http://x/series/1.m3u8' }), 'series'); });
ok &= test('missing-metadata-stream-unknown', () => { eq(C({ url: 'http://x/stream.m3u8' }), 'unknown'); });

// --- Conflicting metadata (priority/order & safety) ---
ok &= test('conflict-url-series-over-group-live', () => { eq(C({ group: 'Live TV', url: 'http://x/series/1.m3u8' }), 'series'); });
ok &= test('conflict-url-movie-over-group-series', () => { eq(C({ group: 'Series', url: 'http://x/movie/1.m3u8' }), 'movie'); });
ok &= test('conflict-explicit-live-url-over-movie-group', () => { eq(C({ group: 'Movies', url: 'http://x/live/1.m3u8' }), 'live'); });
ok &= test('conflict-group-over-name-hint', () => { eq(C({ group: 'Movies', name: 'Episode 1', url: 'http://x/x.m3u8' }), 'movie'); });
ok &= test('ambiguous-movie-word-in-live-channel', () => {
  // avoid false positive: "Movie Channel" style live context should not become movie
  const k = C({ group: 'Live Channels', name: 'Action Movie Channel', url: 'http://x/live/1.m3u8' });
  eq(k, 'live');
});

// --- Unknown categories ---
ok &= test('unknown-category-ambiguous-stream', () => { eq(C({ group: 'Random', url: 'http://x/file.m3u8' }), 'unknown'); });
ok &= test('unknown-category-vod-ext-defaults-movie', () => { eq(C({ group: 'Random', url: 'http://x/file.mp4' }), 'movie'); });

// --- Stored explicit type (priority 5) ---
ok &= test('stored-explicit-kind-movie', () => { eq(C({ url: 'http://x/a.m3u8', kind: 'movie' }), 'movie'); });
ok &= test('stored-explicit-kind-series', () => { eq(C({ url: 'http://x/a.ts', kind: 'series' }), 'series'); });

// --- Demo playlist regressions (exact cases) ---
ok &= test('demo-playlist-classification', () => {
  const demoPath = path.join(__dirname, '..', 'sample', 'demo.m3u');
  const text = fs.readFileSync(demoPath, 'utf8');
  const items = parseM3U(text, { baseUri: 'file:///' + demoPath.replace(/\\/g, '/') });
  const find = (pred, label) => {
    const it = items.find(pred);
    assert.ok(it, 'missing item: ' + label);
    return it;
  };

  const bbbHls = find(i => i.name.includes('Big Buck Bunny') && i.name.includes('HLS'), 'Big Buck Bunny (HLS)');
  eq(bbbHls.kind, 'movie', 'Big Buck Bunny HLS in Demo Movies must be movie');
  eq(bbbHls.group, 'Demo Movies', 'Big Buck Bunny group preserved');

  const tos = find(i => i.name.includes('Tears of Steel'), 'Tears of Steel');
  eq(tos.kind, 'movie', 'Tears of Steel in Demo Movies must be movie');
  eq(tos.group, 'Demo Movies');

  const sintel = find(i => i.name.includes('Sintel') && i.group === 'Demo Movies', 'Sintel (HLS)');
  eq(sintel.kind, 'movie');

  for (const n of ['Big Buck Bunny (MP4)', 'Flower (MP4)', 'Sample Clip (MP4)']) {
    const it = find(i => i.name === n, n);
    eq(it.kind, 'movie', n + ' must be movie');
  }

  const bipbop = find(i => i.name.includes('BipBop') && i.group === 'Demo Series', 'Apple BipBop');
  eq(bipbop.kind, 'series', 'Apple BipBop in Demo Series must be classified as Series');
  eq(bipbop.group, 'Demo Series', 'BipBop group preserved');

  // all Demo Series items must be series
  const demoSeries = items.filter(i => i.group === 'Demo Series');
  assert.ok(demoSeries.length >= 1, 'expected Demo Series items');
  for (const it of demoSeries) eq(it.kind, 'series', it.name + ' in Demo Series must be series');

  // genuine live channels with M3U8 must remain Live TV
  const demoLive = items.filter(i => i.group === 'Demo Live');
  assert.ok(demoLive.length >= 1, 'expected Demo Live items');
  for (const it of demoLive) eq(it.kind, 'live', it.name + ' must remain live');
});

if (!ok) {
  console.error('SOME TESTS FAILED');
  process.exit(1);
}
console.log('ALL CLASSIFICATION TESTS PASSED');
process.exit(0);
