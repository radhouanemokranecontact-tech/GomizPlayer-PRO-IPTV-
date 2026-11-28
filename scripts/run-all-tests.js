'use strict';
/* Runs every test declared in release.json and records a single, versioned
 * test-results file. This is the only source used by the generated reports. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const release = JSON.parse(fs.readFileSync(path.join(root, 'release.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (release.version !== pkg.version) {
  console.error(`Version mismatch: release.json=${release.version} package.json=${pkg.version}`);
  process.exit(1);
}
const runTest = (name, opts) => process.platform === 'win32'
  ? spawnSync('cmd', ['/c', 'npm', 'run', name], opts)
  : spawnSync('npm', ['run', name], opts);
const results = [];
let failed = 0;
for (const name of release.tests) {
  if (!pkg.scripts || !pkg.scripts[name]) {
    console.error(`FAIL ${name}: npm script is missing`);
    failed += 1;
    results.push({ name, ok: false, error: 'missing npm script', durationMs: 0 });
    continue;
  }
  const started = Date.now();
  const r = runTest(name, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  const durationMs = Date.now() - started;
  const out = ((r.stdout || '') + (r.stderr || '')).split(/\r?\n/).filter(Boolean);
  const ok = r.status === 0;
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} (${durationMs}ms)`);
  results.push({ name, ok, durationMs, tail: out.slice(-8), exitCode: r.status });
}
const payload = {
  version: release.version,
  generatedAt: new Date().toISOString(),
  total: results.length,
  passed: results.length - failed,
  failed,
  results
};
const outFile = path.join(root, 'docs', 'test-results.json');
fs.writeFileSync(outFile, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(`TEST_RESULTS_WRITTEN ${path.relative(root, outFile)} ${payload.passed}/${payload.total}`);
process.exitCode = failed ? 1 : 0;
