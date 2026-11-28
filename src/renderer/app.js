const { init: widgetHelpersInit, analogClockSVG, mosqueSVG, weatherGlyph, weatherDescription, wmoBucket, weatherEmoji, timeOfDayKey, formatCountdown, getNextPrayerInfo, formatTime, formatTemp } = window.WidgetHelpers;
'use strict';

/* ===================== GomizPlayer IPTV renderer ===================== */

function normalizeMediaKind(kind) {
  const k = String(kind || '').toLowerCase();
  if (k === 'live' || k === 'livetv') return 'live';
  if (k === 'series' || k === 'serie') return 'series';
  if (k === 'movie' || k === 'movies' || k === 'vod' || k === 'film' || k === 'films') return 'movie';
  if (k === 'unknown') return 'unknown';
  return '';
}

function effectiveMediaKind(item) {
  const stored = normalizeMediaKind(item && item.kind);
  if (stored === 'live' || stored === 'movie' || stored === 'series') return stored;
  try {
    if (typeof GomizClassification !== 'undefined' && GomizClassification && typeof GomizClassification.classifyMedia === 'function') {
      const k = GomizClassification.classifyMedia(item || {});
      return (k === 'live' || k === 'movie' || k === 'series') ? k : 'unknown';
    }
  } catch (_) {}
  // Minimal safe fallback: trust explicit stored kind only; never infer Live from .m3u8/.ts
  const raw = normalizeMediaKind(item && item.kind);
  if (raw === 'live' || raw === 'movie' || raw === 'series') return raw;
  try {
    const url = String(item && item.url || '');
    if (typeof GomizClassification !== 'undefined' && GomizClassification) {
      if (GomizClassification.explicitTypeFromUrl) {
        const e = GomizClassification.explicitTypeFromUrl(url);
        if (e) return e;
      }
      if (GomizClassification.isVodFileUrl && GomizClassification.isVodFileUrl(url)) return 'movie';
    }
  } catch (_) {}
  return 'unknown';
}

function isLiveKind(item) { return effectiveMediaKind(item) === 'live'; }
function isMovieKind(item) { return effectiveMediaKind(item) === 'movie'; }
function isSeriesKind(item) { return effectiveMediaKind(item) === 'series'; }
function splitKinds(items) {
  const out = { live: [], movies: [], series: [] };
  for (const it of items) {
    if (isLiveKind(it)) out.live.push(it);
    else if (isMovieKind(it)) out.movies.push(it);
    else if (isSeriesKind(it)) out.series.push(it);
  }
  return out;
}

function isVodKind(item) { const k = effectiveMediaKind(item); return k === 'movie' || k === 'series'; }
function mediaKindLabel(kind) {
  const k = normalizeMediaKind(kind) || effectiveMediaKind({ kind });
  if (k === 'live') return t('nav_live');
  if (k === 'series') return t('nav_series');
  if (k === 'movie') return t('nav_movies');
  return t('nav_movies');
}

const state = {
  ready: false,
  info: null,
  settings: null,
  route: 'home',
  stack: [],
  scroll: {},
  sources: [],
  items: [],
  itemsBySource: new Map(),
  accountInfo: new Map(),
  library: { favorites: [], history: [], liveHistory: [], search: [] },
  downloads: [],
  recordings: [],
  recordingTarget: null,
  recordingPath: null,
  epg: {},
  epgIndex: new Map(),
  epgAt: 0,
  epgLoading: false,
  epgPromise: null,
  weather: null,
  prayer: null,
  location: null,
  clockTimer: null,
  filters: {
    movies: { group: 'all', sort: 'default' },
    series: { group: 'all', sort: 'default' }
  },
  searchTerm: '',
  searchTimer: null,
  settingsTab: 'general',
  loading: true
};

// Wire extracted widget helpers immediately (state/t/I18N are in scope here).
if (typeof widgetHelpersInit === 'function') widgetHelpersInit({
  t: (k) => (typeof window !== 'undefined' && typeof window.t === 'function' ? window.t(k) : k),
  I18N: (typeof window !== 'undefined' ? window.I18N : null) || { lang: 'en', number: (n) => String(n) },
  state
});

function activeProfile() { return (state.settings && state.settings.profile) || state.profile || 'default'; }

let player = null;

/* Home screen rows, in default order. Users can reorder / hide them in Settings → Home screen. */
const HOME_SECTIONS = [
  { id: 'hero', label: 'home_section_hero' },
  { id: 'live', label: 'home_section_live' },
  { id: 'movies', label: 'nav_movies' },
  { id: 'series', label: 'nav_series' }
];
const HOME_DEFAULTS = {
  order: HOME_SECTIONS.map((s) => s.id),
  hidden: [],
  density: 'comfortable',
  rowLimit: 16
};

function homeLayout() {
  const raw = (state.settings && state.settings.home) || {};
  const order = HOME_SECTIONS.map((s) => s.id).filter((id) => !Array.isArray(raw.order) || !raw.order.includes(id));
  const saved = Array.isArray(raw.order) ? raw.order.filter((id) => HOME_SECTIONS.some((s) => s.id === id)) : [];
  const merged = [...saved, ...order.filter((id) => !saved.includes(id))];
  return {
    order: merged.length ? merged : HOME_DEFAULTS.order.slice(),
    hidden: Array.isArray(raw.hidden) ? raw.hidden.filter((id) => HOME_SECTIONS.some((s) => s.id === id)) : [],
    density: ['compact', 'comfortable', 'large'].includes(raw.density) ? raw.density : 'comfortable',
    rowLimit: Math.min(30, Math.max(8, Number(raw.rowLimit) || HOME_DEFAULTS.rowLimit))
  };
}


function openModalWithActions(wrap, actions) {
  wrap.appendChild(actions);
  openModal(wrap);
}

/* ===================== Icons ===================== */

const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.6 12 3.2l9 7.4V20a1 1 0 0 1-1 1h-5.4v-6.2H9.4V21H4a1 1 0 0 1-1-1v-9.4Z"/></svg>',
  film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4.5" width="19" height="15" rx="2.4"/><path d="M7 4.5v15M17 4.5v15M2.5 9.5h4.5M2.5 14.5h4.5M17 9.5h4.5M17 14.5h4.5"/></svg>',
  series: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="8" width="19" height="12.5" rx="2.2"/><path d="M5.5 8V5.4a1.4 1.4 0 0 1 1.4-1.4h10.2a1.4 1.4 0 0 1 1.4 1.4V8M8 3.5 6 6.5M12 3.5 10 6.5M16 3.5l-2 3"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.3S3.5 15.4 3.5 9.4A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 8.5 2.8c0 6-8.5 10.9-8.5 10.9Z"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5M4 16.5v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  source: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="5.5" rx="1.6"/><rect x="3" y="14.5" width="18" height="5.5" rx="1.6"/><path d="M6.5 6.75h.01M6.5 17.25h.01M10.5 6.75h5M10.5 17.25h5"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.1"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.7a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.1 4.7a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.3 9c.26.63.87 1.03 1.56 1.03H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5.5 6.5 6.5L9 18.5"/></svg>',
  guide: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2.2"/><path d="M8 3v4M16 3v4M3 10h18M7.5 14h4M7.5 17.5h7"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2.2v14H6zM19 5.6v12.8L9.4 12 19 5.6Z"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.8 5H18v14h-2.2zM5 5.6v12.8L14.6 12 5 5.6Z"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 10 6 6 6-6"/></svg>',
  grip: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6.5h16M4 12h16M4 17.5h10"/></svg>',
  stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  cc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="5" width="19" height="14" rx="2.4"/><path d="M10 10.2a2.4 2.4 0 1 0 0 3.6M17.5 10.2a2.4 2.4 0 1 0 0 3.6"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6L19 12 8 5.2Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  volume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6.5 9H3v6h3.5L11 19V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>',
  headphones: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13v4a2 2 0 0 0 2 2h1v-7H6a2 2 0 0 0-2 1z"/><path d="M20 13v4a2 2 0 0 1-2 2h-1v-7h1a2 2 0 0 1 2 1z"/><path d="M4 13a8 8 0 0 1 16 0"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>',
  back10: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6a8 8 0 1 0 8 8"/><path d="M12 2v4l3-2-3-2"/><path d="M10 11v4M14.5 11v4"/></svg>',
  forward10: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6a8 8 0 1 1-8 8"/><path d="M12 2v4l-3-2 3-2"/><path d="M9.5 11v4M14 11v4"/></svg>',
  reload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v6h-6"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-1.8"/></svg>',
  screenshot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-2h6l2 2h3v10H4z"/><circle cx="12" cy="13" r="3.2"/></svg>',
  timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="7.5"/><path d="M12 10v3l2 1.5"/><path d="M9 3h6"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
  repeatOne: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><path d="M11 10h1.5v5"/></svg>',
  live: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M6 12h3M15 12h3"/><path d="M12 6v3M12 15v3"/></svg>',
  mini: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><rect x="13" y="12" width="7" height="6" rx="1"/></svg>',
  ab: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h4M7 4v16M15 7h4M17 4v16"/></svg>',
  pip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2.5" y="4.5" width="19" height="15" rx="2.2"/><rect x="12" y="11" width="7" height="6" rx="1.2" fill="currentColor" stroke="none"/></svg>',
  full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.4 6.3M20 4.5V11h-6.2"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L20 8l-4-4L4 16v4Z"/><path d="m14 6 4 4"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2.5h8.5A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V7.5Z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-8.5 8.5"/><path d="M18 14.5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H10"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.2v5.1l3.3 2"/><path d="M12 3.5v1.2M12 19.3v1.2M3.5 12h1.2M19.3 12h1.2"/></svg>',
  filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h18M6.5 12h11M10 18h4"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8h.01"/></svg>',
  tv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="2.5" y="6.5" width="19" height="12.5" rx="2.2"/><path d="m8 3.2 4 3.3 4-3.3"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/></svg>',
  pro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg>',
  record: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="7"/></svg>',
  lang: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M2.5 12h19M12 2.5a15.5 15.5 0 0 1 0 19 15.5 15.5 0 0 1 0-19Z"/></svg>',
  weather: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 17.5h8.2a3.8 3.8 0 0 0 .3-7.6 5.2 5.2 0 0 0-9.8 1.3A3.3 3.3 0 0 0 7.5 17.5Z"/><path d="M12.2 5.2a3.2 3.2 0 0 1 4.6 2.8"/></svg>',
  prayer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20v-6c0-3.3 3.6-5.5 9-5.5s9 2.2 9 5.5v6"/><path d="M2 20h20"/><path d="M10 20v-4a2 2 0 0 1 4 0v4"/><path d="M12 3v2.3"/><circle cx="12" cy="2" r=".6" fill="currentColor"/></svg>',
  golive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M6 12h3M15 12h3"/><path d="M12 6v3M12 15v3"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5h1.7V3.9c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3V10H7.4v3h2.7v8h3.4Z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>',
  github: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.18-3.37-1.18-.45-1.15-1.11-1.46-1.11-1.46-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.84c.85 0 1.7.11 2.5.33 1.9-1.29 2.74-1.02 2.74-1.02.56 1.38.21 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.85-2.34 4.7-4.57 4.95.36.31.68.92.68 1.86v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></svg>'
};

function hydrateIcons(root) {
  (root || document).querySelectorAll('[data-icon]').forEach((node) => {
    if (node.dataset.done) return;
    const svg = ICONS[node.getAttribute('data-icon')];
    if (svg) {
      node.innerHTML = svg;
      node.dataset.done = '1';
    }
  });
}

/* ===================== Movie recommendations ===================== */

function recommendMovies(item, limit) {
  const kind = (item && item.kind) || 'movie';
  const pool = state.items.filter((x) => effectiveMediaKind(x) === normalizeMediaKind(kind) && x.key !== item.key);
  const scored = [];
  for (const x of pool) {
    let score = 0;
    if (item.group && x.group && item.group === x.group) score += 40;
    if (item.sourceName && x.sourceName && item.sourceName === x.sourceName) score += 15;
    if (x.kind === kind) score += 5;
    scored.push({ x, score });
  }
  scored.sort((a, b) => (b.score - a.score) || String(a.x.name).localeCompare(String(b.x.name)));
  return scored.map((s) => s.x).slice(0, limit || 18);
}

/* ===================== Tiny DOM helpers ===================== */

const view = document.getElementById('view');
const modalRoot = document.getElementById('modalRoot');
const modalBody = document.getElementById('modalBody');

const reduceMotionQuery = (typeof matchMedia === 'function') ? matchMedia('(prefers-reduced-motion: reduce)') : null;
function detectLowPerf() {
  try {
    if (reduceMotionQuery && reduceMotionQuery.matches) { document.documentElement.dataset.perf = 'low'; return; }
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) { document.documentElement.dataset.perf = 'low'; return; }
    if (gl.getExtension && gl.getExtension('WEBGL_lose_context')) gl.getExtension('WEBGL_lose_context').loseContext();
    document.documentElement.dataset.perf = 'gpu';
  } catch (_) { document.documentElement.dataset.perf = 'low'; }
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function iconSpan(name) {
  const span = el('span');
  span.setAttribute('data-icon', name);
  span.innerHTML = ICONS[name] || '';
  return span;
}

function makeButton(label, { cls = 'btn btn-ghost', icon = null, onClick = null, title = '' } = {}) {
  const b = el('button', cls);
  if (title) b.title = title;
  if (icon) b.appendChild(iconSpan(icon));
  if (label) b.appendChild(el('span', null, label));
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

function initials(name) {
  const clean = String(name || '').replace(/[\[\](){}]/g, ' ').trim();
  const parts = clean.split(/[\s\-_.]+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function humanBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = Number(n);
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return v.toFixed(v >= 10 || i === 0 ? 0 : 1) + ' ' + units[i];
}

function fileUrl(p) {
  const norm = String(p).replace(/\\/g, '/');
  return 'file:///' + encodeURI(norm).replace(/#/g, '%23');
}

function toast(message, kind) {
  const box = document.getElementById('toasts');
  const node = el('div', 'toast' + (kind ? ' ' + kind : ''), message);
  box.appendChild(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity .25s ease';
    setTimeout(() => node.remove(), 260);
  }, 3200);
}

function loadingBlock(text) {
  const box = el('div', 'loading-block');
  box.appendChild(el('span', 'spinner'));
  box.appendChild(el('span', null, text || t('loading')));
  return box;
}

function emptyBlock(title, text, action) {
  const box = el('div', 'empty');
  box.appendChild(el('h3', null, title));
  if (text) box.appendChild(el('p', null, text));
  if (action) box.appendChild(action);
  return box;
}

function pageHead(title, sub, actions) {
  const head = el('div', 'page-head');
  const info = el('div');
  info.appendChild(el('h1', 'page-title', title));
  if (sub) info.appendChild(el('p', 'page-sub', sub));
  head.appendChild(info);
  head.appendChild(el('div', 'spacer'));
  (actions || []).forEach((a) => head.appendChild(a));
  return head;
}

function section(title, count, linkLabel, onLink) {
  const head = el('div', 'section-head');
  head.appendChild(el('h2', 'section-title', title));
  if (count !== undefined && count !== null) head.appendChild(el('span', 'section-count', count));
  if (linkLabel) {
    const link = el('button', 'link');
    link.appendChild(el('span', null, linkLabel));
    link.appendChild(iconSpan('chevron'));
    link.addEventListener('click', onLink);
    head.appendChild(link);
  }
  return head;
}

/* ===================== Library helpers ===================== */

function isFavorite(key) {
  try {
    const favs = state.library && Array.isArray(state.library.favorites) ? state.library.favorites : [];
    return favs.some((x) => x && x.key === key);
  } catch (_) {
    return false;
  }
}

async function toggleFavorite(item) {
  const key = item && item.key;
  if (!key) return;
  const profile = activeProfile();
  const on = !isFavorite(key);
  try {
    await window.api.library.favorite(item, on, profile);
    state.library = await window.api.library.get(profile);
  } catch (err) {
    toast((err && err.message) || t('error'), 'err');
    return;
  }
  // Feedback so the user knows the favorite state changed
  toast(on ? t('favorite_added') : t('favorite_removed'), 'ok');
  // Reflect state immediately in every visible card with matching data-fav
  try {
    const sel = '[data-fav="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]';
    document.querySelectorAll(sel).forEach((node) => {
      node.classList.toggle('on', on);
      node.setAttribute('aria-pressed', on ? 'true' : 'false');
      node.title = on ? t('unfavorite') : t('favorite');
    });
  } catch (_) {}
  try { render(); } catch (_) {}
}

function historyEntry(key) {
  return state.library.history.find((x) => x.key === key) || state.library.liveHistory.find((x) => x.key === key) || null;
}

function resumeFor(item) {
  const entry = historyEntry(item.key);
  if (!entry) return 0;
  if (!entry.position || !entry.duration) return 0;
  if (entry.position > entry.duration - 5) return 0;
  return entry.position;
}

async function recordHistory(item) {
  const entry = {
    ...item,
    position: item.position || 0,
    duration: item.duration || 0,
    mode: item.kind === 'live' ? (state.liveEntry || 'live') : undefined
  };
  try {
    const bucket = await window.api.library.history(entry, item.kind === 'live' ? 'live' : 'vod', activeProfile());
    if (Array.isArray(bucket)) {
      if (item.kind === 'live') state.library.liveHistory = bucket;
      else state.library.history = bucket;
    }
  } catch (_) {}
}

function kindLabel(kind) {
  return mediaKindLabel(kind);
}

function cardsRow(items, playlist, opts = {}) {
  const wrap = el('div', 'row-wrap');
  const row = el('div', 'row');
  const limit = opts.limit || 20;
  const slice = items.slice(0, limit);
  slice.forEach((item) => row.appendChild(cardNode(item, playlist, opts)));
  wrap.appendChild(row);

  if (slice.length > 2) {
    const forward = () => document.documentElement.dir !== 'rtl';
    const step = () => Math.max(220, Math.round(row.clientWidth * 0.82));
    const arrow = (side, icon) => {
      const b = el('button', 'row-arrow ' + side);
      b.type = 'button';
      b.title = side === 'next' ? t('scroll_next') : t('scroll_prev');
      b.setAttribute('aria-label', b.title);
      b.appendChild(iconSpan(icon));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const dir = side === 'next' ? 1 : -1;
        row.scrollBy({ left: dir * step() * (forward() ? 1 : -1), behavior: 'smooth' });
      });
      return b;
    };
    wrap.appendChild(arrow('prev', 'back'));
    wrap.appendChild(arrow('next', 'back'));
    requestAnimationFrame(() => {
      if (row.scrollWidth <= row.clientWidth + 4) wrap.classList.add('no-arrows');
    });
  }
  return wrap;
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value));
  return String(value == null ? '' : value).replace(/["\\#.:;,!?+*~>'"()\[\]\/\s]/g, '\\$&');
}

function playItem(item, list, opts) {
  const playlist = (list || []).filter((x) => x && x.url);
  const p = ensurePlayer();
  const favMode = !!(opts && opts.favoritesMode);
  p.openItem(item, {
    playlist,
    resume: resumeFor(item),
    logo: item.logo,
    epg: item.kind === 'live' ? epgNowNext(item) : null,
    getEpgFor: (channel) => epgNowNext(channel),
    onAddEpg: () => {
      p.close();
      openEpgModal();
    },
    favoritesMode: favMode
  });
  // EPG may not be loaded yet when a channel is opened from Home or search.
  if (isLiveKind(item) && !epgNowNext(item)) {
    loadEpgFor([item]).then(() => {
      if (player && player.item && player.item.key === item.key) player.setEpg(epgNowNext(item));
    }).catch(() => {});
  }
}

/* The last live channel the user actually watched, matched against the current
   library so removed/renamed sources fall back gracefully. */
function lastLiveChannel(live, mode) {
  const m = mode || null;
  const recent = state.library.liveHistory || [];
  for (const entry of recent) {
    if (!entry) continue;
    if (m && (entry.mode || 'live') !== m) continue;
    const found = live.find((x) => entry.key && x.key === entry.key)
      || live.find((x) => x.url && x.url === entry.url && (x.name || '') === (entry.name || ''));
    if (found) return found;
  }
  return null;
}

/* Sidebar "Live TV" behaves like a set-top box: the player opens straight away
   on the last watched channel, with the full channel browser (categories +
   every channel) merged into the drawer. There is no separate Live TV page. */
function openLiveReceiver(mode) {
  const isFav = mode === 'favorites';
  state.liveEntry = isFav ? 'favorites' : 'live';
  const live = state.items.filter((x) => isLiveKind(x) && x.url);
  if (!live.length) {
    toast(t('empty_hint'), 'err');
    navigate('sources');
    return;
  }
  if (isFav) {
    const favKeys = new Set(state.library.favorites.map((x) => x && x.key));
    const favItems = live.filter((x) => favKeys.has(x.key));
    if (!favItems.length) {
      toast(t('nav_favorites') + ': 0', 'err');
      // Fall back to live playback but keep favorites marked as the entry point
      const item = lastLiveChannel(live, 'live') || live[0];
      if (player && player.open && player.item && isLiveKind(player.item)) {
        player.setPlaylist(live);
      } else {
        playItem(item, live);
      }
      updateChrome();
      return;
    }
    // Player plays the favorites playlist: drawer shows only the user's favorites
    // (user request). All Channels drawer still lists favorites for the My List context.
    playItem(lastLiveChannel(favItems, 'favorites') || favItems[0], favItems, { favoritesMode: true });
    updateChrome();
    return;
  }
  if (player && player.open && player.item && isLiveKind(player.item)) {
    // Already watching a channel: keep it playing but give the drawer the full
    // live playlist (a channel opened from Home only carried itself).
    player.setPlaylist(live);
    updateChrome();
    return;
  }
  const item = lastLiveChannel(live, 'live') || live[0];
  playItem(item, live);
  updateChrome();
}

