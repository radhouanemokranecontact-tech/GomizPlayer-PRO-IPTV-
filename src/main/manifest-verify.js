/*
 * Verifies the Ed25519 signature of an update manifest (latest.yml) against
 * the public key baked into this app. Runs before electron-updater downloads
 * any artifact. Companion to scripts/sign-update-manifest.js.
 */
const crypto = require('crypto');

const EMBEDDED_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAEj8hQFvwkVqk4v6xx2HFRppWx0Oho09Jtih05uMgSJc=
-----END PUBLIC KEY-----`;

function canonicalString(v) { return JSON.stringify(String(v)); }
function canonicalize(info) {
  const parts = [];
  parts.push('version=' + canonicalString(info.version));
  if (info.stagingPercentage !== undefined) parts.push('stagingPercentage=' + JSON.stringify(Number(info.stagingPercentage)));
  if (info.minimumSystemVersion !== undefined) parts.push('minimumSystemVersion=' + canonicalString(info.minimumSystemVersion));
  if (info.validUntil !== undefined) parts.push('validUntil=' + canonicalString(info.validUntil));
  const files = Array.isArray(info.files) ? info.files : [];
  parts.push('files=' + files.length);
  for (const f of files) {
    const e = [];
    e.push('url=' + canonicalString(f.url));
    e.push('sha512=' + canonicalString(f.sha512));
    e.push('size=' + JSON.stringify(Number(f.size)));
    if (f.blockMapUrl !== undefined) e.push('blockMapUrl=' + canonicalString(f.blockMapUrl));
    parts.push('file{' + e.join(',') + '}');
  }
  return parts.join('\n');
}

function verify(manifestText, publicKeyPem) {
  let info;
  try {
    const yaml = require('js-yaml');
    info = yaml.load(manifestText);
  } catch (_) { return { ok: false, reason: 'parse-error' }; }
  if (!info || !info.version || !Array.isArray(info.files) || info.files.length === 0) {
    return { ok: false, reason: 'invalid-manifest' };
  }
  const sig = info.signature || (info.signatures && info.signatures[0] && info.signatures[0].signature);
  if (!sig) return { ok: false, reason: 'not-signed' };
  // strip signature fields before canonicalizing (same as the signer)
  delete info.signature;
  delete info.signatures;
  try {
    const key = publicKeyPem ? crypto.createPublicKey(publicKeyPem) : crypto.createPublicKey(EMBEDDED_PUBLIC_KEY);
    const valid = crypto.verify(null, Buffer.from(canonicalize(info), 'utf8'), key, Buffer.from(sig, 'base64'));
    if (!valid) return { ok: false, reason: 'bad-signature' };
    if (info.validUntil !== undefined) {
      const t = Date.parse(String(info.validUntil));
      if (!Number.isFinite(t)) return { ok: false, reason: 'bad-validUntil' };
      if (Date.now() > t) return { ok: false, reason: 'manifest-expired' };
    }
    return { ok: true, info };
  } catch (_) { return { ok: false, reason: 'key-error' }; }
}

function parseSemver(v) {
  const m = String(v || '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/);
  return m ? { n: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] || '' } : null;
}
/** >0 if a>b, <0 if a<b, 0 equal, NaN if unparsable. */
function compareVersions(a, b) {
  const x = parseSemver(a), y = parseSemver(b);
  if (!x || !y) return NaN;
  for (let i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i] - y.n[i];
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}
const base = (u) => String(u || '').split(/[?#]/)[0].split('/').pop();

/**
 * Binds a *verified* signed manifest to the update that electron-updater is about to download.
 * Without this, the signature would protect a file the updater never reads.
 * Requires: same version, strictly newer than the running app (anti-rollback),
 * and every file electron-updater will fetch must appear in the signed list with identical sha512 (+ size when present).
 */
function matchesUpdateInfo(signed, updateInfo, currentVersion) {
  if (!signed || !updateInfo) return { ok: false, reason: 'no-update-info' };
  if (String(signed.version) !== String(updateInfo.version)) return { ok: false, reason: 'version-mismatch' };
  const cmp = compareVersions(signed.version, currentVersion);
  if (!(cmp > 0)) return { ok: false, reason: 'not-newer' };
  const sf = Array.isArray(signed.files) ? signed.files : [];
  const uf = Array.isArray(updateInfo.files) ? updateInfo.files : [];
  if (!uf.length) return { ok: false, reason: 'no-files' };
  for (const f of uf) {
    const hit = sf.find((x) => base(x.url) === base(f.url) && String(x.sha512) === String(f.sha512));
    if (!hit) return { ok: false, reason: 'file-not-signed:' + base(f.url) };
    if (f.size !== undefined && Number(f.size) !== Number(hit.size)) return { ok: false, reason: 'size-mismatch' };
  }
  if (updateInfo.sha512 && !sf.some((x) => String(x.sha512) === String(updateInfo.sha512))) return { ok: false, reason: 'sha512-not-signed' };
  return { ok: true };
}

module.exports = { verify, canonicalize, matchesUpdateInfo, compareVersions, EMBEDDED_PUBLIC_KEY };
