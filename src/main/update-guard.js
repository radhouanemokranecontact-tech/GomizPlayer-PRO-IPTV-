/*
 * Update safety guard.
 * - Snapshots app data before an update is installed.
 * - Detects repeated startup crashes (renderer never becomes ready).
 * - Offers a rollback path to the previously installed version.
 *
 * All state is local JSON under userData/update-guard.json — no network, no telemetry.
 */
const fs = require('fs');
const path = require('path');

class UpdateGuard {
  constructor(userData, appVersion) {
    this.dir = path.join(userData, 'update-guard');
    this.stateFile = path.join(userData, 'update-guard.json');
    this.appVersion = appVersion;
    try { fs.mkdirSync(this.dir, { recursive: true }); } catch (_) {}
    this.state = this._load();
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
    } catch (_) {
      return { crashes: 0, lastVersion: null, lastGoodVersion: null, preUpdateBackup: null };
    }
  }

  _save() {
    try { fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2), 'utf8'); } catch (_) {}
  }

  /** Track app version changes. Called on every startup. */
  noteStartup(version) {
    if (!version) version = this.appVersion;
    if (this.state.lastVersion && this.state.lastVersion !== version) {
      // Version changed: treat as a fresh start for crash counting.
      this.state.crashes = 0;
      this.state.previousVersion = this.state.lastVersion;
    }
    this.state.lastVersion = version;
    this._save();
  }

  /** Called once the renderer signals ready — proves this startup is healthy. */
  noteHealthy(version) {
    this.state.crashes = 0;
    this.state.lastGoodVersion = version || this.appVersion;
    this._save();
  }

  /** Called when the renderer fails to become ready within the startup timeout. */
  noteCrash(version) {
    this.state.crashes = (Number(this.state.crashes) || 0) + 1;
    this.state.crashVersion = version || this.appVersion;
    this._save();
    return this.shouldOfferRollback();
  }

  shouldOfferRollback() {
    return this.state.crashes >= 2 && !!this.state.previousVersion && !!this.state.lastGoodVersion;
  }

  /** Snapshot the live gomizplayer.json before an update is installed. */
  snapshotBeforeUpdate(storeFile) {
    try {
      if (!fs.existsSync(storeFile)) return null;
      const d = new Date();
      const pad = n => String(n).padStart(2, '0');
      const name = 'pre-update-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
        '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) +
    '-v' + String(this.appVersion || 'unknown').replace(/[^0-9a-zA-Z.-]/g, '') + '.json';
      const target = path.join(this.dir, name);
      fs.copyFileSync(storeFile, target);
      this.state.preUpdateBackup = target;
      this._save();
      return target;
    } catch (_) { return null; }
  }

  listSnapshots() {
    try {
      return fs.readdirSync(this.dir).filter(n => n.startsWith('pre-update-') && n.endsWith('.json')).map(n => ({
        name: n,
        path: path.join(this.dir, n),
        sizeBytes: fs.statSync(path.join(this.dir, n)).size
      })).sort((a, b) => b.name.localeCompare(a.name));
    } catch (_) { return []; }
  }

  getState() {
    return Object.assign({}, this.state, { snapshots: this.listSnapshots() });
  }

  /** Forget crash counters after the user chose to stay on the current version. */
  dismissRollback() {
    this.state.crashes = 0;
    this._save();
  }
}

module.exports = { UpdateGuard };
