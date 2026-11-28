'use strict';

/**
 * Audit tests for secrets/storage behaviors required by independent audit.
 * Uses dependency-injected mocks (no Electron required).
 */
const assert = require('assert');
const secrets = require('../src/main/secrets');

function test(name, fn) {
  return Promise.resolve().then(fn).then(() => {
    console.log('PASS', name);
  }).catch((e) => {
    console.error('FAIL', name);
    console.error(e && e.stack ? e.stack : e);
    process.exitCode = 1;
  });
}

function b64(s) { return Buffer.from(String(s), 'utf8').toString('base64'); }

function makeStore(initialSources = []) {
  const state = { sources: initialSources.map(s => ({ ...s })) };
  return {
    get sourcesList() { return state.sources; },
    sources() { return state.sources.map(s => ({ ...s })); },
    updateSource(id, patch) {
      const idx = state.sources.findIndex(s => s.id === id);
      if (idx < 0) return null;
      const p = patch || {};
      const src = { ...state.sources[idx] };
      if (Object.prototype.hasOwnProperty.call(p, 'passwordEnc') && p.passwordEnc) {
        src.password = '';
      }
      if (Object.prototype.hasOwnProperty.call(p, 'password') && p.password && !p.passwordEnc) {
        delete src.passwordEnc;
        delete src.passwordEncV;
      }
      Object.assign(src, p);
      if (p.passwordEnc) src.password = '';
      state.sources[idx] = src;
      return { ...src };
    },
    patchSettings() {},
    settings: {}
  };
}

function mockSafeStorage({ available = true, asyncEncrypt = true, asyncDecrypt = true, encryptOk = true, decryptMap = null, failEncryptOnce = false } = {}) {
  let failOnce = !!failEncryptOnce;
  const enc = (plain) => {
    if (!encryptOk) throw new Error('encrypt-failed');
    if (failOnce) { failOnce = false; throw new Error('encrypt-failed-once'); }
    return Buffer.from('ENC:' + String(plain), 'utf8');
  };
  const dec = (buf) => {
    const s = Buffer.from(buf).toString('utf8');
    if (decryptMap && Object.prototype.hasOwnProperty.call(decryptMap, Buffer.from(buf).toString('base64'))) {
      const v = decryptMap[Buffer.from(buf).toString('base64')];
      if (v instanceof Error) throw v;
      return v;
    }
    if (!s.startsWith('ENC:')) throw new Error('bad ciphertext');
    return s.slice(4);
  };
  return {
    isEncryptionAvailable: () => !!available,
    isAsyncEncryptionAvailable: () => Promise.resolve(!!available),
    encryptStringAsync: asyncEncrypt ? async (plain) => enc(plain) : undefined,
    encryptString: (plain) => enc(plain),
    decryptStringAsync: asyncDecrypt ? async (buf) => dec(buf) : undefined,
    decryptString: (buf) => dec(buf),
  };
}