function ensurePlayer() {
  if (player) return player;
  player = new window.GomizPlayer({
    settings: state.settings,
    toast,
    patchSettings: async (patch) => {
      state.settings = await window.api.settings.patch(patch);
      if (player) player.opts.settings = state.settings;
      return state.settings;
    },
    onOpen: (item) => {
      recordHistory(item);
      updateChrome();
    },
    onProgress: (item, position, duration) => {
      try { window.api.library.progress(item.key, position, duration, activeProfile()); } catch (_) {}
      const target = state.library.history.find((x) => x.key === item.key);
      if (target) {
        target.position = position;
        target.duration = duration;
      }
    },
    onRecordingChanged: () => { refreshRecordingStatus(); refreshRecordings(); },
    autoFailover: () => !(state.settings && state.settings.proAutoFailover === false),
    getAlternatives: async (item) => { try { const r = await window.api.pro.alternatives(item); return (r && r.items) || []; } catch (_) { return []; } },
    onFavorite: (item) => { toggleFavorite(item); if (player) player.updateFavBtn(); },
    isFavorite: (item) => isFavorite(item && item.key),
    onEpg: () => { openGuide(); },
    onClose: (item) => {
      // Live TV / Favorites receiver has no separate page: if the stream was
      // live, return to that list instead of leaving the user on Home.
      const wasLive = !!(item && isLiveKind(item));
      if (wasLive && (state.route === 'home' || state.route === 'favorites')) {
        // Set the route directly: navigate('live') would re-open the receiver.
        // Always return to Home when the player closes (even from Favorites).
        state.route = 'home';
        render();
        updateChrome();
      } else {
        updateChrome();
        if (state.route === 'home' || state.route === 'favorites') render();
      }
    }
  });
  player.applySettings(state.settings);
  return player;
}

function isRecordingTargetItem(item) {
  const t = state.recordingTarget;
  if (!t || !item) return false;
  if (t.key && item.key) return t.key === item.key;
  return t.url && item.url && t.url === item.url;
}

function posterNode(item, { wide = false } = {}) {
  const poster = el('div', 'card-poster');
  const fallback = el('div', 'ph');
  fallback.appendChild(el('span', null, initials(item.name)));
  poster.appendChild(fallback);

  if (item.logo) {
    const img = el('img');
    img.alt = '';
    img.loading = 'lazy';
    img.src = item.logo;
    img.addEventListener('load', () => { fallback.style.display = 'none'; });
    img.addEventListener('error', () => { img.remove(); fallback.style.display = 'grid'; });
    poster.appendChild(img);
  }

  if (isRecordingTargetItem(item)) {
    const rec = el('div', 'card-badge rec');
    rec.appendChild(el('span', null, '● REC'));
    poster.appendChild(rec);
  } else if (isLiveKind(item)) {
    const badge = el('div', 'card-badge live');
    badge.appendChild(el('span', null, '● ' + t('live')));
    poster.appendChild(badge);
  } else if (item.group) {
    poster.appendChild(el('div', 'card-badge', item.group.slice(0, 18)));
  }

  if (item.duration && item.position > 0) {
    const bar = el('div', 'card-progress');
    const fill = el('i');
    fill.style.width = Math.min(100, Math.round((item.position / item.duration) * 100)) + '%';
    bar.appendChild(fill);
    poster.appendChild(bar);
  }

  const overlay = el('div', 'card-play');
  const bubble = el('i');
  bubble.appendChild(iconSpan('play'));
  overlay.appendChild(bubble);
  poster.appendChild(overlay);

  const fav = el('button', 'card-fav' + (isFavorite(item.key) ? ' on' : ''));
  fav.setAttribute('data-fav', cssEscape(item.key));
  fav.title = isFavorite(item.key) ? t('unfavorite') : t('favorite');
  fav.appendChild(iconSpan('heart'));
  fav.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavorite(item);
  });
  poster.appendChild(fav);

  if (wide) poster.classList.add('card-wide');
  return poster;
}

function cardNode(item, playlist, opts = {}) {
  const card = el('div', 'card' + (isLiveKind(item) ? ' card-wide' : ''));
  card.tabIndex = 0;
  card.appendChild(posterNode(item, { wide: isLiveKind(item) }));

  const body = el('div', 'card-body');
  body.appendChild(el('h3', 'card-title', item.name));
  const meta = el('div', 'card-meta');
  meta.appendChild(el('span', null, item.group || kindLabel(item.kind)));
  if (item.kind !== 'live' && item.sourceName) {
    meta.appendChild(el('span', 'dot'));
    meta.appendChild(el('span', null, item.sourceName));
  }
  body.appendChild(meta);
  card.appendChild(body);

  const open = () => {
    if (opts.onOpen) return opts.onOpen(item);
    if (isLiveKind(item)) playItem(item, playlist);
    else showDetail(item, playlist);
  };

  card.addEventListener('click', open);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });

  const playOverlay = card.querySelector('.card-play');
  if (playOverlay) {
    playOverlay.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isLiveKind(item)) playItem(item, playlist);
      else playItem(item, playlist);
    });
  }

  return card;
}

function skeletonCards(n) {
  const wrap = el('div', 'row-wrap');
  const row = el('div', 'row');
  for (let i = 0; i < Math.max(0, n); i++) {
    const card = el('div', 'card');
    const poster = el('div', 'card-poster');
    const sk = el('div', 'skel');
    sk.style.cssText = 'position:absolute;inset:0;background:linear-gradient(100deg, rgba(255,255,255,0.05) 30%, rgba(255,255,255,0.16) 50%, rgba(255,255,255,0.05) 70%);background-size:200% 100%;animation:skel-shimmer 1.3s linear infinite;';
    poster.appendChild(sk);
    card.appendChild(poster);
    const body = el('div', 'card-body');
    body.appendChild(el('h3', 'card-title', ''));
    body.appendChild(el('div', 'card-meta'));
    card.appendChild(body);
    row.appendChild(card);
  }
  wrap.appendChild(row);
  return wrap;
}

function cardsGrid(items, playlist, opts = {}) {
  const wrap = el('div', 'cards-wrap');
  const grid = el('div', 'cards');
  wrap.appendChild(grid);
  const pageSize = Math.max(20, Number(opts.pageSize || 40));
  const limit = Math.max(0, Number(opts.limit || 500));
  const slice = items.slice(0, limit);
  let shown = 0;
  let footBtn = null;
  const append = () => {
    const end = Math.min(slice.length, shown + pageSize);
    for (let i = shown; i < end; i++) grid.appendChild(cardNode(slice[i], playlist, opts));
    shown = end;
    if (footBtn) { wrap.removeChild(footBtn); footBtn = null; }
    if (shown < slice.length) {
      const remaining = slice.length - shown;
      footBtn = makeButton(t('load_more') + ' (' + I18N.number(remaining) + ')', { cls: 'btn btn-ghost btn-lg', onClick: append });
      wrap.appendChild(footBtn);
    }
  };
  append();
  return wrap;
}

/* ===================== Navigation ===================== */

/* Instant scroll: the viewport uses `scroll-behavior: smooth`, which makes
   programmatic resets animate (and stall when the window is hidden). Route
   changes and category switches should land immediately. */
function setViewScroll(top) {
  const prev = view.style.scrollBehavior;
  view.style.scrollBehavior = 'auto';
  view.scrollTop = top;
  view.style.scrollBehavior = prev;
}

function openMultiview() {
  if (!window.GomizMultiview) return;
  if (player && player.open) { try { player.close(true); } catch (_) {} }
  window.GomizMultiview.open({
    items: () => state.items,
    settings: () => state.settings,
    patchSettings: (p) => patchSettings(p),
    autoFailover: () => !(state.settings && state.settings.proAutoFailover === false),
    getAlternatives: async (item) => { try { const r = await window.api.pro.alternatives(item); return (r && r.items) || []; } catch (_) { return []; } },
    toast
  });
}

function navigate(route, opts = {}) {
  if (route === 'multiview') { openMultiview(); return; }
  // There is no standalone Live TV page anymore: the sidebar and every
  // "view all" link open the receiver on the last watched channel.
  if (route === 'live') {
    openLiveReceiver();
    return;
  }
  // "My List" sidebar entry: opens the live receiver like Live TV, starting on
  // the user's favorites (controls via "All Channels" drawer remain available).
  if (route === 'favorites') {
    openLiveReceiver('favorites');
    return;
  }
  // TV Guide is a modal, not a standalone page — open it directly.
  if (route === 'guide') {
    openGuide();
    return;
  }
  if (state.route === route) {
    if (opts.force) render();
    return;
  }
  state.scroll[state.route] = view.scrollTop;
  if (!opts.replace) state.stack.push(state.route);
  state.route = route;
  if (route === 'favorites' || route === 'live') state.liveEntry = route;
  if (route !== 'search') {
    state.searchTerm = '';
    document.getElementById('searchInput').value = '';
  }
  if (opts.tab) state.settingsTab = opts.tab;
  render();
  if (opts.scrollTop !== undefined) {
    requestAnimationFrame(() => { setViewScroll(opts.scrollTop); });
  } else {
    setViewScroll(0);
  }
}

function goBack() {
  if (!state.stack.length) return;
  const prev = state.stack.pop();
  state.scroll[state.route] = view.scrollTop;
  state.route = prev;
  if (prev !== 'search') {
    state.searchTerm = '';
    document.getElementById('searchInput').value = '';
  }
  render();
  requestAnimationFrame(() => { setViewScroll(state.scroll[prev] || 0); });
}

function updateChrome() {
  // While the receiver is open the sidebar should read "Live TV" / "My List" as the active section.
  const liveOn = !!(player && player.open && player.item && isLiveKind(player.item));
  const entry = state.liveEntry || 'live';
  document.querySelectorAll('.nav .nav-item').forEach((btn) => {
    const route = btn.getAttribute('data-route');
    if (route === 'live' || route === 'favorites') {
      btn.classList.toggle('active', liveOn && route === entry);
      return;
    }
    btn.classList.toggle('active', liveOn ? false : route === state.route);
  });
  document.getElementById('backBtn').hidden = state.stack.length === 0;
  document.getElementById('searchInput').placeholder = t('search_placeholder');
  const langLabels = { en: 'EN', fr: 'FR', ar: 'AR' };
  document.getElementById('langBtn').textContent = langLabels[state.settings.language] || 'EN';
  document.getElementById('langBtn').title = t('language');
  const profileBtn = document.getElementById('profileBtn');
  if (profileBtn) {
    const name = String(activeProfile() || 'default');
    const avatar = profileBtn.querySelector('.avatar');
    const label = profileBtn.querySelector('[data-i18n="profile_default"], .profile-name, span:last-child');
    if (avatar) avatar.textContent = (name.charAt(0) || 'N').toUpperCase();
    if (label) {
      label.textContent = name === 'default' ? t('profile_default') : name;
      label.classList.add('profile-name');
      label.removeAttribute('data-i18n');
    }
  }
}

/* ===================== Rendering ===================== */

function render() {
  if (!state.settings) return;
  applyStaticText();
  updateChrome();
  view.dataset.density = homeLayout().density;
  view.innerHTML = '';

  if (state.loading) {
    view.appendChild(loadingBlock());
    return;
  }

  switch (state.route) {
    case 'home': renderHome(); break;
    case 'movies': renderCatalog('movies'); break;
    case 'series': renderCatalog('series'); break;
    case 'favorites': renderFavorites(); break;
    case 'myvod': renderMyVod(); break;
    case 'downloads': renderDownloads(); break;
    case 'recordings': renderRecordings(); break;
    case 'pro': renderPro(); break;
    case 'sources': renderSources(); break;
    case 'settings': renderSettings(); break;
    case 'search': renderSearch(); break;
    default: renderHome();
  }

  hydrateIcons(view);
}

function applyStaticText() {
  const proLabel = document.getElementById('navProLabel');
  if (proLabel && window.GomizPro) proLabel.textContent = window.GomizPro.tr('nav');
  const mvLabel = document.getElementById('navMvLabel');
  if (mvLabel && window.GomizMultiview) mvLabel.textContent = window.GomizMultiview.tr('title');
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.getAttribute('data-i18n');
    const value = t(key);
    if (value && node.textContent !== value) node.textContent = value;
  });
}

/* ===================== Welcome ===================== */

function renderWelcome() {
  const box = el('div', 'empty');
  box.style.padding = '54px 26px';
  box.style.borderStyle = 'solid';
  box.style.background = 'linear-gradient(160deg, rgba(255,61,90,0.08), rgba(90,108,255,0.05))';

  const mark = el('div', 'brand-mark');
  mark.style.width = '56px';
  mark.style.height = '56px';
  mark.innerHTML = ICONS.tv;
  box.appendChild(mark);

  box.appendChild(el('h3', null, t('welcome_title')));
  box.appendChild(el('p', null, t('welcome_sub')));

  const points = el('div');
  points.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin:8px 0 16px;text-align:start';
  [t('welcome_point_1'), t('welcome_point_2'), t('welcome_point_3')].forEach((line) => {
    const row = el('div');
    row.style.cssText = 'display:flex;align-items:center;gap:9px;font-size:12.5px;color:var(--muted)';
    const chk = el('span');
    chk.style.cssText = 'width:20px;height:20px;border-radius:50%;display:grid;place-items:center;background:rgba(56,211,159,0.14);color:var(--ok)';
    chk.innerHTML = ICONS.check;
    chk.firstChild.style.width = '12px';
    row.appendChild(chk);
    row.appendChild(el('span', null, line));
    points.appendChild(row);
  });
  box.appendChild(points);

  const seg = el('div', 'seg');
  const langs = [['ar', t('arabic')], ['en', t('english')]];
  langs.forEach(([code, label]) => {
    const b = el('button', state.settings.language === code ? 'on' : '', label);
    b.addEventListener('click', async () => {
      await setLanguage(code);
      render();
    });
    seg.appendChild(b);
  });
  const langRow = el('div');
  langRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:14px';
  langRow.appendChild(el('span', 'tiny dim', t('welcome_language')));
  langRow.appendChild(seg);
  box.appendChild(langRow);

  const actions = el('div');
  actions.style.cssText = 'display:flex;gap:9px;flex-wrap:wrap;justify-content:center';
  actions.appendChild(makeButton(t('add_source'), { cls: 'btn btn-primary', icon: 'plus', onClick: () => openSourceModal() }));
  actions.appendChild(makeButton(t('sample_playlist'), { cls: 'btn btn-ghost', icon: 'play', onClick: () => loadDemo() }));
  box.appendChild(actions);

  view.appendChild(box);
}

/* ===================== Home ===================== */

function widgetRefreshButton() {
  const b = el('button', 'wc-refresh');
  b.type = 'button';
  const label = t('refresh') || 'Refresh';
  b.title = label;
  b.setAttribute('aria-label', label);
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>';
  b.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (b.disabled) return;
    b.disabled = true;
    b.classList.add('spinning');
    try { await loadLocationWeatherPrayer(); }
    finally { b.classList.remove('spinning'); b.disabled = false; }
  });
  return b;
}

