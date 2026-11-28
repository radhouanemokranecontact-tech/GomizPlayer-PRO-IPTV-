const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { verify } = require(path.join(__dirname, '..', 'src', 'main', 'manifest-verify.js'));
const yaml = require('js-yaml');

function ok(n) { console.log('PASS ' + n); }
function fail(n) { console.log('FAIL ' + n); process.exitCode = 1; }

const dir = fs.mkdtempSync(require('os').tmpdir() + '/gomiz-sign-');
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

// Build a valid manifest and sign it with the exact same canonicalization as the tool.
const info = { version: '9.9.9', files: [{ url: 'Setup.exe', sha512: 'abc', size: 123 }] };
function canon(i) {
  const p = ['version=' + JSON.stringify(i.version), 'files=' + i.files.length];
  for (const f of i.files) p.push('file{url=' + JSON.stringify(f.url) + ',sha512=' + JSON.stringify(f.sha512) + ',size=' + JSON.stringify(f.size) + '}');
  return p.join('\n');
}
const sig = crypto.sign(null, Buffer.from(canon(info)), privateKey).toString('base64');
info.signature = sig;

if (verify(yaml.dump(info), publicKey).ok) ok('verify accepts a correctly signed manifest'); else fail('valid signature');
const tampered = JSON.parse(JSON.stringify(info)); tampered.version = '0.0.1';
if (!verify(yaml.dump(tampered), publicKey).ok) ok('verify rejects a tampered manifest'); else fail('tamper detection');
const unsigned = { version: '9.9.9', files: [{ url: 'x', sha512: 'y', size: 1 }] };
if (!verify(yaml.dump(unsigned), publicKey).ok) ok('verify rejects an unsigned manifest'); else fail('unsigned');

// ---- binding to electron-updater's actual update info (anti-swap / anti-rollback / expiry) ----
const { matchesUpdateInfo, compareVersions } = require(path.join(__dirname, '..', 'src', 'main', 'manifest-verify.js'));
const signed = { version: '2.0.0', files: [{ url: 'Setup-2.0.0.exe', sha512: 'GOOD', size: 10 }] };
const upd = (o) => Object.assign({ version: '2.0.0', files: [{ url: 'Setup-2.0.0.exe', sha512: 'GOOD', size: 10 }] }, o || {});
if (matchesUpdateInfo(signed, upd(), '1.9.9').ok) ok('binding accepts matching update'); else fail('binding accept');
if (!matchesUpdateInfo(signed, upd({ files: [{ url: 'Setup-2.0.0.exe', sha512: 'EVIL', size: 10 }] }), '1.9.9').ok) ok('binding rejects swapped sha512'); else fail('swap');
if (!matchesUpdateInfo(signed, upd({ files: [{ url: 'evil.exe', sha512: 'GOOD', size: 10 }] }), '1.9.9').ok) ok('binding rejects unsigned filename'); else fail('filename');
if (!matchesUpdateInfo(signed, upd({ version: '2.0.1' }), '1.9.9').ok) ok('binding rejects version mismatch'); else fail('version');
if (!matchesUpdateInfo(signed, upd(), '2.0.0').ok && !matchesUpdateInfo(signed, upd(), '3.0.0').ok) ok('binding rejects replay/rollback (not newer)'); else fail('rollback');
if (!matchesUpdateInfo(signed, null, '1.0.0').ok) ok('binding rejects missing update info'); else fail('null');
if (compareVersions('1.0.10', '1.0.9') > 0 && compareVersions('1.0.0', '1.0.0-beta') > 0) ok('semver compare'); else fail('semver');

const exp = { version: '9.9.9', files: [{ url: 'Setup.exe', sha512: 'abc', size: 123 }], validUntil: '2000-01-01T00:00:00Z' };
function canon2(i) { return canonNew(i); }
function canonNew(i) { return require(path.join(__dirname, '..', 'src', 'main', 'manifest-verify.js')).canonicalize(i); }
exp.signature = crypto.sign(null, Buffer.from(canon2(exp)), privateKey).toString('base64');
const rExp = verify(yaml.dump(exp), publicKey);
if (!rExp.ok && rExp.reason === 'manifest-expired') ok('verify rejects expired manifest'); else fail('expiry');
const fut = { version: '9.9.9', files: [{ url: 'Setup.exe', sha512: 'abc', size: 123 }], validUntil: '2999-01-01T00:00:00Z' };
fut.signature = crypto.sign(null, Buffer.from(canonNew(fut)), privateKey).toString('base64');
if (verify(yaml.dump(fut), publicKey).ok) ok('verify accepts unexpired manifest'); else fail('unexpired');
const tamperedExp = Object.assign({}, fut, { validUntil: '3999-01-01T00:00:00Z' });
if (!verify(yaml.dump(tamperedExp), publicKey).ok) ok('validUntil is covered by the signature'); else fail('validUntil tamper');