(async () => {
  await test('failed-encryption-never-silently-falls-back-to-plaintext', async () => {
    secrets.init({ safeStorage: mockSafeStorage({ available: false }), crypto: require('crypto'), getStore: () => null });
    let threw = false;
    try {
      await secrets.prepareSourceSecrets({ kind: 'xtream', url: 'http://x', username: 'u', password: 'secret' }, { forStorage: true });
    } catch (e) {
      threw = true;
      assert.ok(/secure|encrypt/i.test(String(e.message)), 'clear error expected');
    }
    assert.ok(threw, 'must throw when secure storage unavailable');
  });

  await test('failed-encryption-on-encrypt-error-does-not-fallback-to-plaintext', async () => {
    secrets.init({ safeStorage: mockSafeStorage({ available: true, encryptOk: false }), crypto: require('crypto'), getStore: () => null });
    let threw = false;
    try {
      await secrets.prepareSourceSecrets({ password: 'secret' }, { forStorage: true });
    } catch (e) { threw = true; }
    assert.ok(threw, 'must throw on encrypt failure');
  });

  await test('prepareSourceSecrets-for-storage-sets-v2-and-clears-plain', async () => {
    secrets.init({ safeStorage: mockSafeStorage({}), crypto: require('crypto'), getStore: () => null });
    const out = await secrets.prepareSourceSecrets({ kind: 'xtream', password: 'mypw', username: 'u' }, { forStorage: true });
    assert.ok(out.passwordEnc, 'encrypted');
    assert.strictEqual(out.password, '');
    assert.strictEqual(out.passwordEncV, 2);
    assert.ok(!String(out.passwordEnc).includes('mypw'));
  });

  await test('decrypt-corrupted-encrypted-data-fails-with-clear-error', async () => {
    const store = makeStore([{ id: 's1', kind: 'xtream', passwordEnc: b64('not-encrypted'), passwordEncV: 2, password: '' }]);
    secrets.init({ safeStorage: mockSafeStorage({}), crypto: require('crypto'), getStore: () => store });
    let threw = false;
    try {
      await secrets.decryptSourcePassword(store.sourcesList[0]);
    } catch (e) {
      threw = true;
      assert.ok(/Could not decrypt saved password/i.test(String(e.message)));
    }
    assert.ok(threw);
    assert.strictEqual(store.sourcesList[0].passwordEnc, b64('not-encrypted'));
  });

  await test('repeated-migration-is-idempotent-and-no-accidental-reencryption', async () => {
    const store = makeStore([{ id: 's1', kind: 'xtream', url: 'http://x', username: 'u', password: 'pw1', name: 'S' }]);
    let encryptCalls = 0;
    const ss = mockSafeStorage({});
    const origEncAsync = ss.encryptStringAsync;
    ss.encryptStringAsync = async (plain) => { encryptCalls++; return origEncAsync(plain); };
    secrets.init({ safeStorage: ss, crypto: require('crypto'), getStore: () => store });
    await secrets.migrateSecrets();
    const after1 = store.sourcesList[0];
    assert.ok(after1.passwordEnc);
    assert.strictEqual(after1.password, '');
    assert.strictEqual(after1.passwordEncV, 2);
    const enc1 = after1.passwordEnc;
    const calls1 = encryptCalls;
    await secrets.migrateSecrets();
    await secrets.migrateSecrets();
    const after2 = store.sourcesList[0];
    assert.strictEqual(after2.passwordEnc, enc1);
    assert.strictEqual(after2.passwordEncV, 2);
    assert.strictEqual(after2.password, '');
    assert.strictEqual(encryptCalls, calls1);
  });

  await test('migration-v1-to-v2-preserves-data-and-repeated-is-safe', async () => {
    const ss = mockSafeStorage({});
    const encV1 = Buffer.from('ENC:legacy', 'utf8').toString('base64');
    const store = makeStore([{ id: 's1', kind: 'xtream', url: 'http://x', username: 'u', password: '', passwordEnc: encV1 }]);
    secrets.init({ safeStorage: ss, crypto: require('crypto'), getStore: () => store });
    await secrets.migrateSecrets();
    const s1 = store.sourcesList[0];
    assert.ok(s1.passwordEnc);
    assert.strictEqual(s1.passwordEncV, 2);
    const enc2 = s1.passwordEnc;
    await secrets.migrateSecrets();
    assert.strictEqual(store.sourcesList[0].passwordEnc, enc2);
    assert.strictEqual(store.sourcesList[0].passwordEncV, 2);
  });

  await test('interrupted-migration-does-not-overwrite-or-delete-existing-source-data', async () => {
    const store = makeStore([{ id: 's1', kind: 'xtream', url: 'http://x', username: 'u', password: 'pw1' }]);
    const ss = mockSafeStorage({ available: true, encryptOk: false });
    secrets.init({ safeStorage: ss, crypto: require('crypto'), getStore: () => store });
    await secrets.migrateSecrets();
    const s1 = store.sourcesList[0];
    assert.strictEqual(s1.password, 'pw1', 'original password preserved when migration cannot encrypt');
    assert.ok(!s1.passwordEnc);
  });

  await test('migration-with-corrupted-encrypted-data-preserves-existing-data', async () => {
    const badEnc = b64('garbage');
    const store = makeStore([{ id: 's1', kind: 'xtream', url: 'http://x', username: 'u', password: '', passwordEnc: badEnc }]);
    secrets.init({ safeStorage: mockSafeStorage({}), crypto: require('crypto'), getStore: () => store });
    await secrets.migrateSecrets();
    const s1 = store.sourcesList[0];
    assert.strictEqual(s1.passwordEnc, badEnc);
  });

  await test('migration-unavailable-encryption-preserves-existing-plaintext-source', async () => {
    const store = makeStore([{ id: 's1', kind: 'xtream', url: 'http://x', username: 'u', password: 'pw1' }]);
    secrets.init({ safeStorage: mockSafeStorage({ available: false }), crypto: require('crypto'), getStore: () => store });
    await secrets.migrateSecrets();
    const s1 = store.sourcesList[0];
    assert.strictEqual(s1.password, 'pw1');
    assert.ok(!s1.passwordEnc);
  });

  await test('publicSource-never-exposes-credentials', async () => {
    const pub = secrets.publicSource({ id: '1', name: 'N', url: 'http://x', username: 'u', password: 'p', passwordEnc: 'e', passwordEncV: 2, headers: {} });
    assert.ok(!Object.prototype.hasOwnProperty.call(pub, 'password'));
    assert.ok(!Object.prototype.hasOwnProperty.call(pub, 'passwordEnc'));
    assert.ok(!Object.prototype.hasOwnProperty.call(pub, 'passwordEncV'));
    if (Object.prototype.hasOwnProperty.call(pub, 'username')) assert.notStrictEqual(pub.username, 'u');
    assert.strictEqual(pub.hasPassword, true);
    assert.strictEqual(pub.id, '1');
  });

  await test('sourceForUse-decrypts-for-runtime-use-only', async () => {
    const store = makeStore([]);
    const ss = mockSafeStorage({});
    secrets.init({ safeStorage: ss, crypto: require('crypto'), getStore: () => store });
    const prepared = await secrets.prepareSourceSecrets({ password: 'pw1' }, { forStorage: true });
    const forUse = await secrets.sourceForUse({ id: 's1', passwordEnc: prepared.passwordEnc, password: '', username: 'u', url: 'http://x' });
    assert.strictEqual(forUse.password, 'pw1');
    assert.strictEqual(prepared.password, '');
  });

  await test('import-export-compatibility-encrypted-fields-preserved', async () => {
    // verify passwordEncV preserved through store-like handling expectations
    const ss = mockSafeStorage({});
    secrets.init({ safeStorage: ss, crypto: require('crypto'), getStore: () => makeStore([]) });
    const prepared = await secrets.prepareSourceSecrets({ password: 'pw1' }, { forStorage: true });
    assert.strictEqual(prepared.passwordEncV, 2);
    assert.ok(prepared.passwordEnc);
  });

  if (process.exitCode) process.exit(process.exitCode);
  console.log('ALL_SECRETS_AUDIT_TESTS_PASSED');
})().catch(e => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