/** Hide Xtream credentials from any URL shown in the UI. */
function safeDisplayUrl(url) {
  try {
    const s = String(url || '');
    return s.replace(/([?&](?:username|user|password|pass|token|apikey)=)[^&#\s]+/gi, '$1••••');
  } catch (_) { return String(url || ''); }
}

function homeWidget() {
  const s = state.settings || {};
  const hour = new Date().getHours();
  const isNight = hour < 6 || hour >= 18;
  const wrap = el('div', 'home-widget premium' + (isNight ? ' wc-night' : ' wc-day'));

  /* ---------- Clock card ---------- */
  const clock = el('section', 'wc-card wc-clock');
  clock.id = 'wcClockCard';
  clock.appendChild(premiumTag(t('widget_time') || 'Local Time', 'wc-clock-dot'));
  clock.appendChild(widgetRefreshButton());
  const clockValue = el('div', 'wc-value wc-value-mono', formatTime(new Date()));
  clockValue.id = 'homeClock';
  const analogGlyph = el('div', 'wc-glyph wc-glyph-svg');
  analogGlyph.innerHTML = analogClockSVG();
  const clockRow = el('div', 'wc-row');
  clockRow.appendChild(analogGlyph);
  clockRow.appendChild(clockValue);
  clock.appendChild(clockRow);
  const clockSub = el('div', 'wc-sub', new Date().toLocaleDateString(appLocale(), { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }));
  clockSub.id = 'homeClockDate';
  clock.appendChild(clockSub);
  if (s.widgetClock === false) clock.classList.add('hidden-ui');

  /* ---------- Weather card ---------- */
  const weather = el('section', 'wc-card wc-weather');
  weather.id = 'wcWeatherCard';
  weather.appendChild(premiumTag(t('widget_weather') || 'Weather', 'wc-weather-dot'));
  weather.appendChild(widgetRefreshButton());
  const wRow = el('div', 'wc-row');
  const wGlyph = el('div', 'wc-glyph wc-glyph-svg');
  wGlyph.innerHTML = weatherGlyph(state.weather && state.weather.icon, state.weather && state.weather.isDay);
  wGlyph.id = 'homeWeatherGlyph';
  wRow.appendChild(wGlyph);
  const wCol = el('div', 'wc-col');
  const wValue = el('div', 'wc-value', formatTemp(state.weather && state.weather.tempC));
  wValue.id = 'homeWeatherTemp';
  wCol.appendChild(wValue);
  let wSubText = '';
  if (state.weather && state.location) {
    const wind = state.weather.windspeed != null ? Math.round(Number(state.weather.windspeed)) : null;
    const windDir = state.weather.winddirection != null ? Math.round(Number(state.weather.winddirection)) : null;
    const parts = [state.weather.desc, state.location.city].filter(Boolean);
    if (wind != null) parts.push((I18N.lang === 'ar' ? 'ريح ' : 'wind ') + wind + ' km/h' + (windDir != null ? ' · ' + windDir + '°' : ''));
    wSubText = parts.join(' · ');
  } else if (state.weatherStatus === 'custom:notfound') {
    wSubText = t('city_not_found');
  } else if (state.weatherError === 'no_location' || state.weatherStatus === 'unavailable') {
    wSubText = t('weather_unavailable');
  } else if (state.weatherError) {
    wSubText = t('weather_unavailable');
  } else {
    wSubText = t('loading');
  }
  const wSub = el('div', 'wc-sub', wSubText);
  wSub.id = 'homeWeatherDesc';
  wSub.title = state.weatherError || state.weatherStatus || '';
  wCol.appendChild(wSub);
  wRow.appendChild(wCol);
  weather.appendChild(wRow);
  if (s.widgetWeather === false) weather.classList.add('hidden-ui');

  /* ---------- Prayer card ---------- */
  const prayer = el('section', 'wc-card wc-prayer');
  prayer.id = 'wcPrayerCard';
  prayer.appendChild(premiumTag(t('widget_prayer') || 'Prayer times', 'wc-prayer-dot'));
  prayer.appendChild(widgetRefreshButton());
  const pRow = el('div', 'wc-row');
  const pGlyph = el('div', 'wc-glyph wc-glyph-svg');
  pGlyph.innerHTML = mosqueSVG();
  pRow.appendChild(pGlyph);
  const pCol = el('div', 'wc-col');
  const pValue = el('div', 'wc-value');
  pValue.id = 'homePrayerName';
  pCol.appendChild(pValue);
  const pSub = el('div', 'wc-sub');
  pSub.id = 'homePrayerDetail';
  if (state.prayer) {
    // handled by updatePrayerCountdown() every second
  } else if (state.weatherError || state.weatherStatus === 'unavailable') {
    pSub.textContent = t('weather_unavailable');
  } else {
    pSub.textContent = t('loading');
  }
  pCol.appendChild(pSub);
  pRow.appendChild(pCol);
  prayer.appendChild(pRow);
  if (state.prayer) {
    const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
    const labels = { Fajr: t('fajr') || 'Fajr', Dhuhr: t('dhuhr') || 'Dhuhr', Asr: t('asr') || 'Asr', Maghrib: t('maghrib') || 'Maghrib', Isha: t('isha') || 'Isha' };
    prayer.title = prayers.map((p) => (labels[p] || p) + ' ' + (state.prayer[p] || '')).join('  ·  ');
  }
  if (s.widgetPrayer === false) prayer.classList.add('hidden-ui');

  wrap.appendChild(clock);
  wrap.appendChild(weather);
  wrap.appendChild(prayer);
  setTimeout(updateWidgetBackgrounds, 0);
  return wrap;
}

function premiumTag(text, dotClass) {
  const chip = el('div', 'wc-tag');
  chip.appendChild(el('span', 'wc-tag-dot ' + (dotClass || '')));
  chip.appendChild(el('span', 'wc-tag-text', text));
  return chip;
}


/* ---------- Realistic widget artwork (SVG, no external assets) ---------- */





const WMO_DESCRIPTIONS = {
  clear: { en: 'Clear sky', ar: 'صافي' },
  partly: { en: 'Partly cloudy', ar: 'غائم جزئيًا' },
  overcast: { en: 'Overcast', ar: 'غيوم كثيفة' },
  fog: { en: 'Fog', ar: 'ضباب' },
  rain: { en: 'Rain', ar: 'مطر' },
  snow: { en: 'Snow', ar: 'ثلج' },
  thunder: { en: 'Thunderstorm', ar: 'عاصفة رعدية' },
  other: { en: 'Variable', ar: 'متغير' }
};

const HERO_COUNT = 10;
function pickHeroSet(n = HERO_COUNT) {
  const withLogo = state.items.filter((x) => x.logo);
  const featured = withLogo.filter((x) => isMovieKind(x) || isSeriesKind(x));
  const vodOnly = state.items.filter((x) => isMovieKind(x) || isSeriesKind(x));
  const pool = featured.length ? featured : vodOnly.length ? vodOnly : state.items;
  if (!pool.length) return [];
  // Show the LATEST items first (playlist order is assumed newest-last).
  const ordered = pool.slice().reverse();
  const out = [];
  const step = Math.max(1, Math.floor(ordered.length / n));
  for (let i = 0; i < ordered.length && out.length < n; i += step) out.push(ordered[i]);
  let k = 0;
  while (out.length < n && k < ordered.length) {
    const cand = ordered[k++];
    if (!out.includes(cand)) out.push(cand);
  }
  return out.slice(0, n);
}

function renderHome() {
  if (!state.sources.length) {
    renderWelcome();
    return;
  }
  if (!state.items.length) {
    view.appendChild(pageHead(t('nav_home'), t('tagline')));
    view.appendChild(emptyBlock(t('empty'), t('empty_hint'), makeButton(t('add_source'), {
      cls: 'btn btn-primary', icon: 'plus', onClick: () => openSourceModal()
    })));
    return;
  }

  const layout = homeLayout();
  const limit = layout.rowLimit;

  // ---- Weather / time / prayer widget (top, before hero) ----
  view.appendChild(homeWidget());

  const heroSet = pickHeroSet(HERO_COUNT);
  const _split = splitKinds(state.items);
  const live = _split.live;
  const moviesAll = _split.movies;
  const seriesAll = _split.series;

  for (const id of layout.order) {
    if (layout.hidden.includes(id)) continue;

    if (id === 'hero') {
      const carousel = renderHomeCarousel(heroSet);
      if (carousel) view.appendChild(carousel);
      continue;
    }

    if (id === 'live') {
      if (!live.length) continue;
      view.appendChild(section(t('nav_live'), I18N.number(live.length), t('view_all'), () => navigate('live')));
      view.appendChild(cardsRow(live, live, { limit }));
      continue;
    }

    if (id === 'movies') {
      if (!moviesAll.length) continue;
      view.appendChild(section(t('nav_movies'), I18N.number(moviesAll.length), t('view_all'), () => navigate('movies')));
      view.appendChild(cardsRow(moviesAll, moviesAll, { limit }));
      continue;
    }

    if (id === 'series') {
      if (!seriesAll.length) continue;
      view.appendChild(section(t('nav_series'), I18N.number(seriesAll.length), t('view_all'), () => navigate('series')));
      view.appendChild(cardsRow(seriesAll, seriesAll, { limit }));
      continue;
    }
  }
}

function renderHomeCarousel(items) {
  if (!items || !items.length) return null;
  const total = Math.min(items.length, HERO_COUNT);
  const wrap = el('div', 'hero hero-carousel');
  const viewport = el('div', 'hero-viewport');

  for (let s = 0; s < total; s++) {
    const item = items[s];
    const slide = el('section', 'hero-slide');
    slide.setAttribute('aria-label', String(item.name || ''));

    const bg = el('div', 'hero-bg');
    if (item.logo) {
      const img = el('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = item.logo;
      img.addEventListener('error', () => { img.remove(); slide.classList.add('hero-plain'); });
      bg.appendChild(img);
    } else {
      slide.classList.add('hero-plain');
    }
    slide.appendChild(bg);

    const content = el('div', 'hero-content');
    const kicker = el('div', 'hero-kicker');
    kicker.appendChild(el('span', null, item.kind === 'live' ? t('live') : item.kind === 'series' ? t('nav_series') : t('nav_movies')));
    content.appendChild(kicker);
    content.appendChild(el('h2', 'hero-title', item.name));

    const count = state.items.filter((x) => x.group === item.group).length;
    const meta = el('p', 'hero-desc');
    const parts = [];
    if (item.group) parts.push(item.group);
    parts.push(I18N.count(count, item.kind === 'live' ? 'channels' : 'items'));
    if (item.sourceName) parts.push(item.sourceName);
    parts.forEach((text) => meta.appendChild(el('span', 'hero-desc-part', text)));
    content.appendChild(meta);

    const actions = el('div', 'hero-actions');
    actions.appendChild(makeButton(t('play'), {
      cls: 'btn btn-primary',
      icon: 'play',
      onClick: () => (item.kind === 'live' ? playItem(item, state.items.filter((x) => x.kind === 'live')) : playItem(item, state.items))
    }));
    if (item.kind !== 'live') {
      actions.appendChild(makeButton(t('details'), { cls: 'btn btn-ghost', icon: 'info', onClick: () => showDetail(item, state.items) }));
    }
    const fav = isFavorite(item.key);
    actions.appendChild(makeButton(fav ? t('unfavorite') : t('favorite'), {
      cls: 'btn btn-ghost',
      icon: 'heart',
      onClick: () => toggleFavorite(item)
    }));
    content.appendChild(actions);
    slide.appendChild(content);
    viewport.appendChild(slide);
  }
  wrap.appendChild(viewport);

  let idx = 0;
  let timer = null;
  const stopAuto = () => { if (timer) { clearInterval(timer); timer = null; } };
  const go = (i) => {
    idx = (i + total) % total;
    viewport.style.transform = 'translateX(' + (-idx * 100) + '%)';
    const dots = wrap.querySelectorAll('.hero-dot');
    dots.forEach((d, di) => d.classList.toggle('on', di === idx));
  };
  const startAuto = () => {
    stopAuto();
    if (total <= 1) return;
    timer = setInterval(() => {
      if (!wrap.isConnected) { stopAuto(); return; }
      go(idx + 1);
    }, 3000);
  };

  if (total > 1) {
    const prev = makeButton('', { cls: 'hero-arrow prev', icon: 'prev', onClick: () => { go(idx - 1); stopAuto(); } });
    prev.setAttribute('aria-label', 'Previous');
    const next = makeButton('', { cls: 'hero-arrow next', icon: 'next', onClick: () => { go(idx + 1); stopAuto(); } });
    next.setAttribute('aria-label', 'Next');
    wrap.appendChild(prev);
    wrap.appendChild(next);
    const side = el('div', 'hero-side');
    for (let d = 0; d < total; d++) {
      const dot = el('button', 'hero-dot');
      dot.setAttribute('aria-label', 'Slide ' + (d + 1));
      dot.addEventListener('click', () => { go(d); stopAuto(); });
      side.appendChild(dot);
    }
    wrap.appendChild(side);
  }

  wrap.addEventListener('mouseenter', stopAuto);
  wrap.addEventListener('mouseleave', startAuto);
  go(0);
  startAuto();
  return wrap;
}

const _catalogCache = { items: null, movies: null, series: null, groups: null };
function catalogItems(which) {
  if (_catalogCache.items !== state.items) {
    _catalogCache.items = state.items;
    _catalogCache.movies = state.items.filter(isMovieKind);
    _catalogCache.series = state.items.filter(isSeriesKind);
    _catalogCache.groups = null;
  }
  if (which === 'series') return _catalogCache.series;
  return _catalogCache.movies;
}
function groupCounts(items) {
  if (items === _catalogCache.items && _catalogCache.groups) return _catalogCache.groups;
  const out = {};
  for (const item of items) {
    const g = item.group || 'Uncategorized';
    out[g] = (out[g] || 0) + 1;
  }
  if (items === _catalogCache.items) _catalogCache.groups = out;
  return out;
}

/* ===================== Live ===================== */

/* How many channel cards are painted per batch. Keeps the Live screen responsive
   with thousands of channels while still making every channel reachable. */
async function loadEpgFor(channels) {
  const eps = await window.api.epg.list().catch(() => []);
  if (!eps.length) return;
  // De-duplicate ids so we never ask the main process for the same channel twice.
  const ids = Array.from(new Set(channels.map((c) => c.tvgId || c.tvgName).filter(Boolean)));
  if (!ids.length) return;
  const fresh = Date.now() - state.epgAt < 5 * 60 * 1000;
  const missing = ids.filter((id) => !epgLookup(id));
  if (fresh && !missing.length) return;
  // Share one in-flight request: two rapid renders must not leave the second
  // one without EPG labels.
  if (state.epgLoading) return state.epgPromise;
  state.epgLoading = true;
  state.epgPromise = (async () => {
    try {
      // Merge: playing a channel fetches only its id and must not wipe the
      // guide data already loaded for the rest of the library.
      const fetched = await window.api.epg.channels(ids);
      state.epg = Object.assign({}, state.epg, fetched);
      state.epgIndex = new Map();
      for (const key of Object.keys(state.epg)) {
        const list = state.epg[key];
        if (!list || !list.length) continue;
        for (const variant of epgVariants(key)) {
          if (!state.epgIndex.has(variant)) state.epgIndex.set(variant, list);
        }
      }
      state.epgAt = Date.now();
    } catch (_) {
    } finally {
      state.epgLoading = false;
      state.epgPromise = null;
    }
  })();
  return state.epgPromise;
}

function epgVariants(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const lower = raw.toLowerCase();
  const noAt = lower.split('@')[0];
  const compact = lower.replace(/[\s._-]+/g, '');
  return Array.from(new Set([lower, noAt, compact]));
}

/* XMLTV ids and playlist ids rarely match character-for-character:
   "Eurosport1.fr@France" vs "Eurosport1.fr". Try the normalised forms too. */
function epgLookup(value) {
  for (const key of epgVariants(value)) {
    const list = state.epgIndex.get(key);
    if (list && list.length) return list;
  }
  const raw = String(value || '');
  return (raw && state.epg[raw]) || null;
}

function epgForChannel(channel) {
  const keys = [channel.tvgId, channel.tvgName, channel.name].filter(Boolean);
  for (const key of keys) {
    const list = epgLookup(key);
    if (list && list.length) return list;
  }
  return null;
}

function epgNowNext(channel) {
  const list = epgForChannel(channel);
  if (!list) return null;
  const now = Date.now();
  const current = list.find((p) => p.start && p.stop && p.start <= now && p.stop > now) || null;
  const next = list.find((p) => p.start && p.start > now) || null;
  return { current, next };
}

function openGuide() {
  const channels = state.items.filter(isLiveKind);
  const wrap = el('div');
  wrap.appendChild(el('h2', null, t('guide')));
  wrap.appendChild(el('p', 'lead', t('nav_live')));

  if (!channels.length) {
    wrap.appendChild(emptyBlock(t('empty'), t('empty_hint')));
    openModal(wrap, { wide: true });
    return;
  }

  const hasEpg = Object.keys(state.epg).length > 0;
  if (!hasEpg) {
    wrap.appendChild(emptyBlock(t('no_epg_data'), t('no_epg'), makeButton(t('add_epg'), {
      cls: 'btn btn-primary', icon: 'plus', onClick: () => { closeModal(); openEpgModal(); }
    })));
    openModal(wrap, { wide: true });
    loadEpgFor(channels).then(() => {
      if (Object.keys(state.epg).length) { closeModal(); openGuide(); }
    });
    return;
  }

  const table = el('div', 'list');
  channels.slice(0, 300).forEach((channel) => {
    const info = epgNowNext(channel);
    if (!info) return;
    const row = el('div', 'list-row');
    const logo = el('div', 'channel-logo');
    logo.style.width = '44px';
    logo.style.height = '32px';
    if (channel.logo) {
      const img = el('img');
      img.src = channel.logo;
      img.addEventListener('error', () => {
        img.remove();
        logo.textContent = initials(channel.name);
      });
      logo.appendChild(img);
    } else logo.textContent = initials(channel.name);

    const main = el('div', 'list-main');
    main.appendChild(el('div', 'list-title', channel.name));
    if (info.current) {
      main.appendChild(el('div', 'channel-sub', t('now') + ' · ' + ltr(I18N.date(info.current.start) + '–' + I18N.date(info.current.stop)) + ' · ' + info.current.title));
    }
    if (info.next) {
      main.appendChild(el('div', 'list-sub', t('next') + ' · ' + ltr(I18N.date(info.next.start)) + ' · ' + info.next.title));
    }
    row.appendChild(logo);
    row.appendChild(main);

    const play = makeButton(t('play'), { cls: 'btn btn-ghost btn-sm', icon: 'play', onClick: () => { closeModal(); playItem(channel, channels); } });
    row.appendChild(play);
    if (channel.catchup && window.GomizPro) {
      row.appendChild(makeButton(window.GomizPro.tr('catchup'), { cls: 'btn btn-ghost btn-sm', onClick: () => { closeModal(); window.GomizPro.openCatchup(channel, proCtx()); } }));
    }
    table.appendChild(row);
  });

  if (!table.children.length) wrap.appendChild(emptyBlock(t('no_epg_data')));
  else wrap.appendChild(table);
  openModal(wrap, { wide: true });
}

/* ===================== Catalogs ===================== */

function renderCatalog(which) {
  const all = catalogItems(which);
  const label = which === 'series' ? t('nav_series') : t('nav_movies');
  if (!all.length) {
    view.appendChild(pageHead(label, t('tagline')));
    view.appendChild(emptyBlock(t('empty'), t('empty_hint'), makeButton(t('add_source'), {
      cls: 'btn btn-primary', icon: 'plus', onClick: () => openSourceModal()
    })));
    return;
  }

  const filter = state.filters[which];
  const counts = groupCounts(all);
  const groups = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

  const groupSel = makeDarkSelect(
    [['all', t('all')]].concat(groups.map((g) => [g, g + ' (' + counts[g] + ')'])),
    filter.group,
    (v) => { filter.group = v; render(); },
    { minWidth: '150px', width: 'auto' }
  );

  const sortSel = makeDarkSelect(
    [['default', t('sort_default')], ['name', t('sort_name')], ['group', t('sort_group')]],
    filter.sort,
    (v) => { filter.sort = v; render(); },
    { minWidth: '150px', width: 'auto' }
  );

  view.appendChild(pageHead(label, I18N.count(all.length, 'items'), [groupSel, sortSel]));

  let items = filter.group === 'all' ? all.slice() : all.filter((x) => (x.group || 'Uncategorized') === filter.group);
  if (filter.sort === 'name') items.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  else if (filter.sort === 'group') items.sort((a, b) => String(a.group || '').localeCompare(String(b.group || '')) || String(a.name).localeCompare(String(b.name)));

  if (!items.length) {
    view.appendChild(emptyBlock(t('no_results')));
    return;
  }

  const shown = Math.min(items.length, 1000);
  view.appendChild(cardsGrid(items, items, { limit: shown, pageSize: 60 }));
}

/* ===================== Favorites ===================== */

function renderFavorites() {
  const items = state.library.favorites;
  view.appendChild(pageHead(t('nav_favorites'), I18N.count(items.length, 'items'), [
    items.length ? makeButton(t('clear'), {
      cls: 'btn btn-ghost btn-sm', icon: 'trash',
      onClick: async () => {
        const ok = await confirmModal(t('clear_favorites'), t('clear_history_q'), t('clear'), true);
        if (!ok) return;
        state.library = await window.api.library.clear('favorites', activeProfile());
        toast(t('cleared'), 'ok');
        render();
      }
    }) : null
  ].filter(Boolean)));

  if (!items.length) {
    view.appendChild(emptyBlock(t('empty'), t('favorite'), makeButton(t('nav_live'), {
      cls: 'btn btn-primary', icon: 'live', onClick: () => navigate('live')
    })));
    return;
  }
  view.appendChild(cardsGrid(items, items, { limit: 600 }));
}

function renderMyVod() {
  const favKeys = new Set(state.library.favorites.map((x) => x && x.key));
  const items = state.items.filter((x) => isVodKind(x) && favKeys.has(x.key));
  view.appendChild(pageHead(t('nav_my_vod') || 'My Movies & Series', I18N.count(items.length, 'items'), [
    items.length && makeButton(t('clear'), {
      cls: 'btn btn-ghost btn-sm', icon: 'trash',
      onClick: async () => {
        const ok = await confirmModal(t('clear_favorites'), t('clear_history_q'), t('clear'), true);
        if (!ok) return;
        state.library = await window.api.library.clear('favorites', activeProfile());
        toast(t('cleared'), 'ok');
        render();
      }
    })
  ].filter(Boolean)));
  if (!items.length) {
    view.appendChild(emptyBlock(t('empty'), t('favorite'), makeButton(t('nav_movies'), {
      cls: 'btn btn-primary', icon: 'film', onClick: () => navigate('movies')
    })));
    return;
  }
  view.appendChild(cardsGrid(items, items, { limit: 600 }));
}
/* ===================== Search ===================== */

function renderSearch() {
  const term = state.searchTerm.trim();
  if (!term) {
    view.appendChild(pageHead(t('search'), t('search_history')));
    if (state.library.search.length) {
      const box = el('div');
      box.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
      state.library.search.forEach((q) => {
        const chip = el('button', 'chip', q);
        chip.addEventListener('click', () => {
          state.searchTerm = q;
          document.getElementById('searchInput').value = q;
          render();
        });
        box.appendChild(chip);
      });
      view.appendChild(box);
    } else {
      view.appendChild(emptyBlock(t('search'), t('search_placeholder')));
    }
    return;
  }

  const lower = term.toLowerCase();
  const results = state.items.filter((x) =>
    (x.name || '').toLowerCase().includes(lower) ||
    (x.group || '').toLowerCase().includes(lower) ||
    (x.tvgName || '').toLowerCase().includes(lower)
  );

  view.appendChild(pageHead(t('search'), I18N.count(results.length, 'results')));

  if (!results.length) {
    view.appendChild(emptyBlock(t('no_results'), term));
    return;
  }

  const live = results.filter(isLiveKind);
  const moviesRes = results.filter(isMovieKind);
  const seriesRes = results.filter(isSeriesKind);

  if (live.length) {
    view.appendChild(section(t('nav_live'), live.length));
    view.appendChild(cardsRow(live, live, { limit: 16 }));
  }
  if (moviesRes.length) {
    view.appendChild(section(t('nav_movies'), moviesRes.length));
    view.appendChild(cardsGrid(moviesRes, moviesRes, { limit: 120 }));
  }
  if (seriesRes.length) {
    view.appendChild(section(t('nav_series'), seriesRes.length));
    view.appendChild(cardsGrid(seriesRes, seriesRes, { limit: 120 }));
  }
}

/* ===================== Detail modal ===================== */

function showDetail(item, playlist) {
  const wrap = el('div');
  wrap.appendChild(el('h2', null, item.name));

  const meta = el('div', 'detail-meta');
  meta.appendChild(el('span', 'pill accent', item.kind === 'live' ? t('live') : kindLabel(item.kind)));
  if (item.group) meta.appendChild(el('span', 'pill', item.group));
  if (item.sourceName) meta.appendChild(el('span', 'pill', item.sourceName));
  if (item.tvgName) meta.appendChild(el('span', 'pill', item.tvgName));
  wrap.appendChild(meta);

  const poster = el('div', 'detail-poster');
  if (item.logo) {
    const img = el('img');
    img.src = item.logo;
    img.addEventListener('error', () => { img.remove(); poster.appendChild(el('div', 'ph', initials(item.name))); });
    poster.appendChild(img);
  } else {
    const ph = el('div', 'ph');
    ph.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;font-size:34px;font-weight:800;color:rgba(255,255,255,.3)';
    ph.textContent = initials(item.name);
    poster.appendChild(ph);
  }

  const info = el('div');

  const facts = el('div', 'detail-facts');
  const rows = [
    [t('status'), item.kind === 'live' ? t('live') : kindLabel(item.kind)],
    [t('group'), item.group || ''],
    [t('nav_sources'), item.sourceName || ''],
    [t('channel'), item.kind === 'live' ? (item.tvgName || item.tvgId || '') : '']
  ].filter(([, value]) => value);
  rows.forEach(([label, value]) => {
    const row = el('div');
    row.appendChild(el('span', null, label));
    row.appendChild(el('b', null, value));
    facts.appendChild(row);
  });
  info.appendChild(facts);

  const actions = el('div', 'detail-actions');
  actions.appendChild(makeButton(t('play'), {
    cls: 'btn btn-primary', icon: 'play',
    onClick: () => { closeModal(); playItem(item, playlist); }
  }));
  const resume = resumeFor(item);
  if (resume > 5) {
    actions.appendChild(makeButton(t('resume') + ' · ' + Math.floor(resume / 60) + t('minutes_short'), {
      cls: 'btn btn-ghost', icon: 'clock',
      onClick: () => { closeModal(); playItem(item, playlist); }
    }));
  }

  const favBtn = makeButton(isFavorite(item.key) ? t('unfavorite') : t('favorite'), {
    cls: 'btn btn-ghost', icon: 'heart'
  });
  favBtn.addEventListener('click', async () => {
    await toggleFavorite(item);
    const on = isFavorite(item.key);
    favBtn.innerHTML = '';
    favBtn.appendChild(iconSpan('heart'));
    favBtn.appendChild(el('span', null, on ? t('unfavorite') : t('favorite')));
    favBtn.classList.toggle('btn-danger', on);
  });
  actions.appendChild(favBtn);

  if (item.kind !== 'live') {
    const dlBtn = makeButton(t('download'), {
      cls: 'btn btn-ghost', icon: 'download',
      onClick: async () => {
        // Instant visual feedback: the button was dead before any response.
        const original = dlBtn.textContent;
        dlBtn.textContent = I18N.lang === 'ar' ? 'جارٍ الإضافة…' : 'Adding…';
        dlBtn.disabled = true;
        dlBtn.classList.add('busy');
        toast(I18N.lang === 'ar' ? 'تم بدء التحميل' : 'Download started', 'ok');
        try {
          // IPC clone-safe payload: plain JSON only (headers copied as plain object)
          const plainHeaders = {};
          try {
            const h = item.headers || {};
            if (typeof h.forEach === 'function' && typeof h.entries !== 'function') h.forEach((v, k) => { plainHeaders[String(k)] = String(v); });
            else Object.keys(h).forEach((k) => { plainHeaders[String(k)] = String(h[k]); });
          } catch (_) {}
          const res = await window.api.downloads.add({
            title: String(item.name || ''), url: String(item.url || ''),
            headers: plainHeaders, logo: String(item.logo || ''), group: String(item.group || '')
          });
          if (res && res.error === 'stream') toast(t('download_stream_error'), 'err');
          else if (res && res.record) {
            toast(t('download_queued'), 'ok');
            try { state.downloads = await window.api.downloads.list(); } catch (_) {}
          } else if (res && res.error) {
            toast(t('download_failed') + ': ' + String(res.error).slice(0, 140), 'err');
          } else toast(t('download_failed'), 'err');
        } catch (e) {
          toast(t('download_failed') + ': ' + String(e && e.message || e).slice(0, 140), 'err');
        } finally {
          dlBtn.textContent = original;
          dlBtn.disabled = false;
          dlBtn.classList.remove('busy');
        }
      }
    });
    actions.appendChild(dlBtn);
  }

  if (/^https?:/i.test(item.url)) {
    actions.appendChild(makeButton(t('open_in_browser'), {
      cls: 'btn btn-ghost', icon: 'external',
      onClick: () => window.api.shell.openExternal(item.url)
    }));
  }
  info.appendChild(actions);

  const grid = el('div', 'detail');
  grid.appendChild(poster);
  grid.appendChild(info);
  wrap.appendChild(grid);

  /* ---- Recommended movies (below the details) ---- */
  const recs = recommendMovies(item, 6);
  const recBox = el('div');
  if (recs.length) {
    // skeleton placeholders for the recommendation row, swapped synchronously for the real cards
    recBox.appendChild(skeletonCards(8));
    while (recBox.firstChild) recBox.removeChild(recBox.firstChild);
    const recHead = el('div', 'section-head');
    recHead.appendChild(el('h2', 'section-title', t('recommended')));
    recBox.appendChild(recHead);
    const recRow = cardsRow(recs, recs);
    const rowEl = recRow.querySelector('.row');
    if (rowEl) {
      rowEl.addEventListener('wheel', (e) => {
        e.preventDefault();
        const dir = e.deltaY < 0 ? 1 : -1;
        rowEl.scrollBy({ left: dir * 520, behavior: 'smooth' });
      }, { passive: false });
    }
    recBox.appendChild(recRow);
  } else {
    recBox.appendChild(emptyBlock(t('no_results'), t('empty_hint')));
  }
  wrap.appendChild(recBox);

  openModal(wrap, { wide: true });
}

/* ===================== Sources ===================== */

/** Locale tied to the app language (not the OS locale) — avoids French dates in EN mode. */
function appLocale() {
  return (state.settings && state.settings.language === 'ar') ? 'ar' : 'en-US';
}

function formatAccountExpiry(info) {
  if (!info || !info.available) return info && info.error ? 'Unavailable' : '—';
  if (!info.expDate) return 'Unlimited';
  const d = new Date(Number(info.expDate) * 1000);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString(appLocale(), { year: 'numeric', month: 'short', day: 'numeric' });
}

function sourceSubText(source) {
  const kindText = source.kind === 'xtream' ? t('type_xtream') : (source.kind === 'single' ? t('type_single') : t('type_playlist'));
  const updated = source.fetchedAt ? I18N.day(source.fetchedAt) + ' · ' + I18N.date(source.fetchedAt) : '—';
  let exp = '—';
  if (source.kind === 'xtream') {
    const info = state.accountInfo.get(source.id);
    exp = info ? formatAccountExpiry(info) : '…';
  }
  return kindText + ' · ' + I18N.count(source.count || 0, 'items') + ' · ' + updated + ' · ' + (t('server_expires') || 'Expires') + ': ' + exp;
}

async function fetchAccountInfo(id) {
  if (state.accountInfo.has(id)) return;
  try {
    const info = await window.api.sources.account(id);
    state.accountInfo.set(id, info || { available: false });
  } catch (_) {
    state.accountInfo.set(id, { available: false, error: 'unavailable' });
  }
  if (state.route === 'sources') render();
}

function renderSources() {
  const headActions = [
    makeButton(t('import_file'), { cls: 'btn btn-ghost btn-sm', icon: 'folder', onClick: () => importPlaylistFile() }),
    makeButton(t('add_source'), { cls: 'btn btn-primary btn-sm', icon: 'plus', onClick: () => openSourceModal() })
  ];
  view.appendChild(pageHead(t('nav_sources'), t('tagline'), headActions));

  view.appendChild(section(t('nav_sources'), state.sources.length));

  if (!state.sources.length) {
    view.appendChild(emptyBlock(t('no_sources'), t('no_sources_hint'), makeButton(t('sample_playlist'), {
      cls: 'btn btn-primary', icon: 'play', onClick: () => loadDemo()
    })));
  } else {
    const list = el('div', 'list');
    for (const source of state.sources) {
      const row = el('div', 'list-row');
      const ico = el('div', 'channel-logo');
      ico.style.borderRadius = '10px';
      ico.innerHTML = ICONS.source;
      ico.style.color = 'var(--accent)';
      row.appendChild(ico);

      const main = el('div', 'list-main');
      main.appendChild(el('div', 'list-title', source.name));
      main.appendChild(el('div', 'list-sub', sourceSubText(source)));
      row.appendChild(main);

      const actions = el('div', 'list-actions');
      actions.appendChild(makeButton('', {
        cls: 'icon-btn', icon: 'edit', title: t('edit'),
        onClick: () => openSourceModal(null, source)
      }));
      actions.appendChild(makeButton('', {
        cls: 'icon-btn', icon: 'refresh', title: t('refresh'),
        onClick: async (e) => {
          const btn = e.currentTarget;
          btn.classList.add('spin-ico');
          try {
            const data = await refreshSource(source.id);
            toast(t('updated') + (data && data.count != null ? ' · ' + I18N.count(data.count, 'items') : ''), 'ok');
          } catch (err) {
            toast(err.message || t('source_failed'), 'err');
          } finally {
            btn.classList.remove('spin-ico');
          }
        }
      }));
      if (source.kind === 'xtream') {
        actions.appendChild(makeButton('', {
          cls: 'icon-btn', icon: 'lock', title: 'Re-enter password / إعادة إدخال كلمة المرور',
          onClick: async () => {
            const pw = await promptModal('Re-enter password',
              'Enter the Xtream password again (after restoring a backup on another PC):', '', true);
            if (pw == null) return;
            const r = await window.api.sources.setPassword(source.id, pw);
            toast(r && r.ok ? 'Password saved' : 'Failed', r && r.ok ? 'ok' : 'err');
          }
        }));
      }
      actions.appendChild(makeButton('', {
        cls: 'icon-btn', icon: 'trash', title: t('delete'),
        onClick: async () => {
          const ok = await confirmModal(t('delete_source'), t('delete_source_q'), t('delete'), true);
          if (!ok) return;
          await window.api.sources.remove(source.id);
          await loadAllItems();
          toast(t('source_removed'), 'ok');
          render();
        }
      }));
      row.appendChild(actions);
      list.appendChild(row);
    }
    view.appendChild(list);
  }

  // Fetch Xtream account expiry lazily (cached in state.accountInfo)
  for (const source of state.sources) {
    if (source.kind === 'xtream' && !state.accountInfo.has(source.id)) {
      fetchAccountInfo(source.id);
    }
  }

  // EPG section
  const eps = state.settings.epgUrls || [];
  const epgSection = section(t('guide'), eps.length);
  const addEpg = makeButton(t('add_epg'), { cls: 'btn btn-ghost btn-sm', icon: 'plus', onClick: openEpgModal });
  epgSection.appendChild(el('div', 'spacer')).style.flex = '1';
  epgSection.appendChild(addEpg);
  view.appendChild(epgSection);

  if (!eps.length) {
    view.appendChild(emptyBlock(t('no_epg'), t('epg_url'), makeButton(t('add_epg'), {
      cls: 'btn btn-primary', icon: 'plus', onClick: openEpgModal
    })));
  } else {
    const list = el('div', 'list');
    eps.forEach((entry) => {
      const row = el('div', 'list-row');
      const ico = el('div', 'channel-logo');
      ico.innerHTML = ICONS.guide;
      ico.style.color = 'var(--accent)';
      row.appendChild(ico);
      const main = el('div', 'list-main');
      main.appendChild(el('div', 'list-title', entry.name || safeDisplayUrl(entry.url)));
      main.appendChild(el('div', 'list-sub', entry.url));
      row.appendChild(main);
      const actions = el('div', 'list-actions');
      actions.appendChild(makeButton('', {
        cls: 'icon-btn', icon: 'refresh', title: t('refresh'),
        onClick: async () => {
          try {
            const res = await window.api.epg.refresh(entry.id);
            toast(I18N.count(res.count, 'items'), 'ok');
            state.epgAt = 0;
            state.epg = {};
            state.epgIndex = new Map();
            render();
          } catch (err) {
            toast(err.message || t('epg_failed'), 'err');
          }
        }
      }));
      actions.appendChild(makeButton('', {
        cls: 'icon-btn', icon: 'trash', title: t('delete'),
        onClick: async () => {
          state.settings.epgUrls = await window.api.epg.remove(entry.id);
          state.epg = {};
          state.epgIndex = new Map();
          state.epgAt = 0;
          toast(t('epg_removed'), 'ok');
          render();
        }
      }));
      row.appendChild(actions);
      list.appendChild(row);
    });
    view.appendChild(list);
  }
}

async function refreshSource(id) {
  const data = await window.api.sources.refresh(id);
  const source = state.sources.find((s) => s.id === id);
  if (source) {
    source.count = data.count;
    source.fetchedAt = data.fetchedAt;
  }
  const enriched = (data.items || []).map((it) => ({ ...it, sourceId: id, sourceName: source ? source.name : '' }));
  state.itemsBySource.set(id, enriched);
  rebuildItems();
  if (state.route === 'sources' || state.route === 'home') render();
  return data;
}

/* ===================== Add source modal ===================== */

function openSourceModal(preset, editSource) {
  const wrap = el('div');
  const isEdit = !!editSource;
  wrap.appendChild(el('h2', null, isEdit ? (t('edit_source') || 'Edit source') : t('add_source')));
  wrap.appendChild(el('p', 'lead', t('no_sources_hint')));
  // Security warning: plaintext HTTP exposes Xtream credentials on the network.
  const httpWarn = el('p', 'hint', '⚠ ' + (I18N.lang === 'ar'
    ? 'روابط http:// غير مشفّرة — قد تظهر بيانات اشتراكك (Xtream) على الشبكة. استخدم https:// إن توفر.'
    : 'http:// URLs are unencrypted — Xtream credentials may be exposed on the network. Prefer https:// where available.'));
  httpWarn.style.color = '#e0a030';
  wrap.appendChild(httpWarn);

  const form = el('div', 'form-grid');

  const nameField = field(t('source_name'), inputNode('text', 'GomizPlayer IPTV playlist'));
  const typeField = field(t('source_type'), makeDarkSelect(
    [['m3u', t('type_playlist')], ['xtream', t('type_xtream')], ['single', t('type_single')]],
    'm3u',
    (v) => {
      const vk = String(v);
      userField.hidden = vk !== 'xtream';
      passField.hidden = vk !== 'xtream';
      urlInput.placeholder = vk === 'xtream'
        ? 'http://host:8080'
        : (vk === 'single' ? 'https://example.com/stream.m3u8' : 'https://example.com/playlist.m3u');
    },
    { width: '100%' }
  ));

  const urlInput = inputNode('text', 'https://example.com/playlist.m3u');
  const urlField = field(t('source_url'), urlInput);
  urlField.classList.add('full');

  const browseBtn = makeButton(t('import_file'), {
    cls: 'btn btn-ghost btn-sm', icon: 'folder',
    onClick: async () => {
      const file = await window.api.dialog.openFile('playlist');
      if (!file) return;
      urlInput.value = file;
      if (!nameField.input.value) nameField.input.value = file.split(/[\\/]/).pop().replace(/\.(m3u8?|txt)$/i, '');
      typeSel.value = 'm3u';
    }
  });
  urlField.appendChild(browseBtn);
  browseBtn.style.marginTop = '6px';
  browseBtn.style.alignSelf = 'flex-start';

  const typeSel = typeField.querySelector('.dark-select');
  const userInput = inputNode('text', '');
  const passInput = inputNode('password', '');
  const userField = field(t('username'), userInput);
  const passField = field(t('password'), passInput);
  userField.hidden = true;
  passField.hidden = true;

  const headersInput = el('textarea', 'textarea');
  headersInput.placeholder = 'User-Agent: VLC/3.0.21\nReferer: https://example.com';
  const headersField = field(t('headers') + ' (' + t('optional') + ')', headersInput);
  headersField.classList.add('full');

  form.appendChild(nameField);
  form.appendChild(typeField);
  form.appendChild(urlField);
  form.appendChild(userField);
  form.appendChild(passField);
  form.appendChild(headersField);
  wrap.appendChild(form);

  if (editSource) {
    nameField.input.value = editSource.name || '';
    typeSel.value = editSource.kind || 'm3u';
    urlInput.value = editSource.url || '';
    userInput.value = editSource.username || '';
    userField.hidden = editSource.kind !== 'xtream';
    passField.hidden = editSource.kind !== 'xtream';
    const h = editSource.headers || {};
    headersInput.value = Object.entries(h).map(([k, v]) => k + ': ' + v).join('\n');
    passInput.placeholder = '•••••• (unchanged)';
  }

  if (preset && preset.url) {
    urlInput.value = preset.url;
    if (preset.name) nameField.input.value = preset.name;
  }

  const actions = el('div', 'modal-actions');
  const cancel = makeButton(t('cancel'), { cls: 'btn btn-ghost', onClick: closeModal });
  const submit = makeButton(isEdit ? (t('save') || 'Save') : t('add'), { cls: 'btn btn-primary', icon: isEdit ? 'check' : 'plus' });

  submit.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) {
      urlInput.focus();
      return;
    }
    const headers = {};
    headersInput.value.split(/\r?\n/).forEach((line) => {
      const idx = line.indexOf(':');
      if (idx > 0) headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    });
    const name = nameField.input.value.trim() || url.replace(/^[a-z]+:\/\//i, '').split('/')[0] || 'Source';
    const kind = typeSel.value;

    submit.disabled = true;
    submit.classList.add('spin-ico');
    try {
      const payload = { name, url, kind, username: userInput.value, headers };
      if (passInput.value) payload.password = passInput.value;
      const res = isEdit
        ? await window.api.sources.update(editSource.id, payload)
        : await window.api.sources.add({ ...payload, password: passInput.value });
      closeModal();
      if (res.error) toast(t('source_failed') + ': ' + res.error, 'err');
      else toast(t('source_added'), 'ok');
      await window.api.settings.patch({ onboarded: true });
      state.settings = await window.api.settings.get();
      await loadAllItems();
      navigate('sources', { replace: true });
      render();
    } catch (err) {
      toast(err.message || t('source_failed'), 'err');
    } finally {
      submit.disabled = false;
      submit.classList.remove('spin-ico');
    }
  });

  actions.appendChild(cancel);
  actions.appendChild(submit);
  openModalWithActions(wrap, actions);
  setTimeout(() => urlInput.focus(), 60);
}

function field(labelText, input) {
  const box = el('div', 'field');
  box.appendChild(el('label', null, labelText));
  box.appendChild(input);
  box.input = input;
  return box;
}

function inputNode(type, placeholder) {
  const input = el('input', 'input');
  input.type = type;
  if (placeholder) input.placeholder = placeholder;
  return input;
}

async function importPlaylistFile() {
  const file = await window.api.dialog.openFile('playlist');
  if (!file) return;
  openSourceModal({ url: file, name: file.split(/[\\/]/).pop().replace(/\.(m3u8?|txt)$/i, '') });
}

function openEpgModal() {
  const wrap = el('div');
  wrap.appendChild(el('h2', null, t('add_epg')));
  wrap.appendChild(el('p', 'lead', t('no_epg')));

  const urlInput = inputNode('text', 'https://example.com/epg.xml');
  const urlField = field(t('epg_url'), urlInput);
  urlField.classList.add('full');
  const browse = makeButton(t('import_file'), {
    cls: 'btn btn-ghost btn-sm', icon: 'folder',
    onClick: async () => {
      const file = await window.api.dialog.openFile('epg');
      if (file) urlInput.value = file;
    }
  });
  urlField.appendChild(browse);
  browse.style.marginTop = '6px';
  browse.style.alignSelf = 'flex-start';

  const nameInput = inputNode('text', 'TV Guide');
  const nameField = field(t('name'), nameInput);
  wrap.appendChild(urlField);
  wrap.appendChild(nameField);

  const actions = el('div', 'modal-actions');
  actions.appendChild(makeButton(t('cancel'), { cls: 'btn btn-ghost', onClick: closeModal }));
  const submit = makeButton(t('add'), { cls: 'btn btn-primary', icon: 'plus' });
  submit.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) { urlInput.focus(); return; }
    submit.disabled = true;
    try {
      const res = await window.api.epg.add(url, nameInput.value.trim() || 'TV Guide');
      closeModal();
      if (res.error) toast(t('epg_failed') + ': ' + res.error, 'err');
      else toast(t('epg_added') + ' · ' + I18N.number(res.count), 'ok');
      state.settings = await window.api.settings.get();
      state.epg = {};
      state.epgIndex = new Map();
      state.epgAt = 0;
      render();
    } catch (err) {
      toast(err.message || t('epg_failed'), 'err');
    } finally {
      submit.disabled = false;
    }
  });
  actions.appendChild(submit);
  openModalWithActions(wrap, actions);
  setTimeout(() => urlInput.focus(), 60);
}

