'use strict';

let deps = {
  safeStorage: null,
  crypto: null,
  getStore: () => null,
};

let warnedSyncEncryptFallback = false;
let warnedSyncDecryptFallback = false;

function init({ safeStorage, crypto, getStore, store } = {}) {
  if (safeStorage) deps.safeStorage = safeStorage;
  if (crypto) deps.crypto = crypto;
  if (typeof getStore === 'function') deps.getStore = getStore;
  else if (store) deps.getStore = () => store;
}

async function canEncryptSecrets() {
  const { safeStorage } = deps;
  try {
    if (safeStorage && typeof safeStorage.isAsyncEncryptionAvailable === 'function') {
      const v = safeStorage.isAsyncEncryptionAvailable();
      return (v && typeof v.then === 'function') ? !!(await v) : !!v;
    }
    if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function') {
      return !!safeStorage.isEncryptionAvailable();
    }
  } catch (_) {}
  return false;
}

function secureStorageUnavailableError() {
  const err = new Error('Secure credential storage is unavailable on this system. Credentials were not saved. Please enable your system keychain/credential protection and try again.');
  err.code = 'SECURE_STORAGE_UNAVAILABLE';
  err.userMessage = err.message;
  return err;
}

async function encryptSecret(plain, { requireEncryption = false } = {}) {
  const { safeStorage } = deps;
  const text = String(plain || '');
  if (!text) return '';
  if (!(await canEncryptSecrets())) {
    if (requireEncryption) throw secureStorageUnavailableError();
    // legacy best-effort path (non-storage-critical) - do not silently store plaintext
    console.warn('[security] safeStorage unavailable and encryption not required by caller');
    return '';
  }
  try {
    if (safeStorage && typeof safeStorage.encryptStringAsync === 'function') {
      const buf = await safeStorage.encryptStringAsync(text);
      return Buffer.from(buf).toString('base64');
    }
    if (safeStorage && typeof safeStorage.encryptString === 'function') {
      if (!warnedSyncEncryptFallback) {
        warnedSyncEncryptFallback = true;
        console.warn('[security] encryptStringAsync unavailable, using sync encrypt fallback');
      }
      return safeStorage.encryptString(text).toString('base64');
    }
  } catch (e) {
    console.warn('[security] encrypt failed', e && e.message);
    if (requireEncryption) {
      const err = new Error('Failed to securely encrypt credentials. Credentials were not saved.');
      err.code = 'ENCRYPT_FAILED';
      err.userMessage = err.message;
      throw err;
    }
  }
  if (requireEncryption) throw secureStorageUnavailableError();
  return '';
}

async function decryptSourcePassword(source) {
  const { safeStorage } = deps;
  const store = deps.getStore ? deps.getStore() : null;
  const enc = source && source.passwordEnc;
  if (enc) {
    let plain = '';
    try {
      if (safeStorage && typeof safeStorage.decryptStringAsync === 'function') {
        const dec = await safeStorage.decryptStringAsync(Buffer.from(String(enc), 'base64'));
        if (typeof dec === 'string') {
          plain = dec;
        } else if (dec && typeof dec === 'object' && typeof dec.result === 'string') {
          plain = dec.result;
          if (dec.shouldReEncrypt && source && source.id && store && typeof store.updateSource === 'function') {
            try {
              const newEnc = await encryptSecret(plain);
              if (newEnc) store.updateSource(source.id, { passwordEnc: newEnc, password: '', passwordEncV: 2 });
            } catch (_) {}
          }
        } else {
          throw new Error('Unexpected decrypt result');
        }
        if (typeof plain === 'string') return plain;
      }
    } catch (e) {
      // async path failed; try sync fallback for legacy data before giving up
      console.warn('[security] async decrypt failed, trying sync fallback', e && e.message);
    }
    try {
      if (safeStorage && typeof safeStorage.decryptString === 'function') {
        if (!warnedSyncDecryptFallback) {
          warnedSyncDecryptFallback = true;
          console.warn('[security] using sync decrypt fallback for legacy encrypted data');
        }
        plain = safeStorage.decryptString(Buffer.from(String(enc), 'base64'));
        if (typeof plain === 'string') return plain;
      }
    } catch (e) { console.warn('[security] sync decrypt fallback failed', e && e.message); }
    const err = new Error('Could not decrypt saved password; please re-enter it');
    err.code = 'DECRYPT_FAILED';
    throw err;
  }
  // Legacy/plaintext credential (preserved for compatibility/migration). Do not write new plaintext credentials.
  return String((source && source.password) || '');
}

