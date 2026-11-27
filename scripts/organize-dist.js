/*
 * Keeps dist/ tidy: every build artifact goes into its own version folder.
 * Runs automatically after `npm run dist` (postdist) and can be run manually.
 * Example: dist/v1.0.8/GomizPlayer-IPTV-Setup-1.0.8.exe
 */
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(dist)) {
  console.log('[organize-dist] no dist folder, nothing to do');
  process.exit(0);
}

const keepAtRoot = new Set(['latest.yml', 'builder-debug.yml', 'app-update.yml']);
let moved = 0;

for (const name of fs.readdirSync(dist)) {
  const full = path.join(dist, name);
  if (!fs.statSync(full).isFile()) continue;       // keep folders (win-unpacked, version folders)
  if (keepAtRoot.has(name)) continue;              // metadata needed at dist root

  const match = name.match(/(\d+\.\d+\.\d+)/);
  if (!match) continue;                            // unknown file: leave it alone

  const folder = path.join(dist, 'v' + match[1]);
  fs.mkdirSync(folder, { recursive: true });
  fs.renameSync(full, path.join(folder, name));
  moved++;
}

console.log('[organize-dist] moved ' + moved + ' artifact(s) into version folders');