/* ===================== Downloads ===================== */

function renderDownloads() {
  view.appendChild(pageHead(t('downloads'), I18N.count(state.downloads.length, 'items'), [
    makeButton(t('data_folder'), {
      cls: 'btn btn-ghost btn-sm', icon: 'folder',
      onClick: () => { if (state.info) window.api.shell.showItem(state.info.dataDir + '\\'); }
    })
  ]));

  if (!state.downloads.length) {
    view.appendChild(emptyBlock(t('empty'), t('download_stream_error')));
    return;
  }

  const list = el('div', 'list');
  for (const rec of state.downloads) {
    const row = el('div', 'dl-row');
    const main = el('div', 'list-main');
    main.appendChild(el('div', 'list-title', rec.title || safeDisplayUrl(rec.url)));
    const pct = rec.total > 0 ? Math.min(100, Math.round((rec.received / rec.total) * 100)) : rec.state === 'Complete' ? 100 : 0;
    const info = el('div', 'list-sub', ltr(humanBytes(rec.received) + ' / ' + (rec.total ? humanBytes(rec.total) : '—') + ' · ' + I18N.number(pct) + '%'));
    main.appendChild(info);
    const bar = el('div', 'dl-bar');
    const fill = el('i');
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    main.appendChild(bar);
    if (rec.error) main.appendChild(el('div', 'list-sub', rec.error));
    row.appendChild(main);

    const stateLabel = el('span', 'dl-state ' + rec.state, t((rec.state || 'waiting').toLowerCase()) || rec.state);
    row.appendChild(stateLabel);

    const actions = el('div', 'list-actions');
    if (rec.state === 'Downloading' || rec.state === 'Waiting') {
      actions.appendChild(makeButton('', { cls: 'icon-btn', icon: 'pause', title: t('pause'), onClick: async () => { await window.api.downloads.pause(rec.id); } }));
    } else if (rec.state === 'Paused' || rec.state === 'Failed') {
      actions.appendChild(makeButton('', { cls: 'icon-btn', icon: 'play', title: t('resume'), onClick: async () => { await window.api.downloads.resume(rec.id); } }));
    }
    if (rec.state === 'Complete' && rec.file) {
      actions.appendChild(makeButton('', {
        cls: 'icon-btn', icon: 'play', title: t('play'),
        onClick: () => {
          playItem({
            key: 'file:' + rec.id,
            name: rec.title,
            url: fileUrl(rec.file),
            kind: 'vod',
            group: t('downloads'),
            logo: rec.logo
          }, []);
        }
      }));
      actions.appendChild(makeButton('', {
        cls: 'icon-btn', icon: 'folder', title: t('open_folder'),
        onClick: () => window.api.shell.showItem(rec.file)
      }));
    }
    actions.appendChild(makeButton('', {
      cls: 'icon-btn', icon: 'trash', title: t('delete'),
      onClick: async () => {
        const ok = await confirmModal(t('remove_download'), t('remove_download_q'), t('delete'), true);
        if (!ok) return;
        state.downloads = await window.api.downloads.remove(rec.id);
        render();
      }
    }));
    row.appendChild(actions);

    list.appendChild(row);
  }
  view.appendChild(list);
}

function proCtx() {
  return {
    el, makeButton, pageHead, section, toggleRow, emptyBlock, toast, state, openModal, closeModal, playItem,
    epgForChannel: (ch) => epgForChannel(ch),
    render: () => render(),
    reloadLibrary: async () => { await loadAllItems(); render(); },
    onSettings: () => { if (player) player.opts.settings = state.settings; }
  };
}

function renderPro() {
  if (!window.GomizPro) { view.appendChild(pageHead('PRO', '')); return; }
  window.GomizPro.render(view, proCtx());
}

function renderRecordings() {
  view.appendChild(pageHead(t('nav_recordings'), I18N.count((state.recordings || []).length, 'items')));

  if (!state.recordings || !state.recordings.length) {
    view.appendChild(emptyBlock(t('empty'), t('no_recordings_yet')));
    return;
  }

  const list = el('div', 'list');
  for (const rec of state.recordings) {
    const row = el('div', 'dl-row');
    const main = el('div', 'list-main');
    main.appendChild(el('div', 'list-title', rec.name));
    const info = el('div', 'list-sub', humanBytes(rec.size || 0));
    main.appendChild(info);
    row.appendChild(main);

    const actions = el('div', 'list-actions');
    actions.appendChild(makeButton('', {
      cls: 'icon-btn', icon: 'play', title: t('play'),
      onClick: () => {
        const url = encodeURI('file:///' + String(rec.path).replace(/\\/g, '/'));
        playItem({ key: 'rec:' + rec.path, name: rec.name, kind: 'movie', url, group: 'Recordings' }, state.recordings.map((r) => ({ key: 'rec:' + r.path, name: r.name, kind: 'movie', url: encodeURI('file:///' + String(r.path).replace(/\\/g, '/')), group: 'Recordings' })));
      }
    }));
    actions.appendChild(makeButton('', {
      cls: 'icon-btn', icon: 'folder', title: t('open_folder'),
      onClick: () => window.api.shell.showItem(rec.path)
    }));
    actions.appendChild(makeButton('', {
      cls: 'icon-btn', icon: 'trash', title: t('delete'),
      onClick: async () => {
        if (state.recordingPath && String(state.recordingPath).toLowerCase() === String(rec.path).toLowerCase()) {
          toast(t('recording_active'), 'err');
          return;
        }
        if (player && player.item && String(player.item.key) === 'rec:' + rec.path) {
          try { player.close(true); } catch (_) {}
        }
        const ok = await confirmYesNo(t('delete_recording'), t('delete_recording_q'), true);
        if (!ok) return;
        const res = await window.api.recording.delete(rec.path);
        if (res && res.ok) toast(t('deleted'), 'ok');
        else toast((res && res.error ? res.error + ': ' : '') + t('error'), 'err');
        await refreshRecordings();
      }
    }));
    row.appendChild(actions);
    list.appendChild(row);
  }
  view.appendChild(list);
}

