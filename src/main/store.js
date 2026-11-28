'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

const DEFAULTS = {
  settings: {
    language: 'en',
    volume: 100,
    rate: 1,
    autoNext: true,
    aspect: 'contain',
    quality: 0,
    perChannelQuality: {},
    perChannelAudio: {},
    preferredAudioLang: '',
    preferredSubtitleLang: '',
    accent: '#ff3d5a',
    accent2: '#ff7a45',
    weatherCity: '',
    weatherCountry: '',
    weatherLat: 0,
    weatherLon: 0,
    widgetClock: true,
    widgetWeather: true,
    widgetPrayer: true,
    prayerMethod: 2,
    prayerSchool: 0,
    tempUnit: 'C',
    timeFormat: '24',
    hardwareDecoding: true,
    networkUserAgent: '',
    networkTimeout: 30,
    retryCount: 2,
    proxyMode: 'system',
    proxyUrl: '',
    downloadsDir: '',
    recordingsDir: '',
    clearSourceCacheOnLaunch: false,
    clearWatchHistoryOnLaunch: false,
    clearNetworkCacheOnLaunch: false,
    appLockEnabled: false,
    appLockPin: '',
    appLockHash: '',
    appLockSalt: '',
    proHideDead: false,
    proAutoFailover: true,
    proMultiview: { layout: '2x2', keys: [] },
    proParental: { enabled: false, keywords: [], lockedGroups: [], useDefaults: true },
    telemetryEnabled: false,
    analyticsEnabled: false,
    crashReportingEnabled: false,
    consentShown: false,
    telemetryEndpoint: 'http://localhost:8787/ingest',
    telemetryInstallId: '',
    telemetryLastPing: 0,
    telemetryFirstRunSent: false,
    crashReportLastSent: 0,
    uiScale: 100,
    reduceMotion: false,
    highContrast: false,
    theme: 'dark',
    seekStep: 10,
    subtitle: {
      size: 100,
      color: '#ffffff',
      bgOpacity: 0.55,
      bottom: 8,
      bold: false,
      delay: 0
    },
    player: {
      networkProfile: 'auto',
      shortcuts: {},
      drawer: { group: '', dedupe: false, search: '', shown: 100 }
    },
    home: {
      order: ['hero', 'continue', 'favorites', 'live', 'movies', 'series', 'recent', 'groups'],
      hidden: [],
      density: 'comfortable',
      rowLimit: 16
    },
    profile: 'default'
  },
  sources: [],
  library: {},
  downloads: []
};

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function mergeDefaults(base, extra) {
  if (Array.isArray(base)) return Array.isArray(extra) ? extra : base;
  if (base === null || typeof base !== 'object') {
    return extra === undefined ? base : extra;
  }
  const out = {};
  for (const k of Object.keys(base)) {
    out[k] = extra && Object.prototype.hasOwnProperty.call(extra, k)
      ? mergeDefaults(base[k], extra[k])
      : clone(base[k]);
  }
  if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
    for (const k of Object.keys(extra)) {
      if (!(k in out)) out[k] = extra[k];
    }
  }
  return out;
}

class Store {
  constructor() {
    this.dir = app.getPath('userData');
    this.file = path.join(this.dir, 'gomizplayer.json');
    this.backupDir = path.join(this.dir, 'backups');
    this._lastBackupAt = 0;
    this.recoveredFromBackup = null;
    try { fs.mkdirSync(this.backupDir, { recursive: true }); } catch (_) {}
    this.data = this.load();
    this.migrate();
  }

  // ---------- backup / recovery ----------
  listBackups() {
    try {
      return fs.readdirSync(this.backupDir)
        .filter(n => n.startsWith('gomizplayer-') && n.endsWith('.json'))
        .map(n => {
          const st = fs.statSync(path.join(this.backupDir, n));
          return { name: n, sizeBytes: st.size, modifiedAt: st.mtimeMs };
        })
        .sort((a, b) => b.modifiedAt - a.modifiedAt);
    } catch (_) { return []; }
  }

