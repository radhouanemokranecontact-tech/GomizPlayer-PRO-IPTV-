/* Verifies the streaming EPG parser handles entities, attributes and large input. */
const assert = require('assert');
const path = require('path');
const { parseEpg } = require(path.join(__dirname, '..', 'src', 'main', 'epg.js'));

const xml = '<tv>' +
  '<programme start="20260101120000 +0000" stop="20260101130000 +0000" channel="c1">' +
  '<title lang="en">News &amp; Weather</title><desc>A test</desc><category>News</category></programme>' +
  '<programme start="20260101130000" channel="c2"><title>Sport</title></programme>' +
  '</tv>';
const r = parseEpg(xml);
assert.strictEqual(r.length, 2);
assert.strictEqual(r[0].title, 'News & Weather');
assert.strictEqual(r[0].channel, 'c1');
assert.strictEqual(r[0].category, 'News');
console.log('PASS epg-stream-parse');

// large input (many programmes) — no catastrophic regex
const big = '<tv>' + '<programme start="20260101120000" channel="c"><title>T</title></programme>'.repeat(5000) + '</tv>';
const start = Date.now();
const bigR = parseEpg(big);
const ms = Date.now() - start;
assert.strictEqual(bigR.length, 5000);
console.log('PASS epg-stream-5000 (' + ms + 'ms)');