/* ===================== Settings ===================== */

function tabsFindLabel(id) {
  const map = {
    general: t('general'), home: t('home_tab'), player: t('player'), subtitles: t('subtitles'),
    epg: t('guide'), storage: t('storage'), system: t('system'), about: t('about')
  };
  return map[id] || '';
}

function renderSettings() {
  // Context header: title, description and back action keep the user oriented.
  const head = el('div', 'settings-context');
  const back = el('button', 'btn btn-ghost btn-sm');
  back.textContent = '‹ ' + (t('back') || 'Back');
  back.addEventListener('click', () => goBack());
  const heading = el('div');
  heading.appendChild(el('h2', 'settings-context-title', t('settings')));
  const descById = {
    general: 'Language, theme, appearance and account preferences / اللغة والمظهر والتفضيلات',
    home: 'Home sections, order and density / أقسام الرئيسية وترتيبها',
    player: 'Playback, network and hardware / التشغيل والشبكة والعتاد',
    subtitles: 'Subtitle appearance and timing / مظهر الترجمة وتوقيتها',
    epg: 'Electronic programme guide sources / مصادر دليل البرامج',
    storage: 'Storage, backups and cleanup / التخزين والنسخ الاحتياطي',
    system: 'Diagnostics, updates and safety / التشخيص والتحديثات والأمان',
    about: 'Version, developer and contact / الإصدار والمطوّر'
  };
  const current = tabsFindLabel(state.settingsTab);
  heading.appendChild(el('p', 'settings-context-desc', descById[state.settingsTab] || current || t('tagline')));
  head.appendChild(back);
  head.appendChild(heading);
  view.appendChild(head);

  const layout = el('div', 'settings-layout');
  const menu = el('div', 'settings-menu');
  const tabs = [
    ['general', t('general')],
    ['home', t('home_tab')],
    ['player', t('player')],
    ['subtitles', t('subtitles')],
    ['storage', t('storage')],
    ['system', t('system')],
    ['about', t('about')]
  ];
  tabs.forEach(([id, label]) => {
    const b = el('button', state.settingsTab === id ? 'on' : '', label);
    b.addEventListener('click', () => { state.settingsTab = id; render(); });
    menu.appendChild(b);
  });

  const panel = el('div', 'settings-panel');
  if (state.settingsTab === 'general') settingsGeneral(panel);
  else if (state.settingsTab === 'home') settingsHome(panel);
  else if (state.settingsTab === 'player') settingsPlayer(panel);
  else if (state.settingsTab === 'subtitles') settingsSubtitles(panel);
  else if (state.settingsTab === 'storage') settingsStorage(panel);
  else if (state.settingsTab === 'system') settingsSystem(panel);
  else settingsAbout(panel);

  layout.appendChild(menu);
  layout.appendChild(panel);
  view.appendChild(layout);
}

  const ACCENT_PRESETS = [
    { c: '#ff3d5a', n: 'Red' },
    { c: '#ff7a45', n: 'Orange' },
    { c: '#ffb020', n: 'Amber' },
    { c: '#38d39f', n: 'Green' },
    { c: '#4da3ff', n: 'Blue' },
    { c: '#9b6bff', n: 'Violet' }
  ];

  function hexToRgb(hex) {
    const h = String(hex || '#000000').replace('#', '');
    const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
    const n = parseInt(full, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function mixHex(hex, withHex, t) {
    const a = hexToRgb(hex);
    const b = hexToRgb(withHex);
    const mix = (x, y) => Math.round(x + (y - x) * t);
    const r = mix(a.r, b.r), g = mix(a.g, b.g), bl = mix(a.b, b.b);
    const ch = (v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
    return '#' + ch(r) + ch(g) + ch(bl);
  }

  /* Apply a custom accent (and its soft glow) to the CSS variables. */
  function applyAccent(accent, accent2) {
    const root = document.documentElement;
    const a = accent || '#ff3d5a';
    const a2 = accent2 || mixHex(a, '#ffffff', 0.32);
    root.style.setProperty('--accent', a);
    root.style.setProperty('--accent-2', a2);
    const rgb = hexToRgb(a);
    root.style.setProperty('--accent-soft', 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', 0.14)');
  }

  function applyAccessibility() {
    const s = state.settings || {};
    const root = document.documentElement;
    root.dataset.reduceMotion = s.reduceMotion ? 'true' : 'false';
    root.dataset.highContrast = s.highContrast ? 'true' : 'false';
    const scale = Math.min(140, Math.max(80, Number(s.uiScale || 100))) / 100;
    root.style.setProperty('--ui-scale', String(scale));
  }

  async function pickAccent(c) {
    const a2 = state.settings.accent2 || mixHex(c, '#ffffff', 0.32);
    await patchSettings({ accent: c, accent2: a2 });
  }

function settingsGeneral(panel) {
  panel.appendChild(el('h3', null, t('general')));
  panel.appendChild(el('p', 'hint', t('language')));

  panel.appendChild(segRow(t('language'), [['en', t('english')], ['ar', t('arabic')]], state.settings.language || 'en', async (value) => {
    await setLanguage(value);
    render();
  }));

  // Themes: instant live preview (click = apply + save)
  const THEMES = [
    ['dark', 'Dark', '#080a0f'],
    ['light', 'Light', '#f4f6fb'],
    ['tivimate', 'TiviMate', '#05070b'],
    ['cinematic', 'Cinematic', '#000000'],
    ['cobalt', 'Plex Cobalt', '#0d1520'],
    ['frosted', 'Frosted', '#8aa4c8']
  ];
  const themeRow = el('div', 'switch-row');
  const themeMain = el('div', 'list-main');
  themeMain.appendChild(el('div', 'list-title', t('theme') || 'Theme'));
  themeMain.appendChild(el('div', 'list-sub', 'Live preview — picks instantly / معاينة مباشرة'));
  themeRow.appendChild(themeMain);
  const themeSw = el('div', 'swatches');
  THEMES.forEach(([id, label, color]) => {
    const b = el('button', 'swatch theme-swatch' + ((state.settings.theme || 'dark') === id ? ' on' : ''));
    b.style.background = color;
    b.title = label;
    b.addEventListener('click', async () => {
      // instant preview first
      document.documentElement.dataset.theme = id;
      themeSw.querySelectorAll('.theme-swatch').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      // then persist
      try { await patchSettings({ theme: id }); } catch (_) {}
      toast(label, 'ok');
    });
    themeSw.appendChild(b);
  });
  themeRow.appendChild(themeSw);
  panel.appendChild(themeRow);

  panel.appendChild(el('h3', null, t('accent')));
  panel.appendChild(el('p', 'hint', t('accent_hint')));
  const swRow = el('div', 'switch-row');
  const swMain = el('div', 'list-main');
  swMain.appendChild(el('div', 'list-title', t('accent_color')));
  swRow.appendChild(swMain);
  const sw = el('div', 'swatches');
  ACCENT_PRESETS.forEach((preset) => {
    const b = el('button', 'swatch' + (String(preset.c).toLowerCase() === String(state.settings.accent || '').toLowerCase() ? ' on' : ''));
    b.style.background = preset.c;
    b.title = preset.n;
    b.addEventListener('click', () => pickAccent(preset.c));
    sw.appendChild(b);
  });
  const customInput = el('input');
  customInput.type = 'color';
  customInput.className = 'swatch-input';
  customInput.value = state.settings.accent || '#ff3d5a';
  customInput.title = t('accent_custom');
  customInput.addEventListener('input', () => pickAccent(customInput.value));
  sw.appendChild(customInput);
  swRow.appendChild(sw);
  panel.appendChild(swRow);

  panel.appendChild(el('h3', null, t('location')));
  panel.appendChild(el('p', 'hint', t('location_hint')));
  const locStatus = state.weatherStatus === 'unavailable' || state.weatherStatus === 'custom:notfound'
    ? t('location_unavailable')
    : (state.location ? ((state.location.city || '') + (state.location.country ? ', ' + state.location.country : '')) : t('loading'));
  const statusRow = el('div', 'switch-row');
  const statusMain = el('div', 'list-main');
  statusMain.appendChild(el('div', 'list-title', t('location_status')));
  statusMain.appendChild(el('div', 'list-sub', locStatus + (state.weather ? ' · ' + formatTemp(state.weather.tempC) : '') + (state.prayer ? ' · ' + t('prayer_ok') : '')));
  statusRow.appendChild(statusMain);
  statusRow.appendChild(makeButton(t('refresh'), { cls: 'btn btn-ghost btn-sm', icon: 'refresh', onClick: async () => { await loadLocationWeatherPrayer(); toast(t('updated'), 'ok'); } }));
  panel.appendChild(statusRow);

  const cityField = field(t('city'), inputNode('text', t('auto')));
  cityField.input.value = state.settings.weatherCity || '';
  panel.appendChild(cityField);
  const locBtns = el('div');
  locBtns.style.cssText = 'display:flex;gap:8px;margin-top:10px;margin-bottom:12px';
  locBtns.appendChild(makeButton(t('save'), { cls: 'btn btn-primary btn-sm', onClick: async () => { await pickLocation(cityField.input.value); toast(t('saved'), 'ok'); } }));
  locBtns.appendChild(makeButton(t('use_auto'), { cls: 'btn btn-ghost btn-sm', onClick: async () => { cityField.input.value = ''; await pickLocation(''); toast(t('saved'), 'ok'); } }));
  panel.appendChild(locBtns);

  panel.appendChild(segRow(t('temp_unit'), [['C', '°C'], ['F', '°F']], state.settings.tempUnit || 'C', async (value) => { await patchSettings({ tempUnit: value }); render(); }));
  panel.appendChild(segRow(t('time_format'), [['24', '24h'], ['12', '12h']], state.settings.timeFormat || '24', async (value) => { await patchSettings({ timeFormat: value }); render(); }));

  const methodRow = el('div', 'switch-row');
  const methodMain = el('div', 'list-main');
  methodMain.appendChild(el('div', 'list-title', t('prayer_method')));
  methodRow.appendChild(methodMain);
  const methodSel = makeDarkSelect(
    [[2,'ISNA'],[3,'MWL'],[4,'Umm Al-Qura'],[5,'Egyptian'],[1,'Karachi'],[12,'France'],[13,'Turkey'],[8,'Gulf'],[9,'Kuwait'],[10,'Qatar'],[11,'Singapore']].map(([v,n]) => [String(v), n]),
    String(state.settings.prayerMethod || 2),
    async (v) => { await patchSettings({ prayerMethod: Number(v) }); await loadLocationWeatherPrayer(); },
    { width: '220px' }
  );
  methodRow.appendChild(methodSel);
  panel.appendChild(methodRow);

  panel.appendChild(segRow(t('prayer_school'), [['0', t('school_standard')], ['1', t('school_hanafi')]], String(state.settings.prayerSchool || 0), async (value) => { await patchSettings({ prayerSchool: Number(value) }); await loadLocationWeatherPrayer(); }));

  panel.appendChild(toggleRow(t('top_clock'), '', state.settings.widgetClock !== false, async (on) => {
    await patchSettings({ widgetClock: on }); render();
  }));
  panel.appendChild(toggleRow(t('top_weather'), '', state.settings.widgetWeather !== false, async (on) => {
    await patchSettings({ widgetWeather: on }); render();
  }));
  panel.appendChild(toggleRow(t('top_prayer'), '', state.settings.widgetPrayer !== false, async (on) => {
    await patchSettings({ widgetPrayer: on }); render();
  }));

  panel.appendChild(toggleRow(t('autoplay_next'), '', state.settings.autoNext !== false, async (on) => {
    await patchSettings({ autoNext: on });
  }));

  panel.appendChild(toggleRow(t('hw_decoding'), '', state.settings.hardwareDecoding !== false, async (on) => {
    await patchSettings({ hardwareDecoding: on });
  }));

  panel.appendChild(el('h3', null, t('accessibility')));
  panel.appendChild(rangeField(t('ui_scale'), 80, 140, Number(state.settings.uiScale || 100), 5, async (v) => { await patchSettings({ uiScale: v }); }));
  panel.appendChild(toggleRow(t('reduce_motion'), '', !!state.settings.reduceMotion, async (on) => { await patchSettings({ reduceMotion: on }); }));
  panel.appendChild(toggleRow(t('high_contrast'), '', !!state.settings.highContrast, async (on) => { await patchSettings({ highContrast: on }); }));

  panel.appendChild(el('h3', null, t('privacy_security')));
  panel.appendChild(toggleRow(t('app_lock'), t('app_lock_hint'), !!state.settings.appLockEnabled, async (on) => {
    await patchSettings({ appLockEnabled: on });
    render();
  }));
  if (state.settings.appLockEnabled) {
    const pinField = field(t('app_lock_pin'), inputNode('password', 'PIN'));
    pinField.input.value = '';
    panel.appendChild(pinField);
    const pinSave = makeButton(t('save'), { cls: 'btn btn-ghost btn-sm', onClick: async () => { await patchSettings({ appLockPin: pinField.input.value.trim() }); toast(t('saved'), 'ok'); } });
    pinSave.style.marginBottom = '8px';
    panel.appendChild(pinSave);
  }

  const diagnosticsOn = !!state.settings.consentShown && (state.settings.analyticsEnabled !== false || state.settings.crashReportingEnabled !== false);
  panel.appendChild(toggleRow(t('analytics_toggle'), t('analytics_toggle_hint'), !!(state.settings.consentShown && state.settings.analyticsEnabled !== false), async (on) => {
    const patch = { analyticsEnabled: on, telemetryEnabled: on };
    if (!state.settings.consentShown) patch.consentShown = true;
    await patchSettings(patch);
    render();
  }));
  panel.appendChild(toggleRow(t('crash_toggle'), t('crash_toggle_hint'), !!(state.settings.consentShown && state.settings.crashReportingEnabled !== false), async (on) => {
    const patch = { crashReportingEnabled: on };
    if (!state.settings.consentShown) patch.consentShown = true;
    await patchSettings(patch);
    render();
  }));

  const epField = field(t('telemetry_endpoint'), inputNode('text', 'https://...'));
  epField.input.value = state.settings.telemetryEndpoint || '';
  panel.appendChild(epField);
  const epSave = makeButton(t('save'), { cls: 'btn btn-ghost btn-sm', onClick: async () => {
    await patchSettings({ telemetryEndpoint: epField.input.value.trim() });
    toast(t('saved'), 'ok');
    render();
  } });
  epSave.style.marginBottom = '8px';
  panel.appendChild(epSave);

  const info = el('div', 'hint');
  const id = state.settings.telemetryInstallId || '—';
  const last = state.settings.telemetryLastPing ? new Date(Number(state.settings.telemetryLastPing)).toLocaleString() : '—';
  info.textContent = t('telemetry_install_id') + ': ' + id + ' • ' + t('telemetry_last_ping') + ': ' + last;
  info.style.marginBottom = '8px';
  panel.appendChild(info);
}

function promptModal(title, label, def, secret = false) {
  return new Promise((resolve) => {
    const wrap = el('div');
    wrap.appendChild(el('h2', null, title));
    wrap.appendChild(el('p', 'lead', label));
    const input = el('input');
    input.type = secret ? 'password' : 'text';
    input.className = 'input';
    input.autocomplete = 'off';
    if (def) input.value = def;
    wrap.appendChild(input);
    const actions = el('div', 'modal-actions');
    const cancel = makeButton(t('cancel'), { cls: 'btn btn-ghost', onClick: () => { closeModal(); resolve(null); } });
    const save = makeButton(t('save'), { cls: 'btn btn-primary', onClick: () => { const v = input.value.trim(); closeModal(); resolve(v || null); } });
    actions.appendChild(cancel);
    actions.appendChild(save);
    openModalWithActions(wrap, actions);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save.click(); } });
    setTimeout(() => { try { input.focus(); } catch (_) {} }, 0);
  });
}

async function saveHome(patch) {
  const next = { ...homeLayout(), ...patch };
  await patchSettings({ home: next });
  return next;
}

function settingsHome(panel) {
  const layout = homeLayout();

  panel.appendChild(el('h3', null, t('home_layout')));
  panel.appendChild(el('p', 'hint', t('home_layout_hint')));

  panel.appendChild(segRow(t('density'), [
    ['compact', t('density_compact')],
    ['comfortable', t('density_comfortable')],
    ['large', t('density_large')]
  ], layout.density, async (value) => {
    await saveHome({ density: value });
    render();
  }));

  const limitRow = el('div', 'switch-row');
  const limitMain = el('div', 'list-main');
  limitMain.appendChild(el('div', 'list-title', t('row_items')));
  limitMain.appendChild(el('div', 'list-sub', t('row_items_hint')));
  limitRow.appendChild(limitMain);
  const limitSel = makeDarkSelect(
    [8, 12, 16, 20, 30].map((n) => [String(n), I18N.number(n)]),
    String(layout.rowLimit),
    async (v) => { await saveHome({ rowLimit: Number(v) }); render(); },
    { width: '110px' }
  );
  limitRow.appendChild(limitSel);
  panel.appendChild(limitRow);

  panel.appendChild(el('h3', null, t('home_sections')));
  const list = el('div', 'layout-list');

  const persist = async (order, hidden) => {
    await saveHome({ order, hidden });
    render();
  };

  layout.order.forEach((id, index) => {
    const meta = HOME_SECTIONS.find((s) => s.id === id) || { label: id };
    const isOff = layout.hidden.includes(id);
    const row = el('div', 'layout-row' + (isOff ? ' off' : ''));
    row.dataset.section = id;
    row.draggable = true;
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      document.querySelectorAll('.layout-row').forEach((r) => r.classList.remove('dragging', 'drag-over'));
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      const from = e.dataTransfer.getData('text/plain');
      if (!from || from === id) return;
      const order = layout.order.slice();
      const fi = order.indexOf(from);
      const ti = order.indexOf(id);
      if (fi < 0 || ti < 0) return;
      order.splice(fi, 1);
      order.splice(ti, 0, from);
      persist(order, layout.hidden);
    });

    const grip = el('span', 'layout-grip');
    grip.innerHTML = ICONS.grip;
    grip.title = t('drag_reorder');
    row.appendChild(grip);
    row.appendChild(el('span', 'layout-name', t(meta.label)));

    const ctrls = el('div', 'layout-ctrls');
    const up = el('button', 'icon-btn');
    up.appendChild(iconSpan('up'));
    up.title = t('move_up');
    up.setAttribute('aria-label', up.title);
    up.disabled = index === 0;
    up.addEventListener('click', () => {
      const order = layout.order.slice();
      [order[index - 1], order[index]] = [order[index], order[index - 1]];
      persist(order, layout.hidden);
    });

    const down = el('button', 'icon-btn');
    down.appendChild(iconSpan('down'));
    down.title = t('move_down');
    down.setAttribute('aria-label', down.title);
    down.disabled = index === layout.order.length - 1;
    down.addEventListener('click', () => {
      const order = layout.order.slice();
      [order[index + 1], order[index]] = [order[index], order[index + 1]];
      persist(order, layout.hidden);
    });

    ctrls.appendChild(up);
    ctrls.appendChild(down);
    row.appendChild(ctrls);

    const sw = el('button', 'switch' + (isOff ? '' : ' on'));
    sw.title = isOff ? t('home_sections') : t('home_sections');
    sw.addEventListener('click', () => {
      const hidden = layout.hidden.slice();
      const i = hidden.indexOf(id);
      if (i >= 0) hidden.splice(i, 1);
      else hidden.push(id);
      persist(layout.order, hidden);
    });
    row.appendChild(sw);

    list.appendChild(row);
  });

  panel.appendChild(list);

  const foot = el('div');
  foot.style.marginTop = '16px';
  foot.appendChild(makeButton(t('reset_layout'), {
    cls: 'btn btn-ghost',
    icon: 'refresh',
    onClick: async () => {
      await patchSettings({ home: HOME_DEFAULTS });
      toast(t('layout_reset'), 'ok');
      render();
    }
  }));
  panel.appendChild(foot);
}

