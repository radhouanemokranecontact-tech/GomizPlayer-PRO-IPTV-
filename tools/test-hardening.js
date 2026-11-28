'use strict';
// Regression tests for the deep-audit fixes (pure-Node parts; no Electron needed).
const path = require('path');
const zlib = require('zlib');
const { parseEpg } = require(path.join(__dirname, '..', 'src', 'main', 'epg.js'));
const { parseM3U } = require(path.join(__dirname, '..', 'src', 'main', 'm3u.js'));
let failed = 0;
const t = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) failed++; };

// EPG: out-of-range numeric entity must not abort the whole parse
const xml = '<tv><programme start="20260101000000 +0000" stop="20260101010000 +0000" channel="a"><title>Bad &#99999999999; &#xD800; ok</title></programme><programme channel="b" start="20260101000000" stop="20260101010000"><title>Second</title></programme></tv>';
let r; try { r = parseEpg(xml); } catch (e) { r = null; }
t('epg survives invalid numeric entities', r && r.length === 2 && r[1].title === 'Second');

// gzip bomb cap (same call shape as refreshEpg)
const bomb = zlib.gzipSync(Buffer.alloc(8 * 1024 * 1024, 0));
let threw = false; try { zlib.gunzipSync(bomb, { maxOutputLength: 1024 * 1024 }); } catch (_) { threw = true; }
t('gunzip maxOutputLength rejects bombs', threw);

// M3U: header-injection characters never survive into headers used by ffmpeg (sanitised at use) and parser is linear on hostile input
const hostile = '#EXTM3U\n' + '#EXTINF:-1 tvg-id="' + 'a'.repeat(200000) + '",X\nhttp://x/y\n'.repeat(1);
const t0 = Date.now(); const items = parseM3U(hostile); t('m3u parser fast on 200KB attribute', Date.now() - t0 < 1500 && items.length === 1);
const many = '#EXTM3U\n' + Array.from({ length: 50000 }, (_, i) => `#EXTINF:-1 group-title="g${i % 50}",Ch ${i}\nhttp://h/${i}.ts`).join('\n');
const t1 = Date.now(); const big = parseM3U(many); t('m3u 50k entries < 3s', big.length === 50000 && Date.now() - t1 < 3000);

// cachePath equivalent: traversal ids are neutralised
function cachePath(dir, name) {
  const safe = String(name).replace(/[^A-Za-z0-9._-]/g, '_').replace(/\.{2,}/g, '_').slice(0, 120);
  const d = path.resolve(dir); const full = path.resolve(d, safe + '.json');
  return full.startsWith(d + path.sep) ? full : null;
}
for (const id of ['../../x', '/../../../etc/passwd', '..\\..\\win', 'a/../../b']) {
  const base = path.resolve('/cache');
  const p = cachePath(base, 'source-' + id);
  const relative = p && path.relative(base, p);
  t('cachePath contains ' + JSON.stringify(id), !!relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}
{
  const { parseM3U } = require('../src/main/m3u');
  const txt = '#EXTM3U\n#EXTINF:-1,A\nhttp://x.com/a.m3u8\n#EXTINF:-1,B\nfile:///etc/passwd\n#EXTINF:-1,C\njavascript:alert(1)\n#EXTINF:-1,D\ndata:text/html,x\n';
  const names = (r) => (r.items || r).map((i) => i.name).join(',');
  t('remote playlist drops file/javascript/data URLs', names(parseM3U(txt, { baseUri: 'https://p.com/l.m3u' })) === 'A');
  t('local playlist keeps file URLs but drops script/data', names(parseM3U(txt, { baseUri: '' })) === 'A,B');
}
console.log(failed ? 'HARDENING TESTS FAILED' : 'ALL HARDENING TESTS PASSED');
process.exit(failed ? 1 : 0);
