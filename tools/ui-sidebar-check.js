'use strict';
// Measures the real sidebar layout: brand top, 13 nav items centered, footer bottom.
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gomiz-sidebar-'));
const userData = path.join(tmp, 'user-data');
fs.mkdirSync(userData, { recursive: true });
fs.writeFileSync(path.join(userData, 'gomizplayer.json'), JSON.stringify({
  version: 1,
  settings: { consentShown: true, onboarded: true, welcomeDone: true, language: 'en', analyticsEnabled: false, telemetryEnabled: false, crashReportingEnabled: false },
  sources: [], library: {}, schedules: []
}));
const exe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
(async () => {
  const child = spawn(exe, [root, '--remote-debugging-port=9334', '--user-data-dir=' + userData, '--no-sandbox'], { cwd: root, stdio: 'ignore' });
  let browser;
  try {
    for (let i = 0; i < 40; i += 1) {
      try { browser = await chromium.connectOverCDP('http://127.0.0.1:9334'); break; }
      catch (_) { await new Promise((r) => setTimeout(r, 250)); }
    }
    if (!browser) throw new Error('CDP connect failed');
    let page;
    for (const ctx of browser.contexts()) for (const p of ctx.pages()) if (p.url().includes('index.html')) page = p;
    await page.waitForFunction(() => window.__novaReady === true, null, { timeout: 60000 });
    const r = await page.evaluate(() => {
      const sb = document.getElementById('sidebar').getBoundingClientRect();
      const brand = document.querySelector('.brand').getBoundingClientRect();
      const items = Array.from(document.querySelectorAll('.nav-item')).map((e) => e.getBoundingClientRect());
      const footer = document.querySelector('.sidebar-footer').getBoundingClientRect();
      const navTop = items[0].top, navBottom = items[items.length - 1].bottom;
      return {
        count: items.length,
        sidebarCenter: (sb.top + sb.bottom) / 2,
        navCenter: (navTop + navBottom) / 2,
        brandOffset: brand.top - sb.top,
        footerOffset: sb.bottom - footer.bottom,
        navTop, navBottom, sidebarTop: sb.top, sidebarBottom: sb.bottom
      };
    });
    console.log(JSON.stringify(r, null, 2));
    const shot = path.join(tmp, 'sidebar.png');
    await page.screenshot({ path: shot });
    console.log('screenshot: ' + shot);
    const ok = r.count === 13
      && Math.abs(r.navCenter - r.sidebarCenter) < 45
      && r.brandOffset < 40
      && r.footerOffset < 40;
    console.log(ok ? 'SIDEBAR_LAYOUT PASS' : 'SIDEBAR_LAYOUT FAIL');
    process.exitCode = ok ? 0 : 1;
  } catch (e) { console.error('SIDEBAR_LAYOUT_FAIL', e.message); process.exitCode = 1; }
  finally { if (browser) await browser.close().catch(() => {}); try { child.kill(); } catch (_) {} }
})();