function settingsPlayer(panel) {
  panel.appendChild(el('h3', null, t('player')));
  panel.appendChild(el('p', 'hint', t('playback')));
  const pHead = el('div'); pHead.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:8px';
  pHead.appendChild(makeButton(t('reset_section'), { cls: 'btn btn-ghost btn-sm', icon: 'refresh', onClick: async () => {
    await patchSettings({ aspect: 'contain', volume: 100, rate: 1, quality: 0, preferredAudioLang: '', preferredSubtitleLang: '', retryCount: 2, networkTimeout: 30, networkUserAgent: '' });
    toast(t('settings_reset_done'), 'ok'); render();
  }}));
  panel.appendChild(pHead);

  panel.appendChild(segRow(t('aspect'), [['contain', t('fit')], ['cover', t('fill')]], state.settings.aspect === 'cover' ? 'cover' : 'contain', async (value) => {
    await patchSettings({ aspect: value });
    if (player) player.applySettings(state.settings);
    render();
  }));

  const vol = el('div');
  vol.style.marginBottom = '14px';
  vol.appendChild(el('label', 'tiny dim', t('volume') + ': ' + (state.settings.volume ?? 100) + '%'));
  const range = el('input');
  range.type = 'range';
  range.min = '0';
  range.max = '100';
  range.value = String(state.settings.volume ?? 100);
  range.style.width = '100%';
  range.addEventListener('change', async () => {
    await patchSettings({ volume: Number(range.value) });
    if (player) player.applySettings(state.settings);
  });
  range.addEventListener('input', () => {
    vol.querySelector('label').textContent = t('volume') + ': ' + range.value + '%';
  });
  vol.appendChild(range);
  panel.appendChild(vol);

  const speedRow = el('div', 'switch-row');
  const main = el('div', 'list-main');
  main.appendChild(el('div', 'list-title', t('speed')));
  speedRow.appendChild(main);
  const speed = makeDarkSelect(
    [0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => [String(v), v + '\u00D7']),
    String(state.settings.rate || 1),
    async (v) => { await patchSettings({ rate: Number(v) }); if (player) player.applySettings(state.settings); },
    { width: '110px' }
  );
  speedRow.appendChild(speed);
  panel.appendChild(speedRow);

  panel.appendChild(el('h3', null, t('defaults')));
  const qRow = el('div', 'switch-row');
  const qm = el('div', 'list-main');
  qm.appendChild(el('div', 'list-title', t('default_quality')));
  qm.appendChild(el('div', 'list-sub', t('default_quality_hint')));
  qRow.appendChild(qm);
  const qSel = makeDarkSelect(
    [[0, t('auto')],[2160,'2160p'],[1080,'1080p'],[720,'720p'],[480,'480p'],[360,'360p']],
    String(state.settings.quality || 0),
    async (v) => { await patchSettings({ quality: Number(v) }); },
    { width: '140px' }
  );
  qRow.appendChild(qSel);
  panel.appendChild(qRow);

  const audioField = field(t('preferred_audio_lang'), inputNode('text', 'ar, en'));
  audioField.input.value = state.settings.preferredAudioLang || '';
  audioField.input.addEventListener('change', async () => { await patchSettings({ preferredAudioLang: audioField.input.value.trim() }); });
  panel.appendChild(audioField);

  const subField = field(t('preferred_subtitle_lang'), inputNode('text', 'ar, en'));
  subField.input.value = state.settings.preferredSubtitleLang || '';
  subField.input.addEventListener('change', async () => { await patchSettings({ preferredSubtitleLang: subField.input.value.trim() }); });
  panel.appendChild(subField);

  panel.appendChild(el('h3', null, t('network_playback')));
  panel.appendChild(rangeField(t('retry_count'), 0, 5, Number(state.settings.retryCount ?? 2), 1, async (v) => { await patchSettings({ retryCount: v }); }));
  panel.appendChild(rangeField(t('network_timeout'), 10, 120, Number(state.settings.networkTimeout ?? 30), 5, async (v) => { await patchSettings({ networkTimeout: v }); }));
  const uaField = field(t('network_user_agent'), inputNode('text', t('optional')));
  uaField.input.value = state.settings.networkUserAgent || '';
  uaField.input.addEventListener('change', async () => { await patchSettings({ networkUserAgent: uaField.input.value.trim() }); });
  panel.appendChild(uaField);

  panel.appendChild(segRow(t('proxy_mode'), [['system', t('proxy_system')], ['direct', t('proxy_direct')], ['fixed', t('proxy_fixed')]], state.settings.proxyMode || 'system', async (value) => {
    await patchSettings({ proxyMode: value });
    render();
  }));
  if ((state.settings.proxyMode || 'system') === 'fixed') {
    const proxyField = field(t('proxy_url'), inputNode('text', 'http://127.0.0.1:8080'));
    proxyField.input.value = state.settings.proxyUrl || '';
    const saveProxy = makeButton(t('save'), { cls: 'btn btn-ghost btn-sm', onClick: async () => { await patchSettings({ proxyUrl: proxyField.input.value.trim() }); toast(t('saved'), 'ok'); } });
    proxyField.appendChild(saveProxy);
    saveProxy.style.marginTop = '8px';
    panel.appendChild(proxyField);
  }
}

function settingsSubtitles(panel) {
  panel.appendChild(el('h3', null, t('subtitles_settings')));
  panel.appendChild(el('p', 'hint', t('subtitles')));
  const sHead = el('div'); sHead.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:8px';
  sHead.appendChild(makeButton(t('reset_section'), { cls: 'btn btn-ghost btn-sm', icon: 'refresh', onClick: async () => {
    await patchSettings({ subtitle: { size: 100, color: '#ffffff', bgOpacity: 0.55, bottom: 8, bold: false, delay: 0 } });
    toast(t('settings_reset_done'), 'ok'); render();
  }}));
  panel.appendChild(sHead);

  const sub = { ...(state.settings.subtitle || {}) };
  const preview = el('div');
  preview.style.cssText = 'position:relative;height:150px;border-radius:14px;overflow:hidden;margin-bottom:18px;border:1px solid var(--line);background:linear-gradient(140deg,#101623,#090c12);display:flex;align-items:flex-end;justify-content:center;padding-bottom:' + (sub.bottom || 8) + '%';
  const sample = el('div');
  sample.textContent = I18N.lang === 'ar' ? 'مرحبًا بك في GomizPlayer IPTV' : 'Welcome to GomizPlayer IPTV';
  sample.style.cssText = 'padding:4px 10px;border-radius:5px;font-weight:600;transition:all .2s ease';
  preview.appendChild(sample);
  panel.appendChild(preview);

  const applyPreview = () => {
    sample.style.fontSize = Math.round(20 * (Number(sub.size) || 100) / 100) + 'px';
    sample.style.color = sub.color || '#fff';
    sample.style.background = hexToRgba(sub.bgColor || '#000000', Number(sub.bgOpacity ?? 0.55));
    sample.style.fontWeight = sub.bold ? '800' : '600';
    preview.style.paddingBottom = (Number(sub.bottom) || 8) + '%';
  };
  applyPreview();

  const saveSub = async (patch) => {
    Object.assign(sub, patch);
    state.settings = await window.api.settings.patch({ subtitle: sub });
    if (player) player.applySettings(state.settings);
    applyPreview();
  };

  panel.appendChild(rangeField(t('size'), 60, 200, Number(sub.size) || 100, 1, (v) => saveSub({ size: v })));
  panel.appendChild(rangeField(t('opacity'), 0, 100, Math.round((sub.bgOpacity ?? 0.55) * 100), 1, (v) => saveSub({ bgOpacity: v / 100 })));
  panel.appendChild(rangeField(t('bottom_offset'), 2, 35, Number(sub.bottom) || 8, 1, (v) => saveSub({ bottom: v })));
  panel.appendChild(rangeField(t('delay'), -10, 10, Number(sub.delay) || 0, 0.25, (v) => {
    saveSub({ delay: v });
    if (player) player.renderer.setDelay(v);
  }));

  const colorRow = el('div', 'switch-row');
  colorRow.appendChild(el('div', 'list-title', t('color')));
  const swatches = el('div', 'swatches');
  ['#ffffff', '#ffe66d', '#7df9ff', '#ff6b6b', '#7dff9b', '#d0a6ff'].forEach((c) => {
    const s = el('button', 'swatch' + ((sub.color || '#ffffff').toLowerCase() === c ? ' on' : ''));
    s.style.background = c;
    s.addEventListener('click', () => {
      saveSub({ color: c });
      swatches.querySelectorAll('.swatch').forEach((x) => x.classList.remove('on'));
      s.classList.add('on');
    });
    swatches.appendChild(s);
  });
  colorRow.appendChild(swatches);
  panel.appendChild(colorRow);

  panel.appendChild(toggleRow(t('bold'), '', !!sub.bold, async (on) => {
    await saveSub({ bold: on });
  }));
}

async function settingsEpg(panel) {
  panel.appendChild(el('h3', null, t('guide')));
  panel.appendChild(el('p', 'hint', t('epg_hint')));

  const listWrap = el('div', 'list');
  panel.appendChild(listWrap);

  async function refreshList() {
    let entries = [];
    try { entries = await window.api.epg.list(); } catch (_) { entries = state.settings.epgUrls || []; }
    listWrap.innerHTML = '';
    if (!entries.length) {
      listWrap.appendChild(emptyBlock(t('empty'), t('no_epg'), makeButton(t('add_epg'), { cls: 'btn btn-primary btn-sm', icon: 'plus', onClick: () => openEpgModal() })));
      return;
    }
    for (const entry of entries) {
      const row = el('div', 'list-row');
      const main = el('div', 'list-main');
      main.appendChild(el('div', 'list-title', entry.name || safeDisplayUrl(entry.url)));
      main.appendChild(el('div', 'list-sub', entry.url));
      row.appendChild(main);
      const actions = el('div', 'list-actions');
      actions.appendChild(makeButton(t('refresh'), { cls: 'btn btn-ghost btn-sm', icon: 'refresh', onClick: async () => {
        try { const res = await window.api.epg.refresh(entry.id); toast(t('updated') + (res && res.count ? ' · ' + I18N.number(res.count) : ''), 'ok'); } catch (e) { toast(e.message || t('epg_failed'), 'err'); }
      }}));
      actions.appendChild(makeButton(t('delete'), { cls: 'btn btn-danger btn-sm', icon: 'trash', onClick: async () => {
        const ok = await confirmModal(t('delete'), t('delete_source_q'), t('delete'), true);
        if (!ok) return;
        try { await window.api.epg.remove(entry.id); state.settings = await window.api.settings.get(); state.epg = {}; state.epgAt = 0; await refreshList(); toast(t('epg_removed'), 'ok'); } catch (e) { toast(e.message || t('error'), 'err'); }
      }}));
      row.appendChild(actions);
      listWrap.appendChild(row);
    }
  }

  const topActions = el('div');
  topActions.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap';
  topActions.appendChild(makeButton(t('add_epg'), { cls: 'btn btn-primary btn-sm', icon: 'plus', onClick: () => { openEpgModal(); setTimeout(refreshList, 800); } }));
  topActions.appendChild(makeButton(t('refresh'), { cls: 'btn btn-ghost btn-sm', icon: 'refresh', onClick: refreshList }));
  panel.insertBefore(topActions, listWrap);

  await refreshList();
}

async function settingsStorage(panel) {
  panel.appendChild(el('h3', null, t('profiles')));
  panel.appendChild(el('p', 'hint', t('profiles_hint')));
  const profRow = el('div', 'switch-row');
  const profMain = el('div', 'list-main');
  profMain.appendChild(el('div', 'list-title', t('active_profile')));
  profRow.appendChild(profMain);
  const profSel = makeDarkSelect(
    (state.profiles || ['default']).map((p) => [p, p]),
    activeProfile(),
    async (v) => {
      await patchSettings({ profile: v });
      state.profile = v;
      await refreshLibrary();
      toast(t('profile_switched'), 'ok');
      render();
    },
    { width: '180px' }
  );
  profRow.appendChild(profSel);
  panel.appendChild(profRow);
  const profActions = el('div');
  profActions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px';
  profActions.appendChild(makeButton(t('create_profile'), { cls: 'btn btn-ghost btn-sm', icon: 'plus', onClick: async () => {
    const name = await promptModal(t('create_profile'), t('profile_name_prompt'), '');
    if (!name || !String(name).trim()) return;
    try {
      await window.api.profiles.create(String(name).trim());
      state.profiles = await window.api.profiles.list();
      await patchSettings({ profile: String(name).trim() });
      state.profile = String(name).trim();
      await refreshLibrary();
      toast(t('profile_created'), 'ok');
      render();
    } catch (e) { toast(e.message || t('error'), 'err'); }
  }}));
  profActions.appendChild(makeButton(t('delete_profile'), { cls: 'btn btn-danger btn-sm', icon: 'trash', onClick: async () => {
    const cur = activeProfile();
    if (cur === 'default') { toast(t('profile_default_locked'), 'err'); return; }
    const ok = await confirmModal(t('delete_profile'), t('delete_profile_q'), t('delete'), true);
    if (!ok) return;
    try {
      const r = await window.api.profiles.delete(cur);
      state.profiles = r.profiles || await window.api.profiles.list();
      await patchSettings({ profile: r.profile || 'default' });
      state.profile = r.profile || 'default';
      await refreshLibrary();
      toast(t('profile_deleted'), 'ok');
      render();
    } catch (e) { toast(e.message || t('error'), 'err'); }
  }}));
  panel.appendChild(profActions);

  panel.appendChild(el('h3', null, t('storage')));
  panel.appendChild(el('p', 'hint', t('data_folder')));

  const statsBox = el('div', 'list');
  panel.appendChild(statsBox);
  try {
    const st = await window.api.storage.stats();
    [['t_storage_data', st.fmtData], ['t_storage_cache', st.fmtCache], ['t_storage_downloads', st.fmtDownloads], ['t_storage_recordings', st.fmtRecordings]].forEach(([k, v]) => {
      const row = el('div', 'list-row');
      const m = el('div', 'list-main'); m.appendChild(el('div', 'list-title', t(k)));
      row.appendChild(m); row.appendChild(el('span', 'pill', v)); statsBox.appendChild(row);
    });
  } catch (_) {
    statsBox.appendChild(el('p', 'hint', t('error')));
  }

  const folderRow = el('div', 'list-row');
  const fm = el('div', 'list-main');
  fm.appendChild(el('div', 'list-title', t('data_folder')));
  fm.appendChild(el('div', 'list-sub', state.info ? state.info.dataDir : '—'));
  folderRow.appendChild(fm);
  folderRow.appendChild(makeButton(t('open'), { cls: 'btn btn-ghost btn-sm', icon: 'folder', onClick: () => { if (state.info) window.api.shell.showItem(state.info.dataDir + '\\'); } }));
  panel.appendChild(folderRow);

  panel.appendChild(el('h3', null, t('downloads_folder')));
  const dlField = field(t('downloads_folder'), inputNode('text', t('auto')));
  dlField.input.value = state.settings.downloadsDir || '';
  panel.appendChild(dlField);
  const dlSave = makeButton(t('save'), { cls: 'btn btn-ghost btn-sm', onClick: async () => { await patchSettings({ downloadsDir: dlField.input.value.trim() }); toast(t('saved'), 'ok'); } });
  dlSave.style.marginBottom = '12px';
  panel.appendChild(dlSave);

  panel.appendChild(el('h3', null, t('recordings_folder')));
  const recField = field(t('recordings_folder'), inputNode('text', t('auto')));
  recField.input.value = state.settings.recordingsDir || '';
  panel.appendChild(recField);
  const recSave = makeButton(t('save'), { cls: 'btn btn-ghost btn-sm', onClick: async () => { await patchSettings({ recordingsDir: recField.input.value.trim() }); toast(t('saved'), 'ok'); } });
  recSave.style.marginBottom = '12px';
  panel.appendChild(recSave);

  panel.appendChild(el('h3', null, t('backup')));
  const bBtns = el('div');
  bBtns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px';
  bBtns.appendChild(makeButton(t('export_backup'), { cls: 'btn btn-primary btn-sm', icon: 'download', onClick: async () => {
    const r = await window.api.backup.export(); if (r && r.ok) toast(t('backup_exported'), 'ok'); else if (r && r.error) toast(r.error, 'err');
  }}));
  bBtns.appendChild(makeButton(t('import_backup'), { cls: 'btn btn-ghost btn-sm', icon: 'plus', onClick: async () => {
    const ok = await confirmModal(t('import_backup'), t('import_backup_q'), t('import_backup'), true);
    if (!ok) return;
    const r = await window.api.backup.import();
    if (r && r.ok) { state.settings = await window.api.settings.get(); await refreshLibrary(); await loadAllItems(); toast(t('backup_imported'), 'ok'); render(); }
    else if (r && r.error) toast(r.error, 'err');
  }}));
  bBtns.appendChild(makeButton('Back up now', { cls: 'btn btn-ghost btn-sm', icon: 'download', onClick: async () => {
    const r = await window.api.backup.now();
    toast(r && r.ok ? ('Backup created: ' + r.name) : 'Backup failed', r && r.ok ? 'ok' : 'err');
  }}));
  panel.appendChild(bBtns);
 
  panel.appendChild(el('h3', null, t('startup_cleanup')));
  panel.appendChild(el('p', 'hint', t('startup_cleanup_hint')));
  panel.appendChild(toggleRow(
    t('clear_source_cache_on_launch'),
    t('clear_source_cache_on_launch_hint'),
    !!state.settings.clearSourceCacheOnLaunch,
    async (on) => { await patchSettings({ clearSourceCacheOnLaunch: on }); }
  ));
  panel.appendChild(toggleRow(
    t('clear_history_on_launch'),
    t('clear_history_on_launch_hint'),
    !!state.settings.clearWatchHistoryOnLaunch,
    async (on) => { await patchSettings({ clearWatchHistoryOnLaunch: on }); }
  ));
  panel.appendChild(toggleRow(
    t('clear_network_cache_on_launch'),
    t('clear_network_cache_on_launch_hint'),
    !!state.settings.clearNetworkCacheOnLaunch,
    async (on) => { await patchSettings({ clearNetworkCacheOnLaunch: on }); }
  ));

  panel.appendChild(el('h3', null, t('clear')));
  const buttons = el('div');
  buttons.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
  buttons.appendChild(makeButton(t('clear_cache'), { cls: 'btn btn-ghost btn-sm', icon: 'trash', onClick: async () => {
    const r = await window.api.storage.clearCache(); toast(t('cleared') + (r && r.count ? ' · ' + I18N.number(r.count) : ''), 'ok'); render();
  }}));
  buttons.appendChild(makeButton(t('clear_history'), { cls: 'btn btn-ghost btn-sm', icon: 'trash', onClick: async () => {
    if (!await confirmModal(t('clear_history'), t('clear_history_q'), t('clear'), true)) return;
    state.library = await window.api.library.clear('history', activeProfile()); toast(t('cleared'), 'ok'); render();
  }}));
  buttons.appendChild(makeButton(t('clear_favorites'), { cls: 'btn btn-ghost btn-sm', icon: 'heart', onClick: async () => {
    if (!await confirmModal(t('clear_favorites'), t('clear_history_q'), t('clear'), true)) return;
    state.library = await window.api.library.clear('favorites', activeProfile()); toast(t('cleared'), 'ok'); render();
  }}));
  buttons.appendChild(makeButton(t('clear_search'), { cls: 'btn btn-ghost btn-sm', icon: 'search', onClick: async () => {
    state.library = await window.api.library.clear('search', activeProfile()); toast(t('cleared'), 'ok'); render();
  }}));
  buttons.appendChild(makeButton(t('clear_all'), { cls: 'btn btn-danger btn-sm', icon: 'trash', onClick: async () => {
    if (!await confirmModal(t('clear_all'), t('clear_history_q'), t('clear'), true)) return;
    state.library = await window.api.library.clear('all', activeProfile()); toast(t('cleared'), 'ok'); render();
  }}));
  panel.appendChild(buttons);

  panel.appendChild(el('h3', null, t('reset')));
  panel.appendChild(makeButton(t('reset_settings'), { cls: 'btn btn-danger btn-sm', icon: 'refresh', onClick: async () => {
    const ok = await confirmModal(t('reset_settings'), t('reset_settings_q'), t('reset'), true);
    if (!ok) return;
    await window.api.storage.resetSettings();
    state.settings = await window.api.settings.get();
    I18N.set(state.settings.language || 'en');
    document.documentElement.dataset.theme = state.settings.theme || 'dark';
    if (state.settings.accent) applyAccent(state.settings.accent, state.settings.accent2);
    toast(t('settings_reset_done'), 'ok');
    render();
  }}));
}

function openExternalUrl(url) {
  if (window.api && window.api.shell && window.api.shell.openExternal) return window.api.shell.openExternal(url);
  window.open(url, '_blank');
}

