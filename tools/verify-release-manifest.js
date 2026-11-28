'use strict';

const fs = require('fs');
const path = require('path');
const { verify } = require('../src/main/manifest-verify');

const file = path.resolve(process.argv[2] || 'dist/latest.yml');
let result;
try { result = verify(fs.readFileSync(file, 'utf8')); }
catch (error) {
  console.error('FAIL cannot read release manifest:', error.message);
  process.exit(1);
}

if (!result.ok) {
  console.error('FAIL release manifest signature:', result.reason);
  process.exit(1);
}

console.log('PASS release manifest signature v' + result.info.version);
