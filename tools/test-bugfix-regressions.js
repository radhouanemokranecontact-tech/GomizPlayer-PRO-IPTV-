'use strict';
/* Regressions for bugs fixed after 2.0.2:
 *  - provider-supplied explicit media type must beat name/group guessing
 *  - profile/library keys must never pollute Object.prototype
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const Module = require('module');

let failed = 0;
const t = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) failed++; };

// --- classification -------------------------------------------------------
const C = require(path.join(__dirname, '..', 'src', 'shared', 'classification.js'));
const classify = C.classifyMedia || C.classify || ((x) => C(x));
t('explicit stream_type movie beats Live group/name hints',
  classify({ group: 'Live TV', name: 'Live at the Apollo', stream_type: 'movie' }) === 'movie');
t('explicit stream_type series beats Movies group and Episode name',
  classify({ group: 'Movies', name: 'Episode 1', stream_type: 'series' }) === 'series');
t('stored kind live beats movie group',
  classify({ group: 'Movies', name: 'Film', kind: 'live' }) === 'live');

// --- store / prototype pollution -----------------------------------------
const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') {
    return { app: { getPath: () => path.join(os.tmpdir(), 'gomiz-regression-' + process.pid) } };
  }
  return origLoad.apply(this, arguments);
};
let Store;
try {
  const mod = require(path.join(__dirname, '..', 'src', 'main', 'store.js'));
  Store = mod.Store || mod.default;
} catch (e) {
  console.error('FAIL load store: ' + e.message);
  failed++;
}
Module._load = origLoad;

if (Store) {
  const before = Object.prototype.favorites;
  const s = new Store();
  let threw = false;
  try { s.createProfile('__proto__'); } catch (_) { threw = true; }
  t('createProfile rejects reserved prototype keys', threw);

  const lib = s.library('__proto__');
  t('library(__proto__) returns the default profile',
    !!lib && lib !== Object.prototype && Array.isArray(lib.favorites));

  s.importBackup({
    version: 1,
    settings: {},
    sources: [],
    library: JSON.parse('{"__proto__":{"favorites":[{"key":"evil"}]}}')
  });
  t('importBackup ignores __proto__ library key',
    Object.prototype.favorites === before && !Object.prototype.hasOwnProperty.call(s.data.library, '__proto__'));
} else {
  t('store module available', false);
}

console.log(failed ? 'BUGFIX REGRESSIONS FAILED (' + failed + ')' : 'ALL BUGFIX REGRESSIONS PASSED');
process.exitCode = failed ? 1 : 0;