async function prepareSourceSecrets(input, { forStorage = true } = {}) {
  const out = Object.assign({}, input || {});
  const plain = String(out.password || '');
  if (plain) {
    if (forStorage) {
      const enc = await encryptSecret(plain, { requireEncryption: true });
      out.passwordEnc = enc;
      out.password = '';
      out.passwordEncV = 2;
    } else {
      const enc = await encryptSecret(plain);
      if (enc) { out.passwordEnc = enc; out.password = ''; out.passwordEncV = 2; }
      else { out.password = plain; delete out.passwordEnc; delete out.passwordEncV; }
    }
  } else if (Object.prototype.hasOwnProperty.call(out, 'password') && !plain) {
    out.password = '';
  }
  // never leave username/password in logs via returned objects; callers should be careful
  return out;
}

function publicSource(s) {
  if (!s || typeof s !== 'object') return s;
  const o = Object.assign({}, s);
  const has = !!(o.passwordEnc || o.password || o.username);
  delete o.password;
  delete o.passwordEnc;
  delete o.passwordEncV;
  o.hasPassword = has;
  if (o.username) o.username = '***';
  return o;
}

async function sourceForUse(s) {
  if (!s) return s;
  return Object.assign({}, s, { password: await decryptSourcePassword(s) });
}

async function migrateSecrets() {
  const { safeStorage } = deps;
  const store = deps.getStore ? deps.getStore() : null;
  if (!store) return;
  let canEnc = false;
  try { canEnc = await canEncryptSecrets(); } catch (_) { canEnc = false; }
  try {
    const sources = store.sources() || [];
    for (const src of sources) {
      try {
        if (src && src.kind === 'xtream' && src.password && !src.passwordEnc) {
          if (canEnc) {
            const enc = await encryptSecret(src.password);
            if (enc) store.updateSource(src.id, { passwordEnc: enc, password: '', passwordEncV: 2 });
          } else {
            // Preserve existing saved source (no data loss). Do not silently re-save as plaintext; inform via log.
            console.warn('[security] secure storage unavailable; existing Xtream credentials remain in legacy storage until secure encryption is available');
          }
        } else if (src && src.kind === 'xtream' && src.passwordEnc && (!src.passwordEncV || src.passwordEncV < 2)) {
          let plain = null;
          try {
            if (safeStorage && typeof safeStorage.decryptStringAsync === 'function') {
              const dec = await safeStorage.decryptStringAsync(Buffer.from(String(src.passwordEnc), 'base64'));
              if (typeof dec === 'string') plain = dec;
              else if (dec && typeof dec === 'object' && typeof dec.result === 'string') plain = dec.result;
            }
          } catch (_) {}
          if (plain == null) {
            try {
              if (safeStorage && typeof safeStorage.decryptString === 'function') {
                if (!warnedSyncDecryptFallback) {
                  warnedSyncDecryptFallback = true;
                  console.warn('[security] migration: using sync decrypt fallback for legacy encrypted data');
                }
                const dec = safeStorage.decryptString(Buffer.from(String(src.passwordEnc), 'base64'));
                if (typeof dec === 'string') plain = dec;
              }
            } catch (_) {}
          }
          if (typeof plain === 'string' && canEnc) {
            let newEnc = '';
            try {
              if (safeStorage && typeof safeStorage.encryptStringAsync === 'function') {
                const buf = await safeStorage.encryptStringAsync(plain);
                newEnc = Buffer.from(buf).toString('base64');
              } else {
                newEnc = await encryptSecret(plain);
              }
            } catch (_) { newEnc = ''; }
            if (newEnc) store.updateSource(src.id, { passwordEnc: newEnc, password: '', passwordEncV: 2 });
          }
          // if cannot decrypt or cannot re-encrypt, preserve existing data (no loss/invalidation)
        }
      } catch (e) {
        console.warn('[security] source migration skipped for source', src && src.id, e && e.message);
      }
    }
  } catch (e) { console.warn('[security] source migration failed', e && e.message); }
  try {
    const st = store.settings || {};
    const { crypto } = deps;
    if (st.appLockPin && !(st.appLockHash && st.appLockSalt) && crypto) {
      const salt = crypto.randomBytes(16);
      const hash = crypto.scryptSync(String(st.appLockPin), salt, 64);
      store.patchSettings({ appLockHash: hash.toString('base64'), appLockSalt: salt.toString('base64'), appLockPin: '' });
    } else if (st.appLockPin) {
      store.patchSettings({ appLockPin: '' });
    }
  } catch (e) { console.warn('[security] pin migration failed', e && e.message); }
}

module.exports = {
  init,
  canEncryptSecrets,
  encryptSecret,
  decryptSourcePassword,
  prepareSourceSecrets,
  publicSource,
  sourceForUse,
  migrateSecrets,
};
