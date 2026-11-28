'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'src', 'renderer', 'vendor');

const targets = [
  ['hls.js', ['dist/hls.min.js', 'dist/hls.js']],
  ['mpegts.js', ['dist/mpegts.min.js', 'dist/mpegts.js']],
  ['dashjs', ['dist/modern/umd/dash.all.min.js', 'dist/dash.all.min.js', 'dist/dash.all.debug.js', 'dist/dash.mediaplayer.min.js']]
];

fs.mkdirSync(outDir, { recursive: true });

for (const [pkg, candidates] of targets) {
  let copied = false;
  for (const rel of candidates) {
    const src = path.join(root, 'node_modules', pkg, rel);
    if (fs.existsSync(src)) {
      const name = pkg === 'hls.js' ? 'hls.min.js' : (pkg === 'mpegts.js' ? 'mpegts.min.js' : 'dash.all.min.js');
      fs.copyFileSync(src, path.join(outDir, name));
      console.log(`[vendor] ${pkg} -> ${name} (${(fs.statSync(src).size / 1024).toFixed(0)} KB)`);
      copied = true;
      break;
    }
  }
  if (!copied) {
    console.warn(`[vendor] ${pkg} not found — run npm install first`);
  }
}

const dashLicense = path.join(root, 'node_modules', 'dashjs', 'LICENSE.md');
if (fs.existsSync(dashLicense)) {
  fs.copyFileSync(dashLicense, path.join(outDir, 'dashjs-LICENSE.md'));
}
