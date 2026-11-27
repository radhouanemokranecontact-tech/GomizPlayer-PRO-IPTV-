'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { pipeline } = require('stream/promises');
const { safeGet, isPrivateOrLocalHostname } = require('./net-guard');
let ffmpegPath = null;
try { ffmpegPath = require('ffmpeg-static'); } catch (_) { ffmpegPath = null; }
// Resolve to the unpacked location when running inside an asar archive
if (ffmpegPath && ffmpegPath.includes('app.asar')) {
  ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
}
// Verify the path actually exists on disk
if (ffmpegPath && !require('fs').existsSync(ffmpegPath)) {
  ffmpegPath = null;
}

const MAX_ACTIVE = 2;

class Downloads {
  constructor(store, onUpdate) {
    this.store = store;
    this.onUpdate = onUpdate || (() => {});
    this.legacyDir = path.join(store.dir, 'downloads');
    this.file = path.join(store.dir, 'downloads.json');
    this.active = new Map();
    this.queue = [];
    this.timer = null;
    this._saveTimer = null;
    this.records = this.load();
    this.ensureDir();
    let resumed = false;
    for (const rec of this.list()) {
      if (rec.state === 'Downloading' || rec.state === 'Waiting') {
        rec.state = 'Waiting';
        resumed = true;
      }
    }
    if (resumed) {
      this.persistNow();
      setTimeout(() => this.pump(), 500);
    }
  }

  load() {
    try {
      if (fs.existsSync(this.file)) {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (Array.isArray(raw)) return raw;
        if (raw && Array.isArray(raw.downloads)) return raw.downloads;
      }
    } catch (_) {}
    // migrate from store if present
    try {
      const fromStore = this.store && this.store.data && Array.isArray(this.store.data.downloads) ? this.store.data.downloads : [];
      if (fromStore.length) {
        this.records = fromStore.slice();
        try { this.store.data.downloads = []; this.store.save(); } catch (_) {}
        try { this.persistNow(); } catch (_) {}
        return this.records;
      }
    } catch (_) {}
    return [];
  }

  get dir() {
    const custom = String((this.store.settings && this.store.settings.downloadsDir) || '').trim();
    return custom || this.legacyDir;
  }

  ensureDir() {
    try { fs.mkdirSync(this.dir, { recursive: true }); } catch (_) {}
    try { fs.mkdirSync(this.legacyDir, { recursive: true }); } catch (_) {}
  }

  list() {
    return this.records;
  }

  fileFor(rec) {
    const preferredMp4 = path.join(this.dir, rec.id + '.mp4');
    if (fs.existsSync(preferredMp4)) return preferredMp4;
    const legacy = path.join(this.legacyDir, rec.id + '.mp4');
    if (fs.existsSync(legacy)) return legacy;
    const old = path.join(this.dir, rec.id + '.video');
    if (fs.existsSync(old)) return old;
    return preferredMp4;
  }

  partFor(rec) {
    const preferred = path.join(this.dir, rec.id + '.part');
    if (fs.existsSync(preferred)) return preferred;
    const legacy = path.join(this.legacyDir, rec.id + '.part');
    if (fs.existsSync(legacy)) return legacy;
    return preferred;
  }

