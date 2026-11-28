'use strict';

/* Video player: HLS (hls.js) / MPEG-TS (mpegts.js) / native + subtitles + stats. */

function fmtTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  return m + ':' + String(s).padStart(2, '0');
}

function fmtBitrate(bps) {
  if (!bps) return '—';
  if (bps >= 1000000) return (bps / 1000000).toFixed(2) + ' Mbps';
  return Math.round(bps / 1000) + ' kbps';
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* Narrow, validated HTTP headers for browser-based media engines. */
function normalizePlaybackHeaders(input) {
  const allowed = { 'user-agent': 'User-Agent', referer: 'Referer', referrer: 'Referer', origin: 'Origin' };
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  Object.keys(input).forEach((key) => {
    const name = allowed[String(key).toLowerCase()];
    const value = String(input[key] == null ? '' : input[key]).trim();
    if (!name || !value || value.length > 2048 || /[\r\n\0]/.test(value)) return;
    out[name] = value;
  });
  return out;
}

const SVG_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6L19 12 8 5.2Z"/></svg>';
const SVG_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
const SVG_VOL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6.5 9H3v6h3.5L11 19V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>';
const SVG_MUTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6.5 9H3v6h3.5L11 19V5Z"/><path d="m16 9 5 6M21 9l-5 6"/></svg>';
const DRAWER_PAGE = 100;

function playerInitials(name) {
  return String(name || '')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'TV';
}

/* Two playlist entries point at the same channel. Keys are authoritative when
   present; url+name is a fallback for items rebuilt without a key. */
function sameItem(a, b) {
  if (!a || !b) return false;
  if (a.key && b.key) return a.key === b.key;
  return a.url === b.url && (a.name || '') === (b.name || '');
}

/* "42 min left" / "1h 05m left" — used by the live programme strip. */
function fmtLeft(ms) {
  const num = window.I18N && window.I18N.number ? window.I18N.number.bind(window.I18N) : String;
  const mins = Math.max(0, Math.round(Number(ms) / 60000));
  if (!Number.isFinite(mins) || mins < 1) return window.t('left_lt_min');
  if (mins < 60) return window.t('left_min', { n: num(mins) });
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m
    ? window.t('left_hm', { h: num(h), m: num(m) })
    : window.t('left_h', { h: num(h) });
}

class Player {
  constructor(opts) {
    this.opts = opts || {};
    this.root = document.getElementById('playerRoot');
    this.video = document.getElementById('video');
    this.layer = document.getElementById('subtitleLayer');
    this.loading = document.getElementById('playerLoading');
    this.loadingLabel = document.getElementById('playerLoadingLabel');
    this.errorBox = document.getElementById('playerError');
    this.errorChannel = document.getElementById('errorChannel');
    this.errorDetail = document.getElementById('errorDetail');
    this.titleEl = document.getElementById('playerTitle');
    this.subEl = document.getElementById('playerSub');
    this.avatarEl = document.getElementById('playerAvatar');
    this.qualityBtn = document.getElementById('playerQuality');
    this.topLive = document.getElementById('playerTopLive');
    this.topLatency = document.getElementById('playerTopLatency');
    this.playerClock = document.getElementById('playerClock');
    this.playerWeather = document.getElementById('playerWeather');
    this.playerPrayer = document.getElementById('playerPrayer');

    // extra UI (injected)
    this.lockOverlay = document.getElementById('playerLockOverlay');
    if (!this.lockOverlay) {
      this.lockOverlay = document.createElement('div');
      this.lockOverlay.id = 'playerLockOverlay';
      this.lockOverlay.className = 'player-locked-overlay';
      this.lockOverlay.hidden = true;
      this.lockOverlay.innerHTML = '<button class="unlock-pill" id="unlockControlsBtn" type="button"><span data-icon="unlock"></span><span class="unlock-txt">Unlock</span></button>';
      this.root.appendChild(this.lockOverlay);
      if (window.hydrateIcons) window.hydrateIcons(this.lockOverlay);
    }
    this.quickInfo = document.getElementById('quickInfoPanel');
    if (!this.quickInfo) {
      this.quickInfo = document.createElement('div');
      this.quickInfo.id = 'quickInfoPanel';
      this.quickInfo.className = 'quick-info-panel';
      this.quickInfo.hidden = true;
      this.root.appendChild(this.quickInfo);
    }
    this.unlockBtn = document.getElementById('unlockControlsBtn');
    this.topWidgetTimer = null;
    this.recording = false;
    this.recordingTarget = null;
    this.recordingStartedAt = 0;
    this.recordTimerInterval = null;
    this.recordTimer = document.getElementById('recordTimer');
    this.recordTimerTime = document.getElementById('recordTimerTime');
    this.recordTimerTarget = document.getElementById('recordTimerTarget');
    this.statsPanel = document.getElementById('statsPanel');
    this.drawer = document.getElementById('channelDrawer');
    this.drawerList = document.getElementById('drawerList');
    this.drawerSearch = document.getElementById('drawerSearch');
    this.drawerCount = document.getElementById('drawerCount');
    this.drawerMore = document.getElementById('drawerMore');
    this.drawerGroups = document.getElementById('drawerGroups');
    this.drawerGroupsList = document.getElementById('drawerGroupsList');
    this.drawerDedupe = document.getElementById('drawerDedupe');
    this.drawerBtn = document.getElementById('drawerBtn');
    this.recordBtn = document.getElementById('recordBtn');
    this.recordBadge = document.getElementById('recordBadge');
    this.favBtn = document.getElementById('favBtn');
    this.epgBtn = document.getElementById('epgBtn');
    this.tracksBtn = document.getElementById('tracksBtn');
    this.ptwClock = document.getElementById('ptwClock');
    this.ptwWeather = document.getElementById('ptwWeather');
    this.ptwPrayer = document.getElementById('ptwPrayer');
    this.pop = document.getElementById('playerPop');
    this.popOwner = null;
    this.seek = document.getElementById('seekBar');
    this.seekRow = document.getElementById('seekRow');
    this.timeNow = document.getElementById('timeNow');
    this.timeTotal = document.getElementById('timeTotal');
    this.liveStrip = document.getElementById('liveStrip');
    this.liveEpg = document.getElementById('liveEpg');
    this.liveNowTag = document.getElementById('liveNowTag');
    this.liveNow = document.getElementById('liveNow');
    this.liveRemaining = document.getElementById('liveRemaining');
    this.liveBar = document.getElementById('liveBar');
    this.liveBarFill = document.getElementById('liveBarFill');
    this.liveNextRow = document.getElementById('liveNextRow');
    this.liveNextTag = document.getElementById('liveNextTag');
    this.liveNext = document.getElementById('liveNext');
    this.liveNextTime = document.getElementById('liveNextTime');
    this.liveAddEpg = document.getElementById('liveAddEpg');
    this.liveLatency = document.getElementById('liveLatency');
    this.center = document.getElementById('playerCenter');
    this.centerIco = this.center.querySelector('.center-ico');
    this.playBtn = document.getElementById('playBtn');
    this.muteBtn = document.getElementById('muteBtn');
    this.volBar = document.getElementById('volBar');
    this.speedSel = document.getElementById('speedSel');
    this.aspectBtn = document.getElementById('aspectBtn');
    this.audioBtn = document.getElementById('audioBtn');
    this.subsBtn2 = document.getElementById('subsBtn2'); // removed from UI, kept null-safe
    this.back10Btn = document.getElementById('back10Btn');
    this.forward10Btn = document.getElementById('forward10Btn');
    this.stopBtn = document.getElementById('stopBtn');
    this.goLiveBtn = document.getElementById('goLiveBtn');
    this.reloadBtn = document.getElementById('reloadBtn');
    this.lockBtn = document.getElementById('lockBtn');
    this.screenshotBtn = document.getElementById('screenshotBtn');
    this.sleepBtn = document.getElementById('sleepBtn');
    this.repeatBtn = document.getElementById('repeatBtn');
    this.seekStepSel = document.getElementById('seekStepSel');
    this.quickInfoBtn = document.getElementById('quickInfoBtn');
    this.miniBtn = document.getElementById('miniBtn');

    this.renderer = new SubtitleRenderer(this.layer);
    this.hls = null;
    this.mpegts = null;
    this.dash = null;
    this.item = null;
    this.context = null;
    this.open = false;
    this.isLive = false;
    this.resumeAt = 0;
    this.errorCount = 0;
    this.idleTimer = null;
    this.progressTimer = 0;
    this.statsTimer = null;
    this.clickTimer = null;
    this.subCues = [];
    this.subName = '';
    this.textTrackIndex = -1;
    this.epgInfo = null;
    this.epgTimer = null;
    this.centerTimer = null;
    this.drawerShown = 0;
    this.drawerGroup = '';
    this.drawerDedupeOn = false;
    this.lastLeftMin = null;

    // new features state
    this.locked = false;
    this.seekStep = 10;
    this.sleepTimer = null;
    this.sleepEndsAt = 0;
    this.repeatMode = 'off'; // off | all | one
    this.audioDelay = 0;
    this.miniMode = false;
    this.stopped = false;

    this.bind();
    this.applySettings(this.opts.settings || {});
  }

  /* ---------------- events ---------------- */

  controlsBlocked(action) {
    if (!this.locked) return false;
    // allow only unlock-related interactions
    return action !== 'unlock';
  }

  bind() {
    const v = this.video;

    document.getElementById('playerBack').addEventListener('click', () => { if (!this.controlsBlocked('nav')) this.close(); else this.toggleLock(false); });
    document.getElementById('closeErrBtn').addEventListener('click', () => this.close());
    document.getElementById('retryBtn').addEventListener('click', () => this.reload());
    document.getElementById('nextBtn2').addEventListener('click', () => this.playNext());
    document.getElementById('prevCh').addEventListener('click', () => { if (!this.controlsBlocked()) this.playPrev(); });
    document.getElementById('nextCh').addEventListener('click', () => { if (!this.controlsBlocked()) this.playNext(); });
    document.getElementById('statsBtn').addEventListener('click', (e) => { e.stopPropagation(); if (!this.controlsBlocked()) this.toggleStats(); });
    if (this.subsBtn2) this.subsBtn2.addEventListener('click', (e) => { e.stopPropagation(); if (this.controlsBlocked()) return; if (this.pop.hidden || this.popOwner !== 'subs') { this.showSubtitlePop(); } else { this.pop.hidden = true; this.popOwner = null; } });
    document.getElementById('drawerBtn').addEventListener('click', () => { if (!this.controlsBlocked()) this.toggleDrawer(); });
    document.getElementById('drawerClose').addEventListener('click', () => this.toggleDrawer(false));
    this.drawerSearch.addEventListener('input', () => { this.renderDrawer(true); this.saveDrawerState(); });
    this.drawerDedupe.addEventListener('click', () => {
      this.drawerDedupeOn = !this.drawerDedupeOn;
      this.drawerDedupe.classList.toggle('on', this.drawerDedupeOn);
      this.renderDrawer(true);
      this.saveDrawerState();
    });
    this.drawerMore.addEventListener('click', () => {
      this.drawerShown += DRAWER_PAGE;
      this.renderDrawer(false);
      this.saveDrawerState();
    });
    this.center.addEventListener('click', () => { if (this.controlsBlocked()) { this.toggleLock(false); return; } this.poke(); });
    if (this.liveAddEpg) {
      this.liveAddEpg.addEventListener('click', () => {
        if (typeof this.context?.onAddEpg === 'function') this.context.onAddEpg();
      });
    }

    this.playBtn.addEventListener('click', () => { if (!this.controlsBlocked()) this.togglePlay(); });
    this.muteBtn.addEventListener('click', () => { if (!this.controlsBlocked()) this.toggleMute(); });
    this.volBar.addEventListener('input', () => {
      if (this.controlsBlocked()) return;
      v.muted = false;
      v.volume = Number(this.volBar.value) / 100;
      this.updateVolumeIcon();
      this.opts.patchSettings && this.opts.patchSettings({ volume: Number(this.volBar.value) });
    });
    this.speedSel.addEventListener('change', () => {
      if (this.controlsBlocked()) return;
      v.playbackRate = Number(this.speedSel.value);
    });
    this.aspectBtn.addEventListener('click', () => { if (!this.controlsBlocked()) this.cycleAspect(); });
    document.getElementById('fullBtn').addEventListener('click', () => { if (!this.controlsBlocked()) this.toggleFullscreen(); });
    document.getElementById('pipBtn').addEventListener('click', () => { if (!this.controlsBlocked()) this.togglePip(); });
    this.audioBtn.addEventListener('click', (e) => { e.stopPropagation(); if (this.controlsBlocked()) return; if (this.pop.hidden || this.popOwner !== 'audio') { this.showAudioPop(); } else { this.pop.hidden = true; this.popOwner = null; } });
    this.qualityBtn.addEventListener('click', (e) => { e.stopPropagation(); if (this.controlsBlocked()) return; if (this.pop.hidden || this.popOwner !== 'quality') { this.showQualityPop(); } else { this.pop.hidden = true; this.popOwner = null; } });
    if (this.recordBtn) this.recordBtn.addEventListener('click', (e) => { e.stopPropagation(); if (!this.controlsBlocked()) this.toggleRecording(); });
    if (this.favBtn) this.favBtn.addEventListener('click', (e) => { e.stopPropagation(); if (!this.controlsBlocked()) this.toggleFavorite(); });
    if (this.epgBtn) this.epgBtn.addEventListener('click', (e) => { e.stopPropagation(); if (!this.controlsBlocked()) this.openEpg(); });
    if (this.tracksBtn) this.tracksBtn.addEventListener('click', (e) => { e.stopPropagation(); if (this.controlsBlocked()) return; if (this.pop.hidden || this.popOwner !== 'tracks') { this.showTracksPop(); } else { this.pop.hidden = true; this.popOwner = null; } });

    // new controls
    if (this.back10Btn) this.back10Btn.addEventListener('click', (e) => { e.stopPropagation(); if (!this.controlsBlocked()) this.seekBy(-this.seekStep); });
    if (this.forward10Btn) this.forward10Btn.addEventListener('click', (e) => { e.stopPropagation(); if (!this.controlsBlocked()) this.seekBy(this.seekStep); });
    if (this.stopBtn) this.stopBtn.addEventListener('click', (e) => { e.stopPropagation(); if (!this.controlsBlocked()) this.stopPlayback(); });
    if (this.goLiveBtn) this.goLiveBtn.addEventListener('click', (e) => { e.stopPropagation(); if (!this.controlsBlocked()) this.goLive(); });
    if (this.reloadBtn) this.reloadBtn.addEventListener('click', (e) => { e.stopPropagation(); if (!this.controlsBlocked()) this.reload(); });
    if (this.lockBtn) this.lockBtn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleLock(); });
    if (this.unlockBtn) this.unlockBtn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleLock(false); });
    if (this.screenshotBtn) this.screenshotBtn.addEventListener('click', (e) => { e.stopPropagation(); if (!this.controlsBlocked()) this.takeScreenshot(); });
    if (this.sleepBtn) this.sleepBtn.addEventListener('click', (e) => { e.stopPropagation(); if (this.controlsBlocked()) return; if (this.pop.hidden || this.popOwner !== 'sleep') this.showSleepPop(); else { this.pop.hidden = true; this.popOwner = null; } });
    if (this.repeatBtn) this.repeatBtn.addEventListener('click', (e) => { e.stopPropagation(); if (!this.controlsBlocked()) this.cycleRepeat(); });
    if (this.seekStepSel) this.seekStepSel.addEventListener('change', () => { this.seekStep = Math.max(1, Number(this.seekStepSel.value) || 10); this.updateSeekStepLabels(); this.opts.patchSettings && this.opts.patchSettings({ seekStep: this.seekStep }); });
    if (this.quickInfoBtn) this.quickInfoBtn.addEventListener('click', (e) => { e.stopPropagation(); if (!this.controlsBlocked()) this.toggleQuickInfo(); });
    if (this.miniBtn) this.miniBtn.addEventListener('click', (e) => { e.stopPropagation(); if (!this.controlsBlocked()) this.toggleMiniPlayer(); });

    if (this.ptwWeather) this.ptwWeather.addEventListener('click', (e) => { e.stopPropagation(); if (!this.controlsBlocked() && window.__novaTest && window.__novaTest.refreshWeather) window.__novaTest.refreshWeather(); });
    if (this.ptwPrayer) this.ptwPrayer.addEventListener('click', (e) => { e.stopPropagation(); if (!this.controlsBlocked() && window.__novaTest && window.__novaTest.refreshWeather) window.__novaTest.refreshWeather(); });
    if (this.ptwClock) this.ptwClock.addEventListener('click', (e) => { e.stopPropagation(); if (!this.controlsBlocked()) this.updateTopWidget(); });

    document.addEventListener('click', (e) => {
      if (this.locked) return;
      // Close the shared popup when clicking outside of it and its triggers.
      if (!this.pop.hidden) {
        const triggers = [this.audioBtn, this.qualityBtn, this.tracksBtn, this.sleepBtn];
        const onTrigger = triggers.some((b) => b && (b === e.target || b.contains(e.target)));
        if (!onTrigger && !this.pop.contains(e.target)) { this.pop.hidden = true; this.popOwner = null; }
      }
      // Close quick info
      if (this.quickInfo && !this.quickInfo.hidden) {
        const onQi = this.quickInfo.contains(e.target);
        const onBtn = this.quickInfoBtn && (this.quickInfoBtn === e.target || this.quickInfoBtn.contains(e.target));
        if (!onQi && !onBtn) this.quickInfo.hidden = true;
      }
      // Close the channel drawer when clicking outside of it (mouse-friendly).
      if (this.drawer && this.drawer.classList.contains('open')) {
        const onDrawer = this.drawer.contains(e.target);
        const onDrawerBtn = this.drawerBtn && (this.drawerBtn === e.target || this.drawerBtn.contains(e.target));
        if (!onDrawer && !onDrawerBtn) this.toggleDrawer(false);
      }
      // Close the stats panel when clicking outside of it.
      if (!this.statsPanel.hidden) {
        if (e.target !== this.statsBtn && !this.statsBtn.contains(e.target) && !this.statsPanel.contains(e.target)) {
          this.statsPanel.hidden = true;
          clearInterval(this.statsTimer);
          this.statsTimer = null;
        }
      }
    });

    this.seek.addEventListener('input', () => {
      if (this.controlsBlocked()) return;
      if (this.isLive) {
        if (!this.liveDvrEnabled()) return;
        const { start, end } = this.liveSeekRange();
        const span = Math.max(0.1, end - start);
        v.currentTime = start + (Number(this.seek.value) / 1000) * span;
        return;
      }
      if (!Number.isFinite(v.duration)) return;
      v.currentTime = (Number(this.seek.value) / 1000) * v.duration;
    });
    this.seek.addEventListener('mousemove', (e) => this.updateSeekPreview(e));
    this.seek.addEventListener('mouseleave', () => this.hideSeekPreview());

    let lastDblFullAt = 0;
    const onDblFull = (e) => {
      if (e) e.preventDefault();
      const now = Date.now();
      if (now - lastDblFullAt < 400) return;
      lastDblFullAt = now;
      clearTimeout(this.clickTimer);
      if (!this.controlsBlocked()) this.toggleFullscreen();
    };
    v.addEventListener('dblclick', (e) => { if (!this.center || this.center.hidden) onDblFull(e); });
    if (this.center) this.center.addEventListener('dblclick', (e) => { e.stopPropagation(); onDblFull(e); });
    this.root.addEventListener('dblclick', (e) => {
      if (e.target && (e.target.closest('.player-bottom') || e.target.closest('.channel-drawer') || e.target.closest('.player-top'))) return;
      if (e.target && (e.target === this.center || this.center?.contains(e.target))) return;
      onDblFull(e);
    });

    v.addEventListener('loadedmetadata', () => this.onMetadata());
    v.addEventListener('timeupdate', () => this.onTimeUpdate());
    v.addEventListener('progress', () => this.onBuffered());
    v.addEventListener('waiting', () => this.setLoading(true));
    v.addEventListener('playing', () => { this.setLoading(false); this.hideError(); this.updatePlayIcon(); this.stopped = false; });
    v.addEventListener('canplay', () => this.setLoading(false));
    v.addEventListener('pause', () => { this.updatePlayIcon(); this.updateCenter(true); });
    v.addEventListener('play', () => { this.updatePlayIcon(); this.setLoading(false); this.stopped = false; });
    v.addEventListener('volumechange', () => this.updateVolumeIcon());
    v.addEventListener('ended', () => this.onEnded());
    v.addEventListener('error', () => {
      if (!this.hls && !this.mpegts && this.item) this.showError((v.error && v.error.message) || '');
    });

    this.root.addEventListener('mousemove', () => this.poke());
    this.root.addEventListener('mouseleave', () => this.scheduleIdle());

    document.addEventListener('fullscreenchange', () => {
      const full = !!document.fullscreenElement;
      document.getElementById('fullBtn').innerHTML = full
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
      if (!full && this.miniMode) this.setMiniMode(false);
    });

    document.addEventListener('keydown', (e) => this.onKey(e));

    this.setupGestures();

    window.addEventListener('resize', () => {
      this.renderer.applyStyle();
      this.renderer.lastTime = -1;
    });
  }

  onKey(e) {
    if (!this.open) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    if (this.locked) {
      if (e.key === 'Escape' || e.key === 'l' || e.key === 'L') { e.preventDefault(); this.toggleLock(false); }
      this.poke();
      return;
    }
    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        {
          const hasOpen = (this.drawer && this.drawer.classList.contains('open')) || !this.pop.hidden || (this.statsPanel && !this.statsPanel.hidden) || (this.quickInfo && !this.quickInfo.hidden);
          if (hasOpen) {
            if (this.drawer && this.drawer.classList.contains('open')) this.toggleDrawer(false);
            if (!this.pop.hidden) { this.pop.hidden = true; this.popOwner = null; }
            if (this.statsPanel && !this.statsPanel.hidden) this.toggleStats();
            if (this.quickInfo && !this.quickInfo.hidden) this.quickInfo.hidden = true;
          } else {
            this.togglePlay();
          }
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.seekBy(this.seekStep);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.seekBy(-this.seekStep);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.setVolume(this.video.volume + 0.05);
        break;
      case 'ArrowDown':
        e.preventDefault();
        this.setVolume(this.video.volume - 0.05);
        break;
      case 'm':
        this.toggleMute();
        break;
      case 'f':
        this.toggleFullscreen();
        break;
      case 's':
        this.toggleStats();
        break;
      case 'd':
        this.toggleDrawer();
        break;
      case 'l':
      case 'L':
        this.toggleLock(true);
        break;
      case 'g':
      case 'G':
        this.goLive();
        break;
      case 'Escape':
        if (this.quickInfo && !this.quickInfo.hidden) { this.quickInfo.hidden = true; break; }
        if (!this.pop.hidden) { this.pop.hidden = true; this.popOwner = null; break; }
        if (this.drawer.classList.contains('open')) { this.toggleDrawer(false); break; }
        if (this.miniMode) { this.setMiniMode(false); break; }
        if (document.fullscreenElement) { document.exitFullscreen(); break; }
        this.close();
        break;
      default:
        break;
    }
    this.poke();
  }

  updateSeekStepLabels() {
    const n = this.seekStep || 10;
    if (this.back10Btn) this.back10Btn.title = (window.t ? window.t('seek_back', { n }) : ('Back ' + n + 's'));
    if (this.forward10Btn) this.forward10Btn.title = (window.t ? window.t('seek_forward', { n }) : ('Forward ' + n + 's'));
  }

  /* ---------------- open / load ---------------- */

  openItem(item, context) {
    this.context = context || {};
    if (typeof this.context.getEpgFor === 'function') {
      const ctx = this.context;
      this.context = Object.assign({}, ctx, { getEpg: () => ctx.getEpgFor(item) });
    }
    this.favoritesMode = !!(this.context && this.context.favoritesMode);
    this.restoreDrawerState();
    this.item = item;
    this.resumeAt = Number(this.context.resume || item.position || 0) || 0;
    this.errorCount = 0;
    this.open = true;
    this.stopped = false;
    this.root.hidden = false;
    this.errorBox.hidden = true;
    this.statsPanel.hidden = true;
    if (this.quickInfo) this.quickInfo.hidden = true;
    this.pop.hidden = true; this.popOwner = null;
    this.center.hidden = true;
    this.center.classList.remove('show');
    this.root.classList.remove('idle');
    this.clearSleepTimer();
    this.setLocked(false);
    this.titleEl.textContent = item.name || item.title || '';
    this.updateAvatar(item);
    this.updateFavBtn();
    this.epgInfo = this.context.epg || null;
    this.setLiveState(item.kind === 'live', true);
    this.updateMeta();
    this.subName = '';
    this.subCues = [];
    this.renderer.setCues([]);
    if (this.drawerSearch) this.drawerSearch.placeholder = window.t('search_channels');
    if (this.drawerDedupe) {
      this.drawerDedupe.title = window.t('hide_dupes');
      this.drawerDedupe.setAttribute('aria-label', window.t('hide_dupes'));
      this.drawerDedupe.classList.toggle('on', this.drawerDedupeOn);
    }
    if (!this.drawerShown || this.drawerShown < DRAWER_PAGE) this.drawerShown = DRAWER_PAGE;
    this.renderDrawer(false);
    this.startEpgWatch();
    this.load(item);
    this.poke();
    this.updateSeekStepLabels();
    this.updateGoLiveButton();
    this.startTopWidget();
    this.syncRecordingState();
    if (this.opts.onOpen) this.opts.onOpen(item);
  }

  updateAvatar(item) {
    const name = item.name || item.title || '';
    this.avatarEl.innerHTML = '';
    this.avatarEl.title = name;
    if (item.logo) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = item.logo;
      img.addEventListener('error', () => {
        img.remove();
        this.avatarEl.textContent = playerInitials(name);
      });
      this.avatarEl.appendChild(img);
    } else {
      this.avatarEl.textContent = playerInitials(name);
    }
  }

  startEpgWatch() {
    clearInterval(this.epgTimer);
    this.epgTimer = null;
    if (!this.context || typeof this.context.getEpg !== 'function') return;
    this.epgTimer = setInterval(() => {
      if (!this.open || !this.isLive) return;
      try { this.setEpg(this.context.getEpg()); } catch (_) {}
    }, 60000);
  }

  setEpg(info) {
    this.epgInfo = info || null;
    this.updateMeta();
    this.refreshDrawerNow();
  }

  /* Swap the playlist without restarting playback (e.g. the sidebar "Live TV"
     button while a channel opened from Home is already playing). */
  setPlaylist(list) {
    if (!this.context) this.context = {};
    this.context.playlist = list || [];
    if (this.drawer.classList.contains('open')) this.renderDrawer(true);
  }

  /* Guide data usually arrives a moment after the drawer is painted. Update the
     playing row in place so the "now" line appears without re-rendering (which
     would reset the user's scroll and search). */
  refreshDrawerNow() {
    if (!this.drawerList) return;
    const now = this.drawerList.querySelector('.drawer-item.on .d-now');
    if (!now) return;
    const info = this.epgInfo;
    if (info && info.current) now.textContent = window.t('now') + ': ' + info.current.title;
    else if (info && info.next) now.textContent = window.t('next') + ': ' + info.next.title;
    else now.textContent = '';
  }

  updateMeta() {
    const item = this.item || {};
    const parts = [];
    if (item.group) parts.push('<span>' + esc(item.group) + '</span>');
    if (this.isLive && this.epgInfo) {
      if (this.epgInfo.current) {
        parts.push('<span class="epg-now">' + esc(window.t('now')) + ': ' + esc(this.epgInfo.current.title || '') + '</span>');
      } else if (this.epgInfo.next) {
        parts.push('<span class="epg-now">' + esc(window.t('next')) + ': ' + esc(this.epgInfo.next.title || '') + '</span>');
      }
    }
    this.subEl.innerHTML = parts.join('<span class="epg-sep">·</span>');
    if (!this.isLive) {
      this.liveNow.textContent = '';
      this.liveNext.textContent = '';
      this.liveNextTime.textContent = '';
      this.liveRemaining.textContent = '';
      this.setLatency('');
      return;
    }

    const current = this.epgInfo && this.epgInfo.current;
    const next = this.epgInfo && this.epgInfo.next;
    const hasEpg = !!(current || next);
    this.liveEpg.classList.toggle('empty', !hasEpg);
    this.liveEpg.hidden = !hasEpg;
    this.liveBar.hidden = !current;
    this.liveNextRow.hidden = !next;
    if (this.liveAddEpg) this.liveAddEpg.hidden = hasEpg || typeof this.context?.onAddEpg !== 'function';

    this.liveNowTag.textContent = current ? window.t('now') : window.t('next');
    if (current) {
      this.liveNow.textContent = current.title || '';
      this.liveNow.title = current.desc || current.title || '';
    } else if (next) {
      this.liveNow.textContent = next.title || '';
      this.liveNow.title = next.desc || next.title || '';
    } else {
      this.liveNow.textContent = window.t('prog_no_epg');
      this.liveNow.title = '';
    }

    this.liveNext.textContent = next ? (next.title || '') : '';
    this.liveNext.title = next && next.desc ? next.desc : '';
    this.liveNextTime.textContent = next && next.start
      ? window.ltr(window.I18N.date(next.start))
      : '';
    this.lastLeftMin = null;
    this.updateProgrammeProgress();
  }

  /* Current programme progress bar + remaining time. Runs on every timeupdate
     while live; the label only rewrites when the minute changes. */
  updateProgrammeProgress() {
    if (!this.isLive) return;
    const cur = this.epgInfo && this.epgInfo.current;
    if (!cur || !cur.start || !cur.stop || cur.stop <= cur.start) {
      this.liveBarFill.style.width = '0%';
      this.liveRemaining.textContent = '';
      return;
    }
    const now = Date.now();
    const span = cur.stop - cur.start;
    const pct = Math.max(0, Math.min(1, (now - cur.start) / span));
    this.liveBarFill.style.width = (pct * 100).toFixed(2) + '%';
    const mins = Math.max(0, Math.round((cur.stop - now) / 60000));
    if (mins !== this.lastLeftMin) {
      this.lastLeftMin = mins;
      this.liveRemaining.textContent = window.ltr(fmtLeft(cur.stop - now));
    }
  }

  setLiveState(on, force) {
    if (this.isLive === on && !force) return;
    this.isLive = on;
    this.root.classList.toggle('is-live', on);
    this.liveStrip.hidden = !on;
    if (this.topLive) this.topLive.hidden = !on;
    const dvr = on && this.liveDvrEnabled();
    this.seek.disabled = on && !dvr;
    this.seekRow.hidden = on && !dvr;
    if (on) {
      if (!dvr) { this.timeNow.textContent = ''; this.timeTotal.textContent = ''; }
      this.setLatency('');
    } else {
      this.setLatency('');
      this.timeNow.textContent = '0:00';
      this.timeTotal.textContent = '0:00';
      if (this.goLiveBtn) this.goLiveBtn.hidden = true;
    }
    this.updateMeta();
    this.updateGoLiveButton();
  }

  load(item) {
    if (!this._foLoading) this._fo = null;
    this.loadToken = (this.loadToken || 0) + 1;
    const token = this.loadToken;
    this.teardown();
    this.setLoading(true);
    this.loadingLabel.textContent = window.t('loading_stream');
    this.hideError();
    this.errorCount = 0;
    this.stopped = false;
    this.video.volume = Math.min(1, Math.max(0, Number(this.opts.settings?.volume ?? 100) / 100));
    this.video.playbackRate = Number(this.opts.settings?.rate || 1);
    this.speedSel.value = String(this.video.playbackRate);
    this.volBar.value = String(Math.round(this.video.volume * 100));
    this.updateVolumeIcon();
    this.updateQuality();

    const url = item.url;
    this.setLiveState(item.kind === 'live', true);

    const headers = normalizePlaybackHeaders(item.headers);
    const hasHeaders = Object.keys(headers).length > 0;

    if (/\.m3u8(\?|$)/i.test(url)) {
      this.startHls(url, headers, hasHeaders, token);
    } else if (/\.(ts|m2ts|flv)(\?|$)/i.test(url)) {
      this.startMpegts(url, headers, token);
    } else if (/\.mpd(\?|$)/i.test(url)) {
      this.startDash(url, headers, hasHeaders, token);
    } else {
      this.startNative(url);
    }
  }

  startHls(url, headers, hasHeaders, token = this.loadToken) {
    if (window.Hls && window.Hls.isSupported()) {
      const s = this.opts.settings || {};
      const retries = Math.max(0, Number(s.retryCount ?? 2));
      const timeout = Math.max(10000, Number(s.networkTimeout ?? 30) * 1000);
      const hls = new window.Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
        maxBufferLength: 30,
        manifestLoadingMaxRetry: retries,
        manifestLoadingTimeOut: timeout,
        levelLoadingMaxRetry: retries,
        levelLoadingTimeOut: timeout,
        fragLoadingMaxRetry: retries,
        fragLoadingTimeOut: timeout,
        xhrSetup: (xhr) => {
          if (!hasHeaders) return;
          for (const key of Object.keys(headers)) {
            try { xhr.setRequestHeader(key, headers[key]); } catch (_) {}
          }
        }
      });
      this.hls = hls;
      const stale = () => this.loadToken !== token || this.hls !== hls;
      hls.on(window.Hls.Events.MEDIA_ATTACHED, () => { if (!stale()) hls.loadSource(url); });
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        if (stale()) return;
        const details = hls.levels && hls.levels[0] && hls.levels[0].details;
        if (details && details.live) this.setLive(true);
        this.setLoading(false);
        this.applyQualityPref();
        this.updateQuality();
        this.tryPlay();
        this.refreshTracks();
      });
      hls.on(window.Hls.Events.LEVEL_SWITCHED, () => {
        if (stale()) return;
        this.updateQuality();
        this.refreshTracks();
      });
      hls.on(window.Hls.Events.ERROR, (_evt, data) => {
        if (stale()) return;
        if (!data || !data.fatal) return;
        if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR && this.errorCount < 2) {
          this.errorCount += 1;
          try { hls.recoverMediaError(); } catch (_) {}
          return;
        }
        if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR && this.errorCount < 2) {
          this.errorCount += 1;
          try { hls.startLoad(); } catch (_) {}
          return;
        }
        this.showError(data.details || 'HLS error');
      });
      hls.attachMedia(this.video);
    } else if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
      if (this.loadToken === token) this.startNative(url);
    } else {
      if (this.loadToken === token) this.showError('HLS is not supported');
    }
  }

  startMpegts(url, headers = {}, token = this.loadToken) {
    let supported = false;
    try {
      supported = !!(window.mpegts && window.mpegts.isSupported && window.mpegts.isSupported() &&
        window.mpegts.getFeatureList && window.mpegts.getFeatureList().mseLivePlayback);
    } catch (_) { supported = false; }
    if (supported) {
      const type = /\.flv(\?|$)/i.test(url) ? 'flv' : /\.m2ts(\?|$)/i.test(url) ? 'm2ts' : 'mpegts';
      const player = window.mpegts.createPlayer(
        { type, isLive: this.isLive, url },
        { enableWorker: true, lazyLoad: false, liveBufferLatencyChasing: true, headers: normalizePlaybackHeaders(headers) }
      );
      this.mpegts = player;
      const stale = () => this.loadToken !== token || this.mpegts !== player;
      player.on(window.mpegts.Events.ERROR, () => { if (!stale()) this.showError('TS stream error'); });
      player.attachMediaElement(this.video);
      player.load();
      if (!stale()) this.tryPlay();
    } else if (this.loadToken === token) {
      this.startNative(url);
    }
  }

  startDash(url, headers, hasHeaders, token = this.loadToken) {
    const dashjs = window.dashjs;
    if (dashjs && dashjs.MediaPlayer) {
      try {
        const player = dashjs.MediaPlayer().create();
        this.dash = player;
        const stale = () => this.loadToken !== token || this.dash !== player;
        if (hasHeaders && typeof player.extend === 'function') {
          const safeHeaders = normalizePlaybackHeaders(headers);
          player.extend('RequestModifier', () => ({
            modifyRequestHeader: (xhr) => {
              Object.keys(safeHeaders).forEach((name) => {
                try { xhr.setRequestHeader(name, safeHeaders[name]); } catch (_) {}
              });
              return xhr;
            },
            modifyRequestURL: (requestUrl) => requestUrl
          }), true);
        }
        player.initialize(this.video, url, true);
        try {
          player.on(dashjs.MediaPlayer.events.ERROR, () => { if (!stale()) this.showError('DASH stream error'); });
          player.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => { if (!stale()) { this.setLoading(false); this.updateQuality(); } });
        } catch (_) {}
        if (!stale()) this.tryPlay();
        return;
      } catch (_) {
        try { if (this.dash && this.dash.reset) this.dash.reset(); } catch (_) {}
        this.dash = null;
      }
    }
    if (this.loadToken === token) this.showError('DASH playback engine could not be started.');
  }

  startNative(url) {
    this.video.src = url;
    this.tryPlay();
  }

  tryPlay() {
    if (!this.item || this.loadToken == null) return;
    const p = this.video.play();
    if (p && p.catch) {
      p.catch(() => {
        this.setLoading(false);
        this.updatePlayIcon();
      });
    }
  }

  onMetadata() {
    this.setLoading(false);
    if (this.resumeAt > 5 && Number.isFinite(this.video.duration) && this.resumeAt < this.video.duration - 5) {
      try {
        this.video.currentTime = this.resumeAt;
        this.opts.toast && this.opts.toast(window.t('resumed'), 'ok');
      } catch (_) {}
    }
    this.resumeAt = 0;
    this.onBuffered();
    this.updatePlayIcon();
    this.updateQuality();
  }

  onTimeUpdate() {
    const v = this.video;
    const t = v.currentTime || 0;
    const d = v.duration;

    if (this.isLive) {
      this.updateLatency();
      this.updateProgrammeProgress();
      this.updateGoLiveButton();
      // DVR/timeshift (feature 1)
      const dvr = this.liveDvrEnabled();
      if (dvr !== this._dvrOn) { this._dvrOn = dvr; this.setLiveState(true, true); }
      if (dvr) {
        const { start, end } = this.liveSeekRange();
        const span = Math.max(0.1, end - start);
        this.seek.disabled = false;
        this.seekRow.hidden = false;
        this.seek.value = String(Math.max(0, Math.min(1000, Math.round(((t - start) / span) * 1000))));
        this.timeNow.textContent = '-' + fmtTime(Math.max(0, end - t));
        this.timeTotal.textContent = window.t ? window.t('live') : 'LIVE';
      }
    } else {
      this.timeNow.textContent = fmtTime(t);
      this.timeTotal.textContent = fmtTime(d);
      if (Number.isFinite(d) && d > 0) {
        this.seek.value = String(Math.round((t / d) * 1000));
      }
    }

    this.renderer.render(t);
    this.checkSleepTimer();

    if (!this.isLive && this.item && Number.isFinite(d) && d > 0) {
      const now = Date.now();
      if (now - this.progressTimer > 5000) {
        this.progressTimer = now;
        if (this.opts.onProgress) this.opts.onProgress(this.item, t, d);
      }
    }
  }

  updateSeekPreview(e) {
    if (!this.seek) return;
    const rect = this.seek.getBoundingClientRect();
    const x = Math.min(Math.max(0, (e.clientX - rect.left) / Math.max(1, rect.width)), 1);
    let label = '';
    if (this.isLive && this.liveDvrEnabled()) {
      const { start, end } = this.liveSeekRange();
      const t = start + x * Math.max(0.1, end - start);
      label = '-' + fmtTime(Math.max(0, end - t));
    } else if (!this.isLive && Number.isFinite(this.video.duration)) {
      label = fmtTime(x * this.video.duration);
    } else return;
    this.seek.title = label;
  }
  hideSeekPreview() { if (this.seek) this.seek.title = ''; }

  updateLatency() {
    if (!this.isLive) return;
    const lat = this.hls && Number.isFinite(this.hls.latency) ? this.hls.latency : null;
    if (lat != null && lat >= 1 && lat <= 90) {
      const shown = lat < 10 ? lat.toFixed(1) : String(Math.round(lat));
      this.setLatency(window.ltr(window.t('live_latency', { n: shown })));
    } else {
      this.setLatency('');
    }
  }

  /* The latency pill lives in the programme strip and in the minimal top bar;
     both must stay in sync. */
  setLatency(text) {
    const txt = text || '';
    if (this.liveLatency) this.liveLatency.textContent = txt;
    if (this.topLatency) this.topLatency.textContent = txt;
  }

  onBuffered() {
    if (!this.statsVisible()) return;
    this.updateStats();
  }

  onEnded() {
    if (this.opts.onProgress && this.item) {
      this.opts.onProgress(this.item, 0, Number.isFinite(this.video.duration) ? this.video.duration : 0);
    }
    if (this.isLive) return;
    if (this.repeatMode === 'one') {
      try { this.video.currentTime = 0; this.tryPlay(); } catch (_) {}
      return;
    }
    if (this.repeatMode === 'all') { this.playNext(); return; }
    const autoNext = this.opts.settings?.autoNext !== false;
    if (autoNext) this.playNext();
  }

  reload() {
    if (!this.item) return;
    this.errorCount = 0;
    this.stopped = false;
    this.load(this.item);
  }

  /* ---------------- playback API ---------------- */



  setLive(on) {
    this.setLiveState(on);
  }

  updatePlayIcon() {
    this.playBtn.innerHTML = this.video.paused ? SVG_PLAY : SVG_PAUSE;
  }

  updateCenter(persist) {
    if (!this.open || !this.errorBox.hidden) return;
    this.centerIco.innerHTML = this.video.paused ? SVG_PLAY : SVG_PAUSE;
    this.center.hidden = false;
    this.center.classList.add('show');
    clearTimeout(this.centerTimer);
    if (!persist) {
      this.centerTimer = setTimeout(() => {
        this.center.classList.remove('show');
        setTimeout(() => {
          if (!this.center.classList.contains('show')) this.center.hidden = true;
        }, 200);
      }, 650);
    }
  }

  seekBy(delta) {
    if (this.controlsBlocked()) return;
    const d = Number(delta) || this.seekStep || 10;
    if (this.isLive) {
      if (!this.liveDvrEnabled()) return;
      const { start, end } = this.liveSeekRange();
      const target = Math.min(end, Math.max(start, this.video.currentTime + d));
      try { this.video.currentTime = target; } catch (_) {}
      return;
    }
    if (!Number.isFinite(this.video.duration)) return;
    this.video.currentTime = Math.min(this.video.duration, Math.max(0, this.video.currentTime + d));
  }

  liveSeekRange() {
    const v = this.video;
    try {
      if (v.seekable && v.seekable.length) {
        return { start: v.seekable.start(0), end: v.seekable.end(v.seekable.length - 1) };
      }
    } catch (_) {}
    return { start: 0, end: Number.isFinite(v.duration) ? v.duration : 0 };
  }
  liveDvrEnabled() {
    if (!this.isLive) return false;
    const { start, end } = this.liveSeekRange();
    return Number.isFinite(end - start) && (end - start) > 20;
  }

  setVolume(value) {
    const vol = Math.min(1, Math.max(0, value));
    this.video.volume = vol;
    this.video.muted = false;
    this.volBar.value = String(Math.round(vol * 100));
    this.updateVolumeIcon();
    this.opts.patchSettings && this.opts.patchSettings({ volume: Math.round(vol * 100) });
  }

  toggleMute() {
    this.video.muted = !this.video.muted;
    this.updateVolumeIcon();
  }

  updateVolumeIcon() {
    this.muteBtn.innerHTML = this.video.muted || this.video.volume === 0 ? SVG_MUTE : SVG_VOL;
  }

  cycleAspect() {
    const order = ['contain', 'cover', 'stretch', 'zoom'];
    const current = this.aspectMode || 'contain';
    const next = order[(order.indexOf(current) + 1) % order.length];
    this.setAspect(next);
  }

  setAspect(mode, persist = true) {
    const m = ['contain','cover','stretch','zoom'].includes(mode) ? mode : 'contain';
    this.aspectMode = m;
    this.video.classList.remove('fit-fill','fit-cover','fit-contain','fit-stretch','fit-zoom');
    if (m === 'cover') this.video.classList.add('fit-fill','fit-cover');
    else if (m === 'stretch') this.video.classList.add('fit-stretch');
    else if (m === 'zoom') this.video.classList.add('fit-zoom');
    else this.video.classList.add('fit-contain');
    const labels = { contain: window.t('fit'), cover: window.t('fill'), stretch: window.t('stretch'), zoom: window.t('zoom') };
    if (this.aspectBtn) this.aspectBtn.textContent = labels[m] || window.t('fit');
    if (persist) this.opts.patchSettings && this.opts.patchSettings({ aspect: m });
  }

  async toggleFullscreen() {
    try {
      if (window.api && window.api.window && window.api.window.toggleFullScreen) {
        await window.api.window.toggleFullScreen();
      }
    } catch (_) {}
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      const target = this.root || this.video || document.documentElement;
      if (target && target.requestFullscreen) {
        await target.requestFullscreen();
      } else if (this.video && this.video.webkitRequestFullscreen) {
        this.video.webkitRequestFullscreen();
      }
    } catch (_) {
      try {
        if (document.documentElement && document.documentElement.requestFullscreen && !document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
      } catch (_) {}
    }
  }

  async togglePip() {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        return;
      }
      if (document.pictureInPictureEnabled === false || !this.video || !this.video.requestPictureInPicture) {
        this.opts.toast && this.opts.toast(window.t('pip_unavailable') || 'Picture-in-Picture unavailable', 'warn');
        return;
      }
      await this.video.requestPictureInPicture();
    } catch (err) {
      this.opts.toast && this.opts.toast(window.t('pip_failed') || 'Picture-in-Picture failed', 'warn');
    }
  }

  /* ---------------- navigation ---------------- */

  playNext() {
    const list = this.context?.playlist || [];
    if (!list.length) return;
    const idx = list.findIndex((x) => x.key && this.item && x.key === this.item.key);
    const next = idx >= 0 ? list[(idx + 1) % list.length] : list[0];
    if (next) this.openItem(next, { ...this.context, resume: next.position || 0 });
  }

  playPrev() {
    const list = this.context?.playlist || [];
    if (!list.length) return;
    const idx = list.findIndex((x) => x.key && this.item && x.key === this.item.key);
    const prev = idx > 0 ? list[idx - 1] : list[list.length - 1];
    if (prev) this.openItem(prev, { ...this.context, resume: prev.position || 0 });
  }

  toggleDrawer(force) {
    const next = force === undefined ? !this.drawer.classList.contains('open') : force;
    if (this.drawerBtn) this.drawerBtn.classList.toggle('on', next);
    if (next) {
      this.poke();
      this.drawer.hidden = false;
      // Force a reflow before adding the class so the slide-in transition still
      // runs. Using requestAnimationFrame here is unreliable: it can be
      // throttled or paused while the window is hidden or in the background,
      // which would leave the drawer painted but stuck off-screen.
      void this.drawer.offsetWidth;
      this.drawer.classList.add('open');
      this.drawerSearch.placeholder = window.t('search_channels');
      this.renderDrawer(true);
    } else {
      this.drawer.classList.remove('open');
      setTimeout(() => { if (!this.drawer.classList.contains('open')) this.drawer.hidden = true; }, 240);
    }
  }

  renderDrawer(reset) {
    const drawerTitle = document.querySelector('.drawer-title');
    if (drawerTitle) drawerTitle.textContent = this.favoritesMode
      ? (window.t ? window.t('nav_favorites') : 'My List')
      : (window.t ? window.t('all_channels') : 'All channels');
    if (!this.drawerList) return;
    const all = this.context?.playlist || [];
    const term = (this.drawerSearch.value || '').toLowerCase().trim();
    const number = (window.I18N && window.I18N.number) ? window.I18N.number.bind(window.I18N) : String;
    const groupOf = (x) => x.group || window.t('uncategorized');

    /* The drawer merges the Live TV browser into the player: categories on one
       side, every channel on the other, plus the same duplicate filter. */
    let base = all;
    if (this.drawerDedupeOn) {
      const seen = new Set();
      base = all.filter((x) => {
        const k = (x.name || '').toLowerCase().trim();
        if (!k) return true;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }

    const counts = new Map();
    for (const item of base) {
      const g = groupOf(item);
      counts.set(g, (counts.get(g) || 0) + 1);
    }
    const groups = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    if (this.drawerGroup && !counts.has(this.drawerGroup)) this.drawerGroup = '';

    const matched = term
      ? base.filter((x) => (x.name || '').toLowerCase().includes(term) || (x.group || '').toLowerCase().includes(term))
      : base;
    const filtered = this.drawerGroup
      ? matched.filter((x) => groupOf(x) === this.drawerGroup)
      : matched;

    if (reset) this.drawerShown = DRAWER_PAGE;
    if (!this.drawerShown || this.drawerShown < DRAWER_PAGE) this.drawerShown = DRAWER_PAGE;

    const activeIdx = filtered.findIndex((x) => sameItem(x, this.item));
    const shown = filtered.slice(0, this.drawerShown);

    /* ---- categories pane (hidden when the playlist has a single group) ---- */
    const showGroups = groups.length > 1;
    this.drawer.classList.toggle('with-groups', showGroups);
    this.drawerGroups.hidden = !showGroups;
    if (showGroups) {
      this.drawerGroupsList.innerHTML = '';
      const allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.className = 'drawer-group' + (this.drawerGroup ? '' : ' on');
      const allName = document.createElement('span');
      allName.className = 'g-name';
      allName.textContent = this.favoritesMode
        ? (window.t ? window.t('nav_favorites') : 'My List')
        : window.t('all_channels');
      const allCount = document.createElement('span');
      allCount.className = 'g-count';
      allCount.textContent = number(base.length);
      allBtn.appendChild(allName);
      allBtn.appendChild(allCount);
      allBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.drawerGroup = '';
        this.renderDrawer(true);
        this.drawerList.scrollTop = 0;
        this.saveDrawerState();
      });
      this.drawerGroupsList.appendChild(allBtn);
      for (const [g, n] of groups) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'drawer-group' + (this.drawerGroup === g ? ' on' : '');
        btn.title = g;
        btn.appendChild(el('span', 'g-name', g));
        btn.appendChild(el('span', 'g-count', number(n)));
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.drawerGroup = g;
          this.renderDrawer(true);
          this.drawerList.scrollTop = 0;
          this.saveDrawerState();
        });
        this.drawerGroupsList.appendChild(btn);
      }
    }

    this.drawerCount.textContent = filtered.length
      ? window.t('of_total', { shown: number(shown.length), total: number(filtered.length) })
      : '';

    this.drawerList.innerHTML = '';
    if (!shown.length) {
      const empty = document.createElement('div');
      empty.className = 'drawer-empty';
      empty.textContent = window.t('no_results');
      this.drawerList.appendChild(empty);
    }

    /* The playing channel can sit thousands of entries deep. Pin it above the
       paginated list so it is always visible and clearly marked. */
    const activeInGroup = !this.drawerGroup
      || (this.item && groupOf(this.item) === this.drawerGroup);
    const pinned = !term && this.item && this.item.url && activeInGroup
      && (activeIdx < 0 || activeIdx >= this.drawerShown);
    if (pinned) {
      const wrap = document.createElement('div');
      wrap.className = 'drawer-current';
      const head = document.createElement('div');
      head.className = 'drawer-current-head';
      head.textContent = window.t('now_playing');
      wrap.appendChild(head);
      wrap.appendChild(this.buildDrawerItem(this.item, true));
      this.drawerList.appendChild(wrap);
    }

    for (const item of shown) {
      this.drawerList.appendChild(this.buildDrawerItem(item, false));
    }

    const remaining = filtered.length - shown.length;
    this.drawerMore.hidden = remaining <= 0;
    this.drawerMore.textContent = remaining > 0
      ? window.t('load_more') + ' · ' + number(remaining)
      : window.t('load_more');

    if (reset && !pinned) {
      const active = this.drawerList.querySelector('.drawer-item.on');
      if (active) active.scrollIntoView({ block: 'nearest' });
    }
  }

  buildDrawerItem(item, pinned) {
    const active = sameItem(item, this.item);
    const recTarget = this.isRecordingTarget(item);
    const btn = document.createElement('button');
    btn.className = 'drawer-item' + (active ? ' on' : '') + (pinned ? ' pinned' : '') + (recTarget ? ' recording-target' : '');
    if (active) btn.setAttribute('aria-current', 'true');

    const logo = document.createElement('div');
    logo.className = 'd-logo';
    if (item.logo) {
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.src = item.logo;
      img.addEventListener('error', () => { img.remove(); logo.textContent = playerInitials(item.name); });
      logo.appendChild(img);
    } else {
      logo.textContent = playerInitials(item.name);
    }

    const body = document.createElement('div');
    body.className = 'd-body';
    const n = document.createElement('div');
    n.className = 'n';
    const nameText = document.createElement('span');
    nameText.className = 'd-name';
    nameText.textContent = item.name || '';
    n.appendChild(nameText);
    const favInd = document.createElement('span');
    const isFav = !!(this.opts.isFavorite && this.opts.isFavorite(item));
    favInd.className = 'd-fav' + (isFav ? ' on' : '');
    favInd.setAttribute('aria-hidden', 'true');
    favInd.innerHTML = isFav
      ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.3S3.5 15.4 3.5 9.4A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8.5 2.8c0 6-8.5 10.9-8.5 10.9Z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.3S3.5 15.4 3.5 9.4A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8.5 2.8c0 6-8.5 10.9-8.5 10.9Z"/></svg>';
    n.appendChild(favInd);
    const g = document.createElement('div');
    g.className = 'g';
    g.textContent = item.group || window.t('nav_live');
    const now = document.createElement('div');
    now.className = 'd-now';
    try {
      const info = active
        ? this.epgInfo
        : (this.context && typeof this.context.getEpgFor === 'function' ? this.context.getEpgFor(item) : null);
      if (info && info.current) now.textContent = window.t('now') + ': ' + info.current.title;
      else if (info && info.next) now.textContent = window.t('next') + ': ' + info.next.title;
    } catch (_) {}
    body.appendChild(n);
    body.appendChild(g);
    body.appendChild(now);

    btn.appendChild(logo);
    btn.appendChild(body);
    if (recTarget) {
      const badge = document.createElement('span');
      badge.className = 'drawer-rec-badge';
      badge.textContent = 'REC';
      btn.appendChild(badge);
    }
    btn.addEventListener('click', () => {
      if (active) { this.toggleDrawer(false); return; }
      const epg = this.context && typeof this.context.getEpgFor === 'function' ? this.context.getEpgFor(item) : null;
      this.openItem(item, { ...this.context, resume: item.position || 0, epg });
      this.toggleDrawer(false);
    });
    return btn;
  }

  /* ---------------- subtitles ---------------- */

  refreshTracks() {
    let has = false;
    const hlsTracks = this.hls && this.hls.subtitleTracks ? this.hls.subtitleTracks : [];
    if (hlsTracks.length) has = true;
    const native = this.video.textTracks ? Array.from(this.video.textTracks) : [];
    if (native.some((t) => t.kind === 'subtitles' || t.kind === 'captions')) has = true;
    if (this.subsBtn2) this.subsBtn2.classList.toggle('on', has || this.subCues.length > 0);
    const saved = (this.opts.settings || {}).perChannelAudio || {};
    const trk = saved[(this.item && this.item.key)] || {};
    const prefAudio = String((this.opts.settings || {}).preferredAudioLang || '').toLowerCase();
    const prefSub = String((this.opts.settings || {}).preferredSubtitleLang || '').toLowerCase();

    if (this.hls && this.hls.audioTracks && this.hls.audioTracks.length) {
      if (trk.audio != null && this.hls.audioTracks[trk.audio]) {
        try { this.hls.audioTrack = trk.audio; } catch (_) {}
      } else if (prefAudio) {
        const idx = this.hls.audioTracks.findIndex(t => String(t.lang||t.name||'').toLowerCase().includes(prefAudio));
        if (idx >= 0) { try { this.hls.audioTrack = idx; } catch (_) {} }
      }
    }

    if (trk.sub === -1) {
      // Explicit "off" from the user wins over any saved track or language preference.
      try { if (this.hls) { this.hls.subtitleDisplay = false; this.hls.subtitleTrack = -1; } } catch (_) {}
      native.forEach((t) => { if (t.kind === 'subtitles' || t.kind === 'captions') t.mode = 'disabled'; });
    } else if (trk.sub != null && hlsTracks.length) {
      this.hls.subtitleDisplay = true;
      this.hls.subtitleTrack = trk.sub;
    } else if (trk.sub != null) {
      const nativeSubs = native.map((t, i) => ({ t, i })).filter(x => x.t.kind === 'subtitles' || x.t.kind === 'captions');
      if (nativeSubs.length) nativeSubs.forEach(x => { x.t.mode = x.i === trk.sub ? 'showing' : 'disabled'; });
    } else if (prefSub && hlsTracks.length) {
      const idx = hlsTracks.findIndex(t => String(t.lang||t.name||'').toLowerCase().includes(prefSub));
      if (idx >= 0) { this.hls.subtitleDisplay = true; this.hls.subtitleTrack = idx; }
    } else if (prefSub) {
      const nativeSubs = native.map((t,i)=>({t,i})).filter(x => x.t.kind === 'subtitles' || x.t.kind === 'captions');
      const found = nativeSubs.find(x => String(x.t.language||x.t.label||'').toLowerCase().includes(prefSub));
      if (found) nativeSubs.forEach(x => { x.t.mode = x.i === found.i ? 'showing' : 'disabled'; });
    }
  }

  showSubtitlePop() {
    this.poke();
    this.popOwner = 'subs';
    const hlsTracks = this.hls && this.hls.subtitleTracks ? this.hls.subtitleTracks : [];
    const nativeTracks = this.video.textTracks ? Array.from(this.video.textTracks) : [];
    const s = this.opts.settings?.subtitle || {};

    let html = '<div class="pop-title">' + window.t('subtitles') + '</div>';
    html += '<button class="pop-item" data-sub="off">' + (this.subCues.length || this.textTrackIndex >= 0 ? '' : '✓ ') + window.t('subtitles_off') + '</button>';
    hlsTracks.forEach((track, i) => {
      const on = this.hls.subtitleDisplay && this.hls.subtitleTrack === i;
      html += '<button class="pop-item' + (on ? ' on' : '') + '" data-hls-sub="' + i + '">' + (on ? '✓ ' : '') + esc(track.name || track.lang || ('Track ' + (i + 1))) + '</button>';
    });
    // Keep the global textTrack index: metadata/chapter tracks may precede subs.
    nativeTracks.map((track, i) => ({ track, i })).filter((x) => x.track.kind === 'subtitles' || x.track.kind === 'captions').forEach(({ track, i }) => {
      html += '<button class="pop-item' + (track.mode === 'showing' ? ' on' : '') + '" data-native-sub="' + i + '">' + (track.mode === 'showing' ? '✓ ' : '') + esc(track.label || track.language || ('Track ' + (i + 1))) + '</button>';
    });
    if (this.subCues.length) {
      html += '<div class="pop-title" style="margin-top:10px">' + esc(this.subName || 'External') + '</div>';
    }
    html += '<hr>';
    html += '<button class="pop-item" data-sub-file="1">📂 ' + window.t('choose_subtitle') + '</button>';
    html += '<div class="pop-title" style="margin-top:10px">' + window.t('subtitles_settings') + '</div>';
    html += '<div class="pop-row"><label>' + window.t('size') + '</label><input data-ss="size" type="range" min="60" max="200" value="' + (s.size || 100) + '"></div>';
    html += '<div class="pop-row"><label>' + window.t('opacity') + '</label><input data-ss="bgOpacity" type="range" min="0" max="100" value="' + Math.round((s.bgOpacity ?? 0.55) * 100) + '"></div>';
    html += '<div class="pop-row"><label>' + window.t('bottom_offset') + '</label><input data-ss="bottom" type="range" min="2" max="35" value="' + (s.bottom || 8) + '"></div>';
    html += '<div class="pop-row"><label>' + window.t('delay') + '</label><input data-ss="delay" type="range" min="-10" max="10" step="0.25" value="' + (s.delay || 0) + '"><span id="delayVal" class="tiny">' + (s.delay || 0) + 's</span></div>';
    html += '<div class="pop-row"><label>' + window.t('color') + '</label><div class="swatches" style="flex:1.3">' +
      ['#ffffff', '#ffe66d', '#7df9ff', '#ff6b6b', '#7dff9b', '#d0a6ff'].map((c) =>
        '<button class="swatch' + ((s.color || '#ffffff').toLowerCase() === c ? ' on' : '') + '" data-color="' + c + '" style="background:' + c + ';width:22px;height:22px"></button>').join('') +
      '</div></div>';
    html += '<div class="pop-row"><label>' + window.t('bold') + '</label><button class="switch' + (s.bold ? ' on' : '') + '" data-bold="1"></button></div>';

    this.pop.innerHTML = html;
    this.pop.hidden = false;

    this.pop.querySelectorAll('[data-sub="off"]').forEach((el) => el.addEventListener('click', () => {
      this.clearSubtitles();
      this.pop.hidden = true; this.popOwner = null;
    }));
    this.pop.querySelectorAll('[data-hls-sub]').forEach((el) => el.addEventListener('click', () => {
      const idx = Number(el.getAttribute('data-hls-sub'));
      if (this.hls) {
        this.hls.subtitleDisplay = true;
        this.hls.subtitleTrack = idx;
      }
      const key = (this.item && this.item.key) || 'default';
      const per = Object.assign({}, (this.opts.settings || {}).perChannelAudio || {});
      per[key] = Object.assign({}, (per[key] || {}), { sub: idx });
      this.opts.patchSettings && this.opts.patchSettings({ perChannelAudio: per });
      this.pop.hidden = true; this.popOwner = null;
    }));
    this.pop.querySelectorAll('[data-native-sub]').forEach((el) => el.addEventListener('click', () => {
      const idx = Number(el.getAttribute('data-native-sub'));
      this.selectNativeTrack(idx);
      // Persist the global textTrack index so refreshTracks() reapplies the same track.
      const key = (this.item && this.item.key) || 'default';
      const per = Object.assign({}, (this.opts.settings || {}).perChannelAudio || {});
      per[key] = Object.assign({}, (per[key] || {}), { sub: idx });
      this.opts.settings = Object.assign({}, this.opts.settings, { perChannelAudio: per });
      this.opts.patchSettings && this.opts.patchSettings({ perChannelAudio: per });
      this.pop.hidden = true; this.popOwner = null;
    }));
    const ss = this.pop.querySelector('[data-sub-search]'); if (ss) ss.addEventListener('click', () => { const q = encodeURIComponent((this.item && (this.item.name||this.item.title)) || ''); try { window.api.shell.openExternal('https://www.opensubtitles.com/en/search-all/q-' + q); } catch (_) {} this.pop.hidden = true; this.popOwner = null; });
    this.pop.querySelector('[data-sub-file]').addEventListener('click', () => {
      this.pop.hidden = true; this.popOwner = null;
      this.pickSubtitle();
    });

    const patch = (key, value) => {
      const sub = { ...(this.opts.settings?.subtitle || {}), [key]: value };
      this.renderer.setStyle(sub);
      this.opts.patchSettings && this.opts.patchSettings({ subtitle: sub });
      if (key === 'delay') this.renderer.setDelay(value);
    };

    this.pop.querySelectorAll('[data-ss]').forEach((el) => el.addEventListener('input', () => {
      const key = el.getAttribute('data-ss');
      let value = Number(el.value);
      if (key === 'bgOpacity') value = value / 100;
      patch(key, value);
      if (key === 'delay') {
        const label = document.getElementById('delayVal');
        if (label) label.textContent = value + 's';
      }
    }));
    this.pop.querySelectorAll('[data-color]').forEach((el) => el.addEventListener('click', () => {
      patch('color', el.getAttribute('data-color'));
      this.showSubtitlePop();
    }));
    this.pop.querySelector('[data-bold]').addEventListener('click', (e) => {
      const on = !(this.opts.settings?.subtitle?.bold);
      e.currentTarget.classList.toggle('on', on);
      patch('bold', on);
    });
  }

  async pickSubtitle() {
    try {
      const file = await window.api.dialog.openFile('subtitle');
      if (!file) return;
      let text = '';
      if (window.api.files.readBuffer) {
        const res = await window.api.files.readBuffer(file, 8 * 1024 * 1024);
        const b64 = res && (res.data || res.base64 || res);
        const bin = atob(typeof b64 === 'string' ? b64 : '');
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const tryDecode = (enc) => { try { return new TextDecoder(enc, { fatal: false }).decode(bytes); } catch (_) { return null; } };
        text = tryDecode('utf-8') || '';
        const bad = (text.match(/\uFFFD/g) || []).length;
        if (bad > 0) {
          for (const enc of ['windows-1256', 'windows-1252', 'iso-8859-6', 'iso-8859-1']) {
            const t = tryDecode(enc);
            if (t && ((t.match(/\uFFFD/g) || []).length < bad)) { text = t; break; }
          }
        }
      } else {
        text = await window.api.files.readText(file, 8 * 1024 * 1024);
      }
      const cues = parseSubtitles(text, file);
      if (!cues.length) {
        this.opts.toast && this.opts.toast(window.t('subtitle_failed'), 'err');
        return;
      }
      this.subCues = cues;
      this.subName = file.split(/[\\/]/).pop();
      this.renderer.setDelay(this.opts.settings?.subtitle?.delay || 0);
      this.renderer.setCues(cues);
      this.refreshTracks();
      this.opts.toast && this.opts.toast(window.t('subtitle_loaded'), 'ok');
    } catch (err) {
      this.opts.toast && this.opts.toast(window.t('subtitle_failed'), 'err');
    }
  }

  clearSubtitles() {
    this.subCues = [];
    this.subName = '';
    this.renderer.setCues([]);
    // Persist an explicit "off" so refreshTracks() cannot immediately re-enable
    // a saved track or a preferred-subtitle-language fallback.
    const key = (this.item && this.item.key) || 'default';
    const per = Object.assign({}, (this.opts.settings || {}).perChannelAudio || {});
    per[key] = Object.assign({}, per[key] || {}, { sub: -1 });
    this.opts.settings = Object.assign({}, this.opts.settings, { perChannelAudio: per });
    this.opts.patchSettings && this.opts.patchSettings({ perChannelAudio: per });
    if (this.hls) {
      this.hls.subtitleDisplay = false;
      this.hls.subtitleTrack = -1;
    }
    this.selectNativeTrack(-1);
    this.refreshTracks();
  }

  selectNativeTrack(index) {
    if (!this.video.textTracks) return;
    const tracks = Array.from(this.video.textTracks);
    tracks.forEach((track, i) => {
      if (track.kind === 'subtitles' || track.kind === 'captions') {
        track.mode = i === index ? 'showing' : 'disabled';
      }
    });
    this.textTrackIndex = index;
  }

  /* ---------------- settings pop ---------------- */

  showSettingsPop() {
    this.poke();
    this.popOwner = 'settings';
    const s = this.opts.settings || {};
    const aspect = this.video.classList.contains('fit-fill') ? 'cover' : 'contain';
    let html = '<div class="pop-title">' + window.t('playback') + '</div>';
    html += '<div class="pop-row"><label>' + window.t('aspect') + '</label><div class="seg"><button data-aspect="contain" class="' + (aspect === 'contain' ? 'on' : '') + '">' + window.t('fit') + '</button><button data-aspect="cover" class="' + (aspect === 'cover' ? 'on' : '') + '">' + window.t('fill') + '</button></div></div>';
    if (this.isLive) {
      html += '<div class="pop-row"><label>' + window.t('live') + '</label><span class="tiny">' + esc((this.topLatency || this.liveLatency)?.textContent || window.t('live')) + '</span></div>';
    } else {
      html += '<div class="pop-row"><label>' + window.t('speed') + '</label><span class="tiny">' + Number(this.video.playbackRate || 1) + '×</span></div>';
    }
    html += '<hr>';
    html += '<div class="pop-row"><label>' + window.t('autoplay_next') + '</label><button class="switch' + (s.autoNext !== false ? ' on' : '') + '" data-auto="1"></button></div>';
    html += '<div class="pop-row"><label>' + window.t('stats') + '</label><button class="switch' + (this.statsPanel.hidden ? '' : ' on') + '" data-stats="1"></button></div>';
    html += '<hr>';
    html += '<div class="pop-actions"><button class="btn btn-ghost btn-sm" data-sub="1">' + window.t('subtitles') + '</button><button class="btn btn-ghost btn-sm" data-full="1">' + window.t('fullscreen') + '</button></div>';

    this.pop.innerHTML = html;
    this.pop.hidden = false;

    this.pop.querySelectorAll('[data-aspect]').forEach((el) => el.addEventListener('click', () => {
      this.setAspect(el.getAttribute('data-aspect'));
      this.showSettingsPop();
    }));
    this.pop.querySelector('[data-auto]').addEventListener('click', (e) => {
      const on = !(this.opts.settings?.autoNext !== false);
      e.currentTarget.classList.toggle('on', on);
      this.opts.patchSettings && this.opts.patchSettings({ autoNext: on });
    });
    this.pop.querySelector('[data-stats]').addEventListener('click', (e) => {
      this.toggleStats();
      e.currentTarget.classList.toggle('on', !this.statsPanel.hidden);
    });
    this.pop.querySelector('[data-sub]').addEventListener('click', () => this.showSubtitlePop());
    this.pop.querySelector('[data-full]').addEventListener('click', () => this.toggleFullscreen());
  }

  showTracksPop() {
    this.poke();
    this.popOwner = 'tracks';
    const hlsAudio = this.hls && this.hls.audioTracks ? this.hls.audioTracks : [];
    const hlsSubs = this.hls && this.hls.subtitleTracks ? this.hls.subtitleTracks : [];
    const nativeTracks = this.video && this.video.textTracks
      ? Array.from(this.video.textTracks).map((t, i) => ({ t, i })).filter((x) => x.t.kind === 'subtitles' || x.t.kind === 'captions')
      : [];

    let html = '<div class="pop-title">' + window.t('audio') + '</div>';
    if (hlsAudio.length) {
      hlsAudio.forEach((track, i) => {
        const on = this.hls.audioTrack === i;
        html += '<button class="pop-item' + (on ? ' on' : '') + '" data-audio="' + i + '">' + (on ? '✓ ' : '') + esc(track.name || track.lang || ('Track ' + (i + 1))) + '</button>';
      });
    } else {
      html += '<div class="pop-hint">' + window.t('none') + '</div>';
    }
    html += '<div class="pop-title" style="margin-top:10px">' + window.t('audio_delay') + '</div>';
    html += '<div class="pop-row"><label>ms</label><input id="audioDelayRange2" type="range" min="-1000" max="1000" step="50" value="' + (this.audioDelay||0) + '"><span id="audioDelayVal2" class="tiny">' + (this.audioDelay||0) + '</span></div>';

    html += '<div class="pop-title" style="margin-top:10px">' + window.t('subtitles') + '</div>';
    const subOnOff = !(this.hls && this.hls.subtitleDisplay) && this.textTrackIndex < 0 && !this.subCues.length;
    html += '<button class="pop-item' + (subOnOff ? ' on' : '') + '" data-sub-off="1">' + (subOnOff ? '✓ ' : '') + window.t('subtitles_off') + '</button>';
    hlsSubs.forEach((track, i) => {
      const on = this.hls && this.hls.subtitleDisplay && this.hls.subtitleTrack === i;
      html += '<button class="pop-item' + (on ? ' on' : '') + '" data-hls-sub="' + i + '">' + (on ? '✓ ' : '') + esc(track.name || track.lang || ('Track ' + (i + 1))) + '</button>';
    });
    nativeTracks.forEach(({ t: track, i }) => {
      const on = track.mode === 'showing';
      html += '<button class="pop-item' + (on ? ' on' : '') + '" data-native-sub="' + i + '">' + (on ? '✓ ' : '') + esc(track.label || track.language || ('Track ' + (i + 1))) + '</button>';
    });
    html += '<button class="pop-item" data-sub-more="1">' + window.t('subtitles_settings') + '</button>';

    this.pop.innerHTML = html;
    this.pop.hidden = false;
    const adr = this.pop.querySelector('#audioDelayRange2');
    const adv = this.pop.querySelector('#audioDelayVal2');
    if (adr) adr.addEventListener('input', () => { this.audioDelay = Number(adr.value)||0; if (adv) adv.textContent = String(this.audioDelay); });

    this.pop.querySelectorAll('[data-audio]').forEach((el) => el.addEventListener('click', () => {
      const idx = Number(el.getAttribute('data-audio'));
      if (this.hls) this.hls.audioTrack = idx;
      const key = (this.item && this.item.key) || 'default';
      const per = Object.assign({}, (this.opts.settings || {}).perChannelAudio || {});
      per[key] = Object.assign({}, (per[key] || {}), { audio: idx });
      this.opts.patchSettings && this.opts.patchSettings({ perChannelAudio: per });
      this.pop.hidden = true; this.popOwner = null;
    }));
    this.pop.querySelectorAll('[data-sub-off]').forEach((el) => el.addEventListener('click', () => {
      this.clearSubtitles();
      this.pop.hidden = true; this.popOwner = null;
    }));
    this.pop.querySelectorAll('[data-hls-sub]').forEach((el) => el.addEventListener('click', () => {
      const idx = Number(el.getAttribute('data-hls-sub'));
      if (this.hls) { this.hls.subtitleDisplay = true; this.hls.subtitleTrack = idx; }
      const key = (this.item && this.item.key) || 'default';
      const per = Object.assign({}, (this.opts.settings || {}).perChannelAudio || {});
      per[key] = Object.assign({}, (per[key] || {}), { sub: idx });
      this.opts.patchSettings && this.opts.patchSettings({ perChannelAudio: per });
      this.pop.hidden = true; this.popOwner = null;
    }));
    this.pop.querySelectorAll('[data-native-sub]').forEach((el) => el.addEventListener('click', () => {
      const idx = Number(el.getAttribute('data-native-sub'));
      this.selectNativeTrack(idx);
      // Persist the global textTrack index so refreshTracks() reapplies the same track.
      const key = (this.item && this.item.key) || 'default';
      const per = Object.assign({}, (this.opts.settings || {}).perChannelAudio || {});
      per[key] = Object.assign({}, (per[key] || {}), { sub: idx });
      this.opts.settings = Object.assign({}, this.opts.settings, { perChannelAudio: per });
      this.opts.patchSettings && this.opts.patchSettings({ perChannelAudio: per });
      this.pop.hidden = true; this.popOwner = null;
    }));
    const more = this.pop.querySelector('[data-sub-more]');
    if (more) more.addEventListener('click', () => { this.pop.hidden = true; this.popOwner = null; this.showSubtitlePop(); });
  }

  showAudioPop() {
    this.poke();
    this.popOwner = 'audio';
    const hlsAudio = this.hls && this.hls.audioTracks ? this.hls.audioTracks : [];
    if (!hlsAudio.length) return;
    let html = '<div class="pop-title">' + window.t('audio') + '</div>';
    hlsAudio.forEach((track, i) => {
      const on = this.hls.audioTrack === i;
      html += '<button class="pop-item' + (on ? ' on' : '') + '" data-audio="' + i + '">' + (on ? '✓ ' : '') + esc(track.name || track.lang || ('Track ' + (i + 1))) + '</button>';
    });
    this.pop.innerHTML = html;
    this.pop.hidden = false;
    this.pop.querySelectorAll('[data-audio]').forEach((el) => el.addEventListener('click', () => {
      const idx = Number(el.getAttribute('data-audio'));
      if (this.hls) this.hls.audioTrack = idx;
      const key = (this.item && this.item.key) || 'default';
      const per = Object.assign({}, (this.opts.settings || {}).perChannelAudio || {});
      per[key] = Object.assign({}, (per[key] || {}), { audio: idx });
      this.opts.patchSettings && this.opts.patchSettings({ perChannelAudio: per });
      this.pop.hidden = true; this.popOwner = null;
    }));
  }

  /* ---------------- quality ---------------- */

  /* HLS levels that carry a real resolution, paired with their index. */
  qualityLevels() {
    const levels = this.hls && this.hls.levels ? this.hls.levels : [];
    const out = [];
    levels.forEach((lv, i) => {
      if (lv && lv.height) out.push({ lv, i });
    });
    return out;
  }

  /* The chip always reports what is actually on screen: the selected level's
     height, or the decoded frame height while ABR is in charge. */
  qualityLabel() {
    const levels = this.qualityLevels();
    let height = 0;
    if (levels.length && this.hls.currentLevel >= 0) {
      const active = levels.find((x) => x.i === this.hls.currentLevel);
      height = active ? active.lv.height : 0;
    }
    if (!height) height = this.video.videoHeight || 0;
    return height ? height + 'p' : '—';
  }

  updateQuality() {
    if (!this.qualityBtn) return;
    const levels = this.qualityLevels();
    const auto = !!(this.hls && this.hls.currentLevel < 0);
    const label = this.qualityLabel();
    this.qualityBtn.textContent = label;
    this.qualityBtn.classList.toggle('auto', levels.length > 1 && auto);
    this.qualityBtn.disabled = levels.length < 2;
    this.qualityBtn.title = levels.length > 1
      ? window.t('quality') + ' · ' + (auto ? window.t('auto') : label)
      : window.t('quality');
  }

  /* Restore the saved preference once the manifest exposes its ladder. */
  applyQualityPref() {
    if (!this.hls || !this.hls.levels) return;
    const s = this.opts.settings || {};
    const per = s.perChannelQuality || {};
    const pref = Number((per && per[this.item && this.item.key]) || s.quality || 0);
    if (!(pref > 0)) return;
    const hit = this.hls.levels.findIndex((lv) => lv && lv.height === pref);
    if (hit >= 0) this.hls.currentLevel = hit;
  }

  showQualityPop() {
    this.poke();
    this.popOwner = 'quality';
    const levels = this.qualityLevels();
    if (!this.hls || levels.length < 2) return;
    const auto = this.hls.currentLevel < 0;
    let html = '<div class="pop-title">' + window.t('quality') + '</div>';
    html += '<button class="pop-item' + (auto ? ' on' : '') + '" data-q="-1">'
      + (auto ? '✓ ' : '') + window.t('auto')
      + '<span class="tiny">' + esc(this.qualityLabel()) + '</span></button>';
    const seen = new Set();
    levels
      .slice()
      .sort((a, b) => (b.lv.height - a.lv.height) || ((b.lv.bitrate || 0) - (a.lv.bitrate || 0)))
      .forEach(({ lv, i }) => {
        if (seen.has(lv.height)) return;
        seen.add(lv.height);
        const on = !auto && this.hls.currentLevel === i;
        html += '<button class="pop-item' + (on ? ' on' : '') + '" data-q="' + i + '">'
          + (on ? '✓ ' : '') + lv.height + 'p'
          + '<span class="tiny">' + esc(fmtBitrate(lv.bitrate)) + '</span></button>';
      });
    this.pop.innerHTML = html;
    this.pop.hidden = false;
    this.pop.querySelectorAll('[data-q]').forEach((el) => el.addEventListener('click', () => {
      const pick = Number(el.getAttribute('data-q'));
      this.hls.currentLevel = pick;
      const height = pick >= 0 && this.hls.levels[pick] ? this.hls.levels[pick].height : 0;
      const key = (this.item && this.item.key) || 'default';
      const per = Object.assign({}, (this.opts.settings || {}).perChannelQuality || {});
      if (pick < 0) delete per[key]; else per[key] = height;
      this.opts.patchSettings && this.opts.patchSettings({ perChannelQuality: per });
      this.pop.hidden = true; this.popOwner = null;
      this.updateQuality();
    }));
  }

  /* ---------------- favorite ---------------- */
  async toggleFavorite() {
    this.poke();
    if (!this.item) return;
    if (typeof this.opts.onFavorite === 'function') await this.opts.onFavorite(this.item);
    this.updateFavBtn();
    this.renderDrawer(false);
  }
  updateFavBtn() {
    if (!this.favBtn) return;
    const fav = (typeof this.opts.isFavorite === 'function') ? this.opts.isFavorite(this.item) : false;
    this.favBtn.classList.toggle('on', !!fav);
    const icon = this.favBtn.querySelector('[data-icon="heart"]');
    if (icon) icon.innerHTML = fav
      ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.3S3.5 15.4 3.5 9.4A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8.5 2.8c0 6-8.5 10.9-8.5 10.9Z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.3S3.5 15.4 3.5 9.4A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8.5 2.8c0 6-8.5 10.9-8.5 10.9Z"/></svg>';
  }
  openEpg() {
    this.poke();
    if (typeof this.opts.onEpg === 'function') this.opts.onEpg();
  }
  cycleTrack() {
    this.poke();
    if (!this.hls) return;
    const audio = (this.hls.audioTracks || []).length;
    if (audio > 0) {
      const next = (this.hls.audioTrack + 1) % audio;
      this.hls.audioTrack = next;
      const tr = this.hls.audioTracks[next];
      const btn = this.playerLangBtn;
      if (btn) btn.title = (tr && (tr.name || tr.lang)) || window.t('audio');
      return;
    }
    const subs = (this.hls.subtitleTracks || []).length;
    if (subs > 0) {
      const next = (this.hls.subtitleTrack + 1) % subs;
      this.hls.subtitleDisplay = true;
      this.hls.subtitleTrack = next;
      const btn = this.playerLangBtn;
      const tr = this.hls.subtitleTracks[next];
      if (btn) btn.title = (tr && (tr.name || tr.lang)) || window.t('subtitles');
    }
  }

  /* ---------------- recording ---------------- */

  async syncRecordingState() {
    try {
      if (!window.api || !window.api.recording || !window.api.recording.status) return;
      const st = await window.api.recording.status();
      if (st && st.recording && st.target) {
        this.recording = true;
        this.recordingTarget = st.target;
        this.recordingPath = st.path || '';
        if (this.recordTimerTarget) this.recordTimerTarget.textContent = st.target.name || '';
        if (!this.recordTimerInterval) this.startRecordTimer(false);
      } else {
        const was = this.recording;
        const lastErr = st && st.error ? String(st.error) : '';
        this.recording = false;
        this.recordingTarget = null;
        this.recordingPath = '';
        if (was || this.recordTimerInterval) this.stopRecordTimer();
        if (was && lastErr) this.opts.toast && this.opts.toast('Recording failed: ' + lastErr, 'err');
      }
      this.updateRecordBtn();
      this.renderDrawer(false);
    } catch (_) {}
  }

  isRecordingTarget(item) {
    const t = this.recordingTarget;
    if (!this.recording || !t || !item) return false;
    if (t.key && item.key) return t.key === item.key;
    return t.url && item.url && t.url === item.url;
  }

  async toggleRecording() {
    this.poke();
    if (!window.api || !window.api.recording) return;

    if (this.recording && this.isRecordingTarget(this.item)) {
      const res = await window.api.recording.stop();
      this.recording = false;
      this.recordingTarget = null;
      this.stopRecordTimer();
      this.updateRecordBtn();
      this.renderDrawer(false);
      this.opts.onRecordingChanged && this.opts.onRecordingChanged();
      this.opts.toast && this.opts.toast(res && res.path ? window.t('recording_saved') + ': ' + res.path : window.t('recording_stopped'), 'ok');
      return;
    }

    if (!this.item || !this.item.url) {
      this.opts.toast && this.opts.toast(window.t('no_stream'), 'err');
      return;
    }

    const replacing = this.recording && !this.isRecordingTarget(this.item);
    const prevTarget = this.recordingTarget;
    const res = await window.api.recording.start(
      this.item.url,
      this.item.headers || {},
      this.item.name || this.item.title || 'channel',
      this.item.key || ''
    );
    if (res && res.error) {
      this.opts.toast && this.opts.toast(res.error, 'err');
      return;
    }

    this.recording = true;
    this.recordingTarget = res.target || { url: this.item.url, name: this.item.name || this.item.title || 'channel', key: this.item.key || '' };
    this.recordingPath = res && res.path;
    this.startRecordTimer(true);
    this.updateRecordBtn();
    this.renderDrawer(false);
    this.opts.onRecordingChanged && this.opts.onRecordingChanged();
    if (replacing) {
      this.opts.toast && this.opts.toast((window.t ? window.t('recording_replaced') : 'Recording switched') + ': ' + (this.recordingTarget.name || ''), 'ok');
    } else {
      this.opts.toast && this.opts.toast(window.t('recording_started'), 'ok');
    }
  }

  startRecordTimer(reset) {
    this.recordingStartedAt = reset ? Date.now() : (this.recordingStartedAt || Date.now());
    if (this.recordTimer) this.recordTimer.hidden = false;
    if (this.recordTimerTarget) this.recordTimerTarget.textContent = (this.recordingTarget && this.recordingTarget.name) || '';
    this.updateRecordTimer();
    if (this.recordTimerInterval) clearInterval(this.recordTimerInterval);
    this.recordTimerInterval = setInterval(() => this.updateRecordTimer(), 1000);
    // Poll recording status so we detect early ffmpeg exits / mid-recording failures
    if (this.recordStatusPoll) clearInterval(this.recordStatusPoll);
    this.recordStatusPoll = setInterval(() => { this.syncRecordingState().catch(() => {}); }, 3000);
  }

  stopRecordTimer() {
    if (this.recordTimerInterval) {
      clearInterval(this.recordTimerInterval);
      this.recordTimerInterval = null;
    }
    if (this.recordStatusPoll) {
      clearInterval(this.recordStatusPoll);
      this.recordStatusPoll = null;
    }
    this.recordingStartedAt = 0;
    this.recordingTarget = null;
    if (this.recordTimer) this.recordTimer.hidden = true;
    if (this.recordTimerTarget) this.recordTimerTarget.textContent = '';
    if (this.recordTimerTime) this.recordTimerTime.textContent = '00:00:00';
  }

  updateRecordTimer() {
    if (!this.recordTimerTime) return;
    const start = this.recordingStartedAt || Date.now();
    const elapsed = Math.max(0, Math.floor((Date.now() - start) / 1000));
    const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    this.recordTimerTime.textContent = `${h}:${m}:${s}`;
  }

  updateRecordBtn() {
    if (!this.recordBtn) return;
    const isTarget = this.recording && this.isRecordingTarget(this.item);
    this.recordBtn.classList.toggle('recording', isTarget || this.recording);
    this.recordBtn.title = isTarget ? window.t('stop_recording') : (this.recording ? ((window.t ? window.t('record') : 'Record') + ' (switch)') : window.t('record'));
    const icon = this.recordBtn.querySelector('[data-icon="record"]');
    if (icon) icon.innerHTML = isTarget
      ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="7"/></svg>';
    this.updateRecordBadge();
  }

  updateRecordBadge() {
    if (!this.recordBadge) return;
    // count comes from state; if not provided, keep current
  }

  /* ---------------- top widget (clock/weather/prayer) ---------------- */
  startTopWidget() {
    this.stopTopWidget();
    this.updateTopWidget();
    this.topWidgetTimer = setInterval(() => this.updateTopWidget(), 1000);
  }
  stopTopWidget() {
    if (this.topWidgetTimer) { clearInterval(this.topWidgetTimer); this.topWidgetTimer = null; }
  }
  updateTopWidget() {
    const st = (window.__novaTest && window.__novaTest.state) || {};
    const settings = st.settings || {};
    const now = new Date();
    const fmtTime = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: settings.timeFormat === '12' });
    const fmtDate = (d) => d.toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short' });

    if (this.playerClock) {
      this.playerClock.textContent = fmtTime(now) + ' • ' + fmtDate(now);
    }

    if (this.playerWeather) {
      if (st.weather && st.location) {
        const c = Number(st.weather.tempC);
        const temp = settings.tempUnit === 'F' ? Math.round(c * 9 / 5 + 32) + '°F' : Math.round(c) + '°C';
        const desc = st.weather.desc ? ' ' + st.weather.desc : '';
        this.playerWeather.textContent = temp + desc + (st.location.city ? ' · ' + st.location.city : '');
        this.playerWeather.title = st.location.city || '';
      } else if (st.weatherStatus === 'custom:notfound') {
        this.playerWeather.textContent = '— · ' + (window.t ? window.t('city_not_found') : 'City not found');
        this.playerWeather.title = '';
      } else if (st.weatherError || st.weatherStatus === 'unavailable') {
        this.playerWeather.textContent = '— · ' + (window.t ? window.t('weather_unavailable') : 'Weather unavailable');
        this.playerWeather.title = st.weatherError || '';
      } else {
        this.playerWeather.textContent = '— · ' + (window.t ? window.t('loading') : 'Loading');
        this.playerWeather.title = '';
      }
    }

    if (this.playerPrayer) {
      const pr = st.prayer;
      if (pr) {
        const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
        const labels = {
          Fajr: (window.t ? window.t('fajr') : 'Fajr') || 'Fajr',
          Dhuhr: (window.t ? window.t('dhuhr') : 'Dhuhr') || 'Dhuhr',
          Asr: (window.t ? window.t('asr') : 'Asr') || 'Asr',
          Maghrib: (window.t ? window.t('maghrib') : 'Maghrib') || 'Maghrib',
          Isha: (window.t ? window.t('isha') : 'Isha') || 'Isha'
        };
        const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        let next = null;
        for (const p of prayers) {
          const val = pr[p];
          if (!val) continue;
          const parts = String(val).split(':').map(Number);
          const sec = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
          if (sec > nowSec) { next = { key: p, sec }; break; }
        }
        if (!next) {
          const val = pr.Fajr || '00:00';
          const parts = String(val).split(':').map(Number);
          next = { key: 'Fajr', sec: ((parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0)) + 24 * 3600 };
        }
        let diff = next.sec - nowSec;
        if (diff < 0) diff += 24 * 3600;
        const h = String(Math.floor(diff / 3600)).padStart(2, '0');
        const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        const s = String(diff % 60).padStart(2, '0');
        const label = labels[next.key] || next.key;
        const timeVal = (pr[next.key] || '').slice(0, 5);
        this.playerPrayer.textContent = label + ' ' + timeVal + ' · -' + h + ':' + m + ':' + s;
        this.playerPrayer.title = (window.t ? window.t('next_prayer') : 'Next') + ': ' + label;
      } else if (st.weatherError || st.weatherStatus === 'unavailable') {
        this.playerPrayer.textContent = '— · ' + (window.t ? window.t('weather_unavailable') : 'Unavailable');
        this.playerPrayer.title = st.weatherError || '';
      } else {
        this.playerPrayer.textContent = '— · ' + (window.t ? window.t('loading') : 'Loading');
        this.playerPrayer.title = '';
      }
    }
  }

  /* ---------------- extra controls (13 features) ---------------- */

  stopPlayback() {
    if (!this.item) return;
    try {
      this.video.pause();
      if (!this.isLive && Number.isFinite(this.video.duration)) this.video.currentTime = 0;
    } catch (_) {}
    this.stopped = true;
    this.setLoading(false);
    this.updatePlayIcon();
    this.updateCenter(true);
    this.poke();
  }

  togglePlay() {
    if (this.controlsBlocked()) return;
    if (this.stopped) {
      this.stopped = false;
      if (!this.isLive && Number.isFinite(this.video.duration) && this.video.currentTime >= this.video.duration - 0.2) {
        try { this.video.currentTime = 0; } catch (_) {}
      }
      this.tryPlay();
      this.updateCenter(false);
      return;
    }
    if (this.video.paused) this.tryPlay(); else this.video.pause();
    this.updateCenter(this.video.paused);
  }

  updateGoLiveButton() {
    if (!this.goLiveBtn) return;
    if (!this.isLive) { this.goLiveBtn.hidden = true; this.goLiveBtn.classList.remove('active-live'); return; }
    let behind = false;
    try {
      if (this.hls && Number.isFinite(this.hls.latency)) behind = this.hls.latency > 8;
      else if (this.video.seekable && this.video.seekable.length) {
        const end = this.video.seekable.end(this.video.seekable.length - 1);
        behind = (end - this.video.currentTime) > 12;
      }
    } catch (_) {}
    this.goLiveBtn.hidden = !behind;
    this.goLiveBtn.classList.toggle('active-live', behind);
  }

  goLive() {
    if (!this.isLive) return;
    try {
      if (this.hls && typeof this.hls.liveSyncPosition === 'number') {
        this.video.currentTime = this.hls.liveSyncPosition;
      } else if (this.video.seekable && this.video.seekable.length) {
        const end = this.video.seekable.end(this.video.seekable.length - 1);
        this.video.currentTime = Math.max(0, end - 1.5);
      }
      this.tryPlay();
    } catch (_) {}
    this.updateGoLiveButton();
    this.poke();
  }

  setLocked(on) {
    this.locked = !!on;
    this.root.classList.toggle('controls-locked', this.locked);
    if (this.lockOverlay) this.lockOverlay.hidden = !this.locked;
    if (this.lockBtn) this.lockBtn.classList.toggle('on', this.locked);
    if (this.lockBtn) this.lockBtn.title = this.locked ? window.t('unlock_controls') : window.t('lock_controls');
    if (this.locked) {
      if (!this.pop.hidden) { this.pop.hidden = true; this.popOwner = null; }
      if (this.quickInfo) this.quickInfo.hidden = true;
      if (this.opts.toast) this.opts.toast(window.t('controls_locked'), 'info');
    }
  }
  toggleLock(force) {
    const next = force === undefined ? !this.locked : !!force;
    this.setLocked(next);
    this.poke();
  }

  async takeScreenshot() {
    try {
      const v = this.video;
      if (!v || !v.videoWidth || !v.videoHeight) throw new Error('no frame');
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth; canvas.height = v.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      const name = (this.item && (this.item.name || this.item.title)) || 'screenshot';
      if (window.api && window.api.capture && window.api.capture.saveScreenshot) {
        const res = await window.api.capture.saveScreenshot(dataUrl, name);
        if (res && res.ok) this.opts.toast && this.opts.toast(window.t('screenshot_saved'), 'ok');
        else throw new Error(res && res.error || 'save failed');
      } else {
        const a = document.createElement('a'); a.href = dataUrl; a.download = name + '.png'; a.click();
        this.opts.toast && this.opts.toast(window.t('screenshot_saved'), 'ok');
      }
    } catch (err) {
      this.opts.toast && this.opts.toast(window.t('screenshot_failed'), 'err');
    }
    this.poke();
  }

  showSleepPop() {
    this.poke();
    this.popOwner = 'sleep';
    const opts = [0, 10, 15, 30, 45, 60, 90];
    let html = '<div class="pop-title">' + window.t('sleep_timer') + '</div>';
    const remain = this.sleepEndsAt ? Math.max(0, Math.ceil((this.sleepEndsAt - Date.now()) / 60000)) : 0;
    html += '<button class="pop-item' + (!this.sleepEndsAt ? ' on' : '') + '" data-sleep="0">' + window.t('sleep_off') + '</button>';
    opts.filter(x=>x).forEach(m => { html += '<button class="pop-item" data-sleep="' + m + '">' + m + ' ' + window.t('minutes_short') + '</button>'; });
    if (remain) html += '<div class="pop-hint">' + remain + ' ' + window.t('minutes_short') + '</div>';
    this.pop.innerHTML = html; this.pop.hidden = false;
    this.pop.querySelectorAll('[data-sleep]').forEach(el => el.addEventListener('click', () => {
      const m = Number(el.getAttribute('data-sleep')) || 0;
      this.setSleepMinutes(m);
      this.pop.hidden = true; this.popOwner = null;
    }));
  }
  setSleepMinutes(min) {
    this.clearSleepTimer();
    if (min > 0) {
      this.sleepEndsAt = Date.now() + min * 60000;
      this.sleepTimer = setTimeout(() => {
        this.sleepTimer = null; this.sleepEndsAt = 0; this.updateSleepBtn();
        try { this.video.pause(); } catch (_) {}
        this.opts.toast && this.opts.toast(window.t('sleep_timer'), 'info');
      }, min * 60000);
      this.opts.toast && this.opts.toast(window.t('sleep_set'), 'ok');
    }
    this.updateSleepBtn();
  }
  clearSleepTimer() {
    if (this.sleepTimer) { clearTimeout(this.sleepTimer); this.sleepTimer = null; }
    this.sleepEndsAt = 0;
    this.updateSleepBtn();
  }
  checkSleepTimer() { /* handled by timeout */ }
  updateSleepBtn() {
    if (!this.sleepBtn) return;
    this.sleepBtn.classList.toggle('has-timer', !!this.sleepEndsAt);
    if (this.sleepEndsAt) {
      const remain = Math.max(0, Math.ceil((this.sleepEndsAt - Date.now()) / 60000));
      this.sleepBtn.title = window.t('sleep_timer') + ' (' + remain + 'm)';
    } else this.sleepBtn.title = window.t('sleep_timer');
  }

  cycleRepeat() {
    const order = ['off','all','one'];
    const idx = order.indexOf(this.repeatMode || 'off');
    this.repeatMode = order[(idx + 1) % order.length];
    this.updateRepeatBtn();
    const msg = this.repeatMode === 'one' ? window.t('repeat_one') : this.repeatMode === 'all' ? window.t('repeat_all') : window.t('repeat_off');
    this.opts.toast && this.opts.toast(msg, 'info');
  }
  updateRepeatBtn() {
    if (!this.repeatBtn) return;
    this.repeatBtn.classList.toggle('on', this.repeatMode !== 'off');
    this.repeatBtn.title = this.repeatMode === 'one' ? window.t('repeat_one') : this.repeatMode === 'all' ? window.t('repeat_all') : window.t('repeat_off');
    const span = this.repeatBtn.querySelector('[data-icon]');
    if (span) span.setAttribute('data-icon', this.repeatMode === 'one' ? 'repeatOne' : 'repeat');
    if (window.hydrateIcons) window.hydrateIcons(this.repeatBtn);
  }



  toggleQuickInfo() {
    if (!this.quickInfo) return;
    this.quickInfo.hidden = !this.quickInfo.hidden;
    if (!this.quickInfo.hidden) this.renderQuickInfo();
  }
  renderQuickInfo() {
    if (!this.quickInfo) return;
    const v = this.video; const it = this.item || {};
    const level = this.hls && this.hls.levels && this.hls.currentLevel >= 0 ? this.hls.levels[this.hls.currentLevel] : null;
    const rows = [
      [window.t('title'), it.name || it.title || '—'],
      ['URL', it.url ? String(it.url).slice(0, 80) : '—'],
      ['Engine', this.hls ? 'HLS' : this.mpegts ? 'MPEG-TS' : this.dash ? 'MPEG-DASH' : 'Native'],
      [window.t('quality'), v.videoWidth ? v.videoWidth + '×' + v.videoHeight : '—'],
      ['Bitrate', level ? fmtBitrate(level.bitrate) : (this.hls ? fmtBitrate(this.hls.bandwidthEstimate) : '—')],
      [window.t('audio_delay'), (this.audioDelay||0) + ' ms'],
      [window.t('aspect'), this.aspectMode || 'contain'],
      [window.t('repeat'), this.repeatMode || 'off']
    ];
    let html = '<h4>' + window.t('quick_info') + '</h4><div class="qi-grid">';
    rows.forEach(([k,val])=>{ html += '<span>'+esc(k)+'</span><b>'+esc(val)+'</b>'; });
    html += '</div>';
    this.quickInfo.innerHTML = html;
  }

  async toggleMiniPlayer(force) {
    const next = force === undefined ? !this.miniMode : !!force;
    await this.setMiniMode(next);
  }
  async setMiniMode(on) {
    this.miniMode = !!on;
    this.root.classList.toggle('mini-mode', this.miniMode);
    if (this.miniBtn) this.miniBtn.classList.toggle('on', this.miniMode);
    if (this.miniBtn) this.miniBtn.title = this.miniMode ? window.t('exit_mini') : window.t('mini_player');
    try { if (window.api && window.api.window) await window.api.window.setAlwaysOnTop(this.miniMode); } catch (_) {}
    if (this.miniMode) {
      if (!this.pop.hidden) { this.pop.hidden = true; this.popOwner = null; }
      if (this.quickInfo) this.quickInfo.hidden = true;
      this.toggleDrawer(false);
    }
    this.poke();
  }

  showAudioDelayPop() {
    // best-effort: store value; real sync depends on engine/stream support
    this.poke();
    this.popOwner = 'audioDelay';
    const v = this.audioDelay || 0;
    let html = '<div class="pop-title">' + window.t('audio_delay') + '</div>';
    html += '<div class="pop-row"><label>ms</label><input id="audioDelayRange" type="range" min="-1000" max="1000" step="50" value="' + v + '"><span id="audioDelayVal" class="tiny">' + v + '</span></div>';
    html += '<div class="pop-hint">' + esc('') + '</div>';
    this.pop.innerHTML = html; this.pop.hidden = false;
    const r = this.pop.querySelector('#audioDelayRange');
    const out = this.pop.querySelector('#audioDelayVal');
    if (r) r.addEventListener('input', ()=>{ const val = Number(r.value)||0; this.audioDelay = val; if(out) out.textContent = String(val); });
  }


  statsVisible() {
    return this.statsPanel && !this.statsPanel.hidden;
  }

  toggleStats() {
    this.poke();
    this.statsPanel.hidden = !this.statsPanel.hidden;
    if (!this.statsPanel.hidden) {
      this.updateStats();
      this.statsTimer = setInterval(() => this.updateStats(), 1000);
    } else {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }

  updateStats() {
    if (this.statsPanel.hidden) return;
    const v = this.video;
    const level = this.hls && this.hls.levels && this.hls.currentLevel >= 0 ? this.hls.levels[this.hls.currentLevel] : null;
    let buffered = 0;
    try {
      if (v.buffered && v.buffered.length) buffered = v.buffered.end(v.buffered.length - 1) - v.currentTime;
    } catch (_) {}
    const quality = v.videoWidth ? v.videoWidth + '×' + v.videoHeight : '—';
    const engine = this.hls ? 'HLS (hls.js)' : this.mpegts ? 'MPEG-TS (mpegts.js)' : this.dash ? 'MPEG-DASH (dash.js)' : 'Native';
    const rows = [
      [window.t('status'), v.paused ? window.t('paused') : window.t('play')],
      ['Engine', engine],
      [window.t('quality'), quality],
      ['Bitrate', level ? fmtBitrate(level.bitrate) : (this.hls ? fmtBitrate(this.hls.bandwidthEstimate) : '—')],
      ['Buffer', buffered > 0 ? buffered.toFixed(1) + 's' : '0s'],
      ['Dropped frames', (v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality().droppedVideoFrames : 0)],
      [window.t('volume'), Math.round(v.volume * 100) + '%'],
      [window.t('speed'), v.playbackRate + '×'],
      ['Ready state', v.readyState],
      ['Latency', this.hls && this.isLive && Number.isFinite(this.hls.latency) ? this.hls.latency.toFixed(2) + 's' : '—']
    ];
    let html = '<h4>' + window.t('stats') + '</h4><div class="stats-grid">';
    for (const [k, val] of rows) {
      html += '<span>' + esc(k) + '</span><b>' + esc(val) + '</b>';
    }
    html += '</div>';
    if (this.hls && this.hls.levels && this.hls.levels.length > 1) {
      html += '<hr><h4>' + window.t('quality') + '</h4><div class="stats-grid">';
      this.hls.levels.forEach((lv, i) => {
        const on = this.hls.currentLevel === i;
        html += '<span style="color:' + (on ? 'var(--accent)' : 'inherit') + '">' + Number(lv.width) + '×' + Number(lv.height) + (on ? ' ✓' : '') + '</span><b>' + fmtBitrate(lv.bitrate) + '</b>';
      });
      html += '</div>';
    }
    if (this.subCues.length) {
      html += '<hr><div class="stats-grid"><span>' + window.t('subtitles') + '</span><b>' + this.subCues.length + '</b></div>';
    }
    this.statsPanel.innerHTML = html;
  }

  /* ---------------- misc ---------------- */

  setLoading(on) {
    this.loading.hidden = !on;
    if (on && this.loadingLabel) this.loadingLabel.textContent = window.t('loading_stream');
  }

  /** PRO: on a fatal stream error of a live channel, silently try another source of the same channel (max 3 hops). */
  tryFailover(message) {
    try {
      const o = this.opts || {};
      if (!this.item || !this.isLive || !o.getAlternatives || (o.autoFailover && !o.autoFailover())) return false;
      if (!this._fo) this._fo = { tried: new Set(), n: 0 };
      const st = this._fo;
      if (st.n >= 3) { this._fo = null; return false; }
      const failed = this.item; const token = this.loadToken;
      st.tried.add(failed.key); st.n++;
      this.loadingLabel.textContent = window.GomizPro ? window.GomizPro.tr('failover') : 'Switching to a backup source…';
      this.setLoading(true);
      Promise.resolve(o.getAlternatives(failed)).then((alts) => {
        if (this.loadToken !== token || !this.open) return;
        const next = (alts || []).find((a) => a && a.url && !st.tried.has(a.key));
        if (!next) { this._fo = null; this.showError(message, true); return; }
        const merged = Object.assign({}, failed, next);
        this.item = merged; this.errorCount = 0; this.errorBox.hidden = true;
        this.titleEl.textContent = merged.name || '';
        try { this.updateAvatar(merged); this.updateMeta(); } catch (_) {}
        this._foLoading = true;
        try { this.load(merged); } finally { this._foLoading = false; }
        if (o.toast) o.toast((window.GomizPro ? window.GomizPro.tr('failover_ok') : 'Switched to backup source') + ': ' + (next.name || ''), 'ok');
      }).catch(() => { if (this.loadToken === token) this.showError(message, true); });
      return true;
    } catch (_) { return false; }
  }

  showError(message, noFailover) {
    if (!noFailover && this.tryFailover(message)) return;
    this.setLoading(false);
    this.errorBox.hidden = false;
    this.center.hidden = true;
    this.center.classList.remove('show');
    if (this.errorChannel) this.errorChannel.textContent = this.item ? (this.item.name || this.item.title || '') : '';
    let msg = message || '';
    const u = (this.item && this.item.url) || '';
    const drmHint = /drm|widevine|playready|fairplay|encrypted/i.test(msg + ' ' + u);
    if (drmHint) msg = (window.t ? window.t('drm_unsupported') : 'DRM/protected content may not be supported.') + (msg ? ' (' + msg + ')' : '');
    if (this.errorDetail) {
      this.errorDetail.textContent = msg;
      this.errorDetail.hidden = !msg;
    }
  }

  hideError() {
    this.errorBox.hidden = true;
  }

  poke() {
    this.root.classList.remove('idle');
    clearTimeout(this.idleTimer);
    this.scheduleIdle();
  }

  scheduleIdle() {
    clearTimeout(this.idleTimer);
    if (!this.open) return;
    this.idleTimer = setTimeout(() => {
      if (this.open && !this.video.paused && this.pop.hidden && !this.drawer.classList.contains('open')) {
        this.root.classList.add('idle');
      }
    }, 3200);
  }

  restoreDrawerState() {
    const st = (this.opts && this.opts.settings) || {};
    const key = this.favoritesMode ? 'drawerFavorites' : 'drawerLive';
    const d = (st.player && st.player[key]) || (st.player && st.player.drawer) || {};
    this.drawerGroup = typeof d.group === 'string' ? d.group : (this.drawerGroup || '');
    this.drawerDedupeOn = !!d.dedupe;
    this.drawerShown = Math.max(DRAWER_PAGE, Number(d.shown) || this.drawerShown || DRAWER_PAGE);
    if (this.drawerSearch && typeof d.search === 'string') this.drawerSearch.value = d.search;
    if (this.drawerDedupe) this.drawerDedupe.classList.toggle('on', this.drawerDedupeOn);
  }

  applySettings(settings) {
    const st = settings || {};
    this.video.volume = Math.min(1, Math.max(0, Number(st.volume ?? 100) / 100));
    this.volBar.value = String(Math.round(this.video.volume * 100));
    this.updateVolumeIcon();
    this.video.playbackRate = Number(st.rate || 1);
    this.speedSel.value = String(this.video.playbackRate);
    this.seekStep = Math.max(1, Number(st.seekStep || 10));
    if (this.seekStepSel) this.seekStepSel.value = String([5,10,15,30,60].includes(this.seekStep) ? this.seekStep : 10);
    this.updateSeekStepLabels();
    this.setAspect(st.aspect || 'contain', false);
    this.renderer.setStyle(st.subtitle || {});
    this.renderer.setDelay((st.subtitle && st.subtitle.delay) || 0);

    // restore drawer state (separate per mode: All Channels vs My List TV)
    this.restoreDrawerState();
  }

  saveDrawerState() {
    try {
      const st = this.opts.settings || {};
      const player = Object.assign({}, st.player || {});
      const drawerKey = this.favoritesMode ? 'drawerFavorites' : 'drawerLive';
      player[drawerKey] = {
        group: this.drawerGroup || '',
        dedupe: !!this.drawerDedupeOn,
        search: (this.drawerSearch && this.drawerSearch.value) || '',
        shown: Math.max(DRAWER_PAGE, Number(this.drawerShown) || DRAWER_PAGE)
      };
      this.opts.patchSettings && this.opts.patchSettings({ player });
    } catch (_) {}
  }

  teardown() {
    this.stopRecordTimer();
    clearInterval(this.statsTimer);
    this.statsTimer = null;
    if (this.hls) {
      try { this.hls.destroy(); } catch (_) {}
      this.hls = null;
    }
    if (this.mpegts) {
      try {
        this.mpegts.pause();
        this.mpegts.unload();
        this.mpegts.detachMediaElement();
        this.mpegts.destroy();
      } catch (_) {}
      this.mpegts = null;
    }
    if (this.dash) {
      try { this.dash.reset(); } catch (_) {}
      this.dash = null;
    }
    try {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    } catch (_) {}
    this.renderer.clear();
    this.textTrackIndex = -1;
  }

  close() {
    if (!this.open) return;
    if (this.recording) { try { window.api.recording.stop(); } catch (_) {} this.recording = false; this.recordingTarget = null; this.stopRecordTimer(); this.updateRecordBtn(); this.opts.onRecordingChanged && this.opts.onRecordingChanged(); }
    if (this.opts.onProgress && this.item && !this.isLive && Number.isFinite(this.video.duration) && this.video.currentTime > 5) {
      this.opts.onProgress(this.item, this.video.currentTime, this.video.duration);
    }
    this.open = false;
    this.teardown();
    this.clearSleepTimer();
    this.setLocked(false);
    this.setMiniMode(false);
    if (window.api && window.api.window) window.api.window.setAlwaysOnTop(false).catch(()=>{});
    clearInterval(this.epgTimer);
    this.epgTimer = null;
    clearTimeout(this.centerTimer);
    this.centerTimer = null;
    this.root.hidden = true;
    this.root.classList.remove('is-live','controls-locked','mini-mode');
    this.liveStrip.hidden = true;
    if (this.goLiveBtn) this.goLiveBtn.hidden = true;
    this.setLatency('');
    this.stopTopWidget();
    if (this.topLive) this.topLive.hidden = true;
    if (this.quickInfo) this.quickInfo.hidden = true;
    this.center.hidden = true;
    this.center.classList.remove('show');
    this.drawer.classList.remove('open');
    this.drawer.hidden = true;
    this.pop.hidden = true; this.popOwner = null;
    this.statsPanel.hidden = true;
    clearTimeout(this.idleTimer);
    this.epgInfo = null;
    this.stopped = false;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (this.opts.onClose) this.opts.onClose(this.item);
    this.item = null;
  }

  setupGestures() {
    const el = this.center || this.video;
    if (!el || this._gesturesBound) return;
    this._gesturesBound = true;
    let startX=0, startY=0, startT=0, startVol=1, startTime=0, mode=null;
    const onDown = (e) => {
      if (this.controlsBlocked() || !this.open) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target && (e.target.closest('button,select,input,.player-pop,.channel-drawer,.stats-panel,.quick-info-panel'))) return;
      startX = e.clientX; startY = e.clientY; startT = Date.now(); mode = null;
      startVol = this.video.volume || 0; startTime = this.video.currentTime || 0;
      try { el.setPointerCapture(e.pointerId); } catch(_){}
    };
    const onMove = (e) => {
      if (startT === 0 || this.controlsBlocked()) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!mode) {
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) mode = 'seek';
        else if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) mode = 'vol';
        else return;
      }
      if (mode === 'seek') {
        const rect = (this.root || el).getBoundingClientRect();
        const deltaSec = (dx / Math.max(200, rect.width)) * 90;
        if (this.isLive && this.liveDvrEnabled()) {
          const {start,end} = this.liveSeekRange();
          try { this.video.currentTime = Math.min(end, Math.max(start, startTime + deltaSec)); } catch(_){}
        } else if (!this.isLive && Number.isFinite(this.video.duration)) {
          try { this.video.currentTime = Math.min(this.video.duration, Math.max(0, startTime + deltaSec)); } catch(_){}
        }
      } else if (mode === 'vol') {
        const rect = (this.root || el).getBoundingClientRect();
        const delta = -(dy / Math.max(150, rect.height));
        this.setVolume(startVol + delta);
      }
    };
    const onUp = () => { startT = 0; mode = null; };
    this.root.addEventListener('pointerdown', onDown);
    this.root.addEventListener('pointermove', onMove);
    this.root.addEventListener('pointerup', onUp);
    this.root.addEventListener('pointercancel', onUp);
  }

}

window.GomizPlayer = Player;
