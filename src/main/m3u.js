'use strict';

const crypto = require('crypto');
const classification = require('../shared/classification');
const { parseCatchupAttrs } = require('./pro/catchup');

const SKIP_HINT = /(adult|xxx|18\+|لكبار|اباحي|إباحي)/i;

// Back-compat hint exports (kept for any external consumers)
const MOVIE_HINT = /(movie|movies|film|films|cinema|vod|أفلام|فيلم|افلام)/i;
const SERIES_HINT = /(serie|series|show|shows|tv show|drama|مسلسل|مسلسلات|دراما)/i;
const LIVE_HINT = /(live|channel|channels|tv|iptv|قنوات|قناة|بث|مباشر)/i;

function keyFor(url) {
  return crypto.createHash('sha1').update(url).digest('hex');
}

function xtreamAccountUrl(url, username, password) {
  let base = String(url || '').trim();
  if (!base) return base;
  if (!/^[a-z]+:\/\//i.test(base)) base = 'http://' + base;
  if (!username && !password) return base;
  try {
    const u = new URL(base);
    u.username = '';
    u.password = '';
    if (!/\/player_api\.php$/i.test(u.pathname)) {
      u.pathname = u.pathname.replace(/\/+$/, '') + '/player_api.php';
    }
    const q = new URLSearchParams({
      username: username || '',
      password: password || ''
    });
    u.search = q.toString();
    return u.toString();
  } catch (_) {
    return base;
  }
}
/* Stable key for a playlist entry: same URL can legitimately appear in several
   groups or with different names, so the URL alone is not unique. */
function itemKey(url, group, name) {
  return crypto.createHash('sha1')
    .update(String(url) + '\u0000' + String(group || '') + '\u0000' + String(name || ''))
    .digest('hex');
}

function looksLikePlaylist(text) {
  return /^\uFEFF?\s*#EXTM3U/i.test(text) || /#EXTINF:/i.test(text.slice(0, 4096));
}

function isHlsPlaylist(text) {
  return /#EXT-X-/i.test(text.slice(0, 20000));
}

const ATTRIBUTE_RE = /([a-zA-Z0-9_-]+)=(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;

function parseAttributes(line) {
  const out = {};
  // Reuse the compiled expression: playlists may contain tens of thousands of
  // EXTINF lines. Reset lastIndex because the expression is global.
  ATTRIBUTE_RE.lastIndex = 0;
  let m;
  while ((m = ATTRIBUTE_RE.exec(line))) out[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);
  return out;
}

function classify(group, url, name, extra) {
  return classification.classifyMedia(Object.assign({}, extra || {}, { group, url, name }));
}

function parseM3U(text, opts = {}) {
  const base = opts.baseUri || '';
  const items = [];
  const src = String(text);
  const len = src.length;
  let i = 0;
  let pending = null;
  let pendingHeaders = {};
  let pendingGroup = '';

  const push = (rawUrl) => {
    let url = rawUrl.trim();
    if (!url || url.startsWith('#')) return;
    try {
      url = new URL(url, base || undefined).toString();
    } catch (_) { /* keep raw */ }
    // Never let a playlist inject script/data URLs, and never let a *remote* playlist point <video> at local files.
    if (/^\s*(?:javascript|vbscript|data|blob):/i.test(url)) return;
    if (/^\s*file:/i.test(url) && /^https?:/i.test(String(base || ''))) return;
    const name = (pending && pending.name) || url;
    const group = (pending && pending.group) || pendingGroup || 'Uncategorized';
    const tvgId = (pending && pending.tvgId) || '';
    const tvgName = (pending && pending.tvgName) || '';
    const kind = classify(group, url, name, { tvgId, tvgName });
    items.push({
      key: itemKey(url, group, name),
      name,
      group,
      logo: (pending && pending.logo) || '',
      tvgId,
      tvgName,
      url,
      kind,
      catchup: (pending && pending.catchup) || undefined,
      headers: { ...pendingHeaders },
      hidden: SKIP_HINT.test(group) || SKIP_HINT.test(name)
    });
    pending = null;
    pendingHeaders = {};
  };

  while (i <= len) {
    let j = src.indexOf('\n', i);
    if (j === -1) j = len;
    let end = j;
    if (end > i && src.charCodeAt(end - 1) === 13) end--; // \r
    const raw = src.slice(i, end);
    const line = raw.trim();
    i = j + 1;
    if (!line) continue;

    if (/^#EXTINF:/i.test(line)) {
      const afterColon = line.slice(8);
      const commaIdx = afterColon.indexOf(',');
      const attrs = parseAttributes(commaIdx >= 0 ? afterColon.slice(0, commaIdx) : afterColon);
      const title = commaIdx >= 0 ? afterColon.slice(commaIdx + 1).trim() : '';
      pending = {
        name: title || attrs['tvg-name'] || attrs['tvg-id'] || 'Channel',
        group: attrs['group-title'] || '',
        logo: attrs['tvg-logo'] || '',
        tvgId: attrs['tvg-id'] || '',
        tvgName: attrs['tvg-name'] || '',
        catchup: parseCatchupAttrs(attrs)
      };
      if (pending.group) pendingGroup = '';
      continue;
    }

    if (/^#EXTGRP:/i.test(line)) {
      pendingGroup = line.slice(8).trim();
      continue;
    }

    if (/^#EXTVLCOPT:/i.test(line)) {
      const kv = line.slice(11).split('=');
      const k = (kv.shift() || '').toLowerCase();
      const v = kv.join('=');
      if (k === 'http-user-agent') pendingHeaders['User-Agent'] = v;
      if (k === 'http-referrer' || k === 'http-referer') pendingHeaders['Referer'] = v;
      if (k === 'http-origin') pendingHeaders['Origin'] = v;
      continue;
    }

    if (line.charCodeAt(0) === 35) continue; // '#'
    push(line);
  }

  return items;
}

function xtreamUrl(url, username, password) {
  let base = String(url || '').trim();
  if (!base) return base;
  if (!/^[a-z]+:\/\//i.test(base)) base = 'http://' + base;
  if (!username && !password) return base;
  try {
    const u = new URL(base);
    u.username = '';
    u.password = '';
    if (!/\/get\.php$/i.test(u.pathname)) {
      u.pathname = u.pathname.replace(/\/+$/, '') + '/get.php';
    }
    const q = new URLSearchParams({
      username: username || '',
      password: password || '',
      type: 'm3u_plus',
      output: 'ts'
    });
    u.search = q.toString();
    return u.toString();
  } catch (_) {
    return base;
  }
}

module.exports = {
  parseM3U,
  xtreamUrl,
  xtreamAccountUrl,
  looksLikePlaylist,
  isHlsPlaylist,
  classify,
  classifyMedia: classification.classifyMedia,
  normalizeKind: classification.normalizeKind,
  keyFor,
  itemKey,
  MOVIE_HINT,
  SERIES_HINT,
  LIVE_HINT
};
