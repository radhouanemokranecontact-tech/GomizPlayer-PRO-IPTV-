'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { app, safeStorage } = require('electron');

function fail(msg) {
  console.error('FAIL:', msg);
  process.exitCode = 1;
}

function ok(msg) {
  console.log('PASS:', msg);
}

function createFakeXtreamServer() {
  let lastAuth = null;
  const m3u = [
    '#EXTM3U',
    '#EXTINF:-1 tvg-id="ch1" tvg-name="Channel 1" group-title="News",Channel 1',
    'http://stream.test/live/ch1.ts',
    '#EXTINF:-1 tvg-id="ch2" tvg-name="Channel 2" group-title="Sports",Channel 2',
    'http://stream.test/live/ch2.ts',
    ''
  ].join('\n');

  const server = http.createServer((req, res) => {
    try {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/get.php') {
        res.writeHead(404); res.end('not found'); return;
      }
      const username = u.searchParams.get('username') || '';
      const password = u.searchParams.get('password') || '';
      lastAuth = { username, password };
      if (username === 'testuser' && password === 'testpass123') {
        res.writeHead(200, { 'Content-Type': 'application/x-mpegurl; charset=utf-8' });
        res.end(m3u);
      } else {
        res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Unauthorized');
      }
    } catch (e) {
      res.writeHead(500); res.end(String(e && e.message || e));
    }
  });

  return {
    server,
    getLastAuth() { return lastAuth; },
    start() {
      return new Promise((resolve, reject) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          resolve({ port: addr.port, baseUrl: 'http://127.0.0.1:' + addr.port });
        });
        server.on('error', reject);
      });
    },
    stop() { return new Promise((r) => server.close(() => r())); }
  };
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.get({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers: { 'User-Agent': 'test-secrets' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) resolve({ status: res.statusCode, text: body });
        else reject(new Error('HTTP ' + res.statusCode));
      });
    });
    req.on('error', reject);
  });
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gomizplayer-test-secrets-'));
  const realDefaultUserData = path.join(app.getPath('appData'), 'gomizplayer-iptv');
  const realSmokeEpg = path.join(realDefaultUserData, 'smoke-epg.xml');
  const realSmokeEpgExistedBefore = fs.existsSync(realSmokeEpg);
  try {
    app.setPath('userData', tempRoot);

    const secrets = require('../src/main/secrets');
    const { Store } = require('../src/main/store');
    const { xtreamUrl, parseM3U } = require('../src/main/m3u');

    const store = new Store();
    secrets.init({ safeStorage, crypto, getStore: () => store, store });

    const fake = createFakeXtreamServer();
    const { baseUrl } = await fake.start();
    try {
      // 1) Add Xtream source, encrypt then decrypt then load from fake server
      const prepared = await secrets.prepareSourceSecrets({ kind: 'xtream', url: baseUrl, username: 'testuser', password: 'testpass123', name: 'Test Xtream' });
      if (!prepared.passwordEnc) throw new Error('expected passwordEnc after prepareSourceSecrets');
      if (prepared.password) throw new Error('plain password should be cleared after encryption');
      if (prepared.passwordEncV !== 2) throw new Error('expected passwordEncV 2, got ' + prepared.passwordEncV);
      const source = store.addSource(Object.assign({ kind: 'xtream', url: baseUrl, username: 'testuser', name: 'Test Xtream' }, prepared));
      if (!source || !source.id) throw new Error('failed to add source');

      const stored = (store.sources() || []).find((s) => s.id === source.id);
      if (!stored || !stored.passwordEnc) throw new Error('stored source missing passwordEnc');
      const dec = await secrets.decryptSourcePassword(stored);
      if (dec !== 'testpass123') throw new Error('decrypted password mismatch: ' + JSON.stringify(dec));

      const url = xtreamUrl(stored.url, stored.username, dec);
      const res = await fetchText(url);
      const items = parseM3U(res.text, { baseUri: res.text ? url : '' });
      const auth = fake.getLastAuth();
      if (!auth || auth.username !== 'testuser' || auth.password !== 'testpass123') {
        throw new Error('server did not see expected credentials: ' + JSON.stringify(auth));
      }
      if (!(items.length > 0)) throw new Error('expected item count > 0, got ' + items.length);
      ok('encrypt/decrypt/load with correct password (server saw testpass123, items=' + items.length + ')');

      // 2) Wrong password -> clear 401 error
      const wrongPrepared = await secrets.prepareSourceSecrets({ password: 'wrongpass' });
      const wrongDec = await secrets.decryptSourcePassword({ passwordEnc: wrongPrepared.passwordEnc, id: 'tmp-wrong' });
      const wrongUrl = xtreamUrl(baseUrl, 'testuser', wrongDec);
      let got401 = false;
      try {
        await fetchText(wrongUrl);
      } catch (e) {
        if (String(e && e.message || e).includes('401')) got401 = true;
        else throw new Error('expected 401 error for wrong password, got: ' + (e && e.message || e));
      }
      if (!got401) throw new Error('expected 401 error for wrong password');
      ok('wrong password yields clear HTTP 401 error');

      // 3) Decrypt failure -> clear error, no empty request
      let decryptFailed = false;
      try {
        await secrets.decryptSourcePassword({ id: 'bad', passwordEnc: Buffer.from('not-a-valid-secret').toString('base64') });
      } catch (e) {
        const msg = String(e && e.message || e);
        if (msg.includes('Could not decrypt saved password')) decryptFailed = true;
        else throw new Error('expected clear decrypt error, got: ' + msg);
      }
      if (!decryptFailed) throw new Error('expected decrypt failure error');
      ok('decrypt failure yields clear error (no empty password request)');

      // 4) No pollution of real userData with smoke-epg.xml
      if (app.getPath('userData') !== tempRoot) throw new Error('userData was not redirected to temp dir');
      const realSmokeEpgExistsAfter = fs.existsSync(realSmokeEpg);
      if (!realSmokeEpgExistedBefore && realSmokeEpgExistsAfter) {
        throw new Error('smoke-epg.xml appeared in real userData: ' + realSmokeEpg);
      }
      ok('no smoke-epg.xml created in real userData (existedBefore=' + realSmokeEpgExistedBefore + ', existsAfter=' + realSmokeEpgExistsAfter + ')');

    } finally {
      await fake.stop();
    }

    console.log('TEST_SECRETS_RESULT PASS');
    process.exitCode = 0;
  } catch (e) {
    console.error('TEST_SECRETS_RESULT FAIL');
    console.error(e && e.stack || e);
    process.exitCode = 1;
  } finally {
    try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch (_) {}
    try { app.exit(process.exitCode || 0); } catch (_) { process.exit(process.exitCode || 0); }
  }
}

app.whenReady().then(main).catch((e) => {
  console.error('TEST_SECRETS_RESULT FAIL');
  console.error(e && e.stack || e);
  process.exit(1);
});
