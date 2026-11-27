/* Verifies the JS classification against shared fixtures (parity with Kotlin). */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const classification = require(path.join(__dirname, '..', 'src', 'shared', 'classification'));

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'classification-fixtures.json'), 'utf8'));
let ok = 0, fail = 0;
for (const c of fixtures.cases) {
  try {
    const actual = classification.classifyMedia(c.input);
    assert.strictEqual(actual, c.expected, `expected ${c.expected} got ${actual}`);
    console.log('PASS', c.name);
    ok++;
  } catch (e) {
    console.log('FAIL', c.name, '-', e.message);
    fail++;
  }
}
console.log(`PARITY_JS_RESULT ${ok}/${fixtures.cases.length}`);
if (fail) process.exitCode = 1;
