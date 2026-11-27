/*
 * Signs latest.yml with an Ed25519 key so the manifest cannot be tampered with
 * in transit or on the release host. Companion verifier is embedded in the app.
 *
 * Usage:
 *   node scripts/sign-update-manifest.js <latest.yml> <private-key.pem>
 *
 * The canonical payload covers every integrity-critical field: version,
 * files[].url / sha512 / size / blockMapUrl, stagingPercentage, minimumSystemVersion.
 * Cosmetic fields (releaseDate, releaseNotes) are intentionally excluded.
 */
const fs = require('fs');
const crypto = require('crypto');
const yaml = require('js-yaml');

const [file, keyFile, validDays] = process.argv.slice(2);
if (!file || !keyFile) {
  console.error('usage: node scripts/sign-update-manifest.js <manifest.yml> <private-key.pem> [validDays]');
  process.exit(1);
}

const { canonicalize } = require('../src/main/manifest-verify');

function verifySignedPayload(info, signature, publicKey) {
  return crypto.verify(null, Buffer.from(canonicalize(info), 'utf8'), publicKey, Buffer.from(signature, 'base64'));
}

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