function openEmailComposer(email) {
  const addr = encodeURIComponent(email || 'radhouanemokrane.contact@gmail.com');
  const wrap = el('div');
  wrap.appendChild(el('h2', null, t('compose_email') || 'إرسال بريد'));
  wrap.appendChild(el('p', 'lead', t('compose_email_hint') || 'اختر الطريقة:'));
  const list = el('div', 'list');
  const options = [
    { label: 'Gmail', sub: 'فتح Gmail لكتابة رسالة مباشرة', icon: 'mail', url: `https://mail.google.com/mail/?view=cm&fs=1&to=${addr}` },
    { label: 'Outlook / Hotmail', sub: 'فتح Outlook لكتابة رسالة مباشرة', icon: 'mail', url: `https://outlook.live.com/mail/0/deeplink/compose?to=${addr}` },
    { label: t('default_mail_app') || 'تطبيق البريد الافتراضي', sub: email || '', icon: 'external', url: `mailto:${email || 'radhouanemokrane.contact@gmail.com'}` }
  ];
  options.forEach((opt) => {
    const row = el('div', 'list-row');
    row.style.cursor = 'pointer';
    const ic = el('span', 'contact-icon');
    ic.setAttribute('data-icon', opt.icon);
    ic.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;background:var(--panel-2,#1a2233);color:var(--text,#fff);flex:0 0 34px;margin-inline-end:10px';
    row.appendChild(ic);
    const m = el('div', 'list-main');
    m.appendChild(el('div', 'list-title', opt.label));
    m.appendChild(el('div', 'list-sub', opt.sub));
    row.appendChild(m);
    row.addEventListener('click', () => { openExternalUrl(opt.url); closeModal(); });
    list.appendChild(row);
  });
  wrap.appendChild(list);
  const actions = el('div', 'modal-actions');
  actions.appendChild(makeButton(t('cancel') || 'إلغاء', { cls: 'btn btn-ghost', onClick: closeModal }));
  openModalWithActions(wrap, actions);
  if (typeof hydrateIcons === 'function') hydrateIcons(wrap);
}

async function runFactoryResetFlow() {
  const wrap = el('div');
  wrap.appendChild(el('h2', null, t('factory_reset_warning_title')));
  wrap.appendChild(el('p', 'lead', t('factory_reset_warning_intro')));

  const list = document.createElement('ul');
  list.style.cssText = 'margin:8px 0 12px 20px;line-height:1.5';
  [
    t('factory_reset_item_accounts'),
    t('factory_reset_item_playlists'),
    t('factory_reset_item_library'),
    t('factory_reset_item_downloads'),
    t('factory_reset_item_storage'),
    t('factory_reset_item_settings')
  ].forEach((txt) => {
    const li = document.createElement('li');
    li.textContent = txt;
    list.appendChild(li);
  });
  wrap.appendChild(list);

  const note = el('p', 'hint', t('factory_reset_external_note'));
  note.style.marginBottom = '12px';
  wrap.appendChild(note);

  const step2 = el('p', null, t('factory_reset_step2'));
  step2.style.margin = '8px 0 6px';
  step2.style.fontWeight = '600';
  wrap.appendChild(step2);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'input';
  input.placeholder = t('factory_reset_confirm_label');
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.style.marginBottom = '12px';
  wrap.appendChild(input);

  const actions = el('div', 'modal-actions');
  const cancelBtn = makeButton(t('cancel'), { cls: 'btn btn-ghost', onClick: () => closeModal() });
  const finalBtn = makeButton(t('factory_reset_final_btn'), {
    cls: 'btn btn-danger',
    onClick: async () => {
      if (String(input.value || '').trim() !== 'RESET') return;
      finalBtn.disabled = true;
      cancelBtn.disabled = true;
      input.disabled = true;
      try {
        toast(t('factory_reset_in_progress'), 'info');
        // Best-effort stop of active playback/recording tasks in renderer
        try { if (player && typeof player.stopRecording === 'function') await player.stopRecording(); } catch (_) {}
        try { if (player && typeof player.close === 'function') player.close(true); } catch (_) {}
        try { if (player && player.video) { player.video.pause(); player.video.removeAttribute('src'); player.video.load(); } } catch (_) {}
        try { await window.api.recording.stop(); } catch (_) {}
        try {
          if (window.api && window.api.app && typeof window.api.app.factoryReset === 'function') {
            const res = await window.api.app.factoryReset({ confirm: 'RESET' });
            if (res && res.ok === false && res.error && res.error !== 'invalid_confirmation') {
              toast(t('factory_reset_failed'), 'err');
              finalBtn.disabled = false;
              cancelBtn.disabled = false;
              input.disabled = false;
              return;
            }
          } else {
            toast(t('factory_reset_failed'), 'err');
            finalBtn.disabled = false;
            cancelBtn.disabled = false;
            input.disabled = false;
            return;
          }
        } catch (_) {
          toast(t('factory_reset_failed'), 'err');
          finalBtn.disabled = false;
          cancelBtn.disabled = false;
          input.disabled = false;
          return;
        }
      } catch (_) {
        toast(t('factory_reset_failed'), 'err');
        finalBtn.disabled = false;
        cancelBtn.disabled = false;
        input.disabled = false;
      }
    }
  });
  finalBtn.disabled = true;
  finalBtn.style.whiteSpace = 'normal';
  input.addEventListener('input', () => {
    finalBtn.disabled = String(input.value || '').trim() !== 'RESET';
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(finalBtn);
  openModalWithActions(wrap, actions);
  setTimeout(() => { try { input.focus(); } catch (_) {} }, 0);
}

function settingsSystem(panel) {
  panel.appendChild(el('h3', null, t('factory_reset_title')));
  panel.appendChild(el('p', 'hint', t('factory_reset_desc')));

  const box = el('div', 'list');
  box.style.marginTop = '8px';
  const row = el('div', 'list-row');
  const main = el('div', 'list-main');
  main.appendChild(el('div', 'list-title', t('factory_reset')));
  main.appendChild(el('div', 'list-sub', t('factory_reset_desc')));
  row.appendChild(main);
  const btn = makeButton(t('factory_reset_btn'), {
    cls: 'btn btn-danger btn-sm',
    onClick: () => { void runFactoryResetFlow(); }
  });
  row.appendChild(btn);
  box.appendChild(row);
  panel.appendChild(box);
}

function settingsAbout(panel) {
  panel.appendChild(el('h3', null, t('about')));

  const intro = el('div');
  intro.style.cssText = 'margin:8px 0 14px;padding:14px;border-radius:12px;border:1px solid var(--line);background:var(--panel)';
  intro.appendChild(el('div', 'list-title', 'GomizPlayer IPTV'));
  intro.appendChild(el('p', 'hint', t('about_desc') || 'GomizPlayer IPTV هو مشغّل وسائط سطح مكتب (IPTV/VOD) لإدارة وتشغيل مصادرك الخاصة، مع دعم دليل البرامج، الترجمة، والتنزيلات، وواجهة عربية/إنجليزية.'));
  intro.appendChild(el('p', 'hint', (t('developer') || 'المبرمج') + ': Radhouane Mokrane'));
  panel.appendChild(intro);

  /* Update safety / rollback status (local only) */
  if (window.api.updates && window.api.updates.guard) {
    const guardBox = el('div');
    guardBox.style.cssText = 'margin:0 0 14px;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--panel)';
    const guardTitle = el('div', 'list-title', 'Update safety / أمان التحديث');
    guardBox.appendChild(guardTitle);
    const guardLine = el('p', 'hint', 'Loading...');
    guardBox.appendChild(guardLine);
    const guardBtns = el('div');
    guardBtns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px';
    guardBtns.appendChild(makeButton('Snapshot now', { cls: 'btn btn-ghost btn-sm', onClick: async () => {
      const r = await window.api.updates.snapshot();
      toast(r && r.ok ? 'Data snapshot saved before update' : 'Snapshot failed', r && r.ok ? 'ok' : 'err');
    }}));
    guardBox.appendChild(guardBtns);
    panel.appendChild(guardBox);
    const diagBtn = makeButton('View recent errors', { cls: 'btn btn-ghost btn-sm', onClick: async () => {
      const r = await window.api.diagnostics.tail(15);
      const lines = r && r.lines ? r.lines : [];
      const box = el('div');
      box.style.cssText = 'max-height:360px;overflow:auto;background:#080b12;border:1px solid var(--line);border-radius:8px;padding:10px;margin-top:10px;font:11px monospace;white-space:pre-wrap;word-break:break-all';
      box.textContent = lines.length ? lines.join('\n') : 'No local errors recorded.';
      const wrap = el('div');
      wrap.appendChild(el('h2', null, 'Local diagnostics / التشخيص المحلي'));
      wrap.appendChild(el('p', 'lead', ' محفوظة على جهازك فقط — لا تُرسل لأي خادم. / Stored on this device only — never sent to a server.'));
      wrap.appendChild(box);
      openModal(wrap);
    }});
    guardBtns.appendChild(diagBtn);
    window.api.updates.guard().then((r) => {
      const st = r && r.state;
      if (!st) { guardLine.textContent = 'Unavailable'; return; }
      const snaps = (st.snapshots || []).length;
      guardLine.textContent = 'Version: ' + (st.lastVersion || '-') +
        '  ·  Last good: ' + (st.lastGoodVersion || '-') +
        '  ·  Crashes: ' + (Number(st.crashes) || 0) +
        '  ·  Snapshots: ' + snaps;
      if (Number(st.crashes) >= 2 && st.previousVersion) {
        guardBtns.appendChild(makeButton('Dismiss rollback warning', { cls: 'btn btn-ghost btn-sm', onClick: async () => {
          await window.api.updates.dismissRollback();
          guardLine.textContent += ' (dismissed)';
        }}));
      }
    }).catch(() => { guardLine.textContent = 'Unavailable'; });
  }

  const contacts = el('div', 'list');
  contacts.style.marginBottom = '14px';
  const contactRows = [
    [t('contact_facebook') || 'Facebook', 'https://www.facebook.com/profile.php?id=61595630273747', null, 'facebook'],
    [t('contact_email') || 'Email', 'mailto:radhouanemokrane.contact@gmail.com', 'radhouanemokrane.contact@gmail.com', 'mail'],
    [t('contact_github') || 'GitHub', 'https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-', null, 'github']
  ];
  contactRows.forEach(([label, url, text, icon]) => {
    const row = el('div', 'list-row');
    if (icon) {
      const ic = el('span', 'contact-icon');
      ic.setAttribute('data-icon', icon);
      ic.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;background:var(--panel-2,#1a2233);color:var(--text,#fff);flex:0 0 34px;margin-inline-end:10px';
      row.appendChild(ic);
    }
    const m = el('div', 'list-main');
    m.appendChild(el('div', 'list-title', label));
    m.appendChild(el('div', 'list-sub', text || url));
    row.appendChild(m);
    const btn = makeButton('', { cls: 'btn btn-ghost btn-sm', icon: icon || 'external', onClick: () => {
      if (icon === 'mail') { openEmailComposer('radhouanemokrane.contact@gmail.com'); return; }
      if (window.api && window.api.shell && window.api.shell.openExternal) window.api.shell.openExternal(url);
      else window.open(url, '_blank');
    }, title: t('open') || 'فتح' });
    row.appendChild(btn);
    contacts.appendChild(row);
  });
  if (typeof hydrateIcons === 'function') hydrateIcons(contacts);
  panel.appendChild(el('h3', null, t('contact') || 'وسائل التواصل'));
  panel.appendChild(contacts);

  panel.appendChild(el('p', 'hint', t('version') + ' ' + (state.info ? state.info.version : '1.0.0')));

  const list = el('div', 'list');
  const rows = [
    ['GomizPlayer IPTV', state.info ? state.info.version : ''],
    ['Electron', state.info ? state.info.electron : ''],
    ['Chromium', state.info ? state.info.chrome : ''],
    [t('nav_sources'), String(state.sources.length)],
    [t('items'), I18N.number(state.items.length)],
    [t('nav_favorites'), I18N.number(state.library.favorites.length)]
  ];
  rows.forEach(([k, v]) => {
    const row = el('div', 'list-row');
    const m = el('div', 'list-main');
    m.appendChild(el('div', 'list-title', k));
    row.appendChild(m);
    row.appendChild(el('span', 'pill', v));
    list.appendChild(row);
  });
  panel.appendChild(list);

  const legal = el('div');
  legal.style.cssText = 'margin-top:16px;padding:14px;border-radius:12px;border:1px solid var(--line);background:var(--panel)';
  legal.appendChild(el('div', 'list-title', t('legal')));
  legal.appendChild(el('p', 'hint', t('legal_text')));
  panel.appendChild(legal);

  panel.appendChild(el('h3', null, t('shortcuts')));
  panel.appendChild(el('p', 'hint', t('shortcuts_hint')));
  const sc = el('div', 'list');
  [['Space', t('sc_play_pause')], ['F', t('sc_fullscreen')], ['M', t('sc_mute')], ['← / →', t('sc_seek')], ['↑ / ↓', t('sc_volume')], ['Esc', t('sc_back')]].forEach(([k,v]) => {
    const row = el('div', 'list-row');
    const m = el('div', 'list-main'); m.appendChild(el('div', 'list-title', v)); row.appendChild(m);
    row.appendChild(el('span', 'pill', k)); sc.appendChild(row);
  });
  panel.appendChild(sc);

  panel.appendChild(el('h3', null, t('diagnostics_updates')));
  const dBtns = el('div');
  dBtns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px';
  dBtns.appendChild(makeButton(t('export_diagnostics'), { cls: 'btn btn-ghost btn-sm', icon: 'download', onClick: async () => {
    const r = await window.api.diagnostics.export(); if (r && r.ok) toast(t('diagnostics_exported'), 'ok');
  }}));
  const checkBtn = makeButton(t('check_updates'), { cls: 'btn btn-ghost btn-sm', icon: 'refresh', onClick: async () => {
    try {
      const r = await window.api.updates.check();
      if (r && r.ok === false) renderUpdate({ status: 'error', message: r.reason || '' });
    } catch (e) {
      toast(e && e.message ? e.message : t('error'), 'err');
    }
  }});
  dBtns.appendChild(checkBtn);
  const downloadBtn = makeButton(t('download') || 'Download', { cls: 'btn btn-primary btn-sm', icon: 'download', onClick: async () => {
    try {
      const r = await window.api.updates.download();
      if (r && r.ok === false) toast(r.error || t('error'), 'err');
    } catch (e) {
      toast(e && e.message ? e.message : t('error'), 'err');
    }
  }});
  downloadBtn.style.display = 'none';
  dBtns.appendChild(downloadBtn);
  const installBtn = makeButton(t('install_update') || 'Install update', { cls: 'btn btn-primary btn-sm', icon: 'download', onClick: async () => {
    await window.api.updates.install();
  }});
  installBtn.style.display = 'none';
  dBtns.appendChild(installBtn);
  panel.appendChild(dBtns);

  const upStatus = el('div', 'hint', '');
  upStatus.style.marginBottom = '12px';
  panel.appendChild(upStatus);

  const renderUpdate = (s) => {
    const st = s || {};
    const ver = st.version ? (' v' + st.version) : '';
    const map = {
      checking: t('checking_updates') || 'Checking for updates...',
      available: (t('update_available') || 'Update available') + ver,
      downloading: (t('update_downloading') || 'Downloading update') + ver + (st.progress ? (' — ' + st.progress + '%') : ''),
      downloaded: (t('update_ready') || 'Update ready to install') + ver,
      none: (state.info ? state.info.version : '') + ' — ' + t('up_to_date'),
      error: (t('update_error') || 'Update failed') + (st.message ? ': ' + st.message : ''),
      idle: ''
    };
    upStatus.textContent = map[st.status] || '';
    installBtn.style.display = st.status === 'downloaded' ? '' : 'none';
    downloadBtn.style.display = st.status === 'available' ? '' : 'none';
  };
  if (window.api.updates && window.api.updates.status) {
    window.api.updates.status().then(renderUpdate).catch(() => {});
  }
  if (!window.__novaUpdateBound && window.api.updates && window.api.updates.onStatus) {
    window.__novaUpdateBound = true;
    window.api.updates.onStatus((s) => {
      renderUpdate(s);
      if (!s) return;
      if (s.status === 'available') toast((t('update_available') || 'Update available') + (s.version ? (' v' + s.version) : ''), 'ok');
      else if (s.status === 'downloaded') toast((t('update_ready') || 'Update ready to install') + (s.version ? (' v' + s.version) : ''), 'ok');
      else if (s.status === 'error') toast((t('update_error') || 'Update failed') + (s.message ? ': ' + s.message : ''), 'err');
      else if (s.status === 'none') toast(t('up_to_date'), 'ok');
    });
  } else if (window.api.updates && window.api.updates.status) {
    window.api.updates.status().then(renderUpdate).catch(() => {});
  }

  const demoBtn = makeButton(t('load_demo'), {
    cls: 'btn btn-ghost btn-sm', icon: 'play', onClick: () => loadDemo()
  });
  demoBtn.style.marginTop = '14px';
  panel.appendChild(demoBtn);
}

function makeDarkSelect(options, value, onChange, opts = {}) {
  const wrap = el('div', 'dark-select');
  if (opts.width) wrap.style.width = opts.width;
  if (opts.minWidth) wrap.style.minWidth = opts.minWidth;
  const btn = el('button', 'dark-select-btn', '');
  btn.type = 'button';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  const labelEl = el('span', 'dark-select-label', '');
  const chev = el('span', 'dark-select-chev', '\u25BE');
  btn.appendChild(labelEl);
  btn.appendChild(chev);
  wrap.appendChild(btn);
  const menu = el('div', 'dark-select-menu');
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;
  wrap.appendChild(menu);
  let current = String(value == null ? '' : value);
  const optionEls = options.map(([v, n]) => {
    const o = el('button', 'dark-select-option' + (String(v) === current ? ' on' : ''), String(n));
    o.type = 'button';
    o.setAttribute('role', 'option');
    o.addEventListener('click', (e) => {
      e.stopPropagation();
      setValue(v);
      close();
      try { onChange && onChange(v); } catch (_) {}
    });
    menu.appendChild(o);
    return o;
  });
  function setValue(v) {
    current = String(v);
    const match = options.find(([ov]) => String(ov) === current);
    labelEl.textContent = match ? String(match[1]) : String(value == null ? '' : value);
    optionEls.forEach((o, i) => o.classList.toggle('on', String(options[i][0]) === current));
  }
  function open() {
    if (wrap._closeMenu) wrap._closeMenu();
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    wrap.classList.add('open');
    wrap._closeMenu = close;
    darkOpenSelects.add(wrap);
  }
  function close() {
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    wrap.classList.remove('open');
    darkOpenSelects.delete(wrap);
  }
  btn.addEventListener('click', (e) => { e.stopPropagation(); if (menu.hidden) open(); else close(); });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); btn.blur(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      const i = options.findIndex(([v]) => String(v) === current);
      const next = e.key === 'ArrowDown'
        ? (i + 1) % options.length
        : (i - 1 + options.length) % options.length;
      setValue(options[next][0]);
      try { onChange && onChange(options[next][0]); } catch (_) {}
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (menu.hidden) open(); else close(); }
  });
  Object.defineProperty(wrap, 'value', { get: () => current, set: (v) => { setValue(v); } });
  setValue(value);
  return wrap;
}
const darkOpenSelects = new Set();
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (darkOpenSelects.size === 0) return;
    // Clicks inside a dark-select wrap (button or options) are handled by the wrap itself
    const t = e && e.target;
    if (t && t.closest && t.closest('.dark-select')) return;
    Array.from(darkOpenSelects).forEach((w) => { if (w._closeMenu) w._closeMenu(); });
  });
}

function segRow(label, options, value, onChange) {
  const row = el('div', 'switch-row');
  const main = el('div', 'list-main');
  main.appendChild(el('div', 'list-title', label));
  row.appendChild(main);
  const seg = el('div', 'seg');
  options.forEach(([v, text]) => {
    const b = el('button', v === value ? 'on' : '', text);
    b.addEventListener('click', () => onChange(v));
    seg.appendChild(b);
  });
  row.appendChild(seg);
  return row;
}

function toggleRow(label, hint, value, onChange) {
  const row = el('div', 'switch-row');
  const main = el('div', 'list-main');
  main.appendChild(el('div', 'list-title', label));
  if (hint) main.appendChild(el('div', 'list-sub', hint));
  row.appendChild(main);
  const sw = el('button', 'switch' + (value ? ' on' : ''));
  sw.addEventListener('click', () => {
    const on = !sw.classList.contains('on');
    sw.classList.toggle('on', on);
    onChange(on);
  });
  row.appendChild(sw);
  return row;
}

function rangeField(label, min, max, value, step, onInput) {
  const row = el('div', 'switch-row');
  const main = el('div', 'list-main');
  main.appendChild(el('div', 'list-title', label));
  row.appendChild(main);
  const range = el('input');
  range.type = 'range';
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.value = String(value);
  range.style.width = '200px';
  const out = el('span', 'tiny dim', String(value));
  out.style.minWidth = '38px';
  out.style.textAlign = 'center';
  range.addEventListener('input', () => {
    out.textContent = range.value;
    onInput(Number(range.value));
  });
  range.addEventListener('change', () => onInput(Number(range.value)));
  row.appendChild(range);
  row.appendChild(out);
  return row;
}

/* ===================== Modal plumbing ===================== */

function openModal(content, opts = {}) {
  modalBody.innerHTML = '';
  modalBody.appendChild(content);
  modalRoot.hidden = false;
  const modal = modalRoot.querySelector('.modal');
  modal.classList.toggle('wide', !!opts.wide);
  hydrateIcons(modalBody);
  const focusable = modalBody.querySelector('input, select, textarea, button');
  if (focusable) setTimeout(() => focusable.focus(), 50);
}

function closeModal() {
  modalRoot.hidden = true;
  modalBody.innerHTML = '';
  if (confirmResolve) {
    const resolve = confirmResolve;
    confirmResolve = null;
    resolve(false);
  }
}

let confirmResolve = null;

function confirmModal(title, text, okLabel, danger) {
  const wrap = el('div');
  wrap.appendChild(el('h2', null, title));
  wrap.appendChild(el('p', 'lead', text));

  const actions = el('div', 'modal-actions');
  actions.appendChild(makeButton(t('cancel'), { cls: 'btn btn-ghost', onClick: () => finishConfirm(false) }));
  actions.appendChild(makeButton(okLabel || t('delete'), {
    cls: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'),
    onClick: () => finishConfirm(true)
  }));
  openModalWithActions(wrap, actions);

  return new Promise((resolve) => { confirmResolve = resolve; });
}

function finishConfirm(value) {
  if (confirmResolve) {
    confirmResolve(value);
    confirmResolve = null;
  }
  closeModal();
}

function confirmYesNo(title, text, danger) {
  const wrap = el('div');
  wrap.appendChild(el('h2', null, title));
  wrap.appendChild(el('p', 'lead', text));

  const actions = el('div', 'modal-actions');
  actions.appendChild(makeButton(t('no'), { cls: 'btn btn-ghost', onClick: () => finishConfirm(false) }));
  actions.appendChild(makeButton(t('yes'), {
    cls: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'),
    onClick: () => finishConfirm(true)
  }));
  openModalWithActions(wrap, actions);

  return new Promise((resolve) => { confirmResolve = resolve; });
}

/* ===================== Data loading ===================== */

async function loadAllItems() {
  state.loading = true;
  try {
    state.sources = await window.api.sources.list();
    const merged = new Map();
    for (const source of state.sources) {
      let data = await window.api.sources.items(source.id);
      if (!data) {
        try {
          data = await window.api.sources.refresh(source.id);
          source.count = data.count;
          source.fetchedAt = data.fetchedAt;
        } catch (_) {
          continue;
        }
      }
      const items = (data.items || []).filter((x) => !x.hidden);
      state.itemsBySource.set(source.id, items.map((it) => ({ ...it, sourceId: source.id, sourceName: source.name })));
      for (const item of state.itemsBySource.get(source.id)) {
        if (!merged.has(item.key)) merged.set(item.key, item);
      }
    }
    state.items = Array.from(merged.values());
  } finally {
    state.loading = false;
  }
}

function rebuildItems() {
  const merged = new Map();
  for (const [id, list] of state.itemsBySource.entries()) {
    for (const item of list) {
      if (item.hidden) continue;
      if (!merged.has(item.key)) merged.set(item.key, item);
    }
  }
  state.items = Array.from(merged.values());
}