  backupNow() {
    try {
      this._rotateBackups();
      const d = new Date();
      const pad = n => String(n).padStart(2, '0');
      const name = 'gomizplayer-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
        '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '.json';
      const target = path.join(this.backupDir, name);
      const tmp = target + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, target);
      this._lastBackupAt = Date.now();
      return name;
    } catch (_) { return null; }
  }

  _rotateBackups() {
    const all = this.listBackups();
    all.slice(3).forEach(b => { try { fs.unlinkSync(path.join(this.backupDir, b.name)); } catch (_) {} });
  }

  restoreBackup(name) {
    try {
      const safe = path.resolve(this.backupDir, name);
      if (path.dirname(safe) !== path.resolve(this.backupDir)) throw new Error('Invalid backup');
      const raw = JSON.parse(fs.readFileSync(safe, 'utf8'));
      this.backupNow(); // keep current data before restoring
      this.data = mergeDefaults(DEFAULTS, raw);
      this.save();
      return true;
    } catch (_) { return false; }
  }

  migrate() {
    try {
      const s = this.data && this.data.settings;
      if (!s) return;
      let changed = false;
      const dashboard = 'http://localhost:8787/ingest';
      const abacus = 'https://abacus.jasoncameron.dev/hit/gomizplayer-radhouane-contact/launches';
      const ep = typeof s.telemetryEndpoint === 'string' ? s.telemetryEndpoint : '';
      if (/api\.counterapi\.dev\/v1\//i.test(ep)) {
        s.telemetryEndpoint = dashboard;
        changed = true;
      } else if (
        ep === abacus ||
        ep === 'https://api.counterapi.dev/v2/gomizplayer-radhouane-contact/launches/up' ||
        ep === 'https://api.counterapi.dev/v2/gomizplayer-radhouane-contact/launches'
      ) {
        s.telemetryEndpoint = dashboard;
        changed = true;
      }
      // Do not send before consent. Migrate legacy installs to explicit consent flow.
      if (typeof s.consentShown !== 'boolean') {
        s.consentShown = false;
        changed = true;
      }
      if (s.consentShown !== true) {
        if (s.analyticsEnabled !== false) { s.analyticsEnabled = false; changed = true; }
        if (s.crashReportingEnabled !== false) { s.crashReportingEnabled = false; changed = true; }
        if (s.telemetryEnabled !== false) { s.telemetryEnabled = false; changed = true; }
      } else {
        if (typeof s.analyticsEnabled !== 'boolean') { s.analyticsEnabled = s.telemetryEnabled !== false; changed = true; }
        if (typeof s.crashReportingEnabled !== 'boolean') { s.crashReportingEnabled = s.analyticsEnabled !== false; changed = true; }
      }
      if (typeof s.telemetryFirstRunSent !== 'boolean') {
        s.telemetryFirstRunSent = !!(s.telemetryLastPing || s.telemetryInstallId);
        changed = true;
      }
      if (changed) this.save();
    } catch (_) {}
  }

  load() {
    try {
      if (fs.existsSync(this.file)) {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        return mergeDefaults(DEFAULTS, raw);
      }
    } catch (err) {
      // main file is corrupt: keep it for forensics, then try newest backup
      try { fs.copyFileSync(this.file, this.file + '.corrupt'); } catch (_) {}
      const backups = this.listBackups();
      if (backups.length) {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(this.backupDir, backups[0].name), 'utf8'));
          this.recoveredFromBackup = backups[0].name;
          return mergeDefaults(DEFAULTS, raw);
        } catch (_) {}
      }
    }
    return clone(DEFAULTS);
  }

  save() {
    const tmp = this.file + '.tmp';
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
    // Rolling backup, at most once every 30 minutes.
    if (Date.now() - this._lastBackupAt >= 30 * 60 * 1000) this.backupNow();
    return true;
  }

  saveSoon(ms = 1500) {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      try { this.save(); } catch (_) {}
    }, ms);
  }

  get settings() { return this.data.settings; }

  patchSettings(patch) {
    this.data.settings = mergeDefaults(this.data.settings, patch || {});
    this.save();
    return this.data.settings;
  }

  resetSettings() {
    const keep = {
      sources: this.data.sources,
      library: this.data.library
    };
    this.data = clone(DEFAULTS);
    this.data.sources = keep.sources;
    this.data.library = keep.library;
    this.save();
    return this.data.settings;
  }

  _sanitizeSettingsImport(imported, defaults, excluded) {
    const out = {};
    if (!imported || typeof imported !== 'object' || Array.isArray(imported)) return out;
    for (const key of Object.keys(defaults || {})) {
      if (excluded && excluded.has(key)) continue;
      if (!Object.prototype.hasOwnProperty.call(imported, key)) continue;
      const dv = defaults[key];
      const iv = imported[key];
      if (Array.isArray(dv)) {
        if (!Array.isArray(iv)) continue;
        out[key] = clone(iv);
      } else if (dv && typeof dv === 'object') {
        if (!iv || typeof iv !== 'object' || Array.isArray(iv)) continue;
        // special known maps
        if (key === 'perChannelQuality' || key === 'perChannelAudio' || key === 'shortcuts') {
          const m = {};
          for (const [k,v] of Object.entries(iv).slice(0, 500)) {
            if (typeof k !== 'string') continue;
            if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') m[k.slice(0,200)] = v;
          }
          out[key] = m;
        } else {
          out[key] = this._sanitizeSettingsImport(iv, dv, null);
        }
      } else if (typeof dv === 'number') {
        if (typeof iv === 'number' && Number.isFinite(iv)) out[key] = iv;
        else if (typeof iv === 'string' && iv.trim() !== '' && Number.isFinite(Number(iv))) out[key] = Number(iv);
      } else if (typeof dv === 'boolean') {
        if (typeof iv === 'boolean') out[key] = iv;
      } else if (typeof dv === 'string') {
        if (typeof iv === 'string') out[key] = iv.slice(0, 2000);
      } else if (dv === null) {
        // allow null-compatible primitives
        if (iv === null || typeof iv === 'string' || typeof iv === 'number' || typeof iv === 'boolean') out[key] = iv;
      }
    }
    return out;
  }

  importBackup(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid backup');
    const clean = {};
    const excludedSettings = new Set(['telemetryEndpoint','proxyUrl','proxyMode','downloadsDir','recordingsDir','appLockPin','appLockHash','appLockSalt','telemetryInstallId']);
    if (raw.settings && typeof raw.settings === 'object' && !Array.isArray(raw.settings)) {
      clean.settings = this._sanitizeSettingsImport(raw.settings, DEFAULTS.settings, excludedSettings);
    }
    if (clean.settings && Array.isArray(clean.settings.epgUrls)) {
      clean.settings.epgUrls = clean.settings.epgUrls.slice(0, 50)
        .filter((e) => e && typeof e === 'object' && typeof e.url === 'string')
        .map((e) => ({
          id: (typeof e.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(e.id)) ? e.id : crypto.randomBytes(6).toString('hex'),
          url: e.url.slice(0, 4000),
          name: typeof e.name === 'string' ? e.name.slice(0, 200) : e.url.slice(0, 200)
        }));
    }
    if (Array.isArray(raw.sources)) {
      clean.sources = raw.sources.slice(0, 1000).filter((s) => s && typeof s === 'object').map((s) => {
        const src = {
          id: (typeof s.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(s.id)) ? s.id : crypto.randomBytes(8).toString('hex'),
          name: typeof s.name === 'string' ? s.name.slice(0, 200) : 'Source',
          url: typeof s.url === 'string' ? s.url.slice(0, 4000) : '',
          kind: typeof s.kind === 'string' ? s.kind.slice(0, 40) : 'm3u',
          username: typeof s.username === 'string' ? s.username.slice(0, 500) : '',
          password: typeof s.password === 'string' ? s.password.slice(0, 500) : '',
          headers: (s.headers && typeof s.headers === 'object' && !Array.isArray(s.headers)) ? Object.fromEntries(Object.entries(s.headers).slice(0, 50).map(([k,v]) => [String(k).slice(0,100), String(v).slice(0,2000)])) : {},
          addedAt: Number(s.addedAt) || Date.now(),
          updatedAt: Number(s.updatedAt) || Date.now(),
          count: Number(s.count) || 0
        };
        if (typeof s.passwordEnc === 'string' && s.passwordEnc) {
          src.passwordEnc = s.passwordEnc.slice(0, 4000);
          if (s.passwordEncV != null && s.passwordEncV !== '') {
            const v = Number(s.passwordEncV);
            src.passwordEncV = Number.isFinite(v) ? v : 2;
          } else {
            src.passwordEncV = 2;
          }
        }
        return src;
      });
    }
    if (raw.library && typeof raw.library === 'object' && !Array.isArray(raw.library)) {
      const lib = {};
      for (const [pk, pv] of Object.entries(raw.library).slice(0, 50)) {
        if (!pv || typeof pv !== 'object' || Array.isArray(pv)) continue;
        if (pk === '__proto__' || pk === 'prototype' || pk === 'constructor') continue;
        const sanitizeArr = (arr, max) => Array.isArray(arr) ? arr.slice(0, max).filter(x => x && typeof x === 'object') : [];
        lib[String(pk).slice(0, 40)] = {
          favorites: sanitizeArr(pv.favorites, 5000),
          history: sanitizeArr(pv.history, 5000),
          liveHistory: sanitizeArr(pv.liveHistory, 1000),
          search: Array.isArray(pv.search) ? pv.search.slice(0, 200).map(x => String(x).slice(0,200)) : []
        };
      }
      clean.library = lib;
    }
    if (clean.settings) this.data.settings = mergeDefaults(clone(DEFAULTS.settings), clean.settings);
    if (clean.sources) this.data.sources = clean.sources;
    if (clean.library) this.data.library = clean.library;
    // ensure active profile exists
    const p = this.data.settings && this.data.settings.profile ? this.data.settings.profile : 'default';
    this.library(p);
    this.save();
    return this.data;
  }

  exportBackup() {
    return {
      version: 1,
      exportedAt: Date.now(),
      settings: this.data.settings,
      sources: this.data.sources,
      library: this.data.library
    };
  }

  profileId(name) {
    const id = String(name || '').trim().slice(0, 40) || 'default';
    // These keys resolve through Object.prototype and would pollute it in library().
    return (id === '__proto__' || id === 'prototype' || id === 'constructor') ? 'default' : id;
  }

  profiles() {
    const keys = Object.keys(this.data.library || {});
    if (!keys.includes('default')) keys.unshift('default');
    return Array.from(new Set(keys));
  }

  createProfile(name) {
    const id = String(name || '').trim().slice(0, 40);
    if (!id || id === '__proto__' || id === 'prototype' || id === 'constructor') throw new Error('Invalid profile name');
    this.library(id);
    this.save();
    return id;
  }

  deleteProfile(name) {
    const id = this.profileId(name);
    if (id === 'default') throw new Error('Cannot delete default profile');
    if (this.data.library) delete this.data.library[id];
    if (this.data.settings && this.data.settings.profile === id) this.data.settings.profile = 'default';
    this.save();
    return this.data.settings.profile;
  }

  library(profile) {
    const id = this.profileId(profile);
    if (!Object.prototype.hasOwnProperty.call(this.data.library, id)) {
      this.data.library[id] = { favorites: [], history: [], liveHistory: [], search: [] };
    }
    const lib = this.data.library[id];
    for (const k of ['favorites', 'history', 'liveHistory', 'search']) {
      if (!Array.isArray(lib[k])) lib[k] = [];
    }
    return lib;
  }

  addFavorite(profile, item) {
    const lib = this.library(profile);
    if (!lib.favorites.some((x) => x.key === item.key)) {
      lib.favorites.unshift({ ...item, addedAt: Date.now() });
      lib.favorites = lib.favorites.slice(0, 2000);
      this.save();
    }
    return lib.favorites;
  }

  removeFavorite(profile, key) {
    const lib = this.library(profile);
    lib.favorites = lib.favorites.filter((x) => x.key !== key);
    this.save();
    return lib.favorites;
  }

  pushHistory(profile, item, kind) {
    const lib = this.library(profile);
    const bucket = kind === 'live' ? 'liveHistory' : 'history';
    if (kind === 'live') {
      const m = item.mode || 'live';
      lib[bucket] = lib[bucket].filter((x) => !(x.key === item.key && (x.mode || 'live') === m));
    } else {
      lib[bucket] = lib[bucket].filter((x) => x.key !== item.key);
    }
    lib[bucket].unshift({ ...item, playedAt: Date.now() });
    lib[bucket] = lib[bucket].slice(0, kind === 'live' ? 100 : 1000);
    this.save();
    return lib[bucket];
  }

  patchHistory(profile, key, patch) {
    const lib = this.library(profile);
    const item = lib.history.find((x) => x.key === key);
    if (item) {
      Object.assign(item, patch);
      this.save();
    }
    return item || null;
  }

  clearLibrary(profile, what) {
    const lib = this.library(profile);
    if (what === 'all') {
      lib.favorites = [];
      lib.history = [];
      lib.liveHistory = [];
      lib.search = [];
    } else if (what === 'history') {
      lib.history = [];
      lib.liveHistory = [];
    } else if (Array.isArray(what)) {
      for (const k of what) if (Array.isArray(lib[k])) lib[k] = [];
    } else if (typeof what === 'string' && Array.isArray(lib[what])) {
      lib[what] = [];
    }
    this.save();
    return lib;
  }

  clearWatchHistoryAllProfiles() {
    const libs = this.data.library || {};
    for (const p of Object.keys(libs)) {
      const lib = libs[p];
      if (!lib || typeof lib !== 'object') continue;
      lib.history = [];
      lib.liveHistory = [];
    }
    this.save();
    return true;
  }

  addSearch(profile, term) {
    if (!term || !term.trim()) return [];
    const lib = this.library(profile);
    const t = term.trim();
    lib.search = [t, ...lib.search.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 30);
    this.save();
    return lib.search;
  }

  addSource(source) {
    const entry = {
      id: crypto.randomBytes(8).toString('hex'),
      name: source.name,
      url: source.url,
      kind: source.kind || 'm3u',
      username: source.username || '',
      password: source.password || '',
      headers: source.headers || {},
      addedAt: Date.now(),
      updatedAt: Date.now(),
      count: source.count || 0
    };
    if (source.passwordEnc) {
      entry.passwordEnc = String(source.passwordEnc);
      entry.password = '';
      if (source.passwordEncV != null && source.passwordEncV !== '') entry.passwordEncV = Number(source.passwordEncV) || 2;
    }
    this.data.sources.push(entry);
    this.save();
    return entry;
  }

  updateSource(id, patch) {
    const src = this.data.sources.find((s) => s.id === id);
    if (!src) return null;
    const p = patch || {};
    if (Object.prototype.hasOwnProperty.call(p, 'passwordEnc') && p.passwordEnc) {
      src.password = '';
      if (!Object.prototype.hasOwnProperty.call(p, 'passwordEncV') && src.passwordEncV == null) {
        // leave as-is; caller may provide passwordEncV
      }
    }
    if (Object.prototype.hasOwnProperty.call(p, 'password') && p.password && !p.passwordEnc) {
      delete src.passwordEnc;
    }
    Object.assign(src, p, { updatedAt: Date.now() });
    this.save();
    return src;
  }

  removeSource(id) {
    this.data.sources = this.data.sources.filter((s) => s.id !== id);
    this.save();
    return this.data.sources;
  }

  sources() { return this.data.sources; }
}

module.exports = { Store };
