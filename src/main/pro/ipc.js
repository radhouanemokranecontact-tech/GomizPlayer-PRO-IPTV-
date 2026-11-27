'use strict';
/* IPC surface for GomizPlayer PRO features. All channels are prefixed `pro:` and sender-checked. */
const fsp = require('fs/promises');
const { buildIndex, alternativesFor, dedupeItems } = require('./dedupe');
const { buildCatchupUrl } = require('./catchup');
const { normalizeConfig } = require('./parental');
const { scanItems } = require('./health');
const { Scheduler } = require('./scheduler');
const { buildM3U } = require('./export');
const { applyFlags, groupsOf } = require('./flags');

const MAX_SCAN_ITEMS = 8000;
const MAX_HEALTH_ENTRIES = 100000;

function register(deps) {
  const { ipcMain, dialog, getWin, assertTrustedSender, store, readCache, writeCache, verifyAppLockPin, startRecording, stopRecording, isRecording, assertSafeUrl, appVersion } = deps;
  const guard = (fn) => async (event, payload) => { assertTrustedSender(event); return fn(payload || {}, event); };

  const healthMap = () => (readCache('health') || {});
  const flagCtx = () => {
    const s = store.settings || {};
    return { parental: s.proParental, hideDead: !!s.proHideDead, health: healthMap() };
  };

  function allItems(ctx = flagCtx()) {
    const out = [];
    for (const src of store.sources() || []) {
      const c = readCache('source-' + src.id);
      if (!c || !Array.isArray(c.items)) continue;
      for (const it of c.items) out.push(Object.assign({}, it, { sourceId: src.id }));
    }
    return applyFlags(out, ctx);
  }

  /** Re-evaluate parental/dead flags on every cached source (cheap: no network). */
  function applyFlagsToCaches() {
    const ctx = flagCtx();
    for (const src of store.sources() || []) {
      const c = readCache('source-' + src.id);
      if (!c || !Array.isArray(c.items)) continue;
      const items = applyFlags(c.items, ctx);
      writeCache('source-' + src.id, Object.assign({}, c, { items, groups: groupsOf(items) }));
    }
  }

  const sendWin = (ch, payload) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, payload); };

  /* ---------- status ---------- */
  ipcMain.handle('pro:status', guard(() => ({ version: appVersion(), features: ['health', 'failover', 'catchup', 'scheduler', 'parental', 'export'] })));

  /* ---------- health ---------- */
  let run = null;
  ipcMain.handle('pro:health:scan', guard(async ({ sourceId, concurrency, timeoutMs }) => {
    if (run) return { error: 'busy' };
    const pool = allItems().filter((i) => i.kind === 'live' && !i.hiddenBase && !i.parental && (!sourceId || sourceId === 'all' || i.sourceId === sourceId));
    const seen = new Set(); const items = [];
    for (const it of pool) { if (!seen.has(it.url)) { seen.add(it.url); items.push(it); } if (items.length >= MAX_SCAN_ITEMS) break; }
    if (!items.length) return { error: 'no-items' };
    const ctl = new AbortController();
    run = { ctl, total: items.length };
    let lastSend = 0;
    scanItems(items, {
      concurrency: Math.max(2, Math.min(16, Number(concurrency) || 8)),
      timeoutMs: Math.max(2000, Math.min(20000, Number(timeoutMs) || 8000)),
      signal: ctl.signal,
      onProgress: (p) => { const n = Date.now(); if (n - lastSend > 250 || p.done === p.total) { lastSend = n; sendWin('pro:health:progress', p); } }
    }).then(({ results, stats }) => {
      // Share the verdict with every item that has the same URL.
      const urlVerdict = new Map(items.map((it) => [it.url, results[it.key]]));
      const merged = healthMap();
      for (const it of pool) { const r = urlVerdict.get(it.url); if (r && r.ok !== null) merged[it.key] = { ok: r.ok, ms: r.ms, at: r.at, reason: r.reason || '' }; }
      const keys = Object.keys(merged);
      if (keys.length > MAX_HEALTH_ENTRIES) keys.sort((a, b) => (merged[a].at || 0) - (merged[b].at || 0)).slice(0, keys.length - MAX_HEALTH_ENTRIES).forEach((k) => delete merged[k]);
      writeCache('health', merged);
      applyFlagsToCaches();
      sendWin('pro:health:done', stats);
    }).catch((e) => sendWin('pro:health:done', { error: String(e && e.message || e) })).finally(() => { run = null; });
    return { started: true, total: items.length };
  }));
  ipcMain.handle('pro:health:cancel', guard(() => { if (run) run.ctl.abort(); return { ok: true }; }));
  ipcMain.handle('pro:health:summary', guard(({ sourceId }) => {
    const h = healthMap(); let ok = 0, dead = 0, unknown = 0, newest = 0;
    for (const it of allItems().filter((i) => i.kind === 'live' && !i.hiddenBase && !i.parental && (!sourceId || sourceId === 'all' || i.sourceId === sourceId))) {
      const r = h[it.key]; if (!r) unknown++; else if (r.ok) ok++; else dead++; if (r && r.at > newest) newest = r.at;
    }
    return { ok, dead, unknown, lastScanAt: newest, running: !!run, hideDead: !!(store.settings && store.settings.proHideDead) };
  }));
  ipcMain.handle('pro:health:setHideDead', guard(({ on }) => { store.patchSettings({ proHideDead: !!on }); applyFlagsToCaches(); return { ok: true }; }));
  ipcMain.handle('pro:health:clear', guard(() => { writeCache('health', {}); applyFlagsToCaches(); return { ok: true }; }));

  /* ---------- duplicates / failover ---------- */
  ipcMain.handle('pro:dupes:summary', guard(() => {
    const items = allItems().filter((i) => !i.hidden);
    const idx = buildIndex(items, { health: healthMap() });
    return { clusters: idx.clusters.length, redundant: idx.clusters.reduce((a, c) => a + c.length - 1, 0) + idx.sameUrl.length, live: items.filter((i) => i.kind === 'live').length };
  }));
  ipcMain.handle('pro:alternatives', guard(({ key, url }) => {
    const h = healthMap();
    const items = allItems().filter((i) => !i.hidden);
    const me = items.find((i) => i.key === key) || items.find((i) => i.url === url);
    if (!me) return { items: [] };
    const idx = buildIndex(items, { health: h, sourceOrder: (store.sources() || []).map((s) => s.id) });
    const alts = alternativesFor(idx, me, h).slice(0, 5).map((i) => ({ key: i.key, name: i.name, url: i.url, headers: i.headers || {}, kind: i.kind, group: i.group, logo: i.logo || '', tvgId: i.tvgId || '', catchup: i.catchup, sourceId: i.sourceId }));
    return { items: alts };
  }));

  /* ---------- catch-up ---------- */
  ipcMain.handle('pro:catchup:url', guard(async ({ item, start, end }) => {
    if (!item || typeof item !== 'object') return { ok: false, reason: 'no-item' };
    const r = buildCatchupUrl({ url: String(item.url || ''), catchup: item.catchup }, Number(start), Number(end), Date.now());
    if (!r.ok) return r;
    try { await assertSafeUrl(r.url, {}); } catch (_) { return { ok: false, reason: 'bad-url' }; }
    return { ok: true, url: r.url, headers: item.headers || {} };
  }));

  /* ---------- scheduler ---------- */
  const sched = new Scheduler({
    load: () => (store.data && store.data.schedules) || [],
    save: (all) => { store.data.schedules = all; store.save(); },
    startFn: (e) => startRecording({ url: e.url, headers: e.headers, name: e.name, key: e.key }, { noReplace: true }),
    stopFn: (e) => stopRecording(e.file),
    isActive: (e) => isRecording(e.file)
  });
  ipcMain.handle('pro:sched:list', guard(() => ({ items: sched.list() })));
  ipcMain.handle('pro:sched:add', guard(async (p) => {
    try {
      await assertSafeUrl(p.url, { allowRecordingProtocols: true });
      return { ok: true, entry: sched.add(p) };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }));
  ipcMain.handle('pro:sched:remove', guard(({ id }) => ({ ok: sched.remove(String(id || '')) })));
  sched.recoverAfterRestart();
  sched.start();

  /* ---------- parental ---------- */
  const lockSet = () => { const s = store.settings || {}; return !!(s.appLockHash || s.appLockPin); };
  ipcMain.handle('pro:parental:get', guard(() => ({ config: normalizeConfig((store.settings || {}).proParental), lockSet: lockSet() })));
  ipcMain.handle('pro:parental:set', guard(async (p) => {
    const cur = normalizeConfig((store.settings || {}).proParental);
    const next = normalizeConfig(p);
    const pinRequired = cur.enabled || next.enabled;
    // Enabling content filtering without an app lock makes it trivial to disable accidentally.
    if (next.enabled && !lockSet()) return { ok: false, error: 'lock-required' };
    if (pinRequired && lockSet()) {
      const v = await verifyAppLockPin(String(p.pin || ''));
      if (!v || !v.ok) return { ok: false, error: 'pin', locked: !!(v && v.locked) };
    }
    store.patchSettings({ proParental: next });
    applyFlagsToCaches();
    return { ok: true, config: next, lockSet: lockSet(), warning: (!lockSet() && next.enabled) ? 'no-pin' : '' };
  }));

  /* ---------- export ---------- */
  ipcMain.handle('pro:export:m3u', guard(async ({ sourceId, dedupe, strict }) => {
    const h = healthMap();
    let items = allItems().filter((i) => !i.hidden && (!sourceId || sourceId === 'all' || i.sourceId === sourceId));
    items = items.filter((i) => (strict ? (i.kind !== 'live' || (h[i.key] && h[i.key].ok === true)) : true));
    if (dedupe) items = dedupeItems(items, { health: h, sourceOrder: (store.sources() || []).map((s) => s.id) });
    if (!items.length) return { ok: false, error: 'empty' };
    const res = await dialog.showSaveDialog(getWin(), { title: 'Export playlist', defaultPath: 'GomizPlayer-PRO-playlist.m3u', filters: [{ name: 'M3U', extensions: ['m3u', 'm3u8'] }] });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    await fsp.writeFile(res.filePath, buildM3U(items, { skipHidden: true }), 'utf8');
    return { ok: true, path: res.filePath, count: items.length };
  }));

  return { applyFlagsToCaches, flagCtx, shutdown: () => sched.stop() };
}

module.exports = { register };
