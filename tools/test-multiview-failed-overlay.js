'use strict';

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'multiview.js'), 'utf8');
const actionsRule = source.match(/\.mv-actions\s*\{([^}]*)\}/);
const overlayRule = source.match(/\.mv-overlay\s*\{([^}]*)\}/);

if (!actionsRule || !overlayRule) {
  console.error('FAIL Multiview action and error overlay styles must exist');
  process.exit(1);
}

const actionsAboveOverlay = /(?:^|;)\s*z-index\s*:\s*(\d+)/i.exec(actionsRule[1]);
const overlayZ = /(?:^|;)\s*z-index\s*:\s*(\d+)/i.exec(overlayRule[1]);
const actionsZ = actionsAboveOverlay ? Number(actionsAboveOverlay[1]) : 0;
const failedOverlayZ = overlayZ ? Number(overlayZ[1]) : 0;

if (actionsZ > failedOverlayZ) {
  console.log('PASS failed-stream actions remain above the error overlay');
} else {
  console.error('FAIL failed-stream error overlay can intercept Change/Remove clicks');
  process.exit(1);
}
