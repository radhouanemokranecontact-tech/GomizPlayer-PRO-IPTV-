'use strict';
// Tests the REAL src/main/net-guard.js (the older test-ssrf.js tests a pasted copy).
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const ng = require(path.join(__dirname, '..', 'src', 'main', 'net-guard.js'));
let failed = 0;
const ok = (n) => console.log('PASS ' + n);
const bad = (n, e) => { failed++; console.log('FAIL ' + n + (e ? ' :: ' + e : '')); };
const t = (n, c) => (c ? ok(n) : bad(n));

(async () => {
  // address classification
  const priv = ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1',
    '::1', '::', 'fe80::1', 'fd12::1', 'fc00::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a00:1', '0:0:0:0:0:ffff:c0a8:101', '64:ff9b::7f00:1', '2002:7f00:1::1', 'ff02::1', 'localhost', 'a.localhost', 'printer.local', 'metadata.google.internal', 'x.internal', '[::1]', '127.0.0.1.'];
  for (const h of priv) t('blocks ' + h, ng.isPrivateOrLocalHostname(h));
  const pub = ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111', 'example.com', '::ffff:808:808'];
  for (const h of pub) t('allows ' + h, !ng.isPrivateOrLocalHostname(h));

  // protocol checks
  for (const u of ['file:///etc/passwd', 'ftp://x/y', 'javascript:alert(1)', 'rtmp://x/y']) {
    try { await ng.assertSafeUrl(u); bad('rejects ' + u); } catch (_) { ok('rejects ' + u); }
  }
  try { await ng.assertSafeUrl('rtmp://example.com/x', { allowRecordingProtocols: true }); ok('allows rtmp for recording'); } catch (e) { bad('allows rtmp for recording', e.message); }

  // local test servers
  const big = Buffer.alloc(5 * 1024 * 1024, 0x61);
  const srvB = http.createServer((q, r) => {
    if (q.url === '/gz') { r.writeHead(200, { 'content-encoding': 'gzip' }); return r.end(zlib.gzipSync(big)); }
    r.writeHead(200, { 'content-type': 'text/plain' }); r.end('hello');
  });
  await new Promise((r) => srvB.listen(0, '127.0.0.1', r));
  const pB = srvB.address().port;
  const srvA = http.createServer((q, r) => { r.writeHead(302, { location: `http://127.0.0.1:${pB}/` }); r.end(); });
  await new Promise((r) => srvA.listen(0, '127.0.0.1', r));
  const pA = srvA.address().port;

  // guard:'all' must refuse loopback at the first hop
  try { await ng.safeGet(`http://127.0.0.1:${pB}/`, { guard: 'all' }); bad('guard=all blocks loopback'); } catch (e) { t('guard=all blocks loopback', /Local\/private/.test(e.message)); }
  // hostname resolving to loopback is blocked at *connect* time (DNS-rebinding class)
  try { await ng.safeGet(`http://rebind.test.localhost:${pB}/`, { guard: 'all' }); bad('guard=all blocks *.localhost'); } catch (e) { ok('guard=all blocks *.localhost'); }
  // guard:'none' follows redirects and reads
  const r1 = await ng.safeGet(`http://127.0.0.1:${pA}/`, { guard: 'none' });
  const b1 = await ng.readLimited(r1.stream, 1024);
  t('guard=none follows redirect', r1.status === 200 && b1.toString() === 'hello');
  // redirect loop cap
  const srvL = http.createServer((q, r) => { r.writeHead(302, { location: '/' }); r.end(); });
  await new Promise((r) => srvL.listen(0, '127.0.0.1', r));
  try { await ng.safeGet(`http://127.0.0.1:${srvL.address().port}/`, { guard: 'none', maxRedirects: 3 }); bad('redirect loop capped'); } catch (e) { t('redirect loop capped', /Too many/.test(e.message)); }
  // decompression bomb capped while streaming
  const r2 = await ng.safeGet(`http://127.0.0.1:${pB}/gz`, { guard: 'none' });
  try { await ng.readLimited(r2.stream, 1024 * 1024); bad('gzip body capped'); } catch (e) { t('gzip body capped', /too large/.test(e.message)); }

  srvA.close(); srvB.close(); srvL.close();
  console.log(failed ? 'NET-GUARD TESTS FAILED' : 'ALL NET-GUARD TESTS PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL crash ' + e.stack); process.exit(1); });
