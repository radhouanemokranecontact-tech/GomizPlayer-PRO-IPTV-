/*
 * Signs latest.yml with an Ed25519 key so the manifest cannot be tampered with
 * in transit or on the release host. Companion verifier is embedded in the app.
 *
 * Usage:
 *   node scripts/sign-update-manifest.js <latest.yml> <private-key.pem> [validDays]
 *   npm run sign:manifest -- <private-key.pem> [validDays]
 *   UPDATE_SIGNING_PRIVATE_KEY=<pem> npm run sign:manifest
 *
 * The canonical payload covers every integrity-critical field: version,
 * files[].url / sha512 / size / blockMapUrl, stagingPercentage, minimumSystemVersion.
 * Cosmetic fields (releaseDate, releaseNotes) are intentionally excluded.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');

const [file, keyArg, validDays] = process.argv.slice(2);
const usage = 'usage: node scripts/sign-update-manifest.js <manifest.yml> <private-key.pem> [validDays]';
if (!file) { console.error(usage); process.exit(1); }

const { canonicalize } = require('../src/main/manifest-verify');

function verifySignedPayload(info, signature, publicKey) {
  return crypto.verify(null, Buffer.from(canonicalize(info), 'utf8'), publicKey, Buffer.from(signature, 'base64'));
}

let keyFile = keyArg;
let tempKeyFile = null;
if (!keyFile) {
  // Allow the documented npm script to work with the same secret CI uses.
  // The key is never stored in the repository; a temporary copy is removed below.
  const envKey = process.env.UPDATE_SIGNING_PRIVATE_KEY;
  if (!envKey || !envKey.trim()) { console.error(usage); process.exit(1); }
  keyFile = path.join(os.tmpdir(), `gomiz-update-signing-key-${process.pid}.pem`);
  fs.writeFileSync(keyFile, envKey, { encoding: 'utf8', mode: 0o600 });
  tempKeyFile = keyFile;
}

try {
  const raw = fs.readFileSync(file, 'utf8');
  const info = yaml.load(raw);
  if (!info || !info.version || !Array.isArray(info.files) || info.files.length === 0) {
    console.error('invalid manifest'); process.exit(1);
  }

  const privateKey = crypto.createPrivateKey(fs.readFileSync(keyFile));
  delete info.signature;
  delete info.signatures;
  if (validDays) info.validUntil = new Date(Date.now() + Number(validDays) * 86400000).toISOString();
  const payload = Buffer.from(canonicalize(info), 'utf8');
  const signature = crypto.sign(null, payload, privateKey).toString('base64');

  // self-check
  const pub = crypto.createPublicKey(privateKey);
  if (!verifySignedPayload(info, signature, pub)) {
    console.error('self-check failed'); process.exit(1);
  }

  info.signature = signature;
  info.signatures = [{ keyId: crypto.createHash('sha256').update(pub.export({ format: 'der', type: 'spki' })).digest('hex'), signature }];
  fs.writeFileSync(file, yaml.dump(info, { lineWidth: -1, noRefs: true }), 'utf8');
  console.log('SIGNED latest.yml | keyId=' + info.signatures[0].keyId);
} finally {
  if (tempKeyFile) {
    try { fs.unlinkSync(tempKeyFile); } catch (_) {}
  }
}
