'use strict';
/*
 * Single source of truth for every release.
 *
 * release.json  -> version, date, features, fixes, artifacts
 * docs/test-results.json -> real results produced by `npm run test:all`
 *
 * This script:
 *  - refuses to run when versions or test results do not match
 *  - archives the previous version's reports
 *  - regenerates both current reports (Arabic + English)
 *  - stamps the same version/date into all published docs
 *  - writes docs/RELEASE_STATE.json tying docs, tests, date and source hash
 *  - validates UTF-8 Arabic (no mojibake) in every Markdown file
 *
 * Usage: node scripts/sync-release-docs.js [--check]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const checkOnly = process.argv.includes('--check');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, s) => fs.writeFileSync(path.join(root, p), s, 'utf8');
const fail = (msg) => { console.error('FAIL ' + msg); process.exit(1); };

const release = JSON.parse(read('release.json'));
const pkg = JSON.parse(read('package.json'));
const results = JSON.parse(read('docs/test-results.json'));

if (release.version !== pkg.version) fail(`version mismatch release.json=${release.version} package.json=${pkg.version}`);
if (results.version !== release.version) fail(`test results version ${results.version} != ${release.version}`);
if (results.total !== release.tests.length) fail(`test count ${results.total} != ${release.tests.length}`);
if (results.failed !== 0) fail(`${results.failed} test(s) failed; refusing to publish reports`);
for (const name of release.tests) {
  if (!results.results.some((r) => r.name === name)) fail(`missing result for ${name}`);
}

// --- encoding gate -------------------------------------------------------
function markdownFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'screenshots'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) markdownFiles(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}
for (const file of markdownFiles(root)) {
  const txt = fs.readFileSync(file, 'utf8');
  const mojibake = (txt.match(/[ÃØÙâðÿ]/g) || []).length;
  if (mojibake > 2) fail(`broken Arabic encoding in ${path.relative(root, file)} (${mojibake} mojibake chars)`);
}

// --- source hash ---------------------------------------------------------
function hashSources() {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(path.join(root, 'src'));
  files.sort();
  const h = crypto.createHash('sha256');
  // Normalize CRLF so local Windows and CI checkouts produce the same hash.
  for (const f of files) {
    h.update(path.relative(root, f));
    h.update(fs.readFileSync(f).toString('latin1').replace(/\r\n/g, '\n'));
  }
  return h.digest('hex');
}
let commit = '';
try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch (_) {}

// Keep a stable generation timestamp for a given version so --check is deterministic.
const statePath = path.join(root, 'docs', 'RELEASE_STATE.json');
let previousState = null;
try { previousState = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch (_) {}
const storedState = (previousState && previousState.version === release.version) ? previousState : null;
const sourceHash = hashSources();
const stamp = {
  generatedAt: storedState ? storedState.generatedAt : new Date().toISOString(),
  version: release.version,
  releaseDate: release.releaseDate,
  reviewed: release.reviewed,
  // In --check mode reuse the recorded commit so a new release commit itself
  // does not invalidate the generated docs.
  commit: checkOnly && storedState ? storedState.commit : commit,
  sourceHash,
  tests: { total: results.total, passed: results.passed, failed: results.failed, file: 'docs/test-results.json' }
};
if (checkOnly && storedState && storedState.sourceHash !== sourceHash) {
  fail(`source changed after release:sync (${storedState.sourceHash} != ${sourceHash}); run npm run release:sync`);
}

// --- report templates ----------------------------------------------------
const bullet = (arr) => arr.map((x) => '- ' + x).join('\n');
const testRows = () => results.results.map((r) => `| ${r.name} | ${r.ok ? 'PASS' : 'FAIL'} | ${r.durationMs} ms |`).join('\n');

function repairReport() {
  return `# تقرير الإصلاح والتحقق — ${release.titleAr}\n\n` +
`**الإصدار:** ${release.version} · **التاريخ:** ${release.reviewed} · **الحالة:** هذا هو التقرير الحالي الوحيد. تُؤرشف تقارير الإصدارات السابقة في \`docs/archive/reports/\` ولا تُترك في الموقع الحالي.\n\n` +
`## ملخص\n\n${release.summaryAr}\n\n` +
`### الميزات\n\n${bullet(release.featuresAr)}\n\n` +
`### الإصلاحات\n\n${bullet(release.fixesAr)}\n\n` +
`## نتائج الاختبار (مصدر واحد: \`docs/test-results.json\`)\n\n` +
`| الاختبار | النتيجة | المدة |\n|---|---|---|\n${testRows()}\n\n` +
`**المجموع:** ${results.passed}/${results.total} ناجح. وقت التوليد: ${stamp.generatedAt}.\n\n` +
`## النشر\n\n- سير CI: ${release.runUrl || '—'}\n- الإصدار: ${release.releaseUrl || '—'}\n\n` +
`## الارتباط بالمصدر\n\n- نسخة الحزمة: \`package.json\` = ${release.version}\n- ملف الإصدار: \`release.json\`\n- بصمة مجلد \`src/\`: \`${stamp.sourceHash}\`\n- حالة الإصدار وبيانات الاختبار: \`docs/RELEASE_STATE.json\` و\`docs/test-results.json\`\n\n` +
`## English\n\n${release.summaryEn}\n\n### Features\n\n${bullet(release.featuresEn)}\n\n### Fixes\n\n${bullet(release.fixesEn)}\n\n` +
`All ${results.total} declared tests passed. Previous reports are archived, never left as current.\n`;
}

function resultsReport() {
  return `# تقرير نتائج اختبار الإصدار ${release.version}\n\n` +
`**النطاق:** Windows x64 · **تاريخ المراجعة:** ${release.reviewed} · **النسخة:** ${release.version}\n\n` +
`هذا التقرير مُولَّد آلياً من \`docs/test-results.json\` و\`release.json\`؛ أي إصدار جديد يُعيد توليده ويُؤرشف هذا الملف تلقائياً.\n\n` +
`## النتائج\n\n| الاختبار | النتيجة | المدة |\n|---|---|---|\n${testRows()}\n\n` +
`**النتيجة الإجمالية:** ${results.passed}/${results.total} PASS، و${results.failed} FAIL.\n\n` +
`## البناء والأصول\n\n${bullet(release.artifactsAr)}\n\n` +
`## النشر\n\n- سير CI: ${release.runUrl || '—'}\n- الإصدار: ${release.releaseUrl || '—'}\n\n` +
`## حدود التغطية\n\n- لم يُختبر بث مزوّد IPTV فعلي؛ لا يُدّعى دعم DRM.\n- ملفات Windows غير موقّعة Authenticode.\n- بيان \`dist/latest.yml\` المحلي غير موقّع؛ البيان الموقّع يُنتَج في GitHub Actions.\n\n` +
`---\n\n# Version ${release.version} Test Results (English)\n\n` +
`Generated from \`docs/test-results.json\` and \`release.json\`. Reviewed ${release.reviewed}.\n\n` +
`| Test | Result | Duration |\n|---|---|---|\n${testRows()}\n\n` +
`**Total:** ${results.passed}/${results.total} PASS, ${results.failed} FAIL.\n\n### Assets\n\n${bullet(release.artifactsEn)}\n\n` +
`No real IPTV provider or DRM support tested. Windows binaries are not Authenticode-signed.\n`;
}

const generated = {
  'REPAIR_REPORT_AR.md': repairReport(),
  'REPORT_TEST_RESULTS_AR.md': resultsReport(),
  'docs/RELEASE_STATE.json': JSON.stringify(stamp, null, 2) + '\n'
};

if (checkOnly) {
  for (const [file, content] of Object.entries(generated)) {
    if (!fs.existsSync(path.join(root, file)) || read(file) !== content) fail(`${file} is out of date; run npm run release:sync`);
  }
  console.log(`PASS release docs in sync for v${release.version} (${results.passed}/${results.total} tests)`);
  process.exit(0);
}

// --- archive old reports, then write current ones ------------------------
const archiveDir = path.join(root, 'docs', 'archive', 'reports', 'v' + (release.previousVersion || 'previous'));
fs.mkdirSync(archiveDir, { recursive: true });
for (const name of ['REPAIR_REPORT_AR.md', 'REPORT_TEST_RESULTS_AR.md']) {
  const src = path.join(root, name);
  if (fs.existsSync(src)) {
    const dest = path.join(archiveDir, name.replace('.md', '-v' + (release.previousVersion || 'previous') + '.md'));
    if (!fs.existsSync(dest)) fs.renameSync(src, dest);
  }
}
for (const [file, content] of Object.entries(generated)) write(file, content);

// --- stamp version and date into published docs --------------------------
const stampedDocs = ['README.md', 'TECHNICAL_GUIDE.md', 'PRIVACY.md', 'ROADMAP.md', 'SECURITY_FIXES.md', 'GITHUB-SETUP.md'];
for (const name of stampedDocs) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  let txt = fs.readFileSync(p, 'utf8');
  txt = txt.replace(/2\.0\.\d+/g, release.version);
  txt = txt.replace(/20\d\d-\d\d-\d\d/g, release.reviewed);
  fs.writeFileSync(p, txt, 'utf8');
}

console.log(`PASS release docs regenerated for v${release.version}`);
console.log(`PASS reports archived to docs/archive/reports/v${release.previousVersion || 'previous'}`);
console.log(`PASS source hash ${stamp.sourceHash}`);
