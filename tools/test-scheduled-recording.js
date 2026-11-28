'use strict';
// Real-app scheduled recording integration test.
// Launches Electron with an isolated user-data-dir, connects over CDP, schedules
// a short recording from a local TS stream, and inspects scheduler state, the
// recording file and the renderer's Recordings list — without restarting.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
let failed = 0;
const t = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' :: ' + JSON.stringify(extra))); if (!cond) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const ffmpeg = require('ffmpeg-static');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gomiz-sched-'));
  const tsPath = path.join(tmp, 'feed.ts');
  const gen = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15',
    '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '50', '-c:v', 'mpeg2video', '-c:a', 'mp2', '-f', 'mpegts', tsPath]);
  if (gen.status !== 0) throw new Error('ffmpeg generation failed: ' + gen.stderr.toString());
  // Stream in real time (-re) so ffmpeg stays alive for the whole window.
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'video/mp2t' });
    const feeder = spawn(ffmpeg, ['-re', '-i', tsPath, '-c', 'copy', '-f', 'mpegts', 'pipe:1'], { stdio: ['ignore', 'pipe', 'ignore'] });
    feeder.stdout.pipe(res);
    req.on('close', () => { try { feeder.kill(); } catch (_) {} });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/live.ts';

  const userData = path.join(tmp, 'user-data');
  fs.mkdirSync(userData, { recursive: true });
  // Skip first-run onboarding so the renderer reaches a ready state immediately.
  fs.writeFileSync(path.join(userData, 'gomizplayer.json'), JSON.stringify({
    version: 1,
    settings: { consentShown: true, onboarded: true, welcomeDone: true, language: 'en', autoNext: false, analyticsEnabled: false, telemetryEnabled: false, crashReportingEnabled: false },
    sources: [], library: {}, schedules: []
  }));
  const exe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
  const child = spawn(exe, [root, '--remote-debugging-port=9333', '--user-data-dir=' + userData, '--no-sandbox'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let appLog = '';
  child.stdout.on('data', (d) => { appLog += d.toString(); });
  child.stderr.on('data', (d) => { appLog += d.toString(); });

  let browser;
  try {
    for (let i = 0; i < 40; i += 1) {
      try { browser = await chromium.connectOverCDP('http://127.0.0.1:9333'); break; }
      catch (_) { await sleep(250); }
    }
    if (!browser) throw new Error('could not connect to Electron CDP');
    const contexts = browser.contexts();
    let page = null;
    for (const ctx of contexts) for (const p of ctx.pages()) if (p.url().includes('index.html')) page = p;
    if (!page) page = contexts[0].pages()[0];
    await page.waitForFunction(() => window.__novaReady === true && !!(window.api && window.api.pro), null, { timeout: 60000 });

    // Scheduler ticks every 15 s; keep the window wide enough for several ticks.
    const startAt = Date.now() + 2000;
    const endAt = startAt + 40000;
    const added = await page.evaluate(({ url, startAt, endAt }) => window.api.pro.sched.add({ name: 'SchedTest', url, startAt, endAt }), { url, startAt, endAt });
    t('schedule accepted', !!(added && added.ok && added.entry && added.entry.id), added);

    const getEntry = async () => {
      const l = await page.evaluate(() => window.api.pro.sched.list());
      return l && l.items && l.items.find((x) => x.name === 'SchedTest');
    };
    let during = null;
    for (let i = 0; i < 90; i += 1) {
      during = await getEntry();
      if (during && during.state !== 'scheduled') break;
      await sleep(1000);
    }
    t('recording started on schedule', !!during && during.state === 'recording' && !!during.file, during);

    let after = during;
    for (let i = 0; i < 70; i += 1) {
      after = await getEntry();
      if (after && after.state !== 'recording') break;
      await sleep(1000);
    }
    t('scheduler marks entry done', !!after && after.state === 'done', after);

    const files = await page.evaluate(() => window.api.recording.list());
    const rec = Array.isArray(files) ? files.find((f) => f.name.includes('SchedTest')) : null;
    t('file exists in recording folder without restart', !!rec && rec.size > 0, { files: files && files.map((f) => [f.name, f.size]), rec });

    const ui = await page.evaluate(async () => {
      window.__novaTest.navigate('recordings');
      await new Promise((r) => setTimeout(r, 400));
      return { cached: (window.__novaTest.state.recordings || []).length, labels: document.getElementById('view').innerText.slice(0, 400) };
    });
    t('Recordings page shows the new file without restart', ui.cached > 0 && /SchedTest/.test(ui.labels), ui);

    // Confirm ffmpeg really stopped at the scheduled end (file size stable).
    const size1 = rec && rec.size;
    await sleep(1200);
    const files2 = await page.evaluate(() => window.api.recording.list());
    const rec2 = Array.isArray(files2) ? files2.find((f) => f.name.includes('SchedTest')) : null;
    t('recording stopped at end time', !!rec2 && rec2.size === size1, { size1, size2: rec2 && rec2.size });

    t('no app errors', !/Error occurred in handler|UnhandledPromiseRejection/.test(appLog), appLog.slice(-500));
  } catch (e) {
    t('test harness completed', false, String(e && e.message || e));
  } finally {
    if (browser) { try { await browser.close(); } catch (_) {} }
    try { child.kill(); } catch (_) {}
    server.close();
  }
  console.log(failed ? 'SCHEDULED RECORDING TESTS FAILED (' + failed + ')' : 'ALL SCHEDULED RECORDING TESTS PASSED');
  process.exitCode = failed ? 1 : 0;
})();
