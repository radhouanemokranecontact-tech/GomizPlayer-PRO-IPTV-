'use strict';
/* Publishes the current version on GitHub using a single source of truth.
 * Reads release.json + docs/release-notes-v<version>.md, uploads the local
 * diagnostic artifacts (labelled -local), publishes the release (draft=false)
 * and writes the run/release URLs back into release.json for the reports.
 *
 * The official signed assets are uploaded by .github/workflows/release-draft.yml.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const releasePath = path.join(root, 'release.json');
const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
const version = release.version;
const tag = 'v' + version;
const owner = 'radhouanemokranecontact-tech';
const repo = 'GomizPlayer-PRO-IPTV-';

const cred = spawnSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n', encoding: 'utf8' });
const token = (cred.stdout || '').split(/\r?\n/).find((l) => l.startsWith('password='));
if (!token) { console.error('FAIL no GitHub credential available'); process.exit(1); }
const auth = token.slice('password='.length);
const headers = { Authorization: `Bearer ${auth}`, 'User-Agent': 'gomiz-release-sync', Accept: 'application/vnd.github+json' };
const api = (p, opts = {}) => fetch(`https://api.github.com${p}`, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
const check = (r, msg) => { if (!r.ok) throw new Error(`${msg}: HTTP ${r.status} ${r.statusText}`); return r; };

// Large uploads over Node's fetch/HTTP2 can fail with ERR_HTTP2_STREAM_ERROR.
// Use HTTP/1.1 streaming for assets; JSON API calls stay on fetch.
function uploadAsset(name, filePath) {
  return new Promise((resolve, reject) => {
    const size = fs.statSync(filePath).size;
    const target = `/repos/${owner}/${repo}/releases/${targetId}/assets?name=${encodeURIComponent(name)}`;
    const req = https.request({
      host: 'uploads.github.com', path: target, method: 'POST',
      headers: {
        Authorization: `Bearer ${auth}`, 'User-Agent': 'gomiz-release-sync',
        Accept: 'application/vnd.github+json', 'Content-Type': 'application/octet-stream',
        'Content-Length': size
      }
    }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(data));
        else reject(new Error(`upload ${name}: HTTP ${res.statusCode} ${data}`));
      });
    });
    req.on('error', reject);
    fs.createReadStream(filePath).pipe(req);
  });
}
let targetId = 0;

(async () => {
  const list = check(await api(`/repos/${owner}/${repo}/releases?per_page=20`), 'list releases');
  const releases = await list.json();
  const target = releases.find((r) => r.tag_name === tag);
  if (!target) throw new Error(`release ${tag} not found; run the release workflow first`);
  targetId = target.id;
  console.log(`found release ${tag} id=${target.id} assets=${target.assets.length}`);

  const dir = path.join(root, 'dist', 'v' + version);
  const local = [
    [`GomizPlayer-PRO-IPTV-Setup-${version}.exe`, `GomizPlayer-PRO-IPTV-Setup-${version}-local.exe`],
    [`GomizPlayer-PRO-IPTV-Portable-${version}.exe`, `GomizPlayer-PRO-IPTV-Portable-${version}-local.exe`],
    [`GomizPlayer-PRO-IPTV-Setup-${version}.exe.blockmap`, `GomizPlayer-PRO-IPTV-Setup-${version}-local.exe.blockmap`]
  ];
  const existing = new Set(target.assets.map((a) => a.name));
  for (const [src, name] of local) {
    if (existing.has(name)) { console.log(`skip existing asset ${name}`); continue; }
    const a = await uploadAsset(name, path.join(dir, src));
    console.log(`uploaded ${a.name} (${a.size} bytes)`);
  }
  const unsignedManifest = `latest-local-unsigned.yml`;
  if (!existing.has(unsignedManifest)) {
    const a = await uploadAsset(unsignedManifest, path.join(root, 'dist', 'latest.yml'));
    console.log(`uploaded ${a.name} (${a.size} bytes)`);
  }

  const notesPath = path.join(root, 'docs', `release-notes-v${version}.md`);
  if (!fs.existsSync(notesPath)) throw new Error(`missing ${notesPath}`);
  const body = fs.readFileSync(notesPath, 'utf8');
  const patched = check(await api(`/repos/${owner}/${repo}/releases/${target.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: false, body })
  }), 'publish release');
  const published = await patched.json();
  console.log(`published ${published.tag_name}: ${published.html_url}`);

  release.releaseUrl = published.html_url;
  if (process.env.RELEASE_RUN_URL) release.runUrl = process.env.RELEASE_RUN_URL;
  fs.writeFileSync(releasePath, JSON.stringify(release, null, 2) + '\n', 'utf8');
  console.log('updated release.json with release URLs');
})().catch((e) => { console.error('FAIL ' + e.message + (e.cause ? ' :: ' + (e.cause.code || e.cause.message || e.cause) : '')); process.exitCode = 1; });
