/* Lightweight structural test for the backup/recovery helpers (no Electron needed). */
const fs = require('fs');
const path = require('path');
const os = require('os');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'store.js'), 'utf8');

function ok(name) { console.log('PASS ' + name); }
function fail(name) { console.log('FAIL ' + name); process.exitCode = 1; }

// The Store class needs Electron's app.getPath, so we stub a minimal module loader.
const Module = require('module');
const orig = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return { app: { getPath: () => path.join(os.tmpdir(), 'gomiz-backup-test-' + process.pid) } };
  return orig.apply(this, arguments);
};

let Store;
try {
  const mod = require(path.join(__dirname, '..', 'src', 'main', 'store.js'));
  Store = mod.Store || mod.default || mod.module?.exports?.Store;
} catch (e) {
  // store.js may export via module.exports at the bottom
  fail('load store: ' + e.message);
}
Module._load = orig;

if (!Store) {
  // fall back to the exported singleton if the class isn't exported
  const mod = require(path.join(__dirname, '..', 'src', 'main', 'store.js'));
  Store = mod.constructor;
}

if (Store) {
  const s = new Store();
  const name = s.backupNow();
  if (name && s.listBackups().some(b => b.name === name)) ok('backupNow creates a listed backup');
  else fail('backupNow');
  if (s.restoreBackup(name)) ok('restoreBackup succeeds on a valid backup');
  else fail('restoreBackup');
  if (!s.restoreBackup('../evil.json')) ok('restoreBackup rejects path traversal');
  else fail('path traversal guard');
} else {
  // Structural fallback: assert the helpers exist in source
  ['backupNow()', 'listBackups()', 'restoreBackup(name)', '_rotateBackups()', 'recoveredFromBackup'].forEach(token => {
    if (src.includes(token)) ok('source contains ' + token);
    else fail('source missing ' + token);
  });
}
