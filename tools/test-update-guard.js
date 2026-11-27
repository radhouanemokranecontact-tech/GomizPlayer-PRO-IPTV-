const fs = require('fs');
const os = require('os');
const path = require('path');
const { UpdateGuard } = require(path.join(__dirname, '..', 'src', 'main', 'update-guard.js'));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomiz-guard-'));
const g = new UpdateGuard(dir, '1.0.10');

function ok(n) { console.log('PASS ' + n); }
function fail(n) { console.log('FAIL ' + n); process.exitCode = 1; }

g.noteStartup('1.0.10');
if (g.getState().lastVersion === '1.0.10') ok('noteStartup records version'); else fail('noteStartup');

const dataFile = path.join(dir, 'gomizplayer.json');
fs.writeFileSync(dataFile, '{"settings":{}}', 'utf8');
const snap = g.snapshotBeforeUpdate(dataFile);
if (snap && fs.existsSync(snap)) ok('snapshotBeforeUpdate creates a file'); else fail('snapshotBeforeUpdate');

g.noteHealthy('1.0.10');
if (g.getState().crashes === 0) ok('noteHealthy resets crash counter'); else fail('noteHealthy');

g.noteStartup('1.0.11');
g.noteCrash('1.0.11');
g.noteCrash('1.0.11');
if (g.shouldOfferRollback()) ok('rollback offered after 2 crashes + version change'); else fail('rollback detection');

g.dismissRollback();
if (!g.shouldOfferRollback()) ok('dismiss clears rollback state'); else fail('dismissRollback');
