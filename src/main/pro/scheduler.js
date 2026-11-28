'use strict';
/*
 * Recording scheduler. Entries live in store.data.schedules and survive restarts.
 * The clock and the start/stop functions are injected so the logic is testable without Electron.
 */
const crypto = require('crypto');

const MAX_ENTRIES = 200;
const MAX_DURATION_MS = 12 * 3600 * 1000;

class Scheduler {
  constructor({ load, save, startFn, stopFn, isActive, now, tickMs, onStateChange }) {
    this.isActive = isActive || null;
    this.load = load; this.save = save; this.startFn = startFn; this.stopFn = stopFn;
    this.onStateChange = onStateChange || null;
    this.now = now || (() => Date.now());
    this.tickMs = tickMs || 15000;
    this.timer = null; this.busy = false; this.activeId = null;
  }

  list() { return (this.load() || []).slice().sort((a, b) => a.startAt - b.startAt); }

  add(input) {
    const url = String((input && input.url) || '');
    if (!/^(https?|rtmps?|rtsps?|udp):\/\//i.test(url)) throw new Error('Invalid stream URL');
    const startAt = Number(input.startAt), endAt = Number(input.endAt);
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) throw new Error('Invalid times');
    if (endAt <= startAt) throw new Error('End must be after start');
    if (endAt - startAt > MAX_DURATION_MS) throw new Error('Maximum duration is 12 hours');
    if (endAt <= this.now()) throw new Error('Time is in the past');
    const all = this.load() || [];
    if (all.filter((e) => e.state === 'scheduled' || e.state === 'recording').length >= MAX_ENTRIES) throw new Error('Too many schedules');
    const entry = {
      id: crypto.randomBytes(6).toString('hex'),
      name: String(input.name || 'Channel').slice(0, 120),
      url, headers: (input.headers && typeof input.headers === 'object') ? input.headers : {},
      key: String(input.key || '').slice(0, 80),
      startAt, endAt, state: 'scheduled', error: '', createdAt: this.now()
    };
    all.push(entry); this.save(all);
    return entry;
  }

  remove(id) {
    const all = this.load() || [];
    const e = all.find((x) => x.id === id);
    if (!e) return false;
    if (e.state === 'recording' && this.activeId === id) { try { this.stopFn(e); } catch (_) {} this.activeId = null; }
    this.save(all.filter((x) => x.id !== id));
    return true;
  }

  /** One scheduling step. Safe to call repeatedly. */
  async tick() {
    if (this.busy) return; this.busy = true;
    try {
      const all = this.load() || []; let changed = false; const now = this.now();
      for (const e of all) {
        if (e.state === 'recording') {
          if (this.isActive && this.activeId === e.id && now < e.endAt && !this.isActive(e)) {
            // ffmpeg exited early (stream dropped / stopped manually): free the slot instead of blocking later entries
            e.state = 'failed'; e.error = 'stopped-early'; this.activeId = null; changed = true;
          } else if (now >= e.endAt) { try { await this.stopFn(e); } catch (_) {} e.state = 'done'; changed = true; if (this.activeId === e.id) this.activeId = null; }
        } else if (e.state === 'scheduled') {
          if (now >= e.endAt) { e.state = 'missed'; changed = true; }
          else if (now >= e.startAt) {
            if (this.activeId) { e.state = 'failed'; e.error = 'conflict'; changed = true; continue; }
            let r; try { r = await this.startFn(e); } catch (err) { r = { error: String(err && err.message || err) }; }
            if (r && r.ok) { e.state = 'recording'; e.file = r.path || ''; this.activeId = e.id; }
            else { e.state = 'failed'; e.error = String((r && r.error) || 'start failed').slice(0, 200); }
            changed = true;
          }
        }
      }
      // keep history bounded
      const finished = all.filter((x) => x.state === 'done' || x.state === 'failed' || x.state === 'missed');
      let out = all;
      if (finished.length > 50) { const drop = new Set(finished.sort((a, b) => a.endAt - b.endAt).slice(0, finished.length - 50).map((x) => x.id)); out = all.filter((x) => !drop.has(x.id)); changed = true; }
      if (changed) {
        this.save(out);
        // Notify the renderer so a finished scheduled recording appears in the
        // Recordings list immediately, without an app restart or manual reload.
        if (this.onStateChange) {
          try { this.onStateChange(out); } catch (_) {}
        }
      }
    } finally { this.busy = false; }
  }

  start() { if (this.timer) return; this.timer = setInterval(() => { this.tick().catch(() => {}); }, this.tickMs); if (this.timer.unref) this.timer.unref(); this.tick().catch(() => {}); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  /** After a restart no recording can still be running: demote stale 'recording' entries. */
  recoverAfterRestart() {
    const all = this.load() || []; let changed = false;
    for (const e of all) if (e.state === 'recording') { e.state = this.now() >= e.endAt ? 'done' : 'scheduled'; changed = true; }
    if (changed) this.save(all);
  }
}

module.exports = { Scheduler, MAX_DURATION_MS };
