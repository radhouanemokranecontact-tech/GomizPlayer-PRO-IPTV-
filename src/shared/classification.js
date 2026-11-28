'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GomizClassification = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // --- helpers ---
  function norm(v) { return String(v == null ? '' : v).trim(); }
  function lower(v) { return norm(v).toLowerCase(); }

  function getField(item, keys) {
    if (!item || typeof item !== 'object') return '';
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(item, k)) {
        const val = norm(item[k]);
        if (val) return val;
      }
    }
    return '';
  }

  // Token/word-boundary aware matching to reduce false positives (e.g. "alive", "olive").
  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  const TOKEN_REGEX_CACHE = new Map();
  const TOKEN_REGEX_CACHE_LIMIT = 256;
  function tokenRegex(token) {
    const t = String(token).toLowerCase();
    let re = TOKEN_REGEX_CACHE.get(t);
    if (re) return re;
    const isAsciiWord = /^[a-z0-9]+$/.test(t);
    // For non-ASCII (Arabic/French accents) use a looser boundary that still avoids joining letters.
    re = isAsciiWord
      ? new RegExp('(^|[^a-z0-9])' + escapeRe(t) + '([^a-z0-9]|$)', 'i')
      : new RegExp('(^|[\\s\\|\\-_/\\[\\]\\(\\):,;.])' + escapeRe(t) + '([\\s\\|\\-_/\\[\\]\\(\\):,;.]|$)', 'i');
    if (TOKEN_REGEX_CACHE.size >= TOKEN_REGEX_CACHE_LIMIT) TOKEN_REGEX_CACHE.clear();
    TOKEN_REGEX_CACHE.set(t, re);
    return re;
  }
  function hasToken(text, token) {
    if (!text || !token) return false;
    return tokenRegex(token).test(String(text).toLowerCase());
  }
  function hasAnyToken(text, tokens) {
    for (const t of tokens) if (hasToken(text, t)) return true;
    return false;
  }
  // Phrase/regex hint matching (for multi-word hints). Kept conservative.
  function matchesAny(text, patterns) {
    const src = String(text || '');
    for (const p of patterns) {
      if (p instanceof RegExp) { if (p.test(src)) return true; }
      else if (typeof p === 'string' && p) { if (hasToken(src, p)) return true; }
    }
    return false;
  }

  // URL/path helpers (operate on lowercased URL string)
  function getPathAndQuery(url) {
    const u = lower(url);
    // strip fragment for matching
    return u.split('#')[0];
  }
  function pathHasSegment(u, seg) {
    // match /seg/ or /seg? or /seg$ in path-ish positions
    const s = '/' + seg.toLowerCase() + '/';
    const s2 = '/' + seg.toLowerCase() + '?';
    const s3 = '/' + seg.toLowerCase();
    return u.includes(s) || u.includes(s2) || u.endsWith(s3) || u.includes(s3 + '&') || u.includes(s3 + '#');
  }
  function getQueryParam(u, name) {
    try {
      const idx = u.indexOf('?');
      if (idx < 0) return '';
      const q = u.slice(idx + 1);
      const params = new URLSearchParams(q);
      return lower(params.get(name) || '');
    } catch (_) {
      // regex fallback
      const m = u.match(new RegExp('[?&]' + escapeRe(name) + '=([^&#]*)', 'i'));
      return m ? lower(decodeURIComponentSafe(m[1])) : '';
    }
  }
  function decodeURIComponentSafe(s) { try { return decodeURIComponent(s); } catch (_) { return s; } }

  function getUrlExtension(u) {
    const s = getPathAndQuery(u);
    // remove query for extension detection
    const path = s.split('?')[0];
    const m = path.match(/\.([a-z0-9]{1,8})$/i);
    return m ? m[1].toLowerCase() : '';
  }

  const VOD_FILE_EXT = new Set(['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', 'ogv', '3gp']);
  const STREAM_EXT = new Set(['m3u8', 'ts', 'm3u', 'mpd']);
  const PLAYLIST_EXT = new Set(['m3u', 'm3u8']);

  // --- explicit stream type detection (priority 1 & stored explicit type) ---
  function explicitTypeFromString(v) {
    const k = lower(v);
    if (!k) return '';
    // exact/common tokens
    if (k === 'series' || k === 'serie' || k === 'show' || k === 'shows' || k === 'tvshow') return 'series';
    if (k === 'movie' || k === 'movies' || k === 'vod' || k === 'film' || k === 'films') return 'movie';
    if (k === 'live' || k === 'livetv' || k === 'live_tv' || k === 'channel' || k === 'channels') return 'live';
    return '';
  }

  function explicitTypeFromUrl(url) {
    const u = getPathAndQuery(url);
    if (!u) return '';
    // Xtream/structured paths and query params (strong explicit)
    const st = getQueryParam(u, 'stream_type');
    if (st === 'series') return 'series';
    if (st === 'movie' || st === 'vod') return 'movie';
    if (st === 'live') return 'live';
    // path segments
    if (pathHasSegment(u, 'series')) return 'series';
    // treat /movie/ and /vod/ as explicit movie/VOD paths
    if (pathHasSegment(u, 'movie') || pathHasSegment(u, 'vod')) return 'movie';
    if (pathHasSegment(u, 'live')) return 'live';
    return '';
  }

  function explicitTypeFromFields(item) {
    // explicit stored/declared type fields if present
    const candidates = [
      getField(item, ['stream_type', 'streamType']),
      getField(item, ['streamTypeName', 'stream_type_name']),
      getField(item, ['contentType', 'content_type']),
      getField(item, ['mediaType', 'media_type']),
      getField(item, ['category_type', 'categoryType']),
      getField(item, ['type'])
    ];
    for (const c of candidates) {
      const t = explicitTypeFromString(c);
      if (t) return t;
    }
    // sometimes numeric/string Xtream-ish hints embedded as typeName
    const tn = lower(getField(item, ['typeName', 'type_name']));
    if (tn === 'series') return 'series';
    if (tn === 'movie' || tn === 'vod') return 'movie';
    if (tn === 'live') return 'live';
    return '';
  }

  // --- text/category classification (priorities 2-4) ---
  const SERIES_TOKENS = [
    'series', 'serie', 'série', 'séries', 'shows', 'show', 'tvshow', 'sitcom', 'drama',
    'مسلسل', 'مسلسلات', 'موسم', 'حلقة', 'حلقات', 'دراما'
  ];
  const SERIES_PATTERNS = [
    /\bs\d{1,2}\s*[._ -]?\s*e\d{1,3}\b/i,
    /\bseason\s*\d{1,3}\b/i,
    /\bepisode\s*\d{1,4}\b/i,
    /\bep\.?\s*\d{1,4}\b/i,
    /\btv\s*shows?\b/i
  ];
  const MOVIE_TOKENS = [
    'movie', 'movies', 'film', 'films', 'cinema', 'cinéma', 'vod',
    'فيلم', 'أفلام', 'افلام'
  ];
  const LIVE_TOKENS = [
    'live', 'tv', 'channel', 'channels', 'iptv', 'broadcast',
    'قناة', 'قنوات', 'مباشر', 'بث',
    'direct', 'chaine', 'chaîne', 'chaines', 'chaînes', 'en direct'
  ];
  // tokens that, when present, suggest a text is about TV/live channels (used to avoid ambiguous "movie/film" false positives)
  const LIVE_CONTEXT_TOKENS = [
    'live', 'tv', 'channel', 'channels', 'iptv', 'news', 'sport', 'sports',
    'قناة', 'قنوات', 'مباشر', 'بث', 'اخبار', 'أخبار', 'رياضة', 'رياضية'
  ];

  function classifyText(text, opts) {
    const s = norm(text);
    if (!s) return '';
    const allowAmbiguousMovie = !(opts && opts.avoidAmbiguousMovie);
    const isSeries = hasAnyToken(s, SERIES_TOKENS) || matchesAny(s, SERIES_PATTERNS);
    const isLive = hasAnyToken(s, LIVE_TOKENS);
    const isMovie = hasAnyToken(s, MOVIE_TOKENS);

    // If clear series markers present, prefer series (episode/season markers are strong).
    if (isSeries && !isLive) return 'series';
    if (isSeries && isLive) {
      const strongSeries = matchesAny(s, SERIES_PATTERNS) ||
        hasAnyToken(s, ['مسلسل', 'مسلسلات', 'series', 'série', 'séries', 'show', 'shows', 'tvshow', 'دراما', 'drama', 'sitcom']);
      const explicitLive = hasAnyToken(s, ['live', 'channel', 'channels', 'iptv', 'broadcast', 'قناة', 'قنوات', 'مباشر', 'بث', 'direct', 'chaine', 'chaîne', 'chaines', 'chaînes', 'en direct']);
      // "TV Shows" style categories: series wins over bare "tv" token; explicit live/channel words win over ambiguous series words.
      if (strongSeries && !explicitLive) return 'series';
      if (strongSeries && explicitLive) {
        // e.g. could be rare; prefer explicit live markers
        return 'live';
      }
      if (explicitLive) return 'live';
      return 'series';
    }

    if (isMovie && !isLive) return 'movie';
    if (isMovie && isLive) {
      // ambiguous: "movie channels" / channel groups mentioning film - avoid false positive
      if (!allowAmbiguousMovie) return 'live';
      // if live-context tokens dominate or clearly channel-ish, prefer live
      if (hasAnyToken(s, LIVE_CONTEXT_TOKENS)) return 'live';
      return 'movie';
    }

    if (isLive) return 'live';
    return '';
  }

  function classifyGroup(item) {
    const g = getField(item, ['group-title', 'groupTitle', 'group', 'category_name', 'categoryName', 'category']);
    return classifyText(g, { avoidAmbiguousMovie: true });
  }
  function classifyCategory(item) {
    // category names/ids - try stringy values
    const parts = [];
    const push = (v) => { const s = norm(v); if (s && !/^\d+$/.test(s)) parts.push(s); };
    push(getField(item, ['category_name', 'categoryName', 'category']));
    push(getField(item, ['category_id_name', 'categoryIdName']));
    push(getField(item, ['parent_category_name', 'parentCategoryName']));
    const text = parts.join(' ');
    return classifyText(text, { avoidAmbiguousMovie: true });
  }
  function classifyNameMeta(item) {
    const parts = [
      getField(item, ['tvg-name', 'tvgName']),
      getField(item, ['name']),
      getField(item, ['title']),
      getField(item, ['stream_display_name', 'streamDisplayName'])
    ].filter(Boolean);
    const text = parts.join(' ');
    // For names, allow movie tokens but still be careful if clearly live channel context appears
    return classifyText(text, { avoidAmbiguousMovie: false });
  }

  // --- extension fallback (priority 6, last resort) ---
  function classifyByExtension(url) {
    const ext = getUrlExtension(url);
    if (!ext) return 'unknown';
    if (VOD_FILE_EXT.has(ext)) return 'movie'; // VOD file; cannot infer series from extension alone
    // STREAM_EXT (.m3u8/.ts/.m3u/.mpd) is ambiguous: must NOT classify as live solely by extension
    if (STREAM_EXT.has(ext)) return 'unknown';
    return 'unknown';
  }

  function normalizeKind(k) {
    const v = lower(k);
    if (v === 'live' || v === 'livetv') return 'live';
    if (v === 'series' || v === 'serie') return 'series';
    if (v === 'movie' || v === 'movies' || v === 'vod' || v === 'film') return 'movie';
    if (v === 'unknown') return 'unknown';
    return '';
  }

  function collectInput(input) {
    // input can be (item) or (group, url, name, extra)
    if (typeof input === 'string' || (input && typeof input === 'object' && !('url' in input) && !('name' in input) && !('group' in input) && !('tvgName' in input) && !('kind' in input))) {
      // unlikely, treat as empty
    }
    let item = {};
    if (input && typeof input === 'object') item = input;
    const args = collectInput._args;
    collectInput._args = null;
    if (args) {
      // called as (group, url, name, extra)
      item = Object.assign({}, args[3] || {}, {
        group: args[0],
        url: args[1],
        name: args[2]
      }, args[3] || {});
    }
    return item || {};
  }

  function classifyMedia(input, urlArg, nameArg, extraArg) {
    let item;
    if (typeof urlArg !== 'undefined' || typeof nameArg !== 'undefined' || (typeof input === 'string' && (typeof urlArg === 'string' || urlArg == null))) {
      // signature: (group, url, name, extra?)
      item = Object.assign({}, extraArg || {}, {
        group: input,
        url: urlArg,
        name: nameArg
      });
    } else {
      item = (input && typeof input === 'object') ? input : {};
    }

    const url = getField(item, ['url', 'stream_url', 'streamUrl', 'src']);

    // 1) Explicit Xtream stream type and URL paths (/live/, /movie/, /series/, stream_type)
    const byUrlExplicit = explicitTypeFromUrl(url);
    if (byUrlExplicit) return byUrlExplicit;

    // 2) Provider-supplied explicit type fields and previously stored kind are
    // authoritative. Title/group guesses must never override real metadata.
    const byStored = explicitTypeFromFields(item);
    if (byStored) return byStored;
    const storedKind = normalizeKind(getField(item, ['kind']));
    if (storedKind && storedKind !== 'unknown') return storedKind;

    // 3) Explicit IPTV group-title metadata
    const byGroup = classifyGroup(item);
    if (byGroup) return byGroup;

    // 4) Category names and category identifiers
    const byCat = classifyCategory(item);
    if (byCat) return byCat;

    // 5) tvg-name and item metadata (name/title hints)
    const byName = classifyNameMeta(item);
    if (byName) return byName;

    // 6) Stream extension only as a last-resort fallback (never Live solely because .m3u8/.ts)
    const byExt = classifyByExtension(url);
    if (byExt && byExt !== 'unknown') return byExt;

    return 'unknown';
  }

  // Back-compat helper similar to old classify(group,url,name) but using new priority rules.
  function classify(group, url, name, extra) {
    const k = classifyMedia({ group, url, name, ...(extra || {}) });
    // preserve old-style string result; unknown kept as 'unknown'
    return k || 'unknown';
  }

  function isVodFileUrl(url) {
    const ext = getUrlExtension(url);
    return VOD_FILE_EXT.has(ext);
  }
  function isStreamUrl(url) {
    const ext = getUrlExtension(url);
    return STREAM_EXT.has(ext);
  }

  return {
    classifyMedia,
    classify,
    normalizeKind,
    explicitTypeFromUrl,
    explicitTypeFromFields,
    classifyByExtension,
    isVodFileUrl,
    isStreamUrl
  };
});