async function refreshLibrary() {
  try {
    state.profiles = await window.api.profiles.list();
  } catch (_) {}
  try {
    state.library = await window.api.library.get(activeProfile());
  } catch (_) {
    state.library = { favorites: [], history: [], liveHistory: [], search: [] };
  }
}

async function refreshDownloads() {
  try {
    state.downloads = await window.api.downloads.list();
  } catch (_) {
    state.downloads = [];
  }
}

async function refreshRecordingStatus() {
  try {
    const st = await window.api.recording.status();
    state.recordingTarget = (st && st.recording && st.target) ? st.target : null;
    state.recordingPath = (st && st.recording) ? st.path : null;
  } catch (_) {
    state.recordingTarget = null;
    state.recordingPath = null;
  }
  const route = state.route;
  if (route === 'home' || route === 'live' || route === 'movies' || route === 'series' || route === 'favorites' || route === 'search' || route === 'history' || route === 'recordings') {
    render();
  }
}

async function refreshRecordings() {
  try {
    state.recordings = await window.api.recording.list();
  } catch (_) {
    state.recordings = [];
  }
  await refreshRecordingStatus();
  if (player && player.recordBadge) {
    player.recordBadge.textContent = state.recordings.length;
    player.recordBadge.hidden = !state.recordings.length;
  }
  if (state.route === 'home' || state.route === 'recordings') render();
}



function updatePrayerCountdown() {
  const big = document.getElementById('homePrayerName');
  const detail = document.getElementById('homePrayerDetail');
  const info = getNextPrayerInfo(state.prayer, new Date());
  if (big && detail) {
    if (info) {
      big.textContent = info.time || '--:--';
      detail.textContent = t('next_prayer') + ': ' + (info.label || '') + ' · ' + formatCountdown(info.remaining);
      big.dataset.ready = '1';
    } else {
      big.textContent = '—';
      detail.textContent = t('loading');
      delete big.dataset.ready;
    }
  }
  const pBig = document.getElementById('playerPrayerName');
  const pDetail = document.getElementById('playerPrayerDetail');
  if (pBig && pDetail && info) { /* player handles its own */ }
}




function updateWidgetBackgrounds() {
  const now = new Date();
  const tod = timeOfDayKey(now);
  const setBg = (id, bg) => { const n = document.getElementById(id); if (n && n.dataset.bg !== bg) n.dataset.bg = bg; };

  // Clock card follows the time of day.
  setBg('wcClockCard', tod);

  // Weather card follows the current condition (and night clear sky).
  const w = state.weather;
  let wb = tod;
  if (w && w.icon !== undefined && w.icon !== null) {
    const b = wmoBucket(Number(w.icon));
    wb = ({ clear: 'clear', partly: 'cloudy', overcast: 'cloudy', fog: 'fog', rain: 'rain', snow: 'snow', thunder: 'thunder' })[b] || tod;
    if (wb === 'clear' && tod === 'night') wb = 'night';
  }
  setBg('wcWeatherCard', wb);

  // Prayer card shifts to a golden glow when the next prayer is close.
  const info = getNextPrayerInfo(state.prayer, now);
  let pb = tod === 'night' ? 'prayer-night' : 'prayer';
  if (info && info.remaining != null && info.remaining <= 1800) pb = 'prayer-near';
  setBg('wcPrayerCard', pb);
}

function startClock() {
  if (state.clockTimer) clearInterval(state.clockTimer);
  const tick = () => {
    const now = new Date();
    const elc = document.getElementById('homeClock');
    if (elc) elc.textContent = formatTime(now);
    const setHand = (id, deg) => { const n = document.getElementById(id); if (n) n.setAttribute('transform', 'rotate(' + deg.toFixed(1) + ' 24 24)'); };
    setHand('clkHour', (now.getHours() % 12) * 30 + now.getMinutes() * 0.5);
    setHand('clkMin', now.getMinutes() * 6 + now.getSeconds() * 0.1);
    setHand('clkSec', now.getSeconds() * 6);
    updateWidgetBackgrounds();
    const dateEl = document.getElementById('homeClockDate');
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString(appLocale(), { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    updatePrayerCountdown();
  };
  tick();
  state.clockTimer = setInterval(tick, 1000);
  state.prayerCountdownTimer = setInterval(updatePrayerCountdown, 1000);
}

async function resolveWeatherLocation() {
  const s = state.settings || {};
  const customCity = String(s.weatherCity || '').trim();
  if (customCity) {
    let lat = Number(s.weatherLat);
    let lon = Number(s.weatherLon);
    let city = customCity;
    let country = String(s.weatherCountry || '');
    if (!(lat && lon)) {
      try {
        const lang = /^[a-z]/i.test(s.language) ? s.language : 'en';
        const g = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(customCity) + '&count=1&language=' + lang + '&format=json');
        const gj = await g.json();
        const res = gj && gj.results && gj.results[0];
        if (res) { lat = res.latitude; lon = res.longitude; city = res.name || customCity; country = res.country || ''; }
      } catch (_) {}
    }
    state.location = lat && lon ? { city, country, lat, lon } : null;
    state.weatherStatus = state.location ? ('custom:' + city) : 'custom:notfound';
    if (state.location) await patchSettings({ weatherLat: lat, weatherLon: lon, weatherCountry: country, weatherCity: city });
    return;
  }
  // Auto-detect via ipwho.is (free, HTTPS, CORS-enabled, no key)
  let ok = false;
  try {
    const r = await fetch('https://ipwho.is/');
    const loc = await r.json();
    if (loc && (loc.success !== false) && loc.latitude && loc.longitude) {
      state.location = { city: loc.city || '', country: loc.country || loc.country_code || '', lat: loc.latitude, lon: loc.longitude };
      ok = true;
    }
  } catch (_) { ok = false; }
  state.weatherStatus = ok ? ('auto:' + ((state.location && state.location.city) || '')) : 'unavailable';
  if (!ok) state.location = null;
}

async function loadLocationWeatherPrayer(_report) {
  await resolveWeatherLocation();
  state.weather = null;
  state.prayer = null;
  state.weatherError = '';
  // Weather via Open-Meteo (free, CORS, no key)
  if (state.location && state.location.lat && state.location.lon) {
    try {
      const params = new URLSearchParams({
        latitude: String(state.location.lat),
        longitude: String(state.location.lon),
        current_weather: 'true',
        timezone: 'auto'
      });
      const r = await fetch('https://api.open-meteo.com/v1/forecast?' + params.toString());
      const data = await r.json();
      const cw = data && data.current_weather;
      if (cw) {
        state.weather = {
          tempC: Number(cw.temperature),
          tempF: Math.round(Number(cw.temperature) * 9 / 5 + 32),
          desc: weatherDescription(cw.weathercode),
          icon: String(cw.weathercode == null ? '' : cw.weathercode),
          isDay: cw.is_day === 1 ? true : (cw.is_day === 0 ? false : null),
          windspeed: cw.windspeed,
          winddirection: cw.winddirection,
          time: cw.time || null
        };
      }
    } catch (err) {
      state.weather = null;
      state.weatherError = String((err && err.message) || err || 'weather_error');
      if (typeof console !== 'undefined' && console.warn) console.warn('[weather] fetch failed:', state.weatherError);
    }
    // Prayer
    try {
      const d = new Date();
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const method = Number((state.settings || {}).prayerMethod || 2);
      const school = Number((state.settings || {}).prayerSchool || 0);
      const url = 'https://api.aladhan.com/v1/timings/' + dd + '-' + mm + '-' + yyyy + '?latitude=' + state.location.lat + '&longitude=' + state.location.lon + '&method=' + method + '&school=' + school;
      const r = await fetch(url);
      const data = await r.json();
      if (data && data.data && data.data.timings) state.prayer = data.data.timings;
    } catch (err) {
      state.prayer = null;
      if (typeof console !== 'undefined' && console.warn) console.warn('[prayer] fetch failed:', String((err && err.message) || err));
    }
  } else {
    state.weatherError = state.weatherStatus === 'custom:notfound' ? 'city_not_found' : 'no_location';
  }
  if (player && player.updateTopWidget) player.updateTopWidget();
  if (state.route === 'home') render();
  if (state.route === 'settings' && state.settingsTab === 'general') render();
}

function startWeatherAndPrayer() {
  loadLocationWeatherPrayer();
  // refresh weather/prayer every 10 minutes
  setInterval(loadLocationWeatherPrayer, 10 * 60 * 1000);
}

async function pickLocation(city) {
  const clean = String(city || '').trim();
  await patchSettings({ weatherCity: clean, weatherLat: 0, weatherLon: 0, weatherCountry: '' });
  await loadLocationWeatherPrayer();
}

function applyWidgetToggles() {
  const s = state.settings || {};
  const set = (id, key, fallback) => {
    const el = document.getElementById(id);
    if (!el) return;
    const on = s[key] === undefined ? fallback : !!s[key];
    el.classList.toggle('hidden-ui', !on);
  };
  set('ptwClock', 'widgetClock', true);
  set('ptwWeather', 'widgetWeather', true);
  set('ptwPrayer', 'widgetPrayer', true);
  const homeClock = document.getElementById('homeClock');
  if (homeClock) homeClock.classList.toggle('hidden-ui', !(state.settings && state.settings.widgetClock !== false));
}

async function patchSettings(patch) {
  state.settings = await window.api.settings.patch(patch);
  if (player) player.opts.settings = state.settings;
  if (state.settings && state.settings.accent) applyAccent(state.settings.accent, state.settings.accent2);
  applyAccessibility();
  applyWidgetToggles();
  return state.settings;
}

async function setLanguage(lang) {
  I18N.set(lang);
  await patchSettings({ language: lang });
  applyStaticText();
  updateChrome();
}

async function loadDemo() {
  try {
    const demoPath = await window.api.demoPath();
    const res = await window.api.sources.add({
      name: t('demo'),
      url: demoPath,
      kind: 'm3u',
      headers: {}
    });
    if (res.error) {
      toast(t('demo_failed') + ': ' + res.error, 'err');
      return;
    }
    await patchSettings({ onboarded: true });
    await loadAllItems();
    await refreshLibrary();
    toast(t('demo_loaded'), 'ok');
    navigate('home', { replace: true });
    render();
  } catch (err) {
    toast(t('demo_failed') + ': ' + err.message, 'err');
  }
}

/* ===================== Boot ===================== */

function bindGlobal() {
  document.querySelectorAll('.nav .nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const route = btn.getAttribute('data-route');
      if (route === 'live') openLiveReceiver();
      else if (route === 'favorites') openLiveReceiver('favorites');
      else navigate(route);
    });
  });
  document.getElementById('backBtn').addEventListener('click', goBack);
  const _qab = document.getElementById('quickAddBtn');
  if (_qab) _qab.addEventListener('click', () => openSourceModal());
  const _gb = document.getElementById('guideBtn');
  if (_gb) _gb.addEventListener('click', openGuide);
  document.getElementById('langBtn').addEventListener('click', async () => {
    const order = ['en', 'ar'];
    const cur = order.includes(state.settings.language) ? state.settings.language : 'en';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    await setLanguage(next);
    render();
  });
  const _pbtn = document.getElementById('profileBtn');
  if (_pbtn) _pbtn.addEventListener('click', () => navigate('settings', { tab: 'storage' }));

  const contactEmail = 'radhouanemokrane.contact@gmail.com';
  const socialLinks = {
    facebook: 'https://www.facebook.com/profile.php?id=61595630273747',
    mail: 'mailto:' + contactEmail,
    github: 'https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-'
  };
  window.__novaOpenEmailComposer = () => openEmailComposer(contactEmail);
  const sidebarSocial = document.getElementById('sidebarSocial');
  if (sidebarSocial) {
    sidebarSocial.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-social]') : null;
      if (!btn) return;
      if (btn.dataset.social === 'mail') {
        openEmailComposer(contactEmail);
        return;
      }
      const url = socialLinks[btn.dataset.social];
      if (!url) return;
      if (window.api && window.api.shell && window.api.shell.openExternal) window.api.shell.openExternal(url);
      else window.open(url, '_blank');
    });
    if (typeof hydrateIcons === 'function') hydrateIcons(sidebarSocial);
  }


  const search = document.getElementById('searchInput');
  search.addEventListener('input', () => {
    state.searchTerm = search.value;
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      if (state.searchTerm.trim()) navigate('search', { replace: state.route === 'search' });
      else if (state.route === 'search') render();
    }, 180);
  });
  search.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && state.searchTerm.trim()) {
      try {
        state.library.search = await window.api.library.search(state.searchTerm.trim(), activeProfile());
      } catch (_) {}
      if (state.route !== 'search') navigate('search');
      else render();
    }
    if (e.key === 'Escape') {
      search.value = '';
      state.searchTerm = '';
      if (state.route === 'search') goBack();
    }
  });

  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (typing) return;
    if (e.key === '/') {
      e.preventDefault();
      search.focus();
      search.select();
    }
    if (e.key === 'Escape') {
      if (!modalRoot.hidden) closeModal();
      else if (state.stack.length) goBack();
    }
  });

  modalRoot.addEventListener('click', (e) => {
    // Use closest() so clicking the SVG icon inside the X button also closes.
    if (e.target && e.target.closest && e.target.closest('[data-close]')) closeModal();
  });

  // Automatically offer an available update (including the startup check).
  if (!window.__novaUpdatePromptBound && window.api.updates && window.api.updates.onAvailable) {
    window.__novaUpdatePromptBound = true;
    window.api.updates.onAvailable((info) => {
      const ver = info && info.version ? (' v' + info.version) : '';
      const wrap = el('div');
      wrap.appendChild(el('h2', null, (t('update_available') || 'Update available') + ver));
      wrap.appendChild(el('p', 'lead', 'A new version is available. Download and install it now? / يتوفر إصدار جديد. هل تريد تنزيله وتثبيته الآن؟'));
      const actions = el('div', 'modal-actions');
      actions.appendChild(makeButton(t('cancel') || 'Later', { cls: 'btn btn-ghost', onClick: () => closeModal() }));
      actions.appendChild(makeButton(t('download') || 'Download', {
        cls: 'btn btn-primary',
        onClick: async () => {
          // Keep the modal open: progress events replace it with a progress view.
          try {
            const result = await window.api.updates.download();
            if (result && result.ok === false) showUpdateError(result.error || '');
          } catch (e) { showUpdateError(e && e.message ? e.message : ''); }
        }
      }));
      openModalWithActions(wrap, actions);
    });
  }

  // Persistent progress UI — GitHub downloads can take a while, so always show %.
  let updateProgressNode = null;
  function showUpdateError(message) {
    updateProgressNode = null;
    closeModal();
    const wrap = el('div');
    wrap.appendChild(el('h2', null, t('update_error') || 'Update failed'));
    wrap.appendChild(el('p', 'lead', message || (t('update_error') || 'Update failed')));
    const actions = el('div', 'modal-actions');
    actions.appendChild(makeButton(t('close') || 'Close', { cls: 'btn btn-ghost', onClick: () => closeModal() }));
    openModalWithActions(wrap, actions);
  }
  function showUpdateProgress(pct) {
    if (!updateProgressNode || !updateProgressNode.isConnected) {
      const wrap = el('div');
      wrap.appendChild(el('h2', null, t('update_downloading') || 'Downloading update'));
      const msg = el('p', 'lead', '');
      wrap.appendChild(msg);
      const actions = el('div', 'modal-actions');
      actions.appendChild(makeButton(t('cancel') || 'Close', { cls: 'btn btn-ghost', onClick: () => closeModal() }));
      openModalWithActions(wrap, actions);
      updateProgressNode = msg;
    }
    updateProgressNode.textContent = (t('update_downloading') || 'Downloading update') + ' — ' + (pct || 0) + '%';
  }

  if (!window.__novaUpdateProgressBound && window.api.updates && window.api.updates.onStatus) {
    window.__novaUpdateProgressBound = true;
    window.api.updates.onStatus((s) => {
      if (!s) return;
      if (s.status === 'downloading') {
        showUpdateProgress(s.progress || 0);
      } else if (s.status === 'downloaded') {
        const wrap = el('div');
        wrap.appendChild(el('h2', null, t('update_ready') || 'Update ready to install'));
        wrap.appendChild(el('p', 'lead', (t('update_ready') || 'Update ready') + (s.version ? (' v' + s.version) : '')));
        const actions = el('div', 'modal-actions');
        actions.appendChild(makeButton(t('install_update') || 'Install & restart', {
          cls: 'btn btn-primary',
          onClick: () => { window.api.updates.install(); }
        }));
        actions.appendChild(makeButton(t('cancel') || 'Close', { cls: 'btn btn-ghost', onClick: () => closeModal() }));
        openModalWithActions(wrap, actions);
      }
    });
  }

  window.api.downloads.onChanged((list) => {
    state.downloads = list;
    if (state.route === 'downloads') render();
  });

  window.addEventListener('error', (e) => {
    window.__novaLastError = e.message || String(e.error || 'script error');
    try {
      window.api.diagnostics.log('renderer-error', {
        message: window.__novaLastError,
        source: e.filename || '',
        line: e.lineno || 0
      });
    } catch (_) {}
  });
  window.addEventListener('unhandledrejection', (e) => {
    window.__novaLastError = String((e.reason && e.reason.message) || e.reason || 'unhandled rejection');
    try { window.api.diagnostics.log('renderer-rejection', { message: window.__novaLastError }); } catch (_) {}
  });
}

function showLockScreen() {
  return new Promise((resolve) => {
    const overlay = el('div');
    overlay.id = 'lockScreen';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.85);backdrop-filter:blur(8px)';
    const box = el('div');
    box.style.cssText = 'width:min(420px,92vw);padding:22px;border-radius:16px;background:var(--panel);border:1px solid var(--line);display:flex;flex-direction:column;gap:12px';
    box.appendChild(el('h3', null, t('app_lock')));
    box.appendChild(el('p', 'hint', t('enter_pin_hint')));
    const inp = el('input', 'input');
    inp.type = 'password';
    inp.placeholder = 'PIN';
    box.appendChild(inp);
    const err = el('div', 'tiny dim');
    err.style.color = 'var(--danger)';
    box.appendChild(err);
    const btn = makeButton(t('unlock'), { cls: 'btn btn-primary', onClick: async () => {
      btn.disabled = true;
      try {
        const res = await window.api.appLock.verify(String(inp.value || ''));
        if (res && res.ok) { overlay.remove(); resolve(true); return; }
        err.textContent = t('wrong_pin');
        inp.value = '';
        inp.focus();
      } catch (_) {
        err.textContent = t('wrong_pin');
      } finally {
        btn.disabled = false;
      }
    }});
    box.appendChild(btn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    setTimeout(() => inp.focus(), 50);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
  });
}

function showConsentDialog() {
  return new Promise((resolve) => {
    const wrap = el('div');
    wrap.appendChild(el('h3', null, t('consent_title')));
    wrap.appendChild(el('p', 'hint', t('consent_body')));
    const note = el('p', 'hint', t('consent_note'));
    note.style.marginTop = '8px';
    wrap.appendChild(note);
    const actions = el('div', 'modal-actions');
    actions.appendChild(makeButton(t('consent_deny'), { cls: 'btn btn-ghost', onClick: async () => {
      await patchSettings({ consentShown: true, analyticsEnabled: false, crashReportingEnabled: false, telemetryEnabled: false });
      closeModal();
      resolve(false);
    }}));
    actions.appendChild(makeButton(t('consent_allow'), { cls: 'btn btn-primary', onClick: async () => {
      await patchSettings({ consentShown: true, analyticsEnabled: true, crashReportingEnabled: true, telemetryEnabled: true });
      closeModal();
      resolve(true);
    }}));
    openModalWithActions(wrap, actions);
  });
}

async function boot() {
  try {
    window.api.info().then((info) => { state.info = info; }).catch(() => {});
    state.settings = await window.api.settings.get();
    if (!state.settings || !['en', 'ar'].includes(state.settings.language)) state.settings.language = 'en';
    state.profile = state.settings.profile || 'default';
    try { state.profiles = await window.api.profiles.list(); } catch (_) { state.profiles = ['default']; }
    I18N.init(state.settings.language);
    document.documentElement.dataset.theme = state.settings.theme || 'dark';
    if (state.settings.accent) applyAccent(state.settings.accent, state.settings.accent2);
    applyAccessibility();
    applyWidgetToggles();

    if (state.settings.appLockEnabled && state.settings.appLockSet) {
      await showLockScreen();
    }

    bindGlobal();
    hydrateIcons(document);

    ensurePlayer();
    await Promise.all([refreshLibrary(), refreshDownloads(), refreshRecordings()]);
    await loadAllItems();
    startWeatherAndPrayer();
    startClock();

    render();

    // Detect low-perf (GPU-less / software rendering) AFTER first paint so
    // the initial render never blocks on a WebGL context probe.
    setTimeout(() => { try { detectLowPerf(); } catch (_) {} }, 0);

    if (!state.settings.consentShown) {
      await showConsentDialog();
    }

    state.ready = true;
    window.__novaReady = true;
  } catch (err) {
    window.__novaLastError = err && err.message ? err.message : String(err);
    const message = el('div', 'empty');
    message.appendChild(el('h3', null, 'GomizPlayer IPTV failed to start'));
    message.appendChild(el('p', null, window.__novaLastError));
    view.innerHTML = '';
    view.appendChild(message);
    window.__novaReady = true;
  }
}

boot();

/* Test / debugging hook (harmless in normal use). */
window.__novaTest = {
  openMultiview: () => openMultiview(),
  state,
  player: () => player,
  play: (item, list) => playItem(item, list),
  openLive: () => openLiveReceiver(),
  detail: (item, list) => showDetail(item, list),
  guide: () => openGuide(),
  setLanguage: async (lang) => { await setLanguage(lang); render(); },
  refreshWeather: () => loadLocationWeatherPrayer(),
  reload: async () => {
    await loadAllItems();
    await refreshLibrary();
    await refreshDownloads();
    await refreshRecordings();
    render();
  },
  navigate: (route) => navigate(route, { replace: true }),
  render
};
