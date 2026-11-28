'use strict';
// Focused regression tests for playback-engine request configuration.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'player.js'), 'utf8');
const context = {
  window: {}, document: {}, console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  TextDecoder, URL, Map, Set, Promise, Number, String, Object, Array, Math, Date, RegExp, Error
};
vm.createContext(context);
vm.runInContext(source + '\n;globalThis.__normalizePlaybackHeaders = normalizePlaybackHeaders;', context);
const check = (name, condition, detail) => {
  console.log((condition ? 'PASS ' : 'FAIL ') + name + (condition ? '' : ' :: ' + (detail || '')));
  if (!condition) process.exitCode = 1;
};

const clean = context.__normalizePlaybackHeaders({
  'user-agent': 'GomizTest/1', Referer: 'https://example.test/', Origin: 'https://example.test',
  Authorization: 'Bearer should-not-pass', 'X-Evil': 'ok', 'X-Bad': 'a\r\nInjected: yes', 'X-Long': 'x'.repeat(2049)
});
check('header allowlist keeps supported IPTV headers', clean['User-Agent'] === 'GomizTest/1' && clean.Referer === 'https://example.test/' && clean.Origin === 'https://example.test');
check('header allowlist rejects arbitrary and injected headers', Object.keys(clean).length === 3 && !clean.Authorization && !clean['X-Evil'] && !clean['X-Bad'] && !clean['X-Long']);

let capturedSource, capturedConfig, loaded = false, errorListenerRegistered = false;
const mockPlayer = {
  on(event, fn) { if (event === 'error' && typeof fn === 'function') errorListenerRegistered = true; },
  attachMediaElement() {},
  load() { loaded = true; }
};
context.window.mpegts = {
  isSupported: () => true,
  getFeatureList: () => ({ mseLivePlayback: true }),
  Events: { ERROR: 'error' },
  createPlayer(dataSource, config) { capturedSource = dataSource; capturedConfig = config; return mockPlayer; }
};
const instance = Object.create(context.window.GomizPlayer.prototype);
instance.isLive = true;
instance.loadToken = 7;
instance.video = {};
instance.tryPlay = () => {};
instance.showError = () => {};
instance.startMpegts('https://iptv.test/live.m2ts?token=1', { Referer: 'https://ref.test/', 'X-Evil': 'no' }, 7);
check('MPEG-TS engine chooses M2TS type', capturedSource && capturedSource.type === 'm2ts');
check('MPEG-TS engine receives sanitized headers', capturedConfig && capturedConfig.headers && capturedConfig.headers.Referer === 'https://ref.test/' && !capturedConfig.headers['X-Evil']);
check('MPEG-TS error listener is attached before loading', errorListenerRegistered && loaded);

let dashModifierFactory = null, dashInitialized = false;
function DashMediaPlayer() { return { create: () => ({
  extend(name, factory) { if (name === 'RequestModifier') dashModifierFactory = factory; },
  initialize() { dashInitialized = true; },
  on() {}, reset() {}
}) }; }
DashMediaPlayer.events = { ERROR: 'error', STREAM_INITIALIZED: 'streamInitialized' };
context.window.dashjs = { MediaPlayer: DashMediaPlayer };
const dashInstance = Object.create(context.window.GomizPlayer.prototype);
dashInstance.loadToken = 9;
dashInstance.video = {};
dashInstance.setLoading = () => {};
dashInstance.updateQuality = () => {};
dashInstance.tryPlay = () => {};
dashInstance.showError = () => {};
dashInstance.startDash('https://iptv.test/live.mpd', { Referer: 'https://dash-ref.test/', 'X-Evil': 'blocked' }, true, 9);
let dashHeaders = {};
if (dashModifierFactory) {
  const modifier = dashModifierFactory();
  modifier.modifyRequestHeader({ setRequestHeader: (k, v) => { dashHeaders[k] = v; } });
}
check('DASH RequestModifier is installed before initialization', !!dashModifierFactory && dashInitialized);
check('DASH RequestModifier sets only sanitized headers', dashHeaders.Referer === 'https://dash-ref.test/' && Object.keys(dashHeaders).length === 1);

const mv = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'multiview.js'), 'utf8');
check('Multiview recognizes M2TS streams', mv.includes('(ts|m2ts|flv)'));
check('Multiview HLS forwards validated request headers', mv.includes('xhr.setRequestHeader(key, headers[key])'));
check('Multiview MPEG-TS forwards validated request headers', mv.includes('liveBufferLatencyChasing: true, headers'));
check('Multiview attaches HLS media before loading its source', mv.indexOf('hls.attachMedia(this.video)') < mv.indexOf('hls.loadSource(url)'));

check('Quick info reports DASH engine distinctly', source.includes("this.dash ? 'MPEG-DASH' : 'Native'"));
check('Playback statistics report DASH engine distinctly', source.includes("this.dash ? 'MPEG-DASH (dash.js)' : 'Native'"));
check('Multiview MPEG-TS feature detection is exception-safe', mv.includes('function mpegtsSupported()') && mv.includes('} catch (_) { return false; }'));
check('Multiview registers MPEG-TS error listener before attaching media', mv.indexOf("p.on(window.mpegts.Events.ERROR") < mv.indexOf('p.attachMediaElement(this.video)'));
console.log(process.exitCode ? 'PLAYER ENGINE CONTRACT FAILED' : 'ALL PLAYER ENGINE CONTRACT TESTS PASSED');
