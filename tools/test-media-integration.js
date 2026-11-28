'use strict';
// Real ffmpeg + real Downloads class against local servers. Skips (exit 0) when ffmpeg-static is not installed.
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), zlib = require('zlib');
const { spawnSync, spawn } = require('child_process');
// Pick a working ffmpeg: ffmpeg-static if it can demux MPEG-TS here, else a system ffmpeg (FFMPEG_BIN overrides).
function works(bin) {
  if (!bin || !fs.existsSync(bin)) return false;
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gomiz-probe-')); const f = path.join(d, 'a.ts');
  const a = spawnSync(bin, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=64x64:rate=5', '-t', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-f', 'mpegts', f]);
  const b = a.status === 0 ? spawnSync(bin, ['-y', '-loglevel', 'error', '-i', f, '-c', 'copy', '-f', 'mpegts', path.join(d, 'b.ts')]) : { status: 1 };
  fs.rmSync(d, { recursive: true, force: true }); return b.status === 0;
}
let ffmpeg = null; const cands = [process.env.FFMPEG_BIN]; try { cands.push(require('ffmpeg-static')); } catch (_) {}
for (const p of ['/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg']) cands.push(p);
for (const c of cands) { if (works(c)) { ffmpeg = c; break; } }
if (!ffmpeg) { console.log('SKIP no working ffmpeg available'); process.exit(0); }
console.log('using ffmpeg: ' + ffmpeg);
// Make downloads.js use the verified binary in both installed and dependency-free test environments.
// Intercept the package request before loading downloads.js; require.cache alone cannot
// stub a package that is not installed in this checkout.
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'ffmpeg-static') return ffmpeg;
  return originalLoad.call(this, request, parent, isMain);
};
const { Downloads } = require(path.join(__dirname, '..', 'src', 'main', 'downloads.js'));
Module._load = originalLoad;
let failed = 0; const t = (n, c, x) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' :: ' + (x || ''))); if (!c) failed++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gomiz-media-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // test media: 3 s of video+audio as HLS (+ a plain TS)
  const hlsDir = path.join(tmp, 'hls'); fs.mkdirSync(hlsDir);
  let r = spawnSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=10', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-f', 'hls', '-hls_time', '1', '-hls_list_size', '0', path.join(hlsDir, 'index.m3u8')], { encoding: 'utf8' });
  t('test HLS generated', r.status === 0 && fs.existsSync(path.join(hlsDir, 'index.m3u8')), r.stderr && r.stderr.slice(-200));
  const big = Buffer.alloc(3 * 1024 * 1024); for (let i = 0; i < big.length; i++) big[i] = (i * 31) & 255;
  const seenHeaders = [];
  const srv = http.createServer((q, res) => {
    if (q.url.startsWith('/hls/')) {
      seenHeaders.push(q.headers);
      const f = path.join(hlsDir, path.basename(q.url));
      if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': f.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t' }); return fs.createReadStream(f).pipe(res);
    }
    if (q.url === '/evil/index.m3u8') { res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' }); return res.end('#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\nfile:///etc/passwd\n#EXT-X-ENDLIST\n'); }
    if (q.url === '/file.bin') {
      const m = /bytes=(\d+)-/.exec(q.headers.range || '');
      if (m) { const s = Number(m[1]); res.writeHead(206, { 'content-length': big.length - s, 'content-range': `bytes ${s}-${big.length - 1}/${big.length}` }); return res.end(big.slice(s)); }
      res.writeHead(200, { 'content-length': big.length }); return res.end(big);
    }
    if (q.url === '/gz.bin') { const z = zlib.gzipSync(big); res.writeHead(200, { 'content-encoding': 'gzip', 'content-length': z.length }); return res.end(z); }
    if (q.url === '/redir') { res.writeHead(302, { location: '/file.bin' }); return res.end(); }
    res.writeHead(404); res.end();
  });
  await new Promise((r2) => srv.listen(0, '127.0.0.1', r2));
  const base = 'http://127.0.0.1:' + srv.address().port;

  const store = { dir: path.join(tmp, 'data'), settings: {}, data: {}, saveSoon() {}, save() {} }; fs.mkdirSync(store.dir);
  const dl = new Downloads(store, () => {});
  const waitDone = async (rec, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms && !['Complete', 'Failed'].includes(rec.state)) await sleep(150); return rec.state; };

  // plain download (+ redirect, + gzip)
  let rec = await dl.add({ title: 'plain', url: base + '/redir' });
  t('download follows redirect and completes', (await waitDone(rec)) === 'Complete' && fs.statSync(dl.fileFor(rec)).size === big.length, rec.state + ' ' + rec.error);
  t('download content is byte-identical', fs.readFileSync(dl.fileFor(rec)).equals(big));
  rec = await dl.add({ title: 'gz', url: base + '/gz.bin' });
  t('gzip download is decoded', (await waitDone(rec)) === 'Complete' && fs.readFileSync(dl.fileFor(rec)).equals(big), rec.state + ' ' + rec.error);

  // resume from a partial file
  rec = await dl.add({ title: 'resume', url: base + '/file.bin' });
  dl.pause(rec.id); await sleep(200);
  const part = dl.partFor(rec); fs.writeFileSync(part, big.slice(0, 1000000));
  dl.resume(rec.id);
  t('resume with Range completes', (await waitDone(rec)) === 'Complete' && fs.readFileSync(dl.fileFor(rec)).equals(big), rec.state + ' ' + rec.error);

  // HLS stream download through ffmpeg with the real whitelist + CRLF headers
  rec = await dl.add({ title: 'hls', url: base + '/hls/index.m3u8', stream: true, headers: { 'User-Agent': 'GomizTest/1', Referer: 'http://ref.example/', 'X-Evil': 'a\r\nInjected: 1' } });
  const st = await waitDone(rec, 60000);
  t('HLS download via ffmpeg completes', st === 'Complete' && fs.statSync(dl.fileFor(rec)).size > 1000, st + ' ' + rec.error);
  const h = seenHeaders[0] || {};
  t('custom headers arrive as separate header lines', h['user-agent'] === 'GomizTest/1' && h['referer'] === 'http://ref.example/', JSON.stringify(h));
  t('header injection is neutralised', !('injected' in h), JSON.stringify(h));
  const probe = spawnSync(ffmpeg, ['-i', dl.fileFor(rec)], { encoding: 'utf8' });
  t('output mp4 has video+audio', /Video: h264/.test(probe.stderr) && /Audio: aac/.test(probe.stderr));

  // whitelist blocks local-file exfiltration via a hostile remote playlist
  rec = await dl.add({ title: 'evil', url: base + '/evil/index.m3u8', stream: true });
  const st2 = await waitDone(rec, 30000);
  const outFile = dl.fileFor(rec);
  const leaked = fs.existsSync(outFile) && fs.statSync(outFile).size > 0 && fs.readFileSync(outFile).includes('root:');
  t('hostile playlist cannot read local files', st2 === 'Failed' && !leaked && /protocol|not on whitelist|Invalid data|Error opening/i.test(rec.error), st2 + ' ' + rec.error);

  // recording-style invocation (same args as main.js startRecordingCore) writes a valid TS
  const out = path.join(tmp, 'rec.ts');
  const hdrs = ['User-Agent: GomizTest/2', 'Referer: http://r2/'].map((x) => x + '\r\n').join('');
  const p = spawn(ffmpeg, ['-headers', hdrs, '-y', '-nostdin', '-protocol_whitelist', 'http,https,tcp,tls,crypto', '-rw_timeout', '30000000', '-i', base + '/hls/index.m3u8', '-c', 'copy', '-f', 'mpegts', out], { stdio: 'ignore' });
  await new Promise((res) => p.on('exit', res));
  t('recording args produce a TS file', fs.existsSync(out) && fs.statSync(out).size > 1000 && fs.readFileSync(out)[0] === 0x47);
  t('recording sent both headers', seenHeaders.some((x) => x['user-agent'] === 'GomizTest/2' && x.referer === 'http://r2/'));

  srv.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failed ? 'MEDIA INTEGRATION FAILED' : 'ALL MEDIA INTEGRATION TESTS PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL crash ' + e.stack); process.exit(1); });
