'use strict';
/* Publishes the current version on GitHub using a single source of truth.
 * Reads release.json + docs/release-notes-v<version>.md, publishes the release
 * (draft=false) and writes the run/release URLs back into release.json.
 *
 * IMPORTANT: all installable assets are uploaded by ONE GitHub Actions step in
 * .github/workflows/release-draft.yml so they share a single upload timestamp.
 * Local diagnostic builds are verified locally only — attaching them later
 * would create mixed timestamps, which the project no longer allows.
 */
const fs = require('fs');
const path = require('path');
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

(async () => {
  const list = check(await api(`/repos/${owner}/${repo}/releases?per_page=20`), 'list releases');
  const releases = await list.json();
  const target = releases.find((r) => r.tag_name === tag);
  if (!target) throw new Error(`release ${tag} not found; run the release workflow first`);
  console.log(`found release ${tag} id=${target.id} assets=${target.assets.length}`);
  const timestamps = new Set(target.assets.map((a) => a.created_at));
  if (timestamps.size > 1) console.warn(`WARNING assets have ${timestamps.size} different upload timestamps`);

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
