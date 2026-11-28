/* global window, document */
// GomizPlayer PRO — Multiview: watch up to 6 live channels at once, audio from one tile.
// Standalone (does not touch the main player). Exposes window.GomizMultiview = { open, close, isOpen, tr }.
// All dynamic text is set through textContent; channel data is never interpreted as HTML.
(function () {
'use strict';

const STR = {
  en: {
    title: 'Multiview', add: 'Add channel', replace: 'Change channel', remove: 'Remove', close: 'Close', mute_all: 'Mute all', volume: 'Volume',
    layout: 'Layout', pick: 'Pick a channel', search: 'Search channels…', none: 'No channels found', empty: 'Empty slot',
    loading: 'Loading…', failed: 'Stream failed', retry: 'Retry', backup: 'Switched to backup source', heavy: '6 streams need a powerful PC',
    hint: 'Click a tile to hear it · double-click for full screen · Esc to close', no_live: 'No live channels available. Add a source first.',
    live_only: 'Only live channels'
  },
  ar: {
    title: 'مشاهدة متعددة', add: 'إضافة قناة', replace: 'تغيير القناة', remove: 'إزالة', close: 'إغلاق', mute_all: 'كتم الكل', volume: 'الصوت',
    layout: 'التخطيط', pick: 'اختر قناة', search: 'ابحث عن قناة…', none: 'لا توجد قنوات', empty: 'خانة فارغة',
    loading: 'جارٍ التحميل…', failed: 'فشل البث', retry: 'إعادة المحاولة', backup: 'تم التحويل إلى مصدر بديل', heavy: '6 بثوث تحتاج جهازاً قوياً',
    hint: 'انقر على خانة لسماع صوتها · نقر مزدوج لملء الشاشة · Esc للإغلاق', no_live: 'لا توجد قنوات مباشرة. أضف مصدراً أولاً.',
    live_only: 'القنوات المباشرة فقط'
  }
};
function lang() { try { return (window.I18N && window.I18N.lang) === 'ar' ? 'ar' : 'en'; } catch (_) { return 'en'; } }
function tr(k) { return (STR[lang()] && STR[lang()][k]) || STR.en[k] || k; }

const LAYOUTS = { '1x2': { n: 2, cls: 'l-1x2' }, '2x2': { n: 4, cls: 'l-2x2' }, '1+3': { n: 4, cls: 'l-1p3' }, '3x2': { n: 6, cls: 'l-3x2' } };
const DEFAULT_LAYOUT = '2x2';

const CSS = `
.mv-root [hidden]{display:none!important}
.mv-root{position:fixed;inset:0;z-index:9000;background:#05070b;color:#e8ecf4;display:flex;flex-direction:column;font:14px/1.4 system-ui,sans-serif}
.mv-bar{display:flex;gap:10px;align-items:center;padding:8px 12px;background:#0b0f17;border-bottom:1px solid #1b2433;flex-wrap:wrap}
.mv-bar h3{margin:0 8px 0 0;font-size:15px}
.mv-btn{background:#161d2b;color:#e8ecf4;border:1px solid #263248;border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit}
.mv-btn:hover{background:#1d2740}.mv-btn.on{background:#ff3d5a;border-color:#ff3d5a;color:#fff}
.mv-spacer{flex:1}.mv-hint{opacity:.6;font-size:12px}
.mv-grid{flex:1;display:grid;gap:4px;padding:4px;min-height:0}
.mv-grid.l-1x2{grid-template-columns:1fr 1fr;grid-template-rows:1fr}
.mv-grid.l-2x2{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}
.mv-grid.l-3x2{grid-template-columns:repeat(3,1fr);grid-template-rows:1fr 1fr}
.mv-grid.l-1p3{grid-template-columns:2fr 1fr;grid-template-rows:1fr 1fr 1fr}
.mv-grid.l-1p3 .mv-tile:first-child{grid-row:1 / span 3}
.mv-tile{position:relative;background:#000;border:2px solid #141b28;border-radius:6px;overflow:hidden;min-height:0;min-width:0}
.mv-tile.active{border-color:#ff3d5a}
.mv-tile video{width:100%;height:100%;object-fit:contain;background:#000;display:block}
.mv-label{position:absolute;left:8px;top:6px;right:8px;display:flex;gap:6px;align-items:center;text-shadow:0 1px 3px #000;pointer-events:none}
.mv-name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mv-state{margin-inline-start:auto;font-size:12px;opacity:.85}
.mv-speaker{font-size:16px}
.mv-actions{position:absolute;right:6px;bottom:6px;z-index:1;display:flex;gap:6px;opacity:0;transition:opacity .15s}
.mv-tile:hover .mv-actions,.mv-tile:focus-within .mv-actions{opacity:1}
.mv-empty{position:absolute;inset:0;display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;opacity:.9}
.mv-overlay{position:absolute;inset:0;display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;background:rgba(0,0,0,.55)}
.mv-picker{position:absolute;inset:0;z-index:2;background:rgba(5,7,11,.96);display:flex;flex-direction:column;padding:16px;gap:10px}
.mv-picker input{background:#0f1520;color:#fff;border:1px solid #263248;border-radius:8px;padding:10px;font:inherit}
.mv-list{flex:1;overflow:auto;display:flex;flex-direction:column;gap:4px}
.mv-item{text-align:start;background:#0f1520;border:1px solid #1b2433;border-radius:8px;padding:8px 10px;color:inherit;cursor:pointer;font:inherit;display:flex;gap:10px}
.mv-item:hover{background:#18233a}.mv-item small{opacity:.6;margin-inline-start:auto}
`;

let root = null, ctxRef = null, slots = [], tiles = [], layout = DEFAULT_LAYOUT, activeIdx = 0, volume = 0.8, keyHandler = null;

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function ensureCss() { if (document.getElementById('mv-css')) return; const s = document.createElement('style'); s.id = 'mv-css'; s.textContent = CSS; document.head.appendChild(s); }
function liveItems() {
  try {
    return (ctxRef.items() || []).filter((x) => x && x.url && !x.hidden &&
      (typeof ctxRef.isLive === 'function' ? ctxRef.isLive(x) : x.kind === 'live'));
  } catch (_) { return []; }
}
function mpegtsSupported() {
  try {
    return !!(window.mpegts && window.mpegts.isSupported && window.mpegts.isSupported() &&
      window.mpegts.getFeatureList && window.mpegts.getFeatureList().mseLivePlayback);
  } catch (_) { return false; }
}

function playbackHeaders(item) {
  const out = {};
  const source = item && item.headers && typeof item.headers === 'object' ? item.headers : {};
  const allowed = { 'user-agent': 'User-Agent', 'referer': 'Referer', 'referrer': 'Referer', 'origin': 'Origin' };
  for (const key of Object.keys(source)) {
    const target = allowed[String(key).toLowerCase()];
    const value = String(source[key] == null ? '' : source[key]).trim();
    if (!target || !value || value.length > 2048 || /[\r\n\0]/.test(value)) continue;
    out[target] = value;
  }
  return out;
}

class Tile {
  constructor(index) {
    this.index = index; this.item = null; this.hls = null; this.mpegts = null; this.tried = new Set(); this.token = 0;
    this.el = el('div', 'mv-tile'); this.el.tabIndex = 0;
    this.video = el('video'); this.video.playsInline = true; this.video.muted = true; this.video.autoplay = true;
    this.label = el('div', 'mv-label'); this.speaker = el('span', 'mv-speaker', ''); this.name = el('span', 'mv-name', ''); this.stateEl = el('span', 'mv-state', '');
    this.label.append(this.speaker, this.name, this.stateEl);
    this.actions = el('div', 'mv-actions');
    this.changeBtn = el('button', 'mv-btn', tr('replace')); this.removeBtn = el('button', 'mv-btn', tr('remove'));
    this.actions.append(this.changeBtn, this.removeBtn);
    this.emptyBox = el('div', 'mv-empty'); this.addBtn = el('button', 'mv-btn', '+ ' + tr('add')); this.emptyBox.append(el('div', null, tr('empty')), this.addBtn);
    this.overlay = el('div', 'mv-overlay'); this.overlay.hidden = true;
    this.el.append(this.video, this.label, this.actions, this.emptyBox, this.overlay);
    this.el.addEventListener('click', (e) => { if (!e.target.closest('button')) setActive(this.index); });
    this.el.addEventListener('dblclick', (e) => { if (e.target.closest('button')) return; if (document.fullscreenElement) document.exitFullscreen(); else if (this.el.requestFullscreen) this.el.requestFullscreen().catch(() => {}); });
    this.changeBtn.addEventListener('click', () => openPicker(this.index));
    this.addBtn.addEventListener('click', () => openPicker(this.index));
    this.removeBtn.addEventListener('click', () => { this.clear(); persist(); });
    this.sync();
  }
  setState(text) { this.stateEl.textContent = text || ''; }
  sync() {
    const has = !!this.item;
    this.emptyBox.hidden = has; this.actions.hidden = !has; this.label.hidden = !has;
    this.name.textContent = has ? (this.item.name || '') : '';
    this.speaker.textContent = has && this.index === activeIdx ? '🔊' : '';
    this.el.classList.toggle('active', this.index === activeIdx && has);
    this.video.muted = !(this.index === activeIdx && has);
    this.video.volume = volume;
  }
  teardown() {
    this.token++;
    try { if (this.hls) { this.hls.destroy(); } } catch (_) {} this.hls = null;
    try { if (this.mpegts) { this.mpegts.pause(); this.mpegts.unload(); this.mpegts.detachMediaElement(); this.mpegts.destroy(); } } catch (_) {} this.mpegts = null;
    try { this.video.removeAttribute('src'); this.video.load(); } catch (_) {}
  }
  clear() { this.teardown(); this.item = null; slots[this.index] = null; this.tried = new Set(); this.overlay.hidden = true; this.setState(''); this.sync(); }
  load(item, fresh = true) {
    this.teardown(); if (fresh) this.tried = new Set();
    this.item = item; slots[this.index] = item; this.tried.add(item.key || item.url); this.overlay.hidden = true; this.setState(tr('loading')); this.sync();
    const token = this.token; const url = String(item.url);
    const stale = () => token !== this.token;
    const ok = () => { if (!stale()) this.setState(''); };
    const fail = (why) => { if (!stale()) this.fail(why); };
    try {
      const headers = playbackHeaders(item);
      if (/\.m3u8(\?|$)/i.test(url) && window.Hls && window.Hls.isSupported()) {
        const hls = new window.Hls({ lowLatencyMode: false, maxBufferLength: 8, enableWorker: true, manifestLoadingMaxRetry: 1, levelLoadingMaxRetry: 1, fragLoadingMaxRetry: 2, xhrSetup: (xhr) => {
          for (const key of Object.keys(headers)) { try { xhr.setRequestHeader(key, headers[key]); } catch (_) {} }
        } });
        this.hls = hls;
        hls.on(window.Hls.Events.ERROR, (_e, data) => { if (data && data.fatal) fail(data.details); });
        hls.on(window.Hls.Events.FRAG_LOADED, ok);
        hls.attachMedia(this.video); hls.loadSource(url);
      } else if (/\.(ts|m2ts|flv)(\?|$)/i.test(url) && mpegtsSupported()) {
        const p = window.mpegts.createPlayer({ type: /\.flv(\?|$)/i.test(url) ? 'flv' : /\.m2ts(\?|$)/i.test(url) ? 'm2ts' : 'mpegts', isLive: true, url }, { enableWorker: false, liveBufferLatencyChasing: true, headers });
        this.mpegts = p;
        p.on(window.mpegts.Events.ERROR, () => fail('TS error'));
        p.attachMediaElement(this.video); p.load();
      } else {
        this.video.src = url;
      }
      this.video.onplaying = ok; this.video.onerror = () => fail('media error');
      const pr = this.video.play(); if (pr && pr.catch) pr.catch(() => {});
    } catch (e) { fail(String(e && e.message || e)); }
  }
  async fail(why) {
    const token = this.token; const failed = this.item; if (!failed) return;
    this.teardown(); this.token = token + 1; this.item = failed;
    const t2 = this.token;
    try {
      if (ctxRef.getAlternatives && (!ctxRef.autoFailover || ctxRef.autoFailover())) {
        const alts = (await ctxRef.getAlternatives(failed)) || [];
        const next = alts.find((a) => a && a.url && !this.tried.has(a.key || a.url));
        if (next && t2 === this.token && root) { this.load(next, false); if (ctxRef.toast) ctxRef.toast(tr('backup') + ': ' + (next.name || ''), 'ok'); return; }
      }
    } catch (_) {}
    if (t2 !== this.token) return;
    this.setState(tr('failed'));
    this.overlay.textContent = ''; const m = el('div', null, tr('failed')); const b = el('button', 'mv-btn', tr('retry'));
    b.addEventListener('click', () => { if (this.item) this.load(this.item, true); });
    this.overlay.append(m, b); this.overlay.hidden = false;
  }
}

function setActive(i) { activeIdx = i; tiles.forEach((t) => t.sync()); }
function persist() {
  if (!ctxRef || !ctxRef.patchSettings) return;
  const keys = Array.from({ length: 6 }, (_, i) => (slots[i] ? (slots[i].key || '') : ''));
  try { ctxRef.patchSettings({ proMultiview: { layout, keys } }); } catch (_) {}
}

function buildGrid(grid) {
  const n = LAYOUTS[layout].n;
  const old = tiles; const keep = slots.slice(0, 6);
  old.forEach((t) => t.teardown());
  grid.textContent = ''; grid.className = 'mv-grid ' + LAYOUTS[layout].cls;
  tiles = Array.from({ length: n }, (_, i) => new Tile(i));
  tiles.forEach((t) => grid.appendChild(t.el));
  keep.slice(0, n).forEach((it, i) => { if (it) tiles[i].load(it); });
  if (activeIdx >= n) activeIdx = 0;
  setActive(activeIdx);
}

function openPicker(index) {
  const items = liveItems();
  const box = el('div', 'mv-picker'); const inp = el('input'); inp.placeholder = tr('search'); inp.type = 'search';
  const title = el('h3', null, tr('pick')); const list = el('div', 'mv-list'); const cancel = el('button', 'mv-btn', tr('close'));
  const draw = () => {
    const q = inp.value.trim().toLowerCase(); list.textContent = '';
    const shown = items.filter((x) => !q || String(x.name || '').toLowerCase().includes(q) || String(x.group || '').toLowerCase().includes(q)).slice(0, 80);
    if (!shown.length) list.appendChild(el('div', 'mv-hint', items.length ? tr('none') : tr('no_live')));
    shown.forEach((it) => {
      const b = el('button', 'mv-item'); b.appendChild(el('span', null, it.name || '')); b.appendChild(el('small', null, it.group || ''));
      b.addEventListener('click', () => { box.remove(); tiles[index].load(it); setActive(index); persist(); });
      list.appendChild(b);
    });
  };
  inp.addEventListener('input', draw); cancel.addEventListener('click', () => box.remove());
  box.append(title, inp, list, cancel); root.appendChild(box); draw(); inp.focus();
}

function open(ctx) {
  if (root) return;
  ctxRef = ctx; ensureCss(); slots = [];
  const saved = (ctx.settings && ctx.settings() && ctx.settings().proMultiview) || {};
  layout = LAYOUTS[saved.layout] ? saved.layout : DEFAULT_LAYOUT; activeIdx = 0;
  root = el('div', 'mv-root'); root.dir = lang() === 'ar' ? 'rtl' : 'ltr'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', tr('title'));
  const bar = el('div', 'mv-bar'); bar.appendChild(el('h3', null, tr('title')));
  const layoutBtns = {};
  Object.keys(LAYOUTS).forEach((k) => { const b = el('button', 'mv-btn', k); b.dataset.layout = k; b.addEventListener('click', () => { layout = k; Object.values(layoutBtns).forEach((x) => x.classList.toggle('on', x.dataset.layout === layout)); buildGrid(grid); warn.hidden = LAYOUTS[layout].n < 6; persist(); }); layoutBtns[k] = b; bar.appendChild(b); });
  const muteAll = el('button', 'mv-btn', tr('mute_all')); muteAll.addEventListener('click', () => { activeIdx = -1; tiles.forEach((t) => t.sync()); });
  const vol = el('input'); vol.type = 'range'; vol.min = '0'; vol.max = '100'; vol.value = String(Math.round(volume * 100)); vol.title = tr('volume'); vol.addEventListener('input', () => { volume = Number(vol.value) / 100; tiles.forEach((t) => { t.video.volume = volume; }); });
  const warn = el('span', 'mv-hint', tr('heavy')); warn.hidden = LAYOUTS[layout].n < 6;
  const hint = el('span', 'mv-hint', tr('hint')); const spacer = el('span', 'mv-spacer'); const closeBtn = el('button', 'mv-btn', tr('close')); closeBtn.addEventListener('click', close);
  bar.append(muteAll, vol, warn, spacer, hint, closeBtn);
  const grid = el('div', 'mv-grid'); root.append(bar, grid); document.body.appendChild(root);
  Object.values(layoutBtns).forEach((x) => x.classList.toggle('on', x.dataset.layout === layout));
  // restore last session's channels into the slots, then draw the grid
  const byKey = new Map(liveItems().map((x) => [x.key, x]));
  (Array.isArray(saved.keys) ? saved.keys : []).slice(0, 6).forEach((k, i) => { slots[i] = byKey.get(k) || null; });
  buildGrid(grid);
  setActive(0);
  keyHandler = (e) => { if (e.key === 'Escape') { if (root && root.querySelector('.mv-picker')) { root.querySelector('.mv-picker').remove(); } else if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); } else { close(); } e.stopPropagation(); e.preventDefault(); } };
  window.addEventListener('keydown', keyHandler, true);
}

function close() {
  if (!root) return;
  tiles.forEach((t) => t.teardown()); tiles = [];
  window.removeEventListener('keydown', keyHandler, true); keyHandler = null;
  if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (_) {} }
  root.remove(); root = null; slots = [];
  const cb = ctxRef && ctxRef.onClose; ctxRef = null; if (cb) { try { cb(); } catch (_) {} }
}

window.GomizMultiview = { open, close, isOpen: () => !!root, tr, _tiles: () => tiles, LAYOUTS };
})();