  async add({ title, url, headers, logo, group, stream }) {
    const existing = this.list().find((d) => d.url === url && d.state !== 'Failed');
    if (existing) return existing;
    this.ensureDir();
    const rec = {
      id: (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')),
      title: title || url,
      url,
      headers: headers || {},
      logo: logo || '',
      group: group || '',
      total: 0,
      received: 0,
      state: 'Waiting',
      error: '',
      addedAt: Date.now(),
      dir: this.dir,
      stream: !!stream || /\.(m3u8|mpd)(\?|$)/i.test(String(url || ''))
    };
    this.list().unshift(rec);
    this.persistNow();
    this.pump();
    return rec;
  }

  pause(id) {
    const rec = this.list().find((d) => d.id === id);
    if (!rec) return null;
    const ctl = this.active.get(id);
    if (ctl) {
      rec.state = 'Paused';
      ctl.abort();
    } else {
      rec.state = 'Paused';
      this.queue = this.queue.filter((x) => x !== id);
    }
    this.persist();
    return rec;
  }

  resume(id) {
    const rec = this.list().find((d) => d.id === id);
    if (!rec || rec.state === 'Complete') return null;
    rec.state = 'Waiting';
    rec.error = '';
    this.persist();
    this.pump();
    return rec;
  }

  remove(id) {
    const ctl = this.active.get(id);
    if (ctl) ctl.abort();
    const rec = this.list().find((d) => d.id === id);
    if (rec) {
      try { fs.unlinkSync(this.fileFor(rec)); } catch (_) {}
      try { fs.unlinkSync(this.partFor(rec)); } catch (_) {}
      // also try explicit recorded dir
      if (rec.dir) {
        try { fs.unlinkSync(path.join(rec.dir, rec.id + '.mp4')); } catch (_) {}
        try { fs.unlinkSync(path.join(rec.dir, rec.id + '.video')); } catch (_) {}
        try { fs.unlinkSync(path.join(rec.dir, rec.id + '.part')); } catch (_) {}
      }
    }
    this.records = this.list().filter((d) => d.id !== id);
    this.queue = this.queue.filter((x) => x !== id);
    this.persist();
    return this.list();
  }

  persistNow() {
    try {
      if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
      const tmp = this.file + '.tmp';
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(this.records, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (_) {}
    this.onUpdate(this.list());
  }

  async shutdownForReset() {
    try {
      for (const [id, ctl] of Array.from(this.active.entries())) {
        try { ctl.abort(); } catch (_) {}
        const rec = this.list().find((d) => d.id === id);
        if (rec && rec.state !== 'Complete') rec.state = 'Paused';
      }
      this.active.clear();
      this.queue = [];
    } catch (_) {}
    this.persistNow();
  }

  persist() {
    this.onUpdate(this.list());
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.persistNow();
    }, 1500);
  }

  pump() {
    if (this.active.size >= MAX_ACTIVE) return;
    const next = this.list().find((d) => d.state === 'Waiting' && !this.active.has(d.id));
    if (!next) return;
    this.run(next);
    this.pump();
  }

  async run(rec) {
    if (rec.stream || /\.(m3u8|mpd)(\?|$)/i.test(String(rec.url || ''))) {
      return this.runStream(rec);
    }
    const abort = new AbortController();
    this.active.set(rec.id, { abort: () => abort.abort() });
    rec.state = 'Downloading';
    rec.error = '';
    this.ensureDir();
    this.persist();

    const targetDir = rec.dir || this.dir;
    try { fs.mkdirSync(targetDir, { recursive: true }); } catch (_) {}
    let part = path.join(targetDir, rec.id + '.part');
    const finalPath = path.join(targetDir, rec.id + '.mp4');
    let existing = 0;
    try { existing = fs.statSync(part).size; } catch (_) {
      try {
        const legacyPart = path.join(this.legacyDir, rec.id + '.part');
        const sz = fs.statSync(legacyPart).size;
        if (sz > 0) { existing = sz; part = legacyPart; }
      } catch (_) { existing = 0; }
    }
    const headers = { ...(rec.headers || {}) };
    if (existing > 0) headers.Range = `bytes=${existing}-`;

    try {
      // Public origins: every redirect hop and the connected address must stay public (anti-SSRF).
      // User-chosen LAN/localhost origins are left unrestricted (home IPTV boxes, NAS, etc.).
      let originHost = '';
      try { originHost = new URL(rec.url).hostname; } catch (_) {}
      const guard = isPrivateOrLocalHostname(originHost) ? 'none' : 'all';
      const res = await safeGet(rec.url, { headers, signal: abort.signal, guard, timeoutMs: 60000 });
      if (res.status !== 200 && res.status !== 206) { try { res.stream.destroy(); } catch (_) {} throw new Error('HTTP ' + res.status); }

      const isResume = res.status === 206 && existing > 0;
      // content-length of a decoded (gzip) body is unreliable; only trust it for identity encoding
      const enc = String(res.headers['content-encoding'] || '').toLowerCase();
      const len = enc && enc !== 'identity' ? 0 : Number(res.headers['content-length'] || 0);
      rec.received = isResume ? existing : 0;
      rec.total = isResume ? rec.received + len : len;

      const out = fs.createWriteStream(part, { flags: isResume ? 'a' : 'w' });
      let lastSave = 0;
      const body = res.stream;
      body.on('data', (chunk) => {
        rec.received += chunk.length;
        const now = Date.now();
        if (now - lastSave > 700) {
          lastSave = now;
          this.onUpdate(this.list());
        }
        if (this.store && typeof this.store.saveSoon === 'function') this.store.saveSoon(3000);
      });
      await pipeline(body, out);

      if (rec.total > 0 && rec.received < rec.total) {
        throw new Error('incomplete');
      }
      fs.renameSync(part, finalPath);
      // Verify the output is actually usable before marking Complete
      let vstOk = false;
      try {
        const vst = fs.statSync(finalPath);
        vstOk = vst.isFile() && vst.size > 0;
      } catch (_) {}
      if (vstOk) {
        rec.state = 'Complete';
        rec.total = rec.received;
        rec.dir = targetDir;
        rec.file = finalPath;
      } else {
        rec.state = 'Failed';
        rec.error = 'Downloaded file is empty or missing';
        try { fs.unlinkSync(finalPath); } catch (_) {}
      }
    } catch (err) {
      if (abort.signal.aborted) {
        if (rec.state !== 'Paused') rec.state = 'Paused';
      } else {
        rec.state = 'Failed';
        rec.error = err && err.message ? err.message : 'download failed';
      }
    } finally {
      this.active.delete(rec.id);
      this.persist();
      this.pump();
    }
  }

  async runStream(rec) {
    if (!ffmpegPath) {
      rec.state = 'Failed';
      rec.error = 'ffmpeg unavailable';
      this.persist();
      this.pump();
      return;
    }
    const targetDir = rec.dir || this.dir;
    try { fs.mkdirSync(targetDir, { recursive: true }); } catch (_) {}
    const finalPath = path.join(targetDir, rec.id + '.mp4');
    const headers = rec.headers || {};
    const args = ['-y', '-nostdin', '-loglevel', 'info'];
    const clean = (x) => String(x == null ? '' : x).replace(/[\r\n\0]+/g, ' ').trim();
    const saneHeaders = Object.entries(headers)
      .map(([k, v]) => [clean(k).replace(/[:\s]+/g, '-'), clean(v)])
      .filter(([k, v]) => k && v);
    if (saneHeaders.length) {
      const hstr = saneHeaders.map(([k, v]) => k + ': ' + v).join('\r\n') + '\r\n';
      args.push('-headers', hstr);
    }
    // Restrict ffmpeg to network protocols only: a remote playlist must never pull file:, concat:, subfile:, etc.
    const scheme = (() => { try { return new URL(rec.url).protocol.replace(':', ''); } catch (_) { return 'http'; } })();
    const wl = /^rtmps?$/.test(scheme) ? 'rtmp,rtmps,tcp,tls,crypto'
      : /^rtsps?$/.test(scheme) ? 'rtsp,rtsps,rtp,tcp,tls,udp,crypto'
      : scheme === 'udp' ? 'udp,rtp'
      : 'http,https,tcp,tls,crypto';
    args.push('-protocol_whitelist', wl, '-rw_timeout', '30000000');
    args.push('-i', rec.url, '-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart', finalPath);

    rec.state = 'Downloading';
    rec.error = '';
    rec.received = 0;
    rec.total = 0;
    this.persist();

    let proc = null;
    try {
      proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    } catch (err) {
      rec.state = 'Failed';
      rec.error = err && err.message ? err.message : 'ffmpeg start failed';
      this.persist();
      this.pump();
      return;
    }

    this.active.set(rec.id, { abort: () => { try { proc.kill('SIGKILL'); } catch (_) {} } });
    let aborted = false;
    let lastSave = 0;
    let stderrTail = '';
    const tick = () => {
      try { rec.received = fs.statSync(finalPath).size; } catch (_) {}
      const now = Date.now();
      if (now - lastSave > 1000) { lastSave = now; this.onUpdate(this.list()); }
    };
    if (proc.stderr) proc.stderr.on('data', (data) => { stderrTail = (stderrTail + data.toString()).slice(-4000); tick(); });
    const timer = setInterval(tick, 1500);

    await new Promise((resolve) => {
      proc.on('error', (err) => { rec.error = err && err.message ? err.message : 'ffmpeg error'; resolve(); });
      proc.on('exit', (code, signal) => {
        if (signal === 'SIGKILL' || rec.state === 'Paused') aborted = true;
        if (!aborted && code === 0) {
          let ok = false;
          try {
            const st = fs.statSync(finalPath);
            ok = st.isFile() && st.size > 0;
          } catch (_) {}
          if (ok) {
            rec.received = fs.statSync(finalPath).size;
            rec.state = 'Complete';
            rec.dir = targetDir;
            rec.file = finalPath;
          } else {
            rec.state = 'Failed';
            const tail = String(stderrTail || '').trim().split(/\r?\n/).slice(-3).join(' | ');
            rec.error = tail
              ? 'FFmpeg finished but produced no usable file: ' + tail
              : 'FFmpeg finished but produced no usable file';
            try { fs.unlinkSync(finalPath); } catch (_) {}
          }
        } else if (aborted) {
          if (rec.state !== 'Paused') rec.state = 'Paused';
          try { fs.unlinkSync(finalPath); } catch (_) {}
        } else {
          rec.state = 'Failed';
          const tail = String(stderrTail || '').trim().split(/\r?\n/).slice(-3).join(' | ');
          rec.error = tail ? ('FFmpeg failed: ' + tail).slice(0, 500) : ('ffmpeg exited with code ' + code);
          try { fs.unlinkSync(finalPath); } catch (_) {}
        }
        resolve();
      });
    });

    clearInterval(timer);
    this.active.delete(rec.id);
    this.persist();
    this.pump();
  }
}

module.exports = { Downloads };
